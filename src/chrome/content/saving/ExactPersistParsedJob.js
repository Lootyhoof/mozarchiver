/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
k * ***** BEGIN LICENSE BLOCK *****
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
 * This object implements the logic required to fix web references in parsed
 * content documents that are being saved to another location.
 *
 * For every content document that is processed, the list of web addresses
 * referenced in the document is collected. Each collected entry contains, along
 * with the address itself, the in-memory reference to the DOM attribute or
 * source fragment that will need modification when the new address for the
 * resource is determined.
 *
 * The actual in-memory modification of the addresses generally happens after
 * the resource has already been saved locally, since until then it is not known
 * whether the save operation succeeded. Depending on the result of the save
 * operation, the reference is replaced with a local relative URL or a full
 * remote URI.
 *
 * This object supports DOM documents and CSS stylesheets, and can also be used
 * to generate empty scripts.
 *
 * This class derives from Job. See the Job documentation for details.
 *
 * @param aResource
 *        PersistResource object associated with the document or other resource
 *        type to be saved.
 */
function ExactPersistParsedJob(aEventListener, aResource) {
  Job.call(this, aEventListener);
  this.resource = aResource;

  // Initialize the unique identifier for this save job.
  this._uniqueId = "job" + Math.floor(Math.random() * 1000000000);

  // Initialize other member variables explicitly.
  this.references = [];
}

