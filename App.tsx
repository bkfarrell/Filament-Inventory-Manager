import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import BarcodeScanner from './src/components/BarcodeScanner';
import SpoolCard from './src/components/SpoolCard';
import SpoolForm from './src/components/SpoolForm';
import {
  addSpool,
  deleteSpool,
  findProduct,
  isLowStock,
  listSpools,
  migrateDb,
  normalizeBarcode,
  recordUsage,
  rememberProduct,
  updateSpool,
  type NewSpool,
  type Product,
  type Spool,
} from './src/db';
import { justWentLow, notifyLowStock, setupNotifications } from './src/notifications';

// What's open on top of the list right now.
type Screen =
  | null
  | { kind: 'scan' }
  | { kind: 'add'; barcode?: string; product?: Product | null }
  | { kind: 'edit'; spool: Spool };

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Opens (or creates) filament.db on the phone and sets up the tables. */}
      <SQLiteProvider databaseName="filament.db" onInit={migrateDb}>
        <InventoryScreen />
      </SQLiteProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

function InventoryScreen() {
  const db = useSQLiteContext();
  const [spools, setSpools] = useState<Spool[]>([]);
  const [screen, setScreen] = useState<Screen>(null);

  const refresh = useCallback(async () => {
    setSpools(await listSpools(db));
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // Ask for notification permission once, when the app first opens.
    setupNotifications().catch((e) => console.warn('Notifications unavailable', e));
  }, []);

  // Reloads the list, then sends a notification if `before` just became low.
  async function refreshAndCheckLow(before: Spool) {
    const updated = await listSpools(db);
    setSpools(updated);

    const after = updated.find((s) => s.id === before.id);
    if (after && justWentLow(before, after)) {
      await notifyLowStock(after);
    }
  }

  async function handleScanned(raw: string) {
    const barcode = normalizeBarcode(raw);
    const product = await findProduct(db, barcode);
    setScreen({ kind: 'add', barcode, product });
  }

  async function handleSave(values: NewSpool) {
    const current = screen;
    setScreen(null);
    if (current?.kind === 'edit') {
      await updateSpool(db, current.spool.id, values);
      await refreshAndCheckLow(current.spool);
    } else {
      await addSpool(db, values);
      await refresh();
    }
    // Remember (or update) what this barcode means for the next scan.
    if (values.barcode) {
      await rememberProduct(db, values.barcode, values);
    }
  }

  async function handleUse(spool: Spool, grams: number) {
    await recordUsage(db, spool.id, grams);
    await refreshAndCheckLow(spool);
  }

  function handleDelete(spool: Spool) {
    Alert.alert('Delete spool?', `${spool.brand} ${spool.material} – ${spool.color}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setScreen(null);
          await deleteSpool(db, spool.id);
          await refresh();
        },
      },
    ]);
  }

  const totalSpent = spools.reduce((sum, s) => sum + s.pricePaid, 0);
  const lowCount = spools.filter(isLowStock).length;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Filament</Text>
        <Text style={styles.summary}>
          {spools.length} spools · {totalSpent.toFixed(2)} spent
          {lowCount > 0 ? ` · ${lowCount} low` : ''}
        </Text>
      </View>

      <FlatList
        data={spools}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SpoolCard
            spool={item}
            onUse={(g) => handleUse(item, g)}
            onEdit={() => setScreen({ kind: 'edit', spool: item })}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No spools yet. Tap “Scan box” or “Add spool” to log your first one.</Text>
        }
      />

      <View style={styles.buttonRow}>
        <Pressable style={[styles.actionButton, styles.scanButton]} onPress={() => setScreen({ kind: 'scan' })}>
          <Text style={styles.actionText}>Scan box</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => setScreen({ kind: 'add' })}>
          <Text style={styles.actionText}>+ Add spool</Text>
        </Pressable>
      </View>

      <Modal visible={screen !== null} animationType="slide" onRequestClose={() => setScreen(null)}>
        {screen?.kind === 'scan' ? (
          <BarcodeScanner onScanned={handleScanned} onCancel={() => setScreen(null)} />
        ) : screen !== null ? (
          <SafeAreaView style={{ flex: 1 }}>
            <SpoolForm
              // A new key resets the form's fields each time it opens.
              key={screen.kind === 'edit' ? screen.spool.id : `add-${screen.barcode ?? ''}`}
              spool={screen.kind === 'edit' ? screen.spool : undefined}
              barcode={screen.kind === 'add' ? screen.barcode : undefined}
              product={screen.kind === 'add' ? screen.product : undefined}
              onSave={handleSave}
              onCancel={() => setScreen(null)}
              onDelete={screen.kind === 'edit' ? () => handleDelete(screen.spool) : undefined}
            />
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f6f6' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 30, fontWeight: '700' },
  summary: { fontSize: 15, color: '#555', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 12 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 16 },
  buttonRow: {
    position: 'absolute',
    right: 20,
    bottom: 36,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    backgroundColor: '#2d6cdf',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
  },
  scanButton: { backgroundColor: '#1e8a5a' },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
