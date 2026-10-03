import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { NewSpool, Spool } from '../db';

type Props = {
  spool?: Spool; // when given, the form edits this spool; otherwise it adds a new one
  onSave: (spool: NewSpool) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

// Turns a stored number into text for an input box, without long decimals.
const toText = (n: number) => String(Math.round(n * 100) / 100);

export default function SpoolForm({ spool, onSave, onCancel, onDelete }: Props) {
  const editing = spool !== undefined;
  const [brand, setBrand] = useState(spool?.brand ?? '');
  const [material, setMaterial] = useState(spool?.material ?? 'PLA');
  const [color, setColor] = useState(spool?.color ?? '');
  const [weight, setWeight] = useState(toText(spool?.totalWeightG ?? 1000));
  const [price, setPrice] = useState(spool ? toText(spool.pricePaid) : '');
  const [emptySpool, setEmptySpool] = useState(toText(spool?.emptySpoolWeightG ?? 0));
  const [remaining, setRemaining] = useState(toText(spool?.remainingWeightG ?? 1000));
  const [remainingTouched, setRemainingTouched] = useState(editing);
  const [scaleReading, setScaleReading] = useState('');
  const [error, setError] = useState('');

  function changeWeight(text: string) {
    setWeight(text);
    // A brand-new spool is full, so keep "filament left" in step with its weight
    // until the user types their own value.
    if (!remainingTouched) setRemaining(text);
  }

  function changeRemaining(text: string) {
    setRemaining(text);
    setRemainingTouched(true);
    setScaleReading('');
  }

  // Scale shows reel + filament. Subtract the empty reel to get filament only.
  function applyScaleReading(readingText: string, emptySpoolText: string) {
    const reading = Number(readingText);
    if (readingText.trim() && reading >= 0) {
      const filament = Math.max(0, reading - Number(emptySpoolText || 0));
      setRemaining(toText(filament));
      setRemainingTouched(true);
    }
  }

  function changeScaleReading(text: string) {
    setScaleReading(text);
    applyScaleReading(text, emptySpool);
  }

  function changeEmptySpool(text: string) {
    setEmptySpool(text);
    applyScaleReading(scaleReading, text);
  }

  function save() {
    const totalWeightG = Number(weight);
    const remainingWeightG = Number(remaining);
    const emptySpoolWeightG = Number(emptySpool || 0);
    const pricePaid = Number(price || 0);
    if (!brand.trim() || !material.trim() || !color.trim()) {
      setError('Brand, material and color are required.');
      return;
    }
    if (!(totalWeightG > 0)) {
      setError('Filament weight must be a number above 0.');
      return;
    }
    if (!remaining.trim() || !(remainingWeightG >= 0)) {
      setError('Filament left must be a number (0 or more).');
      return;
    }
    if (!(emptySpoolWeightG >= 0) || !(pricePaid >= 0)) {
      setError('Empty spool weight and price must be numbers.');
      return;
    }
    onSave({
      brand: brand.trim(),
      material: material.trim().toUpperCase(),
      color: color.trim(),
      totalWeightG,
      remainingWeightG,
      emptySpoolWeightG,
      pricePaid,
      purchasedAt: spool?.purchasedAt ?? new Date().toISOString().slice(0, 10),
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{editing ? 'Edit spool' : 'Add a spool'}</Text>
      <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Prusament" />
      <Field label="Material" value={material} onChangeText={setMaterial} placeholder="PLA, PETG…" />
      <Field label="Color" value={color} onChangeText={setColor} placeholder="e.g. Galaxy Black" />
      <Field label="Filament weight when new (g)" value={weight} onChangeText={changeWeight} numeric />
      <Field label="Price paid" value={price} onChangeText={setPrice} placeholder="0.00" numeric />
      <Field
        label="Empty spool weight (g)"
        hint="Weight of the empty reel. Check the brand's website or weigh an empty one. Usually 150–250 g."
        value={emptySpool}
        onChangeText={changeEmptySpool}
        numeric
      />

      <Text style={styles.section}>How much is left?</Text>
      <Field
        label="Weigh it: scale reading (g)"
        hint="Put the whole spool on a kitchen scale. The empty reel weight is subtracted for you."
        value={scaleReading}
        onChangeText={changeScaleReading}
        placeholder="e.g. 640"
        numeric
      />
      {scaleReading && Number(emptySpool || 0) === 0 ? (
        <Text style={styles.warning}>
          Tip: enter the empty spool weight above, or the reel will be counted as filament.
        </Text>
      ) : null}
      <Field
        label="Filament left (g)"
        value={remaining}
        onChangeText={changeRemaining}
        numeric
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttons}>
        <Button title="Cancel" onPress={onCancel} color="#666" />
        <Button title="Save" onPress={save} />
      </View>
      {onDelete ? (
        <View style={styles.delete}>
          <Button title="Delete spool" onPress={onDelete} color="#c0392b" />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  hint?: string;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.numeric ? 'decimal-pad' : 'default'}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 20, gap: 12, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 4 },
  section: { fontSize: 17, fontWeight: '600', marginTop: 8 },
  field: { gap: 4 },
  label: { fontSize: 14, color: '#444' },
  hint: { fontSize: 12, color: '#888' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  warning: { color: '#b9770e', fontSize: 13 },
  error: { color: '#c0392b' },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  delete: { marginTop: 16 },
});
