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

const { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

Cu.import("chrome://mza/content/MozillaArchiveFormat.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

/**
 * Handles the page to update the add-on to a beta version.
 */
var UpdateBetaPage = {
  /**
   * Initializes the controls on the page.
   */
  onLoad: function() {
    // Close the window soon if the add-on is already a beta version or the
    // browser is a release version. This is required so that the page closes
    // automatically after the installation of the beta version.
    StartupEvents.shouldUpdateToBeta().then(shouldUpdateToBeta => {
      if (!shouldUpdateToBeta) {
        window.close();
      }
    }).catch(Cu.reportError);

    // Apply brand names to the dialog elements.
    Interface.applyBranding(document.getElementById("betaHeader"));
    Interface.applyBranding(document.getElementById("betaBody"));
  },

  /**
   * Starts the installation of the beta version of the addon.
   */
  onInstallClick: function(event) {
    event.preventDefault();
    // Hide the download button after the download has started.
    let installBox = document.getElementById("installBox");
    installBox.classList.add("installing");
    AddonManager.getInstallForURL(
      event.target.getAttribute("href"),
      function(install) {
        // If the download is cancelled, display the download button again.
        install.addListener({
          onDownloadCancelled: function() {
            installBox.classList.remove("installing");
          },
        });
        // Start the installation from the current update page. Message passing
        // is not needed since this page is loaded in the parent process.
        var chromeWindow = window.QueryInterface(Ci.nsIInterfaceRequestor)
                                 .getInterface(Ci.nsIWebNavigation)
                                 .QueryInterface(Ci.nsIDocShellTreeItem)
                                 .rootTreeItem
                                 .QueryInterface(Ci.nsIInterfaceRequestor)
                                 .getInterface(Ci.nsIDOMWindow);
        AddonManager.installAddonsFromWebpage(
          "application/x-xpinstall",
          chromeWindow.gBrowser.selectedBrowser,
          chromeWindow.gBrowser.contentPrincipal,
          [install]
        );
      },
      "application/x-xpinstall"
    );
  },
};
