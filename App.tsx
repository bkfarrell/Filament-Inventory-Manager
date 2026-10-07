import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import AccountButton from './src/components/AccountButton';
import BarcodeScanner from './src/components/BarcodeScanner';
import InUseScreen from './src/components/InUseScreen';
import PrinterScreen from './src/components/PrinterScreen';
import ReportsScreen from './src/components/ReportsScreen';
import SlotPicker from './src/components/SlotPicker';
import SpoolForm from './src/components/SpoolForm';
import SpoolHistory from './src/components/SpoolHistory';
import StockScreen from './src/components/StockScreen';
import {
  costPerGram,
  isLowStock,
  justWentLow,
  normalizeBarcode,
  type NewSpool,
  type PrintJob,
  type Product,
  type Spool,
} from './src/db';
import { showDialog } from './src/dialogs';
import { trayLocationKey, formatLocation, slotOptions } from './src/locations';
import { notifyLowStock, setupNotifications } from './src/notifications';
import { printSnapshot } from './src/printerParse';
import { useStore } from './src/store';
import { useTabSwipe } from './src/useTabSwipe';
import StoreProvider from './src/StoreProvider';
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
      {/* Where data lives: the phone's own database, or (on the web) your server. */}
      <StoreProvider>
        <InventoryScreen />
      </StoreProvider>
      {/* "auto" makes the clock and battery icons dark in light mode and light in dark mode. */}
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

