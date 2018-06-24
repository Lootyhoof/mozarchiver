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
 * Objects derived from this class are the nodes of a tree representing a
 * structured source file. By manipulating the nodes, portions of the source
 * file can be altered without affecting the rest of the file.
 *
 * @param aSourceData
 *        The initial raw text associated with this node.
 * @param aOptions
 *        Optional object whose properties define the behavior to apply when
 *        interacting with the content and parsing it. The properties of this
 *        object are never modified.
 */
function SourceFragment(aSourceData, aOptions) {
  this._options = aOptions || {};

  // Initialize other member variables explicitly.
  this._children = [];

  // Initialize the object by calling the appropriate property setter.
  this.sourceData = aSourceData;
}

SourceFragment.prototype = {

  /**
   * String representing the raw data in the fragment.
   */
  get sourceData() {
    // If this node is unparsed, simply return the raw data.
    if (!this._parsed) {
      return this._sourceData;
    }

    // Reconstruct the source data from the parsed objects.
    return [for (fragment of Iterator(this)) fragment.sourceData].join("");
  },
  set sourceData(aValue) {
    // When there is new data, it is initially unparsed.
    this._parsed = false;
    this._sourceData = aValue;
  },

  /**
   * Splits the current unparsed text into fragments.
   *
   * This method can be used only with some of the derived classes.
   */
  parse: function() {
    // Initialize the array of parsed fragments for the actual parser.
    this._children = [];
    // Execute the actual parsing of the raw text.
    var self = this;
    this._executeParse(function() {
      self._addChildFragment.apply(self, arguments);
    });
    // If no exception occurred, use the parsed fragments.
    this._parsed = true;
  },

  /**
   * This iterator yields the individual unparsed fragments that are descendants
   * of this node. If this is an unparsed leaf node, this iterator returns the
   * object itself.
   */
  __iterator__: function() {
    if (!this._parsed) {
      // This is a leaf node.
      yield this;
    } else {
      // Examine every available child fragment in order.
      for (var [, child] in Iterator(this._children)) {
        // Propagate the results of calling the child's iterator.
        for (var fragment in child) {
          yield fragment;
        }
      }
    }
  },

  /**
   * True if the source data has been split into child fragments, or false if
   * this is a leaf node.
   */
  _parsed: false,

  /**
   * Data associated with this leaf node, used only if "_parsed" is false.
   */
  _sourceData: "",

  /**
   * Array of SourceFragment objects that represent the children of this node.
   * This array is populated only if "_parsed" is true.
   */
  _children: [],

  /**
   * This object contains the options specified on construction, and is used by
   * the derived classes.
   */
  _options: {},

  /**
   * Splits the current unparsed text into fragments.
   *
   * Derived objects that support parsing must implement this method explicitly.
   *
   * @param aAddFn
   *        Provides a reference to the _addChildFragment function of this
   *        object, used as a shorthand by the parsing code.
   */
  _executeParse: function(aAddFn) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * This function is called by the parser implementation to add a new child
   * fragment of the specified type if the provided data is not empty.
   *
   * @param aTypeCtor
   *        The constructor function for the fragment type.
   * @param aSourceData
   *        Actual text that is provided to the fragment constructor. If empty,
   *        no new fragment is created.
   * @param aOptions
   *        Options that are passed to the fragment constructor. If empty,
   *        options from this fragment are propagated.
   */
  _addChildFragment: function(aTypeCtor, aSourceData, aOptions) {
    if (aSourceData) {
      this._children.push(
       new aTypeCtor(aSourceData, aOptions || this._options));
    }
  },
}
