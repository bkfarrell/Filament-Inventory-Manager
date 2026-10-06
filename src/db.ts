import type { SQLiteDatabase } from 'expo-sqlite';

import type { PrintSnapshot } from './printerParse';

// A spool is one roll of filament you own.
export type Spool = {
  id: number;
  brand: string;
  material: string; // e.g. PLA, PETG, ABS, TPU
  color: string;
  totalWeightG: number; // filament weight when new, in grams (usually 1000)
  remainingWeightG: number; // filament weight left, in grams
  emptySpoolWeightG: number; // weight of the empty reel, so a scale reading can be converted
  pricePaid: number; // what you paid for the spool
  purchasedAt: string; // ISO date, e.g. 2026-10-03
  barcode: string | null; // barcode from the box, if it was added by scanning
  openedAt: string | null; // date the bag was opened; null while still sealed
  notes: string; // anything worth remembering, e.g. "prints stringy above 215°C"
  isRefill: boolean; // true for a refill (filament only, loaded onto a reusable spool)
  location: string | null; // AMS slot it's loaded in, e.g. "ams-1-2" (see locations.ts); null if not loaded
  finishedAt: string | null; // date it was marked "used up"; kept for purchase history
};

// The fields you fill in on the add/edit form.
export type NewSpool = Omit<Spool, 'id' | 'finishedAt' | 'location'>;

// A product is a kind of filament you've scanned before, remembered by its barcode,
// so the next box with the same barcode fills in the form for you.
export type Product = {
  barcode: string;
  brand: string;
  material: string;
  color: string;
  totalWeightG: number;
  emptySpoolWeightG: number;
  lastPricePaid: number;
  isRefill: boolean;
};

// A spool counts as "low" when this many grams or fewer are left.
export const LOW_STOCK_THRESHOLD_G = 200;

const SCHEMA_VERSION = 8;

// Runs once when the app opens. It creates the tables on first launch and
// upgrades them in later versions. Raise SCHEMA_VERSION and add a new
// `if (version < N)` block whenever the tables need to change.
export async function migrateDb(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE spools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        brand TEXT NOT NULL,
        material TEXT NOT NULL,
        color TEXT NOT NULL,
        total_weight_g REAL NOT NULL,
        remaining_weight_g REAL NOT NULL,
        price_paid REAL NOT NULL DEFAULT 0,
        purchased_at TEXT NOT NULL
      );
    `);
    version = 1;
  }

  if (version < 2) {
    await db.execAsync(
      'ALTER TABLE spools ADD COLUMN empty_spool_weight_g REAL NOT NULL DEFAULT 0'
    );
    version = 2;
  }

  if (version < 3) {
    await db.execAsync(`
      ALTER TABLE spools ADD COLUMN barcode TEXT;
      CREATE TABLE products (
        barcode TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        material TEXT NOT NULL,
        color TEXT NOT NULL,
        total_weight_g REAL NOT NULL,
        empty_spool_weight_g REAL NOT NULL DEFAULT 0,
        last_price_paid REAL NOT NULL DEFAULT 0
      );
    `);
    version = 3;
  }

  if (version < 4) {
    await db.execAsync('ALTER TABLE spools ADD COLUMN finished_at TEXT');
    version = 4;
  }

  if (version < 5) {
    await db.execAsync(`
      ALTER TABLE spools ADD COLUMN opened_at TEXT;
      ALTER TABLE spools ADD COLUMN notes TEXT NOT NULL DEFAULT '';
    `);
    version = 5;
  }

  if (version < 6) {
    // SQLite has no true/false type, so 0 = comes on its own spool, 1 = refill.
    await db.execAsync(`
      ALTER TABLE spools ADD COLUMN is_refill INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN is_refill INTEGER NOT NULL DEFAULT 0;
    `);
    version = 6;
  }

  if (version < 7) {
    // Where each spool is loaded, plus a history of everything that happens to it.
    // Existing spools get history entries for the dates already known.
    await db.execAsync(`
      ALTER TABLE spools ADD COLUMN location TEXT;
      CREATE TABLE spool_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spool_id INTEGER NOT NULL,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX spool_events_by_spool ON spool_events (spool_id, at);
      INSERT INTO spool_events (spool_id, at, type)
        SELECT id, purchased_at, 'purchased' FROM spools;
      INSERT INTO spool_events (spool_id, at, type)
        SELECT id, opened_at, 'opened' FROM spools WHERE opened_at IS NOT NULL;
      INSERT INTO spool_events (spool_id, at, type)
        SELECT id, finished_at, 'finished' FROM spools WHERE finished_at IS NOT NULL;
    `);
    version = 7;
  }

  if (version < 8) {
    // Prints counted automatically from the printer (each only once), and small app settings.
    await db.execAsync(`
      CREATE TABLE print_jobs (
        job_key TEXT PRIMARY KEY,
        task_name TEXT NOT NULL,
        result TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL,
        ended_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        entries TEXT NOT NULL
      );
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    version = 8;
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

