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
 * Helper object for MafWebProgressListener implementation.
 */
var EmptyWebProgressListener = {
  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) { },
  onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) { },
  onLocationChange: function(aWebProgress, aRequest, aLocation) { },
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) { },
  onSecurityChange: function(aWebProgress, aRequest, aState) { },
  onProgressChange64: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) { },
  onRefreshAttempted: function(aWebProgress, aRefreshURI, aMillis,
   aSameURI) { },

};

/**
 * This object implements nsIWebProgressListener2 by forwarding all calls to a
 * wrapped object. In addition, the interesting state changes are notified to
 * the specified MAF event listener.
 *
 * @param aMafEventListener
 *        Object whose onDownloadComplete, onDownloadFailed or
 *        onDownloadProgressChange methods will be called.
 * @param wrappedObject
 *        Optional wrapped object implementing nsIWebProgressListener2. If
 *        omitted, an empty implementation will be used.
 */
function MafWebProgressListener(aMafEventListener, wrappedObject) {
  if (!wrappedObject) {
    wrappedObject = EmptyWebProgressListener;
  }

  this._mafEventListener = aMafEventListener;
  this._wrappedObject = wrappedObject;

  // This function creates a forwarding function for wrappedObject.
  function makeForwardingFunction(functionName) {
    return function() {
      return wrappedObject[functionName].apply(wrappedObject, arguments);
    }
  }

  // Forward all the functions that are not explicitly overrided.
  for (var propertyName in wrappedObject) {
    if (typeof wrappedObject[propertyName] == "function" &&
     !(propertyName in this)) {
      this[propertyName] = makeForwardingFunction(propertyName);
    }
  }
}

MafWebProgressListener.prototype = {
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIWebProgressListener,
    Ci.nsIWebProgressListener2,
  ]),

  // nsIWebProgressListener
  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    // Trap exceptions to ensure the wrapped object gets called.
    try {
      // Suppress all events if the download is thought to be completed.
      if (!this._completed) {
        // If the save operation failed, notify our listener.
        if (aStatus != Cr.NS_OK) {
          this._completed = true;
          this._mafEventListener.onDownloadFailed(aStatus);
        // If the entire save operation is completed, notify our listener.
        } else if ((aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) &&
         (aStateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK)) {
          this._completed = true;
          this._mafEventListener.onDownloadComplete();
        }
      }
    } catch(e) {
      Cu.reportError(e);
    }

    // Forward the call to the wrapped object.
    this._wrappedObject.onStateChange(aWebProgress, aRequest, aStateFlags,
     aStatus);
  },

  // nsIWebProgressListener
  onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
    // This function must be implemented as onProgressChange64 is overridden.
    this.onProgressChange64(aWebProgress, aRequest, aCurSelfProgress,
     aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress);
  },

  // nsIWebProgressListener2
  onProgressChange64: function(aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
    // Trap exceptions to ensure the wrapped object gets called.
    try {
      // Notify our listener.
      this._mafEventListener.onDownloadProgressChange(aWebProgress, aRequest,
       aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress,
       aMaxTotalProgress);
    } catch(e) {
      Cu.reportError(e);
    }

    // Forward the call to the wrapped object.
    this._wrappedObject.onProgressChange64(aWebProgress, aRequest,
     aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress);
  },

  // nsIWebProgressListener
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {
    // Trap exceptions to ensure the wrapped object gets called.
    try {
      // Notify our listener.
      this._mafEventListener.onDownloadStatusChange(aWebProgress, aRequest,
       aStatus, aMessage);
    } catch(e) {
      Cu.reportError(e);
    }

    // Forward the call to the wrapped object.
    this._wrappedObject.onStatusChange(aWebProgress, aRequest, aStatus,
     aMessage);
  },

  _mafEventListener: null,
  _wrappedObject: null,
  _completed: false,
}
