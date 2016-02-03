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

/**
 * Handles the MAF welcome page.
 */
var WelcomePage = {
  /**
   * Option controls available in the welcome page.
   */
  _cbAssociateMaff: null,
  _cbAssociateMhtml: null,

  /**
   * True if the beforeUnload has been already processed.
   */
  _beforeUnloadProcessed: false,

  /**
   * Initializes the controls on the page.
   */
  onLoad: function() {
    // Initialize the member variables.
    this._cbAssociateMaff = document.getElementById("cbAssociateMaff");
    this._cbAssociateMhtml = document.getElementById("cbAssociateMhtml");
    // Apply brand names to the dialog elements.
    Interface.applyBranding(document.getElementById("featuresHeader"));
    Interface.applyBranding(document.getElementById("associateQuestion"));
    // Show the appropriate header if this is an update from a previous version.
    if (!Prefs.otherDisplayWelcome) {
      document.getElementById("featuresHeader").style.display = "none";
      document.getElementById("featuresHeaderFromUpdate").style.display = "";
      Prefs.otherDisplayWelcome = true;
    }
    // File associations are supported on Windows only.
    if (this._isOnWindows()) {
      document.getElementById("securityOverrideContent").style.display = "";
      this._cbAssociateMaff.checked = Prefs.associateMaff;
      this._cbAssociateMhtml.checked = Prefs.associateMhtml;
    }
  },

  /**
   * Ensures that the preference value is saved immediately.
   */
  onAssociateMaffChange: function() {
    Prefs.associateMaff = this._cbAssociateMaff.checked;
  },

  /**
   * Ensures that the preference value is saved immediately.
   */
  onAssociateMhtmlChange: function() {
    Prefs.associateMhtml = this._cbAssociateMhtml.checked;
  },

  /**
   * Applies the selected options before the page is closed.
   */
  beforeUnload: function(aEvent) {
    // Ensure that this event is processed only once.
    if (this._beforeUnloadProcessed) {
      return;
    }
    this._beforeUnloadProcessed = true;

    // Preselect the "All Files" open filter.
    DynamicPrefs.openFilterIndex = 4 + FileFilters.openFilters.length;

    // Apply the file association option on Windows.
    if (this._isOnWindows()) {
      try {
        if (Prefs.associateMaff) {
          FileAssociations.createAssociationsForMAFF();
        }
        if (Prefs.associateMhtml) {
          FileAssociations.createAssociationsForMHTML();
        }
      } catch(e) {
        // Show a message box indicating that the operation failed.
        var str = document.getElementById("associateQuestion");
        this._prompts.alert(null, str.getAttribute("errortitle"),
         str.getAttribute("errormessage").replace("$1", e.message) + "\n\n" +
         Interface.replaceBrandShortName(str.getAttribute("errortip")));
      }
    }
  },

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

  _prompts: Cc["@mozilla.org/embedcomp/prompt-service;1"]
   .getService(Ci.nsIPromptService),
}
