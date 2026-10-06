import * as SecureStore from 'expo-secure-store';

import type { HaSettings } from './homeAssistant';

// Phone version: the app talks to Home Assistant directly, and the address and token
// are kept in the phone's secure storage. (haTransport.web.ts goes through the server.)

const SETTINGS_KEY = 'homeAssistant';

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

export function sendRequest(s: HaSettings, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${s.url}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
  });
}
