/* ***** BEGIN LICENSE BLOCK *****
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
 * The Original Code is Save Complete.
 *
 * The Initial Developer of the Original Code is
 * Stephen Augenstein <perl dot programmer at gmail dot com>.
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Paolo Amadini <http://www.amadzone.org/>
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
 * A page saver that saves the entire page after collecting all files it can from
 * the document and associated stylesheets.<br>
 * <br>
 * A simple page save can be accomplished by creating an <code>nsIFile</code> object
 * for the HTML for the page and running the following code:<br>
 * <pre>
 * var saver = new scPageSaver(
 *     PAGE_DOC_OBJECT,
 *     new scPageSaver.scDefaultFileSaver(FILE_OBJECT),
 *     new scPageSaver.scDefaultFileProvider(),
 *     { callback: OPTIONAL_CALLBACK_FUNCTION }
 * );
 * saver.run();
 * </pre>
 *
 * If you're interested in overriding the default behaviors, the FileSaver and
 * FileProvider interfaces are well documented and the default implementations
 * ({@link scPageSaver.scDefaultFileSaver} &amp; {@link scPageSaver.scDefaultFileProvider})
 * provide a great starting point for development of your own.<br>
 * @class scPageSaver
 *///{
/**
 * Creates a page saver object and initalizes. Call {@link run} to start the
 * saving process.
 * @constructor scPageSaver
 * @param {Document} doc - The document object for the page to be saved
 * @param {FileSaver} fileSaver - The file saver object to use for saving
 * @param {FileProvider} fileProvider - The file provider object to use for downloading
 * @param {optional Object} options - Any optional data that affects the save, from settings to callbacks
 * @... {Boolean} saveIframes - Pass in as true to have iframes processed - defaults to false
 * @... {Boolean} saveObjects - Pass in to have object, embed, and applet tags processed - defaults to false
 * @... {Boolean} rewriteLinks - Pass in to have links rewritten to be absolute before saving
 * @... {Function} callback - The optional callback on save completion
 * @... {Object} progressListener - Progress listener that can QueryInterface to nsIWebProgressListener2.
 *                                  Pass false to prevent the progress from showing in the download manager.
 * @... {String} actualSaveUrl - Actual URL where the document to be saved is located. Overrides the document location.
 * @... {String} originalUrl - URL from which the document to be saved was originally saved.
 */
var scPageSaver = function(doc, fileSaver, fileProvider, options) {
    if(!options) options = {};

    // Initialize data
    this._ran = false;
    this._warnings = [];
    this._errors = [];
    this._simultaneousDownloads = 0;
    this._currentURIIndex = 0;
    this._uris = [];
    this._currentDownloadIndex = 0;
    this._downloads = [];
    this._timers = {};
    this._url = doc.location.href;
    this._displayUrl = this._url;
    this._originalUrl = this._url;
    this._displayUri = scPageSaver.nsIIOService.newURI(this._displayUrl, null, null);
    this._doc = doc;

    // Initialize file saver & file provider
    var me = this;
    this._fileSaver = fileSaver;
    this._fileSaver.callback = function(uri, success) { me._saveDone(uri, success); };
    this._fileProvider = fileProvider;
    this._fileProvider.callback = function(download) { me._downloadFinished(download); };

    // Extract data from options
    this._callback = options['callback'];
    delete options['callback'];

    if(options.hasOwnProperty('progressListener')) {
        if(options['progressListener'] !== false) {
            this._listener = options['progressListener'].QueryInterface(Components.interfaces.nsIWebProgressListener2);
        }
        delete options['progressListener'];
    } else {
        this._listener = Components.classes["@mozilla.org/transfer;1"].createInstance(Components.interfaces.nsITransfer);
        this._listener.init(this._displayUri, this._fileSaver.targetURI, "", null, null, null, this, false);
    }

    if(options.hasOwnProperty('originalUrl')) {
        this._originalUrl = options['originalUrl'];
        delete options['originalUrl'];
    }

    // Check if the save location is different from the location of the document
    if(options.hasOwnProperty('actualSaveUrl')) {
        this._url = options['actualSaveUrl'];
        delete options['actualSaveUrl'];
    }
    this._uri = scPageSaver.nsIIOService.newURI(this._url, null, null);

    // Optional settings
    this._options = { // Defaults
        saveIframes: false,
        saveObjects: false,
        rewriteLinks: false
    };
    for(var prop in options) this._options[prop] = options[prop];
}

