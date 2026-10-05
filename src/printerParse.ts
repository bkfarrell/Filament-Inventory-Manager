// Turning Home Assistant's entities for a Bambu Lab printer into printer status and AMS
// slots. Kept free of app imports so the server's diagnostic tool (server/ha-check.ts)
// uses exactly the same logic as the app.

export type HaEntity = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
};

export type Tray = {
  entityId: string;
  ams: number | null; // AMS unit number (1, 2, 3…); null for an external spool
  slot: number | null; // slot within the AMS (1–4)
  label: string; // "AMS 1 · Slot 2" or "External spool"
  name: string; // filament name, e.g. "Bambu PLA Basic"
  type: string; // material, e.g. "PLA"
  colorHex: string | null; // "#RRGGBB", or null if unknown
  remainPct: number | null; // estimated % left, or null if the printer doesn't know
  spoolWeightG: number | null; // full spool weight, when reported (Bambu spools)
  empty: boolean;
  active: boolean; // currently feeding the printer
  tagUid: string | null; // Bambu RFID tag, for Bambu spools
};

export type PrinterStatus = {
  name: string; // printer name from Home Assistant
  status: string; // friendly status, e.g. "Printing"
  rawStatus: string;
  progressPct: number | null;
  remaining: string | null; // e.g. "1 h 25 min"
  taskName: string | null;
  printWeightG: number | null; // estimated filament weight of the current job, if reported
};

export type PrinterData = {
  printer: PrinterStatus | null;
  trays: Tray[];
  entities: HaEntity[]; // everything found, for the "raw data" view
};

// Attributes that are temporary access links (camera / image proxies); left out of raw data
// that people share for troubleshooting.
const PRIVATE_ATTRIBUTES = new Set(['access_token', 'entity_picture', 'token']);

export function shareableAttributes(attributes: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(attributes).filter(([k]) => !PRIVATE_ATTRIBUTES.has(k))
  );
}

export function parsePrinterData(entities: HaEntity[]): PrinterData {
  const trays = entities
    .filter(looksLikeTray)
    .map(toTray)
    .sort(
      (a, b) =>
        (a.ams ?? Number.MAX_SAFE_INTEGER) - (b.ams ?? Number.MAX_SAFE_INTEGER) ||
        (a.slot ?? 0) - (b.slot ?? 0) ||
        a.entityId.localeCompare(b.entityId)
    );
  return { printer: toPrinterStatus(entities), trays, entities };
}

export function looksLikeTray(e: HaEntity) {
  const id = e.entity_id;
  if (!id.startsWith('sensor.')) return false;
  // "Active tray" repeats whichever slot is printing; it isn't a slot of its own.
  if (/_active_tray$/.test(id)) return false;
  return (
    /ams_\d+_tray_\d+/.test(id) ||
    /external_spool/.test(id) ||
    'tray_uuid' in e.attributes ||
    'tag_uid' in e.attributes
  );
}

function toTray(e: HaEntity): Tray {
  const a = e.attributes;
  const match = e.entity_id.match(/ams_(\d+)_tray_(\d+)/);
  const ams = match ? Number(match[1]) : null;
  const slot = match ? Number(match[2]) : null;
  const external = /external_?spool/.test(e.entity_id);

  const type = str(a.type);
  const name = str(a.name) || (isUnknown(e.state) ? '' : e.state);
  const remain = num(a.remain);
  const empty = a.empty === true || /^empty$/i.test(e.state);

  let label: string;
  if (ams !== null && slot !== null) label = slotLabel(ams, slot);
  else if (external) label = externalLabel(externalKey(e.entity_id));
  else label = str(a.friendly_name) || e.entity_id;

  const tag = str(a.tag_uid);
  return {
    entityId: e.entity_id,
    ams,
    slot,
    label,
    name,
    type,
    colorHex: toHex(a.color),
    remainPct: remain !== null && remain >= 0 ? Math.min(100, remain) : null,
    spoolWeightG: positive(num(a.tray_weight) ?? num(a.weight) ?? num(a.spool_weight)),
    empty,
    active: a.active === true,
    tagUid: tag && !/^0+$/.test(tag) ? tag : null,
  };
}

