import { Text, View } from 'react-native';

import { estimatedGrams, type Tray } from '../homeAssistant';
import { themedStyles } from '../theme';

// A slot is flagged low at or below this estimated percentage.
const LOW_PCT = 20;

// One AMS slot (or external spool): color dot, slot, filament, and estimated amount left.
export default function TrayRow({ tray, first }: { tray: Tray; first?: boolean }) {
  const styles = useStyles();
  const title = tray.empty ? 'Empty' : tray.name || tray.type || 'Unknown filament';
  const grams = estimatedGrams(tray);
  const low = tray.remainPct !== null && tray.remainPct <= LOW_PCT;

  const details = [
    tray.type && tray.type !== title ? tray.type : '',
    tray.tagUid ? 'Bambu RFID' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  let amount = '';
  if (!tray.empty) {
    amount =
      tray.remainPct === null
        ? 'Amount left unknown (only Bambu RFID spools report it)'
        : `About ${Math.round(tray.remainPct)}% left${grams !== null ? ` · ≈${grams} g` : ''}`;
  }

  return (
    <View style={[styles.row, !first && styles.divider]}>
      <View
        style={[
          styles.swatch,
          tray.empty || !tray.colorHex ? styles.swatchEmpty : { backgroundColor: tray.colorHex },
        ]}
        accessibilityLabel={tray.colorHex ? `Color ${tray.colorHex}` : 'No color'}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.header}>
          <Text style={styles.label}>{tray.label}</Text>
          {tray.active ? <Text style={styles.activeBadge}>Printing from this</Text> : null}
          {low && !tray.empty ? <Text style={styles.lowBadge}>LOW</Text> : null}
        </View>
        <Text style={[styles.name, tray.empty && styles.nameEmpty]}>{title}</Text>
        {details ? <Text style={styles.muted}>{details}</Text> : null}
        {amount ? <Text style={styles.muted}>{amount}</Text> : null}
        {tray.remainPct !== null && !tray.empty ? (
          <View style={styles.track}>
            <View
              style={[styles.fill, low && styles.fillLow, { width: `${tray.remainPct}%` }]}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = themedStyles((c) => ({
  row: { flexDirection: 'row', gap: 12, paddingTop: 10 },
  divider: { borderTopWidth: 1, borderTopColor: c.divider },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    marginTop: 2,
  },
  swatchEmpty: { borderStyle: 'dashed', borderColor: c.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  label: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
  activeBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: c.onAccent,
    backgroundColor: c.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  lowBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: c.onAccent,
    backgroundColor: c.warning,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  name: { fontSize: 15, fontWeight: '600', color: c.text },
  nameEmpty: { color: c.textMuted, fontStyle: 'italic' },
  muted: { fontSize: 13, color: c.textMuted },
  track: { height: 8, backgroundColor: c.track, borderRadius: 4, overflow: 'hidden', marginTop: 2 },
  fill: { height: 8, backgroundColor: c.good },
  fillLow: { backgroundColor: c.warning },
}));
