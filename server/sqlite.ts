/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

// Opens a SQLite file with Node's built-in SQLite and wraps it in the small part of the
// expo-sqlite API the app's database code (src/db.ts) uses. That way the server runs
// exactly the same queries, migrations and history logging as the phone.
//
// node:sqlite is synchronous, so each operation (even one with several steps inside a
// transaction) finishes before the server handles the next request.
export function openDatabase(file: string): SQLiteDatabase {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON');

  // expo-sqlite accepts params as separate arguments or as one array.
  const params = (args: unknown[]): SQLInputValue[] => {
    const list = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
    return list.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)) as SQLInputValue[];
  };

  const db = {
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const r = raw.prepare(sql).run(...params(args));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync(sql: string, ...args: unknown[]) {
      return raw.prepare(sql).get(...params(args)) ?? null;
    },
    async getAllAsync(sql: string, ...args: unknown[]) {
      return raw.prepare(sql).all(...params(args));
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    async closeAsync() {
      raw.close();
    },
  };
  return db as unknown as SQLiteDatabase;
}
