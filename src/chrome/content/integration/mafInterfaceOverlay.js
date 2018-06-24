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
 * Handles the integration with the address bar and the status bar.
 */
var MafInterfaceOverlay = {
  /**
   * Initializes the overlay by creating the appropriate event listeners that
   * detect the changes in the currently selected page. For more information,
   * see <https://developer.mozilla.org/en/Code_snippets/Progress_Listeners>
   * (retrieved 2009-08-30).
   */
  onLoad: function() {
    // Note: since this event function is copied to be used as an event
    // listener, the "this" variable does not point to this object.

    // Remove the previously added event listener.
    window.removeEventListener("load", MafInterfaceOverlay.onLoad, false);

    // Get references to some of the elements of the MAF user interface.
    MafInterfaceOverlay._initElementReferences();

    // Ensure the initial state of the interface for new windows is consistent.
    MafInterfaceOverlay._updateArchiveInfo();

    // Register the web progress listener defined in this object, and receive
    // only the onLocationChange notifications.
    gBrowser.addProgressListener(MafInterfaceOverlay.webProgressListener);

    // Register a preference observer to update the visibility of the icons.
    MozArchiver.Prefs.prefBranchForMaf.addObserver(
     "interface.info.icon", MafInterfaceOverlay.prefObserver, false);

    // Listen for when the browser window closes, to perform shutdown.
    window.addEventListener("unload", MafInterfaceOverlay.onUnload, false);
  },

  /**
   * Shuts down the overlay by removing the previously added event listeners.
   */
  onUnload: function() {
    // Remove the previously added event listener.
    window.removeEventListener("unload", MafInterfaceOverlay.onUnload, false);

    // Remove the preference observer defined in this object.
    MozArchiver.Prefs.prefBranchForMaf.removeObserver(
     "interface.info.icon", MafInterfaceOverlay.prefObserver);

    // Remove the web progress listener defined in this object.
    gBrowser.removeProgressListener(MafInterfaceOverlay.webProgressListener);
  },

  /**
   * Displays the archive information popup, anchored to the address bar icon,
   * when the user clicks it with the left mouse button.
   */
  onUrlbarButtonClick: function(aEvent) {
    // Ensure that any type of click isn't handled by the outer textbox.
    aEvent.stopPropagation();

    // Handle only left clicks in the address bar.
    if (aEvent.button != 0)
      return;

    // Make sure that clicking outside the popup cannot reopen it accidentally.
    this._archiveInfoPopup.popupBoxObject.
     setConsumeRollupEvent(Ci.nsIPopupBoxObject.ROLLUP_CONSUME);

    // Open the popup near the address bar icon.
    this._archiveInfoPopup.openPopup(this._archiveInfoUrlbarButton,
                                     "bottomcenter topright");
  },

  /**
   * From the archive information popup, opens the original location the current
   * page was saved from.
   */
  onOriginalUrlClick: function(aEvent) {
    // Determine if the original address is present.
    var href = this._currentPageInfo && this._currentPageInfo.originalUrl;
    if (href) {
      // Hide the popup before opening the new address.
      this._archiveInfoPopup.hidePopup();
      // Open the link appropriately, depending on the applied modifiers.
      openUILink(href, aEvent);
    }
  },

  /**
   * Object with the metadata about the current page.
   */
  _currentPageInfo: {},

  /**
   * Updates the information about the current page.
   */
  _refreshCurrentPage: function() {
    // Get a direct reference to the ArchivePage object, or use an empty object.
    let pageInfo = MozArchiver.ArchiveCache.pageFromUri(
     gBrowser.currentURI) || {};
    this._currentPageInfo = pageInfo;

    // Format the original address for display, if present.
    if (pageInfo.originalUrl && !pageInfo.originalUrlForDisplay) {
      try {
        pageInfo.originalUrlForDisplay =
         Cc["@mozilla.org/intl/texttosuburi;1"].
         getService(Ci.nsITextToSubURI).
         unEscapeURIForUI("UTF-8", pageInfo.originalUrl);
      } catch (e) {
        // In case of errors, display the unescaped URI.
        pageInfo.originalUrlForDisplay = pageInfo.originalUrl;
      }
      pageInfo.hasValues = true;
    }

    // Format the save date for display, if present.
    if (pageInfo.dateArchived && !pageInfo.dateArchivedForDisplay) {
      // Use the date formatting service to display the localized date. We
      // cannot use the native JavaScript date formatting functions, like
      // "toLocaleString", because this code may be called at startup when the
      // service that converts the operating-system-provided date string to
      // Unicode is not available in the JavaScript context.
      let dateValue = pageInfo.dateArchived;
      pageInfo.dateArchivedForDisplay = 
       Cc["@mozilla.org/intl/scriptabledateformat;1"].
       getService(Ci.nsIScriptableDateFormat).FormatDateTime("",
       Ci.nsIScriptableDateFormat.dateFormatLong,
       Ci.nsIScriptableDateFormat.timeFormatSeconds,
       dateValue.getFullYear(), dateValue.getMonth() + 1, dateValue.getDate(),
       dateValue.getHours(), dateValue.getMinutes(), dateValue.getSeconds());
      pageInfo.hasValues = true;
    }
  },

  /**
   * Updates the visibility and appearance of the MAF icons in the browser
   * window, based on the current page state and the current preferences.
   */
  _checkArchiveInfoIcons: function() {
    this._archiveInfoUrlbarButton.hidden = !this._currentPageInfo.hasValues ||
     !MozArchiver.Prefs.interfaceInfoIcon;
  },

  /**
   * Updates the contents of the archive information popup, based on the
   * current page state.
   */
  _checkArchiveInfoPopup: function() {
    // Update the value of the page status label.
    var pageStatusAttributeName = this._currentPageInfo.hasValues ?
     "archivedvalue" : "normalvalue";
    document.getElementById("mafPageStatusLabel").setAttribute("value",
     document.getElementById("mafPageStatusLabel").getAttribute(
     pageStatusAttributeName));
    // Show or hide the page details grid.
    document.getElementById("mafArchiveInfoDetails").hidden =
     !this._currentPageInfo.hasValues;
    // Update the contents of the page details grid if required.
    if (this._currentPageInfo.hasValues) {
      // Get the original address the page was saved from.
      var originalUrlLabel = document.getElementById("mafOriginalUrlLabel");
      var originalUrl = this._currentPageInfo.originalUrlForDisplay;
      // If the original address is present.
      if (originalUrl) {
        // Display the label as a link.
        originalUrlLabel.setAttribute("class", "text-link");
        originalUrlLabel.setAttribute("value", originalUrl);
      } else {
        // Display the placeholder for missing values.
        originalUrlLabel.setAttribute("class", "");
        originalUrlLabel.setAttribute("value", document.
         getElementById("mafOriginalUrlLabel").getAttribute("missingvalue"));
      }
      // Get the save date and display it, or a placeholder for missing values.
      var dateArchived = this._currentPageInfo.dateArchivedForDisplay;
      document.getElementById("mafDateArchivedLabel").setAttribute("value",
       dateArchived || document.getElementById("mafDateArchivedLabel").
       getAttribute("missingvalue"));
    }
  },

  /**
   * Turns the "Save Page" button into "Save Page In Archive" for documents.
   */
  updateSavePageButtonLabel: function() {
    // This operation is needed on Firefox but not on SeaMonkey.
    if (!("CustomizableUI" in window)) {
      return;
    }

    var savePageWidget = CustomizableUI.getWidget("save-page-button");

    // Change the label of the widget based on the document type.
    var labelText;
    var contentDocument = getBrowser().selectedBrowser.contentDocument;
    if (MozArchiver.Prefs.saveEnabled &&
     MozArchiver.DynamicPrefs.saveFilterIndexHtml < 2 && (
     contentDocument.contentType == "text/html" ||
     contentDocument.contentType == "application/xhtml+xml")) {
      labelText = document.
       getElementById("mafMenuSavePageInArchive_fileMenu").
       getAttribute("labelsave");
    } else {
      labelText = CustomizableUI.getLocalizedProperty(savePageWidget, "label");
    }
    savePageWidget.forWindow(window).node.setAttribute("label", labelText);
  },

  /**
   * Updates the archive information notification for the current page.
   */
  _checkArchiveInfoNotification: function() {
    // Show a notification for the page only if required.
    if (!this._currentPageInfo.hasValues ||
     !MozArchiver.Prefs.interfaceInfoBar) {
      return;
    }

    // Don't display the notification again if it was closed previously.
    if (gBrowser.contentDocument.mafOriginalInfoClosed) {
      return;
    }

    // Exit if the notification is already displayed.
    var notificationBox = gBrowser.getNotificationBox();
    if (notificationBox.getNotificationWithValue("maf-original-info")) {
      return;
    }

    // Create a new notification.
    var notification = notificationBox.appendNotification("",
     "maf-original-info", "chrome://mza/skin/integration/page-archived.png",
     notificationBox.PRIORITY_WARNING_LOW, null);

    // Show the save date only if present.
    var dateArchived = this._currentPageInfo.dateArchivedForDisplay;
    if (dateArchived) {
      this._prependNotificationLabel(notification, { value: dateArchived });
      this._prependNotificationLabel(notification, {
       value: this._dateArchivedDescriptionValue
      });
    }

    // Show the original address only if present.
    var originalUrl = this._currentPageInfo.originalUrlForDisplay;
    if (originalUrl) {
      // Display the label as a link.
      this._prependNotificationLabel(notification, {
       value: originalUrl,
       class: "text-link",
       crop: "center",
       flex: "10000",
       onclick: "MafInterfaceOverlay.onOriginalUrlClick(event);"
      });
      this._prependNotificationLabel(notification, {
       value: this._originalUrlDescriptionValue
      });
    }

    // Hide the unused message description element.
    notification.ownerDocument.getAnonymousElementByAttribute(notification,
     "anonid", "messageText").hidden = true;

    // Ensure that we record the fact that the notification is closed.
    var affectedDoc = gBrowser.contentDocument;
    var button = notification.ownerDocument.getAnonymousElementByAttribute(
     notification, "anonid", "details").nextSibling;
    button.addEventListener("command", function() {
      affectedDoc.mafOriginalInfoClosed = true;
    }, true);
  },

  /**
   * Updates the visibility and appearance of the MAF icons in the browser
   * window, as well as the contents of the archive information popup.
   */
  _updateArchiveInfo: function() {
    // Use the latest information available for the current page.
    this._refreshCurrentPage();
    // Update the state of the icons.
    this._checkArchiveInfoIcons();
    // Update the contents of the popup.
    this._checkArchiveInfoPopup();
    // Update the save page button label.
    this.updateSavePageButtonLabel();
    // Update the contents of the notification. We must delay this operation to
    // support the case where tab contents have not been loaded yet.
    Services.tm.mainThread.dispatch(
     this._checkArchiveInfoNotification.bind(this),
     Ci.nsIThread.DISPATCH_NORMAL);
  },

  _archiveInfoPopup: null,
  _archiveInfoUrlbarButton: null,
  _originalUrlDescriptionValue: null,
  _dateArchivedDescriptionValue: null,

  /**
   * Gets references to some of the XUL elements of the MAF user interface.
   */
  _initElementReferences: function() {
    this._archiveInfoPopup =
     document.getElementById("mafArchiveInfoPopup");
    this._archiveInfoUrlbarButton =
     document.getElementById("mafArchiveInfoUrlbarButton");
    this._originalUrlDescriptionValue = document.getElementById(
     "mafOriginalUrlDescription").getAttribute("value");
    this._dateArchivedDescriptionValue = document.getElementById(
     "mafDateArchivedDescription").getAttribute("value");
  },

  /**
   * Prepends a label with the given attributes to the provided notification.
   */
  _prependNotificationLabel: function(aNotification, aAttributes) {
    const XULNS =
     "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    var label = aNotification.ownerDocument.createElementNS(XULNS, "label");
    for ([name, value] in Iterator(aAttributes)) {
      label.setAttribute(name, value);
    }
    aNotification.insertBefore(label, aNotification.firstChild);
  },

  /**
   * This progress listener detects changes in the current location. For more
   * information, see <https://developer.mozilla.org/en/nsIWebProgress>
   * (retrieved 2009-08-30).
   */
  webProgressListener: {
    QueryInterface: XPCOMUtils.generateQI([
      Ci.nsIWebProgressListener,
      Ci.nsISupportsWeakReference,
    ]),
    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) { },
    onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress,
     aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) { },
    onLocationChange: function(aWebProgress, aRequest, aLocation) {
      // Always refresh the status information when the notification is
      // received, even if the location points to the same URI as before.
      MafInterfaceOverlay._updateArchiveInfo();
    },
    onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) { },
    onSecurityChange: function(aWebProgress, aRequest, aState) { },
  },

  /**
   * This preference observer detects changes that affect the display of the MAF
   * interface elements in the main browser window.
   */
  prefObserver: {
    QueryInterface: XPCOMUtils.generateQI([
      Ci.nsIObserver,
    ]),
    observe: function(aSubject, aTopic, aData) {
      // Refresh the visibility of the icons.
      MafInterfaceOverlay._checkArchiveInfoIcons();
    },
  },
};

// Now that the MafInterfaceOverlay object is defined, add the event listener
// that will trigger the initialization when all of the overlays are loaded,
// unless we are running in a multi-process browser.
if (!Services.appinfo.browserTabsRemoteAutostart) {
  window.addEventListener("load", MafInterfaceOverlay.onLoad, false);
}
