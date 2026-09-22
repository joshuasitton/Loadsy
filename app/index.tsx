import { Link, useRouter } from 'expo-router';
import { Fragment, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MOVE_STATUS_ORDER, type MoveStatus } from '../src/domain/types';
import { dashboardRows, isPremiumRoute, type GatedRoute } from '../src/domain/tier';
import { PRIVACY_PATH, SUPPORT_PATH } from '../src/domain/site';
import { TRUCK_LABEL } from '../src/domain/truck';
import { inventoryBlockedReason, unresolvedCount, unresolvedDuplicates } from '../src/domain/confidence';
import { allItems } from '../src/domain/volume';
import { useEntitlement } from '../src/billing/entitlementStore';
import { DemoBar } from '../src/demo/DemoBar';
import { useHistory } from '../src/state/historyStore';
import { useMove } from '../src/state/moveStore';
import { Card, PrimaryButton, Screen, SectionLabel } from '../src/ui/components';
import { formatCuFt, formatDateTime } from '../src/ui/format';
import { colors, radius, space, type } from '../src/ui/theme';

/** Screen 7 — My Move dashboard. One row per screen, bound to MoveStatus. */

interface RowCopy {
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

function inventoryGate(ctx: ReturnType<typeof useMove>): string | null {
  return inventoryBlockedReason(ctx.move);
}

/**
 * What a locked row says instead of its own summary.
 *
 * The unlocked copy describes a result — "12 load steps ready" — and printing
 * that under a lock would be advertising a thing the tap will not deliver.
 */
function premiumDetail(row: { route: GatedRoute | null; status: MoveStatus }): string {
  if (row.route === '/layout-view') return 'The load, drawn from the side and from above';
  switch (row.status) {
    case 'packingPlan':
      return 'The order to load it in, and where each piece goes';
    case 'reservations':
      return 'Hold the truck you picked and keep the confirmation here';
    default:
      return 'Your day-of checklist, built from your own load order';
  }
}

/**
 * The words for each row. The rows themselves – which screens, in what order – come
 * from the domain (`dashboardRows`), so a screen cannot be in the flow and missing
 * here. Keyed by route for screens and by status for the two stubs.
 */
const COPY: Record<GatedRoute | 'reservations' | 'movingDay', RowCopy> = {
  '/inventory': {
    detail: (ctx) => {
      const count = allItems(ctx.move).length;
      if (count === 0) return 'No items yet — start by taking photos';
      const unresolved = unresolvedCount(ctx.move) + unresolvedDuplicates(ctx.move).length;
      return unresolved > 0
        ? `${count} items · ${unresolved} need a quick check`
        : `${count} items · ${formatCuFt(ctx.recommendation.rawCuFt)} ft³`;
    },
    lockedReason: () => null,
  },
  '/truck': {
    detail: (ctx) => inventoryGate(ctx) ?? `${TRUCK_LABEL[ctx.recommendation.size]} · with the 15% reserve`,
    lockedReason: inventoryGate,
  },
  '/rent': {
    detail: (ctx) => inventoryGate(ctx) ?? `Who rents a ${TRUCK_LABEL[ctx.recommendation.size]}, and near you`,
    lockedReason: inventoryGate,
  },
  '/packing': {
    detail: (ctx) =>
      inventoryGate(ctx) ??
      (ctx.packingPlan
        ? `${ctx.packingPlan.loadSteps.length} load steps ready`
        : 'Build a load order once your inventory is set'),
    lockedReason: inventoryGate,
  },
  '/layout-view': {
    detail: (ctx) =>
      inventoryGate(ctx) ??
      (ctx.packingPlan ? 'The load, drawn from the side and from above' : 'Drawn once the load order exists'),
    lockedReason: inventoryGate,
  },
  // Spec §3 Screen 7: MVP-scope stubs. No booking logic behind these.
  reservations: {
    detail: () => 'Book directly with the vendor, then check it off here',
    lockedReason: () => null,
  },
  movingDay: {
    detail: () => 'Your day-of checklist — coming together as you go',
    lockedReason: () => null,
  },
};

export default function MyMoveScreen() {
  const ctx = useMove();
  const { tier, premiumPresent } = useEntitlement();
  const { history, complete } = useHistory();
  const router = useRouter();
  /*
   * One row per screen, from the domain. With Premium present the two stubs follow –
   * they are what the wall promises. Without it, a release with nothing to sell must
   * not show "SOON" rows it cannot deliver (guideline 2.1).
   *
   * A row is done when its stage is behind the move's, current when it is the move's
   * stage – two rows can share a stage (Truck Size and Where to Rent), and both read as
   * current – and to-do otherwise. The bar counts rows, and "Step n" is the first
   * current row.
   */
  const rows = dashboardRows(premiumPresent);
  const stage = MOVE_STATUS_ORDER.indexOf(ctx.move.status);
  const rowState = (status: MoveStatus): 'done' | 'current' | 'todo' => {
    const at = MOVE_STATUS_ORDER.indexOf(status);
    return at < stage ? 'done' : at === stage ? 'current' : 'todo';
  };
  const currentIndex = Math.max(0, rows.findIndex((row) => rowState(row.status) === 'current'));
  const itemCount = allItems(ctx.move).length;

  // Two taps rather than a system alert: finishing a move clears the inventory,
  // and Alert.alert is a no-op on react-native-web, where this app's demo runs.
  const [confirmingFinish, setConfirmingFinish] = useState(false);

  const finishing = useRef(false);

  async function finishMove() {
    if (finishing.current) return;
    finishing.current = true;
    try {
      // Archive first, reset second. The other order would wipe the inventory and
      // then try to summarise the empty move that replaced it.
      await complete(ctx.move, ctx.recommendation.size);
      ctx.dispatch({ type: 'reset' });
      setConfirmingFinish(false);
      router.push('/history');
    } catch {
      // Let the user retry — the two-tap buttons are still visible.
      finishing.current = false;
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Right size truck.{'\n'}Right price. Right plan.</Text>
          <Text style={styles.heroSubtitle}>
            Photograph what you&apos;re moving and Loadsy works out how much truck you actually need.
          </Text>
        </View>

        <DemoBar />

        <View style={styles.progressTrack} accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: rows.length, now: currentIndex + 1 }}
          accessibilityLabel={`Step ${currentIndex + 1} of ${rows.length}`}>
          {rows.map((row) => (
            <View
              key={row.title}
              style={[
                styles.progressSegment,
                rowState(row.status) !== 'todo' && styles.progressSegmentDone,
              ]}
            />
          ))}
        </View>
        <Text style={styles.progressCaption}>Step {currentIndex + 1} of {rows.length}</Text>

        <SectionLabel>YOUR MOVE</SectionLabel>
        <View style={styles.rows}>
          {rows.map((row, index) => {
            const state = rowState(row.status);
            const isStub = row.route === null;
            const copy = COPY[row.route ?? (row.status as 'reservations' | 'movingDay')];
            const locked = copy.lockedReason(ctx);
            // Only a Premium row in a build where Premium exists; otherwise the row
            // is an ordinary step and draws no tier line.
            const premium = premiumPresent && (row.route === null || isPremiumRoute(row.route));
            const previousPremium =
              index > 0 && (rows[index - 1]!.route === null || isPremiumRoute(rows[index - 1]!.route!));
            /*
             * Behind the paywall for this account — which makes the row MORE
             * interactive, not less. It is the one place the wall is worth
             * opening from, so it stays a live button and leads there instead of
             * to the screen it names.
             */
            const gated = premium && tier === 'free';
            // Programmatically inert, not merely dimmed — the same standard the
            // spec sets for Screen 2's CTA.
            const blocked = !gated && (isStub || locked !== null);
            /*
             * Only what the divider above does not already say. Everything below
             * the rule is Premium, so repeating it on each row is noise; "SOON"
             * is the part that differs — Reservations and Moving Day are not
             * written yet, and a Premium account would not find them either.
             */
            const tag = isStub ? 'SOON' : null;
            const detail = gated && locked === null ? premiumDetail(row) : copy.detail(ctx);
            return (
              <Fragment key={row.title}>
                {/*
                  Drawn once, where the free app ends. Two tiers scattered through
                  one list as five identical rows with small labels is a thing you
                  have to read to understand; a line across the list is a thing you
                  see. It also stops "PREMIUM" reading as a boast about the row
                  rather than a boundary.
                */}
                {premium && !previousPremium ? (
                  <View style={styles.tierBreak}>
                    <Text style={styles.tierBreakLabel}>PREMIUM</Text>
                    <View style={styles.tierBreakRule} />
                  </View>
                ) : null}
              <Pressable
                disabled={blocked}
                onPress={() => {
                  if (gated) return router.push('/premium');
                  if (row.route && !locked) router.push(row.route);
                }}
                accessibilityRole={blocked ? 'text' : 'button'}
                accessibilityLabel={`${row.title}.${premium ? ' Premium.' : ''} ${detail}`}
                accessibilityState={{ disabled: blocked }}
                accessibilityHint={gated ? 'Opens what Premium adds' : (locked ?? undefined)}
                style={({ pressed }) => [styles.row, pressed && !blocked && styles.rowPressed]}
              >
                <View style={[styles.rowBadge, state === 'done' && styles.rowBadgeDone, state === 'current' && styles.rowBadgeCurrent]}>
                  {/*
                    Two active colours, not one. The done badge is a pale tint and
                    the current badge is solid accent, so a single "active" colour
                    has to be legible on both — which on a light palette it cannot
                    be. Under the old dark theme they happened to share one.
                  */}
                  <Text
                    style={[
                      styles.rowBadgeText,
                      state === 'done' && styles.rowBadgeTextDone,
                      state === 'current' && styles.rowBadgeTextCurrent,
                    ]}
                  >
                    {state === 'done' ? '✓' : index + 1}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    {tag ? <Text style={styles.rowStub}>{tag}</Text> : null}
                  </View>
                  <Text style={styles.rowDetail}>{detail}</Text>
                </View>
              </Pressable>
              </Fragment>
            );
          })}
        </View>

        <Card style={styles.cta}>
          <Text style={styles.ctaTitle}>
            {itemCount === 0 ? 'Start with photos' : 'Add more photos'}
          </Text>
          <Text style={styles.ctaBody}>
            Frame everything you&apos;re moving – stand back, corners included. Loadsy does the rest.
          </Text>
          <PrimaryButton
            title={itemCount === 0 ? 'Take photos' : 'Add more photos'}
            onPress={() => router.push('/capture')}
          />
        </Card>

        <Link href="/inventory" style={styles.link}>
          <Text style={styles.linkText}>Or add items by hand →</Text>
        </Link>

        <Card style={styles.keeping}>
          <View style={styles.keepingHead}>
            <Text style={styles.keepingTitle}>Progress saved</Text>
            <Text style={styles.keepingWhen}>
              {ctx.lastSavedAt ? formatDateTime(ctx.lastSavedAt) : 'Nothing to save yet'}
            </Text>
          </View>
          <Text style={styles.keepingBody}>
            Saved to this phone as you go. No account, so nobody else can see it.
          </Text>

          {/*
            Surfaced, not swallowed. When storage cannot be read, the app runs on a
            fresh move and deliberately does NOT write — otherwise a transient read
            failure would overwrite an intact save. The user has to know that the
            work in front of them is not being kept.
          */}
          {!ctx.persistable ? (
            <Text style={styles.keepingWarn} accessibilityRole="alert">
              Storage could not be read this launch, so nothing is being saved right now.
              Anything you had saved before is untouched — reopen the app to try again.
            </Text>
          ) : null}

          {itemCount > 0 ? (
            confirmingFinish ? (
              <View style={styles.confirmRow}>
                <Pressable
                  onPress={() => void finishMove()}
                  accessibilityRole="button"
                  accessibilityLabel="Yes, file this move as complete"
                  style={({ pressed }) => [styles.confirmYes, pressed && styles.pressed]}
                >
                  <Text style={styles.confirmYesText}>File it and start fresh</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmingFinish(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Keep working on this move"
                  style={({ pressed }) => [styles.confirmNo, pressed && styles.pressed]}
                >
                  <Text style={styles.confirmNoText}>Not yet</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmingFinish(true)}
                accessibilityRole="button"
                accessibilityLabel="Mark this move complete"
                accessibilityHint="Files it under past moves and starts a new, empty move"
                style={({ pressed }) => [styles.confirmNo, pressed && styles.pressed]}
              >
                <Text style={styles.confirmNoText}>Mark this move complete</Text>
              </Pressable>
            )
          ) : null}

        </Card>

        <Pressable
          onPress={() => router.push('/history')}
          accessibilityRole="button"
          accessibilityLabel={
            history.length === 0
              ? 'Past moves. None yet'
              : `Past moves. ${history.length} completed`
          }
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>
            {history.length === 0 ? 'Past moves →' : `Past moves (${history.length}) →`}
          </Text>
        </Pressable>

        {/*
          The two pages App Store Connect links to, reachable from inside the app as
          Apple asks. At the bottom, small: they are for the person who wants them,
          not in the way of the person who wants a truck.
        */}
        <View style={styles.foot}>
          <Link href={PRIVACY_PATH} style={styles.footLink}>
            <Text style={styles.footText}>Privacy</Text>
          </Link>
          <Text style={styles.footDot}>·</Text>
          <Link href={SUPPORT_PATH} style={styles.footLink}>
            <Text style={styles.footText}>Help</Text>
          </Link>
        </View>
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
  rowBadgeTextDone: { color: colors.accent },
  rowBadgeTextCurrent: { color: colors.accentText },
  rowBody: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowTitle: { ...type.heading, color: colors.text },
  rowStub: { ...type.label, fontSize: 9, color: colors.textDim },
  tierBreak: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  tierBreakLabel: { ...type.label, fontSize: 10, color: colors.textDim },
  tierBreakRule: { flex: 1, height: 1, backgroundColor: colors.border },
  rowDetail: { ...type.caption, color: colors.textMuted },
  cta: { gap: space.md },
  ctaTitle: { ...type.heading, color: colors.text },
  ctaBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  link: { alignSelf: 'center', paddingVertical: space.sm },
  linkText: { ...type.body, color: colors.accent },
  foot: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, marginTop: space.md },
  footLink: { paddingVertical: space.xs, paddingHorizontal: space.xs },
  footText: { ...type.caption, color: colors.textDim },
  footDot: { ...type.caption, color: colors.textDim },
  keeping: { gap: space.md },
  keepingHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  keepingTitle: { ...type.heading, color: colors.text, flex: 1 },
  keepingWhen: { ...type.caption, color: colors.textMuted },
  keepingBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  keepingWarn: { ...type.caption, color: colors.amber, lineHeight: 19 },
  confirmRow: { flexDirection: 'row', gap: space.sm },
  confirmYes: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
    paddingVertical: space.md,
  },
  confirmYesText: { ...type.caption, color: colors.text, fontWeight: '600' },
  confirmNo: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: space.md,
  },
  confirmNoText: { ...type.caption, color: colors.textMuted },
  pressed: { opacity: 0.7 },
  historyLink: { alignSelf: 'center', paddingVertical: space.xs },
});
