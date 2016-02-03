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
 * This object is used by ZipCreator to add directory contents to an archive.
 */
function ZipDirectory(aZipCreator, aDirectory, aZipEntry, aParent) {
  this._zipCreator = aZipCreator;
  this._directory = aDirectory;
  this._zipEntry = aZipEntry;
  this._parent = aParent;
}

ZipDirectory.prototype = {
  /**
   * Stores the directory into the archive. If the directory and its
   * subdirectories don't contain any file, no ZIP entry is created.
   */
  save: function() {
    // Enumerate all the files and subdirectories in the specified directory.
    var dirEntries = this._directory.directoryEntries;
    while (dirEntries.hasMoreElements()) {
      // Get the file or directory object and the associated ZIP entry name.
      var dirEntry = dirEntries.getNext().QueryInterface(Ci.nsIFile);
      var zipEntry = this._zipEntry + "/" + dirEntry.leafName;
      // Add subdirectories recursively.
      if (dirEntry.isDirectory()) {
        new ZipDirectory(this._zipCreator, dirEntry, zipEntry, this).save();
      } else {
        // Only before a file is actually added to the archive, ensure that the
        // parent ZIP directory entry is present. This prevents the creation of
        // ZIP directory entries for empty subdirectories.
        this._addDirEntry();
        // Add a new file to the archive.
        this._zipCreator._zipWriter.addEntryFile(zipEntry,
         this._compressionLevelForFile(dirEntry), dirEntry, false);
      }
    }
  },

  /** Constants */
  PR_USEC_PER_MSEC: 1000,

  /**
   * Ensures that the ZIP directory entry for this item and its parent
   * directories has been created.
   */
  _addDirEntry: function() {
    if (!this._zipEntryPresent) {
      if (this._parent) {
        this._parent._addDirEntry();
      }
      // Add a new directory entry to the archive.
      this._zipCreator._zipWriter.addEntryDirectory(this._zipEntry,
       this._directory.lastModifiedTime * this.PR_USEC_PER_MSEC, false);
      // Indicate that the entry has been created.
      this._zipEntryPresent = true;
    }
  },

  /**
   * Returns the compression level to use when adding a file to the archive.
   * The result is based on the file extension and the current preferences.
   */
  _compressionLevelForFile: function(aFile) {
    // If all the files should be stored with maximum compression
    if (Prefs.saveMaffCompression == Prefs.MAFFCOMPRESSION_BEST) {
      return Ci.nsIZipWriter.COMPRESSION_BEST;
    }
    // If all the files should be stored uncompressed
    if (Prefs.saveMaffCompression == Prefs.MAFFCOMPRESSION_NONE) {
      return Ci.nsIZipWriter.COMPRESSION_NONE;
    }
    // Do not re-compress media files for which there's not a significant gain
    // since they're already compressed. The file type is recognized using the
    // extension, and currently only ".ogg", ".oga" and ".ogv" files are not
    // re-compressed.
    if (/\.og[gav]$/i.test(aFile.leafName)) {
      return Ci.nsIZipWriter.COMPRESSION_NONE;
    }
    // Use the best compression for all the other files.
    return Ci.nsIZipWriter.COMPRESSION_BEST;
  },

  /**
   * Set to true if the directory entry for this object has been created.
   */
  _zipEntryPresent: false,

  _zipCreator: null,
  _directory: null,
  _zipEntry: "",
  _parent: null,
}
