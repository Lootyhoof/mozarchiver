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
 * Handles the saved pages conversion dialog.
 */
var ConvertDialog = {
  /**
   * The main wizard element.
   */
  _wizard: null,

  /**
   * The candidates tree element.
   */
  _candidatesTree: null,

  /**
   * The customized view for the candidates tree. The purpose of this property
   * is to keep a reference to the customized JavaScript object implementing
   * the view. If this explicit reference is not kept, the tree view can lose
   * its customizations during garbage collection.
   */
  _candidatesTreeView: null,

  /**
   * The data source for the candidates tree view, or null if the candidates
   * page has not been reached yet. This data source will be populated with the
   * results provided by the CandidateFinder worker object.
   */
  _candidatesDataSource: null,

  /**
   * Localized templates with the selection count for the candidates tree.
   */
  _searchingCountsText: "",
  _convertingCountsText: "",

  /**
   * Original label and access key for the wizard's Finish button.
   */
  _wizardFinishLabel: "",
  _wizardFinishAccessKey: "",

  /**
   * The CandidateFinder worker object. The properties of this object will be
   * set by various pages of the wizard.
   */
  _finder: null,

  /**
   * The AsyncEnumerator object linked to the CandidateFinder worker object, or
   * null if the search for source files is not running.
   */
  _finderEnumerator: null,

  /**
   * The AsyncEnumerator object for the candidates conversion process, or null
   * if the conversion process is not running.
   */
  _conversionEnumerator: null,

  /**
   * The candidate that is being converted.
   */
  _currentCandidate: null,

  /**
   * Set to true when the conversion process has finished. In this case,
   * clicking the finish button will close the window.
   */
  _conversionFinished: false,

  /**
   * Create the elements to be displayed.
   */
  onLoadDialog: function() {
    // Initialize the member variables.
    this._wizard = document.getElementById("convertDialog");
    this._candidatesTree = document.getElementById("treeCandidates");
    this._finder = new CandidateFinder();

    // The main form contains some labels that mention the wizard buttons. Since
    // the actual text of the wizard buttons depends on the current platform,
    // the text is retrieved dynamically and replaced in all the labels that
    // require it.
    for (var [, [labelName, buttonName]] in Iterator([
     ["lblIntroductionContinue",    "next"],
     ["lblFormatsContinue",         "next"],
     ["lblFoldersSourceContinue",   "next"],
     ["lblFoldersDestContinue",     "next"],
     ["lblCandidatesNone",          "back"],
     ["lblCandidatesFinish",        "finish"],
    ])) {
      // Replace "$1" with the current label of the correct wizard button.
      var labelElement = document.getElementById(labelName);
      labelElement.value = labelElement.value.replace(/\$1/g,
       this._getWizardButtonLabel(buttonName));
    }

    // Retrieve the text of some controls and store it for later use.
    this._searchingCountsText = document.
     getElementById("descCandidatesCounts").getAttribute("valuesearching");
    this._convertingCountsText = document.
     getElementById("descCandidatesCounts").getAttribute("valueconverting");
    this._wizardFinishLabel = this._wizard.getButton("finish").label;
    this._wizardFinishAccessKey = this._wizard.getButton("finish").
     getAttribute("accesskey");

    // Store a reference to the tree view to prevent it from losing its
    // customizations during garbage collection.
    this._candidatesTreeView = this._candidatesTree.view;

    // When the checkbox column is modified, the setCellValue function of the
    // tree view is called, with aValue set to either the string "true" or
    // "false". This implementation propagates the change to the underlying data
    // source, if the checkbox for the requested item is enabled.
    var self = this;
    this._candidatesTreeView.setCellValue = function(aRow, aCol, aValue) {
      if (aCol.id == "tcChecked") {
        // Ensure that the data source is available and modifiable.
        var ds = self._candidatesDataSource;
        if (!ds || ds.selectionDisabled) {
          return;
        }
        // Check if the selection state of the selected item is modifiable.
        var resource = self._candidatesTreeView.getResourceAtIndex(aRow);
        if (ds.getLiteralValue(resource, ds.resources.disabled)) {
          return;
        }
        // Execute the requested change.
        ds.replaceLiteral(resource, ds.resources.checked, aValue);
        // Update the dialog buttons.
        self.checkCandidatesControls();
      }
    };

    // In order to prevent the conversion process from blocking, disable the
    // content features that may cause dialogs to be displayed, for example
    // message boxes put up by embedded JavaScript.
    var conversionDocShell = document.getElementById("frmConvert").docShell;
    conversionDocShell.allowAuth = false;
    conversionDocShell.allowJavascript = false;
    conversionDocShell.allowPlugins = false;
  },

  /**
   * On the introduction page, the button to advance to the next page is always
   * enabled, and is selected instead of the website link.
   */
  checkIntroductionControls: function() {
    document.getElementById("convertDialog").canAdvance = true;
    document.getElementById("convertDialog").getButton("next").focus();
  },

  /**
   * Copies the data from the controls in the "formats" wizard page to the
   * worker object, and prevents advancing to the next page if the data is
   * invalid.
   */
  checkFormatsControls: function() {
    // Copy the data from the controls to the worker object.
    this._finder.sourceFormat =
     document.getElementById("rgrFormatsSource").value;
    this._finder.destFormat =
     document.getElementById("rgrFormatsDest").value;

    // Ask the worker object if the data is valid.
    var pageIsValid = this._finder.validateFormats();

    // Show the appropriate controls based on the validation results.
    document.getElementById("lblFormatsInvalid").hidden = pageIsValid;
    document.getElementById("lblFormatsContinue").hidden = !pageIsValid;
    this._wizard.canAdvance = pageIsValid;
  },

  /**
   * Copies the data from the controls in the "source folders" wizard page to
   * the worker object, and prevents advancing to the next page if the data is
   * invalid.
   */
  checkFoldersSourceControls: function() {
    // Validate the data from the controls and copy it to the worker object.
    var pageIsValid = true;
    try {
      // Set the source folder, that must exist.
      this._finder.location.source =
       this._getFolderFromTextbox("txtFoldersSource", true);
    } catch(e) {
      // If an exception is thrown, the source folder is missing or invalid.
      pageIsValid = false;
    }
    this._finder.sourceIncludeSubfolders =
     document.getElementById("chkFoldersSourceSubfolders").checked;

    // Show the appropriate controls based on the validation results.
    document.getElementById("lblFoldersSourceInvalid").hidden = pageIsValid;
    document.getElementById("lblFoldersSourceContinue").hidden = !pageIsValid;
    this._wizard.canAdvance = pageIsValid;
  },

  /**
   * Copies the data from the controls in the "destination folders" wizard page
   * to the worker object, and prevents advancing to the next page if the data
   * is invalid.
   */
  checkFoldersDestControls: function() {
    // Check the status of the controls for the destination and bin folders.
    var useDestFolder =
     (document.getElementById("rgrFoldersDest").value == "folder");
    var useBinFolder =
     (document.getElementById("rgrFoldersBin").value == "folder");
    document.getElementById("txtFoldersDest").disabled = !useDestFolder;
    document.getElementById("btnFoldersDest").disabled = !useDestFolder;
    document.getElementById("txtFoldersBin").disabled = !useBinFolder;
    document.getElementById("btnFoldersBin").disabled = !useBinFolder;

    // Validate the data from the controls and copy it to the worker object.
    var pageIsValid = true;
    try {
      // Set the destination folder equal to the source folder if required.
      this._finder.location.dest = (useDestFolder ?
       this._getFolderFromTextbox("txtFoldersDest") :
       this._finder.location.source);
      // Set the bin folder only if required.
      this._finder.location.bin = (useBinFolder ?
       this._getFolderFromTextbox("txtFoldersBin") :
       null);
    } catch(e) {
      // If an exception is thrown, at least one folder is invalid.
      pageIsValid = false;
    }

    // Show the appropriate controls based on the validation results.
    document.getElementById("lblFoldersDestInvalid").hidden = pageIsValid;
    document.getElementById("lblFoldersDestContinue").hidden = !pageIsValid;
    this._wizard.canAdvance = pageIsValid;
  },

  /**
   * Determines the proper status of the controls when the "candidates" wizard
   * page is displayed, based on the current state of the worker objects.
   */
  checkCandidatesControls: function() {
    // The page can be in one of the following states:
    //   - Searching for candidates (searching)
    //   - Selecting which candidates should be converted (selecting)
    //   - Converting the selected candidates (converting)
    //   - Displaying the conversion results (finished)
    var searching = !!this._finderEnumerator;
    var converting = !!this._conversionEnumerator;
    var finished = this._conversionFinished;
    var selecting = !searching && !converting && !finished;

    // Update the label with the counts related to the candidates tree.
    var counts = this._candidatesDataSource.counts;
    // Since candidates that have been already converted are always selected,
    // they must be subtracted from the selected items count to determine how
    // many candidates should be converted.
    var selectableCount = counts.total - counts.obstructed;
    var selectedCount = counts.checked - counts.obstructed;
    // If candidate conversion hasn't started yet, show only the counts related
    // to candidate selection, otherwise show all the available counts.
    var countsText = (searching || selecting) ? this._searchingCountsText :
     this._convertingCountsText;
    document.getElementById("descCandidatesCounts").firstChild.nodeValue =
     countsText.
     replace(/\$1/g, counts.total).
     replace(/\$2/g, counts.obstructed).
     replace(/\$3/g, selectedCount).
     replace(/\$4/g, counts.converted).
     replace(/\$5/g, counts.failed);

    // Show the appropriate controls based on the current state.
    for (var [, [labelName, visible]] in Iterator([
     ["lblCandidatesSearching", searching                                     ],
     ["lblCandidatesConverting",converting                                    ],
     ["lblCandidatesNone",      selecting && !selectableCount                 ],
     ["lblCandidatesInvalid",   selecting && selectableCount && !selectedCount],
     ["lblCandidatesConvert",   selecting && selectedCount                    ],
     ["lblCandidatesFinish",    finished                                      ],
    ])) {
      document.getElementById(labelName).hidden = !visible;
    }

    // Set the appropriate label for the Finish button.
    var finishButton = this._wizard.getButton("finish");
    if (searching || selecting) {
      var convertButton = document.getElementById("btnCandidatesConvert");
      finishButton.label = convertButton.label;
      finishButton.setAttribute("accesskey",
        convertButton.getAttribute("accesskey"));
    } else {
      finishButton.label = this._wizardFinishLabel;
      finishButton.setAttribute("accesskey", this._wizardFinishAccessKey);
    }

    // Disable the finish button unless conversion is ready or finished.
    this._wizard.getButton("finish").disabled =
     !((selecting && selectedCount) || finished);
  },

  /**
   * When the "candidates" wizard page, which is the last one, is displayed,
   * this function initiates the scanning of the requested source folder. When
   * scanning is completed, the user can select the files to convert and start
   * the operation using the finish button.
   */
  onCandidatesPageShow: function() {
    // If a data source for the tree is already present, detach it.
    var tree = this._candidatesTree;
    if (this._candidatesDataSource) {
      tree.database.RemoveDataSource(this._candidatesDataSource);
    }
    // Create the new data source for the tree and assign it. The candidates
    // data source created here initially contains only the root element.
    var ds = new CandidatesDataSource();
    this._candidatesDataSource = ds;
    tree.database.AddDataSource(ds);
    // Rebuild the tree contents from scratch.
    tree.builder.rebuild();
    // Ensure that the root container is open.
    if (!tree.view.isContainerOpen(0)) {
      tree.view.toggleOpenState(0);
    }

    // Indicate that a new conversion process is starting.
    this._conversionFinished = false;

    // Prepare the asynchronous enumerator to locate the candidates.
    var self = this;
    this._finderEnumerator = new AsyncEnumerator(
      this._finder,
      function(candidate) {
        // The candidate finder may generate null values from time to time. This
        // is done to keep the user interface responsive even while no results
        // are being retrieved.
        if (candidate) {
          // Add the new candidate to the data source.
          ds.addCandidate(candidate);
          // Update the controls based on the current state.
          self.checkCandidatesControls();
        }
      },
      function() {
        // The operation completed successfully. Update the current state by
        // removing the reference to the enumerator.
        self._finderEnumerator = null;
        // If no candidates can be selected, disable the root of the tree.
        if (!(ds.counts.total - ds.counts.obstructed)) {
          ds.replaceLiteral(ds.resources.candidates, ds.resources.disabled,
           "disabled");
        }
        // Update the controls based on the current state.
        self.checkCandidatesControls();
      }
    );

    // Update the controls based on the current state.
    this.checkCandidatesControls();

    // Start the asynchronous enumeration.
    this._finderEnumerator.start();
  },

  /**
   * This function is called when the "candidates" wizard page is being hidden
   * because the back button has been clicked. This function is also called
   * indirectly when the window is being closed.
   */
  onCandidatesPageRewound: function() {
    // Before stopping the conversion enumerator, ensure that no candidate is
    // being converted. If a candidate is being converted, the conversion
    // enumerator is always present and paused. Canceling the conversion ensures
    // that the conversion enumerator is not resumed.
    var currentCandidate = this._currentCandidate;
    if (currentCandidate) {
      this._currentCandidate = null;
      currentCandidate.cancelConversion();
    }
    // Ensure that the asynchronous enumerator for finding sources is stopped.
    var finderEnumerator = this._finderEnumerator;
    if (finderEnumerator) {
      this._finderEnumerator = null;
      finderEnumerator.stop();
    }
    // Ensure that the asynchronous enumerator for conversion is stopped.
    var conversionEnumerator = this._conversionEnumerator;
    if (conversionEnumerator) {
      this._conversionEnumerator = null;
      conversionEnumerator.stop();
    }
  },

  /**
   * Starts the actual conversion process or closes the window.
   */
  onWizardFinish: function() {
    // Since this function may be re-entered if the Enter key is pressed, even
    // if the finish button is disabled, explicitly check for this condition.
    if (this._wizard.getButton("finish").disabled) {
      return false;
    }

    // If the conversion process finished, close the window and exit now.
    if (this._conversionFinished) {
      return true;
    }

    // From now on, the selected candidates cannot be changed.
    var ds = this._candidatesDataSource;
    ds.selectionDisabled = true;
    // Modify the properties of the root element to indicate that the conversion
    // process is running and to prevent modification of the selection state.
    var resource = ds.resources.candidates;
    ds.replaceLiteral(resource, ds.resources.converting, "converting");
    ds.replaceLiteral(resource, ds.resources.disabled, "disabled");
    // For all the available candidates
    for (var [, candidate] in Iterator(ds.candidates)) {
      // Prevent modification of the selection state.
      resource = ds.resourceForCandidate(candidate.internalIndex);
      ds.replaceLiteral(resource, ds.resources.disabled, "disabled");
      // If the candidate has not been already converted and has been selected
      if (ds.getLiteralValue(resource, ds.resources.checked) == "true" &&
       !candidate.obstructed) {
        // Enqueue the candidate for conversion.
        ds.replaceLiteral(resource, ds.resources.enqueued, "enqueued");
      }
    }

    // Prepare the asynchronous enumerator to convert the candidates.
    var self = this;
    this._conversionEnumerator = new AsyncEnumerator(
      ds.candidates,
      function([, candidate]) {
        // If the candidate is not enqueued, continue with the next item.
        var resource = ds.resourceForCandidate(candidate.internalIndex);
        if (!ds.getLiteralValue(resource, ds.resources.enqueued)) {
          return;
        }
        // Show that the candidate is being converted.
        ds.replaceLiteral(resource, ds.resources.converting, "converting");
        // Update the controls based on the current state.
        self.checkCandidatesControls();
        // Set the required references to use this window for conversion.
        candidate.conversionWindow = window;
        candidate.conversionFrame = document.getElementById("frmConvert");
        // Stop the enumeration temporarily and start the conversion process.
        self._conversionEnumerator.pause();
        self._currentCandidate = candidate;
        candidate.convert(function(aSuccess) {
          // Indicate that the candidate conversion finished.
          self._currentCandidate = null;
          // Show the conversion results for the candidate.
          if (aSuccess) {
            ds.replaceLiteral(resource, ds.resources.converted, "converted");
          } else {
            ds.replaceLiteral(resource, ds.resources.failed, "failed");
          }
          // Resume the enumeration.
          self._conversionEnumerator.start();
        });
      },
      function() {
        // The operation completed successfully. Update the current state and
        // remove the reference to the enumerator.
        self._conversionFinished = true;
        self._conversionEnumerator = null;
        // Show the overall success status on the root element of the tree.
        var resource = ds.resources.candidates;
        if (ds.counts.failed == 0) {
          ds.replaceLiteral(resource, ds.resources.converted, "converted");
        } else {
          ds.replaceLiteral(resource, ds.resources.failed, "failed");
        }
        // Update the controls based on the current state.
        self.checkCandidatesControls();
      }
    );

    // Update the controls based on the current state.
    this.checkCandidatesControls();

    // Start the asynchronous enumeration.
    this._conversionEnumerator.start();

    // Do not close the window.
    return false;
  },

  /**
   * Performs the necessary cleanup before closing the window.
   */
  onWizardCancel: function() {
    this.onCandidatesPageRewound();
    return true;
  },

  /**
   * Inverts the checked state of the tree selection when space is pressed.
   */
  onTreeKeyPress: function(aEvent) {
    if (aEvent.charCode != KeyEvent.DOM_VK_SPACE)
      return;

    var treeView = this._candidatesTreeView;
    var checkboxColumn = this._candidatesTree.columns["tcChecked"];
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
   * Shows a file selector allowing the user to select the absolute path of a
   * folder to be placed in the textbox linked to this control. The "input"
   * event handler of the textbox is called after a folder has been selected.
   */
  browseForFolder: function(aEvent) {
    // Initialize the file picker component.
    var filePicker = Cc["@mozilla.org/filepicker;1"].
     createInstance(Ci.nsIFilePicker);
    filePicker.init(window, document.title, Ci.nsIFilePicker.modeGetFolder);
    // Get a reference to the linked textbox control.
    var textboxElement = document.getElementById(
     aEvent.target.getAttribute("control"));
    // Find the directory currently displayed in the user interface. If there is
    // already a directory selected, attempt to use it as the default in the
    // file picker dialog. If the path is invalid, do nothing.
    if (textboxElement.value) {
      try {
        var targetFile = Cc["@mozilla.org/file/local;1"].
         createInstance(Ci.nsILocalFile);
        targetFile.initWithPath(textboxElement.value);
        filePicker.displayDirectory = targetFile;
      } catch (e) { /* Ignore errors */ }
    }
    // If the user made a selection
    if (filePicker.show() == Ci.nsIFilePicker.returnOK) {
      // Update the displayed value.
      textboxElement.value = filePicker.file.path;
      // Call the event handler that updates the status of the other controls.
      var event = document.createEvent("UIEvent");
      event.initUIEvent("input", true, true, window, 0);
      textboxElement.dispatchEvent(event);
    }
  },

  /**
   * Returns the label of the wizard button identified by the given name,
   * excluding the characters that represent the arrows.
   */
  _getWizardButtonLabel: function(aButtonName) {
    return this._wizard.getButton(aButtonName).label.
     replace(/^[< ]+|[ >]+$/, "");
  },

  /**
   * Creates an nsIFile object from the text in the given element. If the object
   * cannot be created or the path does not refer to a folder, an exception is
   * thrown. If the aMustExist parameter is true, an exception is thrown also if
   * the folder does not exist.
   */
  _getFolderFromTextbox: function(aTextboxElementId, aMustExist) {
    // Find the directory currently displayed in the user interface.
    var folderPath = document.getElementById(aTextboxElementId).value;
    // Create the object and check that it refers to a folder.
    var targetFile = Cc["@mozilla.org/file/local;1"].
     createInstance(Ci.nsILocalFile);
    targetFile.initWithPath(folderPath);
    if (aMustExist && !targetFile.exists()) {
      throw "The path does not exist";
    }
    if (targetFile.exists() && !targetFile.isDirectory()) {
      throw "The path does not refer to a directory";
    }
    // Return the new object.
    return targetFile;
  },
}
