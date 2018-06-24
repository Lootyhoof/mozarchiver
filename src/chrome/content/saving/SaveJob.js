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
 * Manages the saving process of one or more archives, providing a single
 * progress indication. The information to be saved and the destinations must be
 * added using the appropriate methods before starting the operation.
 *
 * This class derives from JobRunner. See the JobRunner documentation for
 * details.
 */
function SaveJob(eventListener) {
  // Always save different archives in parallel.
  JobRunner.call(this, eventListener, true);
}

SaveJob.prototype = {
  __proto__: JobRunner.prototype,

  /**
   * If set to true, resources that were not originally loaded will be
   * downloaded and included when saving.
   */
  saveWithNotLoadedResources: false,

  /*
   * Adds new save jobs to the current operation, starting from a list of web
   * browser objects. Depending on the target archive type, a single archive is
   * created for all the documents, or one archive is created for each document.
   */
  addJobsFromBrowsers: function(aBrowsers, aTargetFile, aTargetType) {
    // If we are saving to a MAFF archive
    if (aTargetType == "TypeMAFF") {

      // Create a pool of first-level folder names, in the format used by all
      // the recent versions of the Mozilla Archive Format extension.
      var baseName = new Date().valueOf() + "_";
      var randomIndex = Math.floor(Math.random() * (1000 - aBrowsers.length));
      var pageFolderNames = aBrowsers.map(function() {
        return baseName + (randomIndex++);
      });

      // Sort the page folder names alphabetically. This allows the pages to be
      // displayed in the same order in which they are organized when the save
      // operation is invoked.
      pageFolderNames.sort();

      // Create a single archive with all the pages.
      var maffArchiveJob = new SaveArchiveJob(this, aTargetFile, aTargetType);
      aBrowsers.forEach(function(curBrowser, curIndex) {
        maffArchiveJob.addContentFromDocumentAndBrowser(
         curBrowser.contentDocument, curBrowser, pageFolderNames[curIndex],
         this.saveWithNotLoadedResources);
      });
      this._addJob(maffArchiveJob);

    } else {

      // Create an MHTML archive for each page to be saved.
      var uniqueTargetFile = aTargetFile.clone();
      aBrowsers.forEach(function(curBrowser) {
        var curTargetFile = uniqueTargetFile.clone();

        // Create the save job.
        var mhtmlArchiveJob = new SaveArchiveJob(this, curTargetFile,
         aTargetType);
        mhtmlArchiveJob.addContentFromDocumentAndBrowser(
         curBrowser.contentDocument, curBrowser, null,
         this.saveWithNotLoadedResources);
        this._addJob(mhtmlArchiveJob);

        // Get the next target file name.
        this._changeCountInFilename(uniqueTargetFile);
      }, this);

    }
  },

  /*
   * Adds a new save job to the current operation, for the given document only.
   * This function should only be used to save subdocuments.
   */
  addJobFromDocument: function(aDocument, aTargetFile, aTargetType) {
    // Create a single archive with the selected page.
    var maffArchiveJob = new SaveArchiveJob(this, aTargetFile, aTargetType);
    maffArchiveJob.addContentFromDocumentAndBrowser(aDocument, null, null,
     this.saveWithNotLoadedResources);
    this._addJob(maffArchiveJob);
  },

  /**
   * Always modifies the leaf name of the given nsIFile object, preserving the
   * extension and ensuring that a file with the new name does not exist.
   */
  _changeCountInFilename: function(aLocalFile) {
    do {
      // For more information on this routine, see the "uniqueFile" function in
      // <http://mxr.mozilla.org/firefox2/source/xpfe/communicator/resources/content/contentAreaUtils.js>
      // (retrieved 2009-11-24).
      parts = /(-\d+)?(\.[^.]+)?$/.test(aLocalFile.leafName);
      aLocalFile.leafName = RegExp.leftContext + (RegExp.$1 - 1) + RegExp.$2;
    } while (aLocalFile.exists());
  },
}
