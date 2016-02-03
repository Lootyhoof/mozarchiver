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
 * This object stores all the archives that are known in this session.
 */
var ArchiveCache = {

  /**
   * Register the given archive object in the cache. After an archive object has
   * been registered in the cache, it must not be modified without unregistering
   * it first.
   *
   * @param aArchive
   *        Object of type Archive whose metadata will be cached.
   */
  registerArchive: function(aArchive) {
    // Remove any previously registered archive object with the same key.
    var oldArchive = this._archivesByKey[aArchive.cacheKey];
    if (oldArchive) {
      this.unregisterArchive(oldArchive);
    }
    // Register the archive in the cache.
    this._archivesByKey[aArchive.cacheKey] = aArchive;
    this._archivesByUri[aArchive.uri.spec] = aArchive;
    // Add information about the individual pages.
    for (var [, page] in Iterator(aArchive.pages)) {
      // The following URLs are normally unique for every extracted page.
      this._pagesByArchiveUri[page.archiveUri.spec] = page;
      if (page.tempUri) {
        this._pagesByTempUri[page.tempUri.spec] = page;
      }
      this._pagesByTempFolderUri[page.tempFolderUri.spec] = page;
      if (page.directArchiveUri) {
        this._pagesByDirectArchiveUri[page.directArchiveUri.spec] = page;
      }
      // Add places annotations for the cached page.
      ArchiveAnnotations.setAnnotationsForPage(page);
    }
  },

  /**
   * Remove the given archive object from the cache.
   *
   * @param aArchive
   *        Object of type Archive to be removed from the cache.
   */
  unregisterArchive: function(aArchive) {
    // Ensure that the archive is present in the cache.
    if (!this._archivesByKey[aArchive.cacheKey]) {
      return;
    }
    // Remove the archive from the cache.
    delete this._archivesByKey[aArchive.cacheKey];
    delete this._archivesByUri[aArchive.uri.spec];
    // Remove information about the individual pages.
    for (var [, page] in Iterator(aArchive.pages)) {
      // The following URLs are normally unique for every extracted page.
      delete this._pagesByArchiveUri[page.archiveUri.spec];
      if (page.tempUri) {
        delete this._pagesByTempUri[page.tempUri.spec];
      }
      delete this._pagesByTempFolderUri[page.tempFolderUri.spec];
      if (page.directArchiveUri) {
        delete this._pagesByDirectArchiveUri[page.directArchiveUri.spec];
      }
      // Clear the obsolete places annotations for the page.
      ArchiveAnnotations.removeAnnotationsForPage(page);
    }
  },

  /**
   * Returns the archive object associated with the given URL.
   *
   * @param aUri
   *        nsIURI representing the original URL of the archive.
   */
  archiveFromUri: function(aUri) {
    return this._archivesByUri[this._getLookupSpec(aUri)] || null;
  },

  /**
   * Returns the page object associated with the file referenced by the given
   * URL, if the URL represents a file in the temporary directory that is
   * related to an available extracted page.
   *
   * @param aUri
   *        nsIURI to check.
   */
  pageFromAnyTempUri: function(aUri) {
    // Return now if the provided URL is not a file URL, thus it cannot refer to
    // a file in the temporary directory related to an extracted page.
    if (!(aUri instanceof Ci.nsIFileURL)) {
      return null;
    }
    // Check if this file is located under any archive's temporary folder.
    for (var [, page] in Iterator(this._pagesByTempUri)) {
      var folderUri = page.tempFolderUri.QueryInterface(Ci.nsIFileURL);
      // The following function checks whether aUri is located under the folder
      // represented by folderUri.
      if (folderUri.getCommonBaseSpec(aUri) === folderUri.spec) {
        return page;
      }
    }
    // The URL is unrelated to any extracted page.
    return null;
  },

  /**
   * Returns the page object associated with the given URL.
   *
   * @param aUri
   *        nsIURI representing one of the URLs of the main file associated with
   *        the page. It can be the archive URL, the URL in the temporary
   *        folder, or the direct archive access URL (for example, a "jar" URL).
   */
  pageFromUri: function(aUri) {
    var uriSpec = this._getLookupSpec(aUri);
    return this._pagesByArchiveUri[uriSpec] ||
           this._pagesByDirectArchiveUri[uriSpec] ||
           this._pagesByTempUri[uriSpec] ||
           null;
  },

  /**
   * Associative array containing all the registered Archive objects.
   */
  _archivesByKey: {},

  /**
   * Associative array containing all the registered Archive objects, accessible
   * by their original URI.
   */
  _archivesByUri: {},

  /**
   * Associative array containing all the available archived pages, accessible
   * by their specific archive URI.
   */
  _pagesByArchiveUri: {},

  /**
   * Associative array containing all the available archived pages, accessible
   * by the URI of their main file in the temporary directory.
   */
  _pagesByTempUri: {},

  /**
   * Associative array containing all the available archived pages, accessible
   * by the URI of their specific temporary folder.
   */
  _pagesByTempFolderUri: {},

  /**
   * Associative array containing some of the available archived pages,
   * accessible by their direct archive access URI (for example, a "jar:" URI).
   */
  _pagesByDirectArchiveUri: {},

  /**
   * Removes unnecessary elements from archive or page URIs, in order to look
   * them up in the archive cache correctly.
   *
   * @param aUri
   *        nsIURI to process.
   */
  _getLookupSpec: function(aUri) {
    var lookupUri = aUri.clone();
    if (lookupUri instanceof Ci.nsIURL) {
      // Try and remove the hash part, if supported by the URL implementation.
      try {
        lookupUri.ref = "";
      } catch (e) { }
    }
    return lookupUri.spec;
  },
};
