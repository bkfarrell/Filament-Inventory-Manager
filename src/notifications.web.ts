import type { Spool } from './db';

// Web version: low-stock phone notifications don't apply in a browser; spools still
// show their LOW badge. These match the phone version's functions so screens can call
// them on either platform.

export async function setupNotifications(): Promise<boolean> {
  return false;
}

export async function notifyLowStock(_spool: Spool) {}
