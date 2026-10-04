import type { Tray } from './homeAssistant';

// A spool's location is stored as a short key:
//   "ams-2-3"  → AMS 2, slot 3
//   "ext-1"    → external spool holder 1 ("ext-l" / "ext-r" for left/right holders)

export type SlotOption = {
  key: string;
  label: string; // "AMS 2 · Slot 3"
  group: string; // "AMS 2" or "External", for grouping in the picker
  tray: Tray | null; // what the printer reports in this slot right now, if connected
};

export function amsKey(ams: number, slot: number) {
  return `ams-${ams}-${slot}`;
}

export function formatLocation(key: string) {
  const ams = key.match(/^ams-(\d+)-(\d+)$/);
  if (ams) return `AMS ${ams[1]} · Slot ${ams[2]}`;
  if (key === 'ext-l') return 'External spool (left)';
  if (key === 'ext-r') return 'External spool (right)';
  const ext = key.match(/^ext-(\d+)$/);
  if (ext) return ext[1] === '1' ? 'External spool' : `External spool ${ext[1]}`;
  return key;
}

function groupOf(key: string) {
  const ams = key.match(/^ams-(\d+)-/);
  return ams ? `AMS ${ams[1]}` : 'External';
}

// AMS slots in order (AMS 1 slot 1, 1·2 … 2·1 …), external holders last.
export function compareLocations(a: string, b: string) {
  const rank = (k: string) => {
    const m = k.match(/^ams-(\d+)-(\d+)$/);
    return m ? Number(m[1]) * 100 + Number(m[2]) : 100_000;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

// The location key a printer slot corresponds to.
export function trayLocationKey(t: Tray): string | null {
  if (t.ams !== null && t.slot !== null) return amsKey(t.ams, t.slot);
  const id = t.entityId;
  if (!/external_spool/.test(id)) return null;
  if (/left/.test(id)) return 'ext-l';
  if (/right/.test(id)) return 'ext-r';
  const n = id.match(/external_spool_?(\d+)/);
  return `ext-${n ? n[1] : '1'}`;
}

// The slots to offer when choosing where a spool goes. Uses the printer's real slots when
// connected; otherwise AMS units 1–3 (or more, if spools are already in higher units)
// with 4 slots each, plus one external holder.
export function slotOptions(trays: Tray[] | null, usedKeys: string[]): SlotOption[] {
  const byKey = new Map<string, SlotOption>();

  for (const t of trays ?? []) {
    const key = trayLocationKey(t);
    if (key) byKey.set(key, { key, label: formatLocation(key), group: groupOf(key), tray: t });
  }

  if (byKey.size === 0) {
    const highestUsed = Math.max(
      3,
      ...usedKeys.map((k) => Number(k.match(/^ams-(\d+)-/)?.[1] ?? 0))
    );
    for (let ams = 1; ams <= highestUsed; ams++) {
      for (let slot = 1; slot <= 4; slot++) {
        const key = amsKey(ams, slot);
        byKey.set(key, { key, label: formatLocation(key), group: groupOf(key), tray: null });
      }
    }
    byKey.set('ext-1', { key: 'ext-1', label: formatLocation('ext-1'), group: 'External', tray: null });
  }

  // Keep any slot a spool is already assigned to, even if the printer doesn't list it.
  for (const key of usedKeys) {
    if (!byKey.has(key)) byKey.set(key, { key, label: formatLocation(key), group: groupOf(key), tray: null });
  }

  return [...byKey.values()].sort((a, b) => compareLocations(a.key, b.key));
}
