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
 * This overlay allows changing the default strategy used by the browser to
 * determine the file name used when saving a web page.
 */

// Apply this modification only if the original function exists.
if (window.getDefaultFileName) {
  // Save a reference to the original function.
  MozillaArchiveFormat._getDefaultFileName = window.getDefaultFileName;

  // Override the original function.
  function getDefaultFileName() {
    // If the alternative naming strategy cannot be used, call the original
    // function to determine the file name normally.
    return MozillaArchiveFormat.getDefaultFileName.apply(this, arguments) ||
           MozillaArchiveFormat._getDefaultFileName.apply(this, arguments);
  }
}

/**
 * This function returns the default file name to use for the given parameters,
 * or a value that evaluates to false if the default behavior should be used.
 */
MozillaArchiveFormat.getDefaultFileName = function(aDefaultFileName, aURI,
 aDocument, aContentDisposition) {
  // If the related preference is not set, always use the default behavior.
  if (MozillaArchiveFormat.Prefs.saveNamingStrategy !=
   MozillaArchiveFormat.Prefs.NAMINGSTRATEGY_PAGETITLE) {
    return false;
  }

  // If an explicit Content-Disposition header is present, even if it does not
  // specify a file name, use the default behavior.
  if (aContentDisposition) {
    return false;
  }

  // Use the alternative naming strategy only when saving web pages.
  if (!aDocument || (aDocument.contentType != "text/html" &&
   aDocument.contentType != "application/xhtml+xml")) {
    return false;
  }

  // Use the title of the document, if it contains at least one valid character.
  return validateFileName(aDocument.title).replace(/^\s+|\s+$/g, "");
}
