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
 * Represents an MHTML web archive.
 *
 * This class derives from Archive. See the Archive documentation for details.
 *
 * @param aFile
 *        nsIFile representing the compressed archive. The file usually ends
 *        with the ".mht" or ".mhtml" extension.
 */
function MhtmlArchive(aFile) {
  Archive.call(this);
  this.file = aFile;

  // Initialize member variables explicitly for proper inheritance.
  this._resourcesByContentLocation = {};
  this._resourcesByContentId = {};
}

MhtmlArchive.prototype = {
  __proto__: Archive.prototype,

  // Archive
  extractAll: function() {
    // Create and initialize the single page object for the archive.
    var page = this.addPage();
    page.tempDir = this._tempDir;
    // Read and parse the contents of the MHTML file.
    var part = new MimePart();
    part.text = this._readArchiveFromFile();
    part = part.promoteToDerivedClass();
    // Set the metadata on the page object.
    page.setMetadataFromMimePart(part);
    // Prepare the extraction of the resources from the archive.
    this._persistBundle = new PersistBundle();
    this._persistFolder = new PersistFolder(this._tempDir);
    // For MAF-specific MHMTL archives.
    if (part.headersByLowercaseName["x-maf"] && part.parts) {
      // Archives with the "X-MAF" header are either composed by one content
      // part only, or by a single "multipart/related" MIME part that contains
      // one content part for each file. In this case, the root part of the
      // MHTML file is the first content part, and the other parts should be
      // extracted locally while respecting the content locations specified in
      // their "Content-Location" headers, which are always relative to the
      // location of the root part.
      this._collectResourcesFromMafPart(part);
    } else {
      // This is a normal MHTML archive. Build the base URL that is used to
      // resolve relative references when there is no URI specified in the
      // "Content-Location" headers. Instead of the URL "thismessage:/", the
      // "resource:///" URL is used for the same purpose. Resource URLs are used
      // only during resolution of relative references, and are never
      // substituted in message bodies.
      var baseUrl = this._ioService.newURI("resource:///", null, null);
      // Collect resources recursively, and look for a root resource.
      this._collectResourcesFromPart(part, baseUrl, true);
      // Convert all the URIs in the content that reference resources that are
      // available in the MHTML file, and resolve relative URIs based on the
      // original locations of the saved files.
      this._indexResourceLocations();
      this._replaceContentUris();
    }
    // Set the metadata about the root resource.
    var resource = this._persistBundle.resources[0];
    page.indexLeafName = resource.file.leafName;
    page.originalUrl = "Unknown";
    if (resource.originalUri && !resource.originalUri.schemeIs("resource")) {
      page.originalUrl = resource.originalUri.spec;
    } else if (resource.contentLocation) {
      page.originalUrl = resource.contentLocation;
    }
    // Save the resources locally.
    this._persistBundle.writeAll();
  },

  // Archive
  _newPage: function() {
    return new MhtmlArchivePage(this);
  },

  /**
   * PersistBundle object with the resources collected from the MHTML file.
   */
  _persistBundle: null,

  /**
   * PersistFolder object that is used to determine the local file names of
   * resources in the MHTML file.
   */
  _persistFolder: null,

  /**
   * Collects all the resources from the given MIME part, which is a multipart
   * message part of an MHTML file in the MAF-specific format, and stores them
   * in the PersistBundle object associated with the current archive.
   */
  _collectResourcesFromMafPart: function(aMimePart) {
    // Find the local file URL associated with the temporary directory.
    var folderUrl = this._ioService.newFileURI(this._tempDir).
     QueryInterface(Ci.nsIURL);
    // Ensure that the local URL points to a directory.
    if (folderUrl.path.slice(-1) !== "/") {
      folderUrl.path += "/";
    }
    // Examine each content part in the MHTML file.
    for (var [partIndex, contentPart] in Iterator(aMimePart.parts)) {
      // Collect the resource in the PersistBundle object. The first resource
      // is always the root resource.
      var res = this._collectResourceFromContentPart(contentPart, !partIndex);
      if (partIndex > 0) {
        // For other resources, use the relative content location.
        var location = contentPart.headersByLowercaseName["content-location"];
        var fileUrl = this._ioService.newURI(location, null, folderUrl);
        // The following function checks whether fileUrl is located under the
        // folder represented by folderUrl.
        if (folderUrl.getCommonBaseSpec(fileUrl) !== folderUrl.spec) {
          throw new Components.Exception("Invalid relative content location");
        }
        // Update the local file name for saving the resource.
        res.file = fileUrl.QueryInterface(Ci.nsIFileURL).file;
      }
    }
  },

  /**
   * Collects all the resources from the given MIME part, which is either a
   * multipart or a message part of an MHTML file, and stores them in the
   * PersistBundle object associated with the current archive. The given URL is
   * used to resolve relative references in content locations.
   */
  _collectResourcesFromPart: function(aMimePart, aBaseUrl, aIsRootCandidate) {
    // Resolve the content location for the current part.
    var location = aMimePart.headersByLowercaseName["content-location"];
    if (location) {
      aMimePart.resolvedLocation = this._ioService.newURI(location, null,
       aBaseUrl);
    } else {
      aMimePart.resolvedLocation = aBaseUrl;
    }
    // If this is a multipart MIME part
    if (aMimePart.parts) {
      // If required, find a root part candidate among the immediate children.
      var startPart = aIsRootCandidate ? aMimePart.startPart : null;
      // Collect all the children.
      for (let [, contentPart] in Iterator(aMimePart.parts)) {
        // Use the resolved URL of this part as a base URL for child parts, and
        // indicate if the current part is a candidate for containing the root
        // part or for being considered the root part itself.
        this._collectResourcesFromPart(contentPart, aMimePart.resolvedLocation,
         contentPart === startPart);
      }
    } else {
      // Collect the resource associated with the content part. If a content
      // part is a root candidate, then it is the actual root resource.
      this._collectResourceFromContentPart(aMimePart, aIsRootCandidate);
    }
  },

  /**
   * Creates a new PersistResource object initialized with the information from
   * the given MIME part, which is a content part. The resource is both added to
   * the current PersistBundle object and returned by the function.
   */
  _collectResourceFromContentPart: function(aMimePart, aIsRootPart) {
    // Create a new resource and initialize its contents.
    var resource = new PersistResource();
    resource.body = aMimePart.body;
    // Set the MIME media type for the resource. If no media type is specified,
    // use an appropriate default depending on whether this is the root part.
    resource.mimeType = aMimePart.mediaType || (aIsRootPart ? "text/html" :
     "application/octet-stream");
    // Store the content location and identifier for later, if present.
    resource.originalUri = aMimePart.resolvedLocation || null;
    resource.contentId = aMimePart.headersByLowercaseName["content-id"];
    // Determine the actual file name for the resource. For the root resource,
    // the local base name "index" is always used.
    resource.contentLocation = aIsRootPart ? "index" :
     (aMimePart.resolvedLocation && aMimePart.resolvedLocation.spec);
    this._persistFolder.addUnique(resource);
    // Add this resource as the first or the last resource in the bundle.
    if (aIsRootPart) {
      this._persistBundle.resources.unshift(resource);
    } else {
      this._persistBundle.resources.push(resource);
    }
    // Return the resource for further manipulation if necessary.
    return resource;
  },

  /**
   * Associates the values of the "Content-Location" headers with the resources
   * collected from the MHTML file.
   */
  _resourcesByContentLocation: {},

  /**
   * Associates the values of the "Content-ID" headers with resources collected
   * from the MHTML file.
   */
  _resourcesByContentId: {},

  /**
   * Populates the associative arrays that are used to index resources by
   * content identifiers or content locations.
   */
  _indexResourceLocations: function(aMimePart) {
    // Examine each resource from the MHTML file.
    for (var [, resource] in Iterator(this._persistBundle.resources)) {
      // Create the entry in the associative array for content locations.
      if (resource.originalUri) {
        var compareUri = resource.originalUri.clone();
        try {
          // If the URI has URL syntax, remove the hash part.
          compareUri = compareUri.QueryInterface(Ci.nsIURL);
          compareUri.ref = "";
        } catch (e) {
          // In case of errors, use the original URI.
        }
        this._resourcesByContentLocation[compareUri.spec] = resource;
      }
      // Create the entry in the associative array for content identifiers.
      var contentId = (resource.contentId || "").replace(/^<|>$/g, "");
      if (contentId) {
        this._resourcesByContentId[contentId] = resource;
      }
    }
  },

  /**
   * Replaces all the URIs in the contents of the available resources with
   * absolute ones, converting them to local file URLs if required.
   */
  _replaceContentUris: function() {
    // Examine each resource from the MHTML file.
    for (var [, resource] in Iterator(this._persistBundle.resources)) {
      // Parse the body of the resource appropriately.
      var entireSourceFile;
      if (resource.mimeType == "text/html" ||
       resource.mimeType == "application/xhtml+xml") {
        // Use the HTML parser.
        entireSourceFile = new HtmlSourceFragment(resource.body);
      } else if (resource.mimeType == "text/css") {
        // Use the CSS parser.
        entireSourceFile = new CssSourceFragment(resource.body);
      } else {
        // The type is not recognized, the resource does not need modification.
        continue;
      }
      // Search for all the URIs contained in the resource.
      for (var curFragment in entireSourceFile) {
        if (curFragment instanceof UrlSourceFragment) {
          // Resolve the current URI to an absolute value. This operation does
          // not consider base URLs specified in the content at present.
          var fragmentUri = null;
          try {
            fragmentUri = this._ioService.newURI(curFragment.urlSpec, null,
             resource.originalUri);
          } catch (e) {
            // The URI cannot be resolved to an absolute location.
          }
          // If an absolute URI was found
          if (fragmentUri) {
            var mapResource;
            var hashPart = "";
            // If this is a "cid:" URI
            if (fragmentUri.schemeIs("cid")) {
              // Perform a lookup using the content identifier.
              contentId = fragmentUri.spec.slice("cid:".length);
              mapResource = this._resourcesByContentId[contentId];
            } else {
              // Perform a lookup using the content location.
              var compareUri = fragmentUri.clone();
              try {
                // If the URI has URL syntax, remove the hash part.
                compareUri = compareUri.QueryInterface(Ci.nsIURL);
                hashPart = compareUri.ref;
                compareUri.ref = "";
              } catch (e) {
                // In case of errors, use the original URI.
              }
              mapResource = this._resourcesByContentLocation[compareUri.spec];
            }
            // If the URI points to a resource available in the MHTML file
            if (mapResource) {
              // Update the URI to point to the local file.
              fragmentUri = this._ioService.newFileURI(mapResource.file).
               QueryInterface(Ci.nsIURL);
              // Add the hash part if required.
              if (hashPart) {
                fragmentUri.ref = hashPart;
              }
            }
            // Update the actual URI in the content, unless the new URI resolves
            // to a virtual location inside the MHMTL file.
            if (!fragmentUri.schemeIs("resource")) {
              curFragment.urlSpec = fragmentUri.spec;
            }
          }
        }
      }
      // Update the body of the resource.
      resource.body = entireSourceFile.sourceData;
    }
  },

  /**
   * Returns the contents read from the local archive file.
   */
  _readArchiveFromFile: function() {
    // Create and initialize an input stream to read from the local file.
    var inputStream = Cc["@mozilla.org/network/file-input-stream;1"].
     createInstance(Ci.nsIFileInputStream);
    inputStream.init(this.file, -1, 0, 0);
    try {
      // Create and initialize a scriptable binary stream reader.
      var binInputStream = Cc["@mozilla.org/binaryinputstream;1"].
       createInstance(Ci.nsIBinaryInputStream);
      binInputStream.setInputStream(inputStream);
      try {
        // Read the entire file and return its contents. If the file is 4 GiB or
        // more in size, an exception will be raised.
        return binInputStream.readBytes(this.file.fileSize);
      } finally {
        // Close the binary stream before returning or in case of exception.
        binInputStream.close();
      }
    } finally {
      // Close the underlying stream. This instruction has no effect if the
      // binary stream has been already closed successfully.
      inputStream.close();
    }
  },

  _ioService: Cc["@mozilla.org/network/io-service;1"].
   getService(Ci.nsIIOService),
}
