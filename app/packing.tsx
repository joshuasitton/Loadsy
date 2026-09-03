import { useRouter } from 'expo-router';
import { formatCuFt } from '../src/ui/format';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { guidanceFor } from '../src/domain/itemGuidance';
import { renderZoneSVG, zoneAriaLabel } from '../src/truckmap/renderSvg';
import { stepForItem, type LoadStepOrder } from '../src/domain/packing';
import type { InventoryItem, LoadStep, TruckSize } from '../src/domain/types';
import { allItems, roomCubicFeet } from '../src/domain/volume';
import { loadOrderIndex, planLoad } from '../src/truckmap/layout';
import { useEntitlement } from '../src/billing/entitlementStore';
import { PremiumWall } from '../src/ui/PremiumWall';
import { useMove } from '../src/state/moveStore';
import { Banner, Card, Chip, PrimaryButton, Screen, SecondaryButton, SectionLabel } from '../src/ui/components';
import { colors, space, type } from '../src/ui/theme';
import { StepNav } from '../src/ui/StepNav';

/** Screen 5 — Packing Plan. Two tabs: Load Plan and By Room. */

type Tab = 'load' | 'room';

export default function PackingRoute() {
  const { allows } = useEntitlement();
  /*
   * Rendered in place, and BEFORE the screen below it mounts.
   *
   * Not a redirect: a redirect breaks the back button and turns a shared link
   * into a bounce. And not an early return further down either — the body's
   * first act is to solve the load, a few hundred milliseconds of 3D packing,
   * and running that for somebody who is about to be shown a locked door would
   * be both slow and slightly absurd.
   */
  if (!allows('/packing')) return <PremiumWall feature="The Packing Plan" />;
  return <PackingPlanScreen />;
}

