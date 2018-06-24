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
 * Represents a saved page that can be converted from one format to another.
 */
function Candidate() {

}

Candidate.prototype = {
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIWebProgressListener,
    Ci.nsIWebProgressListener2,
    Ci.nsISupportsWeakReference,
  ]),

  /**
   * String representing the source format of the file to be converted.
   *
   * Possible values:
   *   "complete"   - Complete web page, only if a support folder is present.
   *   "plain"      - Any web page, with or without a support folder.
   *   "mhtml"      - MHTML archive.
   *   "maff"       - MAFF archive.
   */
  sourceFormat: "complete",

  /**
   * String representing the destination format of the converted file.
   *
   * Possible values:
   *   "maff"       - MAFF archive.
   *   "mhtml"      - MHTML archive.
   *   "complete"   - Plain web page. A support folder is created if required.
   */
  destFormat: "maff",

  /**
   * String representing the relative path, with regard to the root search
   * location, of the folder where the candidate is located.
   */
  relativePath: "",

  /**
   * CandidateLocation object for the main file.
   */
  location: null,

  /**
   * CandidateLocation object for the support folder, if applicable.
   */
  dataFolderLocation: null,

  /**
   * True if one of the destination files or support folders already exists.
   */
  obstructed: false,

  /**
   * Identifier of the candidate in the candidates data source.
   */
  internalIndex: 0,

  /**
   * Sets the location of the source, destination and bin files based on the
   * given parameters and the current source and destination file formats.
   *
   * @param aParentLocation
   *        CandidateLocation object pointing to the parent folder that contains
   *        the candidate.
   * @param aLeafName
   *        File name of the candidate.
   * @param aDataFolderLeafName
   *        Name of the folder containing the support files required by the main
   *        document. If unspecified, no support folder is present.
   */
  setLocation: function(aParentLocation, aLeafName, aDataFolderLeafName) {
    // Set the initial location, relevant for the source and bin paths.
    this.relativePath = aParentLocation.relativePath;
    this.location = aParentLocation.getSubLocation(aLeafName);

    // Set the location of the source support folder, if present.
    if (aDataFolderLeafName) {
      this.dataFolderLocation = aParentLocation.getSubLocation(
       aDataFolderLeafName);
      this.dataFolderLocation.dest = null;
    }

    // Determine the correct extension for the destination file.
    var destExtension;
    switch (this.destFormat) {
      case "mhtml":
        destExtension = Prefs.saveUseMhtmlExtension ? "mhtml" : "mht";
        break;
      case "maff":
        destExtension = "maff";
        break;
      default:
        switch (this.sourceFormat) {
          case "mhtml":
          case "maff":
            // TODO: Open the source archive and determine the extension.
            destExtension = "html";
            break;
          default:
            throw "Unexpected combination of file formats for conversion";
        }
    }

    // Determine the base name from the provided source leaf name.
    var leafNameWithoutExtension = aLeafName.replace(/\.[^.]*$/, "");

    // Modify the destination location with the correct file name.
    var destLeafName = leafNameWithoutExtension + "." + destExtension;
    this.location.dest = aParentLocation.getSubLocation(destLeafName).dest;

    // If the destination can be a complete web page with a support folder
    if (this.destFormat == "complete") {
      // The source data folder location should not be present.
      if (this.dataFolderLocation) {
        throw "Unexpected specified for archive source file";
      }
      // Determine the name of the destination support folder for data files.
      var destFolderName = Cc["@mozilla.org/intl/stringbundle;1"].
       getService(Ci.nsIStringBundleService).
       createBundle("chrome://global/locale/contentAreaCommands.properties").
       formatStringFromName("filesFolder", [leafNameWithoutExtension], 1);
      // Set the data folder location, where only the destination is relevant.
      this.dataFolderLocation = aParentLocation.getSubLocation(destFolderName);
      this.dataFolderLocation.source = null;
      this.dataFolderLocation.bin = null;
    }
  },

  /**
   * Sets the "obstructed" property based on the existence of the destination or
   * bin files.
   */
  checkObstructed: function() {
    // Assume that the destination is obstructed.
    this.obstructed = true;
    // Check if the destination file already exists.
    if (this.location.dest.exists()) {
      return;
    }
    // Check if the bin file already exists.
    if (this.location.bin && this.location.bin.exists()) {
      return;
    }
    // If no support folder for data files is present, exit now.
    if (!this.dataFolderLocation) {
      this.obstructed = false;
      return
    }
    // Check if the destination support folder already exists.
    if (this.dataFolderLocation.dest && this.dataFolderLocation.dest.exists()) {
      return;
    }
    // Check if the bin support folder already exists.
    if (this.dataFolderLocation.bin && this.dataFolderLocation.bin.exists()) {
      return;
    }
    // The destination files are not already present.
    this.obstructed = false;
  },

  /**
   * DOM window hosting the save infrastructure required for the conversion.
   */
  conversionWindow: null,

  /**
   * Reference to the "iframe" element to be used for the conversion.
   */
  conversionFrame: null,

  /**
   * Starts the actual conversion process. When the process is finished, the
   * given function is called, passing true if the operation succeeded, or false
   * if the operation failed.
   */
  convert: function(aCompleteFn) {
    // Store a reference to the function to be called when finished.
    this._onComplete = aCompleteFn;
    try {
      // Check the destination location for obstruction before starting.
      this._checkDestination();
      // Register the load listeners.
      this._addLoadListeners();
      // Load the URL associated with the source file in the conversion frame.
      var sourceUrl = Cc["@mozilla.org/network/io-service;1"].
       getService(Ci.nsIIOService).newFileURI(this.location.source);
      this.conversionFrame.webNavigation.loadURI(sourceUrl.spec, 0, null, null,
       null);
    } catch (e) {
      // Report the error and notify the caller.
      this._onFailure(e);
    }
  },

  /**
   * Cancels the currently running conversion process, if any. The finish
   * callback function will not be called in this case.
   */
  cancelConversion: function() {
    // Remember that the conversion was canceled.
    this._canceled = true;
    // Ensure that all the event listeners are removed immediately.
    this._removeLoadListeners();
  },

  // nsIWebProgressListener
  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    // Remember if at least one failure notification was received while loading
    // or saving. This will cause the load or save to fail when finished.
    if (aStatus != Cr.NS_OK) {
      this._listeningException = new Components.Exception("Operation failed",
       aStatus);
    }
    // Detect when the current load or save operation is finished.
    if ((aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) &&
     (aStateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK)) {
      // Notify the appropriate function based on the current state.
      if (this._isListeningForLoad) {
        // Notify that the network activity for the current load stopped.
        this._loadNetworkDone = true;
        this._onLoadCompleted();
      } else if (this._isListeningForSave) {
        // Notify that the save operation completed.
        this._onSaveCompleted();
      }
    }
  },

  // nsIWebProgressListener
  onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) { },

  // nsIWebProgressListener
  onLocationChange: function(aWebProgress, aRequest, aLocation) { },

  // nsIWebProgressListener
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) { },

  // nsIWebProgressListener
  onSecurityChange: function(aWebProgress, aRequest, aState) { },

  // nsIWebProgressListener2
  onProgressChange64: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) { },

  // nsIWebProgressListener2
  onRefreshAttempted: function(aWebProgress, aRefreshURI, aMillis,
   aSameURI) { },

  /**
   * Reference to the callback function to be called on completion.
   */
  _onComplete: null,

  /**
   * nsIWebProgress interface associated with the conversion frame.
   */
  _webProgress: null,

  /**
   * True while the load operation is in progress.
   */
  _isListeningForLoad: false,

  /**
   * Dynamically-generated listener function for the "load" event.
   */
  _loadListener: null,

  /**
   * True if the "load" event was fired for the conversion frame.
   */
  _loadContentDone: false,

  /**
   * True if the network activity for the current load stopped.
   */
  _loadNetworkDone: false,

  /**
   * True while the save operation is in progress.
   */
  _isListeningForSave: false,

  /**
   * Excpetion object representing an error that occurred during the load or
   * save operations, or null if no error occurred.
   */
  _listeningException: null,

  /**
   * True if the operation was explicitly canceled.
   */
  _canceled: false,

  /**
   * Registers the required load listeners.
   */
  _addLoadListeners: function() {
    // Get a reference to the interface to add and remove web progress
    // listeners.
    this._webProgress = this.conversionFrame.docShell.
     QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebProgress);
    // Build the event listener for the "load" event on the frame.
    var self = this;
    this._loadListener = function(aEvent) {
      // If the current "load" event is for a subframe, ignore it.
      if (aEvent.target != self.conversionFrame.contentDocument) {
        return;
      }
      // Notify only if appropriate based on the current state.
      if (self._isListeningForLoad) {
        // Notify that the "load" event was fired.
        self._loadContentDone = true;
        self._onLoadCompleted();
      }
    };
    // Register the web progress listener defined in this object.
    this._webProgress.addProgressListener(this,
     Ci.nsIWebProgress.NOTIFY_STATE_NETWORK);
    // Register the load event listener defined in this object.
    this.conversionFrame.addEventListener("load", this._loadListener, true);
    // Set the state variables appropriately.
    this._listeningException = null;
    this._isListeningForLoad = true;
  },

  /**
   * Removes the load listeners registered previously, if necessary.
   */
  _removeLoadListeners: function() {
    // Check the current state before continuing.
    if (!this._isListeningForLoad) {
      return;
    }
    // Remove the web progress listener defined in this object.
    this._webProgress.removeProgressListener(this);
    // Remove the load event listener defined in this object.
    this.conversionFrame.removeEventListener("load", this._loadListener, true);
    // Set the state variables appropriately.
    this._isListeningForLoad = false;
  },

  /**
   * Called when the source page has been loaded.
   */
  _onLoadCompleted: function() {
    // Wait for both triggering conditions be true.
    if (!this._loadNetworkDone || !this._loadContentDone) {
      return;
    }
    try {
      // Remove the load listeners first.
      this._removeLoadListeners();

      // Report any error that occurred while loading, and stop the operation.
      if (this._listeningException) {
        throw this._listeningException;
      }

      // We must wait for all events to be processed before continuing,
      // otherwise the conversion of some pages might fail because some elements
      // in the page are not available for saving, or the current load can
      // interfere with subsequent loads in the same frame.
      this._waitForAllEventsStart = Date.now();
      this._waitForAllEvents();
    } catch (e) {
      // Report the error and notify the caller.
      this._onFailure(e);
    }
  },

  /**
   * Point in time when the current wait for all events started.
   */
  _waitForAllEventsStart: null,

  /**
   * Wait for pending events to be dispatched before continuing.
   */
  _waitForAllEvents: function() {
    if (Date.now() > this._waitForAllEventsStart + 5000) {
      // On timeout, continue even though not all events have been processed.
      this._reportConversionError("Unable to process all events generated by" +
       " the source page in a timely manner. Your computer might be busy." +
       " The conversion operation will be tried anyway.");
      this._afterLoadCompleted();
      return;
    }

    // If there are pending events, process them and retry later.
    if (this._mainThread.hasPendingEvents())
    {
      var self = this;
      this._mainThread.dispatch(
       { run: function() self._waitForAllEvents.apply(self) },
       Ci.nsIThread.DISPATCH_NORMAL);
      return;
    }

    // All events have been processed, end waiting.
    this._afterLoadCompleted();
  },

  /**
   * Called after the source page has been loaded and events processed.
   */
  _afterLoadCompleted: function() {
    try {
      // Check if the operation was canceled while processing the events.
      if (this._canceled) {
        return;
      }

      // Check the destination location for obstruction again.
      this._checkDestination();
      // Ensure that the destination folder exists, and create it if required.
      if (!this.location.dest.parent.exists()) {
        this.location.dest.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
      }

      // Start the save operation.
      this._startSaving();
    } catch (e) {
      // Report the error and notify the caller.
      this._onFailure(e);
    }
  },

  /**
   * Starts the save operation, which is the second step of the conversion.
   */
  _startSaving: function() {
    // Set the state variables appropriately before starting the save operation.
    this._listeningException = null;
    this._isListeningForSave = true;
    try {
      let document = this.conversionFrame.contentDocument;

      let persist;
      if (this.destFormat == "mhtml") {
        persist = new MafArchivePersist(null, "TypeMHTML");
        persist.saveWithNotLoadedResources = true;
      } else if (this.destFormat == "maff") {
        persist = new MafArchivePersist(null, "TypeMAFF");
        persist.saveWithNotLoadedResources = true;
      } else if (document.contentType == "text/html" ||
       document.contentType == "application/xhtml+xml") {
        // The ExactPersist component can also save XML and SVG, but not as
        // accurately as the browser's standard save system.
        persist = new ExactPersist();
        persist.saveWithMedia = true;
        persist.saveWithNotLoadedResources = true;
      } else {
        persist = Cc["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
         .createInstance(Ci.nsIWebBrowserPersist);
      }
      persist.progressListener = this;
      persist.persistFlags =
       Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
       Ci.nsIWebBrowserPersist.PERSIST_FLAGS_FORCE_ALLOW_COOKIES |
       Ci.nsIWebBrowserPersist.PERSIST_FLAGS_FROM_CACHE |
       Ci.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
      persist.saveDocument(
        document,
        NetUtil.newURI(this.location.dest),
        this.dataFolderLocation && this.dataFolderLocation.dest,
        null,
        Ci.nsIWebBrowserPersist.ENCODE_FLAGS_ENCODE_BASIC_ENTITIES,
        80
      );
    } catch (e) {
      // If the operation failed before starting, reset the listening state.
      this._isListeningForSave = false;
      throw e;
    }
  },

  /**
   * Called when the source page has been saved.
   */
  _onSaveCompleted: function() {
    try {
      // Indicate that the save notification has been processed.
      this._isListeningForSave = false;

      // Check if the operation was canceled while saving.
      if (this._canceled) {
        return;
      }

      // Report any error that occurred while saving, and stop the operation.
      if (this._listeningException) {
        throw this._listeningException;
      }

      // Change the last modified time of the destination to match the source.
      this.location.dest.lastModifiedTime =
       this.location.source.lastModifiedTime;

      // Conversion completed successfully, move the source to the bin folder.
      this._moveToBin();
    } catch (e) {
      // Report the error and notify the caller, then exit.
      this._onFailure(e);
      return;
    }
    // Report that the conversion was successful.
    this._onComplete(true);
  },

  /**
   * Throws an exception if the destination location is obstructed.
   */
  _checkDestination: function() {
    // Ensure that the destination file does not exist.
    if (this.location.dest.exists()) {
      throw new Components.Exception(
        "The destination location is unexpectedly obstructed.");
    }
    // Ensure that the destination support folder does not exist.
    if (this.dataFolderLocation && this.dataFolderLocation.dest &&
     this.location.dest.exists()) {
      throw new Components.Exception(
        "The destination location is unexpectedly obstructed.");
    }
  },

  /**
   * Moves the source file and support folder to the bin folder, if required.
   */
  _moveToBin: function() {
    // Move the source file to the bin folder.
    if (this.location.bin) {
      // Ensure that the destination does not exist.
      if (this.location.bin.exists()) {
        throw new Components.Exception(
          "The bin location is unexpectedly obstructed.");
      }
      // Move the file as required.
      this.location.source.moveTo(this.location.bin.parent,
       this.location.bin.leafName);
    }
    // Move the source support folder, if present, to the bin folder.
    if (this.dataFolderLocation) {
      if (this.dataFolderLocation.source && this.dataFolderLocation.bin) {
        // Ensure that the destination does not exist.
        if (this.dataFolderLocation.bin.exists()) {
          throw new Components.Exception(
            "The bin location is unexpectedly obstructed.");
        }
        // Move the folder as required.
        this.dataFolderLocation.source.moveTo(
         this.dataFolderLocation.bin.parent,
         this.dataFolderLocation.bin.leafName);
      }
    }
  },

  /**
   * Reports the given exception that occurred during the conversion of this
   * candidate, and notifies the appropriate object that the operation failed.
   */
  _onFailure: function(aException) {
    try {
      // Clean up all the possible registered listeners.
      this._removeLoadListeners();
    } catch (e) {
      // Ignore errors during the cleanup phase.
      Cu.reportError(e);
    }
    // Report the error message.
    this._reportConversionError(aException);
    // Report that the conversion of this candidate failed.
    this._onComplete(false);
  },

  /**
   * Reports the given exception that occurred during the conversion of this
   * candidate, providing additional information about the error.
   */
  _reportConversionError: function(aException) {
    try {
      // Determine the first part of the message for the Error Console.
      var messagePrefix = "The following error occurred while converting\n" +
       this.location.source.path + ":\n\n";
      // Report the complete message appropriately.
      if (aException instanceof Ci.nsIXPCException) {
        Cu.reportError(new Components.Exception(messagePrefix +
         aException.message, aException.result, aException.location,
         aException.data, aException.inner));
      } else {
        Cu.reportError(messagePrefix + aException);
      }
    } catch (e) {
      // In case of errors, report only the original exception.
      Cu.reportError(aException);
    }
  },

  _mainThread: Cc["@mozilla.org/thread-manager;1"].
   getService(Ci.nsIThreadManager).mainThread,
}
