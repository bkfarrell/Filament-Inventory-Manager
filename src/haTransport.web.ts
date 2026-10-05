import type { HaSettings } from './homeAssistant';

// Web version: browsers can't call Home Assistant from another address, so the server
// makes the requests for you. Your Home Assistant token is stored on the server for
// your account and isn't sent back to the browser.

export async function loadSettings(): Promise<HaSettings | null> {
  const res = await fetch('/api/ha/settings', { credentials: 'same-origin' });
  if (!res.ok) return null;
  const body = (await res.json()) as { url: string } | null;
  return body ? { url: body.url, token: '' } : null; // token stays on the server
}

export async function saveSettings(s: HaSettings) {
  const res = await fetch('/api/ha/settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Saving failed.');
}

export async function clearSettings() {
  await fetch('/api/ha/settings', { method: 'DELETE', credentials: 'same-origin' });
}

// Asks the server to make the request. A token is only sent when testing a new
// connection; otherwise the server uses the one saved for your account.
export async function sendRequest(s: HaSettings, path: string, init: RequestInit): Promise<Response> {
  const res = await fetch('/api/ha/request', {
    method: 'POST',
    credentials: 'same-origin',
    signal: init.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? init.body : undefined,
      ...(s.token ? { url: s.url, token: s.token } : {}),
    }),
  });
  // The server marks its own errors (e.g. Home Assistant unreachable) so they aren't
  // mistaken for an error from Home Assistant itself.
  if (res.headers.get('X-TMF-Proxy-Error')) {
    throw new Error(((await res.json()) as { error?: string }).error ?? 'Request failed.');
  }
  return res;
}