// Printers with two nozzles have more than one external spool holder.
// ---- Names for AMS units and slots (shared with src/locations.ts) ----

// Bambu numbers regular AMS units 1, 2, 3… and AMS HT units (one slot each) from 128.
export function amsName(unit: number) {
  if (unit >= 128) return unit === 128 ? 'AMS HT' : `AMS HT ${unit - 127}`;
  return `AMS ${unit}`;
}

// "AMS 2 · Slot 3", or just "AMS HT" for the single-slot AMS HT.
export function slotLabel(unit: number, slot: number) {
  return unit >= 128 ? amsName(unit) : `${amsName(unit)} · Slot ${slot}`;
}

// Which external spool holder an entity is: "1", "2", or "l" / "r" (left/right).
// Handles both "…_externalspool2_external_spool" and "…_external_spool_2" styles.
export function externalKey(entityId: string) {
  const m =
    entityId.match(/externalspool(\d+)/) ?? entityId.match(/external_spool_?(\d+)/);
  if (m) return m[1];
  if (/left/.test(entityId)) return 'l';
  if (/right/.test(entityId)) return 'r';
  return '1';
}

export function externalLabel(key: string) {
  if (key === 'l') return 'External spool (left)';
  if (key === 'r') return 'External spool (right)';
  return `External spool ${key}`;
}

const STATUS_NAMES: Record<string, string> = {
  running: 'Printing',
  printing: 'Printing',
  prepare: 'Preparing',
  pause: 'Paused',
  paused: 'Paused',
  finish: 'Finished',
  finished: 'Finished',
  failed: 'Failed',
  idle: 'Idle',
  offline: 'Offline',
  unavailable: 'Offline',
};

function toPrinterStatus(entities: HaEntity[]): PrinterStatus | null {
  const statusEntity = entities.find((e) => /_print_status$/.test(e.entity_id));
  if (!statusEntity) return null;
  const prefix = statusEntity.entity_id.replace(/_print_status$/, '');
  const find = (suffix: string) => entities.find((e) => e.entity_id === `${prefix}_${suffix}`);

  const raw = statusEntity.state;
  const progress = find('print_progress');
  const remaining = find('remaining_time');
  const task = find('task_name');
  const weight = find('print_weight');
  const friendly = str(statusEntity.attributes.friendly_name).replace(/\s*print status$/i, '');
  // Prefer the printer's own name ("H2C") over the device name with its serial number.
  const ownName = find('printer_name');

  return {
    name:
      (ownName && !isUnknown(ownName.state) ? ownName.state : '') ||
      friendly ||
      prefix.replace(/^sensor\./, ''),
    status: STATUS_NAMES[raw.toLowerCase()] ?? capitalize(raw.replace(/_/g, ' ')),
    rawStatus: raw,
    progressPct: progress ? num(progress.state) : null,
    remaining: remaining ? formatDuration(remaining) : null,
    taskName: task && !isUnknown(task.state) ? task.state : null,
    printWeightG: weight ? num(weight.state) : null,
  };
}

function formatDuration(e: HaEntity): string | null {
  const value = num(e.state);
  if (value === null) return null;
  const unit = str(e.attributes.unit_of_measurement);
  const minutes = unit === 'h' ? value * 60 : unit === 's' ? value / 60 : value;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// ---- Small helpers ----

function str(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function positive(n: number | null) {
  return n !== null && n > 0 ? n : null;
}

// Estimated grams left, when both the % and the full spool weight are known.
export function estimatedGrams(t: Tray): number | null {
  return t.remainPct !== null && t.spoolWeightG !== null
    ? Math.round((t.remainPct / 100) * t.spoolWeightG)
    : null;
}

function isUnknown(state: string) {
  return state === '' || state === 'unknown' || state === 'unavailable';
}

function capitalize(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Accepts "#RRGGBB", "RRGGBB" or "#RRGGBBAA"; returns "#RRGGBB" or null.
function toHex(v: unknown): string | null {
  const s = str(v).replace(/^#/, '');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return null;
  if (s.length === 8 && s.slice(6) === '00') return null; // fully transparent = no color set
  return `#${s.slice(0, 6).toUpperCase()}`;
}
