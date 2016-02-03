/*
 * This helper file includes the "helperApps.js" file from Mozilla Toolkit.
 *
 * This file is in the public domain :-)
 *
 */

// Define a constructor function for the namespace wrapper.
var HelperAppsWrapper = new function() {
  // Load "helperApps.js" inside this function's namespace.
  Cc["@mozilla.org/moz/jssubscript-loader;1"].
   getService(Ci.mozIJSSubScriptLoader).
   loadSubScript("chrome://mozapps/content/downloads/helperApps.js", this);
}();
