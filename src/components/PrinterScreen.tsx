import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  clearSettings,
  normalizeUrl,
  saveSettings,
  testConnection,
  type HaSettings,
  type PrinterData,
} from '../homeAssistant';
import { shareableAttributes } from '../printerParse';
import { showDialog } from '../dialogs';
import { themedStyles, useTheme } from '../theme';
import { PRINTER_REFRESH_MS, usePrinterData, useSavedSettings } from '../usePrinter';
import TrayRow from './TrayRow';

export default function PrinterScreen() {
  const styles = useStyles();
  const [settings, setSettings] = useSavedSettings();
  const [editing, setEditing] = useState(false);

  if (settings === undefined) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }

  if (settings === null || editing) {
    return (
      <ConnectForm
        initial={settings}
        onConnected={(s) => {
          setSettings(s);
          setEditing(false);
        }}
        onCancel={settings ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <PrinterView
      settings={settings}
      onEditSettings={() => setEditing(true)}
      onDisconnect={async () => {
        await clearSettings();
        setSettings(null);
      }}
      styles={styles}
    />
  );
}

// ---- Live printer view ----

function PrinterView(props: {
  settings: HaSettings;
  onEditSettings: () => void;
  onDisconnect: () => void;
  styles: ReturnType<typeof useStyles>;
}) {
  const { settings, styles } = props;
  const { data, error, updatedAt, refreshing, refreshNow } = usePrinterData(settings);
  const [showRaw, setShowRaw] = useState(false);

  function confirmDisconnect() {
    showDialog('Disconnect Home Assistant?', 'The app will forget the address and token.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: props.onDisconnect },
    ]);
  }

  async function shareRaw() {
    if (!data) return;
    const lines = data.entities.map(
      (e) => `${e.entity_id} = ${e.state}\n  ${JSON.stringify(shareableAttributes(e.attributes))}`
    );
    await Share.share({ message: lines.join('\n') });
  }

  const amsUnits = [...new Set(data?.trays.filter((t) => t.ams !== null).map((t) => t.ams))];
  const others = data?.trays.filter((t) => t.ams === null) ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshNow} />}
    >
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!data && !error ? <ActivityIndicator style={{ marginTop: 40 }} /> : null}

      {data && !data.printer && data.trays.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No printer found</Text>
          <Text style={styles.muted}>
            Connected to Home Assistant, but no Bambu Lab printer entities were found. Make sure the
            Bambu Lab integration is set up, or share the raw data below so it can be checked.
          </Text>
        </View>
      ) : null}

      {data?.printer ? <StatusCard printer={data.printer} styles={styles} /> : null}

      {amsUnits.map((ams) => (
        <View key={String(ams)} style={styles.card}>
          <Text style={styles.cardTitle}>AMS {ams}</Text>
          {data!.trays
            .filter((t) => t.ams === ams)
            .map((t, i) => (
              <TrayRow key={t.entityId} tray={t} first={i === 0} />
            ))}
        </View>
      ))}

      {others.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>External</Text>
          {others.map((t, i) => (
            <TrayRow key={t.entityId} tray={t} first={i === 0} />
          ))}
        </View>
      ) : null}

      {updatedAt ? (
        <Text style={styles.footnote}>
          Updated {updatedAt.toLocaleTimeString()} · refreshes every {PRINTER_REFRESH_MS / 1000} s · pull
          down to refresh now
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connection</Text>
        <Text style={styles.muted}>Home Assistant at {settings.url}</Text>
        <View style={styles.buttonRow}>
          <SmallButton label="Change" onPress={props.onEditSettings} styles={styles} />
          <SmallButton label="Disconnect" onPress={confirmDisconnect} styles={styles} />
        </View>
      </View>

      {data ? (
        <View style={styles.card}>
          <Pressable onPress={() => setShowRaw((v) => !v)}>
            <Text style={styles.cardTitle}>
              {showRaw ? '▾' : '▸'} Raw printer data ({data.entities.length} entities)
            </Text>
          </Pressable>
          <Text style={styles.muted}>
            What Home Assistant reports. If a slot or status looks wrong, share this so the app can
            be adjusted. It doesn&apos;t include your token.
          </Text>
          {showRaw ? (
            <>
              <SmallButton label="Share raw data" onPress={shareRaw} styles={styles} />
              {data.entities.map((e) => (
                <Text key={e.entity_id} style={styles.raw}>
                  {e.entity_id} = {e.state}
                </Text>
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function StatusCard({
  printer,
  styles,
}: {
  printer: NonNullable<PrinterData['printer']>;
  styles: ReturnType<typeof useStyles>;
}) {
  const { colors } = useTheme();
  const pillColor =
    printer.status === 'Printing'
      ? colors.primary
      : printer.status === 'Paused'
        ? colors.warning
        : printer.status === 'Failed'
          ? colors.danger
          : printer.status === 'Finished'
            ? colors.scan
            : colors.mutedButton;
  const active = printer.status === 'Printing' || printer.status === 'Paused';

  return (
    <View style={styles.card}>
      <View style={styles.statusHeader}>
        <Text style={styles.printerName}>{printer.name}</Text>
        <Text style={[styles.pill, { backgroundColor: pillColor }]}>{printer.status}</Text>
      </View>
      {printer.taskName ? <Text style={styles.taskName}>{printer.taskName}</Text> : null}
      {active && printer.progressPct !== null ? (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, printer.progressPct))}%` }]} />
          </View>
          <Text style={styles.muted}>
            {Math.round(printer.progressPct)}% done
            {printer.remaining ? ` · ${printer.remaining} left` : ''}
            {printer.printWeightG ? ` · ${Math.round(printer.printWeightG)} g job` : ''}
          </Text>
        </>
      ) : null}
    </View>
  );
}

// ---- Connecting to Home Assistant ----

function ConnectForm(props: {
  initial: HaSettings | null;
  onConnected: (s: HaSettings) => void;
  onCancel?: () => void;
}) {
  const styles = useStyles();
  const { colors, dark } = useTheme();
  const [url, setUrl] = useState(props.initial?.url ?? '');
  const [token, setToken] = useState(props.initial?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    const s = { url: normalizeUrl(url), token: token.trim() };
    if (!url.trim() || !s.token) {
      setError('Enter both the address and the token.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await testConnection(s);
      await saveSettings(s);
      props.onConnected(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputProps = {
    style: styles.input,
    placeholderTextColor: colors.placeholder,
    autoCapitalize: 'none' as const,
    autoCorrect: false,
    keyboardAppearance: dark ? ('dark' as const) : ('light' as const),
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connect to Home Assistant</Text>
        <Text style={styles.muted}>
          The app reads your Bambu Lab printer and AMS through Home Assistant&apos;s Bambu Lab
          integration.
        </Text>

        <Text style={styles.label}>Home Assistant address</Text>
        <TextInput
          {...inputProps}
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.10.5:8123"
          keyboardType="url"
        />
        <Text style={styles.hint}>
          {Platform.OS === 'web'
            ? 'The address the Track My Filament server can reach Home Assistant at (the server makes the requests for you).'
            : 'The same address you use in a browser. Away from home, use the address that works over Tailscale.'}
        </Text>

        <Text style={styles.label}>Long-lived access token</Text>
        <TextInput
          {...inputProps}
          value={token}
          onChangeText={setToken}
          placeholder="Paste token"
          secureTextEntry
        />
        <Text style={styles.hint}>
          In Home Assistant: click your name (bottom left) → Security tab → Long-lived access tokens
          → Create token. Name it &quot;Filament app&quot;, copy it, and paste it here.{' '}
          {Platform.OS === 'web'
            ? 'It’s saved on the server for your account only and never shown again.'
            : 'It’s stored in your phone’s secure storage.'}
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.buttonRow}>
          {props.onCancel ? (
            <SmallButton label="Cancel" onPress={props.onCancel} styles={styles} />
          ) : null}
          <Pressable style={styles.primaryButton} onPress={connect} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.primaryText}>Connect</Text>
            )}
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function SmallButton(props: {
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof useStyles>;
}) {
  return (
    <Pressable style={props.styles.smallButton} onPress={props.onPress}>
      <Text style={props.styles.smallText}>{props.label}</Text>
    </Pressable>
  );
}

const useStyles = themedStyles((c) => ({
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardTitle: { fontSize: 17, fontWeight: '600', color: c.text },
  muted: { fontSize: 13, color: c.textMuted },
  footnote: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
  label: { fontSize: 14, color: c.textSecondary, marginTop: 4 },
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
  errorBox: {
    backgroundColor: c.surface,
    borderColor: c.danger,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: c.danger, fontSize: 14 },
  buttonRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', alignItems: 'center' },
  smallButton: {
    backgroundColor: c.track,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  smallText: { fontSize: 14, color: c.text },
  primaryButton: {
    backgroundColor: c.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  printerName: { fontSize: 20, fontWeight: '700', color: c.text, flexShrink: 1 },
  pill: {
    color: c.onAccent,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  taskName: { fontSize: 15, color: c.textSecondary },
  track: { height: 8, backgroundColor: c.track, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: c.primary },
  raw: {
    fontSize: 11,
    color: c.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
}));
