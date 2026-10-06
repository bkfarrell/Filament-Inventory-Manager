// The data operations the app uses. On the phone they run against the on-device
// database; on the web they're sent to the server, which runs the same functions
// against that person's own database. Keep this list in sync with src/db.ts.
export const STORE_METHODS = [
  'listSpools',
  'listAllSpools',
  'addSpool',
  'updateSpool',
  'deleteSpool',
  'recordUsage',
  'openSpool',
  'loadSpool',
  'unloadSpool',
  'markFinished',
  'listEvents',
  'findProduct',
  'rememberProduct',
  'syncPrintUsage',
  'listPrintJobs',
  'undoPrintJob',
] as const;

export type StoreMethod = (typeof STORE_METHODS)[number];
