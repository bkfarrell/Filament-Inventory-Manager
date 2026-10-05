import { sendRequest } from './haTransport';
import { looksLikeTray, parsePrinterData, type HaEntity, type PrinterData } from './printerParse';

export { estimatedGrams, parsePrinterData } from './printerParse';
export type { HaEntity, PrinterData, PrinterStatus, Tray } from './printerParse';

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

const TIMEOUT_MS = 10_000;

// Where the Home Assistant address and token are kept, and how requests are sent,
// differs between the phone and the web version (see haTransport.ts / .web.ts).
export { clearSettings, loadSettings, saveSettings } from './haTransport';

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
    const res = await sendRequest(s, path, { ...init, signal: controller.signal });
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
