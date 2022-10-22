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
 * Allows the association of web archive file types with Firefox on Windows.
 */
var FileAssociations = {
  /**
   * Creates file associations for the MAFF file format.
   */
  createAssociationsForMAFF: function() {
    // First, create an explicit file association for the current user. This
    // operation does not require administrator privileges, but should be done
    // also for administrators, to ensure that no user-specific settings will
    // take priority over the association for all users.
    new FileAssociationsCreator(true).createAssociationsForMAFF();
    // Create a file association for all other users, but ignore errors if the
    // current user does not have administrator privileges.
    new FileAssociationsCreator(false).createAssociationsForMAFF();
  },

  /**
   * Creates file associations for the MHTML file format.
   */
  createAssociationsForMHTML: function() {
    // First, create an explicit file association for the current user. This
    // operation does not require administrator privileges, but should be done
    // also for administrators, to ensure that no user-specific settings will
    // take priority over the association for all users.
    new FileAssociationsCreator(true).createAssociationsForMHTML();
    // Create a file association for all other users, but ignore errors if the
    // current user does not have administrator privileges.
    new FileAssociationsCreator(false).createAssociationsForMHTML();
  }
}

/**
 * This object allows the creation of file association entries in the Windows
 * registry, either for the current user or for all users in the system.
 *
 * @param aForCurrentUser
 *        If true, creates entries for the current user. If false, creates
 *        entries for all users, but ignores errors caused by lack of
 *        privileges.
 */
function FileAssociationsCreator(aForCurrentUser) {
  this._forCurrentUser = aForCurrentUser;
}

