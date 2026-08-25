import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchPackingPlan } from '../src/api/packingPlan';
import { guidanceFor } from '../src/domain/itemGuidance';
import { stepForItem } from '../src/domain/packing';
import type { InventoryItem, LoadStep } from '../src/domain/types';
import { allItems, roomCubicFeet } from '../src/domain/volume';
import { useMove } from '../src/state/moveStore';
import { Banner, Card, Chip, PrimaryButton, Screen, SectionLabel } from '../src/ui/components';
import { colors, space, type } from '../src/ui/theme';

/** Screen 5 — Packing Plan. Two tabs: Load Plan and By Room. */

type Tab = 'load' | 'room';

export default function PackingScreen() {
  const router = useRouter();
  const { move, packingPlan, dispatch, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('load');
  /** The inventory a build already failed for, so a retry is not fired in a loop. */
  const [failedFor, setFailedFor] = useState<string | null>(null);

  // Memoised so the effect below can depend on it honestly: allItems() builds a
  // fresh array every call, which would otherwise re-trigger the build forever.
  const items = useMemo(() => allItems(move), [move]);

  /**
   * A stored plan outlives the inventory it was built from, so freshness is decided
   * by WHICH items a plan covers — not how many.
   *
   * Comparing counts meant any edit that preserved the count left the stale plan in
   * place: delete a chair and add a piano, and the Load Plan silently skipped the
   * piano (LoadPlanTab drops ids it cannot resolve) while the By Room tab, which
   * derives from live items, listed it under a step. Two tabs, same item, different
   * answers — and the truck diagram agreed with neither.
   */
  const inventoryKey = useMemo(() => items.map((item) => item.id).sort().join('|'), [items]);
  const plannedKey = useMemo(
    () =>
      packingPlan
        ? packingPlan.loadSteps
            .flatMap((step) => step.itemIds)
            .sort()
            .join('|')
        : null,
    [packingPlan],
  );

  const needsPlan = items.length > 0 && plannedKey !== inventoryKey;
  const failed = failedFor === inventoryKey;
  // Derived, not stored. A `loading` flag would have to be raised synchronously
  // inside the effect, which costs an extra render pass before anything paints.
  const loading = needsPlan && !failed;

  useEffect(() => {
    if (!needsPlan || failed) return;
    let cancelled = false;
    fetchPackingPlan(move.id, items, recommendation.size)
      .then((plan) => {
        if (cancelled) return;
        const covered = plan.loadSteps
          .flatMap((step) => step.itemIds)
          .sort()
          .join('|');
        if (covered !== inventoryKey) {
          // Accepting a plan that does not account for exactly this inventory would
          // leave needsPlan true with nothing in the deps left to change — a
          // permanent spinner, no error, and no reachable retry.
          setFailedFor(inventoryKey);
          return;
        }
        dispatch({ type: 'setPackingPlan', plan });
      })
      .catch(() => {
        if (!cancelled) setFailedFor(inventoryKey);
      });
    // An inventory edited mid-build must not have the older plan land on top of it.
    return () => {
      cancelled = true;
    };
  }, [needsPlan, failed, inventoryKey, move.id, items, recommendation.size, dispatch]);

  // Clearing the flag is what re-runs the effect — no separate trigger needed.
  const retry = useCallback(() => setFailedFor(null), []);

  if (items.length === 0) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <Banner
            tone="neutral"
            title="No inventory yet"
            message="Your load order comes from what you are actually moving. Add a room and we'll build it."
          />
          <PrimaryButton title="Capture a room" onPress={() => router.push('/capture')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.tabs}>
          <Chip label="Load Plan" active={tab === 'load'} onPress={() => setTab('load')} />
          <Chip label="By Room" active={tab === 'room'} onPress={() => setTab('room')} />
        </View>

        {failed ? (
          <Banner
            tone="danger"
            title="Couldn't build the plan"
            message="Something went wrong on our side. Tap below to try again."
          />
        ) : null}

        {/* By Room is derived from the inventory alone, so it stays readable while
            a load plan is still building — the spinner belongs to the other tab. */}
        {tab === 'room' ? (
          <ByRoomTab move={move} />
        ) : loading ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.busyText}>Working out the load order…</Text>
          </View>
        ) : (
          <LoadPlanTab steps={packingPlan?.loadSteps ?? []} items={items} onRetry={retry} failed={failed} />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <PrimaryButton
          title="See the truck layout"
          onPress={() => router.push('/layout-view')}
          disabled={!packingPlan}
        />
      </View>
    </Screen>
  );
}

