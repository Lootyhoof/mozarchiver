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

const { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

Cu.import("chrome://mza/content/MozillaArchiveFormat.jsm");

/**
 * Handles the MAF tab save dialog.
 *
 * The opener of the dialog must provide the following parameters:
 *
 * @param window.arguments[0]
 *        Browser window whose tabs should be saved.
 * @param window.arguments[1]
 *        JavaScript object whose "selectedTabs" array will be populated with
 *        the user selection if the save operation is not canceled.
 */
var MultiSaveDialog = {
  _browserWindow: window.arguments[0],
  _returnValues: window.arguments[1],

  /**
   * The data source for the tabs tree view.
   */
  _tabsDataSource: null,

  /**
   * The customized view for the tabs tree. The purpose of this property is to
   * keep a reference to the customized JavaScript object implementing the view.
   * If this explicit reference is not kept, the tree view can lose its
   * customizations during garbage collection.
   */
  _tabsTreeView: null,

  /**
   * Create the elements to be displayed.
   */
  onLoadDialog: function() {
    // Get references to the controls to be initialized.
    var tabsTree = document.getElementById("treeTabs");
    var treeView = tabsTree.view;

    // Store a reference to the tree view to prevent it from losing its
    // customizations during garbage collection.
    this._tabsTreeView = treeView;

    // Create the data source for the tree and assign it. The tabs data source
    // created here always loads synchronously.
    var tabsDataSource = new TabsDataSource(this._browserWindow);
    tabsTree.database.AddDataSource(tabsDataSource);
    tabsTree.builder.rebuild();

    // When the checkbox column is modified, the setCellValue function of the
    // tree view is called, with aValue set to either the string "true" or
    // "false". This implementation propagates the change to the underlying data
    // source.
    treeView.setCellValue = function(aRow, aCol, aValue) {
      if (aCol.id == "tcChecked") {
        // Execute the change.
        tabsDataSource.replaceLiteral(treeView.getResourceAtIndex(aRow),
         tabsDataSource.resources.checked, aValue);
        // Update the dialog buttons.
        MultiSaveDialog.checkButtonState();
      }
    };

    // Expand all nodes and subnodes in the tree.
    for (var rowNum = 0; rowNum < treeView.rowCount; rowNum++) {
      if (treeView.isContainer(rowNum) && !treeView.isContainerOpen(rowNum)) {
        treeView.toggleOpenState(rowNum);
      }
    }

    // Store a reference to the tabs data source.
    this._tabsDataSource = tabsDataSource;

    // Update the dialog buttons.
    this.checkButtonState();
  },

  /**
   * Return the list of selected tabs to the caller.
   */
  onDialogAccept: function() {
    this._returnValues.selectedTabs = this._tabsDataSource.getSelectedTabs();
    return true;
  },

  /**
   * Invert the checked state of the tree selection when space is pressed.
   */
  onTreeKeyPress: function(aEvent) {
    if (aEvent.charCode != KeyEvent.DOM_VK_SPACE)
      return;

    var tabsTree = document.getElementById("treeTabs");
    var treeView = tabsTree.view;
    var checkboxColumn = tabsTree.columns["tcChecked"];
    var forbidChildChanges = false;
    for (var i = 0; i < treeView.selection.getRangeCount(); i++) {
      var start = {}, end = {};
      treeView.selection.getRangeAt(i, start, end);
      for (var rowNum = start.value; rowNum <= end.value; rowNum++) {
        // If we are changing the state of a container, ignore the selection
        // changes on its children.
        var isContainer = (rowNum === 0);
        if (isContainer) {
          forbidChildChanges = true;
        }
        // Invert the checked state of the row.
        if (isContainer || !forbidChildChanges) {
          var oldValue = treeView.getCellValue(rowNum, checkboxColumn);
          var newValue = (oldValue == "true" ? "false" : "true");
          treeView.setCellValue(rowNum, checkboxColumn, newValue);
        }
      }
    }
  },

  /**
   * Enable the save button only if at least one tab is selected.
   */
  checkButtonState: function() {
    var selectedTabs = this._tabsDataSource.getSelectedTabs();
    document.getElementById("multiSaveDialog").getButton("accept").disabled =
     !selectedTabs.length;
  },
}
