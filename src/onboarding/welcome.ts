import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Whether this phone has seen the welcome screen.
 *
 * One boolean, read once at launch and then held in memory, with subscribers. The
 * gate in app/_layout.tsx and the screen's Get Started button are in different parts
 * of the tree: the first version had the gate read storage once and keep its own copy,
 * so tapping Get Started wrote the flag, navigated home – and the gate, still holding
 * "not seen", sent the person straight back to the welcome. A reload fixed it, which
 * is exactly the kind of bug a tester cannot describe. Marking it seen now updates
 * every subscriber in the same tick, before storage is even written.
 *
 * It is deliberately not part of the move: a move is filed and reset, and the welcome
 * must not come back every time somebody starts a new one. Unreadable storage counts
 * as "seen" – a welcome that reappears on every launch would be the worse bug.
 */
const KEY = 'loadsy.welcome.v1';

type Seen = boolean | null;

let seen: Seen = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Seen): void {
  seen = next;
  for (const listener of listeners) listener();
}

function load(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((value) => set(value === 'seen'))
      .catch(() => set(true));
  }
  return loading;
}

/** Null until storage has been read; then whether the welcome has been seen. */
export function useWelcomeSeen(): Seen {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      void load();
      return () => {
        listeners.delete(listener);
      };
    },
    () => seen,
    () => seen,
  );
}

export async function markWelcomeSeen(): Promise<void> {
  set(true);
  try {
    await AsyncStorage.setItem(KEY, 'seen');
  } catch {
    // Nothing to do: the screen has been dismissed for this launch regardless.
  }
}

/** Tests and the demo's reset: forget, so the welcome shows again. */
export async function resetWelcome(): Promise<void> {
  set(false);
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Same as above.
  }
}
