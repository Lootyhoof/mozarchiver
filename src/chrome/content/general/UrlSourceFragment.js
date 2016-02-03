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
 * Represents an URL that is written inside a fragment of a source file.
 *
 * This class derives from SourceFragment. See the SourceFragment documentation
 * for details.
 */
function UrlSourceFragment(aSourceData, aOptions) {
  SourceFragment.call(this, aSourceData, aOptions);
}

UrlSourceFragment.prototype = {
  __proto__: SourceFragment.prototype,

  /**
   * String containing the URL associated with this fragment. If necessary, the
   * URL is converted to and from its HTML escaped version automatically.
   */
  get urlSpec() {
    if (this._options.isEncodedAsHtml) {
      // Decode the basic HTML entities in the raw text.
      return this._sourceData.
       replace(/&quot;/gi, '"').
       replace(/&apos;/gi, "'").
       replace(/&lt;/gi, "<").
       replace(/&gt;/gi, ">").
       replace(/&amp;/gi, "&");
    } else {
      // No decoding is necessary.
      return this._sourceData;
    }
  },
  set urlSpec(aValue) {
    if (this._options.isEncodedAsHtml) {
      // Encode the basic HTML entities in the raw text.
      this._sourceData = aValue.
       replace(/&/g, "&amp;").
       replace(/"/g, "&quot;").
       replace(/'/g, "&apos;").
       replace(/</g, "&lt;").
       replace(/>/g, "&gt;");
    } else {
      // No encoding is necessary.
      this._sourceData = aValue;
    }
  },
}
