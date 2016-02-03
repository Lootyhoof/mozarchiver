/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Archive Format.
 *
 * The Initial Developer of the Original Code is
 * Paolo Amadini <http://www.amadzone.org/>.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Manages the saving process of a single web page.
 *
 * This class derives from Job. See the Job documentation for details.
 *
 * @param aDocument
 *        The document to be saved.
 * @param aTargetDir
 *        An nsILocalFile instance representing the temporary directory where
 *        the document should be saved.
 */
function SaveContentJob(aEventListener, aDocument, aTargetDir) {
  Job.call(this, aEventListener);

  this._document = aDocument;
  this._targetDir = aTargetDir;
}

SaveContentJob.prototype = {
  __proto__: Job.prototype,

  // Job
  _executeStart: function() {
    // Create a new MAFF or MHTML archive.
    if (this.targetType == "TypeMHTML") {
      this._archive = new MhtmlArchive(this.targetFile);
    } else {
      this._archive = new MaffArchive(this.targetFile);
    }
    // Prepare a new page object for saving the current page in the archive.
    // This operation must be executed immediately since the metadata for the
    // page may not be available later, for example if the browser window where
    // the document is loaded is closed while the document is being saved.
    var page = this._archive.addPage();
    page.tempDir = this._targetDir;
    page.setMetadataFromDocumentAndBrowser(this._document, this.targetBrowser);
    // Create the target folder.
    this._targetDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
    // Find the browser window associated with the document being saved.
    var browserWindow = this._document.defaultView.
     QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation).
     QueryInterface(Ci.nsIDocShellTreeItem).rootTreeItem.
     QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
    // Save the document in the target folder.
    browserWindow.wrappedJSObject.saveDocument(this._document, {
      saveDir: this._targetDir,
      saveWithMedia: (this.targetType == "TypeMAFF"),
      saveWithContentLocation: (this.targetType == "TypeMHTML"),
      mafEventListener: this
    });
    // Wait for the save completed callback.
    this._asyncWorkStarted();
  },

  // Job
  _executeCancel: function(aReason) {
    // No special action is required since the worker objects do not support
    // cancellation.
  },

  // Job
  _executeDispose: function() {
    // Delete the target folder if it was created successfully.
    if(this._targetDir.exists()) {
      this._targetDir.remove(true);
    }
  },

  // MafEventListener
  onSaveNameDetermined: function(aSaveName) {
    // Remember the name that the save component has chosen for the index file.
    this._archive.pages[0].indexLeafName = aSaveName;
  },

  // MafEventListener
  onDownloadProgressChange: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
    // Update job progress and propagate the event to our listener.
    this._notifyJobProgressChange(aWebProgress, aRequest, aCurSelfProgress,
     aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress);
  },

  // MafEventListener
  onDownloadStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {
    // Propagate the event to our listener.
    this._eventListener.onStatusChange(aWebProgress, aRequest, aStatus,
     aMessage);
  },

  // MafEventListener
  onDownloadFailed: function(aStatus) {
    this._handleAsyncCallback(function() {
      // Cancel the operation because the download failed.
      Cu.reportError(new Components.Exception("Download failed.", aStatus));
      this.cancel(aStatus);
    }, this);
  },

  // MafEventListener
  onDownloadComplete: function() {
    this._handleAsyncCallback(function() {
      // Add to an existing MAFF archive if required.
      if (this.addToArchive) {
        this._archive.load();
      }
      // If the page can be saved asynchronously
      var page = this._archive.pages[0];
      if (page.asyncSave) {
        // Save and wait for the callback from the worker object.
        this._expectAsyncCallback(function() {
          page.asyncSave(this);
        }, this);
      } else {
        // Save the page synchronously.
        page.save();
        this._invalidateCachedArchive();
        this._notifyCompletion();
      }
    }, this);
  },

  // ArchivePageCallback
  onArchivingComplete: function(code) {
    this._handleAsyncCallback(function() {
      if (code != 0) {
        // Cancel the operation if archiving failed.
        this.cancel(Cr.NS_ERROR_FAILURE);
      } else {
        // Archiving completed.
        this._invalidateCachedArchive();
        this._notifyCompletion();
      }
    }, this);
  },

  /**
   * At the end of the save operation of each page, this function is called to
   * ensure that accessing the archive's location won't open a cached version.
   */
  _invalidateCachedArchive: function() {
    var archive = ArchiveCache.archiveFromUri(this._archive.uri);
    if (archive) {
      ArchiveCache.unregisterArchive(archive);
    }
  },

  _archive: null,
  _document: null,
  _targetDir: null,
}
