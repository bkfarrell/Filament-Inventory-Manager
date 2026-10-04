import { Text, View } from 'react-native';

import { themedStyles } from '../theme';
import { usePrinterData, useSavedSettings } from '../usePrinter';
import TrayRow from './TrayRow';

// The "In the AMS" part of the In Use tab: every loaded AMS slot (and external spool)
// with its slot, color, type and estimated amount left, read live from the printer.
export default function AmsSection() {
  const styles = useStyles();
  const [settings] = useSavedSettings();
  const { data, error, updatedAt } = usePrinterData(settings ?? null);

  if (settings === undefined) return null; // still loading the saved connection

  if (settings === null) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>In the AMS</Text>
        <Text style={styles.muted}>
          Connect your printer in the Printer tab to see what&apos;s loaded in each AMS slot here.
        </Text>
      </View>
    );
  }

  const loaded = data?.trays.filter((t) => !t.empty) ?? [];
  const emptyCount = (data?.trays.length ?? 0) - loaded.length;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>In the AMS</Text>
        {data ? (
          <Text style={styles.muted}>
            {loaded.length} loaded{emptyCount > 0 ? ` · ${emptyCount} empty` : ''}
          </Text>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error}>
          {data ? 'Showing the last reading. ' : ''}
          {error}
        </Text>
      ) : null}
      {!data && !error ? <Text style={styles.muted}>Reading the printer…</Text> : null}
      {data && loaded.length === 0 ? (
        <Text style={styles.muted}>No filament is loaded in the AMS right now.</Text>
      ) : null}

      {loaded.map((t, i) => (
        <TrayRow key={t.entityId} tray={t} first={i === 0} />
      ))}

      {updatedAt ? (
        <Text style={styles.footnote}>Live from the printer · updated {updatedAt.toLocaleTimeString()}</Text>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '600', color: c.text },
  muted: { fontSize: 13, color: c.textMuted },
  error: { fontSize: 13, color: c.danger },
  footnote: { fontSize: 12, color: c.textMuted, marginTop: 4 },
}));
