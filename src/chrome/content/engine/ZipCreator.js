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
 * Allows the creation of ZIP archives using a ZIP writer object.
 *
 * @param aFile
 *        The nsIFile of the archive to be created or modified.
 * @param aCreateNew
 *        True if an existing file should be overwritten, or false if new items
 *        should be appended to the file.
 */
function ZipCreator(aFile, aCreateNew) {
  this._file = aFile;
  this._createNew = aCreateNew;
}

ZipCreator.prototype = {
  /**
   * Adds to the archive the contents of a directory, including its
   * subdirectories.
   *
   * The archive is opened automatically, and the dispose method should be
   * called to close it afterwards.
   *
   * @param aDirectory
   *        nsIFile representing the directory to be added. The leaf name of the
   *        directory itself is not used.
   * @param aZipEntry
   *        Name of the ZIP entry to be created for the directory.
   */
  addDirectory: function(aDirectory, aZipEntry) {
    this._open();
    new ZipDirectory(this, aDirectory, aZipEntry, null).save();
  },

  /**
   * Ensures that the archive file is closed.
   */
  dispose: function() {
    if (this._zipWriter) {
      this._zipWriter.close();
      this._zipWriter = null;
    }
  },

  /** File open flags */
  PR_RDONLY      : 0x01,
  PR_WRONLY      : 0x02,
  PR_RDWR        : 0x04,
  PR_CREATE_FILE : 0x08,
  PR_APPEND      : 0x10,
  PR_TRUNCATE    : 0x20,
  PR_SYNC        : 0x40,
  PR_EXCL        : 0x80,

  /**
   * Opens the archive file for writing.
   */
  _open: function() {
    // Create the ZIP writer object.
    var zipWriter = Cc["@mozilla.org/zipwriter;1"].
     createInstance(Ci.nsIZipWriter);

    // Add to an existing archive, or create a new archive.
    var openFlags = this.PR_RDWR | this.PR_CREATE_FILE;
    if (this._createNew) {
      openFlags |= this.PR_TRUNCATE;
    }
    zipWriter.open(this._file, openFlags);

    // Indicate that the archive is opened.
    this._zipWriter = zipWriter;
  },

  _file: null,
  _createNew: false,
  _zipWriter: null,
}
