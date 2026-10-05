import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useMemo, type ReactNode } from 'react';

import { migrateDb } from './db';
import { createSqliteStore, StoreContext } from './store';

// Phone version: data lives in filament.db on the device.
// (The web version, StoreProvider.web.tsx, signs in and uses the server instead.)
export default function StoreProvider({ children }: { children: ReactNode }) {
  return (
    // Opens (or creates) filament.db on the phone and sets up the tables.
    <SQLiteProvider databaseName="filament.db" onInit={migrateDb}>
      <SqliteStore>{children}</SqliteStore>
    </SQLiteProvider>
  );
}

function SqliteStore({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const store = useMemo(() => createSqliteStore(db), [db]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