function InventoryScreen() {
  const styles = useStyles();
  const store = useStore();
  const [spools, setSpools] = useState<Spool[]>([]); // spools you still have
  const [allSpools, setAllSpools] = useState<Spool[]>([]); // every purchase, for reports
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]); // prints counted automatically
  const spoolsRef = useRef(spools); // latest list, for comparing before/after a print
  useEffect(() => {
    spoolsRef.current = spools;
  }, [spools]);
  // In Use = opened spools, Stock = sealed spools, Printer = live AMS, Reports = spending.
  const [tab, setTab] = useState<Tab>('inUse');
  const swipe = useTabSwipe(TABS, tab, setTab);
  const [screen, setScreen] = useState<Screen>(null);

  // Live printer reading, used on In Use and in the slot picker. Settings are re-read when
  // the tab changes, so connecting in the Printer tab takes effect here too.
  const [printerSettings] = useSavedSettings(tab);
  // Read the printer on every tab (so finished prints are counted while the app is open),
  // except Printer, which reads it itself.
  const watchPrinter = tab !== 'printer' || screen?.kind === 'pickSlot';
  const printer = usePrinterData(watchPrinter ? (printerSettings ?? null) : null);

  const refresh = useCallback(async () => {
    setSpools(await store.listSpools());
    setAllSpools(await store.listAllSpools());
    setPrintJobs(await store.listPrintJobs(5));
  }, [store]);

  // Each printer reading: if a print just ended, subtract its filament from the spools in the
  // slots it used (the store makes sure each print only counts once).
  useEffect(() => {
    if (!printer.data) return;
    let cancelled = false;
    store.syncPrintUsage(printSnapshot(printer.data.printer)).then(async (job) => {
      if (cancelled || !job) return;
      const before = spoolsRef.current;
      await refresh();
      const after = await store.listSpools();
      for (const e of job.entries) {
        const b = before.find((s) => s.id === e.spoolId);
        const a = after.find((s) => s.id === e.spoolId);
        if (b && a && justWentLow(b, a)) await notifyLowStock(a);
      }
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [printer.data, store, refresh]);

  function handleUndoPrint(job: PrintJob) {
    const grams = job.entries.reduce((sum, e) => sum + (e.spoolId !== null ? e.grams : 0), 0);
    showDialog(
      'Undo this print?',
      `Puts ${Math.round(grams * 10) / 10} g back on the spools “${job.taskName}” used.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          onPress: async () => {
            await store.undoPrintJob(job.jobKey);
            await refresh();
          },
        },
      ]
    );
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // Ask for notification permission once, when the app first opens.
    setupNotifications().catch((e) => console.warn('Notifications unavailable', e));
  }, []);

  // Reloads the list, then sends a notification if `before` just became low.
  async function refreshAndCheckLow(before: Spool) {
    const updated = await store.listSpools();
    setSpools(updated);
    setAllSpools(await store.listAllSpools());

    const after = updated.find((s) => s.id === before.id);
    if (after && justWentLow(before, after)) {
      await notifyLowStock(after);
    }
  }

  async function handleScanned(raw: string) {
    const barcode = normalizeBarcode(raw);
    const product = await store.findProduct(barcode);
    setScreen({ kind: 'add', barcode, product });
  }

  async function handleSave(values: NewSpool) {
    const current = screen;
    setScreen(null);
    if (current?.kind === 'edit') {
      await store.updateSpool(current.spool.id, values);
      await refreshAndCheckLow(current.spool);
    } else {
      await store.addSpool(values);
      await refresh();
    }
    // Show the tab the spool now lives in: sealed spools go to Stock, opened ones to In Use.
    setTab(values.openedAt ? 'inUse' : 'stock');
    // Remember (or update) what this barcode means for the next scan.
    if (values.barcode) {
      await store.rememberProduct(values.barcode, values);
    }
  }

  // Opening a sealed spool from Stock: ask which AMS slot it's going into.
  function handleOpen(spool: Spool) {
    setScreen({ kind: 'pickSlot', spool, allowSkip: true });
  }

  async function handlePickSlot(spool: Spool, location: string | null) {
    setScreen(null);
    if (location) await store.loadSpool(spool.id, location);
    else await store.openSpool(spool.id);
    await refresh();
    setTab('inUse');
  }

  // Taking a spool out of the AMS. With filament left it becomes Available; if it looks
  // empty, offer to mark it used up instead.
  function handleRemove(spool: Spool) {
    const tray = printer.data?.trays.find((t) => trayLocationKey(t) === spool.location);
    const looksEmpty = spool.remainingWeightG <= 0 || tray?.remainPct === 0;
    const remove = async () => {
      await store.unloadSpool(spool.id);
      await refresh();
    };
    if (!looksEmpty) {
      remove();
      return;
    }
    showDialog(
      'Is it used up?',
      `${spool.brand} ${spool.material} – ${spool.color} looks empty.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Keep as available', onPress: remove },
        {
          text: 'Used up',
          onPress: async () => {
            await store.markFinished(spool.id);
            await refresh();
          },
        },
      ]
    );
  }

  async function handleUse(spool: Spool, grams: number) {
    await store.recordUsage(spool.id, grams);
    await refreshAndCheckLow(spool);
  }

  function handleFinish(spool: Spool) {
    showDialog(
      'Mark as used up?',
      `${spool.brand} ${spool.material} – ${spool.color} will leave your inventory but stay in purchase history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Used up',
          onPress: async () => {
            setScreen(null);
            await store.markFinished(spool.id);
            await refresh();
          },
        },
      ]
    );
  }

  function handleDelete(spool: Spool) {
    showDialog(
      'Delete spool?',
      `${spool.brand} ${spool.material} – ${spool.color}\n\nThis also removes it from purchase history. If you finished the spool, use "Mark as used up" instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setScreen(null);
            await store.deleteSpool(spool.id);
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
        <View style={styles.titleRow}>
          <Text style={styles.title}>Track My Filament</Text>
          <AccountButton />
        </View>
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

      <View style={styles.swipeArea}>
        <Animated.View {...swipe}>
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
              printJobs={printJobs}
              onUndoPrint={handleUndoPrint}
            />
          ) : null}
        </Animated.View>
      </View>

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

// Tab order, left to right; swiping left moves to the next one.
const TABS = ['inUse', 'stock', 'printer', 'reports'] as const;
type Tab = (typeof TABS)[number];

function TabButton(props: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={props.onPress} style={[styles.tab, props.active && styles.tabActive]}>
      <Text style={[styles.tabText, props.active && styles.tabTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

const useStyles = themedStyles((c) => ({
  screen: {
    flex: 1,
    backgroundColor: c.background,
    // In a desktop browser, keep the layout phone-width-ish and centered instead of stretched.
    ...(Platform.OS === 'web' ? { width: '100%', maxWidth: 760, alignSelf: 'center' } : null),
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  swipeArea: { flex: 1, overflow: 'hidden' },
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
