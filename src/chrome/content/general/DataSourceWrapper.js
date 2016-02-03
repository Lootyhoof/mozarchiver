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
 * Base class that can be used to implement RDF data sources by wrapping an
 * inner data source. This class contains the wrapping logic and provides
 * convenience methods for manipulating the underlying data source.
 *
 * For general information about RDF data sources in Mozilla, see
 * <https://developer.mozilla.org/en/RDF_in_Mozilla_FAQ> (retrieved 2009-09-28).
 * For more information on RDF data source implementation techniques, see
 * <https://developer.mozilla.org/en/RDF_Datasource_How-To> (retrieved
 * 2009-09-28).
 *
 * @param aInnerDataSource
 *        An object implementing the nsIRDFDataSource interface that will be
 *        wrapped.
 */
function DataSourceWrapper(aInnerDataSource) {
  // This object allows the implementation of the nsIRDFDataSource interface by
  // forwarding most of the calls to an in-memory data source. The first part of
  // the initialization consists in creating the wrapper functions.

  // This function creates a forwarding function for aInnerDataSource.
  function makeForwardingFunction(functionName) {
    return function() {
      return aInnerDataSource[functionName].apply(aInnerDataSource, arguments);
    }
  }

  // Forward all the functions that are not explicitly overridden.
  for (var propertyName in aInnerDataSource) {
    if (typeof aInnerDataSource[propertyName] == "function" &&
     !(propertyName in this)) {
      this[propertyName] = makeForwardingFunction(propertyName);
    }
  }

  // We also set up a convenience access to some of the RDF resource objects
  // that are commonly used with this data source. This way, users don't need to
  // call GetResource repeatedly.
  for (var resourceId in this.resources) {
    if (this.resources.hasOwnProperty(resourceId)) {
      var resource = this.resources[resourceId];
      // Since the inner "resources" object is often stored in the prototype of
      // the derived classes, it is shared by all the instances of the data
      // source created from the same prototype, and the translation from URL to
      // RDF resource may have been already done.
      if (typeof resource == "string") {
        this.resources[resourceId] = this._rdf.GetResource(resource);
      }
    }
  }

  // Store a reference to the wrapped object.
  this._wrappedObject = aInnerDataSource;
}

DataSourceWrapper.prototype = {
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIRDFDataSource,
  ]),

  /**
   * Collection of RDF resource objects that form the common subjects and the
   * vocabulary of this RDF data source.
   *
   * Derived classes usually override this property in their prototype, defining
   * the resource URLs as strings. The strings are converted to actual RDF
   * resources as soon as the first instance of the data source is constructed.
   *
   * The original resource URLs can be retrieved using the ValueUTF8 property of
   * the resource objects.
   */
  resources: {},

  /**
   * Returns the value of the literal to which the given property points.
   */
  getLiteralValue: function(aSource, aProperty) {
    return this.GetTarget(aSource, aProperty, true).
     QueryInterface(Ci.nsIRDFLiteral).Value;
  },

  /**
   * Replaces the literal to which the given property points.
   */
  replaceLiteral: function(aSource, aProperty, aNewValue) {
    // Find the RDF nodes to be modified, assuming that the required assertion
    // already exists in the data source.
    var oldRdfLiteral = this.GetTarget(aSource, aProperty, true);
    var newRdfLiteral = this._rdf.GetLiteral(aNewValue);
    // Execute the change.
    this.Change(aSource, aProperty, oldRdfLiteral, newRdfLiteral);
  },

  // nsIRDFDataSource
  Assert: function(aSource, aProperty, aTarget, aTruthValue) {
    // Should return NS_RDF_ASSERTION_REJECTED, but it is a success code.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIRDFDataSource
  Change: function(aSource, aProperty, aOldTarget, aNewTarget) {
    // Should return NS_RDF_ASSERTION_REJECTED, but it is a success code.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIRDFDataSource
  Move: function(aOldSource, aNewSource, aProperty, aTarget) {
    // Should return NS_RDF_ASSERTION_REJECTED, but it is a success code.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIRDFDataSource
  Unassert: function(aSource, aProperty, aTarget) {
    // Should return NS_RDF_ASSERTION_REJECTED, but it is a success code.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * Returns an RDF literal containing either "true" or "false".
   */
  _rdfBool: function(aBooleanValue) {
    return this._rdf.GetLiteral(aBooleanValue ? "true" : "false");
  },

  /**
   * Makes an RDF sequence associated with the wrapped data source.
   */
  _rdfSequence: function(aResource) {
    return Cc["@mozilla.org/rdf/container-utils;1"]
     .getService(Ci.nsIRDFContainerUtils).MakeSeq(this._wrappedObject,
     aResource);
  },

  /**
   * RDF data source that is wrapped by this object.
   */
  _wrappedObject: null,

  /**
   * Reference to the global RDF service, provided for convenience.
   */
  _rdf: Cc["@mozilla.org/rdf/rdf-service;1"].getService(Ci.nsIRDFService),
}
