import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import BarcodeScanner from './src/components/BarcodeScanner';
import ReportsScreen from './src/components/ReportsScreen';
import SpoolCard from './src/components/SpoolCard';
import SpoolForm from './src/components/SpoolForm';
import {
  addSpool,
  costPerGram,
  deleteSpool,
  findProduct,
  isLowStock,
  listAllSpools,
  listSpools,
  markFinished,
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
  const [spools, setSpools] = useState<Spool[]>([]); // spools you still have
  const [allSpools, setAllSpools] = useState<Spool[]>([]); // every purchase, for reports
  const [tab, setTab] = useState<'inventory' | 'reports'>('inventory');
  const [screen, setScreen] = useState<Screen>(null);

  const refresh = useCallback(async () => {
    setSpools(await listSpools(db));
    setAllSpools(await listAllSpools(db));
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
    setAllSpools(await listAllSpools(db));

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

  function handleFinish(spool: Spool) {
    Alert.alert(
      'Mark as used up?',
      `${spool.brand} ${spool.material} – ${spool.color} will leave your inventory but stay in purchase history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Used up',
          onPress: async () => {
            setScreen(null);
            await markFinished(db, spool.id);
            await refresh();
          },
        },
      ]
    );
  }

  function handleDelete(spool: Spool) {
    Alert.alert(
      'Delete spool?',
      `${spool.brand} ${spool.material} – ${spool.color}\n\nThis also removes it from purchase history. If you finished the spool, use "Mark as used up" instead.`,
      [
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
      ]
    );
  }

  // What the filament you still have is worth, based on what you paid per gram.
  const stockValue = spools.reduce((sum, s) => sum + costPerGram(s) * s.remainingWeightG, 0);
  const lowCount = spools.filter(isLowStock).length;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Filament</Text>
        <View style={styles.tabs}>
          <TabButton
            label="Inventory"
            active={tab === 'inventory'}
            onPress={() => setTab('inventory')}
          />
          <TabButton label="Reports" active={tab === 'reports'} onPress={() => setTab('reports')} />
        </View>
        {tab === 'inventory' ? (
          <Text style={styles.summary}>
            {spools.length} spools on hand · {stockValue.toFixed(2)} worth
            {lowCount > 0 ? ` · ${lowCount} low` : ''}
          </Text>
        ) : null}
      </View>

      {tab === 'reports' ? <ReportsScreen spools={allSpools} /> : null}

      {tab === 'inventory' ? (
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
            <Text style={styles.empty}>
              No spools yet. Tap “Scan box” or “Add spool” to log your first one.
            </Text>
          }
        />
      ) : null}

      {tab === 'inventory' ? (
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.actionButton, styles.scanButton]}
            onPress={() => setScreen({ kind: 'scan' })}
          >
            <Text style={styles.actionText}>Scan box</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => setScreen({ kind: 'add' })}>
            <Text style={styles.actionText}>+ Add spool</Text>
          </Pressable>
        </View>
      ) : null}

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
              onFinish={screen.kind === 'edit' ? () => handleFinish(screen.spool) : undefined}
            />
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

function TabButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.tab, props.active && styles.tabActive]}>
      <Text style={[styles.tabText, props.active && styles.tabTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f6f6' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 30, fontWeight: '700' },
  summary: { fontSize: 15, color: '#555', marginTop: 10 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e8',
    borderRadius: 10,
    padding: 3,
    marginTop: 8,
  },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 15, color: '#555' },
  tabTextActive: { color: '#111', fontWeight: '600' },
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
