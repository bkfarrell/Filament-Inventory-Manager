import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import BarcodeScanner from './src/components/BarcodeScanner';
import InUseScreen from './src/components/InUseScreen';
import PrinterScreen from './src/components/PrinterScreen';
import ReportsScreen from './src/components/ReportsScreen';
import SlotPicker from './src/components/SlotPicker';
import SpoolForm from './src/components/SpoolForm';
import SpoolHistory from './src/components/SpoolHistory';
import StockScreen from './src/components/StockScreen';
import {
  addSpool,
  costPerGram,
  deleteSpool,
  findProduct,
  isLowStock,
  listAllSpools,
  listSpools,
  loadSpool,
  markFinished,
  migrateDb,
  normalizeBarcode,
  openSpool,
  recordUsage,
  rememberProduct,
  unloadSpool,
  updateSpool,
  type NewSpool,
  type Product,
  type Spool,
} from './src/db';
import { trayLocationKey, formatLocation, slotOptions } from './src/locations';
import { justWentLow, notifyLowStock, setupNotifications } from './src/notifications';
import { themedStyles, useTheme } from './src/theme';
import { usePrinterData, useSavedSettings } from './src/usePrinter';

// What's open on top of the list right now.
type Screen =
  | null
  | { kind: 'scan' }
  | { kind: 'add'; barcode?: string; product?: Product | null }
  | { kind: 'edit'; spool: Spool }
  // Choosing an AMS slot. allowSkip: opening from Stock, where "don't load it" is allowed.
  | { kind: 'pickSlot'; spool: Spool; allowSkip: boolean };

