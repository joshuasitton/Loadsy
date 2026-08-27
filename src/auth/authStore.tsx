import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  signInWithGoogle as demoGoogle,
  signInWithPassword as demoPassword,
  type DemoUser,
} from './demoCredentials';

const SESSION_KEY = 'loadsy.session.v1';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  user: DemoUser | null;
  /** Resolves to null on success, or a message to show under the fields. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<DemoUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (cancelled) return;
        const restored = parseSession(raw);
        setUser(restored);
        setStatus(restored ? 'signedIn' : 'signedOut');
      } catch {
        // Unreadable storage means signed out, never a crash. The whole session
        // is one small object that costs a tap to recreate.
        if (!cancelled) setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = useCallback(async (next: DemoUser) => {
    setUser(next);
    setStatus('signedIn');
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)).catch(() => {
      // A session that does not survive a reload is a worse demo, not a broken
      // one. Never let it block the sign-in that already succeeded.
    });
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = demoPassword(email, password);
      if (!result.ok) return result.reason;
      await complete(result.user);
      return null;
    },
    [complete],
  );

  const signInWithGoogle = useCallback(async () => {
    const result = demoGoogle();
    if (!result.ok) return result.reason;
    await complete(result.user);
    return null;
  }, [complete]);

  const signOut = useCallback(async () => {
    setUser(null);
    setStatus('signedOut');
    await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signInWithGoogle, signOut }),
    [status, user, signIn, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

/**
 * Validated on the way out of storage, like every other persisted payload in this
 * app. A truncated or hand-edited session must read as "signed out" rather than
 * hydrate a user object with missing fields into the screens.
 */
function parseSession(raw: string | null): DemoUser | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { email, displayName, provider } = parsed as Record<string, unknown>;
    if (typeof email !== 'string' || email === '') return null;
    if (typeof displayName !== 'string' || displayName === '') return null;
    if (provider !== 'password' && provider !== 'google') return null;
    return { email, displayName, provider };
  } catch {
    return null;
  }
}
