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
 * Represents a group of web resources that are part of the same web page.
 */
function PersistBundle() {
  // Initialize member variables explicitly.
  this.resources = [];
  this._resourceListsByReferenceUri = {};
  this._resourcesByOriginalUri = {};
}

PersistBundle.prototype = {
  /**
   * Array of PersistResource objects contained in this bundle. The element with
   * index 0 is considered the root resource, while other elements are
   * considered aggregate resources.
   */
  resources: [],

  /**
   * Indexes the properties of the given resource, that must have been already
   * added to this bundle, so that the retrieval functions can be used with it.
   */
  addResourceToIndex: function(aResource) {
    if (aResource.referenceUri) {
      var referenceUriSpec = aResource.referenceUri.spec;
      var resourceList = this._resourceListsByReferenceUri[referenceUriSpec];
      if (!resourceList) {
        this._resourceListsByReferenceUri[referenceUriSpec] = [aResource];
      } else {
        resourceList.push(aResource);
      }
    }
    if (aResource.originalUri) {
      this._resourcesByOriginalUri[aResource.originalUri.spec] = aResource;
    }
  },

  /**
   * Removes the properties of the given resource from the index, so that the
   * properties can be modified.
   */
  removeResourceFromIndex: function(aResource) {
    if (aResource.referenceUri) {
      var resourceList = this.
       _resourceListsByReferenceUri[aResource.referenceUri.spec];
      resourceList.splice(resourceList.indexOf(aResource), 1);
    }
    if (aResource.originalUri) {
      delete this._resourcesByOriginalUri[aResource.originalUri.spec];
    }
  },

  /**
   * Returns the first resource whose referenceUri matches the provided nsIURI
   * object, or null if no resource matches.
   */
  getResourceByReferenceUri: function(aReferenceUri) {
    var resourceList = this._resourceListsByReferenceUri[aReferenceUri.spec];
    return (resourceList && resourceList[0]) || null;
  },

  /**
   * Returns the resource whose originalUri matches the provided nsIURI object,
   * or null if no resource matches.
   */
  getResourceByOriginalUri: function(aOriginalUri) {
    return this._resourcesByOriginalUri[aOriginalUri.spec] || null;
  },

  /**
   * Scans the given folder for resources and adds them to the bundle.
   *
   * The first file found in the root folder is considered the root resource of
   * the bundle. The other files are considered aggregate resources.
   *
   * @param aFolder
   *        nsIFile representing the folder to be examined.
   * @param aOriginalUriByPath
   *        Object mapping each file path to the original URI the file was saved
   *        from. The metadata from this map will be set on the resource
   *        objects.
   */
  scanFolder: function(aFolder, aOriginalUriByPath) {
    // Find the local file URL associated with the given folder.
    var folderUrl = Cc["@mozilla.org/network/io-service;1"].
     getService(Ci.nsIIOService).newFileURI(aFolder).
     QueryInterface(Ci.nsIFileURL);
    // For each file in the given folder
    for (var file in this._filesGenerator(aFolder)) {
      // Create a new resource object from the file on disk.
      var resource = new PersistResource();
      resource.initFromFile(file);
      resource.readFromFile();
      // Determine if more information about the file is available.
      var originalUri = aOriginalUriByPath && aOriginalUriByPath[file.path];
      if (originalUri) {
        // Set the known original URI and use the absolute content location.
        resource.originalUri = originalUri;
        resource.contentLocation = originalUri.spec;
      } else {
        // There is no original URI, and the content location is relative.
        var fileUri = Cc["@mozilla.org/network/io-service;1"].
         getService(Ci.nsIIOService).newFileURI(file);
        resource.contentLocation = folderUrl.getRelativeSpec(fileUri);
      }
      // Add the resource object to the bundle.
      this.resources.push(resource);
    }
  },

  /**
   * Scans the given PersistBundle object for resources that have been saved to
   * file, and adds them to the bundle.
   *
   * @param aOriginalBundle
   *        PersistBundle object to be examined.
   */
  scanBundle: function(aOriginalBundle) {
    // For each resource in the given bundle with an associated file
    for (var [, originalResource] in Iterator(aOriginalBundle.resources)) {
      if (originalResource.file) {
        // Read the body of the resource in binary format from the file on disk.
        originalResource.readFromFile();
        // Add the resource object to the bundle.
        this.resources.push(originalResource);
      }
    }
  },

  /**
   * Saves all the resources in the bundle to the associated local files.
   */
  writeAll: function() {
    for (var [, resource] in Iterator(this.resources)) {
      resource.writeToFile();
    }
  },

  /**
   * Associates the values of the referenceUri property with arrays containing
   * the corresponding resource objects.
   */
  _resourceListsByReferenceUri: {},

  /**
   * Associates the values of the originalUri property with the corresponding
   * resource objects.
   */
  _resourcesByOriginalUri: {},

  /**
   * This generator function yields each file in the given folder and its
   * subfolders, starting from the files in the root folder.
   */
  _filesGenerator: function(aFolder) {
    // Enumerate all the files in the specified directory, while creating a
    // separate list of subfolders that will be examined later.
    var dirEntries = aFolder.directoryEntries;
    var subdirs = [];
    while (dirEntries.hasMoreElements()) {
      var dirEntry = dirEntries.getNext().QueryInterface(Ci.nsIFile);
      if (dirEntry.isDirectory()) {
        subdirs.push(dirEntry);
      } else {
        yield dirEntry;
      }
    }

    // Enumerate the files contained in every subfolder, recursively.
    for (var [, subdir] in Iterator(subdirs)) {
      for (var file in this._filesGenerator(subdir)) {
        yield file;
      }
    }
  },
}
