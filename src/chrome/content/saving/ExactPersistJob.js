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

Cu.import("resource://gre/modules/PrivateBrowsingUtils.jsm");

/**
 * Manages the saving process of all the resources required to render a
 * document, providing a single progress indication.
 *
 * This class derives from JobRunner. See the JobRunner documentation for
 * details.
 *
 * The saving process starts immediately with a reference collection phase. The
 * provided DOM document is examined, and a child job object is created for any
 * reference to additional content that should be saved. The type of the child
 * job object depends on the type of the referenced resource that has been
 * found. The following types of referenced resources are recognized:
 *   - Previously parsed DOM document (handled by ExactPersistParsedJob)
 *   - Previously parsed CSS stylesheet (handled by ExactPersistParsedJob)
 *   - Resource required for rendering (handled by ExactPersistUnparsedJob)
 *   - Resource not required for rendering (not handled by a save job)
 *
 * During this phase, the PersistBundle object of this job is populated with
 * one PersistResource object for each unique referenced resource, regardless of
 * whether the resource should be saved locally or not. At the same time, each
 * ExactPersistParsedJob object builds a list of ExactPersistReference objects,
 * that associates every reference with its target PersistResource.
 *
 * At this point, this save job is ready to start. The first child jobs to be
 * executed are those for unparsed resources, since a download failure is not
 * necessarily fatal, but may affect how the references in parsed resources are
 * updated later.
 *
 * When all the unparsed resources have been saved or skipped, the parsed
 * resources are saved by the ExactPersistParsedJob objects. When a parsed
 * resource is saved, all the web references that it contains are updated to
 * point to either the locally saved file, if present, or the original absolute
 * location of the target resource.
 *
 * Note that if the structure of a document involved in a save operation changes
 * while the operation is in progress, the web references found in newly created
 * DOM nodes or stylesheet rules will not be updated correctly.
 *
 * @param aDocument
 *        The document to be saved, which will be inspected to find additional
 *        related resources.
 * @param aTargetFile
 *        The nsIFile where the main document will be saved.
 * @param aTargetDataFolder
 *        The nsIFile of the support folder for data files.
 */
function ExactPersistJob(aEventListener, aDocument, aTargetFile,
 aTargetDataFolder, aSaveWithMedia, aSaveWithContentLocation,
 aSaveWithNotLoadedResources) {
  // Never save resources in parallel. This is necessary because unparsed jobs
  // must be completed before parsed jobs can be started.
  JobRunner.call(this, aEventListener, false);
  this.saveWithMedia = aSaveWithMedia;
  this.saveWithContentLocation = aSaveWithContentLocation;
  this.saveWithNotLoadedResources = aSaveWithNotLoadedResources;

  // Initialize the state of the object.
  this.bundle = new PersistBundle();
  this.folder = new PersistFolder(aTargetDataFolder);

  // Initialize other member variables explicitly.
  this._parsedJobs = [];

  // Determine if the window from which the document is being saved is private.
  var isPrivate = PrivateBrowsingUtils.isWindowPrivate(aDocument.defaultView);

  // If the collection phase succeeds and this job is started, the first thing
  // to do is to delete any existing support folder for data files.
  this._addJob(new ExactPersistInitialJob(this, aTargetDataFolder));

  // Find the comparable target URI for the document, by removing the hash part.
  // This step is required to ensure that the comparisons with other resource
  // references in the PersistBundle object work correctly.
  var referenceUri = aDocument.documentURIObject.clone();
  try {
    // If the URI has URL syntax, remove the hash part.
    referenceUri.QueryInterface(Ci.nsIURL).ref = "";
  } catch (e) {
    // In case of errors, use the original URI.
  }
  // Create a new job for the document and recursively create the other jobs.
  this.createJobForReference({saveLinkedDomDocument: aDocument}, referenceUri);

  // At this point, all the parsed jobs have been created and added to the
  // _parsedJobs array. Create an unparsed job for all the resources that should
  // be saved and don't have a parsed job already associated with them.
  for (var [, resource] in Iterator(this.bundle.resources)) {
    if (resource.needsUnparsedJob && !resource.hasParsedJob) {
      // Create a new object for saving the contents of the resource.
      var job = new ExactPersistUnparsedJob(this, resource, isPrivate);
      // Add the job to the list of the ones to be started.
      this._addJob(job);
    }
  }

  // Now that all the resources have been added to the PersistBundle object and
  // the unparsed jobs have been added to the job list, it is time to add the
  // parsed jobs at the end of the job list too.
  for (var [curIndex, job] in Iterator(this._parsedJobs)) {
    // Add the job to the list of the ones to be started.
    this._addJob(job);
    // Set the local file name for the parsed resource. The local file name for
    // unparsed resources will be determined once the download has started,
    // since their content type is not known in advance, and the MIME media type
    // may affect the file extension that is actually used.
    if (!curIndex) {
      // This is the first parsed job, corresponding to the main document.
      job.resource.file = aTargetFile;
    } else {
      // This is one of the additional files.
      this.folder.addUnique(job.resource);
    }
  }
}

