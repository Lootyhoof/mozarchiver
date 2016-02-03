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
 * Provides parsing of a space-spearated or comma-separated list of URIs into
 * significant fragments.
 *
 * This class derives from SourceFragment. See the SourceFragment documentation
 * for details.
 */
function UrlListSourceFragment(aSourceData, aOptions) {
  SourceFragment.call(this, aSourceData, aOptions);

  // Parse the provided data immediately.
  this.parse();
}

UrlListSourceFragment.prototype = {
  __proto__: SourceFragment.prototype,

  // SourceFragment
  _executeParse: function(aAddFn) {
    // Determine which regular expression to use based on the separator type.
    var separatorRe = this._options.commaSeparated ?
     /(.*?)(\s*,\s*|$)/g :
     /(.*?)(\s+|$)/g;
    // Apply the regular expression to retrieve the separated URLs.
    this._sourceData.replace(
      separatorRe,
      function(aAll, aUrl, aSeparator) {
        // Add the appropriate fragment as an URL.
        aAddFn(UrlSourceFragment, aUrl);
        aAddFn(SourceFragment, aSeparator);
      }
    );
  },
}
