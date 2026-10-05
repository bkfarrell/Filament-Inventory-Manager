import type { SQLiteDatabase } from 'expo-sqlite';
import { createContext, useContext } from 'react';

import {
  addSpool,
  deleteSpool,
  findProduct,
  listAllSpools,
  listEvents,
  listSpools,
  loadSpool,
  markFinished,
  openSpool,
  recordUsage,
  rememberProduct,
  unloadSpool,
  updateSpool,
} from './db';
import type { StoreMethod } from './storeMethods';

// The data operations, by name. The server uses this same table (see server/index.ts),
// so the phone and the web run exactly the same code.
export const storeFunctions = {
  listSpools,
  listAllSpools,
  addSpool,
  updateSpool,
  deleteSpool,
  recordUsage,
  openSpool,
  loadSpool,
  unloadSpool,
  markFinished,
  listEvents,
  findProduct,
  rememberProduct,
} satisfies Record<StoreMethod, (db: SQLiteDatabase, ...args: never[]) => unknown>;

// Everything the screens need to read and change data, without caring where it lives.
// Each method is the matching function in db.ts, minus its first (database) argument.
type DropFirst<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Rest : never;
type Fns = typeof storeFunctions;
export type Store = {
  [K in StoreMethod]: (...args: DropFirst<Parameters<Fns[K]>>) => ReturnType<Fns[K]>;
};

// The phone's version: runs each operation on the on-device SQLite database.
export function createSqliteStore(database: SQLiteDatabase): Store {
  const entries = Object.entries(storeFunctions).map(([name, fn]) => [
    name,
    (...args: unknown[]) => (fn as (db: SQLiteDatabase, ...a: unknown[]) => unknown)(database, ...args),
  ]);
  return Object.fromEntries(entries) as Store;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside a StoreProvider');
  return store;
}
