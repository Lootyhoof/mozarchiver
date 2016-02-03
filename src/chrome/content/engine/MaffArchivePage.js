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
 * Represents a page within a MAFF web archive.
 *
 * This class derives from ArchivePage. See the ArchivePage documentation for
 * details.
 */
function MaffArchivePage(aArchive) {
  ArchivePage.call(this, aArchive);

  // Initialize member variables explicitly for proper inheritance.
  this._browserObjectForMetadata = null;
}

MaffArchivePage.prototype = {
  __proto__: ArchivePage.prototype,

  /**
   * Internal path in the archive of the main file associated with the page.
   */
  get indexZipEntry() {
    return this.tempDir.leafName + "/" + this.indexLeafName;
  },

  /**
   * nsIURI providing direct access to the main file in the archive.
   */
  get directArchiveUri() {
    // Compose the requested "jar:" URI.
    var jarUriSpec = "jar:" + this.archive.uri.spec + "!/" + this.indexZipEntry;
    // Return the associated URI object.
    return Cc["@mozilla.org/network/io-service;1"].
     getService(Ci.nsIIOService).newURI(jarUriSpec, null, null);
  },

  // ArchivePage
  get tempUri() {
    // If the archive that contains the page was extracted while requiring
    // direct access to the page, no temporary local page is available.
    if (this.archive._useDirectAccess) {
      return null;
    }
    // By default, return the temporary URL determined by the base object.
    return ArchivePage.prototype.__lookupGetter__("tempUri").call(this);
  },

  // ArchivePage
  setMetadataFromDocumentAndBrowser: function(aDocument, aBrowser) {
    // Set the page properties that are common to all archive types.
    ArchivePage.prototype.setMetadataFromDocumentAndBrowser.call(this,
     aDocument, aBrowser);
    // Store the provided browser object.
    this._browserObjectForMetadata = aBrowser;
  },

  // ArchivePage
  save: function() {
    // Create the "index.rdf" and "history.rdf" files near the main file.
    this._saveMetadata();
    // Prepare the archive for creation or modification.
    var creator = new ZipCreator(this.archive.file, this.archive._createNew);
    try {
      // Add the contents of the temporary directory to the archive, under the
      // ZIP entry with the same name as the temporary directory itself.
      creator.addDirectory(this.tempDir, this.tempDir.leafName);
      // In case of success, the new archive file should not be overwritten.
      this.archive._createNew = false;
    } finally {
      creator.dispose();
    }
  },

  /**
   * Browser object to gather extended metadata from, or null if not available.
   */
  _browserObjectForMetadata: null,

  /**
   * Loads the metadata of this page from the "index.rdf" file in the temporary
   * directory.
   */
  _loadMetadata: function() {
    var ds = new MaffDataSource();
    var res = ds.resources;

    // Get a reference to the "index.rdf" file.
    var indexFile = this.tempDir.clone();
    indexFile.append("index.rdf");

    // Load the metadata only if the file exists, otherwise use defaults.
    if (indexFile.exists()) {
      ds.loadFromFile(indexFile);
    }

    // Store the metadata in this object, using defaults for missing entries.
    this.originalUrl = ds.getMafProperty(res.originalUrl);
    this.title = ds.getMafProperty(res.title);
    this.dateArchived = ds.getMafProperty(res.archiveTime);
    this.indexLeafName = ds.getMafProperty(res.indexFileName) ||
     this.indexLeafName || "index.html";
    this.renderingCharacterSet = ds.getMafProperty(res.charset);
  },

  /**
   * Saves the metadata of this page to the "index.rdf" and "history.rdf" files
   * in the temporary directory.
   */
  _saveMetadata: function() {
    // Set standard metadata for "index.rdf".
    var indexMetadata = [
     ["originalurl", this.originalUrl],
     ["title", this.title],
     ["archivetime", MimeSupport.getDateTimeSpecification(this.dateArchived)],
     ["indexfilename", this.indexLeafName],
     ["charset", this.renderingCharacterSet],
    ];

    var historyMetadata = null;
    var browser = this._browserObjectForMetadata;
    if (Prefs.saveMetadataExtended && browser) {
      // Set extended metadata for "index.rdf".
      indexMetadata.push(
       ["textzoom", browser.markupDocumentViewer.textZoom],
       ["scrollx", browser.contentWindow.scrollX],
       ["scrolly", browser.contentWindow.scrollY]
      );
      // Set extended metadata for "history.rdf".
      var sessionHistory = browser.sessionHistory;
      historyMetadata = [
       ["current", sessionHistory.index],
       ["noofentries", sessionHistory.count]
      ];
      for (var i = 0; i < sessionHistory.count; i++) {
        historyMetadata.push(
         ["entry" + i, sessionHistory.getEntryAtIndex(i, false).URI.spec]
        );
      }
    }

    // Write the metadata to the required files.
    this._savePropertiesToFile(indexMetadata, "index.rdf")
    if (historyMetadata) {
      this._savePropertiesToFile(historyMetadata, "history.rdf")
    }
  },

  /**
   * Save the provided metadata to the file with the given name in the temporary
   * directory.
   */
  _savePropertiesToFile: function(aPropertyArray, aFileName) {
    // Create a new data source for writing.
    ds = new MaffDataSource();
    ds.init();
    // Set all the properties in the given order.
    aPropertyArray.forEach(function([propertyname, value]) {
      ds.setMafProperty(ds.resourceForProperty(propertyname), value);
    });
    // Actually save the metadata to the file with the provided name.
    var destFile = this.tempDir.clone();
    destFile.append(aFileName);
    ds.saveToFile(destFile);
  },
}