export default function App() {
  const { colors } = useTheme();

  useEffect(() => {
    // Colors the area behind the app (seen during screen transitions) to match the theme.
    SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors]);

  return (
    <SafeAreaProvider>
      {/* Opens (or creates) filament.db on the phone and sets up the tables. */}
      <SQLiteProvider databaseName="filament.db" onInit={migrateDb}>
        <InventoryScreen />
      </SQLiteProvider>
      {/* "auto" makes the clock and battery icons dark in light mode and light in dark mode. */}
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

function InventoryScreen() {
  const styles = useStyles();
  const db = useSQLiteContext();
  const [spools, setSpools] = useState<Spool[]>([]); // spools you still have
  const [allSpools, setAllSpools] = useState<Spool[]>([]); // every purchase, for reports
  // In Use = opened spools, Stock = sealed spools, Printer = live AMS, Reports = spending.
  const [tab, setTab] = useState<'inUse' | 'stock' | 'printer' | 'reports'>('inUse');
  const [screen, setScreen] = useState<Screen>(null);

  // Live printer reading, used on In Use and in the slot picker. Settings are re-read when
  // the tab changes, so connecting in the Printer tab takes effect here too.
  const [printerSettings] = useSavedSettings(tab);
  const watchPrinter = tab === 'inUse' || screen?.kind === 'pickSlot';
  const printer = usePrinterData(watchPrinter ? (printerSettings ?? null) : null);

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
    // Show the tab the spool now lives in: sealed spools go to Stock, opened ones to In Use.
    setTab(values.openedAt ? 'inUse' : 'stock');
    // Remember (or update) what this barcode means for the next scan.
    if (values.barcode) {
      await rememberProduct(db, values.barcode, values);
    }
  }

  // Opening a sealed spool from Stock: ask which AMS slot it's going into.
  function handleOpen(spool: Spool) {
    setScreen({ kind: 'pickSlot', spool, allowSkip: true });
  }

  async function handlePickSlot(spool: Spool, location: string | null) {
    setScreen(null);
    if (location) await loadSpool(db, spool.id, location);
    else await openSpool(db, spool.id);
    await refresh();
    setTab('inUse');
  }

  // Taking a spool out of the AMS. With filament left it becomes Available; if it looks
  // empty, offer to mark it used up instead.
  function handleRemove(spool: Spool) {
    const tray = printer.data?.trays.find((t) => trayLocationKey(t) === spool.location);
    const looksEmpty = spool.remainingWeightG <= 0 || tray?.remainPct === 0;
    const remove = async () => {
      await unloadSpool(db, spool.id);
      await refresh();
    };
    if (!looksEmpty) {
      remove();
      return;
    }
    Alert.alert(
      'Is it used up?',
      `${spool.brand} ${spool.material} – ${spool.color} looks empty.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Keep as available', onPress: remove },
        {
          text: 'Used up',
          onPress: async () => {
            await markFinished(db, spool.id);
            await refresh();
          },
        },
      ]
    );
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

  const inUse = spools.filter((s) => s.openedAt !== null);
  const inAms = inUse.filter((s) => s.location !== null);
  const available = inUse.filter((s) => s.location === null);
  const sealed = spools.filter((s) => s.openedAt === null);
  // What filament is worth, based on what you paid per gram.
  const valueOf = (list: Spool[]) =>
    list.reduce((sum, s) => sum + costPerGram(s) * s.remainingWeightG, 0);
  const lowCount = inUse.filter(isLowStock).length;
  const materialCount = new Set(sealed.map((s) => s.material)).size;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Track My Filament</Text>
        <View style={styles.tabs}>
          <TabButton label="In Use" active={tab === 'inUse'} onPress={() => setTab('inUse')} />
          <TabButton label="Stock" active={tab === 'stock'} onPress={() => setTab('stock')} />
          <TabButton label="Printer" active={tab === 'printer'} onPress={() => setTab('printer')} />
          <TabButton label="Reports" active={tab === 'reports'} onPress={() => setTab('reports')} />
        </View>
        {tab === 'inUse' ? (
          <Text style={styles.summary}>
            {inAms.length} in the AMS · {available.length} available ·{' '}
            {valueOf(inUse).toFixed(2)} worth left
            {lowCount > 0 ? ` · ${lowCount} low` : ''}
          </Text>
        ) : null}
        {tab === 'stock' ? (
          <Text style={styles.summary}>
            {sealed.length} sealed · {materialCount}{' '}
            {materialCount === 1 ? 'material' : 'materials'} · {valueOf(sealed).toFixed(2)} worth
          </Text>
        ) : null}
      </View>

      {tab === 'reports' ? <ReportsScreen spools={allSpools} /> : null}

      {tab === 'printer' ? <PrinterScreen /> : null}

      {tab === 'stock' ? (
        <StockScreen
          spools={sealed}
          onOpen={handleOpen}
          onEdit={(spool) => setScreen({ kind: 'edit', spool })}
        />
      ) : null}

      {tab === 'inUse' ? (
        <InUseScreen
          inAms={inAms}
          available={available}
          hasSealed={sealed.length > 0}
          printer={printer.data}
          printerConnected={!!printerSettings}
          printerError={printerSettings ? printer.error : ''}
          onUse={handleUse}
          onEdit={(spool) => setScreen({ kind: 'edit', spool })}
          onDelete={handleDelete}
          onLoad={(spool) => setScreen({ kind: 'pickSlot', spool, allowSkip: false })}
          onRemove={handleRemove}
        />
      ) : null}

      {tab === 'inUse' || tab === 'stock' ? (
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
        ) : screen?.kind === 'pickSlot' ? (
          <SafeAreaView style={styles.modal}>
            <SlotPicker
              spool={screen.spool}
              options={slotOptions(
                printer.data?.trays ?? null,
                inAms.map((s) => s.location!)
              )}
              occupants={new Map(inAms.map((s) => [s.location!, s]))}
              printerConnected={!!printer.data}
              allowSkip={screen.allowSkip}
              onPick={(location) => handlePickSlot(screen.spool, location)}
              onCancel={() => setScreen(null)}
            />
          </SafeAreaView>
        ) : screen !== null ? (
          <SafeAreaView style={styles.modal}>
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
              footer={
                screen.kind === 'edit' ? (
                  <>
                    {screen.spool.location ? (
                      <Text style={styles.locationNote}>
                        In {formatLocation(screen.spool.location)}
                      </Text>
                    ) : null}
                    <SpoolHistory spoolId={screen.spool.id} />
                  </>
                ) : undefined
              }
            />
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

function TabButton(props: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={props.onPress} style={[styles.tab, props.active && styles.tabActive]}>
      <Text style={[styles.tabText, props.active && styles.tabTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

const useStyles = themedStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  modal: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 30, fontWeight: '700', color: c.text },
  summary: { fontSize: 15, color: c.textSecondary, marginTop: 10 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: c.segment,
    borderRadius: 10,
    padding: 3,
    marginTop: 8,
  },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: c.segmentActive },
  tabText: { fontSize: 15, color: c.textSecondary },
  tabTextActive: { color: c.text, fontWeight: '600' },
  locationNote: { fontSize: 14, color: c.primary, fontWeight: '600', marginTop: 16 },
  buttonRow: {
    position: 'absolute',
    right: 20,
    bottom: 36,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    backgroundColor: c.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
  },
  scanButton: { backgroundColor: c.scan },
  actionText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
}));
