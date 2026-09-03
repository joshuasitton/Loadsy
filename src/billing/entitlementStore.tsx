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
import { DEMO_MODE } from '../demo/mode';
import { unlocks, type GatedRoute, type Tier } from '../domain/tier';
import { honour, PREMIUM_FOR_SALE } from './tier';

/**
 * Which tier the person using the app is on.
 *
 * For the MVP the answer is always Free, and this store exists to make that
 * answer come from one place rather than from five screens each deciding for
 * themselves. Two things can change it, and both are deliberate:
 *
 *  - `PREMIUM_FOR_SALE`, once there is something to sell. Today it is false and
 *    nothing sets it, so nothing here can grant Premium in a store build.
 *  - `DEMO_MODE`, which lets a demo flip between the two tiers on the spot. The
 *    3D solver is the most convincing thing Loadsy does; a pitch that could only
 *    show the locked door would be arguing for the product without showing it.
 *
 * The invariant that matters is the conjunction: a build with neither flag can
 * never report Premium, whatever is sitting in storage. `__tests__/tier.test.ts`
 * pins it, because a stored `{"tier":"premium"}` is one line of devtools away
 * and a shipped build must not honour it.
 */

const KEY = 'loadsy.entitlement.v1';

interface EntitlementValue {
  tier: Tier;
  /** True when the tier can be changed by hand — the demo preview toggle. */
  canPreview: boolean;
  /** True when Premium is something a person could actually buy. False for MVP. */
  forSale: boolean;
  setTier: (tier: Tier) => void;
  /** Whether this person has asked to be told when Premium ships. */
  interested: boolean;
  registerInterest: () => void;
  /** The one question every gated screen asks. */
  allows: (route: GatedRoute) => boolean;
}

const EntitlementContext = createContext<EntitlementValue | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [tier, setTierState] = useState<Tier>('free');
  const [interested, setInterested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = parseStored(await AsyncStorage.getItem(KEY));
        if (cancelled || !stored) return;
        setInterested(stored.interested);
        // Storage can ask for Premium. `honour` is what decides whether this
        // build says yes, and it is the only thing that decides it.
        setTierState(honour(stored.tier));
      } catch {
        // Unreadable storage means Free, never a crash. Free is the safe answer
        // in both directions: it withholds nothing a paying user paid for today,
        // because today nobody has.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTier = useCallback((next: Tier) => {
    const granted = honour(next);
    // Persist what was granted, not what was asked for. Writing the request
    // would leave a build that refuses Premium storing a claim to it, waiting
    // for a build that does not refuse.
    setTierState(granted);
    void persist({ tier: granted });
  }, []);

  const registerInterest = useCallback(() => {
    setInterested(true);
    void persist({ interested: true });
  }, []);

  const allows = useCallback((route: GatedRoute) => unlocks(tier, route), [tier]);

  const value = useMemo(
    () => ({
      tier,
      canPreview: DEMO_MODE,
      forSale: PREMIUM_FOR_SALE,
      setTier,
      interested,
      registerInterest,
      allows,
    }),
    [tier, setTier, interested, registerInterest, allows],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementValue {
  const context = useContext(EntitlementContext);
  if (!context) throw new Error('useEntitlement must be used inside an EntitlementProvider');
  return context;
}

/**
 * Merged, not replaced.
 *
 * The two fields are written by different actions — flipping the demo toggle and
 * tapping "tell me when it ships" — and a plain overwrite from either would
 * silently drop the other.
 */
async function persist(patch: { tier?: Tier; interested?: boolean }): Promise<void> {
  try {
    const current = parseStored(await AsyncStorage.getItem(KEY)) ?? {
      tier: 'free' as Tier,
      interested: false,
    };
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // A preference that does not survive a reload is a smaller problem than a
    // crash on a screen the user was reading.
  }
}

function parseStored(raw: string | null): { tier: Tier; interested: boolean } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { tier, interested } = parsed as Record<string, unknown>;
    return {
      tier: tier === 'premium' ? 'premium' : 'free',
      interested: interested === true,
    };
  } catch {
    return null;
  }
}
