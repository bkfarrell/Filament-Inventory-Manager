import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { SpoolEvent } from '../db';
import { formatWhen } from '../dates';
import { formatLocation } from '../locations';
import { useStore } from '../store';
import { themedStyles } from '../theme';

// Everything that has happened to one spool, newest first.
export default function SpoolHistory({ spoolId }: { spoolId: number }) {
  const styles = useStyles();
  const store = useStore();
  const [events, setEvents] = useState<SpoolEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    store.listEvents(spoolId).then((list) => {
      if (!cancelled) setEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [store, spoolId]);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>History</Text>
      {events && events.length === 0 ? <Text style={styles.muted}>Nothing recorded yet.</Text> : null}
      {events?.map((e) => (
        <View key={e.id} style={styles.row}>
          <View style={styles.dot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.what}>{describe(e)}</Text>
            <Text style={styles.when}>{formatWhen(e.at)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// "138.63|Benchy" → ["138.6", "Benchy"]
function splitJob(detail: string): [string, string] {
  const i = detail.indexOf('|');
  const grams = Number(i < 0 ? detail : detail.slice(0, i));
  return [String(Math.round(grams * 10) / 10), i < 0 ? 'a print' : detail.slice(i + 1)];
}

function describe(e: SpoolEvent) {
  switch (e.type) {
    case 'purchased':
      return 'Bought';
    case 'opened':
      return 'Opened';
    case 'resealed':
      return 'Marked as sealed again';
    case 'loaded':
      return `Loaded into ${formatLocation(e.detail)}`;
    case 'unloaded':
      return `Removed from ${formatLocation(e.detail)}`;
    case 'used':
      return `Logged ${e.detail} g used`;
    case 'adjusted': {
      const [from, to] = e.detail.split('→');
      return `Amount left changed from ${from} g to ${to} g`;
    }
    case 'finished':
      return 'Marked as used up';
    case 'printed': {
      const [grams, job] = splitJob(e.detail);
      return `Used ${grams} g printing “${job}”`;
    }
    case 'print_undone': {
      const [grams, job] = splitJob(e.detail);
      return `Put back ${grams} g from “${job}” (undone)`;
    }
    default:
      return e.type;
  }
}

const useStyles = themedStyles((c) => ({
  section: { gap: 10, marginTop: 20 },
  title: { fontSize: 17, fontWeight: '600', color: c.text },
  muted: { fontSize: 13, color: c.textMuted },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 6 },
  what: { fontSize: 15, color: c.text },
  when: { fontSize: 12, color: c.textMuted },
}));