type SpoolRow = {
  id: number;
  brand: string;
  material: string;
  color: string;
  total_weight_g: number;
  remaining_weight_g: number;
  empty_spool_weight_g: number;
  price_paid: number;
  purchased_at: string;
  barcode: string | null;
  opened_at: string | null;
  notes: string;
  is_refill: number;
  location: string | null;
  finished_at: string | null;
};

function fromRow(r: SpoolRow): Spool {
  return {
    id: r.id,
    brand: r.brand,
    material: r.material,
    color: r.color,
    totalWeightG: r.total_weight_g,
    remainingWeightG: r.remaining_weight_g,
    emptySpoolWeightG: r.empty_spool_weight_g,
    pricePaid: r.price_paid,
    purchasedAt: r.purchased_at,
    barcode: r.barcode,
    openedAt: r.opened_at,
    notes: r.notes,
    isRefill: r.is_refill === 1,
    location: r.location,
    finishedAt: r.finished_at,
  };
}

// Spools you still have (not marked as used up), emptiest first.
export async function listSpools(db: SQLiteDatabase): Promise<Spool[]> {
  const rows = await db.getAllAsync<SpoolRow>(
    'SELECT * FROM spools WHERE finished_at IS NULL ORDER BY remaining_weight_g ASC'
  );
  return rows.map(fromRow);
}

// Every spool ever bought, including used-up ones, newest purchase first.
export async function listAllSpools(db: SQLiteDatabase): Promise<Spool[]> {
  const rows = await db.getAllAsync<SpoolRow>(
    'SELECT * FROM spools ORDER BY purchased_at DESC, id DESC'
  );
  return rows.map(fromRow);
}

// ---- History ----

export type SpoolEventType =
  | 'purchased'
  | 'opened'
  | 'resealed'
  | 'loaded'
  | 'unloaded'
  | 'used'
  | 'adjusted'
  | 'finished'
  | 'printed' // filament used by a print, counted automatically (detail: "grams|job name")
  | 'print_undone'; // an automatically counted print was undone (detail: "grams|job name")

export type SpoolEvent = {
  id: number;
  spoolId: number;
  at: string; // "YYYY-MM-DD" for date-only entries, otherwise a full timestamp
  type: SpoolEventType;
  detail: string; // e.g. the slot ("ams-1-2") or grams used ("50")
};

async function logEvent(
  db: SQLiteDatabase,
  spoolId: number,
  type: SpoolEventType,
  detail = '',
  at = new Date().toISOString()
) {
  await db.runAsync(
    'INSERT INTO spool_events (spool_id, at, type, detail) VALUES (?, ?, ?, ?)',
    spoolId,
    at,
    type,
    detail
  );
}

// A spool's history, newest first.
export async function listEvents(db: SQLiteDatabase, spoolId: number): Promise<SpoolEvent[]> {
  const rows = await db.getAllAsync<{
    id: number;
    spool_id: number;
    at: string;
    type: SpoolEventType;
    detail: string;
  }>('SELECT * FROM spool_events WHERE spool_id = ? ORDER BY at DESC, id DESC', spoolId);
  return rows.map((r) => ({ id: r.id, spoolId: r.spool_id, at: r.at, type: r.type, detail: r.detail }));
}

async function getRow(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<SpoolRow>('SELECT * FROM spools WHERE id = ?', id);
}

// ---- Opening, loading into the AMS, removing ----

// Opens a sealed spool without loading it anywhere, so it becomes Available.
export async function openSpool(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    const row = await getRow(db, id);
    if (!row || row.opened_at) return;
    await db.runAsync('UPDATE spools SET opened_at = ? WHERE id = ?', todayIso(), id);
    await logEvent(db, id, 'opened');
  });
}

