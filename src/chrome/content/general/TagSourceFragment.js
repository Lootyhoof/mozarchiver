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
 * Provides parsing of the attributes of an HTML tag into significant fragments.
 *
 * This class derives from SourceFragment. See the SourceFragment documentation
 * for details.
 */
function TagSourceFragment(aSourceData, aOptions) {
  SourceFragment.call(this, aSourceData, aOptions);

  // Parse the provided data immediately.
  this.parse();
}

TagSourceFragment.prototype = {
  __proto__: SourceFragment.prototype,

  // SourceFragment
  _executeParse: function(aAddFn) {
    this._sourceData.replace(
      /*
       * The regular expression below is composed of the following parts:
       *
       * aBefore   ( [\w\W]*? )
       *
       * Captures all the characters, including newlines, that are present
       * before the text recognized by the following expressions.
       *
       * Parsing expressions group   ( (?:<...>|<...>|$) )
       *
       * This non-captured group follows aBefore and contains the actual parsing
       * expressions. The end of the string is matched explicitly in order for
       * the aBefore group to capture the characters after the last part of the
       * string that is recognized by the parsing expressions.
       *
       * aAttrName   ( \b\w+ )
       *
       * Captures the name of the attribute.
       *
       * aSeparator   ( \s*=\s* )
       *
       * Captures the attribute separator ("=") and the surrounding whitespace.
       *
       * aAttrQuote   ( ['"] )
       *
       * Makes the first expression match if a quote is present after the
       * attribute separator. This group is used later in a backreference to
       * match the ending quote of the value.
       *
       * aAttrValue   ( [\w\W]*? )
       *
       * Eats all characters, including newlines, up to the ending quote.
       *
       * End of attribute lookahead   ( (?=\4) )
       *
       * This positive lookahead expression recognizes the end of the value. The
       * text in this section will be included in the aBefore part during the
       * next iteration.
       *
       * aAttrValueWithoutQuotes   ( .*? )
       *
       * If aQuoteBefore doesn't match, this expression eats all characters up
       * to the next whitespace.
       *
       * End of attribute lookahead   ( (?=\s) )
       *
       * This positive lookahead expression recognizes the end of the value. The
       * text in this section will be included in the aBefore part during the
       * next iteration. There is no need to match the end of the string since
       * the parsed string always includes the ">" character at the end.
       */
      /([\w\W]*?)(?:(\b\w+)(\s*=\s*)(?:(['"])([\w\W]*?)(?=\4)|(.*?)(?=\s))|$)/g,
      function(aAll, aBefore, aAttrName, aSeparator, aAttrQuote, aAttrValue,
       aAttrValueWithoutQuotes) {
        // The "style" attribute should be parsed as CSS, while making sure that
        // URLs found in the attribute are decoded from HTML.
        if (aAttrName == "style") {
          // Add the appropriate fragment as an URL.
          aAddFn(SourceFragment, aBefore + aAttrName + aSeparator +
           (aAttrQuote || ""));
          aAddFn(CssSourceFragment, aAttrValue || aAttrValueWithoutQuotes || "",
           {isEncodedAsHtml: true});
          return;
        }
        // If an attribute is found, determine if it has an URL type. For the
        // list of the HTML 4 attributes and their types, see
        // <http://www.w3.org/TR/REC-html40/index/attributes.html> (retrieved
        // 2009-07-14).
        var isUrlAttribute = aAttrName && ["action", "background", "cite",
         "classid", "codebase", "data", "href", "longdesc", "poster", "profile",
         "src", "usemap"].indexOf(aAttrName.toLowerCase()) >= 0;
        if (!isUrlAttribute) {
          // Treat the entire result as normal text.
          aAddFn(SourceFragment, aAll);
        } else {
          // Add the appropriate fragment as an URL.
          aAddFn(SourceFragment, aBefore + (aAttrName || "") +
           (aSeparator || "") + (aAttrQuote || ""));
          aAddFn(UrlSourceFragment, aAttrValue || aAttrValueWithoutQuotes || "",
           {isEncodedAsHtml: true});
        }
      }
    );
  },
}
