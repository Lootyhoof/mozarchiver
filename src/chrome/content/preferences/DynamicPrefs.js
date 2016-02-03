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
 * Defines the DynamicPrefs global object, that can be used to set and retrieve
 * the runtime values stored in the ".current" preferences tree. These values
 * are not accessible from the extension's preferences dialog, and are modified
 * only by interaction with other portions of the user interface.
 *
 * Normal extension preferences are read using "prefsObject.js" instead.
 */
var DynamicPrefs = {
  /*
   * Public properties to read and write dynamic preferences
   */

  /**
   * Index of the selected filter in the modified "Open File" dialog box, or
   * zero if the index was never set before.
   */
  get openFilterIndex() {
    try {
      return this._prefBranchForMafCurrent.getIntPref("open.filterindex");
    } catch (e) {
      return 0;
    }
  },
  set openFilterIndex(value) {
    this._prefBranchForMafCurrent.setIntPref("open.filterindex", value);
  },

  /**
   * Index of the selected filter in the "Save Page In Archive" dialog box, or
   * zero if the index was never set before.
   */
  get saveFilterIndex() {
    try {
      return this._prefBranchForMafCurrent.getIntPref("save.filterindex");
    } catch (e) {
      return 0;
    }
  },
  set saveFilterIndex(value) {
    this._prefBranchForMafCurrent.setIntPref("save.filterindex", value);
  },

  /**
   * Index of the selected filter in the "Save Page" dialog box when saving HTML
   * or XHTML documents either as complete pages or archives. This is zero if
   * the index was never set before, and is only used when it is greater or
   * equal than 2, meaning that the user chose to not save HTML or XHTML
   * documents in archives by default.
   */
  get saveFilterIndexHtml() {
    try {
      return this._prefBranchForMafCurrent.getIntPref("save.filterindexhtml");
    } catch (e) {
      return 0;
    }
  },
  set saveFilterIndexHtml(value) {
    this._prefBranchForMafCurrent.setIntPref("save.filterindexhtml", value);
  },

  /*
   * Private methods and properties
   */

  _prefBranchForMafCurrent: Cc["@mozilla.org/preferences-service;1"]
    .getService(Ci.nsIPrefService).getBranch("extensions.mza.current."),
}
