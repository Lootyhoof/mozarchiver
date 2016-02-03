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
 * Base class representing web archives. Derived objects must implement specific
 * methods.
 *
 * This object allows the creation and extraction of archives, and handles the
 * metadata associated with the archive's contents.
 */
function Archive() {
  // Initialize member variables explicitly for proper inheritance.
  this.file = null;
  this.pages = [];
  this._tempDir = null;
}

Archive.prototype = {
  /**
   * nsIFile representing the compressed or encoded archive.
   */
  file: null,

  /**
   * Array of ArchivePage objects holding information on each individual web
   * page included in the archive. Some formats may support only one page. The
   * order of the items is important, and reflects the index that can be used
   * to select a specific page in the archive.
   */
  pages: [],

  /**
   * Adds a new page to the archive and returns the new page object.
   */
  addPage: function() {
    var page = this._newPage();
    page._index = this.pages.length;
    this.pages.push(page);
    return page;
  },

  /**
   * String representing the leaf name of the archive file, without extension.
   */
  get name() {
    // Returns the base name extracted from the URI object of the archive, which
    // always implements the nsIURL interface.
    return this.uri.QueryInterface(Ci.nsIURL).fileBaseName;
  },

  /**
   * nsIURI representing the original location of the web archive.
   *
   * This URI does not refer to a specific page in the archive. If this property
   * is set to an URI containing a page reference, the reference is removed.
   *
   * By default, this property corresponds to the URI of the archive file.
   */
  _uri: null,
  get uri() {
    // If the original URI for the archive was not set explicitly, generate a
    // new URI pointing to the local archive file.
    if (!this._uri) {
      this._uri = Cc["@mozilla.org/network/io-service;1"].
       getService(Ci.nsIIOService).newFileURI(this.file);
    }
    return this._uri;
  },
  set uri(aValue) {
    var archiveUri = aValue.clone();
    if (archiveUri instanceof Ci.nsIURL) {
      // Ensure that the archive page number in the query part is removed.
      archiveUri.query =
       archiveUri.query.replace(/&?web_archive_page=\d+$/, "");
      // Try and remove the hash part, if supported by the URL implementation.
      try {
        archiveUri.ref = "";
      } catch (e) { }
    }
    this._uri = archiveUri;
  },

  /**
   * String uniquely identifying the archive in the cache.
   */
  get cacheKey() {
    // Store at most one archive object for every local file.
    return this.file.path;
  },

  /**
   * Reloads all the pages from the archive file.
   *
   * This method must be implemented by derived objects.
   */
  load: function() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * Extracts all the pages from the archive file.
   *
   * This method must be implemented by derived objects.
   */
  extractAll: function() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * Returns a new page object associated with this archive.
   *
   * This method must be implemented by derived objects.
   */
  _newPage: function() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * nsIFile representing a temporary directory whose subdirectories will
   * contain the expanded contents of the archived pages.
   */
  _tempDir: null,
}
