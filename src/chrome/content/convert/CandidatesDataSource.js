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
 * Provides an RDF data source that represents the files that are candidates for
 * being converted to a different format. For each candidate, a selection state
 * is available, along with other state properties.
 *
 * This class derives from DataSourceWrapper. See the DataSourceWrapper
 * documentation for details.
 */
function CandidatesDataSource(aBrowserWindow) {
  // Construct the base class wrapping an in-memory RDF data source.
  DataSourceWrapper.call(this,
   Cc["@mozilla.org/rdf/datasource;1?name=in-memory-datasource"].
   createInstance(Ci.nsIRDFDataSource));

  // Initialize the data.
  this.candidates = [];
  this.counts = {
    total: 0,
    checked: 0,
    obstructed: 0,
    converted: 0,
    failed: 0,
  };
  this._initDataSource();
}

CandidatesDataSource.prototype = {
  __proto__: DataSourceWrapper.prototype,

  /**
   * Note: These strings are converted to actual RDF resources by the base class
   * as soon as this data source is constructed, so GetResource must not be
   * called. See the DataSourceWrapper documentation for details.
   */
  resources: {
    // Subjects and objects
    root:         "urn:root",
    candidates:   "urn:maf:candidates",
    // Standard predicates
    instanceOf:   "http://www.w3.org/1999/02/22-rdf-syntax-ns#instanceOf",
    child:        "http://home.netscape.com/NC-rdf#child",
    // Custom predicates representing candidate properties
    internalIndex:          "urn:maf:vocabulary#internalIndex",
    sourceName:             "urn:maf:vocabulary#sourceName",
    sourceDataFolderName:   "urn:maf:vocabulary#sourceDataFolderName",
    relativePath:           "urn:maf:vocabulary#relativePath",
    sourcePath:             "urn:maf:vocabulary#sourcePath",
    destPath:               "urn:maf:vocabulary#destPath",
    binPath:                "urn:maf:vocabulary#binPath",
    // Custom predicates representing candidate state properties
    checked:                "urn:maf:vocabulary#checked",
    disabled:               "urn:maf:vocabulary#disabled",
    obstructed:             "urn:maf:vocabulary#obstructed",
    enqueued:               "urn:maf:vocabulary#enqueued",
    converting:             "urn:maf:vocabulary#converting",
    converted:              "urn:maf:vocabulary#converted",
    failed:                 "urn:maf:vocabulary#failed",
  },

  /**
   * Getter for an RDF resource representing a candidate.
   */
  resourceForCandidate: function(aIndex) {
    return this._rdf.GetResource("urn:maf:candidate#" + aIndex);
  },

  /**
   * Actual Candidate objects associated with this data source.
   */
  candidates: [],

  /**
   * Provides properties that keep count of how many items have a property set.
   */
  counts: {},

  /**
   * This is used by other objects to determine if selection can be changed.
   */
  selectionDisabled: false,

  // nsIRDFDataSource
  Change: function(aSource, aProperty, aOldTarget, aNewTarget) {
    // Propagate the change to the wrapped object.
    this._wrappedObject.Change(aSource, aProperty, aOldTarget, aNewTarget);

    // If a property of a candidate changed
    if (aSource != this.resources.candidates) {
      // Find the name of the countable property associated with the resource.
      for (var [, propertyName] in
       Iterator(["checked", "obstructed", "converted", "failed"])) {
        if (aProperty == this.resources[propertyName]) {
          // Update the associated counter appropriately.
          if (aNewTarget.Value != aOldTarget.Value) {
            // False may be expressed with an empty string or the word "false".
            if (aNewTarget.Value == "" || aNewTarget.Value == "false") {
              this.counts[propertyName]--;
            } else {
              this.counts[propertyName]++;
            }
          }
          break;
        }
      }
    }

    // Continue only if the "checked" property has changed.
    if (aProperty != this.resources.checked) {
      return;
    }

    // If the selection change is on a container, update the child elements.
    if (aSource == this.resources.candidates) {
      var candidateSequence = this._rdfSequence(aSource);
      var candidateEnum = candidateSequence.GetElements();
      while (candidateEnum.hasMoreElements()) {
        var candidateResource = candidateEnum.getNext();
        // If the item is not disabled
        if (!this.getLiteralValue(candidateResource, this.resources.disabled)) {
          // Change the selection on the element and update the counters.
          this.replaceLiteral(candidateResource, this.resources.checked,
           aNewTarget.Value, true);
        }
      }
    } else {
      // If the selection change is on a child element, update the container.
      var candidatesResource = this.resources.candidates;
      var allCandidatesSelected = (this.counts.checked == this.counts.total);
      // Change the selection on the element, by removing the assertion that is
      // no longer true and adding the new assertion.
      this._wrappedObject.Assert(candidatesResource, this.resources.checked,
       this._rdfBool(allCandidatesSelected), true);
      this._wrappedObject.Unassert(candidatesResource, this.resources.checked,
       this._rdfBool(!allCandidatesSelected));
    }
  },

  /**
   * Initializes the data source with the basic data needed to host candidates.
   */
  _initDataSource: function() {
    // Shorthand for objects commonly used throughout this function.
    var ds = this._wrappedObject;
    var res = this.resources;

    // Create the root of the tree, that has a single child pointing to the
    // list of candidates. This is required for properly handling the recursive
    // XUL template generation that is used to create XUL trees.
    ds.Assert(res.root, res.instanceOf, res.root, true);
    ds.Assert(res.root, res.child, res.candidates, true);

    // Create the "candidates" resource, which is an RDF container.
    var candidatesSequence = this._rdfSequence(res.candidates);
    ds.Assert(res.candidates, res.instanceOf, res.candidates, true);

    // Set additional properties of the "candidates" resource.
    ds.Assert(res.candidates, res.checked, this._rdfBool(true), true);
    ds.Assert(res.candidates, res.disabled, this._rdf.GetLiteral(""), true);
    ds.Assert(res.candidates, res.obstructed, this._rdf.GetLiteral(""), true);
    ds.Assert(res.candidates, res.enqueued, this._rdf.GetLiteral(""), true);
    ds.Assert(res.candidates, res.converting, this._rdf.GetLiteral(""), true);
    ds.Assert(res.candidates, res.converted, this._rdf.GetLiteral(""), true);
    ds.Assert(res.candidates, res.failed, this._rdf.GetLiteral(""), true);
  },

  /**
   * Adds a candidate to the data source.
   */
  addCandidate: function(aCandidate) {
    // Shorthand for objects commonly used throughout this function.
    var ds = this._wrappedObject;
    var res = this.resources;

    // Determine the index of the new candidate and retrieve its RDF resource.
    var candidateIndex = this.candidates.length;
    var candidateResource = this.resourceForCandidate(candidateIndex);

    // Set the internal index in the array as an RDF integer.
    ds.Assert(candidateResource, res.internalIndex,
     this._rdf.GetIntLiteral(candidateIndex), true);

    // Set the candidate properties as RDF literals.
    ds.Assert(candidateResource, res.sourceName,
     this._rdf.GetLiteral(aCandidate.location.source.leafName), true);
    if (aCandidate.dataFolderLocation && aCandidate.dataFolderLocation.source) {
      ds.Assert(candidateResource, res.sourceDataFolderName,
       this._rdf.GetLiteral(aCandidate.dataFolderLocation.source.leafName),
       true);
    }
    ds.Assert(candidateResource, res.relativePath,
     this._rdf.GetLiteral(aCandidate.relativePath), true);
    ds.Assert(candidateResource, res.sourcePath,
     this._rdf.GetLiteral(aCandidate.location.source.path), true);
    ds.Assert(candidateResource, res.destPath,
     this._rdf.GetLiteral(aCandidate.location.dest.path), true);
    if (aCandidate.location.bin) {
      ds.Assert(candidateResource, res.binPath,
       this._rdf.GetLiteral(aCandidate.location.bin.path), true);
    }

    // Set the candidate state properties as RDF literals. Candidates that have
    // already been converted are disabled.
    ds.Assert(candidateResource, res.checked, this._rdfBool(true), true);
    ds.Assert(candidateResource, res.disabled, this._rdf.GetLiteral(
     aCandidate.obstructed ? "disabled" : ""), true);
    ds.Assert(candidateResource, res.obstructed, this._rdf.GetLiteral(
     aCandidate.obstructed ? "obstructed" : ""), true);
    ds.Assert(candidateResource, res.enqueued, this._rdf.GetLiteral(""), true);
    ds.Assert(candidateResource, res.converting, this._rdf.GetLiteral(""),
     true);
    ds.Assert(candidateResource, res.converted, this._rdf.GetLiteral(""), true);
    ds.Assert(candidateResource, res.failed, this._rdf.GetLiteral(""), true);

    // Add the "candidate" resource to the parent container.
    this._rdfSequence(res.candidates).AppendElement(candidateResource);

    // Update the counts appropriately.
    this.counts.total++;
    this.counts.checked++;
    if (aCandidate.obstructed) {
      this.counts.obstructed++;
    }

    // Save the internal index of the candidate and add the item to the array.
    aCandidate.internalIndex = candidateIndex;
    this.candidates.push(aCandidate);
  },
}
