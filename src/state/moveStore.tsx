import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import type {
  InventoryItem,
  Move,
  MoveStatus,
  PackingPlan,
  Room,
  TruckSize,
} from '../domain/types';
import { buildPackingPlan } from '../domain/packingPlan';
import { parseStoredState } from './persistence';
import { buildRecommendation } from '../domain/truck';
import { allItems, DEFAULT_PACKING_BUFFER_PCT } from '../domain/volume';

const STORAGE_KEY = 'loadsy.move.v1';
/**
 * Where an unreadable payload is moved before a fresh move takes its place. Writing
 * over it would destroy the only copy of the user's inventory on the very launch
 * they most need it back.
 */
const QUARANTINE_KEY = 'loadsy.move.v1.unreadable';

export interface MoveState {
  move: Move;
  hydrated: boolean;
  /**
   * False when this launch could not read storage at all. The app still runs on a
   * fresh move, but must not write it back: the stored data is probably intact and
   * simply unreadable right now, and overwriting it would turn a transient read
   * failure into permanent loss.
   */
  persistable: boolean;
}

type Action =
  | { type: 'hydrate'; payload: { move: Move } }
  /** Nothing stored, or nothing salvageable. Safe to start clean and persist. */
  | { type: 'hydrateFailed' }
  /** Storage could not be read at all. Start clean but never persist over it. */
  | { type: 'hydrateUnavailable' }
  | { type: 'addRoom'; id: string; name: string }
  | { type: 'renameRoom'; roomId: string; name: string }
  | { type: 'removeRoom'; roomId: string }
  | { type: 'addPhoto'; roomId: string; photoId: string }
  | { type: 'addItems'; roomId: string; items: InventoryItem[] }
  | { type: 'updateItem'; item: InventoryItem }
  | { type: 'removeItem'; itemId: string }
  | { type: 'setBuffer'; pct: number }
  | { type: 'setOriginZip'; zip: string }
  | { type: 'setDestinationZip'; zip: string | null }
  | { type: 'setMoveDate'; iso: string | null }
  | { type: 'setStatus'; status: MoveStatus }
  /**
   * Replace the whole move with one built elsewhere. Demo scenarios use this, and
   * it is deliberately the same path hydration takes — a loaded scenario is
   * ordinary state, indistinguishable downstream from a photographed move.
   */
  | { type: 'loadMove'; move: Move }
  | { type: 'reset' };

function newMove(): Move {
  return {
    id: `move-${Date.now()}`,
    rooms: [],
    packingBufferPct: DEFAULT_PACKING_BUFFER_PCT,
    recommendedTruckSize: 'van',
    originZip: '',
    destinationZip: null,
    moveDate: null,
    status: 'inventory',
  };
}

const initialState: MoveState = {
  move: newMove(),
  hydrated: false,
  persistable: true,
};

/**
 * The recommendation is derived, never user-set: spec §3 Screen 3 says tapping a
 * different size chip previews capacity and must NOT change the recommendation.
 * Recomputing it on every mutation is what makes that impossible to get wrong.
 */
function withRecommendation(move: Move): Move {
  return { ...move, recommendedTruckSize: buildRecommendation(move).size };
}

function mapRoom(move: Move, roomId: string, fn: (room: Room) => Room): Move {
  return { ...move, rooms: move.rooms.map((r) => (r.id === roomId ? fn(r) : r)) };
}

function reducer(state: MoveState, action: Action): MoveState {
  switch (action.type) {
    case 'hydrate':
      return {
        move: withRecommendation(action.payload.move),
        hydrated: true,
        persistable: true,
      };

    case 'hydrateFailed':
      return { ...state, hydrated: true, persistable: true };

    case 'hydrateUnavailable':
      return { ...state, hydrated: true, persistable: false };

    case 'addRoom': {
      // The id is supplied by the caller, not generated here: screens need to
      // reference the new room in the same tick they create it, and reading it
      // back out of state would read a stale render.
      if (state.move.rooms.some((r) => r.id === action.id)) return state;
      const room: Room = { id: action.id, name: action.name, photoIds: [], items: [] };
      return { ...state, move: withRecommendation({ ...state.move, rooms: [...state.move.rooms, room] }) };
    }

    case 'renameRoom':
      return { ...state, move: mapRoom(state.move, action.roomId, (r) => ({ ...r, name: action.name })) };

    case 'removeRoom':
      return {
        ...state,
        move: withRecommendation({
          ...state.move,
          rooms: state.move.rooms.filter((r) => r.id !== action.roomId),
        }),
      };

    case 'addPhoto':
      return {
        ...state,
        move: mapRoom(state.move, action.roomId, (r) => ({
          ...r,
          photoIds: r.photoIds.includes(action.photoId) ? r.photoIds : [...r.photoIds, action.photoId],
        })),
      };

    case 'addItems':
      return {
        ...state,
        move: withRecommendation(
          mapRoom(state.move, action.roomId, (r) => ({ ...r, items: [...r.items, ...action.items] })),
        ),
      };

    case 'updateItem':
      return {
        ...state,
        move: withRecommendation({
          ...state.move,
          rooms: state.move.rooms.map((room) => ({
            ...room,
            items: room.items.map((i) => (i.id === action.item.id ? action.item : i)),
          })),
        }),
      };

    case 'removeItem':
      return {
        ...state,
        move: withRecommendation({
          ...state.move,
          rooms: state.move.rooms.map((room) => ({
            ...room,
            items: room.items.filter((i) => i.id !== action.itemId),
          })),
        }),
      };

    case 'setBuffer':
      return { ...state, move: withRecommendation({ ...state.move, packingBufferPct: action.pct }) };

    case 'setOriginZip':
      return { ...state, move: { ...state.move, originZip: action.zip } };

    case 'setDestinationZip':
      return { ...state, move: { ...state.move, destinationZip: action.zip } };

    case 'setMoveDate':
      return { ...state, move: { ...state.move, moveDate: action.iso } };

    case 'setStatus':
      return { ...state, move: { ...state.move, status: action.status } };

    case 'loadMove':
      return { move: withRecommendation(action.move), hydrated: true, persistable: true };

    case 'reset':
      // An explicit user-initiated wipe is always safe to persist.
      return { move: newMove(), hydrated: true, persistable: true };
  }
}

