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
 * Ensures the selected save location is ready to accept the downloaded files.
 *
 * This class derives from Job. See the Job documentation for details.
 *
 * @param aTargetDataFolder
 *        The support folder to be prepared for data files.
 */
function ExactPersistInitialJob(aEventListener, aTargetDataFolder) {
  Job.call(this, aEventListener);
  this._targetDataFolder = aTargetDataFolder;
}

ExactPersistInitialJob.prototype = {
  __proto__: Job.prototype,

  // Job
  _executeStart: function() {
    // Delete the folder where the additional files will be saved.
    if (this._targetDataFolder.exists()) {
      this._targetDataFolder.remove(true);
    }
    // This job completed its execution.
    this._notifyCompletion();
  },

  // Job
  _executeCancel: function(aReason) {
    // No special action is required since this object works synchronously.
  },

  _targetDataFolder: null,
}
