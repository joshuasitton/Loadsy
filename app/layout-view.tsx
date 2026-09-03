import { Directory, File, Paths } from 'expo-file-system';
import { formatCuFt } from '../src/ui/format';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { TRUCK_LABEL } from '../src/domain/truck';
import type { InventoryItem, PackingPlan } from '../src/domain/types';
import { allItems } from '../src/domain/volume';
import { guidanceFor, poseForItem } from '../src/domain/itemGuidance';
import { buildLoadSteps, type LoadStepOrder } from '../src/domain/packing';
import {
  computeZones,
  renderTruckMapSVG,
  truckMapAriaLabel,
  type TruckView,
} from '../src/truckmap/renderSvg';
import { planLoad, POSE_LABEL } from '../src/truckmap/layout';
import { TruckLoadAnimation } from '../src/ui/TruckLoadAnimation';
import { useEntitlement } from '../src/billing/entitlementStore';
import { PremiumWall } from '../src/ui/PremiumWall';
import { useMove } from '../src/state/moveStore';
import { Banner, Card, Chip, PrimaryButton, Screen, SecondaryButton } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';

/** Screen 6 — Truck Layout. 3D / Top view toggle, Save Plan and Share. */

const FILE_NAME = 'loadsy-truck-plan.svg';

export default function LayoutViewRoute() {
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
  if (!allows('/layout-view')) return <PremiumWall feature="Truck Layout" />;
  return <TruckLayoutScreen />;
}

