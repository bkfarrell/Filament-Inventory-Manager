import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { NewSpool } from '../db';

type Props = {
  onSave: (spool: NewSpool) => void;
  onCancel: () => void;
};

export default function AddSpoolForm({ onSave, onCancel }: Props) {
  const [brand, setBrand] = useState('');
  const [material, setMaterial] = useState('PLA');
  const [color, setColor] = useState('');
  const [weight, setWeight] = useState('1000');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  function save() {
    const totalWeightG = Number(weight);
    const pricePaid = Number(price || 0);
    if (!brand.trim() || !material.trim() || !color.trim()) {
      setError('Brand, material and color are required.');
      return;
    }
    if (!(totalWeightG > 0) || !(pricePaid >= 0)) {
      setError('Weight and price must be numbers.');
      return;
    }
    onSave({
      brand: brand.trim(),
      material: material.trim().toUpperCase(),
      color: color.trim(),
      totalWeightG,
      remainingWeightG: totalWeightG,
      pricePaid,
      purchasedAt: new Date().toISOString().slice(0, 10),
    });
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>Add a spool</Text>
      <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Prusament" />
      <Field label="Material" value={material} onChangeText={setMaterial} placeholder="PLA, PETG…" />
      <Field label="Color" value={color} onChangeText={setColor} placeholder="e.g. Galaxy Black" />
      <Field label="Filament weight (g)" value={weight} onChangeText={setWeight} numeric />
      <Field label="Price paid" value={price} onChangeText={setPrice} placeholder="0.00" numeric />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttons}>
        <Button title="Cancel" onPress={onCancel} color="#666" />
        <Button title="Save" onPress={save} />
      </View>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
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
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 4 },
  field: { gap: 4 },
  label: { fontSize: 14, color: '#444' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: { color: '#c0392b' },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
});
