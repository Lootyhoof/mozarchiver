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
 * Provides an RDF data source that represents the tabs available in browser
 * windows. For each tab, a selection state is available, and the list of
 * selected tabs can be retrieved.
 *
 * This class derives from DataSourceWrapper. See the DataSourceWrapper
 * documentation for details.
 *
 * @param aBrowserWindow
 *        Browser window object whose tabs will be available for selection.
 */
function TabsDataSource(aBrowserWindow) {
  // Construct the base class wrapping an in-memory RDF data source.
  DataSourceWrapper.call(this,
   Cc["@mozilla.org/rdf/datasource;1?name=in-memory-datasource"].
   createInstance(Ci.nsIRDFDataSource));

  // Initialize the actual data.
  this._browsers = [];
  this._createDataFromWindow(aBrowserWindow);
}

TabsDataSource.prototype = {
  __proto__: DataSourceWrapper.prototype,

  /**
   * Note: These strings are converted to actual RDF resources by the base class
   * as soon as this data source is constructed, so GetResource must not be
   * called. See the DataSourceWrapper documentation for details.
   */
  resources: {
    // Subjects and objects
    root:      "urn:root",
    windows:   "urn:maf:windows",
    window:    "urn:maf:window",
    // Standard predicates
    instanceOf:   "http://www.w3.org/1999/02/22-rdf-syntax-ns#instanceOf",
    child:        "http://home.netscape.com/NC-rdf#child",
    // Custom predicates
    internalIndex:   "urn:maf:vocabulary#internalIndex",
    title:           "urn:maf:vocabulary#title",
    originalUrl:     "urn:maf:vocabulary#originalUrl",
    checked:         "urn:maf:vocabulary#checked",
  },

  /**
   * Getter for an RDF resource representing a window.
   */
  resourceForWindow: function(aIndex) {
    return this._rdf.GetResource("urn:maf:window#" + aIndex);
  },

  /**
   * Getter for an RDF resource representing a tab.
   */
  resourceForTab: function(aIndex) {
    return this._rdf.GetResource("urn:maf:tab#" + aIndex);
  },

  /**
   * Get an array containing the browser objects only for the tabs that are
   * checked.
   */
  getSelectedTabs: function() {
    var tabsArray = [];

    // Enumerate all the tabs in the single window.
    var windowSequence = this._rdfSequence(this.resourceForWindow(1));
    var windowEnum = windowSequence.GetElements();
    while (windowEnum.hasMoreElements()) {
      var tabResource = windowEnum.getNext();
      // Get the properties of the tab.
      var tabCheckedLiteral = this._wrappedObject.GetTarget(tabResource,
       this.resources.checked, true).QueryInterface(Ci.nsIRDFLiteral);
      var tabInternalIndexLiteral = this._wrappedObject.GetTarget(tabResource,
       this.resources.internalIndex, true).QueryInterface(Ci.nsIRDFInt);
      // Add the tab to the array if required.
      if (tabCheckedLiteral.Value == "true") {
        tabsArray.push(this._browsers[tabInternalIndexLiteral.Value]);
      }
    }

    return tabsArray;
  },

  // nsIRDFDataSource
  Change: function(aSource, aProperty, aOldTarget, aNewTarget) {
    // Only allow changing the "checked" property.
    if (aProperty != this.resources.checked) {
      // Should return NS_RDF_ASSERTION_REJECTED, but it is a success code.
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    }

    // Propagate the change to the wrapped object.
    this._wrappedObject.Change(aSource, aProperty, aOldTarget, aNewTarget);

    // If the selection change is on a container, update the child elements.
    if (this._wrappedObject.HasAssertion(aSource, this.resources.instanceOf,
     this.resources.window, true)) {
      var windowSequence = this._rdfSequence(aSource);
      var newSelectionState = (aNewTarget.Value == "true");
      var windowEnum = windowSequence.GetElements();
      while (windowEnum.hasMoreElements()) {
        var tabResource = windowEnum.getNext();
        // Change the selection on the element, by removing the assertion that
        // is no longer true and adding the new assertion.
        this._wrappedObject.Assert(tabResource, this.resources.checked,
         this._rdfBool(newSelectionState), true);
        this._wrappedObject.Unassert(tabResource, this.resources.checked,
         this._rdfBool(!newSelectionState));
      }
    } else {
      // If the selection change is on a child element, update the container.
      var windowResource = this.resourceForWindow(1);
      var allTabsSelected =
       (this.getSelectedTabs().length == this._browsers.length);
      // Change the selection on the element, by removing the assertion that is
      // no longer true and adding the new assertion.
      this._wrappedObject.Assert(windowResource, this.resources.checked,
       this._rdfBool(allTabsSelected), true);
      this._wrappedObject.Unassert(windowResource, this.resources.checked,
       this._rdfBool(!allTabsSelected));
    }
  },

  /**
   * Populates the data source with the actual data derived from the open tabs
   * in the provided window.
   *
   * This is the tree-like structure of the RDF data:
   *
   *   *** [urn:root] ***
   *   |
   *   +- http://www.w3.org/1999/02/22-rdf-syntax-ns#instanceOf
   *   |  > [urn:root]
   *   |
   *   +- http://home.netscape.com/NC-rdf#child
   *      > *** [urn:maf:windows] ***
   *        |
   *        +- http://www.w3.org/1999/02/22-rdf-syntax-ns#instanceOf
   *        |  > [urn:maf:windows]
   *        |
   *        +- urn:maf:vocabulary#Title
   *        |  > nsIRDFLiteral (for example "Window title")
   *        |
   *        +- urn:maf:vocabulary#Checked
   *        |  > nsIRDFLiteral ("true" or "false")
   *        |
   *        +- <sequence member>
   *           > *** [urn:maf:window#<...>] ***
   *             |
   *             +- http://www.w3.org/1999/02/22-rdf-syntax-ns#instanceOf
   *             |  > [urn:maf:window]
   *             |
   *             +- urn:maf:vocabulary#Checked
   *             |  > nsIRDFLiteral ("true" or "false")
   *             |
   *             +- <sequence member>
   *                > *** [urn:maf:tab#<...>] ***
   *                  |
   *                  +- urn:maf:vocabulary#InternalIndex
   *                  |  > nsIRDFInt
   *                  |
   *                  +- urn:maf:vocabulary#Title
   *                  |  > nsIRDFLiteral (for example "Page title")
   *                  |
   *                  +- urn:maf:vocabulary#OriginalURL
   *                  |  > nsIRDFLiteral (for example "http://...")
   *                  |
   *                  +- urn:maf:vocabulary#Checked
   *                     > nsIRDFLiteral ("true" or "false")
   *
   * Legend:
   *
   *   *** [SUBJECT RESOURCE URL] *** (<...> = variable part of the URL)
   *   |
   *   +- PREDICATE RESOURCE URL
   *   |   > [OBJECT RESOURCE URL]
   *   |
   *   +- PREDICATE RESOURCE URL
   *       > Object interface type (with examples or description)
   *
   */
  _createDataFromWindow: function(aBrowserWindow) {
    // Shorthand for objects commonly used throughout this function.
    var ds = this._wrappedObject;
    var res = this.resources;

    // Create the root of the tree, that has a single child pointing to the
    // list of windows. This is required for properly handling the recursive XUL
    // template generation that is used to create XUL trees.
    ds.Assert(res.root, res.instanceOf, res.root, true);
    ds.Assert(res.root, res.child, res.windows, true);

    // Create the "windows" resource, which is an RDF container of windows.
    var windowsSequence = this._rdfSequence(res.windows);
    ds.Assert(res.windows, res.instanceOf, res.windows, true);

    // Set additional properties of the "windows" resource.
    ds.Assert(res.windows, res.checked, this._rdfBool(false), true);

    // Create the "window" resource, which is an RDF container of tabs, and add
    // it to the parent container.
    var windowResource = this.resourceForWindow(1);
    var windowSequence = this._rdfSequence(windowResource);
    ds.Assert(windowResource, res.instanceOf, res.window, true);
    windowsSequence.AppendElement(windowResource);

    // Set additional properties of the "window" resource.
    ds.Assert(windowResource, res.title,
     this._rdf.GetLiteral(aBrowserWindow.document.title), true);
    ds.Assert(windowResource, res.checked, this._rdfBool(false), true);

    // For each tab that is available
    var selectedTabIndex = -1;
    var browsers = aBrowserWindow.getBrowser().browsers;
    for (var i = 0; i < browsers.length; i++) {
      // Copy the browser object reference to the internal array.
      this._browsers.push(browsers[i]);

      // Create the "tab" resource and add it to the parent container.
      var tabResource = this.resourceForTab(i + 1);
      windowSequence.AppendElement(tabResource);

      // Set the internal index in the array as an RDF integer.
      ds.Assert(tabResource, res.internalIndex,
       this._rdf.GetIntLiteral(this._browsers.length - 1), true);

      // Set the tab label as an RDF literal. The actual label displayed in the
      // user interface is shown, which is not necessarily the page title.
      var tabTitle = aBrowserWindow.getBrowser().mTabs[i].label;
      ds.Assert(tabResource, res.title,
       this._rdf.GetLiteral(tabTitle), true);

      // Set the original URL of the document as an RDF literal.
      var pageUrl = browsers[i].contentDocument.location.href;
      ds.Assert(tabResource, res.originalUrl,
       this._rdf.GetLiteral(pageUrl), true);

      // Add the checked state.
      ds.Assert(tabResource, res.checked, this._rdfBool(false), true);

      // Remember the index of the selected tab for later.
      if (browsers[i] == aBrowserWindow.getBrowser().selectedBrowser) {
        selectedTabIndex = i;
      }
    }

    // Now that the data source is fully populated, update the selection state
    // for the current tab in the window.
    if (selectedTabIndex >= 0) {
      // Switch the state of the checkbox. If this is the only tab in the
      // window, the containing window resource will also be selected.
      var selectedTabResource = this.resourceForTab(selectedTabIndex + 1);
      this.Change(selectedTabResource, res.checked, this._rdfBool(false),
       this._rdfBool(true));
    }
  },

  /**
   * Actual browser objects associated with this data source.
   */
  _browsers: [],
}
