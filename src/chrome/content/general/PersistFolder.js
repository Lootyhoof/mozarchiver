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
 * Represents a local folder where web resources that are part of a web page can
 * be saved, and contains the logic for giving names to new resources that will
 * be saved in the folder.
 *
 * @param aFolder
 *        Folder where the related web resources will be saved.
 */
function PersistFolder(aFolder) {
  this.file = aFolder;

  // Initialize other member variables explicitly.
  this._comparableFileNames = {};
}

PersistFolder.prototype = {
  /**
   * nsIFile object pointing to the directory where the resources will be saved.
   */
  file: null,

  /**
   * Adds the resource to the folder and determines the local file name to use,
   * while ensuring that no duplicate names are present in the same folder.
   *
   * @param aResource
   *        Web resource that will be saved in this folder.
   */
  addUnique: function(aResource) {
    // Obtain the URI the provided resource was originally retrieved from.
    var nameUri = aResource.referenceUri;
    if (!nameUri) {
      // Determine the full URI corresponding to the content location of the
      // provided resource. If a relative content location is specified, a dummy
      // local file URL is used as a base.
      var ioService = Cc["@mozilla.org/network/io-service;1"].
       getService(Ci.nsIIOService);
      var baseUri = ioService.newURI("file:///", null, null);
      nameUri = ioService.newURI(aResource.contentLocation, null, baseUri);
    }
    // Determine the file name based on the original content location.
    var fileName = this._suggestFileNameFromUri(nameUri);
    // Ensure that the file name is valid and can be used locally.
    fileName = this._getUniversalFileName(fileName);
    // Ensure that the extension is appropriate for the content type.
    var [baseName, extension] = this._getProperBaseNameAndExtension(fileName,
     aResource.mimeType);
    // Get and register a unique name for the resource.
    var realFileName = this._registerUniqueFileName(baseName, extension);
    // Determine the actual file path associated with the resource.
    var resourceFile = this.file.clone();
    resourceFile.append(realFileName);
    aResource.file = resourceFile;
  },

  /**
   * This object contains one property for each of the comparable file names
   * that have been generated for the resources in this folder.
   */
  _comparableFileNames: {},

  /**
   * Returns a file name that is unique in this folder, built by joining the
   * given base name and extension together with an optional counter.
   *
   * @param aUniversalBaseName
   *        Validated base name of the file, that must include at least one
   *        character.
   * @param aUniversalExtension
   *        Validated extension to append, including the leading dot, or empty
   *        string if no extension should be present.
   */
  _registerUniqueFileName: function(aUniversalBaseName, aUniversalExtension) {
    // Start with a normal file name without an additional counter.
    var currentName = aUniversalBaseName + aUniversalExtension;
    // Repeat for all the possible names.
    for (var count = 1; count < 10000; count++) {
      // If a file with the same name is not present
      var comparableName = this._getComparableFileName(currentName);
      if (!this._comparableFileNames[comparableName]) {
        // Register the comparable name and return the original name.
        this._comparableFileNames[comparableName] = true;
        return currentName;
      }
      // Try with a different filename that includes a counter.
      currentName = aUniversalBaseName + "-" + count + aUniversalExtension;
    }
    // The count limit was reached without finding a unique file name.
    throw new Components.Exception("Unable to find a unique file name");
  },

  /**
   * Returns a modified version of the given file name that ensures its validity
   * on some common file system implementations.
   *
   * @param aNameString
   *        Unicode string with the proposed file name. If this string is empty
   *        or does not contain usable characters, an arbitrary file name is
   *        returned.
   */
  _getUniversalFileName: function(aNameString) {
    // Replace the potentially invalid characters with similar alternatives, and
    // remove any leading or trailing dot.
    var fileName = aNameString.
     replace(/[\s:*?\\\/|]/g, "_").
     replace(/"/g, "'").
     replace(/</g, "(").
     replace(/>/g, ")").
     replace(/^\.+|\.+$/g, "");
    // Limit the maximum file name length arbitrarily to 50 characters.
    if (fileName.length > 50) {
      return fileName.slice(0, 25) + fileName.slice(-25);
    }
    // Never return an empty file name.
    return fileName || "unnamed";
  },

  /**
   * Returns a modified version of the given file name that can be used in
   * comparisons to determine if two names may represent the same file on some
   * common file system implementations.
   *
   * @param aUniversalName
   *        File name, already validated according to rules that ensure that the
   *        name is valid on some common file system implementations.
   */
  _getComparableFileName: function(aUniversalName) {
    return aUniversalName.toLowerCase();
  },

  /**
   * Returns a file name determined from the appropriate portions of the given
   * URI, or an empty string if no file name is present. The returned name is
   * not validated and may include an extension, which may or may not be based
   * on the file type.
   *
   * @param aUri
   *        nsIURI object from which the file name should be inferred.
   */
  _suggestFileNameFromUri: function(aUri) {
    // Determine if the URL interface is available on the provided URI.
    var url = null;
    try {
      url = aUri.QueryInterface(Ci.nsIURL);
    } catch (e if (e instanceof Ci.nsIException && (e.result ==
     Cr.NS_NOINTERFACE))) {
      // The provided URI cannot be parsed as an URL. Try to remove the initial
      // "urn:" portion added by Mozilla Archive Format, if present.
      var matchResult = /^urn:[\w-]+:(.*)$/i.exec(aUri.spec);
      if (matchResult) {
        try {
          aUri = NetUtil.newURI(matchResult[1]);
          url = aUri.QueryInterface(Ci.nsIURL);
        } catch (e) {
          // The rest of the URI is not valid.
        }
      }
    }
    // If the URL interface is available
    if (url) {
      // Use the file name from the URL, if available.
      if (url.fileName) {
        return this._unescapeUriFragmentForUi(url, url.fileName);
      }
      // Use the last directory name from the URL, if available.
      var matchResult = /\/([^\/]+)\/$/.exec(url.directory);
      if (matchResult) {
        return this._unescapeUriFragmentForUi(url, matchResult[1]);
      }
    }
    // Use the host from the original URI, if available.
    try {
      if (aUri.host) {
        // The host name is already unescaped.
        return aUri.host;
      }
    } catch (e) {
      // Accessing the host property may raise an exception in some cases.
    }
    // The name cannot be determined from the provided URI.
    return "";
  },

  /**
   * Returns the unescaped version of the given URI fragment, if possible. In
   * case of errors, returns the original escaped fragment.
   *
   * @param aUri
   *        nsIURI object the character set is determined from.
   * @param aUriFragment
   *        Portion of aUri to be unescaped.
   */
  _unescapeUriFragmentForUi: function(aUri, aUriFragment) {
    return Cc["@mozilla.org/intl/texttosuburi;1"].
     getService(Ci.nsITextToSubURI).unEscapeURIForUI(aUri.originCharset ||
      "UTF-8", aUriFragment);
  },

  /**
   * Returns an array containing the new base name and file extension obtained
   * from the given file name, after ensuring that the extension matches with
   * the given content type.
   */
  _getProperBaseNameAndExtension: function(aFileName, aContentType) {
    // Find the appropriate extension based on the content type.
    var extension = this._getPrimaryExtensionSafely(aContentType);
    // If no extension is associated with the given file type
    if (!extension) {
      // Ensure that the base name does not contain parts that may be mistaken
      // as a file extension, and return an empty extension.
      return [aFileName.replace(/\./g, "_"), ""];
    }
    // If not empty, the returned extension includes a leading dot.
    extension = "." + extension;
    // Remove the extension from the base file name if possible.
    if (aFileName.length > extension.length && extension.toLowerCase() ===
     aFileName.slice(-extension.length).toLowerCase()) {
      return [aFileName.slice(0, -extension.length), extension];
    }
    // Return the unaltered base name and the extension.
    return [aFileName, extension];
  },

  /**
   * Returns the extension to use for the given content type. For well-known
   * content types, the extension is determined programmatically, otherwise it
   * is determined based on the configuration of the host application and the
   * operating system.
   */
  _getPrimaryExtensionSafely: function(aContentType) {
    // Return the extensions for the well-known content types.
    switch (aContentType) {
      // Original MIME types
      case "audio/ogg":                         return "oga";
      case "audio/x-wav":                       return "wav";
      case "application/ogg":                   return "ogg";
      case "application/rdf+xml":               return "rdf";
      case "application/vnd.mozilla.xul+xml":   return "xul";
      case "application/x-javascript":          return "js";
      case "application/xhtml+xml":             return "xhtml";
      case "image/gif":                         return "gif";
      case "image/png":                         return "png";
      case "image/jpeg":                        return "jpg";
      case "image/svg+xml":                     return "svg";
      case "text/css":                          return "css";
      case "text/html":                         return "html";
      case "text/plain":                        return "txt";
      case "text/xml":                          return "xml";
      case "video/ogg":                         return "ogv";
      // Additional MIME types
      case "application/ecmascript":            return "js";
      case "application/javascript":            return "js";
      case "text/ecmascript":                   return "js";
      case "text/javascript":                   return "js";
    }
    // Find the appropriate extension based on the content type.
    try {
      return Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService).
       getPrimaryExtension(aContentType, "");
    } catch (e if (e instanceof Ci.nsIException &&
     (e.result == Cr.NS_ERROR_NOT_INITIALIZED || e.result ==
     Cr.NS_ERROR_NOT_AVAILABLE))) {
      // The getPrimaryExtension call may throw NS_ERROR_NOT_INITIALIZED or
      // NS_ERROR_NOT_AVAILABLE if no extension is known for the content type.
      return "";
    }
  },
}
