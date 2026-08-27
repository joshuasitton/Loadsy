import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { guidanceFor } from '../src/domain/itemGuidance';
import { renderZoneSVG, zoneAriaLabel } from '../src/truckmap/renderSvg';
import { stepForItem, type LoadStepOrder } from '../src/domain/packing';
import type { InventoryItem, LoadStep, TruckSize } from '../src/domain/types';
import { allItems, roomCubicFeet } from '../src/domain/volume';
import { useMove } from '../src/state/moveStore';
import { Banner, Card, Chip, PrimaryButton, Screen, SectionLabel } from '../src/ui/components';
import { colors, space, type } from '../src/ui/theme';
import { StepNav } from '../src/ui/StepNav';

/** Screen 5 — Packing Plan. Two tabs: Load Plan and By Room. */

type Tab = 'load' | 'room';

export default function PackingScreen() {
  const router = useRouter();
  const { move, packingPlan, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('load');

  // Memoised because allItems() builds a fresh array every call, and the diagrams
  // below are keyed on it.
  const items = useMemo(() => allItems(move), [move]);

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
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <PrimaryButton
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
function groupIdentical(
  itemIds: string[],
  byId: Map<string, InventoryItem>,
): { item: InventoryItem; count: number; key: string }[] {
  const groups: { item: InventoryItem; count: number; key: string }[] = [];
  for (const id of itemIds) {
    const item = byId.get(id);
    // An id the plan references but the inventory no longer has. The plan is
    // rebuilt whenever the item set changes, so this should be unreachable.
    if (!item) continue;
    const last = groups[groups.length - 1];
    if (last && last.item.name === item.name && last.item.cubicFeet === item.cubicFeet) {
      last.count += 1;
    } else {
      groups.push({ item, count: 1, key: id });
    }
  }
  return groups;
}

function LoadPlanTab({
  steps,
  items,
  truckSize,
}: {
  steps: LoadStep[];
  items: InventoryItem[];
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
            {groupIdentical(step.itemIds, byId).map(({ item, count, key }) => {
              const guidance = guidanceFor(item);
              return (
                <View key={key} style={styles.stepItemBlock}>
                  <View style={styles.stepItem}>
                    <Text style={styles.stepItemName}>
                      {item.name}
                      {count > 1 ? ` × ${count}` : ''}
                    </Text>
                    <Text style={styles.stepItemMeta}>
                      {item.estimatedWeightClass}
                      {item.isFragile ? ' · fragile' : ''} ·{' '}
                      {count > 1
                        ? `${Math.round(item.cubicFeet * count * 100) / 100} ft³ total`
                        : `${item.cubicFeet} ft³`}
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
