import { useState, type ReactNode } from 'react';
import { Button, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { todayIso, type NewSpool, type Product, type Spool } from '../db';
import { themedStyles, useTheme } from '../theme';

type Props = {
  spool?: Spool; // when given, the form edits this spool; otherwise it adds a new one
  barcode?: string; // set when a new spool comes from scanning a box
  product?: Product | null; // what the app remembers about that barcode, if anything
  onSave: (spool: NewSpool) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onFinish?: () => void; // "mark as used up"
  footer?: ReactNode; // shown at the bottom, e.g. the spool's history
};

// Turns a stored number into text for an input box, without long decimals.
const toText = (n: number) => String(Math.round(n * 100) / 100);

export default function SpoolForm({
  spool,
  barcode,
  product,
  onSave,
  onCancel,
  onDelete,
  onFinish,
  footer,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const editing = spool !== undefined;
  // Start from the spool being edited, else the remembered product, else blanks.
  const start = spool ?? product;
  const startPrice = spool?.pricePaid ?? product?.lastPricePaid;
  const [brand, setBrand] = useState(start?.brand ?? '');
  const [material, setMaterial] = useState(start?.material ?? 'PLA');
  const [color, setColor] = useState(start?.color ?? '');
  const [isRefill, setIsRefill] = useState(start?.isRefill ?? false);
  const [weight, setWeight] = useState(toText(start?.totalWeightG ?? 1000));
  const [price, setPrice] = useState(startPrice !== undefined ? toText(startPrice) : '');
  const [purchasedAt, setPurchasedAt] = useState(spool?.purchasedAt ?? todayIso());
  const [openedAt, setOpenedAt] = useState(spool?.openedAt ?? ''); // blank = still sealed
  const [notes, setNotes] = useState(spool?.notes ?? '');
  const [emptySpool, setEmptySpool] = useState(toText(start?.emptySpoolWeightG ?? 0));
  const [remaining, setRemaining] = useState(
    toText(spool?.remainingWeightG ?? start?.totalWeightG ?? 1000)
  );
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
    if (!isValidDate(purchasedAt.trim())) {
      setError('Purchase date must look like 2026-10-03 (year-month-day).');
      return;
    }
    const opened = openedAt.trim();
    if (opened && !isValidDate(opened)) {
      setError('Opened date must look like 2026-10-03, or be left blank if still sealed.');
      return;
    }
    if (opened && opened < purchasedAt.trim()) {
      setError("Opened date can't be before the purchase date.");
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
      purchasedAt: purchasedAt.trim(),
      barcode: spool?.barcode ?? barcode ?? null,
      openedAt: opened || null,
      notes: notes.trim(),
      isRefill,
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{editing ? 'Edit spool' : 'Add a spool'}</Text>
      {barcode && !editing ? (
        <Text style={[styles.notice, product ? styles.noticeKnown : styles.noticeNew]}>
          {product
            ? `Recognized barcode ${barcode}. Check the details and price, then tap Save.`
            : `New barcode ${barcode}. Fill in the details once and the app will remember them next time you scan this product.`}
        </Text>
      ) : null}
      <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Prusament" />
      <Field
        label="Material"
        value={material}
        onChangeText={setMaterial}
        placeholder="PLA, PETG…"
      />
      <Field label="Color" value={color} onChangeText={setColor} placeholder="e.g. Galaxy Black" />
      <View style={styles.field}>
        <Text style={styles.label}>Comes as</Text>
        <View style={styles.segment}>
          <SegmentButton label="On a spool" active={!isRefill} onPress={() => setIsRefill(false)} />
          <SegmentButton label="Refill" active={isRefill} onPress={() => setIsRefill(true)} />
        </View>
        <Text style={styles.hint}>
          {isRefill
            ? 'Filament only, no reel. You load it onto a reusable spool.'
            : 'Filament comes wound on its own reel.'}
        </Text>
      </View>
      <Field
        label="Filament weight when new (g)"
        value={weight}
        onChangeText={changeWeight}
        numeric
      />
      <Field label="Price paid" value={price} onChangeText={setPrice} placeholder="0.00" numeric />
      <Field
        label="Purchase date"
        hint="Year-month-day, e.g. 2026-10-03. Change it to log older purchases."
        value={purchasedAt}
        onChangeText={setPurchasedAt}
        placeholder="YYYY-MM-DD"
      />
      <Field
        label="Opened date"
        hint="When you took it out of the sealed bag. Leave blank if it's still sealed. Filled in automatically the first time you log a print."
        value={openedAt}
        onChangeText={setOpenedAt}
        placeholder="Still sealed"
      />
      <View style={styles.quickRow}>
        <Pressable style={styles.quickButton} onPress={() => setOpenedAt(todayIso())}>
          <Text style={styles.quickText}>Opened today</Text>
        </Pressable>
        <Pressable style={styles.quickButton} onPress={() => setOpenedAt('')}>
          <Text style={styles.quickText}>Still sealed</Text>
        </Pressable>
      </View>
      <Field
        label={isRefill ? 'Reusable spool weight (g)' : 'Empty spool weight (g)'}
        hint={
          isRefill
            ? 'Weight of the empty reusable spool you load this refill onto, so scale readings work.'
            : "Weight of the empty reel. Check the brand's website or weigh an empty one. Usually 150–250 g."
        }
        value={emptySpool}
        onChangeText={changeEmptySpool}
        numeric
      />

      <Text style={styles.section}>How much is left?</Text>
      <Field
        label="Weigh it: scale reading (g)"
        hint={
          isRefill
            ? 'Put the refill, loaded on its reusable spool, on a kitchen scale. The spool weight is subtracted for you.'
            : 'Put the whole spool on a kitchen scale. The empty reel weight is subtracted for you.'
        }
        value={scaleReading}
        onChangeText={changeScaleReading}
        placeholder="e.g. 640"
        numeric
      />
      {scaleReading && Number(emptySpool || 0) === 0 ? (
        <Text style={styles.warning}>
          Tip: enter the {isRefill ? 'reusable' : 'empty'} spool weight above, or the reel will be
          counted as filament.
        </Text>
      ) : null}
      <Field label="Filament left (g)" value={remaining} onChangeText={changeRemaining} numeric />

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. Prints best at 215°C, strings above 225°C"
        multiline
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttons}>
        <Button title="Cancel" onPress={onCancel} color={colors.mutedButton} />
        <Button title="Save" onPress={save} color={colors.primary} />
      </View>
      {onFinish ? (
        <View style={styles.delete}>
          <Button title="Mark as used up" onPress={onFinish} color={colors.warningText} />
          <Text style={styles.hint}>
            Removes it from your inventory but keeps it in purchase history and reports.
          </Text>
        </View>
      ) : null}
      {onDelete ? (
        <View style={styles.delete}>
          <Button title="Delete spool" onPress={onDelete} color={colors.danger} />
        </View>
      ) : null}
      {footer}
    </ScrollView>
  );
}

function SegmentButton(props: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.segmentButton, props.active && styles.segmentButtonActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: props.active }}
    >
      <Text style={[styles.segmentText, props.active && styles.segmentTextActive]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

// True for a real calendar date written as YYYY-MM-DD.
function isValidDate(text: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  hint?: string;
  numeric?: boolean;
  multiline?: boolean;
}) {
  const styles = useStyles();
  const { colors, dark } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMultiline]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={props.numeric ? 'decimal-pad' : 'default'}
        keyboardAppearance={dark ? 'dark' : 'light'}
        multiline={props.multiline}
        textAlignVertical={props.multiline ? 'top' : 'center'}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

