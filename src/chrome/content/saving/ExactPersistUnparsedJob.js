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
 * Manages the saving process of a single web page.
 *
 * This class derives from Job. See the Job documentation for details.
 *
 * @param aResource
 *        PersistResource object associated with the document or other resource
 *        type to be saved.
 */
function ExactPersistUnparsedJob(aEventListener, aResource, aIsPrivate) {
  Job.call(this, aEventListener);
  this.resource = aResource;
  this.isPrivate = aIsPrivate;
}

ExactPersistUnparsedJob.prototype = {
  __proto__: Job.prototype,

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIRequestObserver,
    Ci.nsIStreamListener,
    Ci.nsIInterfaceRequestor,
  ]),

  // nsIInterfaceRequestor
  getInterface: XPCOMUtils.generateQI([
    Ci.nsIProgressEventSink,
  ]),

  /**
   * PersistResource object associated with this persist job item.
   */
  resource: null,

  /**
   * Indicates whether a private browsing channel should be used when saving.
   */
  isPrivate: false,

  // Job
  _executeStart: function() {
    // If the download starts successfully, wait asynchronously for completion.
    this._expectAsyncCallback(function() {
      try {
        // Create the channel for the download. This operation may throw an
        // exception if a channel cannot be created for the specified URI.
        var channel = Cc["@mozilla.org/network/io-service;1"].
         getService(Ci.nsIIOService).newChannelFromURI(
         this.resource.originalUri);
        if ("nsIPrivateBrowsingChannel" in Ci &&
         channel instanceof Ci.nsIPrivateBrowsingChannel) {
          channel.setPrivate(this.isPrivate);
        }
        // Load the content from the cache if possible.
        channel.loadFlags |= Ci.nsIRequest.LOAD_FROM_CACHE;
        // Receive progress notifications through the nsIProgressEventSink
        // interface. For more information on this interface, see
        // <http://mxr.mozilla.org/mozilla-central/source/netwerk/base/public/nsIProgressEventSink.idl>
        // (retrieved 2009-12-23).
        channel.notificationCallbacks = this;
        // Start the download asynchronously. This operation may throw an
        // exception if the channel for the specified URI cannot be opened.
        channel.asyncOpen(this, null);
      } catch (e) {
        var result = (e instanceof Ci.nsIException) ? e.result :
         Cr.NS_ERROR_FAILURE;
        // Report unexpected errors, excluding expected error codes.
        if (result != Cr.NS_ERROR_NO_CONTENT) {
          this._reportDownloadFailure();
          this.resource.statusCode = result;
        }
        // Indicate that the file was not saved and the job is completed.
        this.resource.file = null;
        this._notifyCompletion();
      }
    }, this);
  },

  // Job
  _executeCancel: function(aReason) {
    // Cancel the request if the download has already started.
    if (this._request) {
      this._request.cancel(aReason);
    }
  },

  // nsIRequestObserver
  onStartRequest: function(aRequest, aContext) {
    // If the job has been canceled before the request started.
    if (this.isCompleted) {
      // Ensure that the request is canceled and exit.
      aRequest.cancel(Cr.NS_BINDING_ABORTED);
      return;
    }
    // Check if an HTTP request did not succeed, and an error page was
    // generated.
    var requestSucceeded = true;
    if (aRequest instanceof Ci.nsIHttpChannel) {
      try {
        requestSucceeded = aRequest.requestSucceeded;
      } catch (e) {
        // Accessing the requestSucceeded property may raise exceptions.
      }
    }
    if (!requestSucceeded) {
      // Ensure that the request is canceled and exit.
      aRequest.cancel(Cr.NS_ERROR_FILE_NOT_FOUND);
      return;
    }
    // Store a reference to the request to allow its cancellation.
    this._request = aRequest.QueryInterface(Ci.nsIChannel);
    // At this point, we can obtain the MIME media type for the resource and use
    // it to determine the correct extension for the local file name.
    var mediaType = null;
    try {
      mediaType = this._request.contentType;
    } catch (e) {
      // Accessing the contentType property may raise exceptions.
    }
    // If the server did not specify a media type, determine it from the URI.
    if (!mediaType) {
      try {
        mediaType = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService).
         getTypeFromURI(this.resource.originalUri);
      } catch (e) {
        // The MIME service may raise exceptions while determining the type.
      }
    }
    // Set the media type on the resource and determine the local file name. In
    // case the MIME type couldn't be determined, use a binary file type.
    this.resource.mimeType = mediaType || "application/octet-stream";
    // Store the charset information for the content, only if applicable.
    try {
      this.resource.charset = this._request.contentCharset;
    } catch (e) {
      // Accessing the contentCharset property may raise exceptions.
    }
    this._eventListener.folder.addUnique(this.resource);
  },

  // nsIRequestObserver
  onStopRequest: function(aRequest, aContext, aStatusCode) {
    this._handleAsyncCallback(function() {
      // If the download failed before completion
      if (!Components.isSuccessCode(aStatusCode)) {
        this._reportDownloadFailure();
        // Indicate that the file was not saved, and store the status code.
        this.resource.file = null;
        this.resource.statusCode = aStatusCode;
      } else {
        // Write the binary data to the local file.
        this.resource.writeToFile();
      }
      // Notify that the job is completed.
      this._notifyCompletion();
    }, this);
  },

  // nsIStreamListener
  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset,
   aCount) {
    // Ensure that the job hasn't been canceled meanwhile.
    if (this.isCompleted) {
      return;
    }
    // We have to use a scriptable stream to read from the provided stream.
    if (!this._inputStream) {
      // Create a new binary input stream if it doesn't exist already. Since
      // this is a wrapper on another stream, it doesn't require to be closed
      // explicitly, and the reference will be freed when this object is
      // garbage collected.
      this._inputStream = Cc["@mozilla.org/binaryinputstream;1"]
       .createInstance(Ci.nsIBinaryInputStream);
      this._inputStream.setInputStream(aInputStream);
    }
    // Add the binary data to the buffer in memory.
    this.resource.body += this._inputStream.readBytes(aCount);
  },

  // nsIProgressEventSink
  onProgress: function(aRequest, aContext, aProgress, aProgressMax) {
    // Propagate the event to our listener, while ensuring that the values are
    // within the allowed range, as aProgressMax in this notification can be -1
    // if the length of the content to be downloaded is unknown.
    var realProgressMax = (aProgressMax < aProgress) ? aProgress : aProgressMax;
    this._notifyJobProgressChange(null, aRequest, aProgress, realProgressMax,
     aProgress, realProgressMax);
  },

  // nsIProgressEventSink
  onStatus: function(aRequest, aContext, aStatus, aStatusArg) {
    // Propagate the event to our listener. Since the listener for downloads is
    // not designed to handle normal request progress notifications, which would
    // result in a message box to be displayed while the download is running,
    // events with success status codes are filtered out.
    if (!Components.isSuccessCode(aStatus)) {
      // Some success status codes in this context look like error codes, and
      // must be filtered out manually. For more information, see
      // <https://developer.mozilla.org/en/nsISocketTransport> (retrieved
      // 2009-12-23).
      if ([
       Ci.nsITransport.STATUS_READING,
       Ci.nsITransport.STATUS_WRITING,
       Ci.nsISocketTransport.STATUS_RESOLVING,
       Ci.nsISocketTransport.STATUS_RESOLVED,
       Ci.nsISocketTransport.STATUS_CONNECTED_TO,
       Ci.nsISocketTransport.STATUS_SENDING_TO,
       Ci.nsISocketTransport.STATUS_RECEIVING_FROM,
       Ci.nsISocketTransport.STATUS_CONNECTING_TO,
       Ci.nsISocketTransport.STATUS_WAITING_FOR,
      ].indexOf(aStatus) < 0) {
        this._eventListener.onStatusChange(null, aRequest, aStatus, aStatusArg);
      }
    }
  },

  /**
   * Reports to the Error Console the address of the file whose download failed.
   */
  _reportDownloadFailure: function() {
    // Report the failure to the Error Console as an information message.
    Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).
     logStringMessage(this.resource.originalUri.spec + " could not be saved.");
  },

  /**
   * nsIRequest for the current download, set while cancellation is possible.
   */
  _request: null,

  /**
   * Binary input stream created to read the data being downloaded.
   */
  _inputStream: null,
}
