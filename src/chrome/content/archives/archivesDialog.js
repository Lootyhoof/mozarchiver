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

let { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

Cu.import("chrome://mza/content/MozillaArchiveFormat.jsm");

/**
 * Handles the MAF dialog that displays information about the known archives.
 */
var ArchivesDialog = {

  /**
   * The tree element that lists the known archive pages.
   */
  archivesTree: null,

  // --- Interactive dialog functions and events ---

  /**
   * Initializes the dialog when the window is opened initially.
   *
   * This function prepares the initial Places view. For more information, see
   * <https://developer.mozilla.org/en/Displaying_Places_information_using_views>
   * (retrieved 2009-05-23).
   */
  onLoadDialog: function() {
    // Execute the initialization functions that are specific to SeaMonkey.
    if (window.onNavigatorLoadDialog) {
      window.onNavigatorLoadDialog();
    }

    // Get a reference to the tree that will display the main Places view.
    ArchivesDialog.archivesTree = document.getElementById("treeArchives");

    // Customize the Places view and the operations that can be performed on it.
    ArchivesDialog.customizePlacesView();
    ArchivesDialog.customizePlacesController();

    // Rename the "delete" command in the Places context menu to reflect the
    // actual operation it performs on the customized Places tree.
    var btnDelete = document.getElementById("btnDelete");
    var contextMenuItem =
     document.getElementById("placesContext_delete_history") ||
     document.getElementById("placesContext_delete");
    contextMenuItem.setAttribute("label", btnDelete.getAttribute("label"));
    contextMenuItem.setAttribute("accesskey", btnDelete.getAttribute(
     "cxtaccesskey"));

    // Remove the original history handling commands in the Places context menu
    // because their presence in the Archives view is confusing.
    for (var [, commandName] in Iterator([
     "placesContext_deleteHost",
     "placesContext_deleteByHostname",
     "placesContext_deleteByDomain"
    ])) {
      var element = document.getElementById(commandName);
      if (element) {
        document.getElementById("placesContext").removeChild(element);
      }
    }

    // Execute the initial update of the controls.
    ArchivesDialog.checkShowMore();
    ArchivesDialog.checkPlaceInfo();
  },

  /**
   * Updates the displayed information on the current selection in the tree.
   */
  onTreeSelect: function(aEvent) {
    ArchivesDialog.checkPlaceInfo();
  },

  /**
   * Opens the selected node when return is pressed.
   */
  onTreeKeyPress: function(aEvent) {
    if (aEvent.keyCode != KeyEvent.DOM_VK_RETURN)
      return;

    // Open the page represented by the selected node in the archives tree.
    PlacesUIUtils.openNodeWithEvent(ArchivesDialog.archivesTree.selectedNode,
     aEvent);
  },

  /**
   * Opens the selected node on middle click.
   */
  onTreeClick: function(aEvent) {
    if (aEvent.target.localName != "treechildren" || aEvent.button != 1)
      return;

    // Open the page represented by the selected node in the archives tree.
    PlacesUIUtils.openNodeWithEvent(ArchivesDialog.archivesTree.selectedNode,
     aEvent);
  },

  /**
   * Opens the selected node on double click.
   */
  onTreeDblClick: function(aEvent) {
    if (aEvent.target.localName != "treechildren")
      return;

    // Open the page represented by the selected node in the archives tree.
    PlacesUIUtils.openNodeWithEvent(ArchivesDialog.archivesTree.selectedNode,
     aEvent);
  },

  /**
   * Toggles the visibility of the additional archive page details.
   */
  onShowMoreClick: function() {
    // Update the "hidden" attribute on the broadcaster.
    var brShowMore = document.getElementById("brShowMore");
    brShowMore.setAttribute("hidden", brShowMore.hidden ? "false" : "true");
    // Update the label on the button.
    ArchivesDialog.checkShowMore();
  },

  /**
   * Loads information about archive files, without opening them in the browser.
   */
  onAddClick: function(aEvent) {
    // Determine the title of the file picker dialog.
    var title = document.getElementById("btnAdd").getAttribute("fptitle");

    // Initialize a new file picker with filters for web archives.
    var filePicker = Cc["@mozilla.org/filepicker;1"].
     createInstance(Ci.nsIFilePicker);
    filePicker.init(window, title, Ci.nsIFilePicker.modeOpenMultiple);
    FileFilters.openFilters.forEach(function(curFilter) {
      filePicker.appendFilter(curFilter.title, curFilter.extensionString);
    });
    filePicker.appendFilters(Ci.nsIFilePicker.filterAll);

    // Show the file picker and exit now if canceled.
    if (filePicker.show() !== Ci.nsIFilePicker.returnOK) {
      return;
    }

    // For every selected file
    var filesEnumerator = filePicker.files;
    while (filesEnumerator.hasMoreElements())
    {
      var file = filesEnumerator.getNext().QueryInterface(Ci.nsILocalFile);
      // Attempt to load the archive and register it in the cache.
      try {
        var archive = ArchiveLoader.extractAndRegister(file);
        for (var [, page] in Iterator(archive.pages)) {
          // Ensure that a history visit is added for the page, otherwise the
          // page would not appear in the Places view. The visit is recorded as
          // a top level typed entry, so that history listeners are able to be
          // notified about the new entry.
          PlacesUtils.asyncHistory.updatePlaces({
            uri: page.archiveUri,
            visits: [{
              transitionType: Ci.nsINavHistoryService.TRANSITION_TYPED,
              visitDate: Date.now() * 1000,
            }],
          });
        }
      } catch (e) {
        // If opening the archive failed, skip it and report the error.
        Cu.reportError(e);
      }
    }

    // Ensure that the archives tree is refreshed immediately.
    ArchivesDialog.requeryPlaces();
  },

  /**
   * Invokes the delete command on the tree view.
   */
  onDeleteClick: function(aEvent) {
    ArchivesDialog.deleteSelection();
  },

  /**
   * Opens the selected nodes in tabs, using the URLs from the column associated
   * with the button.
   */
  onOpenTabsClick: function(aEvent) {
    // Determine the column for which the command has been invoked.
    var columnId = "tc" + aEvent.target.id.slice("btnOpenTabs".length);
    // Open the associated URLs if possible.
    ArchivesDialog.openSelectionInTabs(columnId, aEvent);
  },

  // --- Functions that handle and customize the Places tree ---

  /**
   * Refreshes the archives tree.
   */
  requeryPlaces: function() {
    // Execute the same query on the Places database again.
    ArchivesDialog.archivesTree.place = ArchivesDialog.archivesTree.place;
    // Since the above call restores the standard view, we must apply our
    // customization again. The list of controllers on the tree is unaffected.
    ArchivesDialog.customizePlacesView();
  },

  /**
   * Replaces the Places view on the archives tree with a customized one. For
   * more information, see
   * <https://developer.mozilla.org/en/Displaying_Places_information_using_views>
   * (retrieved 2009-05-23).
   */
  customizePlacesView: function() {
    // Create a new default Places view and override some of its functions. The
    // functions are copied, not referenced, from the ArchivesDialog object.
    var view = new PlacesTreeView(false, null,
     ArchivesDialog.archivesTree.view._controller);

    view._originalGetCellText = view.getCellText;
    view._originalCycleHeader = view.cycleHeader;
    view.getCellText = ArchivesDialog.viewGetCellText;
    view.cycleHeader = ArchivesDialog.viewCycleHeader;
    view.sortingChanged = function() { };

    // Get a reference to the current query result object, created by the
    // standard Places tree. Ensure that the required interface is available on
    // the object, since this is not done by the standard Places tree.
    var result = ArchivesDialog.getResult();

    // Before detaching the old view from the tree, ensure that its reference to
    // the tree is removed. Failing to do this would cause the new view to
    // malfunction.
    ArchivesDialog.archivesTree.view.QueryInterface(Ci.nsITreeView).
     setTree(null);

    // Apply the new view to the appropriate objects.
    if (result.addObserver) {
      result.addObserver(view, false);
    } else {
      result.viewer = view;
    }
    ArchivesDialog.archivesTree.view = view;
  },

  /**
   * Adds a custom controller on the archives tree for overriding the clipboard
   * commands and disabling history management commands. For more information,
   * see <https://developer.mozilla.org/en/Places/View_Controller> (retrieved
   * 2009-05-24).
   */
  customizePlacesController: function() {
    ArchivesDialog.archivesTree.controllers.insertControllerAt(0, {
      supportsCommand: function(aCommand) {
        // This object takes control of all the clipboard commands.
        return [
         "cmd_cut", "cmd_copy", "cmd_paste", "cmd_delete"
        ].indexOf(aCommand) >= 0;
      },
      isCommandEnabled: function(aCommand) {
        // The cut and the paste commands are always disabled.
        if (["cmd_cut", "cmd_paste"].indexOf(aCommand) >= 0) {
          return false;
        }
        // Other commands require that at least one item is selected.
        return ArchivesDialog.archivesTree.hasSelection;
      },
      doCommand: function(aCommand) {
        switch (aCommand) {
          // Copy information about the selected nodes to the clipboard.
          case "cmd_copy":
            ArchivesDialog.copySelection();
            break;
          // Forget the information about the selected archives.
          case "cmd_delete":
            ArchivesDialog.deleteSelection();
            break;
        }
      },
      onEvent: function(aEventName) { },
    });
    ArchivesDialog.archivesTree.controllers.insertControllerAt(0, {
      supportsCommand: function(aCommand) {
        // Disable all the history handling commands.
        return [
         "placesCmd_deleteDataHost", "placesCmd_delete:hostname",
         "placesCmd_delete:domain"
        ].indexOf(aCommand) >= 0;
      },
      isCommandEnabled: function(aCommand) {
        return false;
      },
      doCommand: function(aCommand) { },
      onEvent: function(aEventName) { },
    });
  },

  /**
   * This function is copied to the Places view object to handle the special
   * columns that display the MAF annotations. In this function, "this" refers
   * to the Places view object.
   */
  viewGetCellText: function(aRow, aCol) {
    // Get the annotation value with the appropriate data type.
    var value = ArchivesDialog.getNodeValue(this.nodeForTreeIndex(aRow),
     aCol.element.id);
    // Display localized short dates or plain string values.
    return Interface.formatValueForDisplay(value, true);
  },

  /**
   * This function is copied to the Places view object to handle the special
   * columns that display the MAF annotations. In this function, "this" refers
   * to the Places view object.
   */
  viewCycleHeader: function(aCol) {
    const kAsc = Ci.nsINavHistoryQueryOptions.SORT_BY_ANNOTATION_ASCENDING;
    const kDesc = Ci.nsINavHistoryQueryOptions.SORT_BY_ANNOTATION_DESCENDING;

    // Handle the columns that display custom annotations.
    var annotationName = ArchivesDialog.getColumnAnnotationName(aCol.element);
    if (annotationName) {
      // Get a reference to the current query result.
      var result = ArchivesDialog.getResult();
      // If the result was already sorted using the selected annotation, just
      // reverse the sort order.
      if (result.sortingMode == kAsc &&
          result.sortingAnnotation == annotationName) {
        result.sortingMode = kDesc;
      } else if (result.sortingMode == kDesc &&
                 result.sortingAnnotation == annotationName) {
        result.sortingMode = kAsc;
      } else {
        // Sort in ascending order using the specified annotation.
        result.sortingAnnotation = annotationName;
        result.sortingMode = kAsc;
      }
      return;
    }

    // If this is not a custom column, forward the call to the original function.
    this._originalCycleHeader(aCol);
  },

  // --- Functions that execute the custom commands on the tree ---

  /**
   * Copies to the clipboard the details about the selected nodes, in various
   * formats. The original location of the page is used instead of its local
   * archive URL.
   *
   * This function is similar to the standard Places function implemented in
   * "controller.js", except that history nodes are handled and no entry is
   * generated for the flavor TYPE_X_MOZ_PLACE, since the override URL has no
   * effect for that flavor. For more information, see
   * <http://mxr.mozilla.org/mozilla-central/source/browser/components/places/content/controller.js>
   * (retrieved 2009-05-25).
   */
  copySelection: function() {
    // Find the selected nodes, and exit now if no node is selected.
    var selectedNodes = ArchivesDialog.getSelectedNodes();
    if (!selectedNodes.length)
      return;

    // Create a new object to hold the data to be copied.
    var transferable = Cc["@mozilla.org/widget/transferable;1"].
     createInstance(Ci.nsITransferable);
    if (transferable.init) {
      transferable.init(null);
    }

    // Add the data flavors to the object in the appropriate order.
    [
     PlacesUtils.TYPE_X_MOZ_URL,
     PlacesUtils.TYPE_UNICODE,
     PlacesUtils.TYPE_HTML,
    ].forEach(function(type) {
      // For every node in the selection
      var dataString = "";
      for (var [, node] in Iterator(selectedNodes)) {
        // Add the concatenation separator if necessary.
        if (dataString) {
          dataString += NEWLINE;
        }
        // Use the original location of the page when copying the node. If the
        // original location is unspecified, the page archive URL will be used.
        var overrideUri = ArchivesDialog.getNodeValue(node, "tcMafOriginalUrl");
        // Add the current node's data to the string.
        dataString += PlacesUtils.wrapNode(node, type, overrideUri);
      }
      // Convert the string type for the transferable object.
      var dataSupportsString = Cc["@mozilla.org/supports-string;1"].
       createInstance(Ci.nsISupportsString);
      dataSupportsString.data = dataString;
      // Add the concatenated data to the transferable object.
      transferable.addDataFlavor(type);
      transferable.setTransferData(type, dataSupportsString,
       dataString.length * 2);
    });

    // Copy the data to the clipboard.
    PlacesUIUtils.clipboard.setData(transferable, null,
     Ci.nsIClipboard.kGlobalClipboard);
  },

  /**
   * Removes from the cache the archives containing the selected pages.
   */
  deleteSelection: function() {
    // Find the selected nodes, and exit now if no node is selected.
    var selectedNodes = ArchivesDialog.getSelectedNodes();
    if (!selectedNodes.length)
      return;

    // For every node in the selection
    for (var [, node] in Iterator(selectedNodes)) {
      // Find a reference to the page from the archives cache.
      var page = this.getNodePage(node);
      // If the page is still cached, remove its archive from the cache.
      if (page) {
        ArchiveCache.unregisterArchive(page.archive);
      }
    }

    // Ensure that the archives tree is refreshed immediately.
    ArchivesDialog.requeryPlaces();
  },

  /**
   * Opens the selected nodes in tabs, using the URLs from the specified column.
   */
  openSelectionInTabs: function(aColumnId, aEvent) {
    // Find the selected nodes, and exit now if no node is selected.
    var selectedNodes = ArchivesDialog.getSelectedNodes();
    if (!selectedNodes.length)
      return;

    // For every node in the selection
    var urlsToOpen = [];
    for (var [, node] in Iterator(selectedNodes)) {
      // Find the associated URL, and add it to the list if actually specified.
      var value = ArchivesDialog.getNodeValue(node, aColumnId);
      if (value) {
        urlsToOpen.push({ uri: value, isBookmark: false });
      }
    }

    // If the operation resulted in actual URLs to be opened
    if (urlsToOpen.length) {
      // Open the URLs using a private function of the standard Places
      // utilities for JavaScript.
      PlacesUIUtils._openTabset(urlsToOpen, aEvent);
    }
  },

  // --- Dialog state check functions ---

  /**
   * Update the label of the button that toggles the visibility of the
   * additional archive page details.
   */
  checkShowMore: function() {
    var brShowMore = document.getElementById("brShowMore");
    var btnShowMore = document.getElementById("btnShowMore");
    btnShowMore.setAttribute("label", btnShowMore.getAttribute(
     brShowMore.hidden ? "morelabel" : "lesslabel"));
    btnShowMore.setAttribute("accesskey", btnShowMore.getAttribute(
     brShowMore.hidden ? "moreaccesskey" : "lessaccesskey"));
  },

  /**
   * Updates the displayed information on the current selection in the tree.
   */
  checkPlaceInfo: function() {
    var selectedNodes = ArchivesDialog.getSelectedNodes();

    // Disable the buttons that require a selection.
    document.getElementById("btnDelete").disabled = !selectedNodes.length;

    // For all the possible columns in the archives tree
    var column = ArchivesDialog.archivesTree.columns.getFirstColumn();
    do {
      // Find the elements associated with the current column.
      var fieldName = column.id.slice("tc".length);
      var txtValue = document.getElementById("txt" + fieldName);
      var btnOpenTabs = document.getElementById("btnOpenTabs" + fieldName);

      // Assume that the value is missing, for example if no element is
      // selected.
      var displayValue = "";
      var actionDisabled = true;

      // Find the first node for which a value is actually present.
      for (var [, node] in Iterator(selectedNodes)) {
        // Get the node value with the appropriate data type.
        var value = ArchivesDialog.getNodeValue(node, column.id);
        if (value) {
          // Enable the action associated with the column.
          actionDisabled = false;
          if (selectedNodes.length == 1) {
            // Display a localized long date or the plain string value.
            displayValue = Interface.formatValueForDisplay(value, false);
          } else {
            // Display a placeholder for multiple nodes.
            displayValue = txtValue.getAttribute("multivalue");
          }
          break;
        }
      }

      // Update the elements.
      txtValue.value = displayValue;
      if (btnOpenTabs) {
        btnOpenTabs.disabled = actionDisabled;
      }
    } while ((column = column.getNext()));
  },

  // --- Dialog support functions ---

  /**
   * Returns the current query result of the Places view.
   */
  getResult: function() {
    var result = ArchivesDialog.archivesTree.result ||
     ArchivesDialog.archivesTree.getResult();
    return result.QueryInterface(Ci.nsINavHistoryResult);
  },

  /**
   * Returns the currently selected nodes in the Places view.
   */
  getSelectedNodes: function() {
    return ArchivesDialog.archivesTree.selectedNodes ||
     ArchivesDialog.archivesTree.getSelectionNodes();
  },

  /**
   * Returns the name of the custom annotation associated with the given tree
   * column element, or false if the column is a standard one.
   */
  getColumnAnnotationName: function(aElement) {
    var useAnnotation = (aElement.id.slice(0, "tcMaf".length) === "tcMaf");
    return useAnnotation && aElement.getAttribute("sort");
  },

  /**
   * Returns the value associated with the given column identifier for the
   * provided Places result node. The JavaScript type of the returned value
   * depends on the column. If data for the requested item is not available,
   * null is returned.
   */
  getNodeValue: function(aNode, aColumnId) {
    // If this is a standard column that is actually present in the Places view,
    // access the associated property of the node directly.
    if (aColumnId === "tcPlacesTitle") {
      return aNode.title;
    } else if (aColumnId === "tcPlacesUrl") {
      var annotationValue = new String(aNode.uri);
      annotationValue.isEscapedAsUri = true;
      return annotationValue;
    }
    // Get a reference to the page object associated with the node. If the page
    // is not available anymore, exit now.
    var page = this.getNodePage(aNode);
    if (!page) {
      return null;
    }
    // Access the value of the annotation associated with the column.
    var element = document.getElementById(aColumnId);
    var annotationName = ArchivesDialog.getColumnAnnotationName(element);
    return ArchiveAnnotations.getAnnotationForPage(page, annotationName);
  },

  /**
   * Returns the ArchivePage object associated with the given Places result
   * node, or null if the page is not cached or the URI of the Places item is
   * not valid anymore.
   */
  getNodePage: function(aNode) {
    var nodeUri;
    try {
      nodeUri = Cc["@mozilla.org/network/io-service;1"].
       getService(Ci.nsIIOService).newURI(aNode.uri, null, null);
    } catch (e) {
      // Return null if the URI is invalid.
      return null;
    }
    return ArchiveCache.pageFromUri(nodeUri);
  },
}
