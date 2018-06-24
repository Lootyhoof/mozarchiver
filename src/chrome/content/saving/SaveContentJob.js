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
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIWebProgressListener,
    Ci.nsIWebProgressListener2,
  ]),

  /**
   * If set to true, resources that were not originally loaded will be
   * downloaded and included when saving.
   */
  saveWithNotLoadedResources: false,

  // Job
  _executeStart: function() {
    let document = this._document;
    let contentType = document.contentType;

    // Find the leaf name of the file to be saved. If the content we are saving
    // has a known document type, use the well-known extension for that type,
    // and save the complete web page if necessary.
    let saveCompletePage = true;
    let indexLeafName = "index";
    switch (contentType) {
      case "text/html":
        indexLeafName += ".html";
        break;
      case "application/xhtml+xml":
        indexLeafName += ".xhtml";
        break;
      case "image/svg+xml":
        indexLeafName += ".svg";
        break;
      case "text/xml":
      case "application/xml":
        indexLeafName += ".xml";
        break;
      case "text/plain":
      case "application/octet-stream":
        saveCompletePage = false;
        break;
      default:
        saveCompletePage = false;
        let primaryExtension = Cc["@mozilla.org/mime;1"]
         .getService(Ci.nsIMIMEService).getPrimaryExtension(contentType, "");
        if (primaryExtension) {
          indexLeafName += "." + primaryExtension;
        }
    }

    let targetFile = this._targetDir.clone();
    targetFile.append(indexLeafName);

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
    let page = this._archive.addPage();
    page.tempDir = this._targetDir;
    page.indexLeafName = indexLeafName;
    page.setMetadataFromDocumentAndBrowser(document, this.targetBrowser);

    let persist;
    if (contentType == "text/html" || contentType == "application/xhtml+xml") {
      // The ExactPersist component can also save XML and SVG, but not as
      // accurately as the browser's standard save system.
      persist = new ExactPersist();
      persist.saveWithMedia = this.targetType == "TypeMAFF";
      persist.saveWithContentLocation = this.targetType == "TypeMHTML";
      persist.saveWithNotLoadedResources = this.saveWithNotLoadedResources;
      // Use the data from the persist object for proper archiving later.
      this._persistObject = persist;
    } else {
      persist = Cc["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
       .createInstance(Ci.nsIWebBrowserPersist);
    }
    persist.progressListener = this;
    persist.persistFlags =
     Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
     Ci.nsIWebBrowserPersist.PERSIST_FLAGS_FORCE_ALLOW_COOKIES |
     Ci.nsIWebBrowserPersist.PERSIST_FLAGS_FROM_CACHE |
     Ci.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;

    this._targetDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
    try {
      if (saveCompletePage) {
        let filesFolder = this._targetDir.clone();
        filesFolder.append("index_files");
        persist.saveDocument(
          document,
          NetUtil.newURI(targetFile),
          filesFolder,
          null,
          Ci.nsIWebBrowserPersist.ENCODE_FLAGS_ENCODE_BASIC_ENTITIES,
          80
        );
      } else {
        let postData = null;
        try {
          postData = document.defaultView
           .QueryInterface(Ci.nsIInterfaceRequestor)
           .getInterface(Ci.nsIWebNavigation)
           .QueryInterface(Ci.nsIWebPageDescriptor)
           .currentDescriptor
           .QueryInterface(Ci.nsISHEntry)
           .postData;
        } catch (ex) { }
        persist.savePrivacyAwareURI(
          document.documentURIObject,
          null,
          document.referrer ? NetUtil.newURI(document.referrer) : null,
          Ci.nsIHttpChannel.REFERRER_POLICY_NO_REFERRER_WHEN_DOWNGRADE,
          postData,
          null,
          NetUtil.newURI(targetFile),
          PrivateBrowsingUtils.isContentWindowPrivate(document.defaultView)
        );
      }
    } catch (ex) {
      this._removeTargetDir();
      throw ex;
    }
  },

  // Job
  _executeCancel: function(aReason) {
    // No special action is required since the worker objects do not support
    // cancellation.
  },

  // nsIWebProgressListener
  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    this._handleAsyncCallback(function() {
      if (this._persistCompleted) {
        return;
      }

      if (aStatus != Cr.NS_OK) {
        this._persistCompleted = true;

        // Cancel the operation because the download failed.
        Cu.reportError(new Components.Exception("Download failed.", aStatus));
        this._removeTargetDir();
        this.cancel(aStatus);

      } else if ((aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) &&
       (aStateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK)) {
        this._persistCompleted = true;

        // The save operation completed and we can add the files to the archive.
        try {
          // Add to an existing MAFF archive if required.
          if (this.addToArchive) {
            this._archive.load();
          }
          this._archive.pages[0].save(this._persistObject);
        } finally {
          this._removeTargetDir();
        }
        this._invalidateCachedArchive();
        this._notifyCompletion();
      }
    }, this);
  },

  // nsIWebProgressListener
  onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
    this.onProgressChange64(aWebProgress, aRequest, aCurSelfProgress,
     aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress);
  },

  // nsIWebProgressListener
  onLocationChange: function() {},

  // nsIWebProgressListener
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {
    this._eventListener.onStatusChange(aWebProgress, aRequest, aStatus,
     aMessage);
  },

  // nsIWebProgressListener
  onSecurityChange: function() {},

  // nsIWebProgressListener2
  onProgressChange64: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
    this._notifyJobProgressChange(aWebProgress, aRequest, aCurSelfProgress,
     aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress);
  },

  // nsIWebProgressListener2
  onRefreshAttempted: function() {},

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

  /**
   * Remove the temporary folder after completion or failure.
   */
  _removeTargetDir: function() {
    try {
      this._targetDir.remove(true);
    } catch (ex) {
      Cu.reportError(ex);
    }
  },

  _archive: null,
  _document: null,
  _targetDir: null,
  _persistObject: null,
  _persistCompleted: false,
}
