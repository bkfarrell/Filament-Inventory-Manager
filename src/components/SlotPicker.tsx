import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import type { Spool } from '../db';
import type { SlotOption } from '../locations';
import { themedStyles } from '../theme';

type Props = {
  spool: Spool;
  options: SlotOption[];
  occupants: Map<string, Spool>; // tracked spools currently in each slot
  printerConnected: boolean;
  // When opening a sealed spool, offer to open it without loading it (it becomes Available).
  allowSkip: boolean;
  onPick: (location: string | null) => void;
  onCancel: () => void;
};

const short = (s: Spool) => `${s.brand} ${s.material} ${s.color}`;

export default function SlotPicker(props: Props) {
  const styles = useStyles();
  const { spool, options, occupants } = props;
  const groups = [...new Set(options.map((o) => o.group))];

  function choose(option: SlotOption) {
    const occupant = occupants.get(option.key);
    if (occupant && occupant.id !== spool.id) {
      Alert.alert(
        `Replace ${occupant.brand} ${occupant.material}?`,
        `${option.label} has ${short(occupant)}. It will be taken out and moved to Available.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', onPress: () => props.onPick(option.key) },
        ]
      );
      return;
    }
    props.onPick(option.key);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{spool.location ? 'Move to another slot' : 'Load into the AMS'}</Text>
      <Text style={styles.subtitle}>{short(spool)}</Text>
      <Text style={styles.hint}>
        {props.printerConnected
          ? 'Pick the slot you put it in. Each slot shows what the printer reports right now.'
          : 'Pick the slot you put it in. Connect the printer in the Printer tab to see what each slot holds.'}
      </Text>

      {groups.map((g) => (
        <View key={g} style={styles.group}>
          <Text style={styles.groupTitle}>{g}</Text>
          <View style={styles.grid}>
            {options
              .filter((o) => o.group === g)
              .map((o) => {
                const occupant = occupants.get(o.key);
                const here = spool.location === o.key;
                const tray = o.tray;
                const swatch = tray && !tray.empty ? tray.colorHex : null;
                const contents = here
                  ? 'Here now'
                  : occupant
                    ? short(occupant)
                    : tray
                      ? tray.empty
                        ? 'Empty'
                        : tray.name || tray.type || 'Loaded'
                      : '';
                return (
                  <Pressable
                    key={o.key}
                    style={[styles.slot, here && styles.slotHere]}
                    onPress={() => choose(o)}
                    accessibilityLabel={`${o.label}${contents ? `, ${contents}` : ''}`}
                  >
                    <View style={styles.slotTop}>
                      <View
                        style={[
                          styles.swatch,
                          swatch ? { backgroundColor: swatch } : styles.swatchEmpty,
                        ]}
                      />
                      <Text style={styles.slotName}>{o.label.replace(/^AMS \d+ · /, '')}</Text>
                    </View>
                    {contents ? (
                      <Text style={styles.slotContents} numberOfLines={2}>
                        {contents}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
          </View>
        </View>
      ))}

      {props.allowSkip ? (
        <Pressable style={styles.skip} onPress={() => props.onPick(null)}>
          <Text style={styles.skipText}>Open without loading</Text>
          <Text style={styles.hint}>It goes to Available on the In Use tab.</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.cancel} onPress={props.onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = themedStyles((c) => ({
  content: { padding: 20, gap: 12, paddingBottom: 60, backgroundColor: c.background, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '600', color: c.text },
  subtitle: { fontSize: 16, color: c.textSecondary },
  hint: { fontSize: 13, color: c.textMuted },
  group: { gap: 8, marginTop: 4 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    padding: 10,
    gap: 4,
    minHeight: 64,
  },
  slotHere: { borderColor: c.primary, borderWidth: 2 },
  slotTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: c.border },
  swatchEmpty: { borderStyle: 'dashed', borderColor: c.textMuted },
  slotName: { fontSize: 15, fontWeight: '600', color: c.text },
  slotContents: { fontSize: 12, color: c.textMuted },
  skip: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    padding: 14,
    gap: 2,
    marginTop: 8,
  },
  skipText: { fontSize: 16, fontWeight: '600', color: c.primary },
  cancel: { alignSelf: 'center', padding: 12 },
  cancelText: { fontSize: 16, color: c.textSecondary },
}));
