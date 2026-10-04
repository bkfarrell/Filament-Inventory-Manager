import * as SecureStore from 'expo-secure-store';

// Reads your Bambu Lab printer through Home Assistant, using the Bambu Lab
// integration (HACS, domain "bambu_lab") that's already connected to the printer.
//
// Entity names vary by printer model and integration version, so instead of
// hard-coding them, the app asks Home Assistant for every entity the integration
// created and recognizes the printer status and AMS slots by their names and
// attributes.

export type HaSettings = {
  url: string; // e.g. http://192.168.10.5:8123
  token: string; // long-lived access token from your Home Assistant profile
};

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

const SETTINGS_KEY = 'homeAssistant';
const TIMEOUT_MS = 10_000;

// ---- Settings (kept in the phone's secure storage, not the regular database) ----

export async function loadSettings(): Promise<HaSettings | null> {
  const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
  return raw ? (JSON.parse(raw) as HaSettings) : null;
}

export async function saveSettings(s: HaSettings) {
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(s));
}

export async function clearSettings() {
  await SecureStore.deleteItemAsync(SETTINGS_KEY);
}

// Tidies what was typed: adds http:// if missing and removes a trailing slash.
export function normalizeUrl(url: string) {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '');
}

// ---- Talking to Home Assistant ----

async function haFetch(s: HaSettings, path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${s.url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 401) throw new Error('Home Assistant rejected the token. Check it in Settings.');
    if (!res.ok) throw new Error(`Home Assistant returned an error (${res.status}).`);
    return res;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        "Couldn't reach Home Assistant. Check the address, and that you're on your home network or Tailscale."
      );
    }
    if (e instanceof TypeError) {
      throw new Error(
        "Couldn't connect to Home Assistant. Check the address (including :8123), and that you're on your home network or Tailscale."
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Checks the address and token work. Throws a readable error if not.
export async function testConnection(s: HaSettings) {
  await haFetch(s, '/api/');
}

// Asks Home Assistant which entities belong to the Bambu Lab integration.
// Returns null if that isn't possible (e.g. the token can't render templates).
async function bambuEntityIds(s: HaSettings): Promise<Set<string> | null> {
  try {
    const res = await haFetch(s, '/api/template', {
      method: 'POST',
      body: JSON.stringify({ template: "{{ integration_entities('bambu_lab') | tojson }}" }),
    });
    const ids = JSON.parse(await res.text());
    return Array.isArray(ids) && ids.length > 0 ? new Set(ids as string[]) : null;
  } catch {
    return null;
  }
}

export async function fetchPrinter(s: HaSettings): Promise<PrinterData> {
  const [ids, statesRes] = await Promise.all([
    bambuEntityIds(s),
    haFetch(s, '/api/states'),
  ]);
  const all = (await statesRes.json()) as HaEntity[];
  // Without the integration's list, fall back to recognizing entities by name.
  const entities = ids
    ? all.filter((e) => ids.has(e.entity_id))
    : all.filter((e) => looksLikeTray(e) || /_print_status$/.test(e.entity_id));
  return parsePrinterData(entities);
}

// ---- Making sense of the entities ----

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

function looksLikeTray(e: HaEntity) {
  const id = e.entity_id;
  if (!id.startsWith('sensor.')) return false;
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
  const external = /external_spool/.test(e.entity_id);

  const type = str(a.type);
  const name = str(a.name) || (isUnknown(e.state) ? '' : e.state);
  const remain = num(a.remain);
  const empty = a.empty === true || /^empty$/i.test(e.state);

  let label: string;
  if (ams !== null) label = `AMS ${ams} · Slot ${slot}`;
  else if (external) label = externalLabel(e.entity_id);
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
function externalLabel(entityId: string) {
  const n = entityId.match(/external_spool_?(\d+)/);
  if (n) return `External spool ${n[1]}`;
  if (/left/.test(entityId)) return 'External spool (left)';
  if (/right/.test(entityId)) return 'External spool (right)';
  return 'External spool';
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

  return {
    name: friendly || prefix.replace(/^sensor\./, ''),
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
