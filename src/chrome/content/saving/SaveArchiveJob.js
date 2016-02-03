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
 * Manages the saving process of one or more web pages in an archive, providing
 * a single progress indication. The information to be saved must be added using
 * the appropriate methods before starting the operation.
 *
 * This class derives from JobRunner. See the JobRunner documentation for
 * details.
 *
 * @param aTargetFile
 *        The nsIFile of the archive to be created.
 * @param aTargetType
 *        The type of archive to be created (MAFF or MHTML).
 */
function SaveArchiveJob(aEventListener, aTargetFile, aTargetType) {
  // Never save pages to the same archive in parallel.
  JobRunner.call(this, aEventListener, false);
  this._targetFile = aTargetFile;
  this._targetType = aTargetType;
}

SaveArchiveJob.prototype = {
  __proto__: JobRunner.prototype,

  addContentFromDocumentAndBrowser: function(aDocument, aBrowser, aFolderName) {
    // Determine the leaf name of the directory where the page will be saved.
    // This name will also be used for the first-level folder in the archive.
    var folderLeafName = aFolderName ||
     new Date().valueOf() + "_" + Math.floor(Math.random() * 1000);

    // Determine the path of the directory where the page will be saved.
    var dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    dir.initWithPath(Prefs.tempFolder);
    dir.append(folderLeafName);

    // Create a new object for saving page contents.
    var job = new SaveContentJob(this, aDocument, dir);
    job.targetBrowser = aBrowser;
    job.targetType = this._targetType;
    job.targetFile = this._targetFile;
    // Create a new archive if this is the first job in the list.
    job.addToArchive = !!this._jobs.length;

    // Add the job to the list of the ones to be started.
    this._addJob(job);
  },

  _targetFile: null,
  _targetType: "",
}
