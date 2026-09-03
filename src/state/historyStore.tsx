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
  addCompleted,
  parseHistory,
  removeCompleted,
  summariseMove,
  type CompletedMove,
} from '../domain/moveHistory';
import type { Move, TruckSize } from '../domain/types';

const HISTORY_KEY = 'loadsy.history.v1';

interface HistoryValue {
  history: CompletedMove[];
  loaded: boolean;
  /** Archives the move as it stands and returns the record written. */
  complete: (move: Move, truckSize: TruckSize) => Promise<CompletedMove>;
  remove: (id: string) => Promise<boolean>;
}

const HistoryContext = createContext<HistoryValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<CompletedMove[]>([]);
  const [loaded, setLoaded] = useState(false);
  /**
   * False when storage could not be read this launch. The same rule the move
   * store follows: run on an empty list, but never write over data that is
   * probably intact and merely unreadable right now. Past moves cannot be
   * recreated by the user, so overwriting them is the one unrecoverable mistake
   * available here.
   */
  const [writable, setWritable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (cancelled) return;
        setHistory(parseHistory(raw));
      } catch {
        if (!cancelled) setWritable(false);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: CompletedMove[]): Promise<boolean> => {
      setHistory(next);
      if (!writable) return true;
      try {
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return true;
      } catch {
        // Best effort, like every other write in this app. A failed save must
        // never interrupt the user in the middle of finishing a move.
        return false;
      }
    },
    [writable],
  );

  const complete = useCallback(
    async (move: Move, truckSize: TruckSize) => {
      // The clock is read here, at the edge, and passed in. summariseMove stays
      // pure so the archiving rules can be asserted on.
      const record = summariseMove(move, truckSize, new Date().toISOString());
      await persist(addCompleted(history, record));
      return record;
    },
    [history, persist],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const next = removeCompleted(history, id);
      const ok = await persist(next);
      if (!ok) {
        // Roll back — the write didn't stick, so restore the previous list
        // to avoid the item disappearing now and reappearing on next launch.
        setHistory(history);
      }
      return ok;
    },
    [history, persist],
  );

  const value = useMemo(
    () => ({ history, loaded, complete, remove }),
    [history, loaded, complete, remove],
  );

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryValue {
  const context = useContext(HistoryContext);
  if (!context) throw new Error('useHistory must be used inside a HistoryProvider');
  return context;
}
