import { Pressable, StyleSheet, Text, View } from 'react-native';

import { costPerGram, isLowStock, type Spool } from '../db';

type Props = {
  spool: Spool;
  onUse: (grams: number) => void;
  onDelete: () => void;
};

export default function SpoolCard({ spool, onUse, onDelete }: Props) {
  const low = isLowStock(spool);
  const pct = spool.totalWeightG > 0 ? spool.remainingWeightG / spool.totalWeightG : 0;

  return (
    <Pressable onLongPress={onDelete} style={[styles.card, low && styles.cardLow]}>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  cardLow: { borderColor: '#e67e22' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '600' },
  color: { fontSize: 15, color: '#555' },
  lowBadge: {
    color: '#fff',
    backgroundColor: '#e67e22',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barTrack: { height: 8, backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#27ae60' },
  barLow: { backgroundColor: '#e67e22' },
  meta: { fontSize: 13, color: '#666' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  useButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  useText: { fontSize: 14 },
});
