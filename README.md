# MozArchiver
Extension to allow the creation and viewing of MAFF and MHT archive files within Pale Moon. Fork of the extension [Mozilla Archive Format](https://www.amadzone.org/mozilla-archive-format/) by Christopher Ottley and Paolo Amadini for Pale Moon.

## Building
Simply download the contents of the "src" folder  and pack the contents into a .zip file. Then, rename the file to .xpi and drag into the browser.

On Unix systems (or Windows 10, with [WSL](https://docs.microsoft.com/en-us/windows/wsl/about)) you can optionally run `build.sh` instead. Running this as-is will produce a .xpi file ending in `-dev`, and if run from the command line and appending a number (e.g. `./build.sh 2`) will append that number to the filename instead.
