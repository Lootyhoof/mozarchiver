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
 * Locates the saved web pages that are candidates for batch conversion between
 * different file formats.
 */
function CandidateFinder() {
  // Initialize the contained objects.
  this.location = new CandidateLocation();
  // Initialize the list of valid suffixes for the support folders.
  this.sourceDataFolderSuffixes = Prefs.convertDataFolderSuffixesArray;
  // Add the files folder suffix for the current locale, if not the default.
  var localizedFolderSuffix = Cc["@mozilla.org/intl/stringbundle;1"].
   getService(Ci.nsIStringBundleService).
   createBundle("chrome://global/locale/contentAreaCommands.properties").
   formatStringFromName("filesFolder", [""], 1);
  if (localizedFolderSuffix && localizedFolderSuffix != "_files") {
    this.sourceDataFolderSuffixes.push(localizedFolderSuffix);
  }
}

CandidateFinder.prototype = {
  /**
   * String representing the source format of the files to be converted.
   *
   * Possible values:
   *   "complete"   - Complete web page, only if a support folder is present.
   *   "plain"      - Any web page, with or without a support folder.
   *   "mhtml"      - MHTML archive.
   *   "maff"       - MAFF archive.
   */
  sourceFormat: "complete",

  /**
   * String representing the destination format of the converted files.
   *
   * Possible values:
   *   "maff"       - MAFF archive.
   *   "mhtml"      - MHTML archive.
   *   "complete"   - Plain web page. A support folder is created if required.
   */
  destFormat: "maff",

  /**
   * CandidateLocation object representing the root directories involved in the
   * conversion operation.
   */
  location: null,

  /**
   * True if the subfolders of the source folder must be sought too.
   */
  sourceIncludeSubfolders: true,

  /**
   * Array containing the suffixes used for recognizing the support folders in
   * the source tree, for example "_files".
   */
  sourceDataFolderSuffixes: [],

  /**
   * Returns true if the values in the "sourceFormat" and "destFormat"
   * properties are consistent.
   */
  validateFormats: function() {
    // The "plain" and "complete" values indicate the same file format.
    var effectiveSourceFormat =
     (this.sourceFormat == "plain" ? "complete" : this.sourceFormat);
    return (effectiveSourceFormat != this.destFormat);
  },

  /**
   * This iterator yields the Candidate objects corresponding to the convertible
   * files under the root search location. Sometimes a null value will be
   * returned instead of a candidate to allow the caller to keep the user
   * interface responsive while the search is in progress.
   */
  __iterator__: function() {
    // Delegate the generation to the parameterized worker.
    for (var item in this._candidatesGenerator(this.location)) {
      yield item;
    }
  },

  /**
   * This generator function yields the Candidate objects corresponding to the
   * convertible files under the specified location. Sometimes a null value will
   * be returned instead of a candidate to allow the caller to keep the user
   * interface responsive while the search is in progress.
   */
  _candidatesGenerator: function(aLocation) {
    // Enumerate all the files and subdirectories in the specified directory,
    // and generate three separate lists: one for folder names, one for file
    // names, and a string containing the concatenation of all the file names,
    // for faster access when searching for a particular file name in folders
    // containing many files.
    var dirEntries = aLocation.source.directoryEntries;
    var subdirs = {};
    var files = {};
    var filesList = "::";
    while (dirEntries.hasMoreElements()) {
      var dirEntry = dirEntries.getNext().QueryInterface(Ci.nsIFile);
      try {
        // Add the entry to the appropriate lists.
        if (dirEntry.isDirectory()) {
          subdirs[dirEntry.leafName] = true;
        } else {
          files[dirEntry.leafName] = true;
          filesList += dirEntry.leafName + "::";
        }
      } catch (e if (e instanceof Ci.nsIException && e.result ==
       Cr.NS_ERROR_FILE_NOT_FOUND)) {
        // In rare cases, invalid file names may generate this exception when
        // checking isDirectory, even if they were returned by the iterator.
      }
      // Avoid blocking the user interface while scanning crowded folders.
      yield null;
    }

    // Examine every available subfolder.
    for (var [subdirName] in Iterator(subdirs)) {
      // Ensure that the enumeration result is a JavaScript string.
      subdirName = "" + subdirName;
      // If the subfolder is a support folder for an existing web page
      var name = this._isSupportFolderName(subdirName, filesList);
      if (name) {
        // If the search should include web pages among the source files
        if (this.sourceFormat == "complete" || this.sourceFormat == "plain") {
          // Check that the associated source file has not been already used
          // together with another support folder.
          if (files[name]) {
            // Generate a new candidate for conversion.
            yield this._newCandidate(aLocation, name, subdirName);
            // Ensure that the file will not be used again as a candidate later.
            delete files[name];
          }
        }
      } else if (this.sourceIncludeSubfolders) {
        // If required, examine the contents of this subfolder recursively. The
        // contents of support folders for data files are never examined, even
        // if the folder is not returned as a candidate for conversion.
        var newLocation = aLocation.getSubLocation(subdirName);
        for (var item in this._candidatesGenerator(newLocation)) {
          yield item;
        }
      }
    }

    // Examine every remaining file.
    for (var [fileName] in Iterator(files)) {
      // Ensure that the enumeration result is a JavaScript string.
      fileName = "" + fileName;
      // If the file name matches the criteria
      if (this._isSourceFileName(fileName)) {
        // Generate a new candidate for conversion.
        yield this._newCandidate(aLocation, fileName);
      }
    }
  },

  /**
   * Creates a new candidate with the given properties.
   */
  _newCandidate: function(aParentLocation, aLeafName, aDataFolderLeafName) {
    // Create a Candidate object for the requested file formats.
    var candidate = new Candidate();
    candidate.sourceFormat = this.sourceFormat;
    candidate.destFormat = this.destFormat;
    // Set the actual file names based on the file formats.
    candidate.setLocation(aParentLocation, aLeafName, aDataFolderLeafName);
    // Check if the destination or bin files already exist.
    candidate.checkObstructed();
    // Return the newly generated candidate.
    return candidate;
  },

  /**
   * Checks the extension in the given file name and returns true if it matches
   * the selected source format.
   */
  _isSourceFileName: function(aLeafName) {
    // Checks the extension case-insensitively.
    switch (this.sourceFormat) {
      case "plain":
        return /\.(x?html|xht|htm|xml|svgz?)$/i.test(aLeafName);
      case "mhtml":
        return /\.mht(ml)?$/i.test(aLeafName);
      case "maff":
        return /\.maff$/i.test(aLeafName);
      default:
        return false;
    }
  },

  /**
   * Returns true if the given directory name contains the data files of an
   * existing complete web page. The aFilesList parameter is a string containing
   * the concatenation of all the files.
   */
  _isSupportFolderName: function(aLeafName, aFilesList) {
    // Try with all the possible suffixes in order.
    for (var [, suffix] in Iterator(this.sourceDataFolderSuffixes)) {
      // Checks the suffix case-sensitively.
      if (aLeafName.slice(-suffix.length) != suffix) {
        continue;
      }
      // Extract the base folder name without the suffix.
      var basePart = aLeafName.slice(0, -suffix.length);
      if (!basePart) {
        continue;
      }
      // Look into the provided list of file names to find the associated file.
      var endPosition = 0;
      var foundFileName = false;
      while (true) {
        // Search case-sensitively for a file name that begins with the base
        // name obtained from the support folder name.
        var position = aFilesList.indexOf("::" + basePart, endPosition);
        if (position < 0) {
          break;
        }
        // A file name was found, extract it from the list.
        var startPosition = position + "::".length;
        endPosition = aFilesList.indexOf("::", startPosition);
        var fileName = aFilesList.slice(startPosition, endPosition);
        var lastPart = fileName.slice(basePart.length);
        // Ensure that the base name is the entire name or is followed by a dot.
        if (lastPart && lastPart[0] != ".") {
          continue;
        }
        // A file name that can be associated with the folder was found.
        foundFileName = fileName;
        // Give priority to names that match one of the known extensions.
        if (/\.(x?html|xht|htm|xml|svgz?)$/i.test(lastPart)) {
          return foundFileName;
        }
      }
      // Either a comaptible file name was not found, or a file name that does
      // not match one of the known extensions was found.
      return foundFileName;
    }
    // The given name is not one of a support folder.
    return false;
  },
}
