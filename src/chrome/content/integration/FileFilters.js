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
 * Portions created by the Initial Developer are Copyright (C) 2008
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
 * The FileFilters global object provides access to the information to be
 * displayed in the "Open" and "Save As" dialogs.
 */
var FileFilters = {
  /*
   * Public methods and properties
   */

  /**
   * Returns an array of objects representing the file filters to use in
   * the various "Open" dialogs. Each object has the following properties:
   *  - title: File format display name
   *  - extensionString: List of file patterns associated with the file format
   */
  get openFilters() {
    return [
     { title:           this._str("opendialog.filters.webarchives"),
       extensionString: "*.maff;*.mhtml;*.mht" },
    ];
  },

  /**
   * Returns an array of objects representing the file filters to use in
   * the various "Save As" dialogs. Each object has the following properties:
   *  - title: File format display name
   *  - extensionString: List of file patterns associated with the file format
   *  - mafArchiveType: Either "TypeMAFF" or "scriptPath"
   *
   * Note: To allow changing the "Save As" dialog behavior dynamically using
   * preferences, this function is called every time the dialog is displayed,
   * assuming however that the positions of the objects in the returned array
   * will not vary.
   *
   * Note: Other code depends on MAFF being the first element and MHTML being
   * the second element in the returned array.
   */
  get saveFilters() {
    // Determine the default extension to use for MHTML archives.
    var mhtmlExtensionString = Prefs.saveUseMhtmlExtension ?
     "*.mhtml;*.mht" : "*.mht;*.mhtml";
    // Return the array representing MAFF and MHTML filters.
    return [
     { title:           this._str("savedialog.filters.maffonly"),
       extensionString: "*.maff",
       mafArchiveType:  "TypeMAFF" },
     { title:           this._str("savedialog.filters.mhtmlonly"),
       extensionString: mhtmlExtensionString,
       mafArchiveType:  "TypeMHTML" },
    ];
  },

  /*
   * Private methods and properties
   */

  /**
   * Returns the string whose key is specified from the object's string bundle.
   */
  _str: function(aKey) {
    return this._fileFiltersStrBundle.GetStringFromName(aKey);
  },

  _fileFiltersStrBundle: Cc["@mozilla.org/intl/stringbundle;1"]
    .getService(Ci.nsIStringBundleService).createBundle(
    "chrome://mza/locale/fileFiltersObject.properties"),
}
