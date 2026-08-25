import { Link, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MOVE_STATUS_ORDER, type MoveStatus } from '../src/domain/types';
import { TRUCK_LABEL } from '../src/domain/truck';
import { canLeaveInventory, confidenceBannerCopy, unresolvedCount } from '../src/domain/confidence';
import { allItems } from '../src/domain/volume';
import { useMove } from '../src/state/moveStore';
import { Card, PrimaryButton, Screen, SectionLabel } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';

/** Screen 7 — My Move dashboard. 5-step progress tracker bound to MoveStatus. */

interface StepRow {
  status: MoveStatus;
  title: string;
  href: '/inventory' | '/truck' | '/packing' | null;
  detail: (ctx: ReturnType<typeof useMove>) => string;
  /**
   * Why this row cannot be opened yet, or null when it can.
   *
   * The spec's confidence gate is a hard requirement, but it used to be enforced
   * only on Screen 2's own CTA. This row pushed '/truck' unconditionally, so
   * tapping it here produced a full recommendation built on unconfirmed AI
   * dimensions — or on an empty inventory. A gate with a second door is not a gate.
   */
  lockedReason: (ctx: ReturnType<typeof useMove>) => string | null;
}

/** The single reason string, so Screen 7 and Screen 2 can never disagree. */
function inventoryGate(ctx: ReturnType<typeof useMove>): string | null {
  if (allItems(ctx.move).length === 0) return 'Add your inventory first';
  if (!canLeaveInventory(ctx.move)) return confidenceBannerCopy(unresolvedCount(ctx.move));
  return null;
}

const ROWS: StepRow[] = [
  {
    status: 'inventory',
    title: 'Inventory',
    href: '/inventory',
    detail: (ctx) => {
      const count = allItems(ctx.move).length;
      if (count === 0) return 'No items yet — start by photographing a room';
      const unresolved = unresolvedCount(ctx.move);
      return unresolved > 0
        ? `${count} items · ${unresolved} need a quick check`
        : `${count} items · ${ctx.recommendation.rawCuFt} ft³`;
    },
    lockedReason: () => null,
  },
  {
    status: 'truckAndPrice',
    title: 'Truck & Price',
    href: '/truck',
    detail: (ctx) => inventoryGate(ctx) ?? `${TRUCK_LABEL[ctx.recommendation.size]} · estimated prices from 5 vendors`,
    lockedReason: inventoryGate,
  },
  {
    status: 'packingPlan',
    title: 'Packing Plan',
    href: '/packing',
    detail: (ctx) =>
      inventoryGate(ctx) ??
      (ctx.packingPlan
        ? `${ctx.packingPlan.loadSteps.length} load steps ready`
        : 'Build a load order once your inventory is set'),
    lockedReason: inventoryGate,
  },
  {
    // Spec §3 Screen 7: MVP-scope stub. No booking logic behind this.
    status: 'reservations',
    title: 'Reservations',
    href: null,
    detail: () => 'Book directly with the vendor, then check it off here',
    lockedReason: () => null,
  },
  {
    status: 'movingDay',
    title: 'Moving Day',
    href: null,
    detail: () => 'Your day-of checklist — coming together as you go',
    lockedReason: () => null,
  },
];

export default function MyMoveScreen() {
  const ctx = useMove();
  const router = useRouter();
  const currentIndex = MOVE_STATUS_ORDER.indexOf(ctx.move.status);
  const itemCount = allItems(ctx.move).length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Right size truck.{'\n'}Right price. Right plan.</Text>
          <Text style={styles.heroSubtitle}>
            Photograph your rooms and Loadsy works out how much truck you actually need.
          </Text>
        </View>

        <View style={styles.progressTrack} accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: 5, now: currentIndex + 1 }}
          accessibilityLabel={`Step ${currentIndex + 1} of 5`}>
          {MOVE_STATUS_ORDER.map((status, index) => (
            <View
              key={status}
              style={[
                styles.progressSegment,
                index <= currentIndex && styles.progressSegmentDone,
              ]}
            />
          ))}
        </View>
        <Text style={styles.progressCaption}>Step {currentIndex + 1} of 5</Text>

        <SectionLabel>YOUR MOVE</SectionLabel>
        <View style={styles.rows}>
          {ROWS.map((row, index) => {
            const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
            const isStub = row.href === null;
            const locked = row.lockedReason(ctx);
            // Programmatically inert, not merely dimmed — the same standard the
            // spec sets for Screen 2's CTA.
            const blocked = isStub || locked !== null;
            return (
              <Pressable
                key={row.status}
                disabled={blocked}
                onPress={() => row.href && !locked && router.push(row.href)}
                accessibilityRole={blocked ? 'text' : 'button'}
                accessibilityLabel={`${row.title}. ${row.detail(ctx)}`}
                accessibilityState={{ disabled: blocked }}
                accessibilityHint={locked ?? undefined}
                style={({ pressed }) => [styles.row, pressed && !isStub && styles.rowPressed]}
              >
                <View style={[styles.rowBadge, state === 'done' && styles.rowBadgeDone, state === 'current' && styles.rowBadgeCurrent]}>
                  <Text style={[styles.rowBadgeText, state !== 'todo' && styles.rowBadgeTextActive]}>
                    {state === 'done' ? '✓' : index + 1}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    {isStub ? <Text style={styles.rowStub}>SOON</Text> : null}
                  </View>
                  <Text style={styles.rowDetail}>{row.detail(ctx)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Card style={styles.cta}>
          <Text style={styles.ctaTitle}>
            {itemCount === 0 ? 'Start with one room' : 'Add another room'}
          </Text>
          <Text style={styles.ctaBody}>
            Stand in the doorway and frame the whole room, corners included. Loadsy does the rest.
          </Text>
          <PrimaryButton
            title={itemCount === 0 ? 'Capture a room' : 'Capture another room'}
            onPress={() => router.push('/capture')}
          />
        </Card>

        <Link href="/inventory" style={styles.link}>
          <Text style={styles.linkText}>Or add items by hand →</Text>
        </Link>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  hero: { gap: space.sm, marginTop: space.sm },
  heroTitle: { ...type.display, color: colors.text, lineHeight: 38 },
  heroSubtitle: { ...type.body, color: colors.textMuted, lineHeight: 21 },
  progressTrack: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressSegmentDone: { backgroundColor: colors.accent },
  progressCaption: { ...type.caption, color: colors.textDim, marginTop: -space.sm },
  rows: { gap: space.sm },
  row: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  rowPressed: { opacity: 0.7 },
  rowBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBadgeDone: { backgroundColor: colors.accentDim },
  rowBadgeCurrent: { backgroundColor: colors.accent },
  rowBadgeText: { ...type.caption, fontWeight: '700', color: colors.textDim },
  rowBadgeTextActive: { color: colors.text },
  rowBody: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowTitle: { ...type.heading, color: colors.text },
  rowStub: { ...type.label, fontSize: 9, color: colors.textDim },
  rowDetail: { ...type.caption, color: colors.textMuted },
  cta: { gap: space.md },
  ctaTitle: { ...type.heading, color: colors.text },
  ctaBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  link: { alignSelf: 'center', paddingVertical: space.sm },
  linkText: { ...type.body, color: colors.accent },
});
