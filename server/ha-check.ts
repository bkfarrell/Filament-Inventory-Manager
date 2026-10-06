/// <reference types="node" />
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { looksLikeTray, parsePrinterData, shareableAttributes, type HaEntity } from '../src/printerParse.ts';

// Checks the connection to Home Assistant and shows what Track My Filament recognizes from
// your Bambu Lab printer: its status and every AMS slot. It also saves ha-report.txt with
// the printer's raw entities (never your token), which helps adjust the app if anything is
// missing or wrong.
//
//   npm run ha:check
//
// You can skip the questions with HA_URL and HA_TOKEN environment variables.

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Don't echo the token to the screen.
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => {
      if (s.includes(question)) out.output.write(s);
    };
  }
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      done(answer.trim());
    })
  );
}

async function main() {
  let url = process.env.HA_URL || (await ask('Home Assistant address (e.g. http://192.168.10.5:8123): '));
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '');
  const token = process.env.HA_TOKEN || (await ask('Long-lived access token (hidden): ', true));

  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

  // 1. Can we reach Home Assistant, and is the token accepted?
  console.log(`\n1. Connecting to ${url} ...`);
  try {
    const res = await call('/api/');
    if (res.status === 401) return fail('Home Assistant rejected the token. Create a new long-lived token and try again.');
    if (!res.ok) return fail(`Home Assistant returned an error (${res.status}).`);
  } catch (e) {
    return fail(
      `Couldn't reach Home Assistant (${(e as Error).message}). Check the address and port (usually :8123), and that this computer can reach it.`
    );
  }
  console.log('   OK: connected and the token works.');

  // 2. Which entities belong to the Bambu Lab integration?
  console.log("2. Asking Home Assistant for the Bambu Lab integration's entities ...");
  let ids: string[] | null = null;
  try {
    const res = await call('/api/template', {
      method: 'POST',
      body: JSON.stringify({ template: "{{ integration_entities('bambu_lab') | tojson }}" }),
    });
    const parsed = res.ok ? JSON.parse(await res.text()) : null;
    if (Array.isArray(parsed) && parsed.length > 0) ids = parsed as string[];
    console.log(
      ids
        ? `   OK: found ${ids.length} entities from the Bambu Lab integration.`
        : res.ok
          ? '   Found none. Is the Bambu Lab integration (HACS) installed and set up?'
          : `   Couldn't ask (error ${res.status}); the token may not be an admin token. Falling back to matching by name.`
    );
  } catch {
    console.log('   Couldn\'t ask; falling back to matching entities by name.');
  }

  // 3. Read every entity's current state.
  const res = await call('/api/states');
  const all = (await res.json()) as HaEntity[];
  const entities = ids
    ? all.filter((e) => ids.includes(e.entity_id))
    : all.filter(
        (e) => looksLikeTray(e) || /_print_status$/.test(e.entity_id) || /bambu|ams/i.test(e.entity_id)
      );
  const data = parsePrinterData(entities);

  // 4. What the app recognizes.
  const lines: string[] = [];
  const out = (s = '') => {
    console.log(s);
    lines.push(s);
  };
  out('\n=== What Track My Filament sees ===');
  if (data.printer) {
    const p = data.printer;
    out(`Printer: ${p.name} — ${p.status}${p.taskName ? ` — job "${p.taskName}"` : ''}${p.progressPct !== null ? ` — ${p.progressPct}%` : ''}${p.remaining ? ` — ${p.remaining} left` : ''}`);
  } else {
    out('Printer status: NOT FOUND (no entity ending in "_print_status").');
  }
  if (data.trays.length === 0) {
    out('AMS slots: NONE RECOGNIZED.');
  } else {
    out(`AMS slots recognized: ${data.trays.length}`);
    for (const t of data.trays) {
      const what = t.empty ? 'Empty' : `${t.name || '?'} [${t.type || '?'}]`;
      const extra = [
        t.colorHex ?? 'no color',
        t.remainPct !== null ? `${t.remainPct}% left` : 'amount unknown',
        t.spoolWeightG ? `${t.spoolWeightG} g spool` : '',
        t.tagUid ? 'RFID' : '',
        t.active ? 'ACTIVE' : '',
      ]
        .filter(Boolean)
        .join(', ');
      out(`  ${t.label.padEnd(26)} ${what} (${extra})   ← ${t.entityId}`);
    }
  }

  // 5. Save the raw entities for troubleshooting (no token included).
  lines.push('', `=== Raw entities (${entities.length}) ===`);
  for (const e of entities) {
    lines.push(`${e.entity_id} = ${e.state}`, `  ${JSON.stringify(shareableAttributes(e.attributes))}`);
  }
  writeFileSync('ha-report.txt', lines.join('\n') + '\n');
  console.log(`\nSaved ha-report.txt (${entities.length} entities, no token). Share it if anything above looks wrong.`);
}

function fail(message: string) {
  console.error(`   PROBLEM: ${message}`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exitCode = 1;
});
