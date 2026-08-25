import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
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
import { buildRecommendation } from '../domain/truck';
import { DEFAULT_PACKING_BUFFER_PCT } from '../domain/volume';

const STORAGE_KEY = 'loadsy.move.v1';

export interface MoveState {
  move: Move;
  packingPlan: PackingPlan | null;
  hydrated: boolean;
}

type Action =
  | { type: 'hydrate'; payload: { move: Move; packingPlan: PackingPlan | null } }
  | { type: 'hydrateFailed' }
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
  | { type: 'setPackingPlan'; plan: PackingPlan }
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

const initialState: MoveState = { move: newMove(), packingPlan: null, hydrated: false };

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
        packingPlan: action.payload.packingPlan,
        hydrated: true,
      };

    case 'hydrateFailed':
      return { ...state, hydrated: true };

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

    case 'setPackingPlan':
      return { ...state, packingPlan: action.plan };

    case 'reset':
      return { move: newMove(), packingPlan: null, hydrated: true };
  }
}

interface MoveContextValue extends MoveState {
  dispatch: React.Dispatch<Action>;
  recommendation: ReturnType<typeof buildRecommendation>;
  previewSize: (size: TruckSize) => void;
}

const MoveContext = createContext<MoveContextValue | null>(null);

export function MoveProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

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
        const parsed = JSON.parse(raw) as { move: Move; packingPlan: PackingPlan | null };
        dispatch({ type: 'hydrate', payload: { move: parsed.move, packingPlan: parsed.packingPlan ?? null } });
      } catch {
        // A corrupt payload must not brick the app — start clean instead.
        if (!cancelled) dispatch({ type: 'hydrateFailed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ move: state.move, packingPlan: state.packingPlan }),
    ).catch(() => {
      // Persistence is best-effort; losing it must never interrupt the user.
    });
  }, [state.move, state.packingPlan, state.hydrated]);

  const recommendation = useMemo(() => buildRecommendation(state.move), [state.move]);

  // Preview is intentionally a no-op on state: chips never change the recommendation.
  const previewSize = useCallback((_size: TruckSize) => {}, []);

  const value = useMemo(
    () => ({ ...state, dispatch, recommendation, previewSize }),
    [state, recommendation, previewSize],
  );

  return <MoveContext.Provider value={value}>{children}</MoveContext.Provider>;
}

export function useMove(): MoveContextValue {
  const context = useContext(MoveContext);
  if (!context) throw new Error('useMove must be used inside a MoveProvider');
  return context;
}
