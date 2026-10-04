import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { listEvents, type SpoolEvent } from '../db';
import { formatLocation } from '../locations';
import { themedStyles } from '../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Everything that has happened to one spool, newest first.
export default function SpoolHistory({ spoolId }: { spoolId: number }) {
  const styles = useStyles();
  const db = useSQLiteContext();
  const [events, setEvents] = useState<SpoolEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEvents(db, spoolId).then((list) => {
      if (!cancelled) setEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [db, spoolId]);

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
    default:
      return e.type;
  }
}

// "Oct 3, 2026" for date-only entries, "Oct 3, 2026 · 4:12 PM" when a time is known.
function formatWhen(at: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) {
    const [y, m, d] = at.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${time}`;
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
