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
 * Base class representing a page within a web archive. Derived objects must
 * implement specific methods.
 *
 * This object allows the creation and extraction of individual pages within
 * web archives, and handles the metadata associated with the page's contents.
 *
 * Instances of this object must be created using the methods in the Archive
 * object.
 */
function ArchivePage(aArchive) {
  this.archive = aArchive;

  // Initialize other member variables explicitly for proper inheritance.
  this.tempDir = null;
  this.indexLeafName = "";
  this.title = "";
  this.originalUrl = "";
  this._dateArchived = null;
  this.renderingCharacterSet = "";
  this._index = 0;
}

ArchivePage.prototype = {
  /**
   * The parent Archive object.
   */
  archive: null,

  /**
   * nsIFile representing the temporary directory holding the expanded contents
   * of the page.
   */
  tempDir: null,

  /**
   * Name of the main file associated with the page. This is often "index.htm".
   */
  indexLeafName: "",

  /**
   * Document title or description explicitly associated with this page.
   */
  title: "",

  /**
   * String representing the original location this page was saved from.
   */
  originalUrl: "",

  /**
   * Valid Date object representing the time the page was archived, or null if
   * the information is not available. This property can also be set using a
   * string value.
   */
  get dateArchived() {
    return this._dateArchived;
  },
  set dateArchived(aValue) {
    if (aValue) {
      // If the provided value is not a Date object, create a new object.
      var date = aValue.getTime ? aValue : new Date(aValue);
      // Ensure that the provided date is valid.
      this._dateArchived = isNaN(date.getTime()) ? null : date;
    } else {
      this._dateArchived = null;
    }
  },

  /**
   * String representing the character set selected by the user for rendering
   * the page at the time it was archived. This information may be used when the
   * archive is opened to override the default character set detected from the
   * saved page.
   */
  renderingCharacterSet: "",

  /**
   * nsIURI representing the specific page inside the compressed or encoded
   * archive.
   */
  get archiveUri() {
    // For a single-page archive, there is no difference with the archive URI.
    var pageArchiveUri = this.archive.uri.clone();
    if (this.archive.pages.length == 1) {
      return pageArchiveUri;
    }

    // Ensure that we can modify the URL to point to a specific page.
    if (!(pageArchiveUri instanceof Ci.nsIURL)) {
      throw new Components.Exception("Multi-page archives can only be opened" +
       " from a location that supports relative URLs.");
    }

    // Use the query part to store the information about the page number.
    if (pageArchiveUri.query) {
      pageArchiveUri.query += "&";
    }
    pageArchiveUri.query += "web_archive_page=" + (this._index + 1);

    return pageArchiveUri;
  },

  /**
   * nsIURI representing the local temporary copy of the main file associated
   * with the page, or null if the page was not extracted locally.
   */
  get tempUri() {
    // Locate the main temporary file associated with with the page.
    var indexFile = this.tempDir.clone();
    indexFile.append(this.indexLeafName);
    // Return the associated URI object.
    return Cc["@mozilla.org/network/io-service;1"].
     getService(Ci.nsIIOService).newFileURI(indexFile);
  },

  /**
   * nsIURI representing the local temporary folder associated with the page.
   */
  get tempFolderUri() {
    return Cc["@mozilla.org/network/io-service;1"].
     getService(Ci.nsIIOService).newFileURI(this.tempDir);
  },

  /**
   * Sets additional metadata about the page starting from the provided document
   * and browser objects.
   *
   * This method can be overridden by derived objects.
   */
  setMetadataFromDocumentAndBrowser: function(aDocument, aBrowser) {
    // Find the original metadata related to the page being saved, if present.
    var documentUri = aDocument.documentURIObject;
    var originalData = this._getOriginalMetadata(documentUri, aDocument);
    // Set the other properties of this page object appropriately.
    this.title = aDocument.title || "Unknown";
    this.originalUrl = originalData.originalUrl || documentUri.spec;
    this.dateArchived = originalData.dateArchived || new Date();
    this.renderingCharacterSet = aDocument.characterSet;
  },

  /**
   * Stores the page into the archive file.
   */
  save: function() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * Zero-based index of the page in the archive.
   */
  _index: 0,

  /**
   * Returns an object containing the original metadata for the page, obtained
   * from the current archive cache or from the local file the page is being
   * saved from.
   *
   * @param aSaveUri
   *        nsIURI of the page being saved.
   * @param aDocument
   *        Document that must be used to find the original URL the local page
   *        was saved from, if necessary.
   */
  _getOriginalMetadata: function(aSaveUri, aDocument) {
    // When saving a page that was extracted from an archive in this session,
    // use the metadata from the original archive.
    var originalPage = ArchiveCache.pageFromUri(aSaveUri);
    if (originalPage) {
      return originalPage;
    }

    // If the page is part of an archive but is not one of the main pages, use
    // only the date from the original archive.
    var parentPage = ArchiveCache.pageFromAnyTempUri(aSaveUri);
    if (parentPage) {
      return { dateArchived: parentPage.dateArchived };
    }

    // Check if the metadata from a locally saved page should be used.
    if (aSaveUri instanceof Ci.nsIFileURL) {
      // Get the file object associated with the page being saved.
      var file = aSaveUri.file;
      // Ensure that the file being saved exists at this point.
      if (file.exists()) {
        // Use the date and time from the local file, and find the original save
        // location from the document.
        return {
          dateArchived: new Date(file.lastModifiedTime),
          originalUrl: this._getOriginalSaveUrl(aDocument)
        };
      }
    }

    // No additonal metadata is available.
    return {};
  },

  /**
   * Return the original URL the given document was saved from, if available.
   */
  _getOriginalSaveUrl: function(aDocument) {
    // Find the first comment in the document, and return now if not found.
    var firstCommentNode = aDocument.evaluate('//comment()', aDocument, null,
     Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!firstCommentNode) {
      return null;
    }

    // Check to see if the first comment in the document is the Mark of the Web
    // specified by Internet Explorer when the page was saved. Even though this
    // method is not exactly compliant with the original specification (see
    // <http://msdn.microsoft.com/en-us/library/ms537628.aspx>, retrieved
    // 2009-05-10), it should provide accurate results most of the time.
    var originalUrl = this._parseMotwComment(firstCommentNode.nodeValue);
    if (originalUrl) {
      // Exclude values with special meanings from being considered as the
      // original save location. The comparisons are case-sensitive.
      if (originalUrl !== "http://localhost" &&
          originalUrl !== "about:internet") {
        return originalUrl;
      } else {
        return null;
      }
    }

    // Check to see if the page was saved using Save Complete.
    originalUrl = this._parseSaveCompleteComment(firstCommentNode.nodeValue);
    if (originalUrl) {
      return originalUrl;
    }

    // No original save location is available.
    return null;
  },

  /**
   * Parses the provided Mark of the Web comment and returns the specified URL,
   * or null if not available. For example, if the provided string contains
   * " saved from url=(0023)http://www.example.org/ ", this function returns
   * "http://www.example.org/".
   */
  _parseMotwComment: function(aMotwString) {
    // Match "saved from url=" case-sensitively, followed by the mandatory
    // character count in parentheses, followed by the actual URL, containing no
    // whitespace. Ignore leading and trailing whitespace.
    var match = /^\s*saved from url=\(\d{4}\)(\S+)\s*$/g.exec(aMotwString);
    // Return the URL part, if found, or null if the format does not match.
    return match && match[1];
  },

  /**
   * Parses the provided Save Complete original location comment and returns the
   * specified URL, or null if not available. For example, if the provided
   * string contains " Source is http://www.example.org/ ", this function
   * returns "http://www.example.org/".
   */
  _parseSaveCompleteComment: function(aSaveCompleteString) {
    // Match "Source is" case-sensitively, followed by a space and the actual
    // URL, containing no whitespace. Ignore leading and trailing whitespace.
    var match = /^\s*Source is (\S+)\s*$/g.exec(aSaveCompleteString);
    // Return the URL part, if found, or null if the format does not match.
    return match && match[1];
  },
}