ExactPersistJob.prototype = {
  __proto__: JobRunner.prototype,

  /**
   * If set to true, objects and media files will be included when saving.
   */
  saveWithMedia: false,

  /**
   * If set to true, the page will be saved for inclusion in an MHTML file.
   */
  saveWithContentLocation: false,

  /**
   * If set to true, resources that were not originally loaded will be
   * downloaded and included when saving.
   */
  saveWithNotLoadedResources: false,

  /**
   * PersistBundle object containing all the resources for this save operation.
   */
  bundle: null,

  /**
   * PersistFolder object for the resources in addition to the main document.
   */
  folder: null,

  /**
   * Registers the given ExactPersistReference object with this save job, and
   * creates a new child job to save the referenced resource if necessary.
   *
   * This function is usually called by the child job objects to create a new
   * parsed job or prepare an unparsed job, but is also called to create the
   * first job that saves the main document.
   *
   * @param aReference
   *        ExactPersistReference object to be registered with this save job.
   *        The object will be updated with the PersistResource object
   *        corresponding to the target.
   * @param aReferenceUri
   *        nsIURI object pointing to the resource to be saved. This URI usually
   *        corresponds to the target of the reference, without the hash part.
   */
  createJobForReference: function(aReference, aReferenceUri) {
    // Determine if we are about to save a modified version of the resource.
    var saveModified =
     aReference.saveLinkedDomDocument ||
     aReference.saveLinkedCssStyleSheet ||
     aReference.saveEmptyScriptType;
    // Get the actual target resource object for the reference.
    aReference.resource = this._getResourceForUri(aReferenceUri, saveModified);
    // Execute the appropriate save action, if required.
    if (saveModified) {
      // Indicate that the resource is being saved by a parsed job.
      aReference.resource.hasParsedJob = true;
      // Create the actual parsed job.
      var job = new ExactPersistParsedJob(this, aReference.resource);
      // Add the parsed job to the list of those to be run after the unparsed
      // jobs. The first job in this list corresponds to the main document.
      this._parsedJobs.push(job);
      // After the job has been added to the list, initialize it and inspect the
      // referenced document or stylesheet to find additional jobs recursively.
      if (aReference.saveLinkedDomDocument) {
        job.initFromDomDocument(aReference.saveLinkedDomDocument);
      } else if (aReference.saveLinkedCssStyleSheet) {
        job.initFromCssStyleSheet(aReference.sourceDomDocument,
         aReference.saveLinkedCssStyleSheet, aReference.targetUri,
         aReference.saveLinkedFileCharacterSetHint);
      } else if (aReference.saveEmptyScriptType) {
        job.initFromEmptyScript(aReference.sourceDomDocument,
         aReference.saveEmptyScriptType);
      }
    } else if (aReference.saveLinkedResource) {
      // Do not create unparsed save jobs for locations that have side-effects
      // when accessed, like "javascript:" or "mailto:" addresses.
      if (!Cc["@mozilla.org/network/util;1"].getService(Ci.nsINetUtil).
       URIChainHasFlags(aReferenceUri,
       Ci.nsIProtocolHandler.URI_NON_PERSISTABLE)) {
        // Do not create unparsed save jobs for resources that have not been
        // actually loaded to display the document, unless overridden.
        var loadedUriSpecs = aReference.sourceDomDocument.loadedUriSpecs;
        if ((loadedUriSpecs && loadedUriSpecs[aReferenceUri.spec]) ||
            this.saveWithNotLoadedResources) {
          // The resource will be saved by an unparsed job, unless a parsed job
          // gets associated with the resource meanwhile.
          aReference.resource.needsUnparsedJob = true;
        } else {
          // Store a special resource location instead of the original URI.
          aReference.originalResourceNotLoaded = true;
        }
      }
    }
  },

  /**
   * Modifies the contentLocation property of the provided PersistResource
   * object, setting it to the specified location. The specified URI is
   * appropriately escaped before the property is initialized or updated.
   */
  setResourceLocation: function(aResource, aUriSpec) {
    // If the content location of the referenced resources will be used to find
    // them inside an MHTML archive, we must ensure that the references in the
    // output are identical to the "Content-Location" headers, octet by octet.
    // Since the HTML and XHTML serializers do aggressive escaping of URIs if
    // they appear in attributes named "src" or "href", potentially making the
    // strings different even if they contain only valid ASCII characters like
    // the tilde ("~"), we must do the same aggressive escaping beforehand.
    if (this.saveWithContentLocation) {
      // Ensure that all the ASCII and international characters different from
      // "%#;/?:@&=+$,[]" are URI-escaped using the UTF-8 character set. In this
      // case, however, the character set is generally not relevant, as the URI
      // specification is unlikely to contain international characters except
      // when overriding the location of the main document. For more information
      // on this escaping method, see the "EscapeURI" function in
      // <http://mxr.mozilla.org/mozilla-central/source/content/base/src/nsXHTMLContentSerializer.cpp>
      // (retrieved 2009-12-24).
      var textToSubUri = this._textToSubURI;
      aResource.contentLocation = aUriSpec.replace(/[^%#;\/?:@&=+$,\[\]]+/g,
       function(aPart) textToSubUri.ConvertAndEscape("utf-8", aPart));
    } else {
      // Additional escaping is not required.
      aResource.contentLocation = aUriSpec;
    }
  },

  /**
   * Returns a reference to the PersistResource object corresponding to the
   * specified parameters, from the PersistBundle associated with this job. If a
   * corresponding object is not already available, a new PersistResource object
   * will be created and added to the PersistBundle.
   *
   * @param aUri
   *        nsIURI object for the resource to be retrieved.
   * @param aModified
   *        If true, indicates that a potentially modified version of the
   *        original resource will be saved in place of the original resource.
   *        This ensures that a unique reference is returned even if a modified
   *        resource with the same original URI already exists in the
   *        PersistBundle.
   */
  _getResourceForUri: function(aUri, aModified) {
    // This function implements the logic that allow plain links to documents
    // that are being saved locally to be updated to one of their saved
    // versions, while ensuring that differently modified versions of the same
    // original document get saved to different files.
    var resource;
    if (aModified) {
      // We are about to save the modified contents of the resource originally
      // coming from the specified URI. If a reference to an unmodified resource
      // for the given URI already exists, it means that links to the resource
      // were encountered previously. Since those links must be updated to point
      // to the locally modified version of the resource, we reuse the
      // corresponding resource object if possible. Conversely, we don't reuse
      // resource objects corresponding to other modified resources, since we
      // assume that every parsed version of the same original resource is
      // unique.
      resource = this.bundle.getResourceByOriginalUri(aUri);
    } else {
      // We are processing a reference to the web resource corresponding to the
      // content originally located at the given URI. If we already encountered
      // the resource, we can point to it even if we have a modified version.
      resource = this.bundle.getResourceByReferenceUri(aUri);
    }
    // If no resource has been found, create a new one and add it to the bundle.
    if (!resource) {
      resource = this._createResourceForUri(aUri);
    }
    // If we are about to save a modified version of the resource, indicate this
    // by generating a unique URI for the resource. This also ensures that the
    // resource object will not be reused when saving a differently modified
    // version of the resource retrieved from the same original URI.
    if (aModified) {
      this._setUniqueResourceLocation(resource);
    }
    // Return the existing or new resource object.
    return resource;
  },

  /**
   * Creates a new PersistResource object associated with the provided URI, and
   * adds it to the PersistBundle object associated with this save operation.
   */
  _createResourceForUri: function(aUri) {
    var resource = new PersistResource();
    resource.referenceUri = aUri;
    resource.originalUri = aUri;
    this.setResourceLocation(resource, aUri.spec);
    this.bundle.resources.push(resource);
    this.bundle.addResourceToIndex(resource);
    return resource;
  },

  /**
   * Modifies the provided PersistResource object, indicating that it contains
   * parsed content that may have been modified, and as such its unique URI does
   * not correspond to the location the content was originally retrieved from.
   * This allows multiple modified versions of the same original content to be
   * present in the same web archive.
   */
  _setUniqueResourceLocation: function(aResource) {
    // Generate a unique URI by prepending a random prefix to the original
    // location, for example "urn:snapshot-A6B7C8D9:http://www.example.com/".
    var randomHexString = Math.floor(Math.random() * 0x100000000).toString(16);
    var uniquePrefix = "urn:snapshot-" +
     ("0000000" + randomHexString.toUpperCase()).slice(-8) + ":";
    var uniqueUri = Cc["@mozilla.org/network/io-service;1"].
     getService(Ci.nsIIOService).newURI(uniquePrefix +
     aResource.referenceUri.spec, null, null);
    // Modify the properties of the provided resource object.
    this.bundle.removeResourceFromIndex(aResource);
    aResource.originalUri = uniqueUri;
    this.setResourceLocation(aResource, uniqueUri.spec);
    this.bundle.addResourceToIndex(aResource);
  },

  /**
   * Array of ExactPersistParsedJob objects that will be run after the other
   * jobs are completed.
   */
  _parsedJobs: [],

  _textToSubURI: Cc["@mozilla.org/intl/texttosuburi;1"].
   getService(Ci.nsITextToSubURI),
}
