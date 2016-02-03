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
 * The MimeSupport global object provides helper functions for handling various
 * MIME-related tasks.
 */
var MimeSupport = {
  /**
   * Returns the given string of bytes encoded to "Quoted-Printable". For more
   * information on the "Quoted-Printable" encoding specification, see
   * <http://tools.ietf.org/html/rfc1521#section-5.1> (retrieved 2008-05-14).
   *
   * @param aOctets
   *        String containing the octets to be encoded. Every single character
   *        in this string must have a character code between 0 and 255.
   */
  encodeQuotedPrintable: function(aOctets) {
    // Encode the mandatory characters. Octets with decimal values of 33 through
    // 60, inclusive, and 62 through 126, inclusive, are not encoded. Spaces,
    // tabs, and line breaks will be encoded or normalized later, if necessary.
    var aEncodedLines = aOctets.replace(
      /[^\t\r\n \x21-\x3C\x3E-\x7E]/g,
      function (aMatch) {
        // Convert the octet to hexadecimal representation.
        var hexString = "0" + aMatch.charCodeAt(0).toString(16).toUpperCase();
        // Consider only the last two digits of the number.
        return "=" + hexString.slice(-2);
      }
    );

    // Limit the final line length to 76 characters, adding soft line breaks if
    // necessary. Also convert every type of line break to CRLF. Since the
    // regular expression used for the task cannot handle strings that don't end
    // with a line break, add one now and remove it at the end.
    return (aEncodedLines + "\r\n").replace(
      /*
       * The regular expression below is composed of the following parts:
       *
       * aMain   ( [^\r\n]{0,73} )
       *
       * The first 73 characters of each line, up to and excluding the end of
       * line character, if present.
       *
       * aLastThree   ( =.. or [ \t] or [^\r\n=]{2}[^\t\r\n =] )
       *
       * This group will match only if followed by a line ending. Can be an
       * encoded octet representation, a space or tab (that will be encoded to
       * three characters) or a sequence of three characters that does not
       * contain the beginning of an encoded sequence ("=") and does not end
       * with a space or tab.
       *
       * aLastThreeEOL   ( $ or \r?\n or \r )
       *
       * Line ending after aLastThree. This group is empty only if the end of
       * the string is reached.
       *
       * aLastTwo   ( [^\t\r\n =]{0,2} )
       *
       * Up to two characters that normally precede a soft line break. None of
       * these characters will need further encoding.
       *
       * aLastTwoEOL   ( \r?\n? )
       *
       * Optional line ending. If this group matches, then no soft line break is
       * needed.
       */
      /([^\r\n]{0,73})(?:(=..|[ \t]|[^\r\n=]{2}[^\t\r\n =])($|\r?\n|\r)|([^\t\r\n =]{0,2})(\r?\n?))/g,
      function (aAll, aMain, aLastThree, aLastThreeEOL, aLastTwo, aLastTwoEOL,
       aOffset) {
        // Compose the main text of the line.
        var line = aMain + (aLastThree || "") + (aLastTwo || "");
        // If a line break was found in the original string
        if (aLastThreeEOL || aLastTwoEOL) {
          // If the last character in the line is a tab or a space and no soft
          // line break will be added, encode the character.
          if (line) {
            var lastChar = line[line.length - 1];
            if (lastChar === " " || lastChar === "\t") {
              line = line.slice(0, -1) + (lastChar === " " ? "=20" : "=09");
            }
          }
          // Return the line followed by a hard line break.
          return line + "\r\n";
        }
        // Return the line followed by a soft line break. Since the regular
        // expression also matches the empty string, this function is called
        // one last time with empty parameters. In that case, do not add the
        // soft line break.
        return line ? (line + "=\r\n") : "";
      }
    ).slice(0, -2);
  },

  /**
   * Returns a string containing the sequence of octets decoded from the given
   * "Quoted-Printable"-encoded ASCII string.
   *
   * If the input string contains invalid characters or sequences, they are
   * propagated to the output without errors. End-of-line character sequences in
   * the input string are not altered when they are copied to the output.
   *
   * @param aAsciiString
   *        "Quoted-Printable"-encoded string to be decoded. The string may
   *        contain mixed CR, LF or CRLF end-of-line sequences.
   */
  decodeQuotedPrintable: function(aAsciiString) {
    // Replace every soft line break and encoded character in the string. Soft
    // line breaks are represented by an equal sign ("=") followed by any valid
    // end-of-line sequence, while encoded characters are represented by an
    // equal sign immediately followed by two hexadecimal digits, either
    // uppercase or lowercase.
    return aAsciiString.replace(
      /=(?:\r?\n|\r|([A-Fa-f0-9]{2}))/g,
      function(aAll, aEncodedOctet) {
        return (aEncodedOctet ?
         String.fromCharCode(parseInt(aEncodedOctet, 16)) : "");
      }
    );
  },

  /**
   * Returns the given string of bytes encoded to "base64". For more
   * information on the "base64" encoding specification, see
   * <http://tools.ietf.org/html/rfc1521#section-5.2> (retrieved 2008-05-14).
   *
   * @param aOctets
   *        String containing the octets to be encoded. Every single character
   *        in this string must have a character code between 0 and 255.
   */
  encodeBase64: function(aOctets) {
    // Encode to base64, and return the resulting string split across lines that
    // are no longer than 76 characters.
    return btoa(aOctets).replace(/.{76}/g, "$&\r\n");
  },

  /**
   * Returns a string containing the sequence of octets decoded from the given
   * "base64"-encoded ASCII string.
   *
   * Invalid characters and line breaks in the input string are filtered out.
   *
   * @param aAsciiString
   *        "base64"-encoded string to be decoded.
   */
  decodeBase64: function(aAsciiString) {
    // Pass only the valid characters to the decoding function.
    return atob(aAsciiString.replace(/[^A-Za-z0-9+\/=]+/g, ""));
  },

  /**
   * Returns the given string of bytes encoded to "Q" encoding. For more
   * information, see <http://tools.ietf.org/html/rfc2047#section-4.2>
   * (retrieved 2009-11-12).
   *
   * @param aOctets
   *        String containing the octets to be encoded. Every single character
   *        in this string must have a character code between 0 and 255.
   */
  encodeQ: function(aOctets) {
    // Encode the mandatory characters, that is any non-printable character, in
    // addition to the space character, the underscore and the question mark.
    return aOctets.replace(
      /[^\x21-\x3C\x3E\x40-\x5E\x60-\x7E]/g,
      function (aMatch) {
        // Encode the space character as an underscore.
        if (aMatch === " ") {
          return "_";
        }
        // Convert the octet to hexadecimal representation.
        var hexString = "0" + aMatch.charCodeAt(0).toString(16).toUpperCase();
        // Consider only the last two digits of the number.
        return "=" + hexString.slice(-2);
      }
    );
  },

  /**
   * Returns a string containing the sequence of octets decoded from the given
   * percent-encoded ASCII string. This function always decodes the entire range
   * of byte values, and never applies character set conversions.
   *
   * If the input string contains invalid characters or sequences, they are
   * propagated to the output without errors.
   */
  decodePercent: function(aAsciiString) {
    return aAsciiString.replace(
      /%([A-Fa-f0-9]{2})/g,
      function(aAll, aEncodedOctet) {
        return String.fromCharCode(parseInt(aEncodedOctet, 16));
      }
    );
  },

  /**
   * Returns an object having one property for each header field in the given
   * header section. For more information on header field syntax, see
   * <http://tools.ietf.org/html/rfc5322#section-2.2> (retrieved 2008-05-17).
   *
   * The property names in the returned object are the names of the header
   * fields, converted to lowercase. If more than one header field with the same
   * name is present in the section, the behavior is undefined.
   *
   * The property values correspond to the raw characters in the unfolded
   * headers. For more information on header folding and unfolding, see
   * <http://tools.ietf.org/html/rfc5322#section-2.2.3> (retrieved 2008-05-17).
   */
  collectHeadersFromSection: function(aHeaderSection) {
    // Remove any line break that is followed by a whitespace character.
    var unfoldedHeders = aHeaderSection.replace(/(\r?\n|\r)(?=[\t ])/g, "");
    // Examine each valid header line, that consists of a header name, followed
    // by a colon, followed by the header value. Header names cannot contain
    // whitespace. If whitespace is present around the colon or at the end of
    // the value, it is ignored. Leading whitespace on the first line of the
    // header section is also ignored. Lines that don't conform to this syntax
    // are ignored.
    var headers = {};
    unfoldedHeders.replace(
      /^[\t ]*([^\t\r\n :]+)[\t ]*:[\t ]*(.*)/gm,
      function(aAll, aHeaderName, aHeaderValue) {
        // Set the property of the object, and remove the trailing whitespace
        // that may be still present in the header value.
        headers[aHeaderName.toLowerCase()] = aHeaderValue.replace(/\s+$/, "");
      }
    );
    return headers;
  },

  /**
   * Returns an "encoded word" corresponding to the specified string, encoded
   * using the given character set, or an empty string if the given constraints
   * cannot be satisfied. For more information on encoded words, see
   * <http://tools.ietf.org/html/rfc2047#section-2> (retrieved 2009-11-12).
   *
   * This function always returns encoded words using the "Q" encoding.
   *
   * @param aUnicodeString
   *        String to be encoded. Any character is allowed, even though
   *        characters that cannot be represented using the specified character
   *        set may be replaced.
   * @param aCharset
   *        Character set to use for encoding the given string.
   * @param aMaxLength
   *        Maximum length of the returned encoded word, including all
   *        delimiters. This value must be at most 75 characters to achieve
   *        proper results.
   * @param aRemainder
   *        If the entire string in aUnicodeString does not fit in the allowed
   *        maximum length, the remaining portion is copied to the "value"
   *        property of this object.
   */
  encodeWord: function(aUnicodeString, aCharset, aMaxLength, aRemainder) {
    // Initialize a converter for the specified charset.
    var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
     createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = aCharset;
    // Set the value that will be returned if even a single character cannot be
    // encoded while satisfying the given constraint on the maximum length.
    var lastEncodedWord = "";
    // Add one character at a time until the specified limit is reached.
    for (var tryLength = 1; tryLength <= aUnicodeString.length; tryLength++) {
      // Attempt to encode the initial portion of the string.
      var tryString = aUnicodeString.slice(0, tryLength);
      // Convert the characters to octets using the specified charset. Values
      // that cannot be represented are replaced with a question mark ("?").
      var octets = converter.ConvertFromUnicode(tryString) + converter.Finish();
      // Build the entire encoded word using the "Q" encoding.
      var encodedWord = "=?" + aCharset + "?Q?" + MimeSupport.encodeQ(octets) +
       "?=";
      // If the limit of characters to be returned is exceeded
      if (encodedWord.length > aMaxLength) {
        // Return the encoded word and the remainder from the previous attempt.
        break;
      }
      // Store the successfully encoded word for later.
      lastEncodedWord = encodedWord;
    }
    // Return the values from the last successful encoding attempt.
    aRemainder.value = aUnicodeString.slice(tryLength - 1);
    return lastEncodedWord;
  },

  /**
   * Returns an ASCII string that can be used for the encoded value of an
   * unstructured header field, with header folding already applied. For more
   * information, see <http://tools.ietf.org/html/rfc5322#section-2.2.1>
   * (retrieved 2009-11-12).
   *
   * This function does not encode words made entirely of printable ASCII
   * characters, and attempts to create "encoded words" with the specified
   * character set in other cases. For more information on encoded words, see
   * <http://tools.ietf.org/html/rfc2047#section-2> (retrieved 2009-11-12).
   * For more information on how the character set should be selected, see
   * <http://tools.ietf.org/html/rfc2047#section-3> (retrieved 2009-11-12).
   *
   * This function does not ensure that character sets that use code-switching
   * techniques are handled correctly according to section 3 of RFC 2047.
   *
   * The text lines generated by this function are limited to 76 characters,
   * excluding the CRLF line ending, even if no encoded words are created. The
   * first line may be shorter, based on the aFoldingCount parameter.
   *
   * @param aUnicodeString
   *        String to be encoded. Any character is allowed, even though
   *        characters that cannot be represented using the specified character
   *        set may be replaced.
   * @param aCharset
   *        Character set to use for encoded words.
   * @param aFoldingCount
   *        Number of characters to subtract from the maximum line length for
   *        the first line of returned text. This value must be at least 1
   *        character to achieve proper results.
   */
  buildUnstructuredValue: function(aUnicodeString, aCharset, aFoldingCount) {
    // Define the absolute maximum limit on the length of the line.
    const maxLineLimit = 76;
    // Initialize the length limit for the first line.
    var lineLimit = maxLineLimit - aFoldingCount;

    // Initialize the line-based output buffers.
    var resultLines = ""; // ASCII output buffer with completed lines
    var lineStart = "";   // ASCII initial line part, may be empty at first
    var wordMiddle = "";  // Unicode source string for the middle of the line
    var lineMiddle = "";  // ASCII encoded word in the middle of the line
    var lineEnd = "";     // ASCII part at the end of the line

    // Define a function to apply header folding to the output buffer.
    var fold = function() {
      // Concatenate the current line to the output buffer.
      resultLines += lineStart + lineMiddle + lineEnd + "\r\n";
      // Reset the character count limit for the next line.
      lineLimit = maxLineLimit;
      // Reset the buffer for the current line.
      lineStart = "";
      wordMiddle = "";
      lineMiddle = "";
      lineEnd = "";
    };

    // Process individual words separated by whitespace.
    aUnicodeString.replace(
      /*
       * The regular expression below is composed of the following parts:
       *
       * aWhitespace   ( [\t ]* )
       *
       * Optional whitespace before the word to be encoded.
       *
       * aWord   ( [^\t ]*([\t ]+$)? )
       *
       * The word that will be examined to determine if it should be encoded.
       * This word includes trailing whitespace at the end of the string.
       *
       * aTrailingWhitespace   ( [\t ]+$ )
       *
       * Trailing whitespace at the end of the string, if present. Whitespace
       * between words is included in aWhitespace instead.
       */
      /([\t ]*)([^\t ]*([\t ]+$)?)/g,
      function(aAll, aWhitespace, aWord, aTrailingWhitespace) {
        // Prepare the variables required to handle all the variants of the
        // encoding strategy for the current word.
        var whitespace = aWhitespace;
        var wordToEncode = aWord;
        var encodedWord;
        var remainder = {};
        var mustFold = false;
        var outputReady = false;

        // The aWord parameter may be empty only if the string is made entirely
        // of whitespace, or in the last iteration of the replace function.
        if (!aWord) {
          if (!aWhitespace) {
            // This is the last iteration of the function, no action is needed.
            return;
          }
          // Encode only the whitespace instead of a word.
          whitespace = "";
          wordToEncode = aWhitespace;
        } else {
          // Determine if the current word must be encoded, because it:
          //   - Contains non-ASCII characters or unprintable characters
          //   - Is the last word and contains trailing whitespace
          //   - Can't fit on a single line, including preceding whitespace
          //   - Can't fit on the first line, and isn't preceded by whitespace
          //   - Begins and ends with reserved character sequences
          var mustEncode = !/^[\x20-\x7E]+$/.test(aWord) ||
           aTrailingWhitespace ||
           aAll.length > maxLineLimit ||
           (!whitespace && aWord.length > lineLimit) ||
           (aWord.slice(0, 2) === "=?" && aWord.slice(-2) === "?=");

          // If the word doesn't need encoding
          if (!mustEncode) {
            // Fold the initial whitespace if there is not enough room.
            if ((lineStart + lineMiddle + lineEnd + aAll).length > lineLimit) {
              fold();
            }
            // If no encoded words are present on this line yet, add the plain
            // word to the initial portion of the line, otherwise add it to the
            // end. Words at the end may be absorbed by the encoded word later.
            if (!lineMiddle) {
              lineStart += aAll;
            } else {
              lineEnd += aAll;
            }
            // Continue with the next input word.
            return;
          }
        }

        // If another encoded word is already present on the same output line,
        // and both words encoded together fit on the line, it's generally more
        // efficient to encode both words together, including any unencoded word
        // in the middle, to avoid the overhead of a separate character set and
        // encoding declaration on the same or on the next line.
        if (lineMiddle) {
          // Compute the new encoded word. The length limit is at maximum 75
          // characters, since lineStart contains at least one character.
          encodedWord = MimeSupport.encodeWord(wordMiddle + lineEnd + aAll,
           aCharset, lineLimit - lineStart.length, remainder);
          // If the new encoded word does fit on the current line
          if (!remainder.value) {
            // Modify the current output.
            whitespace = "";
            wordToEncode = wordMiddle + lineEnd + aAll;
            // Output for the current line is ready.
            outputReady = true;
          }
        } else if (whitespace) {
          // If no other encoded word is present, check if the encoded word
          // alone fits entirely on the current line, without encoding the
          // preceding whitespace. The length limit is at maximum 75 characters,
          // since whitespace contains at least one character.
          encodedWord = MimeSupport.encodeWord(wordToEncode, aCharset,
           lineLimit - lineStart.length - whitespace.length, remainder);
          // If the new encoded word does fit on the current line
          if (!remainder.value) {
            // Output for the current line is ready.
            outputReady = true;
          }
        }

        // At this point, we can check if the encoded word alone fits entirely
        // on the next line, without encoding the preceding whitespace. This
        // operation can be done only if the preceding output word is not
        // encoded, and cannot be done on the first input word if not preceded
        // by whitespace.
        if (!outputReady && (!lineMiddle || lineEnd) && whitespace) {
          // Compute the new encoded word. The length limit is at most 75
          // characters, since whitespace contains at least one character.
          encodedWord = MimeSupport.encodeWord(wordToEncode, aCharset,
           maxLineLimit - whitespace.length, remainder);
          // If the new encoded word fits entirely on the next line, or if it
          // fits partially but an encoded word is not present on this line
          if (!remainder.value || (encodedWord && !lineMiddle)) {
            // Terminate the current line.
            fold();
            // Output for the next line is ready, including the remainder for
            // the following line, if present.
            outputReady = true;
          }
        }

        // Unless the attempt to place the word on the next line succeeded, now
        // we know that we must necessarily encode the word starting from the
        // current line, wrapping it exactly when it reaches the end of the
        // available line space.
        if (!outputReady) {
          // If another encoded word is present on the same line, we must
          // concatenate it to the current word before starting, and encode all
          // the whitespace in-between. Moreover, at this point, we must always
          // encode the preceding whitespace, if present, if this is the first
          // word of the entire encoding process.
          if (lineMiddle || !lineStart) {
            // Concatenate all the available data.
            whitespace = "";
            wordToEncode = wordMiddle + lineEnd + aAll;
          } else {
            // We may have to fold the initial whitespace, if present, but we
            // must encode all of it except the first character, since there may
            // be enough input whitespace to span multiple lines.
            wordToEncode = whitespace.slice(1) + wordToEncode;
            whitespace = whitespace.slice(0, 1);
          }
        }

        // If a word is ready to be encoded on the current line or on the next
        while (wordToEncode) {
          // At the first iteration, we may encode the initial part of the word
          // on the current line, if enough space is present. On subsequent
          // iterations, if other portions of the same word are still present,
          // the current line usually contains an encoded word until its end,
          // and the encoding of the remaining portion must necessarily be done
          // on the next line.
          if (mustFold) {
            // Send the line with the encoded word to the output buffer.
            fold();
            lineStart = whitespace;
            whitespace = "";
          }
          // If output hasn't been already prepared outside of the loop
          if (!outputReady) {
            // Compute the new encoded word. The length limit is at most 75
            // characters, since lineStart contains at least one character,
            // except on the first line where lineLimit is always less than and
            // never equal to maxLineLimit.
            encodedWord = MimeSupport.encodeWord(wordToEncode, aCharset,
             lineLimit - lineStart.length - whitespace.length, remainder);
            // If the word does not fit on the current line
            if (!encodedWord) {
              // If the current line has its maximum length, or we cannot fold
              // the encoded word on the next line since there is no whitespace.
              if (mustFold || !whitespace) {
                throw new Components.Exception(
                 "Unable to encode the input string in the available space.");
              }
              // Retry on the next line.
              mustFold = true;
              continue;
            }
          }
          // Add the encoded output to the current line.
          lineStart += whitespace;
          wordMiddle = wordToEncode;
          lineMiddle = encodedWord;
          lineEnd = "";
          // Prepare the word to be encoded on the next iteration, if present.
          wordToEncode = remainder.value;
          whitespace = " ";
          mustFold = true;
          outputReady = false;
        }
      }
    );
    // Return the generated lines.
    return resultLines + lineStart + lineMiddle + lineEnd;
  },

  /**
   * Returns a string of characters representing the decoded version of the
   * provided unstructured header field value. For more information, see
   * <http://tools.ietf.org/html/rfc5322#section-2.2.1> (retrieved 2009-08-01).
   *
   * This function attempts to decode "encoded words". For more information, see
   * <http://tools.ietf.org/html/rfc2047#section-2> (retrieved 2009-08-01). The
   * decoding algorithm is slightly different from the specification in that
   * the maximum length of an encoded word is not taken into account.
   *
   * This function recognizes and ignores the optional language specification in
   * encoded words. For more information on the subject, see
   * <http://tools.ietf.org/html/rfc2231#section-5> (retrieved 2009-08-01).
   *
   * @param aHeaderValue
   *        ASCII encoded value of an unstructured header field. The string must
   *        consist of a single line of text.
   */
  parseUnstructuredValue: function(aHeaderValue) {
    // Initialize the state variable used to find adjacent encoded words.
    var wordWasEncoded = false;
    // Process individual words separated by whitespace.
    return aHeaderValue.replace(
      /*
       * The regular expression below is composed of the following parts:
       *
       * aWhitespace   ( [\t ]* )
       *
       * Optional whitespace before the encoded or normal word. Whitespace
       * between two encoded words will be omitted from the output.
       *
       * aWord   ( [^\t ]+ )
       *
       * The word that will be examined to determine if it is encoded. This part
       * will be replaced with the decoded word.
       */
      /([\t ]*)([^\t ]+)/g,
      function(aAll, aWhitespace, aWord) {
        // Remember if the previous word was encoded .
        var previousWordWasEncoded = wordWasEncoded;
        // Decode the current word and remember if decoding has been performed.
        wordWasEncoded = false;
        var decodedWord = aWord.replace(
          /*
           * The regular expression below is composed of the following parts:
           *
           * aCharset   ( [^*?]+ )
           *
           * Character set specification defined inside the charset portion that
           * immediately follows the initial "=?" sequence.
           *
           * aLanguage   ( [^?]+ )
           *
           * Optional language tag, defined after the asterisk ("*") inside the
           * charset portion that follows the initial "=?" sequence.
           *
           * aEncoding   ( [^?]+ )
           *
           * Encoding portion that follows the first question mark ("?").
           *
           * aText   ( [^?]+ )
           *
           * Encoded text portion that follows the second question mark ("?")
           * and comes before the final "?=" sequence.
           */
          /^=\?([^*?]+)(?:\*([^?]+))?\?([^?]+)\?([^?]+)\?=$/,
          function(aAll, aCharset, aLanguage, aEncoding, aText) {
            // Decode the octets specified in the encoded text.
            var octets;
            switch (aEncoding.toUpperCase()) {
              case "B":
                // For the "B" encoding, we can use "base64" decoding.
                octets = MimeSupport.decodeBase64(aText);
                break;
              case "Q":
                // For the "Q" encoding, we can use "Quoted-Printable" decoding,
                // except that the underscore ("_") must be translated to space
                // before the operation.
                octets = MimeSupport.decodeQuotedPrintable(
                 aText.replace("_", "=20", "g"));
                break;
              default:
                // The encoding is unknown, stop now and don't alter the word.
                return aAll;
            }
            // Decode the characters represented by the octets.
            var decodedText;
            try {
              // Convert the octets to characters using the specified charset.
              var converter =
               Cc["@mozilla.org/intl/scriptableunicodeconverter"].
               createInstance(Ci.nsIScriptableUnicodeConverter);
              converter.charset = aCharset;
              decodedText = converter.ConvertToUnicode(octets);
            } catch (e) {
              // If decoding failed, stop now and don't alter the word.
              return aAll;
            }
            // Remember that the word was successfully decoded and replace it.
            wordWasEncoded = true;
            return decodedText;
          }
        );
        // If both this word and the previous one have been decoded, remove the
        // whitespace between the two.
        return (previousWordWasEncoded && wordWasEncoded ? "" : aWhitespace) +
         decodedWord;
      }
    );
  },

  /**
   * Returns the lowercase media type obtained by parsing the given value of the
   * "Content-Type" header, and populates the given object with one lowercase
   * property for each of the additional parameters in the header. For more
   * information on the syntax of the "Content-Type" header field, see
   * <http://tools.ietf.org/html/rfc2045#section-5> (retrieved 2009-11-22).
   *
   * This function recognizes continuations in parameter values, as well as
   * character set and language information, even though the latter is ignored.
   * For more information, see <http://tools.ietf.org/html/rfc2231#section-3>
   * (retrieved 2009-11-22).
   *
   * @param aHeaderValue
   *        Unfolded value of the "Content-Type" header, consisting of a single
   *        line of text.
   * @param aParameters
   *        Empty object that will be populated with the parsed parameter
   *        values.
   */
  parseContentTypeValue: function(aHeaderValue, aParameters) {
    // Get the content type and raw parameter values.
    var rawParameters = {};
    var contentType = MimeSupport.rawParseContentTypeValue(aHeaderValue,
     rawParameters);
    // Build the continuations map.
    var knownParameters = {};
    var knownCharsets = {};
    for (let [paramName, paramValue] in Iterator(rawParameters)) {
      // Separate the section number and extension flag from the parameter name.
      var sectionNumber = -1;
      var isExtended = false;
      paramName = paramName.replace(
        /*
         * The regular expression below is composed of the following parts:
         *
         * aName   ( [^*]+ )
         *
         * Actual name of the parameter.
         *
         * aSectionNumber   ( [\d]{1,9} )
         *
         * Digits that represent the section number in a parameter continuation.
         *
         * aExtendedFlag   ( \*? )
         *
         * If present, indicates that the parameter value uses the extended
         * syntax for character set and language information.
         */
        /^([^*]+)(?:\*([\d]{1,9}))?(\*?)$/,
        function(aAll, aName, aSectionNumber, aExtendedFlag) {
          if (aSectionNumber) {
            sectionNumber = parseInt(aSectionNumber);
          }
          isExtended = !!aExtendedFlag;
          return aName;
        }
      );
      // For the first section in a parameter with extended syntax
      if (isExtended && sectionNumber === 0) {
        // Separate the character set and language from the parameter value.
        paramValue = paramValue.replace(
          /*
           * The regular expression below is composed of the following parts:
           *
           * aCharset   ( [^']* )
           *
           * Optional character set specification that precedes the first single
           * quote ("'") character.
           *
           * aLanguage   ( [^']* )
           *
           * Language specification that follows the first "'" character.
           *
           * aValue   ( .* )
           *
           * Encoded text portion that follows the second "'" character.
           */
          /^([^']*)'([^']*)'(.*)$/,
          function(aAll, aCharset, aLanguage, aValue) {
            knownCharsets[paramName] = aCharset;
            return aValue;
          }
        );
      }
      // Ensure that the value array for the parameter name is present.
      let paramValues = knownParameters[paramName];
      if (!paramValues) {
        paramValues = [];
        knownParameters[paramName] = paramValues;
      }
      // Store either the individual parameter at index -1, or the sections at
      // index 0 or above, indicating whether the value should be decoded.
      paramValues[sectionNumber] = [isExtended, paramValue];
    }
    // Prepare an uninitialized converter object.
    var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
     createInstance(Ci.nsIScriptableUnicodeConverter);
    // Actually perform the parameter reordering and decoding.
    for (let [paramName, paramValues] in Iterator(knownParameters)) {
      // Reinitialize the conversion object using the specified character set.
      var currentCharset = knownCharsets[paramName];
      if (currentCharset) {
        converter.charset = currentCharset;
      }
      // Examine each possible continuation starting from the first section.
      var compositeValue = "";
      for (var [, [paramIsExtended, paramValue]] in Iterator(paramValues)) {
        // If the parameter has extended syntax, decode it now that the
        // character set to use is certainly known, regardless of the order of
        // the parameter continuations in the header.
        if (paramIsExtended) {
          // Obtain the octets from the original value.
          paramValue = MimeSupport.decodePercent(paramValue);
          // Use the given character set to obtain the characters if required.
          if (currentCharset) {
            try {
              paramValue = converter.ConvertToUnicode(paramValue);
            } catch (e) {
              // If decoding failed, don't alter the value.
            }
          }
        }
        // Concatenate the value of the parameter.
        compositeValue += paramValue;
      }
      // Return the composite value to the caller.
      aParameters[paramName] = compositeValue;
    }
    // Finally, return the content type.
    return contentType;
  },

  /**
   * Returns the lowercase media type obtained by parsing the given value of the
   * "Content-Type" header, and populates the given object with one lowercase
   * property for each of the additional parameters in the header. For more
   * information on the syntax of the "Content-Type" header field, see
   * <http://tools.ietf.org/html/rfc2045#section-5> (retrieved 2009-11-22).
   *
   * @param aHeaderValue
   *        Unfolded value of the "Content-Type" header, consisting of a single
   *        line of text.
   * @param aRawParameters
   *        Empty object that will be populated with the parsed raw parameter
   *        values. Continuations and language information are not parsed.
   */
  rawParseContentTypeValue: function(aHeaderValue, aRawParameters) {
    // Since the header value may contain nested comments, we use a parsing
    // strategy based on recursive parsing functions.
    var currentText = aHeaderValue;
    function eatComment() {
      // If the current value starts with an open parenthesis
      if (currentText && currentText[0] === "(") {
        // Remove the opening parenthesis.
        currentText = currentText.slice(1);
        do {
          // Eat all the characters until the next open or closed parenthesis,
          // excluding parentheses appearing in quoted pairs.
          currentText = currentText.replace(/^(\\.|[^()])*/, "");
          // Recursively eat inner comments.
          eatComment();
          // Repeat until there is no more text in the comment.
        } while (currentText && currentText[0] !== ")");
        // Remove the closing parenthesis, if found.
        currentText = currentText.slice(1);
      }
    }
    function eatCommentsAndWhitespace() {
      do {
        var currentLength = currentText.length;
        // Eat initial whitespace, if present.
        currentText = currentText.replace(/^[\t ]*/, "");
        // Eat one comment, if present.
        eatComment();
        // Repeat until there are no more comments and whitespace to remove.
      } while (currentText.length < currentLength);
    }
    function getToken() {
      // If no token is present, an empty string is returned.
      var innerText = "";
      // Look for a string of allowed characters, excluding the special ones.
      currentText = currentText.replace(/^[^\t ()<>@,;:\\"\/\[\]?=]+/,
        function(aAll) {
          // A valid token was found.
          innerText = aAll;
          // Remove the token from the current text.
          return "";
        }
      );
      return innerText;
    }
    function getQuotedString() {
      // If no quoted string is present, an empty string is returned.
      var innerText = "";
      // Look for a string that begins and ends with double quotes, excluding
      // double quote characters appearing in quoted pairs inside the string.
      currentText = currentText.replace(/^"((?:\\.|[^"])*)"/,
        function(aAll, aInnerString) {
          // Store the contents of the quoted string, while parsing quoted
          // pairs.
          innerText = aInnerString.replace(/\\(.)/g, "$1");
          // Remove the quoted string from the current text.
          return "";
        }
      );
      return innerText;
    }
    function getMsgId() {
      // This function looks for non-standard values of the "start" parameter
      // usually contained in MHTML files generated by the Opera browser.
      var innerText = "";
      // Look for a string that begins and ends with angular parentheses,
      // excluding only the presence of nested parentheses in the middle.
      currentText = currentText.replace(/^<[^<>]+>/,
        function(aAll) {
          // A non-standard value was found.
          innerText = aAll;
          // Remove the value from the current text.
          return "";
        }
      );
      return innerText;
    }
    // Start by parsing the media type and subtype.
    eatCommentsAndWhitespace();
    var type = getToken();
    var subtype = "";
    if (currentText && currentText[0] === "/") {
      currentText = currentText.slice(1);
      subtype = getToken();
    }
    // Continue only if the header value is valid so far.
    if (!type || !subtype) {
      return "";
    }
    // Parse the parameters.
    eatCommentsAndWhitespace();
    while (currentText && currentText[0] === ";") {
      // Remove the separating semicolon.
      currentText = currentText.slice(1);
      eatCommentsAndWhitespace();
      // Parse the parameter name.
      var paramName = getToken();
      eatCommentsAndWhitespace();
      // Parse the mandatory parameter value.
      if (currentText && currentText[0] === "=") {
        // Remove the separating equal sign.
        currentText = currentText.slice(1);
        eatCommentsAndWhitespace();
        // Parse the parameter value.
        var paramValue = getToken() || getQuotedString() || getMsgId();
        eatCommentsAndWhitespace();
        // Set the property on the provided object if the parameter is present.
        if (paramName && paramValue) {
          aRawParameters[paramName.toLowerCase()] = paramValue;
        }
      }
    }
    // Return the lowercase media type.
    return (type + "/" + subtype).toLowerCase();
  },

  /**
   * Returns a string with a date and time specification conforming to RFC 822,
   * RFC 2822 or RFC 5322. For more information on the date format used, see
   * <http://tools.ietf.org/html/rfc5322#section-3.3> (retrieved 2009-11-25).
   *
   * @param aDate
   *        Valid Date object representing the date to be encoded.
   */
  getDateTimeSpecification: function(aDate) {
    // The following function converts the Mozilla JavaScript date format, like
    // "Mon Sep 28 1998 14:36:22 GMT-0700 (Pacific Daylight Time)", to the
    // expected RFC 5322 format, like "Mon, 28 Sep 1998 14:36:22 -0700".
    return aDate.toString().replace(
     /^(...) (...) (..) (.... ..:..:..) ...(.....).*$/,
     "$1, $3 $2 $4 $5");
  },
}