// Loads a spool into an AMS slot (opening it first if it's sealed). Whatever spool was
// in that slot is moved to Available. Returns that spool's id, if there was one.
export async function loadSpool(
  db: SQLiteDatabase,
  id: number,
  location: string
): Promise<number | null> {
  let displaced: number | null = null;
  await db.withTransactionAsync(async () => {
    const occupant = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM spools WHERE location = ? AND id != ? AND finished_at IS NULL',
      location,
      id
    );
    if (occupant) {
      displaced = occupant.id;
      await db.runAsync('UPDATE spools SET location = NULL WHERE id = ?', occupant.id);
      await logEvent(db, occupant.id, 'unloaded', location);
    }

    const row = await getRow(db, id);
    if (!row) return;
    if (row.location === location) return;
    if (row.location) await logEvent(db, id, 'unloaded', row.location);
    if (!row.opened_at) {
      await db.runAsync('UPDATE spools SET opened_at = ? WHERE id = ?', todayIso(), id);
      await logEvent(db, id, 'opened');
    }
    await db.runAsync('UPDATE spools SET location = ? WHERE id = ?', location, id);
    await logEvent(db, id, 'loaded', location);
  });
  return displaced;
}

// Takes a spool out of the AMS. It stays opened, so it shows as Available.
export async function unloadSpool(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    const row = await getRow(db, id);
    if (!row?.location) return;
    await db.runAsync('UPDATE spools SET location = NULL WHERE id = ?', id);
    await logEvent(db, id, 'unloaded', row.location);
  });
}

// Hides a spool from the inventory but keeps it for purchase history and reports.
export async function markFinished(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    const row = await getRow(db, id);
    if (!row) return;
    if (row.location) await logEvent(db, id, 'unloaded', row.location);
    await db.runAsync(
      'UPDATE spools SET finished_at = ?, remaining_weight_g = 0, location = NULL WHERE id = ?',
      todayIso(),
      id
    );
    await logEvent(db, id, 'finished');
  });
}

// Today's date as YYYY-MM-DD in the phone's local time zone.
export function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---- Adding and editing ----

export async function addSpool(db: SQLiteDatabase, s: NewSpool) {
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO spools
         (brand, material, color, total_weight_g, remaining_weight_g, empty_spool_weight_g,
          price_paid, purchased_at, barcode, opened_at, notes, is_refill)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      s.brand,
      s.material,
      s.color,
      s.totalWeightG,
      s.remainingWeightG,
      s.emptySpoolWeightG,
      s.pricePaid,
      s.purchasedAt,
      s.barcode,
      s.openedAt,
      s.notes,
      s.isRefill ? 1 : 0
    );
    const id = result.lastInsertRowId;
    await logEvent(db, id, 'purchased', '', s.purchasedAt);
    if (s.openedAt) await logEvent(db, id, 'opened', '', s.openedAt);
  });
}

export async function updateSpool(db: SQLiteDatabase, id: number, s: NewSpool) {
  await db.withTransactionAsync(async () => {
    const before = await getRow(db, id);
    // Marking a spool as sealed again also takes it out of the AMS.
    const location = s.openedAt ? (before?.location ?? null) : null;
    await db.runAsync(
      `UPDATE spools SET
         brand = ?, material = ?, color = ?, total_weight_g = ?, remaining_weight_g = ?,
         empty_spool_weight_g = ?, price_paid = ?, purchased_at = ?, barcode = ?,
         opened_at = ?, notes = ?, is_refill = ?, location = ?
       WHERE id = ?`,
      s.brand,
      s.material,
      s.color,
      s.totalWeightG,
      s.remainingWeightG,
      s.emptySpoolWeightG,
      s.pricePaid,
      s.purchasedAt,
      s.barcode,
      s.openedAt,
      s.notes,
      s.isRefill ? 1 : 0,
      location,
      id
    );
    if (!before) return;
    if (!before.opened_at && s.openedAt) await logEvent(db, id, 'opened', '', s.openedAt);
    if (before.opened_at && !s.openedAt) {
      if (before.location) await logEvent(db, id, 'unloaded', before.location);
      await logEvent(db, id, 'resealed');
    }
    if (Math.round(before.remaining_weight_g) !== Math.round(s.remainingWeightG)) {
      await logEvent(
        db,
        id,
        'adjusted',
        `${Math.round(before.remaining_weight_g)}→${Math.round(s.remainingWeightG)}`
      );
    }
  });
}

