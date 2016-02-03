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
 * This object implements nsIWebBrowserPersist, and is used for integrating the
 * Save Complete extension in the normal save process.
 */
function SaveCompletePersist() {
  // Initialize member variables explicitly.
  this.originalUriByPath = {};
}

SaveCompletePersist.prototype = {
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsICancelable,
    Ci.nsIWebBrowserPersist,
  ]),

  // nsICancelable
  cancel: function(aReason) {
    // Update the state of this object first, then send the notifications.
    this.result = aReason;
    this._onComplete();
    // If the save operation started successfully, the worker object will now
    // handle the cancel operation and notify the progress listener.
    if (this._saver) {
      this._saver.cancel(aReason);
    }
  },

  // nsIWebBrowserPersist
  persistFlags: 0,

  // nsIWebBrowserPersist
  currentState: Ci.nsIWebBrowserPersist.PERSIST_STATE_READY,

  // nsIWebBrowserPersist
  result: Cr.NS_OK,

  // nsIWebBrowserPersist
  progressListener: null,

  // nsIWebBrowserPersist
  saveURI: function(aURI, aCacheKey, aReferrer, aPostData, aExtraHeaders,
   aFile, aPrivacyContext) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIWebBrowserPersist
  saveChannel: function(aChannel, aFile) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIWebBrowserPersist
  saveDocument: function(aDocument, aFile, aDataPath, aOutputContentType,
   aEncodingFlags, aWrapColumn) {
    // Pass exceptions to the progress listener.
    try {
      // Set the object state to "operation in progress". The progress listener
      // is not notified that the operation started, since this is done later by
      // the worker object. In rare cases, this may lead to a finish
      // notification being sent without the corresponding start notification,
      // but this is not known to cause any problem.
      this.currentState = Ci.nsIWebBrowserPersist.PERSIST_STATE_SAVING;

      // Find the path of the file to save to.
      var fileObject = aFile.QueryInterface(Ci.nsIFileURL).file;

      // Store the URL of the document being saved for reference.
      this._saveUrl = aDocument.documentURIObject.clone();

      // Save the selected page to disk.
      var thisObject = this;
      var scOptions = {
        rewriteLinks: true,
        saveObjects: this.saveWithMedia,
        saveIframes: true,
        callback: function(aSaver, aResultCode, aResultObject) {
          try {
            // If the operation was canceled, update the result object to
            // reflect this condition, since Save Complete only provides the
            // NS_ERROR_FAILURE result code.
            if (thisObject.result == Cr.NS_BINDING_ABORTED) {
              aResultObject.result = Cr.NS_BINDING_ABORTED;
            } else {
              aResultObject.result = aResultCode;
            }
            // Report errors to the user through the progress listener, and log
            // both errors and warnings to the error console.
            thisObject._reportSaveCompleteErrors(aResultObject);
            // Update the state of this object. The progress listener will be
            // notified later by the worker object itself.
            thisObject.result = aResultObject.result;
            thisObject._onComplete();
          } catch (e) {
            // Ignore any error during the error reporting phase.
            Cu.reportError(e);
          }
        },
        progressListener: this.progressListener,
      };

      // When saving a page that was extracted from an archive, use the
      // information from the original archive to save the page correctly.
      var originalPage = ArchiveCache.pageFromUri(this._saveUrl);
      if (originalPage) {
        // Preserve the original URL the page was saved from, if present.
        if (originalPage.originalUrl) {
          scOptions.originalUrl = originalPage.originalUrl;
        }
        // Save the extracted or decoded version of the page. If this is not
        // done, the archive itself would be saved, instead of its contents.
        if (originalPage.tempUri) {
          scOptions.actualSaveUrl = originalPage.tempUri.spec;
        } else if (originalPage.directArchiveUri) {
          scOptions.actualSaveUrl = originalPage.directArchiveUri.spec;
        }
      }

      // Construct the integrated Save Complete object and start saving.
      var scFileSaver = new
       MafSaveComplete.scPageSaver.scDefaultFileSaver(fileObject, aDataPath);
      // If the files will be stored in a compatible MHTML file
      if (this.saveWithContentLocation) {
        // Modify the default file saver to create a map of the original URIs.
        var originalUriByPath = this.originalUriByPath;
        var _documentLocalFile = scFileSaver.documentLocalFile;
        scFileSaver.documentLocalFile = function(aUri) {
          // Call the original function.
          var file = _documentLocalFile.call(scFileSaver, aUri);
          // Store the original URI before returning the file object.
          originalUriByPath[file.path] = aUri.uri;
          return file;
        };
        // Modify the default file saver to replace URIs in source files with
        // their complete version that will appear in the "Content-Location"
        // headers of the MHTML file.
        var _documentPath = scFileSaver.documentPath;
        scFileSaver.documentPath = function(aUri, aRelativeURI) {
          // Call the original function to update the state of the object.
          _documentPath.call(scFileSaver, aUri, aRelativeURI);
          // Return the complete original URI instead of the local relative
          // path.
          return aUri.uri.spec;
        };
      }
      // Continue with the normal save process using the Save Complete objects.
      var scFileProvider = new
       MafSaveComplete.scPageSaver.scDefaultFileProvider();
      var scSaver = new MafSaveComplete.scPageSaver(aDocument, scFileSaver,
       scFileProvider, scOptions);
      scSaver.run();
      // If the "run" method did not raise an exception, store a reference to
      // the worker object to allow canceling and to indicate that the worker
      // object will notify the listener when the operation is finished.
      this._saver = scSaver;
    } catch(e) {
      Cu.reportError(e);
      // Preserve the result code of XPCOM exceptions.
      if (e instanceof Ci.nsIXPCException) {
        this.result = e.result;
      } else {
        this.result = Cr.NS_ERROR_FAILURE;
      }
      // Report that the download is finished to the listener.
      this._onComplete();
    }
  },

  // nsIWebBrowserPersist
  cancelSave: function() {
    this.cancel(Cr.NS_BINDING_ABORTED);
  },

  /**
   * If set to true, objects and media files will be included when saving.
   */
  saveWithMedia: false,

  /**
   * If set to true, the page will be saved for inclusion in an MHTML file.
   */
  saveWithContentLocation: false,

  /**
   * Associates the local path of each persisted file with its original URL.
   */
  originalUriByPath: {},

  _onComplete: function() {
    // Never report the finished condition more than once.
    if (this.currentState != Ci.nsIWebBrowserPersist.PERSIST_STATE_FINISHED) {
      // Operation completed.
      this.currentState = Ci.nsIWebBrowserPersist.PERSIST_STATE_FINISHED;
      // Signal success or failure in the archiving process, but only if the
      // task is not delegated to the worker object.
      if (this.progressListener && !this._saver) {
        this.progressListener.onStateChange(null, null,
         Ci.nsIWebProgressListener.STATE_STOP |
         Ci.nsIWebProgressListener.STATE_IS_NETWORK, this.result);
      }
    }
  },

  /**
   * Reports Save Complete results to the user and to the Error Console.
   *
   * @param aResultObject.nsresult
   *        Final result code for the operation. If this code is NS_OK, usually
   *        no errors are present, but there may be some warnings.
   * @param aResultObject.warnings
   *        Optional array of strings with the warnings to be reported. Warnings
   *        are only reported to the Error Console.
   * @param aResultObject.errors
   *        Optional array of strings with the errors to be reported.
   *        If present, the progress listener will be notified.
   */
  _reportSaveCompleteErrors: function(aResultObject) {
    // Report error and warning messages, if any, to the Error Console.
    this._reportToConsole(aResultObject.errors, true);
    this._reportToConsole(aResultObject.warnings, false);
    // If the download failed for any reason except explicit canceling
    if (this.progressListener && aResultObject.result != Cr.NS_OK &&
     aResultObject.result != Cr.NS_BINDING_ABORTED) {
      // Report the error condition to the progress listener.
      var messageText = this._formattedStr("savecomplete.status.errors.msg",
       [this._saveUrl.spec]) + "\n\n" +
       this._str("savecomplete.status.savesystemtip.msg");
      this.progressListener.onStatusChange(null, null, aResultObject.result,
       messageText);
    }
  },

  /**
   * Reports Save Complete errors or warnings to the Error Console.
   *
   * @param aMessageArray
   *        Array of strings to be reported. All the strings will be reported as
   *        a single message. If not provided or empty, no message will be
   *        reported.
   * @param aIsError
   *        Specify true if the messages are fatal errors, or false if they
   *        should reported as warnings.
   */
  _reportToConsole: function(aMessageArray, aIsError) {
    // Check if no messages are available.
    if (!aMessageArray || !aMessageArray.length) {
      return;
    }

    // Build the text of the single message.
    var allMessages = Array.join(aMessageArray, "\n");
    var stringId = (aIsError ? "savecomplete.console.errors.text" :
     "savecomplete.console.warnings.text");
    var text = this._formattedStr(stringId, [this._saveUrl.spec, allMessages]);

    // Determine the error severity.
    var flags = (aIsError ? Ci.nsIScriptError.errorFlag :
     Ci.nsIScriptError.warningFlag);

    // Create a detailed script error object for the Error Console. For
    // essential nsIScriptError documentation, see
    // <http://www.xulplanet.com/references/xpcomref/ifaces/nsIScriptError.html>
    // (retrieved 2009-04-08). The error category is the same used in the
    // Mozilla source file "dom/base/nsJSEnvironment.cpp".
    var scriptError = Cc["@mozilla.org/scripterror;1"].
     createInstance(Ci.nsIScriptError);
    scriptError.init(text, null, null, 0, 0, flags, "chrome javascript");

    // Report the error or warning to the Error Console.
    Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).
     logMessage(scriptError);
  },

  /**
   * Returns the string whose key is specified from the object's string bundle.
   */
  _str: function(aKey) {
    return this._saveCompletePersistStrBundle.GetStringFromName(aKey);
  },

  /**
   * Returns the string whose key is specified from the object's string bundle,
   * populating it with the arguments in the given array.
   */
  _formattedStr: function(aKey, aArgs) {
    return this._saveCompletePersistStrBundle.formatStringFromName(aKey,
     aArgs, aArgs.length);
  },

  _saveCompletePersistStrBundle: Cc["@mozilla.org/intl/stringbundle;1"]
    .getService(Ci.nsIStringBundleService).createBundle(
    "chrome://mza/locale/saveCompletePersistObject.properties"),

  _saver: null,
  _saveUrl: null,
}