function TruckLayoutScreen() {
  const { move, packingPlan, recommendation } = useMove();
  /**
   * 'load' is the item-level animation; the other two are the zone summaries.
   *
   * It is the default because it is the one that answers the question people
   * arrive with — where does THIS go and which way round — while the zone views
   * answer "roughly how much of the truck does each group take", which the
   * packing plan already said in words.
   */
  const [view, setView] = useState<'load' | TruckView>('load');
  /** The piece the user tapped in the animation, if any. */
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  /**
   * Which plan the user has saved to this device, held by identity rather than
   * as a boolean.
   *
   * The badge must never outlive the inventory it describes — "Plan saved" next
   * to a plan that has since changed is a claim about a file the user no longer
   * has. Storing WHICH plan was saved makes that unrepresentable: `saved` is a
   * comparison, so it is false from the first render after an edit. Clearing a
   * boolean in an effect gets there a render late, and trips the React Compiler
   * rule against setState inside an effect.
   *
   * `packingPlan` is memoised in moveStore on the move itself, so its identity
   * changes exactly when the inventory does — which is the event this needs.
   */
  const [savedPlan, setSavedPlan] = useState<PackingPlan | null>(null);
  // Both null is not a match: with no plan there is nothing that could have been
  // saved, and the button would otherwise read "Plan saved" on an empty move.
  const saved = savedPlan !== null && savedPlan === packingPlan;
  /** The zone the user has opened. Null until they ask — the diagram reads fine closed. */
  const [openStep, setOpenStep] = useState<LoadStepOrder | null>(null);
  // Rendered inline rather than raised through Alert: react-native-web ships Alert
  // as an empty function, so an alert here is invisible in the browser preview.
  const [problem, setProblem] = useState<{ title: string; message: string } | null>(null);

  // allItems() flatMaps a fresh array every call, so memoising on `items`
  // directly would never hit — every render would re-serialise the whole SVG.
  const items = useMemo(() => allItems(move), [move]);
  // Unlabelled on purpose — see `a11y` below. The saved/shared file is rendered
  // separately, with its label embedded, because it has to stand on its own.
  /**
   * The zone diagram. Falls back to 'top' while the load animation is showing —
   * the SVG renderer only knows the two zone views, and Save Plan still has to
   * produce a file whichever tab happens to be open.
   */
  const svgView: TruckView = view === '3d' ? '3d' : 'top';
  const svg = useMemo(
    () => renderTruckMapSVG(items, recommendation.size, svgView, { labelled: false }),
    [items, recommendation.size, svgView],
  );
  const zones = useMemo(() => computeZones(items), [items]);

  // The item-level layout. Derived, like everything else on this screen, so it
  // cannot describe an inventory the user has since edited.
  const loadPlan = useMemo(() => planLoad(items, recommendation.size), [items, recommendation.size]);
  const loadKey = useMemo(
    () => `${recommendation.size}:${items.map((item) => item.id).join(',')}`,
    [items, recommendation.size],
  );
  const openItem = useMemo(
    () => items.find((item) => item.id === openItemId) ?? null,
    [items, openItemId],
  );
  // Derived from `zones`, never from recommendation.rawCuFt: the header states the
  // figure the legend below it adds up to, so the two cannot drift apart on rounding.
  const zonedCuFt = useMemo(
    () => Math.round(zones.reduce((sum, zone) => sum + zone.cubicFeet, 0) * 100) / 100,
    [zones],
  );

  /**
   * react-native-svg reads the accessible name from a different prop on each
   * platform: the native build extracts `accessibilityLabel` (and needs
   * `accessible` for VoiceOver to treat the diagram as one element), while the
   * web build forwards props straight to the DOM, where only `aria-label` means
   * anything. Neither reads the `ariaLabel` that SvgXml's parser produces.
   */
  const a11y = useMemo(() => {
    const label = truckMapAriaLabel(zones, recommendation.size);
    return Platform.OS === 'web'
      ? { 'aria-label': label }
      : { accessible: true, accessibilityLabel: label };
  }, [zones, recommendation.size]);

  /**
   * The variant that leaves the app. Rendered fresh rather than reusing `svg`,
   * which is deliberately unlabelled: a file has no component behind it to carry
   * an accessible name, so it needs the label embedded.
   */
  function exportSvg(): string {
    return renderTruckMapSVG(items, recommendation.size, svgView);
  }

  /** Writes the diagram and hands back its file:// URI. */
  function writeSvg(directory: Directory): File {
    const file = new File(directory, FILE_NAME);
    if (file.exists) file.delete();
    file.create();
    file.write(exportSvg());
    return file;
  }

  /**
   * expo-file-system is native-only, so on web "save to this device" is what it
   * means in a browser: a download. Guarded by Platform rather than a bundler
   * shim so the native path stays byte-for-byte what it was.
   */
  function downloadOnWeb(svgText: string) {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = FILE_NAME;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function share() {
    setProblem(null);
    try {
      const file = writeSvg(Paths.cache);
      if (!(await Sharing.isAvailableAsync())) {
        setProblem({
          title: 'Sharing unavailable',
          message: 'This device cannot share files right now.',
        });
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'image/svg+xml',
        // iOS picks share destinations from the UTI, not the mime type.
        UTI: 'public.svg-image',
        dialogTitle: 'Loadsy truck plan',
      });
    } catch {
      setProblem({
        title: "Couldn't share the plan",
        message: 'Try saving it to this device instead.',
      });
    }
  }

  function savePlan() {
    setProblem(null);
    try {
      if (Platform.OS === 'web') {
        downloadOnWeb(exportSvg());
      } else {
        writeSvg(Paths.document);
      }
      setSavedPlan(packingPlan);
    } catch {
      setProblem({ title: "Couldn't save the plan", message: 'Try sharing it instead.' });
    }
  }

  if (items.length === 0) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <Banner
            tone="neutral"
            title="Nothing to lay out yet"
            message="Add your inventory and the truck diagram builds itself."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{TRUCK_LABEL[recommendation.size]}</Text>
          <Text style={styles.subtitle}>
            {formatCuFt(zonedCuFt)} ft³ across {zones.length}{' '}
            {zones.length === 1 ? 'load zone' : 'load zones'}
          </Text>
          <Text style={styles.subtitleDim}>
            With the {Math.round(recommendation.bufferPct * 100)}% packing buffer,{' '}
            {formatCuFt(recommendation.adjustedCuFt)} ft³ has to fit.
          </Text>
        </View>

        <View style={styles.tabs}>
          <Chip
            label="Load It"
            active={view === 'load'}
            onPress={() => setView('load')}
            accessibilityLabel="Watch the truck being loaded piece by piece"
          />
          <Chip
            label="Top View"
            active={view === 'top'}
            onPress={() => setView('top')}
            accessibilityLabel="Show the top-down view"
          />
          <Chip
            label="3D View"
            active={view === '3d'}
            onPress={() => setView('3d')}
            accessibilityLabel="Show the three-dimensional view"
          />
        </View>

        <Card style={styles.diagramCard}>
          {view === 'load' ? (
            <View style={styles.loadView}>
              <Text style={styles.loadIntro}>
                Your load, solved and played back in carrying order. Tap any piece — or any
                row below the truck — for its instructions.
              </Text>
              <TruckLoadAnimation
                // Keyed on the inventory: a different item set is a different
                // load, and remounting is how playback resets.
                key={loadKey}
                plan={loadPlan}
                selectedId={openItemId}
                onSelect={setOpenItemId}
              />
            </View>
          ) : view === 'top' ? (
            /*
             * Laid out with flex rather than the SVG, so each zone is a real
             * pressable with its own hit area and accessibility node. Overlaying
             * touch targets on a scaled viewBox would mean re-deriving the
             * renderer's coordinates here and keeping them in step — the flex
             * weights ARE the fractions, so there is nothing to drift.
             */
            <View>
              <View style={styles.stripHeader}>
                <Text style={styles.stripEnd}>← loaded first</Text>
                <Text style={styles.stripEnd}>door →</Text>
              </View>
              <View style={styles.strip}>
                <View style={styles.cab}>
                  <Text style={styles.cabText}>CAB</Text>
                </View>
                {zones.map((zone) => {
                  const open = openStep === zone.step;
                  return (
                    <Pressable
                      key={zone.step}
                      onPress={() => setOpenStep(open ? null : zone.step)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={`${zone.label}, ${zone.cubicFeet} cubic feet, ${Math.round(zone.fraction * 100)} percent of the load`}
                      accessibilityHint="Shows how to load this part of the truck"
                      // Vertical only. A small zone is a genuinely small target —
                      // 2% of a load is ~11px — and widening it horizontally would
                      // overlap its neighbours, turning a miss into a WRONG answer
                      // rather than no answer. Widening the visual would be worse
                      // still: the proportions are the information. The legend rows
                      // below are full-width and drive the same state, which is the
                      // reliable path to the narrow zones.
                      hitSlop={{ top: 14, bottom: 14, left: 0, right: 0 }}
                      style={[
                        styles.zone,
                        {
                          flex: zone.fraction,
                          backgroundColor: zone.color,
                          opacity: openStep === null || open ? 0.92 : 0.34,
                        },
                        open && styles.zoneOpen,
                      ]}
                    >
                      {zone.fraction > 0.12 ? (
                        <Text style={styles.zoneLabel} numberOfLines={1}>
                          {zone.label}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.stripHint}>
                {openStep === null
                  ? 'Tap a section — or a row below — to see how to load it'
                  : 'Tap it again to close'}
              </Text>
            </View>
          ) : (
          <View style={styles.diagram}>
            <SvgXml
              xml={svg}
              // Passing `override` explicitly matters twice over: it supplies the
              // accessible name under a prop the platform actually reads, and it
              // stops SvgXml falling back to spreading its own props — which is
              // what copies the entire SVG source onto the element as `xml`.
              override={{ width: '100%', height: '100%', ...a11y }}
            />
          </View>
          )}
        </Card>

        {view === 'load' && openItem ? <ItemDetail item={openItem} /> : null}

        {view !== 'load' && openStep !== null ? <ZoneDetail step={openStep} items={items} /> : null}

        <Card style={styles.legend}>
          {zones.map((zone) => (
            <Pressable
              key={zone.step}
              onPress={() => setOpenStep(openStep === zone.step ? null : zone.step)}
              accessibilityRole="button"
              accessibilityState={{ expanded: openStep === zone.step }}
              // Named explicitly: turning the row into a button stops its child Text
              // being read as the control's name, so without this it announces as an
              // unlabelled button — worse than the plain row it replaced.
              accessibilityLabel={`Step ${zone.step}, ${zone.label}, ${zone.cubicFeet} cubic feet, ${Math.round(zone.fraction * 100)} percent of the load`}
              accessibilityHint="Shows how to load this part of the truck"
              style={styles.legendRow}
            >
              <View style={[styles.legendDot, { backgroundColor: zone.color }]} />
              <Text style={styles.legendLabel}>
                {zone.step}. {zone.label}
              </Text>
              <Text style={styles.legendValue}>
                {formatCuFt(zone.cubicFeet)} ft³ · {Math.round(zone.fraction * 100)}%
              </Text>
            </Pressable>
          ))}
        </Card>

        {/*
          The caveat has to match the tab. "Not a piece-by-piece packing
          solution" was true of the zone diagrams and became false the moment
          one of the tabs started drawing every piece individually.
        */}
        <Text style={styles.caveat}>
          {view === 'load'
            ? 'Nothing overlaps and nothing floats, but a person at the tailgate will still beat it. The truck size comes from volume with a 15% reserve either way.'
            : 'This is a load-zone diagram, not a piece-by-piece packing solution. It shows where each group belongs and how much of the truck it takes up.'}
        </Text>

        {problem ? (
          <Banner tone="danger" title={problem.title} message={problem.message} />
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton
            title={saved ? 'Plan saved' : 'Save plan to this device'}
            onPress={savePlan}
            disabled={saved || !packingPlan}
          />
          <SecondaryButton
            title="Share"
            onPress={() => { void share(); }}
            accessibilityLabel="Share the truck plan"
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  emptyWrap: { padding: space.lg, marginTop: space.xl },
  header: { gap: 2, marginTop: space.sm },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted },
  subtitleDim: { ...type.caption, color: colors.textDim },
  tabs: { flexDirection: 'row', gap: space.sm },
  loadView: { gap: space.md },
  loadIntro: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  diagramCard: { padding: space.sm, backgroundColor: colors.surfaceRaised },
  stripHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  stripEnd: { ...type.caption, color: colors.textDim, fontSize: 11 },
  strip: { flexDirection: 'row', height: 86, gap: 2 },
  cab: {
    width: 34,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  cabText: { ...type.caption, color: colors.textDim, fontSize: 9 },
  zone: { justifyContent: 'center', alignItems: 'center', minWidth: 6, borderRadius: 2 },
  zoneOpen: { borderWidth: 2, borderColor: colors.text },
  zoneLabel: { ...type.caption, color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  stripHint: { ...type.caption, color: colors.textDim, fontSize: 11, marginTop: 6 },
  detail: { gap: space.xs },
  detailTitle: { ...type.heading, color: colors.text },
  detailInstruction: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  detailItem: { gap: 2, paddingTop: space.sm },
  detailItemName: { ...type.caption, color: colors.text },
  detailItemGuidance: { ...type.caption, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  detailItemCaution: { ...type.caption, color: colors.amber, fontSize: 12, lineHeight: 17 },
  diagram: { height: 210, borderRadius: radius.sm, overflow: 'hidden' },
  legend: { gap: space.md },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { ...type.body, color: colors.text, flex: 1 },
  legendValue: { ...type.caption, color: colors.textMuted },
  caveat: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  actions: { gap: space.md },
});

/**
 * What actually goes in the zone the user just tapped.
 *
 * The diagram says where a group sits; this says what is in it and how each piece
 * travels. Derived from buildLoadSteps rather than the stored plan so it is right
 * even before a plan has been fetched — the load order is a pure function of the
 * inventory, and re-deriving it costs nothing next to a network round trip.
 */
/**
 * One piece, opened from the animation.
 *
 * The same guidance the packing plan prints, shown against the block the user
 * just tapped — so the picture and the instructions are visibly the same thing
 * rather than two descriptions that have to be reconciled by the reader.
 */
function ItemDetail({ item }: { item: InventoryItem }) {
  const guidance = guidanceFor(item);
  const { lengthIn, widthIn, heightIn } = item.dimensions;

  return (
    <Card style={styles.detail}>
      <Text style={styles.detailTitle}>{item.name}</Text>
      <Text style={styles.detailInstruction}>
        {Math.round(lengthIn)} × {Math.round(widthIn)} × {Math.round(heightIn)} in ·{' '}
        {formatCuFt(item.cubicFeet)} ft³ · {POSE_LABEL[poseForItem(item)].toLowerCase()}
      </Text>
      {guidance ? (
        <View style={styles.detailItem}>
          <Text style={styles.detailItemGuidance}>{guidance.orientation}</Text>
          {guidance.prep ? (
            <Text style={styles.detailItemGuidance}>First: {guidance.prep}</Text>
          ) : null}
          {guidance.caution ? (
            <Text style={styles.detailItemCaution}>{guidance.caution}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.detailItemGuidance}>
          Nothing special about this one — it goes where it fits.
        </Text>
      )}
    </Card>
  );
}

function ZoneDetail({ step, items }: { step: LoadStepOrder; items: InventoryItem[] }) {
  const loadStep = buildLoadSteps(items).find((entry) => entry.order === step);
  if (!loadStep) return null;
  const byId = new Map(items.map((item) => [item.id, item]));

  return (
    <Card style={styles.detail}>
      <Text style={styles.detailTitle}>
        {loadStep.order}. {loadStep.title}
      </Text>
      <Text style={styles.detailInstruction}>{loadStep.instruction}</Text>
      {loadStep.itemIds.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        const guidance = guidanceFor(item);
        return (
          <View key={id} style={styles.detailItem}>
            <Text style={styles.detailItemName}>
              {item.name} · {formatCuFt(item.cubicFeet)} ft³
            </Text>
            {guidance ? (
              <>
                <Text style={styles.detailItemGuidance}>{guidance.orientation}</Text>
                {guidance.caution ? (
                  <Text style={styles.detailItemCaution}>{guidance.caution}</Text>
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