// Subtracts filament used by a print. Never goes below zero.
// Printing from a sealed spool means it's been opened, so that date is filled in too.
export async function recordUsage(db: SQLiteDatabase, id: number, grams: number) {
  await db.withTransactionAsync(async () => {
    const before = await getRow(db, id);
    if (!before) return;
    await db.runAsync(
      `UPDATE spools SET
         remaining_weight_g = MAX(0, remaining_weight_g - ?),
         opened_at = COALESCE(opened_at, ?)
       WHERE id = ?`,
      grams,
      todayIso(),
      id
    );
    if (!before.opened_at) await logEvent(db, id, 'opened');
    await logEvent(db, id, 'used', String(grams));
  });
}

// ---- Prints counted automatically from the printer ----

export type PrintJobEntry = {
  location: string; // AMS slot, e.g. "ams-1-2"
  grams: number;
  spoolId: number | null; // the spool it was subtracted from; null if no spool was in that slot
  spoolName: string | null; // e.g. "Bambu PLA Matte · Black", as it was at the time
};

export type PrintJob = {
  jobKey: string;
  taskName: string;
  result: 'finished' | 'failed';
  status: 'applied' | 'undone' | 'skipped';
  progress: number | null;
  endedAt: string;
  recordedAt: string;
  entries: PrintJobEntry[];
};

type PrintJobRow = {
  job_key: string;
  task_name: string;
  result: 'finished' | 'failed';
  status: 'applied' | 'undone' | 'skipped';
  progress: number | null;
  ended_at: string;
  recorded_at: string;
  entries: string;
};

function jobFromRow(r: PrintJobRow): PrintJob {
  return {
    jobKey: r.job_key,
    taskName: r.task_name,
    result: r.result,
    status: r.status,
    progress: r.progress,
    endedAt: r.ended_at,
    recordedAt: r.recorded_at,
    entries: JSON.parse(r.entries) as PrintJobEntry[],
  };
}

async function setting(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  return row?.value ?? null;
}

