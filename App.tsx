import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import SpoolCard from './src/components/SpoolCard';
import SpoolForm from './src/components/SpoolForm';
import {
  addSpool,
  deleteSpool,
  isLowStock,
  listSpools,
  migrateDb,
  recordUsage,
  updateSpool,
  type NewSpool,
  type Spool,
} from './src/db';
import { justWentLow, notifyLowStock, setupNotifications } from './src/notifications';

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
  // Which form is open: none, "add a new spool", or "edit this spool".
  const [form, setForm] = useState<null | 'add' | Spool>(null);

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

  async function handleSave(values: NewSpool) {
    const editing = form !== 'add' ? form : null;
    setForm(null);
    if (editing) {
      await updateSpool(db, editing.id, values);
      await refreshAndCheckLow(editing);
    } else {
      await addSpool(db, values);
      await refresh();
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
          setForm(null);
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
            onEdit={() => setForm(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No spools yet. Tap “Add spool” to log your first one.</Text>
        }
      />

      <Pressable style={styles.addButton} onPress={() => setForm('add')}>
        <Text style={styles.addText}>+ Add spool</Text>
      </Pressable>

      <Modal visible={form !== null} animationType="slide" onRequestClose={() => setForm(null)}>
        <SafeAreaView style={{ flex: 1 }}>
          {form !== null ? (
            <SpoolForm
              // A new key resets the form's fields each time it opens.
              key={form === 'add' ? 'add' : form.id}
              spool={form === 'add' ? undefined : form}
              onSave={handleSave}
              onCancel={() => setForm(null)}
              onDelete={form === 'add' ? undefined : () => handleDelete(form)}
            />
          ) : null}
        </SafeAreaView>
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
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 36,
    backgroundColor: '#2d6cdf',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
  },
  addText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
