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
 * Represents an individual web reference found in a parsed resource. Each
 * reference will be updated appropriately at the time the containing document
 * is saved locally.
 *
 * @param aParsedJob
 *        ExactPersistParsedJob object containing the reference.
 * @param aProperties
 *        Object whose properties will be applied to this object.
 */
function ExactPersistReference(aParsedJob, aProperties) {
  this._parsedJob = aParsedJob;
  this._saveJob = aParsedJob._eventListener;

  // Initialize the object with the provided properties.
  for (var [name, value] in Iterator(aProperties)) {
    this[name] = value;
  }

  // Resolve the target URI immediately.
  if (this.targetUriSpec) {
    try {
      // Build an absolute URI based on the specified string.
      this.targetUri = Cc["@mozilla.org/network/io-service;1"].
       getService(Ci.nsIIOService).newURI(this.targetUriSpec,
       this._parsedJob.characterSet, this.targetBaseUri ||
       this._parsedJob.baseUri);
    } catch (e) {
      // If the URI is invalid or cannot be resolved, the property remains null.
    }
  }
}

ExactPersistReference.prototype = {

  // --- Properties that identify the place that originated the reference ---

  /**
   * DOM document to which the reference applies. This property is set even if
   * the reference applies to a source fragment and not directly to a DOM node.
   */
  sourceDomDocument: null,

  /**
   * DOM node to which the reference applies.
   */
  sourceDomNode: null,

  /**
   * Name of the attribute of sourceDomNode containing the reference. If
   * sourceDomNode is specified and this property is empty, the reference refers
   * to the entire node, for example an inline "<style>" element.
   */
  sourceAttribute: "",

  /**
   * UriSourceFragment containing the reference. This property is specified for
   * references that apply to a source fragment and not directly to a DOM node.
   */
  sourceFragment: null,

  // --- Properties that identify the target of the reference ---

  /**
   * SourceFragment containing the text to be substituted in the place indicated
   * by the source properties of this reference object. For example, this
   * property may contain the text of a "style" or "archive" attribute, or the
   * body of an inline stylesheet or script.
   */
  targetFragment: null,

  /**
   * String containing the actual text that defines the target URI of the
   * reference. This URI specification is assumed to be encoded with the
   * character set of the document containing the reference, and is relative to
   * either the document's base URI or the URI specified in targetBaseUri.
   */
  targetUriSpec: null,

  /**
   * nsIURI object for the base URI to be used for resolving targetUriSpec, or
   * null to use the base URI of the document containing the reference.
   */
  targetBaseUri: null,

  /**
   * nsIURI object containing the resolved absolute target URI of the reference,
   * or null if the URI is invalid or cannot be properly resolved. This property
   * is set automatically when the reference is constructed.
   */
  targetUri: null,

  // --- Properties that control how the reference is handled when saving ---

  /**
   * True if the referenced resource must be saved locally. If this property is
   * false and none of the other save properties is set, the reference is simply
   * resolved to an absolute location.
   */
  saveLinkedResource: false,

  /**
   * Contains a reference to the parsed DOM document object that should be saved
   * in place of the target of the reference, or null if no parsed document is
   * referenced.
   */
  saveLinkedDomDocument: null,

  /**
   * Contains a reference to the parsed DOM CSS stylesheet object that should be
   * saved in place of the target of the reference, or null if no parsed
   * stylesheet is referenced.
   */
  saveLinkedCssStyleSheet: null,

  /**
   * Contains the suggested character set to be used when saving the linked
   * file. For CSS stylesheets, this is generally the character set specified in
   * the "charset" attribute of the referencing "<link>" element.
   */
  saveLinkedFileCharacterSetHint: null,

  /**
   * Contains the MIME media type of a scripting language if an empty script
   * should be saved in place of the target of the reference.
   */
  saveEmptyScriptType: "",

  // --- Properties used after the reference has been processed ---

  /**
   * PersistResource object representing the new target of the reference.
   */
  resource: "",

  /**
   * True if the referenced resource should not be saved locally because it is
   * not needed to display the saved page.
   */
  originalResourceNotLoaded: false,

  /**
   * String containing the the URI to be substituted in the place indicated by
   * the source properties of this reference object. This property is relevant
   * only when the targetFragment property is not set.
   *
   * For a target resource that has been saved locally, the returned URI will be
   * relative to the location of the document containing the reference. In other
   * cases, the returned URI will be absolute.
   */
  get resolvedTargetUriSpec() {
    // If the target of the reference is the document that contains it,
    // substitute it with a relative URI containing only a hash part.
    if (this.resource == this._parsedJob.resource) {
      try {
        // If the URI has URL syntax, use the hash part.
        return "#" + this.targetUri.QueryInterface(Ci.nsIURL).ref;
      } catch (e) {
        // In case of errors, use only a reference to the document.
        return "#";
      }
    }
    // If the reference target is not associated with a PersistResource, or the
    // PersistResource does not have an associated local file, this object
    // represents a reference to an external resource that wasn't saved.
    if (!this.resource || !this.resource.file) {
      // JavaScript URIs are never saved, even if requested by the reference
      // type, and they need to be replaced with an expression that does not
      // cause side effects when the URI is evaluated.
      if (this.targetUri.schemeIs("javascript")) {
        return "javascript:void(0);";
      }
      // If the resource didn't need to be saved, for example because it is
      // referenced by a hyperlink, the resolved absolute URI of the resource is
      // substituted in place of the original reference.
      if (!this.saveLinkedResource) {
        return this.targetUri.spec;
      }
      // Use a different URI for the case where the resource was not included
      // in the saved page because it was not needed to display it.
      if (this.originalResourceNotLoaded) {
        return "urn:not-loaded:" + this.targetUri.spec;
      }
      // Use a different URI for the case where a download error occurred.
      if (this.resource && this.resource.statusCode) {
        return "urn:download-error:" + this.targetUri.spec;
      }
      // The resource was not downloaded because it wasn't required.
      return this.targetUri.spec;
    }
    // If we are saving to MHTML, the saved files should always contain absolute
    // references to the original location of the other saved resources. These
    // references must match the "Content-Location" header octet by octet, thus
    // cannot contain a hash part, even if it was present in the original link.
    if (this._saveJob.saveWithContentLocation) {
      return this.resource.contentLocation;
    }
    // The web reference will be substituted with a relative URL pointing to a
    // local file. The hash part in the original reference, if present, is
    // propagated to the new reference if possible.
    var localFileUrl = this.resource.fileUrl.clone().QueryInterface(Ci.nsIURL);
    try {
      // If the URI has URL syntax, propagate the hash part.
      localFileUrl.ref = this.targetUri.QueryInterface(Ci.nsIURL).ref;
    } catch (e) {
      // In case of errors, use the original URI.
    }
    // Create the relative URI that points to the file and return it.
    return this._parsedJob.resource.fileUrl.getRelativeSpec(localFileUrl);
  },

  _parsedJob: null,
  _saveJob: null,
}
