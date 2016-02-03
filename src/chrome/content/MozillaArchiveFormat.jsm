/**
 * Exports all the common JavaScript objects for Mozilla Archive Format.
 */

const { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let objectsByFolder = {
  general: [
    "AsyncEnumerator",
    "DataSourceWrapper",
    "Interface",
    "PersistBundle",
    "PersistFolder",
    "PersistResource",
    "SourceFragment",
    "CssSourceFragment",
    "HtmlSourceFragment",
    "TagSourceFragment",
    "UrlListSourceFragment",
    "UrlSourceFragment",
  ],
  archives: [
    "ArchiveAnnotations",
    "ArchiveHistoryObserver",
  ],
  convert: [
    "Candidate",
    "CandidateFinder",
    "CandidateLocation",
    "CandidatesDataSource",
  ],
  engine: [
    "Archive",
    "ArchiveCache",
    "ArchivePage",
    "MaffArchive",
    "MaffArchivePage",
    "MaffDataSource",
    "MhtmlArchive",
    "MhtmlArchivePage",
    "MimePart",
    "MimeSupport",
    "MultipartMimePart",
    "ZipCreator",
    "ZipDirectory",
  ],
  integration: [
    "FileFilters",
    "TabsDataSource",
  ],
  loading: [
    "ArchiveLoader",
    "ArchiveStreamConverter",
  ],
  preferences: [
    "DynamicPrefs",
    "FileAssociations",
    "Prefs",
  ],
  savecomplete: [
    "MafSaveComplete",
    "SaveCompletePersist",
  ],
  saving: [
    "Job",
    "JobRunner",
    "ExactPersistInitialJob",
    "ExactPersistJob",
    "ExactPersist",
    "ExactPersistParsedJob",
    "ExactPersistReference",
    "ExactPersistUnparsedJob",
    "MafArchivePersist",
    "MafWebProgressListener",
    "SaveArchiveJob",
    "SaveContentJob",
    "SaveJob",
  ],
  startup: [
    "HelperAppsWrapper",
    "StartupEvents",
    "StartupInitializer",
  ],
};

let EXPORTED_SYMBOLS = [];
for (let folderName of Object.keys(objectsByFolder)) {
  for (let objectName of objectsByFolder[folderName]) {
    EXPORTED_SYMBOLS.push(objectName);
    Services.scriptloader.loadSubScript("chrome://mza/content/" + folderName +
                                        "/" + objectName + ".js");
  }
}
