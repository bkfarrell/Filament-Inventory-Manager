import { ScrollView, Text, View } from 'react-native';

import type { PrintJob, Spool } from '../db';
import type { PrinterData, Tray } from '../homeAssistant';
import { compareLocations, trayLocationKey } from '../locations';
import { themedStyles } from '../theme';
import RecentPrints from './RecentPrints';
import SpoolCard from './SpoolCard';

type Props = {
  inAms: Spool[]; // opened spools loaded in an AMS slot
  available: Spool[]; // opened spools not loaded anywhere
  hasSealed: boolean; // whether Stock has anything to open
  printer: PrinterData | null; // live printer reading, if connected
  printerConnected: boolean;
  printerError: string;
  onUse: (spool: Spool, grams: number) => void;
  onEdit: (spool: Spool) => void;
  onDelete: (spool: Spool) => void;
  onLoad: (spool: Spool) => void;
  onRemove: (spool: Spool) => void;
  printJobs: PrintJob[]; // prints counted automatically, newest first
  onUndoPrint: (job: PrintJob) => void;
};

export default function InUseScreen(props: Props) {
  const styles = useStyles();

  // Live printer reading for each slot, keyed like a spool's location ("ams-1-2").
  const trayAt = new Map<string, Tray>();
  for (const t of props.printer?.trays ?? []) {
    const key = trayLocationKey(t);
    if (key) trayAt.set(key, t);
  }

  const loaded = [...props.inAms].sort((a, b) => compareLocations(a.location!, b.location!));

  const card = (s: Spool, inAms: boolean) => (
    <SpoolCard
      key={s.id}
      spool={s}
      tray={inAms && s.location ? (trayAt.get(s.location) ?? null) : null}
      onUse={(g) => props.onUse(s, g)}
      onEdit={() => props.onEdit(s)}
      onDelete={() => props.onDelete(s)}
      onLoad={() => props.onLoad(s)}
      onRemove={inAms ? () => props.onRemove(s) : undefined}
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <RecentPrints jobs={props.printJobs} onUndo={props.onUndoPrint} />
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>In the AMS</Text>
        <Text style={styles.count}>{loaded.length}</Text>
      </View>
      {props.printerError ? <Text style={styles.error}>{props.printerError}</Text> : null}
      {loaded.length === 0 ? (
        <Text style={styles.muted}>
          No spools are assigned to an AMS slot yet. Open one from Stock, or use “Load into AMS” on
          an available spool below.
        </Text>
      ) : null}
      {loaded.map((s) => card(s, true))}

      <View style={[styles.sectionHeader, styles.spaced]}>
        <Text style={styles.sectionTitle}>Available</Text>
        <Text style={styles.count}>{props.available.length}</Text>
      </View>
      <Text style={styles.muted}>Opened spools that aren&apos;t loaded right now.</Text>
      {props.available.length === 0 ? (
        <Text style={styles.muted}>
          {props.inAms.length === 0 && !props.hasSealed
            ? 'No spools yet. Tap “Scan box” or “Add spool” to log your first one.'
            : 'Nothing here. A spool you remove from the AMS that still has filament shows up here.'}
        </Text>
      ) : null}
      {props.available.map((s) => card(s, false))}

      {!props.printerConnected ? (
        <Text style={styles.footnote}>
          Connect your printer in the Printer tab to see each slot&apos;s live color and estimate.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const useStyles = themedStyles((c) => ({
  content: { paddingHorizontal: 16, paddingBottom: 110, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  spaced: { marginTop: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: c.text },
  count: { fontSize: 16, color: c.textMuted, fontWeight: '600' },
  muted: { fontSize: 13, color: c.textMuted },
  error: { fontSize: 13, color: c.danger },
  footnote: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 8 },
}));
