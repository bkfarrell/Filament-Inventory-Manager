import { Pressable, Text, View } from 'react-native';

import { costPerGram, isLowStock, type Spool } from '../db';
import { themedStyles } from '../theme';

type Props = {
  spool: Spool;
  onUse: (grams: number) => void;
  onEdit: () => void;
  onDelete: () => void;
};

export default function SpoolCard({ spool, onUse, onEdit, onDelete }: Props) {
  const styles = useStyles();
  const low = isLowStock(spool);
  const pct =
    spool.totalWeightG > 0 ? Math.min(1, spool.remainingWeightG / spool.totalWeightG) : 0;

  return (
    <Pressable onPress={onEdit} onLongPress={onDelete} style={[styles.card, low && styles.cardLow]}>
      <View style={styles.header}>
        <Text style={styles.name}>
          {spool.brand} {spool.material}
        </Text>
        {low ? <Text style={styles.lowBadge}>LOW</Text> : null}
      </View>
      <Text style={styles.color}>{spool.color}</Text>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }, low && styles.barLow]} />
      </View>
      <Text style={styles.meta}>
        {Math.round(spool.remainingWeightG)} g of {Math.round(spool.totalWeightG)} g left ·{' '}
        {spool.pricePaid.toFixed(2)} paid · {(costPerGram(spool) * 1000).toFixed(2)}/kg
      </Text>
      <Text style={styles.meta}>{openedLabel(spool.openedAt)}</Text>
      {spool.notes ? (
        <Text style={styles.notes} numberOfLines={2}>
          {spool.notes}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {[10, 50, 100].map((g) => (
          <Pressable key={g} style={styles.useButton} onPress={() => onUse(g)}>
            <Text style={styles.useText}>−{g} g</Text>
          </Pressable>
        ))}
      </View>
    </Pressable>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Sealed", or e.g. "Opened Oct 3 · 12 days ago".
function openedLabel(openedAt: string | null) {
  if (!openedAt) return 'Sealed';
  const [y, m, d] = openedAt.split('-').map(Number);
  const opened = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - opened.getTime()) / 86_400_000);
  const when = days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  const year = y === now.getFullYear() ? '' : ` ${y}`;
  return `Opened ${MONTHS[m - 1]} ${d}${year} · ${when}`;
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
  cardLow: { borderColor: c.warning },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '600', color: c.text },
  color: { fontSize: 15, color: c.textSecondary },
  lowBadge: {
    color: c.onAccent,
    backgroundColor: c.warning,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barTrack: { height: 8, backgroundColor: c.track, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: c.good },
  barLow: { backgroundColor: c.warning },
  meta: { fontSize: 13, color: c.textMuted },
  notes: { fontSize: 14, color: c.textSecondary, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  useButton: {
    backgroundColor: c.track,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  useText: { fontSize: 14, color: c.text },
}));
