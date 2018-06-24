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

const { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

Cu.import("chrome://mza/content/MozArchiver.jsm");

/**
 * Handles the MAF preferences dialog.
 */
var PrefsDialog = {
  /**
   * Initializes the controls when the dialog is displayed.
   */
  onLoadDialog: function() {
    // Apply brand names to the dialog elements.
    for (var [, elementName] in Iterator(["descVisitWebsite",
     "descShowWelcomePageAssociate"])) {
      Interface.applyBranding(document.getElementById(elementName));
    }
    // Determines if the welcome page handles file associations.
    if (this._isOnWindows()) {
      document.getElementById("boxShowWelcomePage").hidden = true;
      document.getElementById("boxShowWelcomePageAssociate").hidden = false;
    }
    // The preferences do not apply if multi-process is enabled.
    var isMultiprocess = Services.appinfo.browserTabsRemoteAutostart;
    document.getElementById("boxMain").hidden = isMultiprocess;
    document.getElementById("boxMultiprocess").hidden = !isMultiprocess;
    // Updates the status of the dialog controls.
    this.onSaveMethodChange();
  },

  /**
   * Updates the window size after some elements may have been added or removed.
   */
  sizeToContent: function() {
    // At this point, we must ensure that the height of the visible description
    // elements is taken into account when calculating the window height.
    for (let [, d] in Iterator(document.getElementsByTagName("description"))) {
      d.style.height = window.getComputedStyle(d).height;
    }
    // We must also override the explicit height that was set by the preferences
    // window machinery, then recalculate the window height automatically.
    for (let [, p] in Iterator(document.getElementsByTagName("prefpane"))) {
      p = document.getAnonymousElementByAttribute(p, "class", "content-box");
      p.style.height = "auto";
    }
    window.sizeToContent();
  },

  /* --- Interactive dialog functions and events --- */

  /**
   * Enables other dialog controls depending on the selected save method.
   */
  onSaveMethodChange: function() {
    var enabled = document.getElementById("prefSaveMethod").value == "snapshot";
    document.getElementById("radioSaveFormatMaff").disabled = !enabled;
    document.getElementById("radioSaveFormatMhtml").disabled = !enabled;
    document.getElementById("boxConvertSavedPages").hidden = !enabled ||
     Services.appinfo.browserTabsRemoteAutostart;
    this.sizeToContent();
  },

  /**
   * Displays the "Convert saved pages" window.
   */
  onActionConvertSavedPagesClick: function() {
    // If the convert window is already opened
    var convertDialog = Cc["@mozilla.org/appshell/window-mediator;1"].
     getService(Ci.nsIWindowMediator).getMostRecentWindow("Maf:Convert");
    if (convertDialog) {
      // Bring the window to the foreground.
      convertDialog.focus();
    } else {
      // Open a new window to allow the conversion.
      window.open(
       "chrome://mza/content/convert/convertDialog.xul",
       "maf-convertDialog",
       "chrome,titlebar,centerscreen,resizable=yes");
    }
  },

  /**
   * Opens the welcome page in a new browser window. This must be done from code
   * since labels with the "text-link" class cannot open chrome locations.
   */
  onActionShowWelcomePageClick: function() {
    // Use the helper function defined either in "utilityOverlay.js" or in
    // "contentAreaUtils.js" depending on the host application.
    openNewWindowWith("chrome://mza/content/preferences/welcomePage.xhtml");
  },

  /* --- Dialog support functions --- */

  /**
   * Returns true if the application is executing on Windows.
   */
  _isOnWindows: function() {
    // For more information, see
    // <https://developer.mozilla.org/en/nsIXULRuntime> and
    // <https://developer.mozilla.org/en/OS_TARGET> (retrieved 2008-11-19).
    var xulRuntimeOs = Cc["@mozilla.org/xre/app-info;1"]
     .getService(Ci.nsIXULRuntime).OS;
    return (xulRuntimeOs == "WINNT");
  },
}
