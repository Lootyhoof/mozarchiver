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
 * The ArchiveLoader global object provides helper functions for opening web
 * archives in browser windows.
 */
var ArchiveLoader = {
  /**
   * This object will be initialized on startup with properties whose names are
   * the MIME type we need to handle, and whose values are the internal archive
   * type, for example "TypeMAFF" or "TypeMHTML".
   */
  archiveTypeByContentType: {},

  /**
   * Opens the specified archive or archive page synchronously, and returns an
   * nsIURI object pointing to the archive page to be displayed, or null if the
   * provided URI already points to the correct page in the archive. This
   * function also performs all the operations related to opening multi-page
   * archives, working on the provided container.
   *
   * @param aArchiveUri
   *        nsIURI pointing to the archive to be opened.
   * @param aLocalUri
   *        nsIFileURL pointing to the local copy of the archive.
   * @param aContentType
   *        MIME media type of the archive.
   * @param aContainer
   *        Reference to the browser DocShell where the archive will be opened.
   *        For general information on DocShell, see
   *        <https://developer.mozilla.org/en/DocShell> (retrieved 2009-05-31).
   */
  load: function(aArchiveUri, aLocalUri, aContentType, aContainer) {
    var betterUri = null;

    // Find the requested page in the archive cache.
    var page = ArchiveCache.pageFromUri(aArchiveUri);

    // If the specified page has not been loaded yet
    if (!page) {
      // Find the requested archive in the archive cache.
      var archive = ArchiveCache.archiveFromUri(aArchiveUri);

      // If the specified archive has not been loaded yet
      if (!archive) {
        // Extract the archive and register it in the archive cache.
        var archiveFile = aLocalUri.QueryInterface(Ci.nsIFileURL).file;
        archive = ArchiveLoader.extractAndRegister(archiveFile, aArchiveUri,
         aContentType);

        // Find the exact requested page from the archive cache.
        page = ArchiveCache.pageFromUri(aArchiveUri);
      }

      // If the page is not found, probably the provided URL refers to a
      // multi-page archive, but not to a specific page inside it.
      if (!page) {
        // Display the first page in the archive, using its exact location.
        page = archive.pages[0];
        betterUri = page.archiveUri;
        // Open the other pages in the archive in tabs.
        ArchiveLoader._openMultipageArchive(archive, page, aContainer);
      }
    }

    // If a character set is explicitly specified in the archive and the
    // preference to ignore this value is not set, force the use of the
    // character set specified in the archive, regardless of any other override.
    if (page.renderingCharacterSet && !Prefs.openMaffIgnoreCharacterSet) {
      // For more information, see the "SetCharset" function in
      // <http://mxr.mozilla.org/mozilla-central/source/docshell/base/nsDocShell.cpp>
      // (retrieved 2009-10-31).
      aContainer.QueryInterface(Ci.nsIDocShell).
       QueryInterface(Ci.nsIDocCharset).charset = page.renderingCharacterSet;
    }

    // Return an URI that identifies the archived page better, if required.
    return betterUri;
  },

  /**
   * Returns an nsIURI object pointing to the main document to be displayed for
   * the given archive page URI, which must have been previously loaded using
   * the "load" method.
   *
   * @param aArchiveUri
   *        nsIURI pointing to the archive to be accessed.
   */
  getContentUri: function(aArchiveUri) {
    // Find the requested page in the archive cache.
    var page = ArchiveCache.pageFromUri(aArchiveUri);

    // Ensure that the page is available. Since the loading process always calls
    // "load" before this function, the only case where this can happen is when
    // the archive cache is cleared during a load operation.
    if (!page) {
      throw new Components.Exception("Web archive cache cleared during load");
    }

    // Display the content associated with the page. Depending on the current
    // preferences, the content is loaded from the temporary directory or
    // directly from the archive. If either the version in the temporary
    // directory or the one in archive is not available for this particular
    // page, the other access method is used.
    var contentUri;
    if (!page.tempUri || (page.directArchiveUri && Prefs.openUseJarProtocol)) {
      contentUri = page.directArchiveUri.clone();
    } else {
      contentUri = page.tempUri.clone();
    }

    // Try and propagate the hash part, if supported by the URL implementation.
    if (aArchiveUri instanceof Ci.nsIURL) {
      try {
        contentUri.QueryInterface(Ci.nsIURL).ref = aArchiveUri.ref;
      } catch (e) { }
    }

    return contentUri;
  },

  /**
   * Extracts the specified archive and registers it in the archive cache.
   * Returns the new Archive object associated with the specified archive.
   *
   * @param aArchiveFile
   *        nsIFile pointing to the archive to be extracted.
   * @param aOriginalUri
   *        Optional nsIURI pointing to the original location of the archive.
   * @param aContentType
   *        Optional MIME media type of the archive.
   */
  extractAndRegister: function(aArchiveFile, aOriginalUri, aContentType) {
    // Determine the name of the directory where the archive will be extracted.
    var dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    dir.initWithPath(Prefs.tempFolder);
    dir.append(new Date().valueOf() + "_" + Math.floor(Math.random() * 1000));

    // Determine the MIME type of the archive, if not explicitly provided.
    var contentType = aContentType;
    if (!contentType) {
      var resource = new PersistResource();
      resource.initFromFile(aArchiveFile);
      contentType = resource.mimeType;
    }

    // Determine the format to use from the content type and extract the
    // archive.
    var archive;
    if (ArchiveLoader.archiveTypeByContentType[contentType] == "TypeMHTML") {
      archive = new MhtmlArchive(aArchiveFile);
    } else {
      archive = new MaffArchive(aArchiveFile);
    }
    if (aOriginalUri) {
      archive.uri = aOriginalUri;
    }
    archive._tempDir = dir;
    archive.extractAll();

    // Register the archive in the cache.
    ArchiveCache.registerArchive(archive);

    // Return the new Archive object.
    return archive;
  },

  /**
   * Opens the pages in the specified archive in tabs, except for the specified
   * main page.
   */
  _openMultipageArchive: function(aArchive, aMainPage, aContainer) {
    // Find the browser window associated with the document being loaded.
    var browserWindow = aContainer.
     QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation).
     QueryInterface(Ci.nsIDocShellTreeItem).rootTreeItem.
     QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);

    // If a tabbed browser is present in the window that loaded the document.
    if (browserWindow.getBrowser) {
      // Open all the pages, except the main one, in other tabs.
      var browser = browserWindow.getBrowser();
      for ([, page] in Iterator(aArchive.pages)) {
        if (page !== aMainPage) {
          browser.addTab(page.archiveUri.spec);
        }
      }
    }
  },
}