ExactPersistParsedJob.prototype = {
  __proto__: Job.prototype,

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIDocumentEncoderNodeFixup,
  ]),

  /**
   * PersistResource object associated with this parsed document.
   */
  resource: null,

  /**
   * String containing the character set for URIs in the current document, or
   * null if no character set has been explicitly specified.
   */
  characterSet: null,

  /**
   * nsIURI object with the base URI that is used by default to resolve relative
   * references in the document associated with this object. For DOM documents,
   * this value matches the baseURI property, while for other resources this is
   * equal to the original location of the resource.
   */
  baseUri: null,

  /**
   * Array of ExactPersistReference objects that represent all the references
   * contained in the document associated with this object.
   */
  references: [],

  /**
   * Finds web references in the given DOM document. The document will then be
   * saved when the job is started.
   */
  initFromDomDocument: function(aDocument) {
    this._sourceDomDocument = aDocument;

    // Set the properties required to parse the document properly.
    this.characterSet = aDocument.characterSet;
    this.baseUri = aDocument.baseURIObject;

    // Set the properties required to save the resource properly.
    this.resource.mimeType = aDocument.contentType;
    this.resource.charset = aDocument.characterSet;

    // Scan the document for web references and store the content to be saved.
    this._document = aDocument;
    this._scanDomDocument();
  },

  /**
   * Finds web references in the given CSS stylesheet. The stylesheet will then
   * be saved when the job is started.
   */
  initFromCssStyleSheet: function(aDocument, aStyleSheet, aStyleSheetUri,
   aCharacterSet) {
    this._sourceDomDocument = aDocument;

    // Set the properties required to parse the stylesheet properly.
    this.characterSet = aCharacterSet || null;
    this.baseUri = aStyleSheetUri;

    // If the stylesheet begins with a "@charset" rule, use the character set
    // specified in the rule to parse the URIs contained in the stylesheet,
    // instead of the one specified in the referencing document. If a different
    // character set was specified in the "Content-Type" header when the file
    // was downloaded, it is possible that the character set is still detected
    // erroneously. For more information on the character set detection
    // procedure that the browser should use for external stylesheets, see
    // <http://www.w3.org/TR/1998/REC-CSS2-19980512/syndata.html#q23>
    // (retrieved 2009-12-22).
    if (aStyleSheet.cssRules.length > 0) {
      var firstRule = aStyleSheet.cssRules[0];
      if (firstRule.type == Ci.nsIDOMCSSRule.CHARSET_RULE) {
        this.characterSet = firstRule.encoding;
      }
    }

    // Set the properties required to save the resource properly.
    this.resource.mimeType = "text/css";

    // Scan the stylesheet for web references and store the content to be saved.
    this._targetFragment = this._scanCssStyleSheet(aStyleSheet);
  },

  /**
   * Saves an empty script when the job is started.
   */
  initFromEmptyScript: function(aDocument, aScriptType) {
    this._sourceDomDocument = aDocument;

    // Set the properties required to save the resource properly.
    this.resource.mimeType = aScriptType;

    // Store the actual content to be saved.
    this._targetFragment = this._getEmptyScript(aScriptType);
  },

  /**
   * Unique identifier used to distinguish this job from others that may be
   * running at the same time. This value is used as an entry name in the
   * exactPersistData property with which the involved DOM nodes are augmented.
   */
  _uniqueId: "",

  /**
   * This function performs all the operations required to create a new
   * ExactPersistReference object, cross-referencing it with its source DOM node
   * if required, and finally adding it to the references list for the document
   * associated with this object.
   *
   * @param aProperties
   *        Object containing the initial values of some of the properties of
   *        the ExactPersistReference object to be created. Other properties are
   *        set automatically starting from the provided values. See the
   *        ExactPersistReference object for details.
   */
  _createReference: function(aProperties) {
    // Handle the case where an URI value should be read from a DOM attribute
    // without further processing. This is the most common way for web
    // references to be specified in DOM documents. If the source DOM attribute
    // does not contain an URI, at this point the value has been already
    // processed, and the targetFragment property has been populated.
    if (!aProperties.targetFragment && aProperties.sourceAttribute) {
      // Read the target URI string from the attribute.
      aProperties.targetUriSpec = aProperties.sourceDomNode.getAttribute(
       aProperties.sourceAttribute);
      // If the attribute is empty or missing, no reference should be created,
      // unless we are saving a linked document.
      if (!aProperties.targetUriSpec) {
        if (!aProperties.saveLinkedDomDocument) {
          return;
        }
        // If we are saving a linked document and the containing element has no
        // source attribute, use an URI that results in a relevant file name.
        aProperties.targetUriSpec = "http://generated.test/generated-content";
      }
    }

    // Create and initialize the reference object.
    aProperties.sourceDomDocument = this._sourceDomDocument;
    var reference = new ExactPersistReference(this, aProperties);
    // If the resource is supposed to have a target URI, but the corresponding
    // absolute URI couldn't be resolved, ignore the reference and leave the
    // unresolvable URI unaltered in the source file. If a parsed document is
    // associated with the source element, it will not be processed.
    if (reference.targetUriSpec && !reference.targetUri) {
      return;
    }
    // The reference is valid and will be processed.
    this.references.push(reference);

    // If required, cross-reference the original DOM node with the associated
    // ExactPersistReference object. This allows for a very fast lookup of the
    // reference during the node fixup phase that is executed later.
    if (reference.sourceDomNode) {
      // Get a reference to the exactPersistData property of the DOM node, or
      // augment the node with the property if it doesn't exist already. Since
      // this property is set on an XPCNativeWrapper, it will not be available
      // to the content documents.
      var exactPersistData = reference.sourceDomNode.exactPersistData;
      if (!exactPersistData) {
        exactPersistData = {};
        reference.sourceDomNode.exactPersistData = exactPersistData;
      }
      // Get a reference to the object, specific to this save job, that contains
      // the list of references for the DOM node. If the object does not exist,
      // a new object is created and the property is set accordingly.
      var jobPersistData = exactPersistData[this._uniqueId];
      if (!jobPersistData) {
        jobPersistData = {
          attributeReferences: [],
          replaceChildReference: null,
        };
        exactPersistData[this._uniqueId] = jobPersistData;
      }
      // Finally, add the reference to the object.
      if (reference.sourceAttribute) {
        // This reference applies to a specific attribute.
        jobPersistData.attributeReferences.push(reference);
      } else {
        // This reference requires the single child of this node to be replaced.
        jobPersistData.replaceChildReference = reference;
      }
    }

    // If this reference has a target web resource, continue with the process
    // that determines how the target should be handled in the save operation.
    if (!reference.targetUri) {
      return;
    }
    // Remove the hash part of the target URI before comparing it with the URI
    // of the current document to determine if the target is the same file.
    var referenceUri = reference.targetUri.clone();
    try {
      // If the URI has URL syntax, remove the hash part.
      referenceUri.QueryInterface(Ci.nsIURL).ref = "";
    } catch (e) {
      // In case of errors, use the original URI.
    }
    if (this._checkUriEquality(referenceUri, this.resource.referenceUri)) {
      // Ensure that, if the target of the reference is the same document it's
      // contained in, the reference won't point to another document. This
      // could happen if differently modified versions of the same document are
      // present in the persist bundle, as they would have been retrieved from
      // the same original location. For references to the same document, no
      // save action is required, since the target resource is being saved now.
      reference.resource = this.resource;
      return;
    }
    // Ensure that the reference gets associated with a PeristsResource object,
    // and initialize a new save job for the target if required.
    this._eventListener.createJobForReference(reference, referenceUri);
  },

  /**
   * This support function returns true if the provided nsIURI objects point to
   * the same resource, or false otherwise.
   */
  _checkUriEquality: function(aFirstUri, aSecondUri) {
    // If one of the arguments is null, no match is found.
    if (!aFirstUri || !aSecondUri) {
      return false;
    }
    // Compare the two URIs intelligently, based on their scheme.
    try {
      return aFirstUri.equals(aSecondUri);
    } catch(e) {
      // If the URIs cannot be compared, for example if one of them is an
      // invalid "file://" URL, compare their string version.
      return (aFirstUri.spec == aSecondUri.spec);
    }
  },

  /**
   * Yields each node found in the DOM document associated with this job, that
   * matches the given HTML element and attribute names. The element name can be
   * "*" to indicate that any element is allowed, and the attribute name can
   * evaluate to false to indicate that no specific attribute is required.
   */
  _htmlNodesGenerator: function(aElementName, aAttributeName) {
    // Find all the nodes that correspond to the given HTML element. If an
    // attribute name is specified, return only the elements that contain the
    // named attribute.
    var xpathExpression = "//" + aElementName +
     (aAttributeName ? "[@" + aAttributeName + "]" : "");
    // Execute the expression to find the resulting nodes, in any order.
    var xpathResult = this._document.evaluate(xpathExpression, this._document,
     null, Ci.nsIDOMXPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
    // Iterate over the resulting nodes.
    var curNode;
    while ((curNode = xpathResult.iterateNext())) {
      yield curNode;
    }
  },

  /**
   * Yields each "<param>" element found under the specified "<object>" or
   * "<applet>" element.
   */
  _objectParamsGenerator: function(aElement) {
    // Execute the expression to find the resulting nodes, in any order.
    var xpathResult = this._document.evaluate("param", aElement, null,
     Ci.nsIDOMXPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
    // Iterate over the resulting nodes.
    var curNode;
    while ((curNode = xpathResult.iterateNext())) {
      yield curNode;
    }
  },

  /**
   * Finds web references in the DOM document associated with this job.
   */
  _scanDomDocument: function() {
    // This function scans the DOM document to find resources referenced using
    // HTML URI attributes. For the list of the HTML 4 attributes and their
    // types, see <http://www.w3.org/TR/REC-html40/index/attributes.html>
    // (retrieved 2009-12-19).

    // Find direct references to images that should be saved.
    for (let [, [elementName, attributeName]] in Iterator([
     ["body",  "background"],
     ["img",   "src"],
     ["input", "src"],
     ["table", "background"],
     ["td",    "background"],
     ["tr",    "background"],
    ])) {
      for (let node in this._htmlNodesGenerator(elementName, attributeName)) {
        this._createReference({
          sourceDomNode: node,
          sourceAttribute: attributeName,
          saveLinkedResource: true,
        });
      }
    }

    // Find direct references to media files that should be saved.
    for (let [, [elementName, attributeName]] in Iterator([
     ["audio",  "src"],
     ["embed",  "src"],
     ["source", "src"],
     ["video",  "src"],
     ["video",  "poster"],
    ])) {
      for (let node in this._htmlNodesGenerator(elementName, attributeName)) {
        // Save the media files locally only if the ExactPersistJob object is
        // configured to allow media files to be saved.
        this._createReference({
          sourceDomNode: node,
          sourceAttribute: attributeName,
          saveLinkedResource: this._eventListener.saveWithMedia,
        });
      }
    }

    // Find references to external resources that should not be saved.
    for (let [, [elementName, attributeName]] in Iterator([
     ["a",          "href"],
     ["area",       "href"],
     ["blockquote", "cite"],
     ["del",        "cite"],
     ["form",       "action"],
     ["frame",      "longdesc"],
     ["head",       "profile"],
     ["iframe",     "longdesc"],
     ["img",        "longdesc"],
     ["ins",        "cite"],
     ["q",          "cite"],
    ])) {
      for (let node in this._htmlNodesGenerator(elementName, attributeName)) {
        this._createReference({
          sourceDomNode: node,
          sourceAttribute: attributeName,
        });
      }
    }

    // Process "<link>" elements, that may reference parsed stylesheets, page
    // icons, or external resources that should not be saved.
    for (let node in this._htmlNodesGenerator("link", "href")) {
      // Determines if the linked unparsed resource should be saved locally by
      // checking the space-separated list contained in the "rel" attribute for
      // one of the known values. For more information on the "rel" attribute,
      // see <http://www.w3.org/TR/html401/struct/links.html#edef-LINK>
      // (retrieved 2009-12-19).
      var saveFavIcon = /(^|\s)(apple-touch-icon|icon|shortcut)(\s|$)/i.test(
       node.getAttribute("rel"));
      // Creates the reference, and determines if the linked parsed stylesheet
      // should be saved locally by checking the "sheet" property on the DOM
      // node object.
      this._createReference({
        sourceDomNode: node,
        sourceAttribute: "href",
        saveLinkedResource: saveFavIcon,
        saveLinkedCssStyleSheet: node.sheet,
        saveLinkedFileCharacterSetHint: node.getAttribute("charset"),
      });
    }

    // Process documents linked by "<frame>" and "<iframe>" elements.
    for (let [, elementName] in Iterator(["frame", "iframe"])) {
      for (let node in this._htmlNodesGenerator(elementName)) {
        // Since frames may reference unparsed resources that the browser wraps
        // in a DOM document automatically, check if the media type has an
        // associated DOM-based encoder to decide if the resource should be
        // saved as parsed or unparsed.
        var mediaType = node.contentDocument.contentType;
        if (mediaType != "text/plain" &&
         ("@mozilla.org/layout/documentEncoder;1?type=" + mediaType) in Cc) {
          // This frame references a parsed DOM document.
          this._createReference({
            sourceDomNode: node,
            sourceAttribute: "src",
            saveLinkedDomDocument: node.contentDocument,
          });
        } else {
          // This frame references an unparsed resource.
          this._createReference({
            sourceDomNode: node,
            sourceAttribute: "src",
            saveLinkedResource: true,
          });
        }
      }
    }

    // Process "<object>" and "<applet>" elements.
    for (let [, elementName] in Iterator(["object", "applet"])) {
      for (let node in this._htmlNodesGenerator(elementName)) {
        // The following code is used for both the "<object>" and the "<applet>"
        // elements, since they are processed very similarly.
        var isApplet = (elementName == "applet");
        // If a "codebase" attribute is present, it should be used to resolve
        // the URIs specified in the "archive", "data", "code" and "object"
        // attributes. For more information, see the definition of the
        // elements at <http://www.w3.org/TR/html401/struct/objects.html>
        // (retrieved 2009-12-19).
        var baseUri = null;
        var codebaseAttribute = node.getAttribute("codebase");
        if (codebaseAttribute) {
          try {
            // Resolve "codebase" using the base URI of the document.
            baseUri = Cc["@mozilla.org/network/io-service;1"].
             getService(Ci.nsIIOService).newURI(codebaseAttribute,
             this.characterSet, this.baseUri);
          } catch (e) {
            // If the URI is invalid, ignore the "codebase" attribute.
          }
        }
        // Process the URIs in the "archive" attribute, saving every linked
        // resource locally. The "archive" attribute contains a space-separated
        // list for the "<object>" element, or a comma-separated list for the
        // "<applet>" element.
        var archiveAttribute = node.getAttribute("archive");
        if (archiveAttribute) {
          // Get the object required to process the inline attribute.
          let fragment = new UrlListSourceFragment(archiveAttribute, {
            commaSeparated: isApplet,
          });
          // Create the reference object.
          this._createReference({
            sourceDomNode: node,
            sourceAttribute: "archive",
            targetFragment: fragment,
          });
          // Scan the URI list for references to other resources, using the
          // appropriate base URI, but save the references only if required.
          this._scanFragment(fragment, this._eventListener.saveWithMedia,
           baseUri);
        }
        // The "code" attribute of the "<applet>" element can contain either a
        // Java class name or the URI of an external resource. If the "archive"
        // attribute is present, assume that the element contains a Java class
        // name, and do not attempt to resolve it as an URI. The "classid"
        // attribute of the "<object>" element is always assumed to contain a
        // Java class name.
        if (isApplet && !archiveAttribute) {
          this._createReference({
            sourceDomNode: node,
            sourceAttribute: "code",
            targetBaseUri: baseUri,
            saveLinkedResource: this._eventListener.saveWithMedia,
          });
        }
        // Always save the resource referenced by "data" or "object".
        let htmlAttribute = (isApplet ? "object" : "data");
        this._createReference({
          sourceDomNode: node,
          sourceAttribute: htmlAttribute,
          targetBaseUri: baseUri,
          saveLinkedResource: this._eventListener.saveWithMedia,
        });
        // Even though object and applet parameter names are specific of the
        // implementation, some names are commonly used for parameters that
        // reference the URI of an external resource. For these parameters, an
        // attempt is made to save the referenced resource.
        for (let paramNode in this._objectParamsGenerator(node)) {
          if (/^\s*(src|movie)\s*$/i.test(paramNode.getAttribute("name"))) {
            this._createReference({
              sourceDomNode: paramNode,
              sourceAttribute: "value",
              targetBaseUri: baseUri,
              saveLinkedResource: this._eventListener.saveWithMedia,
            });
          }
        }
      }
    }

    // Process elements with a "style" attribute.
    for (let node in this._htmlNodesGenerator("*", "style")) {
      // Get the object required to process the inline attribute.
      let fragment = new CssSourceFragment(node.getAttribute("style"));
      // Create the reference object.
      this._createReference({
        sourceDomNode: node,
        sourceAttribute: "style",
        targetFragment: fragment,
      });
      // Scan the style definition for references to other resources.
      this._scanFragment(fragment, true);
    }

    // Process "<style>" elements referencing inline stylesheets.
    for (let node in this._htmlNodesGenerator("style")) {
      if (node.sheet) {
        this._createReference({
          sourceDomNode: node,
          targetFragment: this._scanCssStyleSheet(node.sheet),
        });
      }
    }

    // Process "<script>" elements referencing inline or external scripts.
    for (let node in this._htmlNodesGenerator("script")) {
      // Determines the script type, but at present ignores the default
      // scripting language specified in the "Content-Script-Type" header, and
      // assumes JavaScript. For more information, see
      // <http://www.w3.org/TR/REC-html40/interact/scripts.html#h-18.2.2>
      // (retrieved 2009-12-18).
      var scriptType = (node.getAttribute("type") ||
       "application/x-javascript").toLowerCase();
      // If this is an external script
      if (node.getAttribute("src")) {
        // Replace the referenced script with an empty script.
        this._createReference({
          sourceDomNode: node,
          sourceAttribute: "src",
          saveEmptyScriptType: scriptType,
        });
      } else {
        // Replace the inline script with an empty script.
        this._createReference({
          sourceDomNode: node,
          targetFragment: this._getEmptyScript(scriptType),
        });
      }
    }
  },

  /**
   * Finds web references in the given CSS stylesheet, and returns the
   * SourceFragment corresponding to the regenerated stylesheet contents.
   */
  _scanCssStyleSheet: function(aStyleSheet) {
    // This function examines the given stylesheet and regenerates its Unicode
    // text content using a concatenation of SourceFragment objects. These
    // objects allow the external web references in the stylesheet to be updated
    // at a later time, before the output file is written to disk.
    var charsetRule = "";
    var importRuleFragments = [];
    var otherRules = "";
    // Iterate over the DOM object containing the list of rules.
    for (var curIndex = 0; curIndex < aStyleSheet.cssRules.length; curIndex++)
    {
      var rule = aStyleSheet.cssRules[curIndex];
      // If the stylesheet contains a "@charset" rule, store it separately, so
      // that it can be inserted at the top of the output file.
      if (rule.type == Ci.nsIDOMCSSRule.CHARSET_RULE) {
        charsetRule = rule.cssText + "\r\n";
        continue;
      }
      // All the other rules except "@import" should be concatenated at the end
      // of the output file, and parsed together to find external references.
      // This includes the entire text contents of "@media" rules.
      if (rule.type != Ci.nsIDOMCSSRule.IMPORT_RULE) {
        otherRules += this._scanCssRule(rule, "");
        continue;
      }
      // Ensure that the "@import" rule references a valid loaded stylesheet.
      if (!rule.href || !rule.styleSheet) {
        continue;
      }
      // Create a new CSS source fragment to parse the target URI out of the
      // "@import" rule, while preserving all the other attributes.
      var ruleSourceFragment = new CssSourceFragment(rule.cssText + "\r\n");
      for (var curFragment in ruleSourceFragment) {
        if (curFragment instanceof UrlSourceFragment) {
          // Create the web reference and save the target stylesheet.
          this._createReference({
            sourceFragment: curFragment,
            targetUriSpec: rule.href,
            saveLinkedCssStyleSheet: rule.styleSheet,
          });
          // Only one URI should be present in the text of an "@import" rule.
          break;
        }
      }
      importRuleFragments.push(ruleSourceFragment);
    }
    // Create a CSS source fragment for all the ordinary rules, and scan it for
    // external references. Note that the final output may still include rules
    // having a "content" property, and if the property references an attribute
    // of the original node using the "attr" expression, the resulting document
    // will display the updated value of the attribute, and not the original
    // one. For more information on the "content" CSS property and its "attr"
    // value, see <http://www.w3.org/TR/CSS2/generate.html#propdef-content>
    // (retrieved 2009-12-22).
    var otherRulesFragment = new CssSourceFragment(otherRules);
    this._scanFragment(otherRulesFragment, true);
    // Build an object that behaves like a SourceFragment that concatenates the
    // source data of all the source fragments that define the output file. The
    // sourceData property for this object will be accessed just before the
    // output file is saved, after the references have been already resolved.
    return {
      get sourceData() {
        // Start with the original "@charset" rule, if present, followed by an
        // initial explanatory source comment in English.
        var outputText = charsetRule +
         "/* Effective stylesheet produced by snapshot save */\r\n";
        // Add the current values of the source fragments for "@import" rules.
        for (var [, fragment] in Iterator(importRuleFragments)) {
          outputText += fragment.sourceData;
        }
        // End with the current value of the source fragment for other rules.
        return outputText + otherRulesFragment.sourceData;
      }
    };
  },

  /**
   * Processes the given CSS rule, that can also be a conditional group rule,
   * and returns the text corresponding to the regenerated rule contents,
   * excluding all rules whose selectors don't match any document element.
   */
  _scanCssRule: function(aCssRule, aIndentText) {
    // Filter out rules that don't apply to any element in the document, while
    // removing pseudo-classes because they can't be used with querySelector.
    try {
      if (aCssRule.type == Ci.nsIDOMCSSRule.STYLE_RULE &&
       !this._sourceDomDocument.querySelector(
       aCssRule.selectorText.replace(/:[\w-]+/g, ""))) {
        return "";
      }
    } catch (ex) {
      // Removing the pseudo-classes might have rendered the selector list
      // invalid, if they are the only component of one of the selectors.
    }
    // If this is not a conditional group rule, just write the text.
    if (!aCssRule.cssRules) {
      return aIndentText + aCssRule.cssText + "\r\n";
    }
    // Write all the contained rules after processing them.
    var cssText = "";
    for (var curIndex = 0; curIndex < aCssRule.cssRules.length; curIndex++)
    {
      var rule = aCssRule.cssRules[curIndex];
      cssText += this._scanCssRule(rule, aIndentText + "  ");
    }
    // Do not write the outer block if it does not contain any relevant rule.
    if (!cssText)
    {
      return "";
    }
    // Write the first line of the conditional group rule separately.
    return aIndentText + aCssRule.cssText.replace(/\n[\w\W]*/, "") + "\r\n" +
           cssText + aIndentText + "}\r\n";
  },

  /**
   * Finds and processes web references in the given SourceFragment object.
   *
   * @param aFragment
   *        SourceFragment object to be scanned.
   * @param aSaveLocally
   *        If true, the resources will be saved locally.
   * @param aBaseUri
   *        Optional nsIURI object used for reference resolution.
   */
  _scanFragment: function(aFragment, aSaveLocally, aBaseUri) {
    // Search for all the URIs contained in the fragment.
    for (var curFragment in aFragment) {
      if (curFragment instanceof UrlSourceFragment) {
        // Create the web reference and save the linked resource.
        this._createReference({
          sourceFragment: curFragment,
          targetUriSpec: curFragment.urlSpec,
          targetBaseUri: aBaseUri,
          saveLinkedResource: aSaveLocally,
        });
      }
    }
  },

  /**
   * Returns a SourceFragment object corresponding to a generated empty script
   * of the specified MIME media type.
   */
  _getEmptyScript: function(aScriptType) {
    // Determines the language of the script, if known.
    var isJavaScript = [
     "application/x-javascript",
     "application/ecmascript",
     "application/javascript",
     "text/ecmascript",
     "text/javascript",
    ].indexOf(aScriptType) >= 0;
    var isVbScript = [
     "text/vbscript",
     "application/x-vbs",
     "text/vbs",
    ].indexOf(aScriptType) >= 0;

    // Replaces the script with a comment, or with an empty string if the
    // language of the script is unknown.
    return new SourceFragment(
     isJavaScript ? "/* Script removed by snapshot save */\r\n" :
     isVbScript ? "' Script removed by snapshot save\r\n" :
     "");
  },

  // Job
  _executeStart: function() {
    // When all the unparsed resources have been saved, we can save this parsed
    // resource while fixing references to other resources.
    for (var [, reference] in Iterator(this.references)) {
      // For references generated from UrlSourceFragment objects, we can replace
      // the actual target now, and this modification will be reflected when
      // the outer SourceFragment object is persisted. This cannot be done for
      // the attributes of DOM nodes, as the original nodes cannot be modified.
      if (reference.sourceFragment) {
        reference.sourceFragment.urlSpec = reference.resolvedTargetUriSpec;
      }
    }

    // Ensure that the ancestors exist before creating the output file.
    if (!this.resource.file.parent.exists()) {
      this.resource.file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
    }
    // Create and initialize an output stream to write to the local file.
    var outputStream = Cc["@mozilla.org/network/file-output-stream;1"].
     createInstance(Ci.nsIFileOutputStream);
    outputStream.init(this.resource.file, -1, -1, 0);
    try {
      // If this save job is associated with a DOM document
      if (this._document) {
        // Create a document encoder for the appropriate content type.
        var mediaType = this._document.contentType;
        var encoder = Cc["@mozilla.org/layout/documentEncoder;1?type=" +
         mediaType].createInstance(Ci.nsIDocumentEncoder);
        encoder.init(this._document, mediaType, 0);
        // Because Firefox and SeaMonkey incorrectly wrap the text contained
        // inside "<textarea>" elements, we have to disable text content
        // wrapping entirely. Differently from using the raw output encoding
        // flag, this solution preserves the newlines originally present in the
        // text content between tags.
        encoder.setWrapColumn(0x7FFFFFFF);
        // Save the document using its original character set. Setting this
        // property is required in order for the appropriate "<meta>"
        // declaration to be saved in the document body.
        encoder.setCharset(this.characterSet);
        // Set the function that will transform the DOM nodes during save.
        encoder.setNodeFixup(this);
        // Encode the document directly to the output stream. Compared with
        // encoding to a string, this function has the advantage that all the
        // characters that cannot be encoded in the target character set are
        // automatically converted to an HTML numeric character entity.
        encoder.encodeToStream(outputStream);
      } else {
        // This save job contains generated content stored in memory as an
        // Unicode string. Create and initialize a converter output stream to
        // save the content using the appropriate character set.
        var converterStream = Cc["@mozilla.org/intl/converter-output-stream;1"].
         createInstance(Ci.nsIConverterOutputStream);
        converterStream.init(outputStream, this.characterSet, 0,
         "?".charCodeAt(0));
        try {
          // Write the entire generated file to disk at once.
          converterStream.writeString(this._targetFragment.sourceData);
        } finally {
          // Close the converter stream even in case of exception.
          converterStream.close();
        }
      }
    } finally {
      // Close the underlying stream. This instruction has no effect if the
      // converter stream has been already closed successfully.
      outputStream.close();
    }
    // Notify that the job is completed, if the save operation succeeded.
    this._notifyCompletion();
  },

  // Job
  _executeCancel: function(aReason) {
    // No special action is required since this object works synchronously.
  },

  // Job
  _executeDispose: function(aReason) {
    // Free the cross-references previously set in DOM nodes.
    for (var [, reference] in Iterator(this.references)) {
      var node = reference.sourceDomNode;
      if (node && node.exactPersistData) {
        // Delete the entry specific for this save job. The exactPersistData
        // property set on the node itself cannot be deleted even if it does
        // not contain data, since the XPCNativeWrapper object does not support
        // this operation, and would throw NS_ERROR_XPC_SECURITY_MANAGER_VETO.
        // For more information, see
        // <https://developer.mozilla.org/en/XPCNativeWrapper#Limitations_of_XPCNativeWrapper>
        // (retrieved 2009-12-21).
        delete node.exactPersistData[this._uniqueId];
      }
    }
  },

  // nsIDocumentEncoderNodeFixup
  fixupNode: function(aNode, aSerializeCloneKids) {
    // If an instruction to replace the child elements with other content is
    // present on the parent node, return a different node in place of this
    // child. This solution works since all the nodes to which this instruction
    // is applied have a single text node as a child. This is an alternative to
    // working on the parent node and using aSerializeCloneKids.
    try {
      // Wrap all the generated scripts and stylesheets with a comment tag.
      return this._document.createComment("\r\n" + this._escapeCssComment(
       aNode.parentNode.exactPersistData[this._uniqueId].replaceChildReference.
       targetFragment.sourceData));
    } catch (e) {
      // If any one of the properties in the above reference chain is null,
      // there is no need to replace this element with other content.
    }

    // Prepare the node to be modified.
    var newNode = aNode.cloneNode(false);

    if (aNode instanceof Ci.nsIDOMHTMLTextAreaElement) {
      // For the <textarea> element, simply serialize a new node having the
      // current value of the text area as its only text child.
      newNode.textContent = aNode.value;
      aSerializeCloneKids.value = true;
      return newNode;
    }

    if (aNode instanceof Ci.nsIDOMHTMLInputElement) {
      // Check the type of the input element.
      var inputType = aNode.getAttribute("type");
      if (aNode.mozIsTextField(true)) {
        // Store the current value of text fields, excluding password fields.
        if (!aNode.value) {
          newNode.removeAttribute("value");
        } else {
          newNode.setAttribute("value", aNode.value);
        }
      } else if (/^\s*(checkbox|radio)\s*$/i.test(inputType)) {
        // Store the current value of checkboxes and radio buttons.
        newNode.QueryInterface(Ci.nsIDOMHTMLInputElement).defaultChecked =
         aNode.checked;
      }
    } else if (aNode instanceof Ci.nsIDOMHTMLOptionElement) {
      // Store the current selection in normal lists and dropdown lists.
      newNode.QueryInterface(Ci.nsIDOMHTMLOptionElement).defaultSelected =
       aNode.selected;
    }

    // Remove the attributes that may prevent URLs to be resolved correctly.
    if ((aNode instanceof Ci.nsIDOMHTMLAppletElement) ||
     (aNode instanceof Ci.nsIDOMHTMLObjectElement)) {
      // Remove the "codebase" attribute on applets and objects.
      newNode.removeAttribute("codebase");
    } else if (aNode instanceof Ci.nsIDOMHTMLBaseElement) {
      // Blank the "href" attribute on the "<base>" element.
      newNode.setAttribute("href", "");
    }

    // Determine if some other attributes of this node should be updated.
    var jobPersistData = aNode.exactPersistData && aNode.
     exactPersistData[this._uniqueId];
    if (jobPersistData && jobPersistData.attributeReferences) {
      // Since we are potentially updating attributes that may trigger an image
      // load, ensure that this feature is disabled in the temporary node.
      if (newNode instanceof Ci.nsIImageLoadingContent) {
        newNode.loadingEnabled = false;
      }
      // Examine each ExactPersistReference object and replace the value of the
      // referenced attribute. In some cases, this array may also be empty.
      for (var [, reference] in Iterator(jobPersistData.attributeReferences)) {
        // The value can be specified explicitly using a source fragment, or it
        // can be the URI for the resource associated with the reference.
        newNode.setAttribute(reference.sourceAttribute,
         reference.targetFragment ? reference.targetFragment.sourceData :
         reference.resolvedTargetUriSpec);
      }
    }

    // Blank all event handlers.
    if ((newNode instanceof Ci.nsIDOMElement) && newNode.hasAttributes()) {
      var attributeNames = Array.map(newNode.attributes, function(a) a.name);
      for (var [, attributeName] in Iterator(attributeNames)) {
        if (this._eventNames.indexOf(attributeName.toLowerCase()) >= 0) {
          newNode.setAttribute(attributeName, "");
        }
      }
    }

    // Replace the original node with the modified version.
    return newNode;
  },

  /**
   * Escapes non-ASCII characters in the comments used for inlining generated
   * stylesheets, to avoid HTML-encoding some characters incorrectly.
   */
  _escapeCssComment: function(aText) {
    return aText.replace(
      /[^\x00-\x7E]/g,
      function (aMatch) {
        return "\\" + aMatch.charCodeAt(0).toString(16).toUpperCase() + " ";
      }
    ).replace(/--/, "\\2D\\2D ");
  },

  _eventNames: [
    "onabort",
    "onafterscriptexecute",
    "onafterprint",
    "onbeforeunload",
    "onbeforescriptexecute",
    "onblur",
    "onbeforeprint",
    "onchange",
    "onclick",
    "oncontextmenu",
    "oncopy",
    "oncut",
    "oncanplay",
    "oncanplaythrough",
    "ondblclick",
    "ondrag",
    "ondragend",
    "ondragenter",
    "ondragleave",
    "ondragover",
    "ondragstart",
    "ondrop",
    "ondurationchange",
    "ondeviceorientation",
    "ondevicemotion",
    "onerror",
    "onemptied",
    "onended",
    "onfocus",
    "onhashchange",
    "oninput",
    "oninvalid",
    "onkeydown",
    "onkeypress",
    "onkeyup",
    "onload",
    "onloadeddata",
    "onloadedmetadata",
    "onloadstart",
    "onmousemove",
    "onmouseout",
    "onmouseover",
    "onmouseup",
    "onmousedown",
    "onmessage",
    "onpaint",
    "onpageshow",
    "onpagehide",
    "onpaste",
    "onpopstate",
    "onpause",
    "onplay",
    "onplaying",
    "onprogress",
    "onreadystatechange",
    "onreset",
    "onresize",
    "onratechange",
    "onscroll",
    "onselect",
    "onsubmit",
    "onseeked",
    "onseeking",
    "onstalled",
    "onsuspend",
    "ontimeupdate",
    "ontouchstart",
    "ontouchend",
    "ontouchmove",
    "ontouchenter",
    "ontouchleave",
    "ontouchcancel",
    "onunload",
    "onvolumechange",
    "onwaiting",
  ],
}
