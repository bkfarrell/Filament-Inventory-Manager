import { useEffect, useState } from 'react';

import { fetchPrinter, loadSettings, type HaSettings, type PrinterData } from './homeAssistant';

export const PRINTER_REFRESH_MS = 15_000; // how often to re-read the printer while a screen shows it

// Reads the printer through Home Assistant now and every PRINTER_REFRESH_MS while the
// calling screen is open. Pass null settings to do nothing (not connected).
export function usePrinterData(settings: HaSettings | null) {
  const [data, setData] = useState<PrinterData | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false); // pull-to-refresh spinner
  const [reloadKey, setReloadKey] = useState(0); // bumped to refresh right away

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    const tick = () =>
      fetchPrinter(settings).then(
        (next) => {
          if (cancelled) return;
          setData(next);
          setError('');
          setUpdatedAt(new Date());
          setRefreshing(false);
        },
        (e: unknown) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
          setRefreshing(false);
        }
      );
    tick();
    const timer = setInterval(tick, PRINTER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings, reloadKey]);

  function refreshNow() {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  }

  return { data, error, updatedAt, refreshing, refreshNow };
}

// The saved Home Assistant connection: undefined while loading, null if not connected.
// Changing `reloadKey` reads it again (e.g. after connecting in the Printer tab).
export function useSavedSettings(reloadKey?: unknown) {
  const [settings, setSettings] = useState<HaSettings | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => !cancelled && setSettings(null));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  return [settings, setSettings] as const;
}
