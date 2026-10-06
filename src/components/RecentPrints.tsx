import { Pressable, Text, View } from 'react-native';

import { formatWhen } from '../dates';
import type { PrintJob } from '../db';
import { formatLocation } from '../locations';
import { themedStyles } from '../theme';

// Prints counted automatically from the printer, newest first, with Undo.
export default function RecentPrints(props: { jobs: PrintJob[]; onUndo: (job: PrintJob) => void }) {
  const styles = useStyles();
  if (props.jobs.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Recent prints</Text>
      <Text style={styles.muted}>Filament used is subtracted automatically when a print ends.</Text>
      {props.jobs.slice(0, 3).map((job, i) => {
        const canUndo = job.status === 'applied' && job.entries.some((e) => e.spoolId !== null);
        return (
          <View key={job.jobKey} style={[styles.job, i > 0 && styles.divider]}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobName} numberOfLines={1}>
                {job.result === 'failed' ? '⚠︎ ' : '✓ '}
                {job.taskName}
              </Text>
              {canUndo ? (
                <Pressable onPress={() => props.onUndo(job)} accessibilityRole="button">
                  <Text style={styles.link}>Undo</Text>
                </Pressable>
              ) : job.status === 'undone' ? (
                <Text style={styles.muted}>Undone</Text>
              ) : null}
            </View>
            <Text style={styles.muted}>
              {job.result === 'failed'
                ? `Stopped at ${Math.round(job.progress ?? 0)}% · estimated`
                : 'Finished'}{' '}
              · {formatWhen(job.endedAt)}
            </Text>
            {job.entries.map((e) => (
              <Text key={e.location} style={[styles.entry, job.status === 'undone' && styles.undone]}>
                −{Math.round(e.grams * 10) / 10} g ·{' '}
                {e.spoolName ? (
                  <>
                    {e.spoolName} <Text style={styles.muted}>({formatLocation(e.location)})</Text>
                  </>
                ) : (
                  <Text style={styles.warning}>
                    {formatLocation(e.location)}: no spool linked, nothing subtracted
                  </Text>
                )}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = themedStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: c.border,
  },
  title: { fontSize: 17, fontWeight: '600', color: c.text },
  muted: { fontSize: 13, color: c.textMuted },
  job: { gap: 3, paddingTop: 8 },
  divider: { borderTopWidth: 1, borderTopColor: c.divider, marginTop: 4 },
  jobHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  jobName: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
  entry: { fontSize: 14, color: c.text },
  undone: { textDecorationLine: 'line-through', color: c.textMuted },
  warning: { color: c.warningText },
  link: { fontSize: 14, fontWeight: '600', color: c.primary },
}));
