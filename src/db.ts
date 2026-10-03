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
};

export type NewSpool = Omit<Spool, 'id'>;

// A spool counts as "low" when this many grams or fewer are left.
export const LOW_STOCK_THRESHOLD_G = 200;

const SCHEMA_VERSION = 2;

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
  };
}

export async function listSpools(db: SQLiteDatabase): Promise<Spool[]> {
  const rows = await db.getAllAsync<SpoolRow>(
    'SELECT * FROM spools ORDER BY remaining_weight_g ASC'
  );
  return rows.map(fromRow);
}

export async function addSpool(db: SQLiteDatabase, s: NewSpool) {
  await db.runAsync(
    `INSERT INTO spools
       (brand, material, color, total_weight_g, remaining_weight_g, empty_spool_weight_g,
        price_paid, purchased_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    s.brand,
    s.material,
    s.color,
    s.totalWeightG,
    s.remainingWeightG,
    s.emptySpoolWeightG,
    s.pricePaid,
    s.purchasedAt
  );
}

export async function updateSpool(db: SQLiteDatabase, id: number, s: NewSpool) {
  await db.runAsync(
    `UPDATE spools SET
       brand = ?, material = ?, color = ?, total_weight_g = ?, remaining_weight_g = ?,
       empty_spool_weight_g = ?, price_paid = ?, purchased_at = ?
     WHERE id = ?`,
    s.brand,
    s.material,
    s.color,
    s.totalWeightG,
    s.remainingWeightG,
    s.emptySpoolWeightG,
    s.pricePaid,
    s.purchasedAt,
    id
  );
}

// Subtracts filament used by a print. Never goes below zero.
export async function recordUsage(db: SQLiteDatabase, id: number, grams: number) {
  await db.runAsync(
    'UPDATE spools SET remaining_weight_g = MAX(0, remaining_weight_g - ?) WHERE id = ?',
    grams,
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
