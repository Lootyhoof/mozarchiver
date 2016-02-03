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
 * Provides utility functions for the MAF user interface.
 */
var Interface = {

  /**
   * Returns a string representing the localized value to display for the given
   * string or Date object.
   *
   * @param aValue
   *        The value to format. If this is an object, it may contain additional
   *        properties that control how to display it. If null, an empty string
   *        is returned.
   * @param aForColumn
   *        If false or unspecified, indicates that the value should be
   *        formatted for a normal label. If true, the value may be formatted
   *        more compactly for a tree view.
   */
  formatValueForDisplay: function(aValue, aForColumn) {
    // Return an empty string in place of null values.
    if (!aValue) {
      return "";
    }
    // Check if the value is a date and handle it appropriately. The
    // "instanceof" operator cannot be used for this check since sometimes the
    // type information is not propagated along with the Date object.
    if (aValue.getYear) {
      // Display either a short or long localized date.
      var date = aForColumn ? Ci.nsIScriptableDateFormat.dateFormatShort :
       Ci.nsIScriptableDateFormat.dateFormatLong;
      var time = aForColumn ? Ci.nsIScriptableDateFormat.timeFormatNoSeconds :
       Ci.nsIScriptableDateFormat.timeFormatSeconds;
      // Use the date formatting service to display the localized date. We
      // cannot use the native JavaScript date formatting functions, like
      // "toLocaleString", because this code may be called at startup when the
      // service that converts the operating-system-provided date string to
      // Unicode is not available in the JavaScript context.
      return Cc["@mozilla.org/intl/scriptabledateformat;1"].
       getService(Ci.nsIScriptableDateFormat).FormatDateTime("", date, time,
        aValue.getFullYear(), aValue.getMonth() + 1, aValue.getDate(),
        aValue.getHours(), aValue.getMinutes(), aValue.getSeconds());
    }
    // Check if the value has been tagged as an URI and handle it appropriately.
    if (aValue.isEscapedAsUri) {
      try {
        // Unescape the URI for displaying it in the user interface, assuming
        // its character set after unescaping is UTF-8.
        return this._textToSubURI.unEscapeURIForUI("UTF-8", aValue);
      } catch (e) {
        // In case of errors, display the unescaped URI.
        return aValue;
      }
    }
    // Return the unprocessed value.
    return aValue;
  },

  /**
   * Returns the short name of the host application.
   */
  get brandShortName() {
    return Cc["@mozilla.org/intl/stringbundle;1"].
     getService(Ci.nsIStringBundleService).
     createBundle("chrome://branding/locale/brand.properties").
     GetStringFromName("brandShortName");
  },

  /**
   * Replaces the appropriate placeholder in the given text with the short name
   * of the host application.
   */
  replaceBrandShortName: function(aText) {
    return aText.replace("$brandShortName", this.brandShortName, "g");
  },

  /**
   * Replaces the appropriate placeholder in the main text of the given XUL
   * element with the short name of the host application.
   */
  applyBranding: function(aElement) {
    if (aElement.hasAttribute("label")) {
      // This is a control with a label attribute.
      aElement.setAttribute("label", this.replaceBrandShortName(aElement.
       getAttribute("label")));
    } else {
      // Assume this is a XUL description control containing a single text node.
      var textNode = aElement.firstChild;
      textNode.data = this.replaceBrandShortName(textNode.data);
    }
  },

  _textToSubURI: Cc["@mozilla.org/intl/texttosuburi;1"].
   getService(Ci.nsITextToSubURI),
}
