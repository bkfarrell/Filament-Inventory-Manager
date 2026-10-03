import type { SQLiteDatabase } from 'expo-sqlite';

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
  finishedAt: string | null; // date it was marked "used up"; kept for purchase history
};

// The fields you fill in on the add/edit form.
export type NewSpool = Omit<Spool, 'id' | 'finishedAt'>;

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
};

// A spool counts as "low" when this many grams or fewer are left.
export const LOW_STOCK_THRESHOLD_G = 200;

const SCHEMA_VERSION = 5;

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

// Hides a spool from the inventory but keeps it for purchase history and reports.
export async function markFinished(db: SQLiteDatabase, id: number) {
  await db.runAsync(
    'UPDATE spools SET finished_at = ?, remaining_weight_g = 0 WHERE id = ?',
    todayIso(),
    id
  );
}

// Today's date as YYYY-MM-DD in the phone's local time zone.
export function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function addSpool(db: SQLiteDatabase, s: NewSpool) {
  await db.runAsync(
    `INSERT INTO spools
       (brand, material, color, total_weight_g, remaining_weight_g, empty_spool_weight_g,
        price_paid, purchased_at, barcode, opened_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    s.notes
  );
}

export async function updateSpool(db: SQLiteDatabase, id: number, s: NewSpool) {
  await db.runAsync(
    `UPDATE spools SET
       brand = ?, material = ?, color = ?, total_weight_g = ?, remaining_weight_g = ?,
       empty_spool_weight_g = ?, price_paid = ?, purchased_at = ?, barcode = ?,
       opened_at = ?, notes = ?
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
    id
  );
}

// Subtracts filament used by a print. Never goes below zero.
// Printing from a sealed spool means it's been opened, so that date is filled in too.
export async function recordUsage(db: SQLiteDatabase, id: number, grams: number) {
  await db.runAsync(
    `UPDATE spools SET
       remaining_weight_g = MAX(0, remaining_weight_g - ?),
       opened_at = COALESCE(opened_at, ?)
     WHERE id = ?`,
    grams,
    todayIso(),
    id
  );
}

export async function deleteSpool(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM spools WHERE id = ?', id);
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
  };
}

// Saves (or updates) what a barcode means, using the details from a spool.
export async function rememberProduct(db: SQLiteDatabase, barcode: string, s: NewSpool) {
  await db.runAsync(
    `INSERT INTO products
       (barcode, brand, material, color, total_weight_g, empty_spool_weight_g, last_price_paid)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       brand = excluded.brand,
       material = excluded.material,
       color = excluded.color,
       total_weight_g = excluded.total_weight_g,
       empty_spool_weight_g = excluded.empty_spool_weight_g,
       last_price_paid = excluded.last_price_paid`,
    barcode,
    s.brand,
    s.material,
    s.color,
    s.totalWeightG,
    s.emptySpoolWeightG,
    s.pricePaid
  );
}