FileAssociationsCreator.prototype = {
  _forCurrentUser: false,

  /**
   * Creates file associations for the MAFF file format.
   */
  createAssociationsForMAFF: function() {
    // Determine the ProgID name based on the host application.
    var maffProgID = this._isOnSeaMonkey() ? "SeaMonkeyMAFF" : this._isOnPaleMoon() ? "PaleMoonMAFF" : "BasiliskMAFF";
    // Create a new ProgID for the MAFF format.
    this._createWindowsFileTypeForBrowser(maffProgID,
     this._str("associate.maff.sysfiletypedesc"));
    // Associate file extensions with the file type.
    this._createWindowsFileExtensionAssociation(".maff", maffProgID);
  },

  /**
   * Creates file associations for the MHTML file format.
   */
  createAssociationsForMHTML: function() {
    // Determine the ProgID name based on the host application.
    var mhtmlProgID = this._isOnSeaMonkey() ? "SeaMonkeyMHTML" : this._isOnPaleMoon() ? "PaleMoonMHTML" : "BasiliskMHTML";
    // Create a new ProgID for the MHTML format handled by the host application.
    this._createWindowsFileTypeForBrowser(mhtmlProgID,
     this._str("associate.mhtml.sysfiletypedesc"));
    // Associate file extensions with the file type.
    this._createWindowsFileExtensionAssociation(".mht", mhtmlProgID);
    this._createWindowsFileExtensionAssociation(".mhtml", mhtmlProgID);
  },

  /**
   * Returns the string whose key is specified from the object's string bundle.
   */
  _str: function(aKey) {
    return Interface.replaceBrandShortName(this._fileAssociationsStrBundle.
     GetStringFromName(aKey));
  },

  // For convenience, we use the strings from the preferences dialog.
  _fileAssociationsStrBundle: Cc["@mozilla.org/intl/stringbundle;1"]
   .getService(Ci.nsIStringBundleService).createBundle(
   "chrome://mza/locale/fileAssociationsObject.properties"),

  /**
   * Returns true if the host application is SeaMonkey.
   */
  _isOnSeaMonkey: function() {
    return Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).ID ==
     "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}";
  },
  
  /**
   * Returns true if the host application is Pale Moon.
   */
  _isOnPaleMoon: function() {
    return Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).ID ==
     "{8de7fcbb-c55c-4fbe-bfc5-fc555c87dbc4}";
  },

  /**
   * Returns the appropriate root key to use based on this object settings.
   */
  get _rootKey() {
    return this._forCurrentUser ? Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER :
                                  Ci.nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE;
  },

  /**
   * Creates a global Windows file type, under HKEY_CLASSES_ROOT, associating
   * the given ProgID with the browser's executable file.
   */
  _createWindowsFileTypeForBrowser: function(aProgID, aDisplayName) {
    var currentProcessFile = Cc["@mozilla.org/file/directory_service;1"]
     .getService(Ci.nsIProperties).get("XREExeF", Ci.nsIFile);

    // Create an association with the browser. For more information, see
    // <https://developer.mozilla.org/En/Command_Line_Options> (retrieved
    // 2008-11-19).
    this._createWindowsFileType(
     aProgID,
     aDisplayName,
     currentProcessFile.path,
     '-osint -url "%1"',
     this._isOnSeaMonkey() ? 0 : 1
     );
  },

  /**
   * Creates a global Windows file type, under HKEY_CLASSES_ROOT, with an "open"
   * verb and an icon from the executable file.
   *
   * @param aProgID
   *        The internal ProgID of the file type.
   * @param aDisplayName
   *        File type name displayed in Windows Explorer.
   * @param aExecutablePath
   *        Path of the executable, with no quotes.
   * @param aIconIndex
   *        IconIndex in the executable's file.
   * @param aCmdLineArgs
   *        Command line arguments, where %1 is name of the document being
   *        opened.
   *
   * If the ProgID already exists, its settings are overwritten.
   */
  _createWindowsFileType: function(aProgID, aDisplayName, aExecutablePath,
    aCmdLineArgs, aIconIndex) {
    // Create or open the key of the given ProgID.
    var keyProgID = Cc["@mozilla.org/windows-registry-key;1"]
     .createInstance(Ci.nsIWindowsRegKey);
    try {
      keyProgID.create(
       this._rootKey,
       "Software\\Classes\\" + aProgID,
       keyProgID.ACCESS_WRITE);
    } catch (e if !this._forCurrentUser) {
      // If we are creating a file type for all users in the system, but opening
      // or creating the first key failed, we ignore the error.
      return;
    }
    // Continue with the newly opened key.
    try {
      // Set the display name shown in the Windows file association GUI.
      keyProgID.writeStringValue("", aDisplayName);
  
      // Associate a default icon.
      var keyDefaultIcon = keyProgID.createChild(
       "DefaultIcon", keyProgID.ACCESS_WRITE);
      try {
        // Use the second icon of the specified executable.
        keyDefaultIcon.writeStringValue("", '"' + aExecutablePath + '",' +
          aIconIndex);
      } finally {
        keyDefaultIcon.close();
      }
  
      // Create a default "open" verb that passes the quoted file name to the
      // specified executable.
      var keyShell = keyProgID.createChild("shell", keyProgID.ACCESS_WRITE);
      try {
        var keyOpen = keyShell.createChild("open", keyShell.ACCESS_WRITE);
        try {
          var keyCommand = keyOpen.createChild("command", keyOpen.ACCESS_WRITE);
          try {
            //
            keyCommand.writeStringValue("", '"' + aExecutablePath +
             '" ' + aCmdLineArgs);
          } finally {
            keyCommand.close();
          }
        } finally {
          keyOpen.close();
        }
      } finally {
        keyShell.close();
      }
    } finally {
      keyProgID.close();
    }
  },

  /**
   * Creates a global Windows file type association, under HKEY_CLASSES_ROOT,
   * associating the given extension with the given ProgID.
   *
   * If the extension is already associated to another file type, the
   * association is modified.
   */
  _createWindowsFileExtensionAssociation: function(aFileExtension, aProgID) {
    // Create or open the key of the given file extension.
    var keyExtension = Cc["@mozilla.org/windows-registry-key;1"]
     .createInstance(Ci.nsIWindowsRegKey);
    try {
      keyExtension.create(
       this._rootKey,
       "Software\\Classes\\" + aFileExtension,
       keyExtension.ACCESS_WRITE);
    } catch (e if !this._forCurrentUser) {
      // If we are creating a file type association for all users in the system,
      // but opening or creating the first key failed, we ignore the error.
      return;
    }
    // Continue with the newly opened key.
    try {
      // Set the file type association.
      keyExtension.writeStringValue("", aProgID);
    } finally {
      keyExtension.close();
    }
  },
}