// Called with every printer reading. When a print has just finished (or failed), subtracts
// its filament from the spools in the slots it used, once per print. Prints that ended
// before usage tracking started are recorded as skipped, so old jobs never change your
// inventory. Returns the newly counted print, or null if there was nothing new.
export async function syncPrintUsage(
  db: SQLiteDatabase,
  snapshot: PrintSnapshot | null
): Promise<PrintJob | null> {
  let created: PrintJob | null = null;
  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    let since = await setting(db, 'usage_tracking_since');
    if (!since) {
      since = now;
      await db.runAsync("INSERT INTO app_settings (key, value) VALUES ('usage_tracking_since', ?)", now);
    }
    if (!snapshot) return;
    const seen = await db.getFirstAsync('SELECT 1 FROM print_jobs WHERE job_key = ?', snapshot.jobKey);
    if (seen) return;

    const skipped = new Date(snapshot.endedAt).getTime() < new Date(since).getTime();
    const entries: PrintJobEntry[] = [];
    for (const u of snapshot.usage) {
      const spool = skipped
        ? null
        : await db.getFirstAsync<SpoolRow>(
            'SELECT * FROM spools WHERE location = ? AND finished_at IS NULL',
            u.location
          );
      if (spool) {
        await db.runAsync(
          'UPDATE spools SET remaining_weight_g = MAX(0, remaining_weight_g - ?) WHERE id = ?',
          u.grams,
          spool.id
        );
        await logEvent(db, spool.id, 'printed', `${u.grams}|${snapshot.taskName}`);
      }
      entries.push({
        location: u.location,
        grams: u.grams,
        spoolId: spool?.id ?? null,
        spoolName: spool ? `${spool.brand} ${spool.material} · ${spool.color}` : null,
      });
    }
    const status = skipped ? 'skipped' : 'applied';
    await db.runAsync(
      `INSERT INTO print_jobs
         (job_key, task_name, result, status, progress, ended_at, recorded_at, entries)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.jobKey,
      snapshot.taskName,
      snapshot.result,
      status,
      snapshot.progressPct,
      snapshot.endedAt,
      now,
      JSON.stringify(entries)
    );
    if (!skipped) {
      created = {
        jobKey: snapshot.jobKey,
        taskName: snapshot.taskName,
        result: snapshot.result,
        status,
        progress: snapshot.progressPct,
        endedAt: snapshot.endedAt,
        recordedAt: now,
        entries,
      };
    }
  });
  return created;
}

// The most recent automatically counted prints (skipped old ones left out).
export async function listPrintJobs(db: SQLiteDatabase, limit = 5): Promise<PrintJob[]> {
  const rows = await db.getAllAsync<PrintJobRow>(
    "SELECT * FROM print_jobs WHERE status != 'skipped' ORDER BY ended_at DESC LIMIT ?",
    limit
  );
  return rows.map(jobFromRow);
}

// Puts back the filament an automatically counted print subtracted.
export async function undoPrintJob(db: SQLiteDatabase, jobKey: string) {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<PrintJobRow>(
      "SELECT * FROM print_jobs WHERE job_key = ? AND status = 'applied'",
      jobKey
    );
    if (!row) return;
    const job = jobFromRow(row);
    for (const e of job.entries) {
      if (e.spoolId === null) continue;
      const spool = await getRow(db, e.spoolId);
      if (!spool) continue;
      await db.runAsync(
        'UPDATE spools SET remaining_weight_g = remaining_weight_g + ? WHERE id = ?',
        e.grams,
        e.spoolId
      );
      await logEvent(db, e.spoolId, 'print_undone', `${e.grams}|${job.taskName}`);
    }
    await db.runAsync("UPDATE print_jobs SET status = 'undone' WHERE job_key = ?", jobKey);
  });
}

export async function deleteSpool(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM spool_events WHERE spool_id = ?', id);
    await db.runAsync('DELETE FROM spools WHERE id = ?', id);
  });
}

// True when a spool just went from above the low-stock line to at or below it.
export function justWentLow(before: Spool, after: Spool) {
  return (
    before.remainingWeightG > LOW_STOCK_THRESHOLD_G &&
    after.remainingWeightG <= LOW_STOCK_THRESHOLD_G
  );
}

export function isLowStock(s: Spool) {
  return s.remainingWeightG <= LOW_STOCK_THRESHOLD_G;
}

// Cost of filament per gram, useful for pricing a print.
export function costPerGram(s: Spool) {
  return s.totalWeightG > 0 ? s.pricePaid / s.totalWeightG : 0;
}

// Barcode scanners report the same box differently: iPhones read a 12-digit UPC
// as a 13-digit code with a leading 0. Strip that so both phones match.
export function normalizeBarcode(raw: string) {
  const code = raw.trim();
  return /^0\d{12}$/.test(code) ? code.slice(1) : code;
}

type ProductRow = {
  barcode: string;
  brand: string;
  material: string;
  color: string;
  total_weight_g: number;
  empty_spool_weight_g: number;
  last_price_paid: number;
  is_refill: number;
};

export async function findProduct(db: SQLiteDatabase, barcode: string): Promise<Product | null> {
  const r = await db.getFirstAsync<ProductRow>('SELECT * FROM products WHERE barcode = ?', barcode);
  if (!r) return null;
  return {
    barcode: r.barcode,
    brand: r.brand,
    material: r.material,
    color: r.color,
    totalWeightG: r.total_weight_g,
    emptySpoolWeightG: r.empty_spool_weight_g,
    lastPricePaid: r.last_price_paid,
    isRefill: r.is_refill === 1,
  };
}

// Saves (or updates) what a barcode means, using the details from a spool.
export async function rememberProduct(db: SQLiteDatabase, barcode: string, s: NewSpool) {
  await db.runAsync(
    `INSERT INTO products
       (barcode, brand, material, color, total_weight_g, empty_spool_weight_g, last_price_paid,
        is_refill)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       brand = excluded.brand,
       material = excluded.material,
       color = excluded.color,
       total_weight_g = excluded.total_weight_g,
       empty_spool_weight_g = excluded.empty_spool_weight_g,
       last_price_paid = excluded.last_price_paid,
       is_refill = excluded.is_refill`,
    barcode,
    s.brand,
    s.material,
    s.color,
    s.totalWeightG,
    s.emptySpoolWeightG,
    s.pricePaid,
    s.isRefill ? 1 : 0
  );
}