const useStyles = themedStyles((c) => ({
  form: { padding: 20, gap: 12, paddingBottom: 60, backgroundColor: c.background, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 4, color: c.text },
  section: { fontSize: 17, fontWeight: '600', marginTop: 8, color: c.text },
  field: { gap: 4 },
  label: { fontSize: 14, color: c.textSecondary },
  hint: { fontSize: 12, color: c.textMuted },
  input: {
    borderWidth: 1,
    borderColor: c.inputBorder,
    backgroundColor: c.surface,
    color: c.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 90 },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: -4 },
  quickButton: {
    backgroundColor: c.track,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  quickText: { fontSize: 14, color: c.text },
  segment: { flexDirection: 'row', backgroundColor: c.segment, borderRadius: 10, padding: 3 },
  segmentButton: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentButtonActive: { backgroundColor: c.segmentActive },
  segmentText: { fontSize: 15, color: c.textSecondary },
  segmentTextActive: { color: c.text, fontWeight: '600' },
  warning: { color: c.warningText, fontSize: 13 },
  notice: { fontSize: 14, padding: 12, borderRadius: 8, overflow: 'hidden' },
  noticeKnown: { backgroundColor: c.noticeKnownBg, color: c.noticeKnownText },
  noticeNew: { backgroundColor: c.noticeNewBg, color: c.noticeNewText },
  error: { color: c.danger },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  delete: { marginTop: 16 },
}));
