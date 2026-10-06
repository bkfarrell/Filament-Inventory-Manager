import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { AccountContext, type Account } from './accountContext';
import { StoreContext, type Store } from './store';
import { STORE_METHODS } from './storeMethods';
import { themedStyles, useTheme } from './theme';
import { api, onSignedOut, type AccountUser } from './webApi';

// Web version: everyone signs in, and each account's data is kept in its own database
// on the server. The screens get the same "store" as on the phone, but each operation
// is sent to the server instead of a local database.

type AuthState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'setup' } // no accounts yet: create the first (admin) account
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; user: AccountUser };

type ServerState = { needsSetup: boolean; user: AccountUser | null };

function toAuthState(state: ServerState): AuthState {
  if (state.user) return { kind: 'signedIn', user: state.user };
  return state.needsSetup ? { kind: 'setup' } : { kind: 'signedOut' };
}

function createRemoteStore(): Store {
  const entries = STORE_METHODS.map((name) => [
    name,
    async (...args: unknown[]) =>
      (await api<{ result: unknown }>(`/api/store/${name}`, { body: { args } })).result,
  ]);
  return Object.fromEntries(entries) as Store;
}

export default function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ kind: 'loading' });

  const checkState = useCallback(async () => {
    try {
      setAuth(toAuthState(await api<ServerState>('/api/auth/state')));
    } catch (e) {
      setAuth({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<ServerState>('/api/auth/state').then(
      (state) => {
        if (!cancelled) setAuth(toAuthState(state));
      },
      (e: unknown) => {
        if (!cancelled) setAuth({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    );
    const unsubscribe = onSignedOut(() => setAuth({ kind: 'signedOut' }));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const userId = auth.kind === 'signedIn' ? auth.user.id : null;
  // A fresh store per account, so nothing from one person's session carries over.
  const store = useMemo(() => (userId === null ? null : createRemoteStore()), [userId]);

  const account = useMemo<Account | null>(
    () =>
      auth.kind === 'signedIn'
        ? {
            user: auth.user,
            signOut: async () => {
              await api('/api/auth/logout', { body: {} }).catch(() => undefined);
              setAuth({ kind: 'signedOut' });
            },
          }
        : null,
    [auth]
  );

  if (auth.kind === 'signedIn' && store && account) {
    return (
      <AccountContext.Provider value={account}>
        {/* key: remount everything when a different person signs in */}
        <StoreContext.Provider value={store} key={auth.user.id}>
          {children}
        </StoreContext.Provider>
      </AccountContext.Provider>
    );
  }

  return (
    <AuthScreen
      auth={auth}
      onRetry={checkState}
      onSignedIn={(user) => setAuth({ kind: 'signedIn', user })}
    />
  );
}

function AuthScreen(props: {
  auth: AuthState;
  onRetry: () => void;
  onSignedIn: (user: AccountUser) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setup = props.auth.kind === 'setup';

  async function submit() {
    setError('');
    if (!username.trim() || !password) {
      setError('Enter a username and password.');
      return;
    }
    if (setup && password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { user } = await api<{ user: AccountUser }>(setup ? '/api/auth/setup' : '/api/auth/login', {
        body: { username: username.trim(), password },
      });
      props.onSignedIn(user);
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
    onSubmitEditing: submit,
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Track My Filament</Text>

        {props.auth.kind === 'loading' ? <ActivityIndicator /> : null}

        {props.auth.kind === 'error' ? (
          <>
            <Text style={styles.error}>{props.auth.message}</Text>
            <Pressable style={styles.button} onPress={props.onRetry}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </>
        ) : null}

        {setup || props.auth.kind === 'signedOut' ? (
          <>
            <Text style={styles.subtitle}>
              {setup
                ? 'Welcome! Create the first account. It will be the admin account, which can add accounts for everyone else in the house.'
                : 'Sign in to see your filament.'}
            </Text>
            <TextInput
              {...inputProps}
              value={username}
              onChangeText={setUsername}
              placeholder="Username"
              autoComplete="username"
            />
            <TextInput
              {...inputProps}
              value={password}
              onChangeText={setPassword}
              placeholder={setup ? 'Password (at least 8 characters)' : 'Password'}
              secureTextEntry
              autoComplete={setup ? 'new-password' : 'current-password'}
            />
            {setup ? (
              <TextInput
                {...inputProps}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm password"
                secureTextEntry
                autoComplete="new-password"
              />
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.button} onPress={submit} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.buttonText}>{setup ? 'Create account' : 'Sign in'}</Text>
              )}
            </Pressable>
            {!setup ? (
              <Text style={styles.hint}>
                Don&apos;t have an account? Ask whoever runs Track My Filament to add you.
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = themedStyles((c) => ({
  screen: {
    flex: 1,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 26, fontWeight: '700', color: c.text },
  subtitle: { fontSize: 15, color: c.textSecondary },
  hint: { fontSize: 13, color: c.textMuted },
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
  error: { color: c.danger, fontSize: 14 },
  button: {
    backgroundColor: c.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
}));
