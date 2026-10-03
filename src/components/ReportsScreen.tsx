import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Spool } from '../db';
import {
  boughtIn,
  groupTotals,
  monthName,
  monthlyTotals,
  pricePerKg,
  sumSpent,
  type GroupTotal,
} from '../reports';

type Props = {
  spools: Spool[]; // every spool ever bought, including used-up ones
};

type Period = 'year' | 'all';

const BAR_COLOR = '#2a78d6';
const CHART_HEIGHT = 140;

const money = (n: number) => n.toFixed(2);

export default function ReportsScreen({ spools }: Props) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const [period, setPeriod] = useState<Period>('year');

  const months = monthlyTotals(spools, 12, now);
  // The month whose numbers are shown above the chart; tap a bar to change it.
  const [selectedKey, setSelectedKey] = useState(months[months.length - 1].key);
  const selected = months.find((m) => m.key === selectedKey) ?? months[months.length - 1];
  const maxMonth = Math.max(...months.map((m) => m.spent));

  const inPeriod = period === 'year' ? boughtIn(spools, thisYear) : spools;
  const byMaterial = groupTotals(inPeriod, (s) => s.material);
  const byBrand = groupTotals(inPeriod, (s) => s.brand);

  if (spools.length === 0) {
    return (
      <Text style={styles.empty}>
        No purchases yet. Add or scan a spool and your spending will show up here.
      </Text>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.tiles}>
        <Tile
          label="This month"
          value={money(sumSpent(boughtIn(spools, thisYear, now.getMonth() + 1)))}
        />
        <Tile label={`${thisYear}`} value={money(sumSpent(boughtIn(spools, thisYear)))} />
        <Tile label="All time" value={money(sumSpent(spools))} />
      </View>
      <View style={styles.tiles}>
        <Tile label="Spools bought" value={String(spools.length)} />
        <Tile label="Avg price / kg" value={money(pricePerKg(spools))} />
      </View>

      <Card title="Spending, last 12 months">
        <Text style={styles.readout}>
          <Text style={styles.readoutStrong}>{monthName(selected.key)}</Text>
          {`  ${money(selected.spent)} · ${selected.count} ${selected.count === 1 ? 'spool' : 'spools'}`}
        </Text>
        <View style={styles.chart}>
          {months.map((m) => {
            const h = maxMonth > 0 ? (m.spent / maxMonth) * CHART_HEIGHT : 0;
            const isSelected = m.key === selected.key;
            return (
              <Pressable
                key={m.key}
                style={styles.barSlot}
                onPress={() => setSelectedKey(m.key)}
                accessibilityLabel={`${monthName(m.key)}: ${money(m.spent)}`}
              >
                <View style={[styles.barArea, isSelected && styles.barAreaSelected]}>
                  {m.spent > 0 ? <View style={[styles.bar, { height: Math.max(h, 3) }]} /> : null}
                </View>
                <Text style={[styles.barLabel, isSelected && styles.barLabelSelected]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.chartNote}>Tap a month to see its total.</Text>
      </Card>

      <View style={styles.toggle}>
        <ToggleButton
          label={`${thisYear}`}
          active={period === 'year'}
          onPress={() => setPeriod('year')}
        />
        <ToggleButton label="All time" active={period === 'all'} onPress={() => setPeriod('all')} />
      </View>

      <Card title="By material">
        <Breakdown groups={byMaterial} />
      </Card>
      <Card title="By brand">
        <Breakdown groups={byBrand} />
      </Card>

      <Card title="Purchase history">
        {inPeriod.length === 0 ? (
          <Text style={styles.muted}>No purchases in this period.</Text>
        ) : null}
        {inPeriod.map((s) => (
          <View key={s.id} style={styles.historyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyName}>
                {s.brand} {s.material} · {s.color}
              </Text>
              <Text style={styles.muted}>
                {s.purchasedAt}
                {s.finishedAt ? ` · used up ${s.finishedAt}` : ''}
              </Text>
            </View>
            <Text style={styles.amount}>{money(s.pricePaid)}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function Breakdown({ groups }: { groups: GroupTotal[] }) {
  if (groups.length === 0) return <Text style={styles.muted}>No purchases in this period.</Text>;
  const max = Math.max(...groups.map((g) => g.spent));
  return (
    <View style={{ gap: 12 }}>
      {groups.map((g) => (
        <View key={g.name} style={{ gap: 4 }}>
          <View style={styles.groupHeader}>
            <Text style={styles.groupName}>{g.name}</Text>
            <Text style={styles.amount}>{money(g.spent)}</Text>
          </View>
          <View style={styles.hTrack}>
            <View style={[styles.hBar, { width: `${max > 0 ? (g.spent / max) * 100 : 0}%` }]} />
          </View>
          <Text style={styles.muted}>
            {g.count} {g.count === 1 ? 'spool' : 'spools'} · {(g.grams / 1000).toFixed(1)} kg ·{' '}
            {money(g.pricePerKg)}/kg
          </Text>
        </View>
      ))}
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.toggleButton, props.active && styles.toggleButtonActive]}
    >
      <Text style={[styles.toggleText, props.active && styles.toggleTextActive]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 16,
    paddingHorizontal: 24,
  },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  tileLabel: { fontSize: 13, color: '#666' },
  tileValue: { fontSize: 22, fontWeight: '700', marginTop: 2, color: '#111' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  readout: { fontSize: 15, color: '#444' },
  readoutStrong: { fontWeight: '700', color: '#111' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, alignItems: 'stretch' },
  barArea: {
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    borderRadius: 4,
  },
  barAreaSelected: { backgroundColor: '#eef4fc' },
  bar: {
    backgroundColor: BAR_COLOR,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    marginHorizontal: 2,
  },
  barLabel: { fontSize: 10, color: '#888', textAlign: 'center', marginTop: 4 },
  barLabelSelected: { color: '#111', fontWeight: '700' },
  chartNote: { fontSize: 12, color: '#888' },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e8',
    borderRadius: 10,
    padding: 3,
    alignSelf: 'flex-start',
  },
  toggleButton: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  toggleButtonActive: { backgroundColor: '#fff' },
  toggleText: { fontSize: 14, color: '#555' },
  toggleTextActive: { color: '#111', fontWeight: '600' },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  groupName: { fontSize: 15, fontWeight: '600' },
  hTrack: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hBar: { height: 8, backgroundColor: BAR_COLOR, borderRadius: 4 },
  amount: { fontSize: 15, fontWeight: '600', color: '#111' },
  muted: { fontSize: 13, color: '#777' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  historyName: { fontSize: 15 },
});
