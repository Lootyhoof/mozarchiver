/*
 * This helper file includes the Save Complete implementation, located in the
 * "savecomplete/saver.js" file, under the "MafSaveComplete" namespace. This
 * allows this specific implementation to be used even if a standalone version
 * of Save Complete is installed.
 *
 * This file is in the public domain :-)
 *
 */

// Define a constructor function for the namespace wrapper.
var MafSaveComplete = new function() {
  // Load Save Complete inside this function's namespace.
  Cc["@mozilla.org/moz/jssubscript-loader;1"].
   getService(Ci.mozIJSSubScriptLoader).
   loadSubScript("chrome://mza/content/savecomplete/saver.js", this);
}();
