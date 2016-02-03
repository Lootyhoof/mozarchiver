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
 * Represents a web resource that is part of a web page.
 */
function PersistResource() {

}

PersistResource.prototype = {
  /**
   * Raw octets with the contents of the web resource.
   */
  body: "",

  /**
   * nsIFile object containing the local copy of the web resource.
   */
  file: null,

  /**
   * nsIFileURL object for the file with the local copy of the web resource.
   */
  get fileUrl() {
    return Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService).
     newFileURI(this.file).QueryInterface(Ci.nsIFileURL);
  },

  /**
   * nsIURI object representing the original address from which the web resource
   * was retrieved. If the resource was modified after retrieval, this URI will
   * be different from the value of the originalUri property.
   *
   * Multiple resources in the same PersistBundle object may share the same
   * reference URI, if they are differently modified versions of the original.
   */
  referenceUri: null,

  /**
   * nsIURI object representing the original location of the web resource. This
   * property usually corresponds to the "Content-Location" header in web
   * archives, and uniquely identifies the resource in a PersistBundle object.
   */
  originalUri: null,

  /**
   * URL-encoded string representing the original location of the web resource,
   * or the relative position of the resource with regard to a known root.
   */
  contentLocation: "",

  /**
   * String representing the MIME type of the web resource.
   */
  mimeType: "",

  /**
   * String representing the charset declaration of the web resource, or empty
   * if the information is not available.
   */
  charset: "",

  /**
   * Initializes the relevant metadata about the current resource starting from
   * the given local file.
   *
   * @param aFile
   *        nsIFile to be associated with the resource.
   */
  initFromFile: function(aFile) {
    // Initialize the known member variables.
    this.file = aFile;
    // Get the MIME type from the local file if possible.
    var fileUri = Cc["@mozilla.org/network/io-service;1"].
     getService(Ci.nsIIOService).newFileURI(aFile);
    try {
      this.mimeType = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService).
       getTypeFromURI(fileUri);
    } catch (e) {
      // In case the MIME type cannot be determined, use a binary file type.
      this.mimeType = "application/octet-stream";
    }
  },

  /**
   * Writes the body of the resource to the associated local file. If the parent
   * directory of the file does not exist, all missing ancestors are created.
   */
  writeToFile: function() {
    // Ensure that the ancestors exist.
    if (!this.file.parent.exists()) {
      this.file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
    }
    // Create and initialize an output stream to write to the local file.
    var outputStream = Cc["@mozilla.org/network/file-output-stream;1"].
     createInstance(Ci.nsIFileOutputStream);
    outputStream.init(this.file, -1, -1, 0);
    try {
      // Write the entire file to disk at once. If the content to be written is
      // 4 GiB or more in size, an exception will be raised.
      outputStream.write(this.body, this.body.length);
    } finally {
      // Close the underlying stream.
      outputStream.close();
    }
  },

  /**
   * Populates the body with the contents read from the local file.
   */
  readFromFile: function() {
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
        // Read the entire file and store the contents in the body property. If
        // the file is 4 GiB or more in size, an exception will be raised.
        this.body = binInputStream.readBytes(this.file.fileSize);
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
}