function PackingPlanScreen() {
  const router = useRouter();
  const { move, packingPlan, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('load');

  // Memoised because allItems() builds a fresh array every call, and the diagrams
  // below are keyed on it.
  const items = useMemo(() => allItems(move), [move]);

  /**
   * The solved load sequence, so this list and the truck diagram tell the same
   * story in the same order.
   *
   * Memoised on the inventory and the truck because the solve is the most
   * expensive thing either screen does — a few hundred milliseconds for a house
   * move — and this screen re-renders on every tab press.
   */
  const loadOrder = useMemo(
    () => loadOrderIndex(planLoad(items, recommendation.size)),
    [items, recommendation.size],
  );

  /*
   * There is no loading state, no retry and no freshness check any more, because
   * the plan is no longer fetched — useMove() derives it from this same inventory.
   * A plan that cannot lag the inventory cannot need reconciling with it, so the
   * spinner, the failure banner, the convergence guard and the stale-plan
   * comparison all went with the endpoint that made them necessary.
   */

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

        {tab === 'room' ? (
          <ByRoomTab move={move} />
        ) : (
          <LoadPlanTab
            steps={packingPlan?.loadSteps ?? []}
            items={items}
            truckSize={recommendation.size}
            loadOrder={loadOrder}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <SecondaryButton
          title="See the truck layout"
          onPress={() => router.push('/layout-view')}
          disabled={!packingPlan}
        />
        <StepNav current="/packing" />
      </View>
    </Screen>
  );
}

/**
 * Collapses runs of the same item into one row with a count.
 *
 * Six identical box entries, each repeating the same three lines of guidance, is
 * how a plan stops being read. The instructions for one box are the instructions
 * for all six; what the loader needs to know is that there are six.
 *
 * Grouped on name AND volume, so two genuinely different dressers stay separate.
 */
/**
 * The ids of one group, in the order the truck is actually loaded.
 *
 * Anything the solver could not place keeps its position at the end rather than
 * vanishing — it is still in the plan, and a person still has to decide what to
 * do with it.
 */
function orderBySequence(itemIds: string[], loadOrder: Map<string, number>): string[] {
  return [...itemIds].sort(
    (a, b) => (loadOrder.get(a) ?? Infinity) - (loadOrder.get(b) ?? Infinity),
  );
}

function groupIdentical(
  itemIds: string[],
  byId: Map<string, InventoryItem>,
  loadOrder: Map<string, number>,
): { item: InventoryItem; count: number; key: string; first: number; last: number }[] {
  const groups: {
    item: InventoryItem;
    count: number;
    key: string;
    first: number;
    last: number;
  }[] = [];
  for (const id of itemIds) {
    const item = byId.get(id);
    // An id the plan references but the inventory no longer has. The plan is
    // rebuilt whenever the item set changes, so this should be unreachable.
    if (!item) continue;
    // 0 for anything the solver could not place: it is still in the plan, and a
    // person still has to decide what to do with it.
    const position = loadOrder.get(id) ?? 0;
    const previous = groups[groups.length - 1];
    if (
      previous &&
      previous.item.name === item.name &&
      previous.item.cubicFeet === item.cubicFeet
    ) {
      previous.count += 1;
      previous.first = Math.min(previous.first, position);
      previous.last = Math.max(previous.last, position);
    } else {
      groups.push({ item, count: 1, key: id, first: position, last: position });
    }
  }
  return groups;
}

function LoadPlanTab({
  steps,
  items,
  truckSize,
  loadOrder,
}: {
  steps: LoadStep[];
  items: InventoryItem[];
  /**
   * Each piece's place in the solved load sequence.
   *
   * The list is ordered by it, and every row shows its number. Without that the
   * plan said one order and the truck diagram played another — a person reading
   * the plan and a person watching the animation were being told two different
   * things about the same move.
   */
  loadOrder: Map<string, number>;
  /** Drives the bed proportions in each step's diagram. */
  truckSize: TruckSize;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));

  // Unreachable in practice: every item maps to a step, so an empty plan means an
  // empty inventory, which the screen above already handles with its own empty
  // state. There is no longer anything to retry — the plan is derived, not fetched.
  if (steps.length === 0) return null;

  return (
    <View style={styles.steps}>
      <Text style={styles.intro}>
        Carry things in numbered order. The groups explain why: heaviest low and
        forward, then long pieces, then boxes.
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
          {/* Where this step goes, not how the whole truck divides. Scanning a
              five-colour chart for your colour is work the diagram should do. */}
          <View
            style={styles.zoneMap}
            accessibilityRole="image"
            {...(Platform.OS === 'web'
              ? { 'aria-label': zoneAriaLabel(items, truckSize, step.order as LoadStepOrder) }
              : {
                  accessible: true,
                  accessibilityLabel: zoneAriaLabel(items, truckSize, step.order as LoadStepOrder),
                })}
          >
            <SvgXml
              xml={renderZoneSVG(items, truckSize, step.order as LoadStepOrder)}
              override={{ width: '100%', height: '100%' }}
            />
          </View>
          <View style={styles.stepItems}>
            {groupIdentical(orderBySequence(step.itemIds, loadOrder), byId, loadOrder).map(
              ({ item, count, key, first, last }) => {
              const guidance = guidanceFor(item);
              return (
                <View key={key} style={styles.stepItemBlock}>
                  <View style={styles.stepItem}>
                    <Text style={styles.stepItemName}>
                      {/*
                        The same number the truck diagram counts up to, so the two
                        can be followed side by side. Ranges are not always
                        contiguous — where the solve interleaves groups, the gap
                        is the honest picture of it.
                      */}
                      <Text style={styles.stepItemNumber}>
                        {first === 0 ? '—' : first === last ? `${first}` : `${first}–${last}`}.{' '}
                      </Text>
                      {item.name}
                      {count > 1 ? ` × ${count}` : ''}
                    </Text>
                    <Text style={styles.stepItemMeta}>
                      {item.estimatedWeightClass}
                      {item.isFragile ? ' · fragile' : ''} ·{' '}
                      {count > 1
                        ? `${formatCuFt(item.cubicFeet * count)} ft³ total`
                        : `${formatCuFt(item.cubicFeet)} ft³`}
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
              },
            )}
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
            <Text style={styles.roomTotal}>{formatCuFt(roomCubicFeet(room))} ft³</Text>
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
  zoneMap: { height: 96, marginTop: space.sm, marginBottom: space.xs },
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
  stepItemNumber: { color: colors.textDim, fontWeight: '400' },
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