function LoadPlanTab({
  steps,
  items,
  onRetry,
  failed,
}: {
  steps: LoadStep[];
  items: InventoryItem[];
  onRetry: () => void;
  failed: boolean;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));

  if (steps.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <PrimaryButton title={failed ? 'Try again' : 'Build my plan'} onPress={onRetry} />
      </View>
    );
  }

  return (
    <View style={styles.steps}>
      <Text style={styles.intro}>
        Load back to front. Each step goes in before the one below it — that order is what keeps the
        weight over the axle and the fragile things reachable.
      </Text>

      {steps.map((step) => (
        <Card key={step.id} style={styles.step}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{step.order}</Text>
            </View>
            <Text style={styles.stepTitle}>{step.title}</Text>
          </View>
          <Text style={styles.stepInstruction}>{step.instruction}</Text>
          <View style={styles.stepItems}>
            {step.itemIds.map((itemId) => {
              const item = byId.get(itemId);
              if (!item) return null;
              const guidance = guidanceFor(item);
              return (
                <View key={itemId} style={styles.stepItemBlock}>
                  <View style={styles.stepItem}>
                    <Text style={styles.stepItemName}>{item.name}</Text>
                    <Text style={styles.stepItemMeta}>
                      {item.estimatedWeightClass}
                      {item.isFragile ? ' · fragile' : ''} · {item.cubicFeet} ft³
                    </Text>
                  </View>
                  {guidance ? (
                    <View style={styles.guidance}>
                      <Text style={styles.guidanceLine}>{guidance.orientation}</Text>
                      {guidance.prep ? (
                        <Text style={styles.guidanceLine}>First: {guidance.prep}</Text>
                      ) : null}
                      {guidance.caution ? (
                        <Text style={styles.guidanceCaution}>{guidance.caution}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Card>
      ))}
    </View>
  );
}

function ByRoomTab({ move }: { move: ReturnType<typeof useMove>['move'] }) {
  return (
    <View style={styles.rooms}>
      <Text style={styles.intro}>
        The same items, grouped by where they are now — useful while you are boxing up rather than
        loading.
      </Text>

      {move.rooms.map((room) => (
        <Card key={room.id} style={styles.room}>
          <View style={styles.roomHeader}>
            <Text style={styles.roomName}>{room.name}</Text>
            <Text style={styles.roomTotal}>{roomCubicFeet(room)} ft³</Text>
          </View>
          <SectionLabel>{room.items.length} ITEMS</SectionLabel>
          {room.items.map((item) => (
            <View key={item.id} style={styles.roomItem}>
              <Text style={styles.roomItemName}>{item.name}</Text>
              <Text style={styles.roomItemStep}>Load step {stepForItem(item)}</Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },
  tabs: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  intro: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  busy: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  busyText: { ...type.body, color: colors.textMuted },
  emptyWrap: { padding: space.lg, gap: space.lg, marginTop: space.xl },
  steps: { gap: space.md },
  step: { gap: space.md },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { ...type.caption, fontWeight: '700', color: colors.accentText },
  stepTitle: { ...type.heading, color: colors.text },
  stepInstruction: { ...type.caption, color: colors.textMuted, lineHeight: 20 },
  stepItems: { gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  stepItemBlock: { gap: 2 },
  stepItem: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  guidance: {
    gap: 2,
    paddingLeft: space.md,
    paddingBottom: space.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  guidanceLine: { ...type.caption, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  guidanceCaution: { ...type.caption, color: colors.amber, fontSize: 12, lineHeight: 17 },
  stepItemName: { ...type.caption, color: colors.text, flex: 1 },
  stepItemMeta: { ...type.caption, color: colors.textDim, fontSize: 12 },
  rooms: { gap: space.md },
  room: { gap: space.sm },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  roomName: { ...type.heading, color: colors.text },
  roomTotal: { ...type.caption, color: colors.textMuted },
  roomItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.xs,
  },
  roomItemName: { ...type.caption, color: colors.text, flex: 1 },
  roomItemStep: { ...type.caption, color: colors.textDim, fontSize: 12 },
  footer: {
    padding: space.lg,
    paddingBottom: space.xl,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