interface MoveContextValue extends MoveState {
  /** Derived from the inventory on every change. Null when there is nothing to load. */
  packingPlan: PackingPlan | null;
  /** ISO-8601 of the last successful write to this device, or null if never. */
  lastSavedAt: string | null;
  dispatch: React.Dispatch<Action>;
  recommendation: ReturnType<typeof buildRecommendation>;
  previewSize: (size: TruckSize) => void;
}

const MoveContext = createContext<MoveContextValue | null>(null);

export function MoveProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  /**
   * When the move was last written to this device, ISO-8601.
   *
   * Deliberately outside the reducer: it is a fact about storage, not about the
   * move, and putting a timestamp in reducer state would make every action
   * non-deterministic and untestable. It also must not be a dependency of the
   * persist effect below, or writing it would schedule another write.
   */
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (!raw) {
          dispatch({ type: 'hydrateFailed' });
          return;
        }

        // Validated, never trusted. The payload can predate the current shape, or
        // have been truncated by a kill mid-write; feeding it straight to the
        // reducer threw during render, which no try/catch out here could reach.
        const parsed = parseStoredState(raw);
        if (parsed === null) {
          // Nothing salvageable. Preserve the original before a clean move starts
          // overwriting the slot, so the data is still recoverable off-device.
          await AsyncStorage.setItem(QUARANTINE_KEY, raw).catch(() => {});
          if (!cancelled) dispatch({ type: 'hydrateFailed' });
          return;
        }
        if (__DEV__ && parsed.repairs.length > 0) {
          console.warn('[loadsy] repaired stored move:', parsed.repairs.join('; '));
        }
        setLastSavedAt(parsed.savedAt);
        dispatch({
          type: 'hydrate',
          // parsed.packingPlan is deliberately ignored. Plans are derived from the
          // inventory now, so a stored one is at best redundant and at worst a
          // description of an inventory the user has since edited.
          payload: { move: parsed.move },
        });
      } catch {
        // Reaching here means storage itself failed, not the payload. Do NOT mark
        // hydrated: that would release the persist effect below to write an empty
        // move over data we were simply unable to read this launch.
        if (!cancelled) dispatch({ type: 'hydrateUnavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated || !state.persistable) return;
    const savedAt = new Date().toISOString();
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ move: state.move, savedAt }))
      .then(() => setLastSavedAt(savedAt))
      .catch(() => {
        // Persistence is best-effort; losing it must never interrupt the user.
        // Leaving lastSavedAt on its previous value is the honest outcome: the
        // last successful save really was the one it already names.
      });
  }, [state.move, state.hydrated, state.persistable]);

  const recommendation = useMemo(() => buildRecommendation(state.move), [state.move]);

  /**
   * Derived, never stored. Consumers read it exactly as before, but it is now a
   * function of the current inventory rather than a copy of a past one — which is
   * what makes "the plan describes a different move" impossible to express.
   */
  const packingPlan = useMemo(
    () => buildPackingPlan(state.move.id, allItems(state.move), recommendation.size),
    [state.move, recommendation.size],
  );

  // Preview is intentionally a no-op on state: chips never change the recommendation.
  const previewSize = useCallback((_size: TruckSize) => {}, []);

  const value = useMemo(
    () => ({ ...state, packingPlan, lastSavedAt, dispatch, recommendation, previewSize }),
    [state, packingPlan, lastSavedAt, recommendation, previewSize],
  );

  return <MoveContext.Provider value={value}>{children}</MoveContext.Provider>;
}

export function useMove(): MoveContextValue {
  const context = useContext(MoveContext);
  if (!context) throw new Error('useMove must be used inside a MoveProvider');
  return context;
}
