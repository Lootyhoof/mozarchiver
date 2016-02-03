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
 * Allows the current thread to iterate through the items of an enumerable
 * object, like an array, without blocking the dispatching of events like those
 * raised by user interface interaction.
 *
 * @param aEnumerable
 *        The enumerable object to be examined. The Iterator global function
 *        will be used to get a reference to the object's iterator.
 * @param aItemFn
 *        Callback function that will be called for every item. The item will be
 *        the function's first argument. The next item in the enumeration will
 *        not be examined until the function returns. If an exception is raised,
 *        the enumeration will be suspended until explicitly stopped.
 * @param aSuccessFn
 *        Callback function that will be called if the enumeration terminates
 *        normally, and the "stop" method has not been called.
 */
function AsyncEnumerator(aEnumerable, aItemFn, aSuccessFn) {
  // Get the iterator for the items in the enumerable object.
  this._iterator = Iterator(aEnumerable);
  // Save references to the callback function.
  this._itemFn = aItemFn;
  this._successFn = aSuccessFn;
}

AsyncEnumerator.prototype = {
  /**
   * Starts or resumes the enumeration of the items.
   *
   * This function may also be called from within a callback function.
   */
  start: function() {
    // If the enumeration has already been stopped, return now.
    if (!this._iterator) {
      return;
    }
    // Ensure that the paused state is reset and enter the main loop.
    this._paused = false;
    this.run();
  },

  /**
   * Pauses the enumeration of the items until the "start" method is called.
   *
   * This function may also be called from within a callback function.
   */
  pause: function() {
    this._paused = true;
  },

  /**
   * Pauses the enumeration of the items until the "run" method is called again.
   *
   * This function may also be called from within a callback function.
   */
  stop: function() {
    // Force the "run" method to terminate as soon as the currently running
    // callback, if any, terminates its execution. Since the iterator will
    // become unavailable, the iteration will not be resumed even if the "start"
    // method is called before the "run" method terminates.
    this._paused = true;
    // First make the iterator unavailable.
    var iterator = this._iterator;
    this._iterator = null;
    // If the iterator is also a generator, ensure it is closed.
    if (iterator.close) {
      iterator.close();
    }
  },

  /**
   * Executes the main iteration loop. This is considered a private function.
   */
  run: function() {
    // If the enumeration has already been stopped, return now.
    if (!this._iterator) {
      return;
    }
    // If the main iteration loop is already running, return now.
    if (this._running) {
      return;
    }
    // Enter the main iteration loop.
    this._running = true;
    try {
      // The main loop is executed until one of the following occurs:
      //   - The maximum allowed consecutive execution time passes.
      //   - The enumeration is paused or stopped.
      //   - The last item in the enumeration is reached.
      //   - An exception is raised by the callback function.
      var startTime = new Date();
      do {
        this._itemFn(this._iterator.next());
      } while(!this._paused &&
       new Date() - startTime < this._maxConsecutiveTimeMs);
      // If the main loop terminated because the maximum allowed consecutive
      // execution time passed, reschedule the "run" method immediately.
      if (!this._paused) {
        this._mainThread.dispatch(this, Ci.nsIThread.DISPATCH_NORMAL);
      }
    } catch (e if e instanceof StopIteration) {
      // Enumeration terminated successfully. Make the iterator unavailable and
      // invoke the appropriate callback function.
      this._iterator = null;
      this._successFn();
    } finally {
      // Indicate that the main loop terminated, even in case of exceptions.
      this._running = false;
    }
  },

  /**
   * Time interval, in milliseconds, after which the enumeration is suspended
   * and automatically rescheduled on the current thread.
   */
  _maxConsecutiveTimeMs: 25,

  /**
   * Iterator over the enumerable object, or null if the enumeration terminated.
   */
  _iterator: null,

  /**
   * Callback function. See the constructor for details.
   */
  _itemFn: null,

  /**
   * Callback function. See the constructor for details.
   */
  _successFn: null,

  /**
   * True while the "run" method is being executed.
   */
  _running: false,

  /**
   * True if the enumeration should be paused until the "run" method is called.
   */
  _paused: false,

  _mainThread: Cc["@mozilla.org/thread-manager;1"].
   getService(Ci.nsIThreadManager).mainThread,
}
