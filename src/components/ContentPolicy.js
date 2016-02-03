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
 * Portions created by the Initial Developer are Copyright (C) 2011
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
 * Implements a content policy observer that keeps track of which content is
 * actually loaded in every document. This allows the exact persist component to
 * save only content that is actually required to render the page.
 */

const { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "gNetUtil",
                                   "@mozilla.org/network/util;1",
                                   "nsINetUtil");

function ContentPolicy() {}

ContentPolicy.prototype = {
  classID: Components.ID("{7380f280-ab36-4a23-b213-35c64f8586a0}"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPolicy]),

  // nsIContentPolicy
  shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext,
   aMimeTypeGuess, aExtra) {
    // Exit now if aContext is null or is not the expected type of context
    if (!(aContext instanceof Ci.nsIDOMNode)) {
      return Ci.nsIContentPolicy.ACCEPT;
    }

    // Do not handle content that we wouldn't save as external resources in any
    // case, for example "data:" URIs.
    if (gNetUtil.URIChainHasFlags(aContentLocation,
     Ci.nsIProtocolHandler.URI_NON_PERSISTABLE)) {
      return Ci.nsIContentPolicy.ACCEPT;
    }

    // Do not handle content that is loaded by the browser's user interface
    var ownerDocument = (aContext.ownerDocument || aContext);
    var docShell = ownerDocument.defaultView
                                .QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIWebNavigation)
                                .QueryInterface(Ci.nsIDocShellTreeItem);
    if (docShell.itemType == Ci.nsIDocShellTreeItem.typeChrome) {
      return Ci.nsIContentPolicy.ACCEPT;
    }

    // Remove the hash part of the target URI before storing it
    var referenceUri = aContentLocation.clone();
    try {
      referenceUri.QueryInterface(Ci.nsIURL).ref = "";
    } catch (e) {
      // In case of errors, use the original URI
    }

    var loadedUriSpecs = ownerDocument.loadedUriSpecs;
    if (!loadedUriSpecs) {
      loadedUriSpecs = {};
      ownerDocument.loadedUriSpecs = loadedUriSpecs;
    }
    loadedUriSpecs[referenceUri.spec] = true;

    return Ci.nsIContentPolicy.ACCEPT;
  },

  // nsIContentPolicy
  shouldProcess: function(aContentType, aContentLocation, aRequestOrigin,
   aContext, aMimeType, aExtra) {
    return Ci.nsIContentPolicy.ACCEPT;
  },
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([ContentPolicy]);