/* XPCOM Shortcuts */
scPageSaver.nsIIOService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
scPageSaver.nsIThreadManager = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager);
scPageSaver.nsIRequest = Components.interfaces.nsIRequest;
scPageSaver.webProgress = Components.interfaces.nsIWebProgressListener;
scPageSaver.XPathResult = Components.interfaces.nsIDOMXPathResult;
/* Constants */
scPageSaver.cssURIRegex = /url\(\s*(["']?)([^)"' \n\r\t]+)\1\s*\)/gm;
scPageSaver.STYLE_RULE = 1;
scPageSaver.IMPORT_RULE = 3;
scPageSaver.MEDIA_RULE = 4;
scPageSaver.DEFAULT_CHARSET = "ISO-8859-1";
scPageSaver.DEFAULT_WRITE_CHARSET = "UTF-8";

/**
 * Starts the saving process. Calls the callback when done saving or if it failed
 * with a status code as the first parameter.
 * @function run
 */
scPageSaver.prototype.run = function() {
    // Force run to only be called once
    if(this._ran) throw new Error('Cannot run more than once');
    this._ran = true;

    // Notify listener that we are starting and bump the progress change so if it's a transfer it shows up
    if(this._listener) {
        this._listener.onStateChange(null, null, scPageSaver.webProgress.STATE_START | scPageSaver.webProgress.STATE_IS_NETWORK, Components.results.NS_OK);
        this._listener.onProgressChange64(null, null, 0, 1, 0, 1);
    }

    // Start the process, running the extract, and then starting the downloader
    try {
        this._timers.extract = {start: new Date(), finish: null};
        this._extractURIs();
        this._timers.extract.finish = new Date();

        this._timers.download = {start: new Date(), finish: null};
        this._downloadNextURI();
    } catch(e) {
        this._errors.push(e.toString());
        this._finished();
    }
};

/**
 * Cancels the currently in progress saver
 * @function cancel
 * @param {nsresult} reason - The reason why the operation was canceled
 */
scPageSaver.prototype.cancel = function(reason) {
    this._fileProvider.cancel();

    // Report the reason
    switch (reason) {
        case 0:
            // This value is used when the operation is canceled internally.
            // The error has already been reported.
            break;
        case Components.results.NS_BINDING_ABORTED:
            this._errors.push('Download canceled by user');
            break;
        default:
            this._errors.push('Download canceled because of an error: '+reason);
            break;
    }

    // Notify the listeners and clean up
    this._finished();
}

/**
 * QueryInterface function to allow passing as cancelable to transfer
 * @function QueryInterface
 * @param {Object} iid - The interface to convert to
 */
scPageSaver.prototype.QueryInterface = function(iid) {
    if(iid.equals(Components.interfaces.nsICancelable)) {
        return this;
    }
    throw Components.results.NS_ERROR_NO_INTERFACE;
},

/**
 * Extracts all URIs from the document, tagging them and storing them for processing.
 * @function _extractURIs
 */
scPageSaver.prototype._extractURIs = function() {
    // Add base document path
    this._uris.push(new scPageSaver.scURI(this._url, this._uri, 'index', 'base'));

    // Extract all URIs from this document and its subdocuments
    this._extractURIsFromDocument(this._doc);

    // Process all dupes
    this._processDupes();

    // Move the base document path to the beginning
    this._uris.sort(function(a,b) {
        if (a.type == 'index') return -1;
        return 0;
    });
};

/**
 * Extracts all URIs from the document, tagging them and storing them for processing.
 * @function _extractURIs
 * @param {Object} doc - The document to extract URLs from
 */
scPageSaver.prototype._extractURIsFromDocument = function(doc) {
    var e = null, iter = null;

    // Get the base URL object for the document
    var baseUri = doc.baseURIObject;

    // Support XHTML documents
    var nsResolver = function() doc.contentType == "application/xhtml+xml" ? "http://www.w3.org/1999/xhtml" : "";

    // Process images
    iter = doc.evaluate("//ns:img[@src]", doc, nsResolver, scPageSaver.XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    while((e = iter.iterateNext())) {
        this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
    }

    // Process script tags
    iter = doc.evaluate("//ns:script[@src]", doc, nsResolver, 0, null);
    while((e = iter.iterateNext())) {
        this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
    }

    if(this._options['saveIframes']) {
        // Save the html in the iframe and process the iframe document
        iter = doc.evaluate("//ns:iframe[@src]", doc, nsResolver, 0, null);
        while((e = iter.iterateNext())) {
            this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
            this._extractURIsFromDocument(e.contentDocument);
        }
    }

    // Save the html in the frame and process the frame document
    iter = doc.evaluate("//ns:frame[@src]", doc, nsResolver, 0, null);
    while((e = iter.iterateNext())) {
        this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
        this._extractURIsFromDocument(e.contentDocument);
    }

    if(this._options['saveObjects']) {
        // Process embed tags
        iter = doc.evaluate("//ns:embed[@src]", doc, nsResolver, 0, null);
        while((e = iter.iterateNext())) {
            this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
        }

        // Process video tags
        iter = doc.evaluate("//ns:video[@src]", doc, nsResolver, 0, null);
        while((e = iter.iterateNext())) {
            if(e.getAttribute('poster')) {
                this._uris.push(new scPageSaver.scURI(e.getAttribute('poster'), baseUri, 'attribute', 'base'));
            }
            this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
        }

        // Process audio tags
        iter = doc.evaluate("//ns:audio[@src]", doc, nsResolver, 0, null);
        while((e = iter.iterateNext())) {
            this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
        }

        // Process source tags
        iter = doc.evaluate("//ns:source[@src]", doc, nsResolver, 0, null);
        while((e = iter.iterateNext())) {
            this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
        }

        // Process object tags (or at least try to)
        iter = doc.evaluate("//ns:object", doc, nsResolver, 0, null);
        while((e = iter.iterateNext())) {
            if(e.getAttribute('data')) {
                this._uris.push(new scPageSaver.scURI(e.getAttribute('data'), baseUri, 'attribute', 'base'));
            }

            // Find param that references the object's data
            var p = null;
            var pIter = doc.evaluate('ns:param', e, nsResolver, 0, null);
            while((p = pIter.iterateNext())) {
                var param = p.getAttribute('name');
                if(param == 'movie' || param == 'src') {
                    if(p.getAttribute('value')) {
                        this._uris.push(new scPageSaver.scURI(p.getAttribute('value'), baseUri, 'attribute', 'base'));
                        break;
                    }
                }
            }
        }
    }

    // Process input elements with an image type
    iter = doc.evaluate("//ns:input[@type='image']", doc, nsResolver, scPageSaver.XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    while((e = iter.iterateNext())) {
        if(e.getAttribute('src')) {
            this._uris.push(new scPageSaver.scURI(e.getAttribute('src'), baseUri, 'attribute', 'base'));
        }
    }

    // Process elements which have a background attribute
    iter = doc.evaluate("//*[@background]", doc, null, 0, null);
    while((e = iter.iterateNext())) {
        this._uris.push(new scPageSaver.scURI(e.getAttribute('background'), baseUri, 'attribute', 'base'));
    }

    // Process IE conditional comments
    iter = doc.evaluate("//comment()", doc, null, 0, null);
    while((e = iter.iterateNext())) {
        if(typeof e.data != 'string') continue;
        if(!/^\[if[^\]]+\]>/.test(e.data)) continue; // Check if it starts with [if...]>

        var results = null;

        // Extract link element refs (stylesheets)
        var linkRe = /<link[^>]+href=(["'])([^"']*)\1/igm;
        while((results = linkRe.exec(e.data)) != null) {
            this._uris.push(new scPageSaver.scURI(results[2], baseUri, 'attribute', 'base'));
        }

        // Extract script elements refs
        var scriptRe = /<script[^>]+src=(["'])([^"']*)\1/igm;
        while((results = scriptRe.exec(e.data)) != null) {
            this._uris.push(new scPageSaver.scURI(results[2], baseUri, 'attribute', 'base'));
        }
    }

    // Process elements with a style attribute
    iter = doc.evaluate("//*[@style]", doc, null, 0, null);
    while((e = iter.iterateNext())) {
        var cssText = e.getAttribute("style");
        if(!cssText) continue;

        var results = null;
        while((results = scPageSaver.cssURIRegex.exec(cssText)) != null) {
            this._uris.push(new scPageSaver.scURI(results[2], baseUri, 'css', 'base'));
        }
    }

    // Process internal stylesheets
    var styleSheets = doc.styleSheets;
    for(var i = 0; i < styleSheets.length; i++) {
        if (styleSheets[i].ownerNode && styleSheets[i].ownerNode.getAttribute) {
            if(styleSheets[i].ownerNode.getAttribute("href")) {
                this._uris.push(new scPageSaver.scURI(styleSheets[i].ownerNode.getAttribute("href"), baseUri, 'attribute', 'base'));
                this._extractURIsFromStyleSheet(styleSheets[i], styleSheets[i].href)
            } else {
                this._extractURIsFromStyleSheet(styleSheets[i], doc.documentURI, true);
            }
        } else if (styleSheets[i].ownerNode && styleSheets[i].ownerNode.target) {
            // Extract references from stylesheet processing instructions
            var xmlHrefRe = /href=(["'])([^"']*)\1/gm;
            while((results = xmlHrefRe.exec(styleSheets[i].ownerNode.data)) != null) {
                this._uris.push(new scPageSaver.scURI(results[2], baseUri, 'attribute', 'base'));
            }
        }
    }
};

/**
 * Extracts all URIs from the given stylesheet, tagging them and storing them for processing.
 * @function _extractURIsFromStyleSheet
 * @param {CSSStyleSheet} styleSheet - The stylesheet to extract from
 * @param {String or nsIURI} importPath - The path for the stylesheet that it was imported from
 * @param {optional Boolean} inline - Whether or not the spreadsheet is inlined into the document body. Defaults to false.
 */
scPageSaver.prototype._extractURIsFromStyleSheet = function(styleSheet, importPath, inline) {
    if(typeof inline == 'undefined') inline = false;

    var cssRules = styleSheet.cssRules;
    for(var r = 0; r < cssRules.length; r++) {
        var rule = cssRules[r];

        if(rule.type == scPageSaver.IMPORT_RULE && rule.href) {
            // Add import url and process imported stylesheet
            var importRuleURI = new scPageSaver.scURI(rule.href, importPath, 'import', inline?'base':'extcss');
            this._uris.push(importRuleURI);

            this._extractURIsFromStyleSheet(rule.styleSheet, importRuleURI.uri);
        } else if(rule.type == scPageSaver.STYLE_RULE) {
            var results = null;
            while((results = scPageSaver.cssURIRegex.exec(rule.cssText)) != null) {
                this._uris.push(new scPageSaver.scURI(results[2], importPath, 'css', inline?'base':'extcss'));
            }
        } else if(rule.type == scPageSaver.MEDIA_RULE) {
            this._extractURIsFromStyleSheet(rule, importPath, inline);
        }
    }
};

/**
 * Removes complete dupes and marks url dupes.
 * @function _processDupes
 */
scPageSaver.prototype._processDupes = function() {
    this._uris.sort(scPageSaver.scURI.compare);
    var previous = this._uris[0];
    for(var i = 1; i < this._uris.length; i++) {
        if(!previous.uri || !previous.toString()) {
            this._uris.splice(--i, 1);
            previous = this._uris[i];
            continue;
        }

        if(previous.isExactDupe(this._uris[i])) {
            this._uris.splice(i--, 1);
        } else if(previous.isDupe(this._uris[i])) {
            this._uris[i].dupe = true;
        } else {
            previous = this._uris[i];
        }
    }
};

/**
 * Downloads the next URI in the stack. Once it's done, starts the processor.
 * @function _downloadNextURI
 */
scPageSaver.prototype._downloadNextURI = function() {
    // 4 simultaneous "downloads" max
    while(this._simultaneousDownloads < 4 && this._currentURIIndex < this._uris.length) {
        var currentURI = this._uris[this._currentURIIndex];
        this._currentURIIndex++;

        // Skip dupes
        if(currentURI.dupe) {
            continue;
        }

        var download = this._fileProvider.createDownload(currentURI);
        if(currentURI.type == 'index') download.charset = this._doc.characterSet; // Set character set from document
        this._simultaneousDownloads++;

        download.start();
    }
};

/**
 * Download completion callback
 * @function _downloadFinished
 * @param {scPageSaver.scDownload} download - The download that was completed
 */
scPageSaver.prototype._downloadFinished = function(download) {
    // Do not execute the callback if the process has been canceled
    if (this._hasFinished) {
        return;
    }

    this._simultaneousDownloads--;
    this._downloads.push(download);

    if(download.failed && download.uri.type == 'index') {
        this._errors.push('Failed to download main file');
        this.cancel(0);
        return;
    }

    if(this._listener) {
        this._listener.onProgressChange64(null, null, this._downloads.length, this._uris.length, this._downloads.length, this._uris.length);
    }

    // Stop downloading if beyond end of uri list
    if(this._currentURIIndex >= this._uris.length) {
        if(this._simultaneousDownloads == 0) {
            // Downloading finished so start the processor
            this._timers.download.finish = new Date();

            this._timers.process = {start: new Date(), finish: null};
            this._processNextURI();
        }
    } else {
        this._downloadNextURI();
    }
}

/**
 * Enqueues the _processNextURI function for execution on the main thread.
 * @function _prepareToProcessNextURI
 */
scPageSaver.prototype._prepareToProcessNextURI = function() {
    var me = this;
    scPageSaver.nsIThreadManager.mainThread.dispatch({
        run: function() {
            if (!me._hasFinished) {
                me._processNextURI();
            }
        }
    }, Ci.nsIThread.DISPATCH_NORMAL);
}

/**
 * Fixes the next URI in the stack and saves it to disk.
 * @function _processNextURI
 */
scPageSaver.prototype._processNextURI = function() {
    // Stop processing if beyond end of download list
    if(this._currentDownloadIndex >= this._downloads.length) {
        this._finished();
        return;
    }

    var me = this;
    var download = this._downloads[this._currentDownloadIndex];
    var data = download.contents;

    // Skip processing of failed downloads
    if(download.failed) {
        // Notify that the given URI was not saved
        if (this._fileSaver.notifyURIFailed) {
            this._fileSaver.notifyURIFailed(download.uri);
        }
        this._warnings.push("Download failed for uri: "+download.uri);
        this._currentDownloadIndex++;
        this._prepareToProcessNextURI();
        return;
    }

    if(download.uri.type == 'index' || download.contentType == "text/html" || download.contentType == "application/xhtml+xml") {
        // Only for the main document, if the content type is correct
        if(download.uri.type == 'index' && (download.contentType == "text/html" || download.contentType == "application/xhtml+xml")) {
            // Mark the document as coming from a certain URL (Like IE)
            if(data.match(/<html[^>]*>/i)) {
                data = data.replace(/(<html[^>]*>)/i,"$1<!-- Source is "+this._originalUrl+" -->");
            } else {
                data = "<!-- Source is "+this._originalUrl+" -->\n" + data;
            }
        }

        // Comment out "base" element, which messes everything up
        data = data.replace(/(<base[^>]*>)/i,"<!--$1-->");

        // Fix all URLs so they point to the proper place
        for(var n = 0; n < this._uris.length; n++) {
            var uri = this._uris[n];

            // Skip empty urls or ones that aren't for the base document
            if(!uri.extractedURI || uri.type == 'index' || uri.where != "base") continue;

            var found = this._regexEscape(uri.extractedURI);
            var savePathURL = this._fileSaver.documentPath(uri, download.uri);
            if(uri.type == "attribute") {
                // Fix all instances where this url is found in an attribute
                var re = new RegExp("(<[^>]+=([\"'])\\s*)"+found+"(\\s*\\2)","g");
                data = data.replace(re, "$1"+savePathURL.replace(/'/g, "&apos;")+"$3");
            } else if(uri.type == "css") {
                // Fix all instances where this url is found in a URL command in css
                // Fix in style attributes
                var re = new RegExp("(<[^>]+style=\"\\s*[^\"]+)url\\((\\s*([\"']?)\\s*)"+found+"(\\s*\\3\\s*)\\)([^\"]*\")","g");
                data = data.replace(re, "$1url($3"+savePathURL+"$4)$5");

                // Fix in inlined style sheets
                var re = new RegExp("<style[^>]*>((?:.*?[\r\n\t ]*)*?)</style>","gmi");
                var urlRe = new RegExp("url\\((\\s*([\"']?)\\s*)"+found+"(\\s*\\2\\s*)\\)","g");
                var replaceFunc = function(all, match, offset) {
                    return all.replace(urlRe, "url($1"+savePathURL+"$3)");
                };
                data = data.replace(re, replaceFunc);
            } else if(uri.type == "import") {
                // Fix all instances where this url is found in an import rule
                var re = new RegExp("<style[^>]*>((?:.*?[\r\n\t ]*)*?)</style>","gmi");
                var noURLImportRe = new RegExp("(@import\\s*([\"'])\\s*)"+found+"(\\s*\\2)","g");
                var urlImportRe   = new RegExp("(@import\\s+url\\(\\s*([\"']?)\\s*)"+found+"(\\s*\\2\\s*)\\)","g");
                var replaceFunc = function(all, match, offset) {
                    all = all.replace(noURLImportRe, "$1"+savePathURL+"$3");
                    all = all.replace(urlImportRe ,  "$1"+savePathURL+"$3)");
                    return all;
                };
                data = data.replace(re, replaceFunc);
            }
        }

        // Fix anchors to point to absolute location instead of relative
        if(this._options['rewriteLinks']) {
            // TODO: See if adding a negative lookahead for the https?: would improve performance
            var replaceFunc = function() {
                var match = /^([^:]+):/.exec(arguments[0]);
                if(match && match[1] != 'http' && match[1] != 'https')
                    return arguments[0];
                else
                    return arguments[1]+arguments[2]+me._uri.resolve(arguments[3])+arguments[2];
            }
            data = data.replace(/(<a[^>]+href=)(["'])([^"']+)\2/igm, replaceFunc);
        }

        // Save adjusted file
        this._fileSaver.saveURIContents(download.uri, data, download.charset);
    } else if(download.contentType == "text/css") {
        // Fix all URLs in this stylesheet
        for(var n = 0; n < this._uris.length; n++) {
            var uri = this._uris[n];

            // Skip empty urls or ones that aren't for external CSS files
            if(!uri.extractedURI || uri.type == 'index' || uri.where != "extcss") continue;

            var found = this._regexEscape(uri.extractedURI);
            var savePathURL = this._fileSaver.documentPath(uri, download.uri);
            if(uri.type == "css") {
                // Fix url functions in CSS
                var re = new RegExp("url\\((\\s*([\"']?)\\s*)"+found+"(\\s*\\2\\s*)\\)","g");
                data = data.replace(re,"url($1"+savePathURL+"$3)");
            } else if(uri.type == "import") {
                // Fix all instances where this url is found in an import rule
                var noURLImportRe = new RegExp("(@import\\s*([\"'])\\s*)"+found+"(\\s*\\2)","g");
                var urlImportRe   = new RegExp("(@import\\s+url\\(\\s*([\"']?)\\s*)"+found+"(\\s*\\2\\s*)\\)","g");
                data = data.replace(noURLImportRe, "$1"+savePathURL+"$3");
                data = data.replace(urlImportRe ,  "$1"+savePathURL+"$3)");
            }
        }

        // Save adjusted stylesheet
        this._fileSaver.saveURIContents(download.uri, data, download.charset);
    } else if(/^text\//.test(download.contentType) || download.contentType == 'application/x-javascript') {
        // Had problems with nsWebBrowserPersist and text files, so for now I'll do the saving
        this._fileSaver.saveURIContents(download.uri, data, download.charset);
    } else if(download.contentType != "") {
        // Something we aren't processing so use the file saver's saveURI, because it always works
        this._fileSaver.saveURI(download.uri);
    } else {
        this._warnings.push('Missing contentType: '+download.uri);
    }

    download.contents = ""; // For some small clean up

    this._currentDownloadIndex++;
};

/**
 * Called when a save is completed
 * @function _saveDone
 * @param {scPageSaver.scURI} uri - The uri of the file that was just saved
 * @param {Boolean} success - Whether or not the save was successful
 */
scPageSaver.prototype._saveDone = function(uri, success) {
    // Do not execute the callback if the process has been canceled
    if (this._hasFinished) {
        return;
    }

    if(!success) {
        if(uri.type == 'index') {
            this._errors.push('Failed to write main file');
            this.cancel(0);
            return;
        } else {
            this._warnings.push('Could not save: '+uri);
        }
    }

    this._prepareToProcessNextURI();
}

/**
 * Cleans up and calls callback. Called when finished downloading and processing.
 * @function _finished
 */
scPageSaver.prototype._finished = function() {
    // If the operation finished, no action is required
    if (this._hasFinished) {
      return;
    }

    this._hasFinished = true;

    if(this._timers.process) this._timers.process.finish = new Date();

    var nsResult = this._errors.length == 0 ? Components.results.NS_OK : Components.results.NS_ERROR_FAILURE;

    if(this._callback) {
        this._callback(this, nsResult, {warnings: this._warnings, errors: this._errors, timers: this._timers});
    }

    if(this._listener) this._listener.onStateChange(null, null, scPageSaver.webProgress.STATE_STOP | scPageSaver.webProgress.STATE_IS_NETWORK, nsResult);

    this._listener = null;
    this._fileSaver = null;
    this._fileProvider = null;
    this._callback = null;
}

/**
 * Escapes a string for insertion into a regex for recognition of escaped URLs.
 * @function {String} _regexEscape
 * @param {String} str - The string to escape
 * @return The escaped string
 */
scPageSaver.prototype._regexEscape = function(str) {
    return str.replace(/([?+$|./()\[\]^*])/g,"\\$1").replace(/ /g, "(?: |%20)").replace(/&/g, "&(?:amp;)?").replace(/"/g, '(?:"|&quot;)').replace(/'/g, "(?:'|&apos;)").replace(/</g, "(?:<|&lt;)").replace(/>/g, "(?:>|&gt;)");
};
//}


/**
 * Default file saver component.
 * Is responsible for calculating replacement URLs in the documents and saving
 * files and urls.
 * Saving is sequential, so it's not necessary to structure code to handle parallel
 * saves.
 * @class scPageSaver.scDefaultFileSaver
 *///{
/**
 * The function to call when a save has completed. Called with the uri of the
 * saved file and the success of the save as a boolean.
 * @property {Function} callback
 */
/**
 * The target URI of the entire save. Used by nsITransfer to link to the download
 * location and other things.
 * @property {Function} targetURI
 */
/**
 * Creates a file saver object
 * @constructor scDefaultFileSaver
 * @param {nsIFile} file - The ouput file for the HTML
 * @param {nsIFile} dataPath - Optional support folder for data files
 */
scPageSaver.scDefaultFileSaver = function(file, dataPath) {
    this._saveMap = {};

    // Initialize target file
    this._file = file;

    // Initialize data folder
    if (!dataPath) {
        var nameWithoutExtension = file.leafName.replace(/\.[^.]*$/,"");
        var stringBundle = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService).createBundle("chrome://global/locale/contentAreaCommands.properties");
        var folderName = stringBundle.formatStringFromName("filesFolder", [nameWithoutExtension], 1);
        this._dataFolder = file.clone();
        this._dataFolder.leafName = folderName;
    } else {
        this._dataFolder = dataPath.clone();
    }

    // Delete and re-create data folder so that it's clean
    if(this._dataFolder.exists()) this._dataFolder.remove(true);

    // Define the target URI property for the listener
    this.targetURI = scPageSaver.nsIIOService.newFileURI(file);
}

/**
 * Returns the path string for the given scURI based on the relative URI. In
 * addition ensures the path is unique for the URI by creating the file ahead of
 * time and checking that it doesn't interfere with any other URIs.
 * @function {String} documentPath
 * @param {scPageSaver.scURI} uri - The URI to generate the path for
 * @param {scPageSaver.scURI} relativeURI - The URI to generate the path relative to
 */
scPageSaver.scDefaultFileSaver.prototype.documentPath = function(uri, relativeURI) {
    if(uri.type == 'index') throw new Error('Not supposed to need document path for main page');

    var saveKey = uri.toString();

    // Determine the base file name to use first and cache it if it's not cached
    if(typeof this._saveMap[saveKey] == 'undefined') {
        var fileName = uri.uri.path.split('/').pop();
        fileName = fileName.replace(/\?.*$/,"");
        fileName = fileName.replace(/[\"\*\:\?\<\>\|\\]+/g,"");
        if(fileName.length > 50) fileName = fileName.slice(0, 25)+fileName.slice(-25);
        if(fileName == "") fileName = "unnamed";

        /* Here we must check if the file can be saved to disk with the chosen
         * name. One case where the file cannot be saved is when the name
         * conflicts with one of another file that must be saved. Note that
         * whether two names collide is dependent on the underlying filesystem:
         * for example, on FAT on Windows two file names that differ only in
         * case conflict with each other, while on ext2 on Linux this conflict
         * does not occur.
         */
        // Build a new nsIFile corresponding to the file name to be saved
        var actualFileOnDisk = this._dataFolder.clone();
        if(!this._dataFolder.exists()) this._dataFolder.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
        actualFileOnDisk.append(fileName);

        // Since the file is not actually saved until later, we must create a placeholder
        actualFileOnDisk.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0644);

        // Find out which unique name has been used
        fileName = actualFileOnDisk.leafName;

        // Save to save map
        this._saveMap[saveKey] = fileName;
    }

    if(relativeURI.type == 'index') {
        return (encodeURIComponent(this._dataFolder.leafName)+'/'+encodeURIComponent(this._saveMap[saveKey]));
    } else {
        return (encodeURIComponent(this._saveMap[saveKey]));
    }
}

/**
 * Returns the file object corresponding to the location where the given scURI
 * should be saved.
 * @function {nsIFile} documentLocalFile
 * @param {scPageSaver.scURI} uri - The URI to generate the file object for
 */
scPageSaver.scDefaultFileSaver.prototype.documentLocalFile = function(uri) {
    var file = null;
    if(uri.type == 'index') {
        file = this._file;
    } else {
        var file = this._dataFolder.clone();
        if(typeof this._saveMap[uri.toString()] == 'undefined') this.documentPath(uri, {type:null}); // Force saveMap to be populated
        file.append(this._saveMap[uri.toString()]);
    }
    return file;
}

/**
 * Saves the contents of the given uri to disk using the given charset if valid
 * @function saveURIContents
 * @param {scPageSaver.scURI} uri - The uri for the file being saved
 * @param {String} contents - The contents of the file in UTF-8
 * @param {String} charset - The character set to use when saving the file
 */
scPageSaver.scDefaultFileSaver.prototype.saveURIContents = function(uri, contents, charset) {
    // Get the file object that we're saving to
    var file = this.documentLocalFile(uri);

    // Write the file to disk
    var failed = false;
    var foStream = Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(Components.interfaces.nsIFileOutputStream);
    var flags = 0x02 | 0x08 | 0x20;
    if(!charset) charset = scPageSaver.DEFAULT_WRITE_CHARSET;
    try {
        foStream.init(file, flags, 0644, 0);
        var os = Components.classes["@mozilla.org/intl/converter-output-stream;1"].createInstance(Components.interfaces.nsIConverterOutputStream);
        os.init(foStream, charset, 4096, "?".charCodeAt(0)); // Write to file converting all bad characters to "?"
        os.writeString(contents);
        os.close();
    } catch(e) {
        this.notifyURIFailed(uri);
        failed = true;
    }
    foStream.close();

    // Notify page saver that the save is done and whether it succeeded or not
    this.callback(uri, !failed);
}

/**
 * Downloads and saves the given uri to disk. Called for binary data like images
 * or swfs it uses nsIWebBrowserPersist.
 * @function saveURI
 * @param {scPageSaver.scURI} uri - The uri for the file being saved
 */
scPageSaver.scDefaultFileSaver.prototype.saveURI = function(uri) {
    this._currentURI = uri;
    var file = this.documentLocalFile(uri);

    this._persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
    this._persist.progressListener = new scPageSaver.scPersistListener(this);
    try {
        var fileURI = uri.toString().replace(/#.*$/, "");
        var channel = scPageSaver.nsIIOService.newChannel(fileURI, "", null);

        channel.loadFlags |= scPageSaver.nsIRequest.LOAD_FROM_CACHE;
        channel.loadFlags |= scPageSaver.nsIRequest.VALIDATE_NEVER;

        this._persist.saveChannel(channel, file);
    } catch(e) {
        this.notifyURIFailed(uri);
        this._currentURI = null;
        this._persist = null;
        this.callback(uri, false);
    }
}

/**
 * Called instead of the save functions if the download of the given URI failed.
 * @function notifyURIFailed
 * @param {scPageSaver.scURI} uri - The uri whose download failed
 */
scPageSaver.scDefaultFileSaver.prototype.notifyURIFailed = function(uri) {
    var file = this.documentLocalFile(uri);

    // Remove the file that was created as a placeholder, if possible
    try {
        file.remove(false);
    } catch(e) { }
}

/**
 * Called by the scPersistListener when the save is done
 * @function saveURIDone
 */
scPageSaver.scDefaultFileSaver.prototype.saveURIDone = function() {
    var uri = this._currentURI;

    // Unset variables
    this._currentURI = null;
    this._persist = null;

    // Notify saver that we're done
    this.callback(uri, true);
}
//}


/**
 * Default file provider component.
 * Is responsible for downloading URIs and determining content type and character
 * set of the downloaded file, as well as converting the contents to unicode.
 * @class scPageSaver.scDefaultFileProvider
 *///{
/**
 * The function to call when a download has completed. Called with the download
 * object that was completed.
 * @property {Function} callback
 */
/**
 * Creates a file provider object
 * @constructor scDefaultFileProvider
 */
scPageSaver.scDefaultFileProvider = function() {
    this._downloads = [];
}

/**
 * Creates a download object for the given URI and returns it.
 * @function {scPageSaver.scDownload} createDownload
 * @param {scPageSaver.scURI} uri - The uri to download
 */
scPageSaver.scDefaultFileProvider.prototype.createDownload = function(uri) {
    var download = new scPageSaver.scDownload(uri, this);
    this._downloads.push(download);
    return download;
}

/**
 * Called by the scDownload when the download is completed, it calls the download
 * done callback with the proper data.
 * @function downloadDone
 * @param {scPageSaver.scDownload} download - The download that was completed
 */
scPageSaver.scDefaultFileProvider.prototype.downloadDone = function(download) {
    for(var i = 0; i < this._downloads.length; i++) this._downloads.splice(i--, 1);
    this.callback(download);
}

/**
 * Cancels all active downloads
 * @function cancel
 */
scPageSaver.scDefaultFileProvider.prototype.cancel = function() {
    for(var i = 0; i < this._downloads.length; i++) {
        this._downloads[i].stop();
    }
}
//}


/**
 * Simple URI data storage class
 * @class scPageSaver.scURI
 *///{
/**
 * Creates a URI object.
 * @constructor scURI
 * @param {String} extractedURI - The URI extracted from the document
 * @param {String or nsIURI} base - The base URI - used to resolve extracted URI against
 * @param {String} type - The type of place where the URL was extracted from, like an attribute, import rule, style rule, etc.
 * @param {String} where - The type of file it came from - "base" or "extcss"
 */
scPageSaver.scURI = function(extractedURI, base, type, where) {
    var uriString = "";
    if(extractedURI.indexOf("http") == 0) {
        uriString = extractedURI;
    } else if(base && !(base.resolve)) {
        uriString = scPageSaver.nsIIOService.newURI(base, null, null).resolve(extractedURI);
    } else if (base.resolve) {
        uriString = base.resolve(extractedURI);
    }

    this.uri = scPageSaver.nsIIOService.newURI(uriString, null, null);
    this.extractedURI = extractedURI || "";
    this.type = type;
    this.where = where;
    this.dupe = false;
};

/**
 * Tests of the path is the URI object is the same as the given one.
 * @function {Boolean} isDupe
 * @param {scPageSaver.scURI} compare - The object to compare against
 * @return Whether they have the same path
 */
scPageSaver.scURI.prototype.isDupe = function(compare) {
    try {
        // Compare the two URLs intelligently, based on their scheme
        return this.uri.equals(compare.uri);
    } catch(e) {
        // If the URLs cannot be compared, for example if one of them is an
        // invalid file:// URL, compare their string version
        return (this.toString() == compare.toString());
    }
}

/**
 * Tests if both URI objects are exact dupes, coming from the same location, with
 * the same type, and with the same path.
 * @function {Boolean} isExactDupe
 * @param {scPageSaver.scURI} compare - The object to compare against
 * @return Whether they are exactly the same
 */
scPageSaver.scURI.prototype.isExactDupe = function(compare) {
    return (this.isDupe(compare) && this.where == compare.where && this.type == compare.type && this.extractedURI == compare.extractedURI);
}

/**
 * Returns a string representation of the object
 * @function {String} toString
 * @return The string representation of the URI
 */
scPageSaver.scURI.prototype.toString = function() {
    if(typeof this._string == 'undefined') {
        if(!this.uri) {
            this._string = false;
        } else if(this.uri.path.indexOf("/") != 0) {
            this._string = this.uri.prePath+"/"+this.uri.path;
        } else {
            this._string = this.uri.prePath+""+this.uri.path;
        }
    }
    return this._string;
};

/**
 * Comparison function passed to the sort method for scURI objects
 * @function {static int} compare
 * @param {scPageSaver.scURI} a - The first object
 * @param {scPageSaver.scURI} b - The second object
 * @return Ordering int for sort
 */
scPageSaver.scURI.compare = function(a,b) {
    if (a.toString() < b.toString()) return -1;
    if (a.toString() > b.toString()) return 1;
    if (a.type == 'index') return -1;
    return 0;
};
//}


/**
 * Download data storage class
 * @class scPageSaver.scDownload
 *///{
/**
 * Creates a download object.
 * @constructor scDownload
 * @param {scPageSaver.scURI} uri - The URI for the download
 * @param {FileProvider} fileProvider - The creating file provider
 */
scPageSaver.scDownload = function(uri, fileProvider) {
    this.contents = "";
    this.contentType = "";
    this.charset = "";
    this.uri = uri;
    this._fileProvider = fileProvider;
}

/**
 * Starts the download.
 * @function start
 */
scPageSaver.scDownload.prototype.start = function() {
    // Create unichar stream loader and load channel (for getting from cache)
    var fileURI = this.uri.toString().replace(/#.*$/, "");
    try {
        this._loader = Components.classes["@mozilla.org/network/unichar-stream-loader;1"].createInstance(Components.interfaces.nsIUnicharStreamLoader);
        this._channel = scPageSaver.nsIIOService.newChannel(fileURI, "", null);
    } catch(e) {
        this._done(true);
        return;
    }

    this._channel.loadFlags |= scPageSaver.nsIRequest.LOAD_FROM_CACHE;
    this._channel.loadFlags |= scPageSaver.nsIRequest.VALIDATE_NEVER;

    // Set post data if it can be gotten
    try {
        var sessionHistory = getWebNavigation().sessionHistory;
        var entry = sessionHistory.getEntryAtIndex(sessionHistory.index, false);
        entry = entry.QueryInterface(Components.interfaces.nsISHEntry);
        if(entry.postData) {
            var inputStream = Components.classes["@mozilla.org/io/string-input-stream;1"].createInstance(Components.interfaces.nsIStringInputStream);
            inputStream.setData(entry.postData, entry.postData.length);
            var uploadChannel = this._channel.QueryInterface(Components.interfaces.nsIUploadChannel);
            uploadChannel.setUploadStream(inputStream, "application/x-www-form-urlencoded", -1);
            this._channel.QueryInterface(Components.interfaces.nsIHttpChannel).requestMethod = "POST";
        }
    } catch (e) {}

    try {
        this._loader.init(new scPageSaver.scDownload.UnicharObserver(this), null);
        this._channel.asyncOpen(this._loader, null);
    } catch(e) {
        this._done(true);
    }
};

/**
 * Cancels the download if it's active.
 * @function stop
 */
scPageSaver.scDownload.prototype.stop = function() {
    if(this._channel) {
        this._channel.cancel(Components.results.NS_BINDING_ABORTED);
    }
    this._channel = null;
    this._loader = null;
    this._fileProvider = null;
    this.failed = true;
    this.contents = null;
    this.contentType = null;
    this.charset = null;
}

/**
 * Called when the downloading is done. Cleans up, and calls callback.
 * @function _done
 * @param {optional Boolean} failed - Whether done is being called after a failure or not. Defaults to false.
 */
scPageSaver.scDownload.prototype._done = function(failed) {
    if(typeof failed == 'undefined') failed = false;
    this._channel = null;
    this._loader = null;
    this.failed = failed;
    this._fileProvider.downloadDone(this);
    this._fileProvider = null;
};


/**
 * Download Observer which converts contents to unicode.
 * @class scPageSaver.scDownload.UnicharObserver
 *///{
scPageSaver.scDownload.UnicharObserver = function (download) {
    this._download = download;
    this._charset = null;
}
scPageSaver.scDownload.UnicharObserver.prototype.onDetermineCharset = function (loader, context, firstSegment, length) {
    if(this._download.charset) {
        this._charset = this._download.charset;
    } else {
        var channel = null;
        if (loader) channel = loader.channel;
        if (channel) this._charset = channel.contentCharset;
        if (!this._charset || this._charset.length == 0) this._charset = scPageSaver.DEFAULT_CHARSET;
    }
    return this._charset;
}
scPageSaver.scDownload.UnicharObserver.prototype.onStreamComplete = function (loader, context, status, unicharData) {
    switch (status) {
        case Components.results.NS_OK:
            var str = "";
            try {
                if (unicharData && unicharData.readString) {
                    var str_ = {};
                    while (unicharData.readString(-1, str_)) str += str_.value;
                } else if (unicharData) {
                    // Firefox 6 and above
                    str = unicharData;
                }
            } catch (e) {
                this._download._done(true);
                return;
            }

            this._download.contents = str;
            this._download.charset = this._charset;
            if(loader.channel)
                this._download.contentType = loader.channel.contentType;

            this._download._done();
            break;
        default:
            // Download failed
            this._download._done(true);
            break;
    }
};
//}
//}


/**
 * nsIWebBrowserPersist listener
 * @class scPageSaver.scPersistListener
 *///{
scPageSaver.scPersistListener = function(fileSaver) {
    this._fileSaver = fileSaver;
}
scPageSaver.scPersistListener.prototype.QueryInterface = function(iid) {
    if (iid.equals(Components.interfaces.nsIWebProgressListener)) {
        return this;
    }
    throw Components.results.NS_ERROR_NO_INTERFACE;
};
scPageSaver.scPersistListener.prototype.onStateChange = function(webProgress, request, stateFlags, status) {
    if(stateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP && stateFlags & Components.interfaces.nsIWebProgressListener.STATE_IS_NETWORK) {
        this._fileSaver.saveURIDone();
        this._fileSaver = null;
    }
};
scPageSaver.scPersistListener.prototype.onProgressChange = function() {}
scPageSaver.scPersistListener.prototype.onLocationChange = function() {}
scPageSaver.scPersistListener.prototype.onStatusChange = function() {}
scPageSaver.scPersistListener.prototype.onSecurityChange = function() {}
//}
