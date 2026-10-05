import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useAccount } from '../accountContext';
import { showDialog } from '../dialogs';
import { themedStyles, useTheme } from '../theme';
import { api, type AccountUser } from '../webApi';

// Web version: the signed-in person's name in the header, opening their account panel.
export default function AccountButton() {
  const styles = useStyles();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  if (!account) return null;

  return (
    <>
      <Pressable style={styles.headerButton} onPress={() => setOpen(true)}>
        <Text style={styles.headerButtonText}>{account.user.username} ▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <AccountPanel onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function AccountPanel({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const account = useAccount()!;

  return (
    <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
      <View style={styles.panelHeader}>
        <Text style={styles.title}>Account</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>
        Signed in as <Text style={styles.strong}>{account.user.username}</Text>
        {account.user.isAdmin ? ' (admin)' : ''}. Your spools, history and printer connection are
        separate from everyone else&apos;s.
      </Text>

      <ChangePassword />
      {account.user.isAdmin ? <ManagePeople currentUserId={account.user.id} /> : null}

      <Pressable style={styles.secondaryButton} onPress={account.signOut}>
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function ChangePassword() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    try {
      await api('/api/auth/password', { body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      setMessage({ ok: true, text: 'Password changed.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Change your password</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.placeholder}
        value={current}
        onChangeText={setCurrent}
        placeholder="Current password"
        secureTextEntry
        autoComplete="current-password"
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.placeholder}
        value={next}
        onChangeText={setNext}
        placeholder="New password (at least 8 characters)"
        secureTextEntry
        autoComplete="new-password"
      />
      {message ? (
        <Text style={message.ok ? styles.success : styles.error}>{message.text}</Text>
      ) : null}
      <Pressable style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>Change password</Text>
      </Pressable>
    </View>
  );
}

// Admin only: add accounts for others in the house, reset passwords, remove accounts.
function ManagePeople({ currentUserId }: { currentUserId: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [people, setPeople] = useState<AccountUser[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ users: AccountUser[] }>('/api/users').then(
      (r) => !cancelled && setPeople(r.users),
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const fail = (e: unknown) =>
    setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });

  async function add() {
    try {
      await api('/api/users', { body: { username: username.trim(), password, isAdmin: makeAdmin } });
      setMessage({ ok: true, text: `Added ${username.trim()}. Share the password with them.` });
      setUsername('');
      setPassword('');
      setMakeAdmin(false);
      reload();
    } catch (e) {
      fail(e);
    }
  }

  async function resetPassword(person: AccountUser) {
    const pw = window.prompt(`New password for ${person.username} (at least 8 characters):`);
    if (!pw) return;
    try {
      await api(`/api/users/${person.id}/password`, { body: { password: pw } });
      setMessage({ ok: true, text: `Password reset for ${person.username}.` });
    } catch (e) {
      fail(e);
    }
  }

  function remove(person: AccountUser) {
    showDialog(
      `Remove ${person.username}?`,
      'They can no longer sign in. Their data is moved to a "deleted" folder on the server rather than erased, in case you need it back.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/api/users/${person.id}`, { method: 'DELETE' });
              reload();
            } catch (e) {
              fail(e);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>People</Text>
      {people.map((p) => (
        <View key={p.id} style={styles.personRow}>
          <Text style={styles.personName}>
            {p.username}
            {p.isAdmin ? ' · admin' : ''}
            {p.id === currentUserId ? ' · you' : ''}
          </Text>
          <Pressable onPress={() => resetPassword(p)}>
            <Text style={styles.link}>Reset password</Text>
          </Pressable>
          {p.id !== currentUserId ? (
            <Pressable onPress={() => remove(p)}>
              <Text style={styles.danger}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      <Text style={[styles.cardTitle, { marginTop: 8 }]}>Add someone</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.placeholder}
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.placeholder}
        value={password}
        onChangeText={setPassword}
        placeholder="Starting password (they can change it)"
        secureTextEntry
        autoComplete="new-password"
      />
      <Pressable style={styles.checkRow} onPress={() => setMakeAdmin((v) => !v)}>
        <View style={[styles.checkbox, makeAdmin && styles.checkboxOn]}>
          {makeAdmin ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.muted}>Admin (can manage accounts)</Text>
      </Pressable>
      {message ? (
        <Text style={message.ok ? styles.success : styles.error}>{message.text}</Text>
      ) : null}
      <Pressable style={styles.button} onPress={add}>
        <Text style={styles.buttonText}>Add account</Text>
      </Pressable>
    </View>
  );
}

const useStyles = themedStyles((c) => ({
  headerButton: {
    backgroundColor: c.segment,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerButtonText: { fontSize: 14, color: c.text, fontWeight: '600' },
  panel: { flex: 1, backgroundColor: c.background },
  panelContent: {
    padding: 20,
    gap: 16,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: c.text },
  muted: { fontSize: 14, color: c.textSecondary },
  strong: { fontWeight: '700', color: c.text },
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: '600', color: c.text },
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
  button: {
    backgroundColor: c.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: c.text, fontSize: 16 },
  link: { color: c.primary, fontSize: 14, fontWeight: '600' },
  danger: { color: c.danger, fontSize: 14, fontWeight: '600' },
  success: { color: c.good, fontSize: 14 },
  error: { color: c.danger, fontSize: 14 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  personName: { flex: 1, fontSize: 15, color: c.text },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: c.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: c.primary, borderColor: c.primary },
  checkmark: { color: c.onAccent, fontSize: 13, fontWeight: '700' },
}));
