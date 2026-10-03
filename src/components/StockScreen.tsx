import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Spool } from '../db';
import { groupStock, type ColorGroup } from '../stock';
import { themedStyles } from '../theme';

type Props = {
  spools: Spool[]; // sealed spools only
  onOpen: (spool: Spool) => void; // move a spool to "In use"
  onEdit: (spool: Spool) => void;
};

export default function StockScreen({ spools, onOpen, onEdit }: Props) {
  const styles = useStyles();
  // Which color rows are expanded to show their individual spools.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (spools.length === 0) {
    return (
      <Text style={styles.empty}>
        No sealed spools in stock. New spools land here until you open them.
      </Text>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {groupStock(spools).map((m) => (
        <View key={m.material} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.material}>{m.material}</Text>
            <Text style={styles.sectionCount}>
              {m.count} sealed · {m.colors.length} {m.colors.length === 1 ? 'color' : 'colors'}
            </Text>
          </View>
          <View style={styles.card}>
            {m.colors.map((c, i) => (
              <ColorRow
                key={c.key}
                group={c}
                first={i === 0}
                open={expanded.has(c.key)}
                onToggle={() => toggle(c.key)}
                onOpen={onOpen}
                onEdit={onEdit}
              />
            ))}
          </View>
        </View>
      ))}
      <Text style={styles.footnote}>
        Tap a color to see each spool. “Open” moves a spool to the In use tab.
      </Text>
    </ScrollView>
  );
}

function ColorRow(props: {
  group: ColorGroup;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: (spool: Spool) => void;
  onEdit: (spool: Spool) => void;
}) {
  const styles = useStyles();
  const { group, open } = props;
  const brands = group.brands
    .map((b) => (b.count > 1 ? `${b.brand} ×${b.count}` : b.brand))
    .join(' · ');
  const refills =
    group.refills === 0
      ? ''
      : group.refills === group.count
        ? group.count === 1
          ? ' · refill'
          : ' · all refills'
        : ` · ${group.refills} ${group.refills === 1 ? 'refill' : 'refills'}`;

  return (
    <View style={!props.first && styles.rowDivider}>
      <Pressable
        style={styles.row}
        onPress={props.onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${group.color}, ${group.count} sealed`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.color}>{group.color}</Text>
          <Text style={styles.brands}>
            {brands}
            {refills}
          </Text>
        </View>
        <Text style={styles.count}>×{group.count}</Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>

      {open
        ? group.spools.map((s) => (
            <View key={s.id} style={styles.spoolRow}>
              <Pressable style={{ flex: 1 }} onPress={() => props.onEdit(s)}>
                <Text style={styles.spoolName}>
                  {s.brand}
                  {s.isRefill ? ' · refill' : ''}
                </Text>
                <Text style={styles.spoolMeta}>
                  Bought {s.purchasedAt} · {s.pricePaid.toFixed(2)} · {Math.round(s.totalWeightG)} g
                </Text>
              </Pressable>
              <Pressable style={styles.openButton} onPress={() => props.onOpen(s)}>
                <Text style={styles.openText}>Open</Text>
              </Pressable>
            </View>
          ))
        : null}
    </View>
  );
}

const useStyles = themedStyles((c) => ({
  content: { paddingHorizontal: 16, paddingBottom: 110, gap: 16 },
  empty: {
    textAlign: 'center',
    color: c.textMuted,
    marginTop: 40,
    fontSize: 16,
    paddingHorizontal: 24,
  },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  material: { fontSize: 20, fontWeight: '700', color: c.text },
  sectionCount: { fontSize: 14, color: c.textMuted },
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: c.divider },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  color: { fontSize: 16, fontWeight: '600', color: c.text },
  brands: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  count: { fontSize: 20, fontWeight: '700', color: c.text },
  chevron: { fontSize: 14, color: c.textMuted, width: 12 },
  spoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 28,
    paddingRight: 16,
    paddingVertical: 10,
    backgroundColor: c.background,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  spoolName: { fontSize: 15, color: c.text },
  spoolMeta: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  openButton: {
    backgroundColor: c.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openText: { color: c.onAccent, fontSize: 14, fontWeight: '600' },
  footnote: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
}));
