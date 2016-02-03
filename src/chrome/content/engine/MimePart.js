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
 * Represents a single MIME message, or a content part in a multipart message.
 */
function MimePart() {
  // Initialize member variables explicitly.
  this.headersByLowercaseName = {};
  this.contentTypeParameters = {};
}

MimePart.prototype = {
  /**
   * Raw octets with the concatenation of the header and body sections.
   */
  get text() {
    return this.headerSection + "\r\n" + this.bodySection;
  },
  set text(aValue) {
    // Find the two consecutive line breaks, or the line break at the beginning
    // of the text, separating the headers from the body.
    var headerSectionRe = /^(\r\n?|\n)|(\r\n?|\n)(\r\n?|\2)/g;
    headerSectionRe.lastIndex = 0;
    var matchResult = headerSectionRe.exec(aValue);
    if (!matchResult) {
      // If a match isn't found, only headers are present in this MIME part.
      this.headerSection = aValue;
      this.bodySection = "";
    } else {
      // Create the header and body sections. The last line separator in the
      // header section is not included, since at present the header section is
      // not re-encoded in any case.
      this.headerSection = aValue.slice(0, matchResult.index);
      this.bodySection = aValue.slice(headerSectionRe.lastIndex);
    }
    // Separate and unfold the various headers.
    this.headersByLowercaseName = MimeSupport.collectHeadersFromSection(
     this.headerSection);
    // Parse the value of the "Content-Type" header, if present.
    var contentTypeValue = this.headersByLowercaseName["content-type"];
    this.contentTypeParameters = {};
    if (contentTypeValue) {
      this.mediaType = MimeSupport.parseContentTypeValue(contentTypeValue,
       this.contentTypeParameters);
    } else {
      this.mediaType = "";
    }
    // Parse the value of the "Content-Transfer-Encoding" header, if present.
    this.contentTransferEncoding =
     (this.headersByLowercaseName["content-transfer-encoding"] || "").
     replace(/^\s+|\s+$/g, "").toLowerCase();
  },

  /**
   * Raw octets with the encoded header section of the MIME part. If at least
   * one header is present, a single trailing CRLF sequence is also present.
   */
  headerSection: "",

  /**
   * Raw octets with the encoded body of the MIME part.
   */
  bodySection: "",

  /**
   * This object contains a lowercase property for every header contained in the
   * header section of the MIME part. The value of each property is the raw
   * text of the unfolded header.
   */
  headersByLowercaseName: {},

  /**
   * Lowercase media type contained in the value of the "Content-Type" header.
   */
  mediaType: "",

  /**
   * This object contains a lowercase property for every parameter contained in
   * the value of the "Content-Type" header. The value of each property is the
   * decoded value of the parameter.
   */
  contentTypeParameters: {},

  /**
   * Lowercase string representing the encoding to use for the body of the part.
   * The empty string indicates that the "7bit" default encoding will be used.
   * For more information, see <http://tools.ietf.org/html/rfc2045#section-6>
   * (retrieved 2009-11-15).
   */
  contentTransferEncoding: "",

  /**
   * Raw octets with the decoded body of the MIME part.
   */
  get body() {
    switch (this.contentTransferEncoding) {
      case "quoted-printable":
        return MimeSupport.decodeQuotedPrintable(this.bodySection);
      case "base64":
        return MimeSupport.decodeBase64(this.bodySection);
      default:
        return this.bodySection;
    }
  },
  set body(aValue) {
    // Decide the transformation to apply based on contentTransferEncoding.
    switch (this.contentTransferEncoding) {
      case "quoted-printable":
        this.bodySection = MimeSupport.encodeQuotedPrintable(aValue);
        break;
      case "base64":
        this.bodySection = MimeSupport.encodeBase64(aValue);
        break;
      default:
        this.bodySection = aValue;
    }
  },

  /**
   * Adds the provided encoded header to the header section.
   *
   * @param aHeaderName
   *        Valid name of the header.
   * @param aHeaderValue
   *        Value of the header. If the value spans multiple lines, it must
   *        already be properly folded.
   */
  addRawHeader: function(aHeaderName, aHeaderValue) {
    this.headerSection += aHeaderName + ": " + aHeaderValue + "\r\n";
  },

  /**
   * Adds the provided unstructured header to the header section.
   *
   * @param aHeaderName
   *        Valid name of the header.
   * @param aUnstructuredValue
   *        Unicode string with the value of the header.
   */
  addUnstructuredHeader: function(aHeaderName, aUnstructuredValue) {
    this.headerSection += aHeaderName + ": " +
     MimeSupport.buildUnstructuredValue(aUnstructuredValue, "utf-8",
      aHeaderName.length + 2) + "\r\n";
  },

  /**
   * If this object represents a multipart MIME part, returns an instance of a
   * MultipartMimePart object that can be used to further analyze the contents
   * of the part, otherwise returns this object unaltered.
   */
  promoteToDerivedClass: function() {
    // If the media type is not multipart, exit now.
    if (this.mediaType.slice(0, "multipart/".length) !== "multipart/") {
      return this;
    }
    // Create a new multipart class and propagate the relevant properties.
    var newPart = new MultipartMimePart();
    // Set the metadata properties first.
    newPart.headerSection = this.headerSection;
    newPart.headersByLowercaseName = this.headersByLowercaseName;
    newPart.mediaType = this.mediaType;
    newPart.contentTypeParameters = this.contentTypeParameters;
    newPart.contentTransferEncoding = this.contentTransferEncoding;
    newPart.boundary = this.contentTypeParameters.boundary;
    // Set the body and parse it using the provided metadata.
    newPart.bodySection = this.bodySection;
    return newPart;
  },
}
