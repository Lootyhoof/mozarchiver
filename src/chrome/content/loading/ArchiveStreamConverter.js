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
 * Portions created by the Initial Developer are Copyright (C) 2010
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
 * This XPCOM component is registered for all the ContractIDs associated with
 * the stream converters for the MIME types that are handled as web archives.
 *
 * This converter consumes the entire archive and extracts it asynchronously,
 * then outputs the data from the archive. The converter outputs a special
 * internal MIME type that indicates that the load will be handled by this
 * extension's document loader factory.
 *
 * @param aInnerFactory
 *        If the converter detects that it was not invoked for archive loading,
 *        and this parameter is not null, it will use this class factory to
 *        create an object that will handle all the calls and interface queries.
 */
function ArchiveStreamConverter(aInnerFactory) {
  this._innerFactory = aInnerFactory;
}

ArchiveStreamConverter.prototype = {
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIRequestObserver,
    Ci.nsIStreamListener,
    Ci.nsIStreamConverter,
  ]),

  // nsIRequestObserver
  onStartRequest: function(aRequest, aContext) {
    // Find an existing archive object associated with the URI we are accessing.
    var originalChannel = aRequest.QueryInterface(Ci.nsIChannel);
    if (ArchiveCache.pageFromUri(originalChannel.URI) ||
     ArchiveCache.archiveFromUri(originalChannel.URI) ||
     originalChannel.URI.schemeIs("file")) {
      // If a cached archive is available, or we are accessing a local file, do
      // not save the new archive locally from the original location.
      this._resource = null;
      return;
    }

    // Prepare a PersistResource object associated with the channel.
    this._resource = new PersistResource();
    this._resource.referenceUri = originalChannel.URI;
    this._resource.originalUri = originalChannel.URI;
    this._resource.mimeType = originalChannel.contentType;

    // Determine the name of the directory where the archive will be saved.
    var dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    dir.initWithPath(Prefs.tempFolder);
    dir.append(new Date().valueOf() + "_" + Math.floor(Math.random() * 1000));

    // Assign a local file name to the resource object.
    new PersistFolder(dir).addUnique(this._resource);
  },

  // nsIRequestObserver
  onStopRequest: function(aRequest, aContext, aStatusCode) {
    // Exit now if the download failed or was canceled before completion.
    if (!Components.isSuccessCode(aStatusCode)) {
      return;
    }

    // Access the DocShell through the notificationCallbacks property.
    var originalChannel = aRequest.QueryInterface(Ci.nsIChannel);
    var requestContainer = originalChannel.notificationCallbacks;

    // Determine the local URL of the archive, or null if the archive is cached.
    var localUri = null;
    if (this._resource) {
      // We downloaded the archive form its original location.
      this._resource.writeToFile();
      localUri = this._resource.fileUrl;
    } else if (originalChannel.URI.schemeIs("file")) {
      // We will access the archive locally, if it is not in the cache.
      localUri = originalChannel.URI.QueryInterface(Ci.nsIFileURL);
    }

    // Load the archive, and retrieve an indication of whether the URI of the
    // request should be changed to refer to a specific page in a multi-page
    // archive. The called function may also start loading other pages in tabs.
    var betterUri = ArchiveLoader.load(originalChannel.URI, localUri,
     originalChannel.contentType, requestContainer);

    if (betterUri) {
      // If there is a better URI for the specific page in the archive, redirect
      // the document being loaded to the new URI by replacing the original
      // channel with another one prepared with the new URI. We don't need to
      // access the contents of the remote resource anymore, but we have to open
      // the channel anyway in order for the next phase of the document
      // dispatching process to work correctly.
      var betterChannel = Cc['@mozilla.org/network/io-service;1']
       .getService(Ci.nsIIOService).newChannelFromURI(betterUri);
      betterChannel.loadFlags = originalChannel.loadFlags;
      betterChannel.loadFlags |= Ci.nsIChannel.LOAD_REPLACE;
      betterChannel.loadFlags |= Ci.nsIChannel.LOAD_BACKGROUND;
      betterChannel.open();
      betterChannel.cancel(Cr.NS_OK);
      // Replace the original channel with the new one. The new URI takes the
      // place of the original one in the browser history, and this operation
      // prevents subsequent refreshes from opening the other archived pages
      // again in new tabs. This method also works inside frames.
      originalChannel = betterChannel;
    }

    // At this point, the contents of the main page should be dispatched to the
    // provided listener, that would restart the document dispatch process.
    // Since we know that the content will be handled by our document loader
    // factory, that does not use the incoming data, just set the content type
    // on the channel and trigger the load, without sending any actual data.
    originalChannel.contentType = "*/preprocessed-web-archive";
    this._targetListener.onStartRequest(originalChannel, aContext);
    this._targetListener.onStopRequest(originalChannel, aContext, Cr.NS_OK);
  },

  // nsIStreamListener
  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset,
   aCount) {
    // We have to use a scriptable stream to read from the provided stream.
    if (!this._inputStream) {
      // Create a new binary input stream if it doesn't exist already. Since
      // this is a wrapper on another stream, it doesn't require to be closed
      // explicitly, and the reference will be freed when this object is garbage
      // collected.
      this._inputStream = Cc["@mozilla.org/binaryinputstream;1"]
       .createInstance(Ci.nsIBinaryInputStream);
      this._inputStream.setInputStream(aInputStream);
    }
    // If the archive is already available locally, ignore the received data.
    if (!this._resource) {
      // We have to read the data even if we don't use it.
      this._inputStream.readBytes(aCount);
    } else {
      // Add the binary data to the buffer in memory.
      this._resource.body += this._inputStream.readBytes(aCount);
    }
  },

  // nsIStreamConverter
  asyncConvertData: function(aFromType, aToType, aListener, aCtxt) {
    // Execute a series of tests to determine if this document is being loaded
    // by a DocShell, and in that case accept to handle the document loading.
    // For mail messages, apply MHTML decoding only if the message comes from
    // one of the supported sources.
    if (aCtxt instanceof Ci.nsIChannel) {
      if (aCtxt.notificationCallbacks instanceof Ci.nsIDocShell) {
        if (aFromType != "message/rfc822" || this._isMhtmlChannel(aCtxt)) {
          // Refuse to open remote archives if the browser is operating in
          // Private Browsing Mode.
          if (this._privateBrowsingService && this._privateBrowsingService.
           privateBrowsingEnabled && !aCtxt.URI.schemeIs("file")) {
            throw new Components.Exception(
             "Remote web archives cannot be displayed in Private Browsing Mode",
             Cr.NS_ERROR_NOT_AVAILABLE);
          }
          // Handle the archive loading and conversion.
          this._targetListener = aListener;
          return;
        }
      }
    }

    // If the component is not being used for document loading, then the request
    // can be satisfied only if a different original implementation exists.
    if (!this._innerFactory) {
      throw new Components.Exception(
       "Asynchronous conversion is available for document loading only",
       Cr.NS_ERROR_NOT_IMPLEMENTED);
    }

    // We must forward all the subsequent calls to the inner object.
    this._transformIntoInnerObject().asyncConvertData.apply(this, arguments);
  },

  // nsIStreamConverter
  convert: function(aFromStream, aFromType, aToType, aCtxt) {
    throw new Components.Exception("Synchronous conversion not implemented",
     Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  /**
   * Returns true if the given channel is associated with a MIME message that
   * should be interpreted as MHTML, or false if the source should be handled as
   * a normal mail message.
   */
  _isMhtmlChannel: function(aChannel) {
    // Apply MHTML decoding only if the message comes from one of the supported
    // protocols. This explicitly excludes mail messages coming from newsgroups
    // through the NNTP protocol.
    var sourceUri = aChannel.URI;
    if (!sourceUri.schemeIs("file") && !sourceUri.schemeIs("http") &&
     !sourceUri.schemeIs("https") && !sourceUri.schemeIs("ftp")) {
      return false;
    }
    // Always check the file extension when opening "message/rfc822" files.
    var fileName = sourceUri.QueryInterface(Ci.nsIURL).fileName;
    return /\.(mht|mhtml)$/i.test(fileName);
  },

  /**
   * Overrides all the functions of this object with references to the functions
   * of a new stream converter created using the inner factory. After this
   * method has been called, it will not be possible to call the stream
   * converter functions defined in this object's prototype.
   */
  _transformIntoInnerObject: function() {
    // Create an instance of the class originally registered for this MIME type.
    var originalConverter = this._innerFactory.createInstance(null,
     Ci.nsIStreamConverter);

    // This function creates a forwarding function for originalConverter.
    function makeForwardingFunction(functionName) {
      return function() {
        return originalConverter[functionName].apply(originalConverter,
         arguments);
      }
    }

    // Forward all the functions indiscriminately, including QueryInterface.
    for (var propertyName in originalConverter) {
      if (typeof originalConverter[propertyName] == "function") {
        this[propertyName] = makeForwardingFunction(propertyName);
      }
    }

    // Return a reference to the inner object.
    return originalConverter;
  },

  /**
   * Optional object of type nsIFactory that can be used in the case where the
   * ContractID for the MIME type was already registered, in order to
   * transparently forward all the requests to the original implementation.
   */
  _innerFactory: null,

  /**
   * Output stream listener provided for asynchronous data conversion.
   */
  _targetListener: null,

  /**
   * PersistResource object associated with the file being downloaded, or null
   * if the requested archive is already available locally.
   */
  _resource: null,

  /**
   * Binary input stream created to read the data being downloaded.
   */
  _inputStream: null,

  _privateBrowsingService: ("@mozilla.org/privatebrowsing;1" in Cc) &&
   Cc["@mozilla.org/privatebrowsing;1"]
   .getService(Ci.nsIPrivateBrowsingService),
};
