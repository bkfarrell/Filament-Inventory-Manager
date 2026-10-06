// Talking to the Track My Filament server (web version only).

export type AccountUser = { id: number; username: string; isAdmin: boolean };

type Listener = () => void;
const signedOutListeners = new Set<Listener>();

// Lets the sign-in screen know when the server says the session has ended.
export function onSignedOut(listener: Listener) {
  signedOutListeners.add(listener);
  return () => {
    signedOutListeners.delete(listener);
  };
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: {
        'X-TMF-Request': '1', // tells the server this request came from the app itself
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("Couldn't reach the Track My Filament server. Is it running?");
  }
  const data = res.headers.get('Content-Type')?.includes('application/json')
    ? await res.json()
    : null;
  if (res.status === 401 && path !== '/api/auth/login') {
    signedOutListeners.forEach((l) => l());
  }
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error ?? `Server error (${res.status}).`);
  }
  return data as T;
}
