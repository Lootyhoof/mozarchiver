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
 * Portions created by the Initial Developer are Copyright (C) 2008
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
 * This object handles all the tasks related to extension initialization and
 * termination.
 */
var StartupInitializer = {

  /**
   * This function is called every time a new user profile is ready for use in
   * the host application, usually before the first window is opened.
   *
   * This function initializes the host environment to allow processing MAFF and
   * MHTML archives. This is done by registering various components that are
   * then used by the host application in the document loading process. These
   * initializations must be done before any browser window loads, but after the
   * user profile has loaded, since the actual MIME types of MHTML and MAFF web
   * archives in use in the system are not known in advance.
   *
   * All the initializations done here are temporary (not persisted) and survive
   * until the application is closed. No explicit cleanup is done when a user
   * profile is unloaded.
   *
   * In order to understand the role of the various components in the loading
   * process, these resources (retrieved 2010-02-19) are prerequisites:
   *   <https://developer.mozilla.org/en/DocShell>
   *   <https://developer.mozilla.org/en/Document_Loading_-_From_Load_Start_to_Finding_a_Handler>
   *   <https://developer.mozilla.org/en/The_life_of_an_HTML_HTTP_request>
   *   <https://developer.mozilla.org/en/How_Mozilla_determines_MIME_Types>
   */
  initFromCurrentProfile: function() {
    // Retrieve a reference to the history service that is now available.
    this._historyService = ("nsINavHistoryService" in Ci) &&
     Cc["@mozilla.org/browser/nav-history-service;1"].
     getService(Ci.nsINavHistoryService);

    // The Services.ppmm getter is not available in Firefox 38.
    let ppmm = Cc["@mozilla.org/parentprocessmessagemanager;1"].
     getService(Ci.nsIMessageBroadcaster).
     QueryInterface(Ci.nsIProcessScriptLoader);

    // Register listeners for global messages from the content processes.
    ppmm.addMessageListener(
     "MozArchiver:ComputeDefaultTempFolderPath",
     () => Prefs.computeDefaultTempFolderPath());

    // Continue initialization in the parent and all the child processes.
    ppmm.loadProcessScript(`data:,
      Components.utils.import("chrome://mza/content/MozArchiver.jsm");
      StartupInitializer.initForEachProcess();
    `, true);
  },

  /**
   * This function is called by a process script when the profile is ready.
   */
  initForEachProcess: function() {
    // For each available archive type, define the file extensions and the MIME
    // media types that are recognized as being associated with the file type.
    var archiveTypesToRegister = [
     { mafArchiveType: "TypeMAFF",
       fileExtensions: ["maff"],
       mimeTypes:      ["application/x-maff"] },
     { mafArchiveType: "TypeMHTML",
       fileExtensions: ["mht", "mhtml"],
       mimeTypes:      ["application/x-mht", "message/rfc822"] },
    ];

    // Build a list of MIME types and associated archive types. This list will
    // be used by the archive loader to determine how to handle web archives.
    for (let [, archiveInfo] in Iterator(archiveTypesToRegister)) {
      for (let [, mimeType] in Iterator(archiveInfo.mimeTypes)) {
        ArchiveLoader.archiveTypeByContentType[mimeType] = archiveInfo.
         mafArchiveType;
      }
      for (let [, fileExtension] in Iterator(archiveInfo.fileExtensions)) {
        // Firstly, for web archives opened from local files or loaded from
        // remote locations where no MIME type is sent by the server, ensure
        // that a MIME type is assigned based on the file extension. If there
        // are no other means to determine the MIME type for a file extension,
        // the last resort is the "ext-to-type-mapping" category, so we set an
        // entry there if it's not already present. Note that this does not
        // ensure that the extension will be associated with the given type.
        this._addCategoryEntryForSession("ext-to-type-mapping", fileExtension,
         archiveInfo.mimeTypes[0]);
        // At this point, find out the actual MIME type that will be used for
        // the file extension, and ensure that it will be one of the media
        // types associated with the archive type.
        var realMimeType = this._getTypeFromExtensionSafely(fileExtension,
         archiveInfo.mimeTypes[0]);
        ArchiveLoader.archiveTypeByContentType[realMimeType] = archiveInfo.
         mafArchiveType;
      }
    }

    // For each of the MIME types that we need to handle, ensure that there is a
    // generic stream converter available. Stream converters must be registered
    // with a well-known contract ID based on the source MIME media type, and
    // must also be registered separately in the category manager.
    for (let [mimeType] in Iterator(ArchiveLoader.archiveTypeByContentType)) {
      this._registerStreamConverter("@mozilla.org/streamconv;1?from=" +
       mimeType + "&to=*/*");
      this._addCategoryEntryForSession("@mozilla.org/streamconv;1",
       "?from=" + mimeType + "&to=*/*", "");
    }

    // This component detects which resources have been loaded in a document.
    this._componentRegistrar.registerFactory(
     ContentPolicy.prototype.classID,
     "MozArchiver Content Policy",
     "@mozarchiver.ext/content-policy;1",
     ContentPolicy.prototype._xpcom_factory);
    this._addCategoryEntryForSession("content-policy",
     "MozArchiver",
     "@mozarchiver.ext/content-policy;1");

    // Register this extension's document loader factory, which is used for
    // complex web content in order to display the original location of the
    // archive in the address bar, and still use the actual content location
    // for resolving relative references inside the archive.
    this._componentRegistrar.registerFactory(
     DocumentLoaderFactory.prototype.classID,
     "MozArchiver Document Loader Factory",
     "@mozarchiver.ext/document-loader-factory;1",
     DocumentLoaderFactory.prototype._xpcom_factory);
    this._addCategoryEntryForSession(this.contentViewers(),
     "*/preprocessed-web-archive",
     "@mozarchiver.ext/document-loader-factory;1");

    // In SeaMonkey, we have to disable the mail document loader factory in
    // order to allow our loading process to occur.
    this._categoryManager.deleteCategoryEntry(this.contentViewers(),
     "message/rfc822", false);
  },

  /**
   * This function is called when the application is shutting down.
   *
   * The temporary folder is cleaned up at this point, if requested. The folder
   * itself is not removed, since it may be a user-chosen folder with custom
   * permissions, that would be lost.
   */
  terminate: function() {
    if (Prefs.tempClearOnExit) {
      // Find the temporary directory.
      var dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
      dir.initWithPath(Prefs.tempFolder);
      // The directory may not exist if no archive has been extracted or saved.
      if (dir.exists()) {
        // Enumerate all the files and subdirectories in the specified
        // directory.
        var dirEntries = dir.directoryEntries;
        while (dirEntries.hasMoreElements()) {
          try {
            // Get the local file or directory object and delete it recursively.
            var dirEntry = dirEntries.getNext().QueryInterface(Ci.nsILocalFile);
            dirEntry.remove(true);
          } catch (e) {
            // Ignore errors and go on with the next file or subdirectory.
            Cu.reportError(e);
          }
        }
      }
    }
  },

  /**
   * Version of the installed extension, obtained from the extension's metadata.
   */
  addonVersion: "",

  /**
   * Indicates whether the host has an application menu in the title bar of the
   * main window. This variable is only set after the first browser window is
   * shown, but is only used in the preferences dialog.
   */
  hasAppMenu: false,
  
  /**
   * Checks if we are on Goanna 3 or below, which used "Goanna-Content-Viewers"
   * instead of "Gecko-Content-Viewers".
   */
  contentViewers: function() {
    var viewer;
    var appID = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).ID;
    var platformVersion = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).platformVersion;
    if ((appID == "{8de7fcbb-c55c-4fbe-bfc5-fc555c87dbc4}") && 
     (Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator)
          .compare(platformVersion, "4.0.0") < 0)) {
      viewer = "Goanna-Content-Viewers";
    } else {
      viewer = "Gecko-Content-Viewers";
    }
    return viewer;
  },

  /**
   * Calls nsIMIMEService.getTypeFromExtension, and if the call fails
   * unexpectedly, returns the specified MIME type as a fallback.
   */
  _getTypeFromExtensionSafely: function(aExtension, aFallbackMimeType) {
    try {
      return this._mimeService.getTypeFromExtension(aExtension);
    } catch (e if (e instanceof Ci.nsIException &&
     e.result == Cr.NS_ERROR_NOT_INITIALIZED)) {
      // The getTypeFromExtension call may throw NS_ERROR_NOT_INITIALIZED
      // because of Mozilla bug 484579. In this case, return an arbitrary MIME
      // type to mitigate the problem.
      return aFallbackMimeType;
    }
  },

  /**
   * Calls nsICategoryManager.addCategoryEntry with aPersist and aReplace set to
   * false. If the category entry already has a value, no exception is thrown.
   */
  _addCategoryEntryForSession: function(aCategory, aEntry, aValue) {
    try {
      this._categoryManager.addCategoryEntry(aCategory, aEntry, aValue, false,
       false);
    } catch (e if (e instanceof Ci.nsIException && e.result ==
     Cr.NS_ERROR_INVALID_ARG)) {
      // Ignore the error in case the category entry already has a value.
    }
  },

  /**
   * Registers this extension's stream converter for the given ContractID.
   */
  _registerStreamConverter: function(aContractID) {
    // If a class factory for the given ContractID is already registered, ensure
    // that we obtain a reference to it and we pass it as the inner factory.
    var originalFactory = null;
    if (this._componentRegistrar.isContractIDRegistered(aContractID)) {
      originalFactory = Components.manager.getClassObjectByContractID(
       aContractID, Ci.nsIFactory);
    }

    // Define a factory that creates a new stream converter.
    var streamConverterFactory = {
      createInstance: function(aOuter, aIid) {
        if (aOuter != null) {
          throw Cr.NS_ERROR_NO_AGGREGATION;
        }
        return new ArchiveStreamConverter(originalFactory).QueryInterface(aIid);
      },
      lockFactory: function(aLock) { }
    };

    // Register the factory for the given ContractID. Every factory registration
    // must have a different ClassID even if the component that implements the
    // ContractID is the same. A random ClassID is used at each startup, since
    // the registration is temporary.
    var classID = Cc["@mozilla.org/uuid-generator;1"].
     getService(Ci.nsIUUIDGenerator).generateUUID();
    this._componentRegistrar.registerFactory(classID,
     "Mozilla Archive Format Stream Converter", aContractID,
     streamConverterFactory);
  },

  _historyService: null,

  _mimeService: Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService),

  _categoryManager: Cc["@mozilla.org/categorymanager;1"].
   getService(Ci.nsICategoryManager),

  _componentRegistrar: Components.manager.
   QueryInterface(Ci.nsIComponentRegistrar),
}
