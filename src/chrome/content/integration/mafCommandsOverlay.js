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

// This declaration is required for SeaMonkey compatibility.
var { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

/**
 * Handles the MAF integrated user interface commands.
 */
var MafCommandsOverlay = {
  /**
   * Array of the "menupopup" DOM elements which we are listening for events on.
   */
  menusWithEvents: [],

  /**
   * Initializes the overlay by creating some DOM elements dynamically and
   * creating the appropriate event listeners. For more information, see
   * <https://developer.mozilla.org/en/Dynamically_modifying_XUL-based_user_interface>
   * (retrieved 2009-03-01).
   */
  onLoad: function() {
    // Note: since this event function is copied to be used as an event
    // listener, the "this" variable does not point to this object.

    // Remove the previously added event listener.
    window.removeEventListener("load", MafCommandsOverlay.onLoad, false);

    // Listen for when the browser window closes, to perform shutdown.
    window.addEventListener("unload", MafCommandsOverlay.onUnload, false);

    // Get a reference to the tab bar context menu.
    var tabContextMenu = gBrowser.tabContextMenu;
    if (!tabContextMenu) {
      // On SeaMonkey, find the tab bar context menu in the XBL binding of the
      // tabbed browser.
      var tabBrowser = document.getElementById("content");
      tabContextMenu = document.getAnonymousElementByAttribute(tabBrowser,
       "anonid", "tabContextMenu");
    }
    // Insert the items before the "Reload Tab" item defined in "browser.xul",
    // or if this element is not accessible because it does not have an ID
    // insert the items just after the second menu separator.
    var tabContextMenuBeforeItem = document.getElementById("context_reloadTab");
    if (!tabContextMenuBeforeItem) {
      var elementList = tabContextMenu.
       getElementsByTagNameNS(tabContextMenu.namespaceURI, "menuseparator");
      tabContextMenuBeforeItem = elementList[1].nextSibling;
    }
    // Each element in the MAF tab bar context menu is moved to the appropriate
    // destination and removed from the original list.
    var tabContextMenuNewNodes = document.getElementById("mafTabContextMenu").
     childNodes;
    while (tabContextMenuNewNodes.length > 0) {
      var newChild = tabContextMenuNewNodes[0];
      tabContextMenu.insertBefore(newChild, tabContextMenuBeforeItem);
    }

    // Add event listeners to check for menu item visibility. See also
    // <https://developer.mozilla.org/en/XUL/PopupGuide/PopupEvents> (retrieved
    // 2009-03-01).
    [
     document.getElementById("menu_FilePopup"),
     tabContextMenu
    ].forEach(function(element) {
      if (element) {
        element.addEventListener("popupshowing",
         MafCommandsOverlay.onMenuPopupShowing, false);
        // Remember that we added an event listener.
        MafCommandsOverlay.menusWithEvents.push(element);
      }
    });
  },

  /**
   * Shuts down the overlay by removing the previously added event listeners.
   */
  onUnload: function() {
    // Remove the previously added event listener.
    window.removeEventListener("unload", MafCommandsOverlay.onUnload, false);

    // Remove the event listeners on the popup menus.
    MafCommandsOverlay.menusWithEvents.forEach(function(element) {
      element.removeEventListener("popupshowing",
       MafCommandsOverlay.onMenuPopupShowing, false);
    });
  },

  /**
   * Updates menu item visibility.
   */
  onMenuPopupShowing: function(aEvent) {
    // Check that the event fired for one of the menus we are interested in and
    // not for one of the descendants.
    if (MafCommandsOverlay.menusWithEvents.indexOf(aEvent.target) < 0) {
      return;
    }

    // On SeaMonkey, if the preference to save pages automatically is set, we
    // have to change the labels of the save commands appropriately.
    var autoSave = Cc["@mozilla.org/preferences-service;1"].
     getService(Ci.nsIPrefService).getBranch("").
     getBoolPref("browser.download.useDownloadDir") &&
     Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).ID ==
     "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}";

    // Show the menu items only if we have the ability to save web archives.
    var isVisibleInMenu = MozArchiver.Prefs.saveEnabled;

    // Now check every menu item and, if it is linked to one of the MAF
    // commands, set its visibility appropriately.
    Array.forEach(aEvent.target.getElementsByTagNameNS(
     aEvent.target.namespaceURI, "menuitem"), function(element) {

      // Determine which class of MAF menu item we are handling.
      var command = element.getAttribute("command");
      if (command.slice(0, "mafCmd".length) == "mafCmd") {

        // If the element has a different label based on whether the page will
        // be saved automatically, change the label accordingly.
        var labelSave = element.getAttribute("labelsave");
        if (labelSave) {
          element.setAttribute("label", autoSave ? labelSave :
           element.getAttribute("labelsaveas"));
        }

        // Check for overall MAF element visibility in this menu.
        element.hidden = !isVisibleInMenu;
      }
    });

    // Show menu separators only if at least one MAF menu item is visible.
    Array.forEach(aEvent.target.getElementsByTagNameNS(
     aEvent.target.namespaceURI, "menuseparator"), function(element) {

      // Filter out unrelated separators.
      if (["mafMenuSaveSeparator_fileMenu",
       "mafMenuConvertSeparator_fileMenu",
       "mafMenuSaveSeparator_tabsContextMenu"].indexOf(element.id) >= 0) {
        // Set visibility assuming that at least one MAF item is visible in the
        // menus that actually have a separator, if the user preference for
        // showing items in the menu is enabled.
        element.hidden = !isVisibleInMenu;
      }

    });
  },

  /**
   * Displays the "Convert saved pages" window.
   */
  convertSavedPages: function() {
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
   * Asks the user to select which of the open tabs will be saved in an archive.
   */
  saveTabsInArchive: function() {
    // Ensure all the background tabs are loaded while the selection is made.
    for (let browser of gBrowser.browsers) {
      if (browser.hasAttribute("pending")) {
        browser.reload();
      }
    }
    // Open a dialog that lets the user select which tabs will be saved. See
    // "multiSaveDialog.js" for a description of the dialog arguments.
    var returnValues = {};
    window.openDialog(
     "chrome://mza/content/integration/multiSaveDialog.xul",
     "maf-multiSaveDialog",
     "chrome,titlebar,centerscreen,modal,resizable=yes",
     window,
     returnValues);
    // If the dialog was not canceled by the user
    if (returnValues.selectedTabs) {
      // Use the global saveDocument function with the special MAF parameters.
      saveDocument(getBrowser().selectedBrowser.contentDocument,
       {mafAskSaveArchive: true, mafSaveTabs: returnValues.selectedTabs});
    }
  },

  /**
   * Saves all of the open tabs in an archive.
   */
  saveAllTabsInArchive: function() {
    // Ensure all the background tabs are loaded while the selection is made.
    for (let browser of gBrowser.browsers) {
      if (browser.hasAttribute("pending")) {
        browser.reload();
      }
    }
    // Use the global saveDocument function with the special MAF parameters.
    saveDocument(getBrowser().selectedBrowser.contentDocument,
     {mafAskSaveArchive: true, mafSaveTabs: getBrowser().browsers});
  },

  /**
   * Saves the current tab in an archive.
   */
  savePageInArchive: function() {
    // Use the global saveDocument function with the special MAF parameters.
    saveDocument(getBrowser().selectedBrowser.contentDocument,
     {mafAskSaveArchive: true});
  },
}

// Now that the MafCommandsOverlay object is defined, add the event listener
// that will trigger the initialization when all of the overlays are loaded.
window.addEventListener("load", MafCommandsOverlay.onLoad, false);
