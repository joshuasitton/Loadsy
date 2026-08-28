import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { STEP_COLORS, STEP_LABELS } from '../truckmap/renderSvg';
import {
  POSE_LABEL,
  project,
  sideOfTruck,
  type LoadPlan,
  type ProjectedRect,
  type ProjectionView,
} from '../truckmap/layout';
import { colors, radius, space, type } from './theme';

/**
 * The truck filling up, one piece at a time, in the order the plan prescribes.
 *
 * ## Why an animation rather than a finished picture
 *
 * A finished picture of a packed truck is a puzzle: forty rectangles and no way
 * to tell which went in when. Playing it back in load order turns the same
 * drawing into the instruction it is meant to be — you watch the base go in, the
 * long pieces stand up against it, the boxes fill the wall. The final frame is
 * identical either way; the sequence is the information.
 *
 * ## Two views, because one is not enough
 *
 * A side elevation shows how the load stacks and says nothing at all about which
 * side of the truck a piece is on — half the load is hidden behind the other
 * half. So there are two projections of the same 3D solve, the convention of any
 * engineering drawing:
 *
 *   - **From the side**: cab left, deck at the bottom. Shows the stacking.
 *   - **From above**: cab left, the truck's width top to bottom. Shows the two
 *     walls, and which pieces are against which.
 *
 * Pieces further from the viewer are drawn dimmer, so the depth the projection
 * throws away is at least visible. Both play the same load in the same order at
 * the same time; the tab only changes where you are standing.
 *
 * ## Motion
 *
 * Honoured against the OS reduce-motion setting. With it on, the load appears
 * complete and the controls still step through it, because the information is in
 * the ORDER and somebody who cannot tolerate movement should not lose the
 * information along with the movement.
 *
 * The caller gives this component a `key` derived from the inventory. A changed
 * item set is a different load, and remounting is how playback resets — a frame
 * from the previous move left on screen would be worse than a flicker.
 */

/** Total run time for a full load, whatever its size. */
const RUN_MS = 11_000;
const MIN_STEP_MS = 110;
const MAX_STEP_MS = 420;

export function TruckLoadAnimation({
  plan,
  selectedId,
  onSelect,
}: {
  plan: LoadPlan;
  selectedId: string | null;
  onSelect: (itemId: string | null) => void;
}) {
  const [view, setView] = useState<ProjectionView>('side');
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });

  /*
   * Ordered by when each piece is loaded, not by the projection's paint order.
   *
   * `project` sorts back to front so nearer pieces paint over further ones, which
   * is right for drawing and wrong for playback — following it would load the
   * truck from the far wall inwards. The two orders are reconciled here: the
   * animation walks the load order, and each view keeps its own paint order.
   */
  const order = useMemo(() => plan.placements.map((placement) => placement.itemId), [plan]);
  const rects = useMemo(() => project(plan, view), [plan, view]);
  const rectById = useMemo(
    () => new Map(rects.map((rect) => [rect.itemId, rect])),
    [rects],
  );
  const [loaded, setLoaded] = useState(plan.placements.length);
  const [playing, setPlaying] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => !cancelled && setReduceMotion(on))
      // An unsupported platform is not a reason to refuse to render.
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const stepMs = useMemo(
    () => Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, RUN_MS / Math.max(1, order.length))),
    [order.length],
  );

  useEffect(() => {
    if (!playing || loaded >= order.length) return;
    // Both state writes happen in the timeout, never synchronously in the effect:
    // a synchronous write here re-runs the effect before the frame is painted and
    // the whole load appears at once.
    const timer = setTimeout(() => {
      const next = Math.min(order.length, loaded + 1);
      setLoaded(next);
      if (next >= order.length) setPlaying(false);
    }, stepMs);
    return () => clearTimeout(timer);
  }, [playing, loaded, order.length, stepMs]);

  const replay = useCallback(() => {
    onSelect(null);
    setLoaded(0);
    setPlaying(true);
  }, [onSelect]);

  const onCanvas = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setCanvas({ width, height: 0 });
  }, []);

  // Real proportions, so a 26-footer looks like one and the top view is visibly
  // a different shape from the side view rather than the same box relabelled.
  const acrossIn = view === 'side' ? plan.bed.heightIn : plan.bed.widthIn;
  const bedWidth = Math.max(0, canvas.width - CAB_WIDTH - space.sm);
  const bedHeight = Math.max(60, Math.min(210, bedWidth * (acrossIn / plan.bed.lengthIn)));

  // The first `loaded` pieces of the LOAD order, drawn in the view's paint order.
  const shown = new Set(order.slice(0, loaded));
  const visible = rects.filter((rect) => shown.has(rect.itemId));
  const latestId = order[loaded - 1] ?? null;
  const latest = latestId ? (rectById.get(latestId) ?? null) : null;
  const selected = selectedId ? (rectById.get(selectedId) ?? null) : null;
  const spotlight = selected ?? latest;
  const spotlightPlacement = spotlight
    ? (plan.placements.find((p) => p.itemId === spotlight.itemId) ?? null)
    : null;

  return (
    /*
     * Measured on the OUTER view, not on the row that holds the truck.
     *
     * The row's width is what we are trying to find, but the row shrinks to fit
     * its children and one of those children is sized from the measurement — so
     * measuring it collapsed the bed to a hairline and stayed there. The wrapper
     * is stretched by its parent and is full width regardless of what is in it.
     */
    <View style={styles.wrap} onLayout={onCanvas}>
      <View style={styles.viewTabs}>
        <ViewTab
          label="From the side"
          hint="Shows how the load stacks, deck to roof"
          active={view === 'side'}
          onPress={() => setView('side')}
        />
        <ViewTab
          label="From above"
          hint="Shows which side of the truck each piece is on"
          active={view === 'top'}
          onPress={() => setView('top')}
        />
      </View>

      <View style={styles.canvasRow}>
        <View style={[styles.cab, { height: bedHeight * (view === 'side' ? 0.62 : 0.9) }]}>
          <Text style={styles.cabText}>CAB</Text>
        </View>

        <View style={[styles.bed, { width: bedWidth, height: bedHeight }]}>
          {visible.map((rect) => (
            <LoadedPiece
              key={rect.itemId}
              rect={rect}
              view={view}
              bedWidth={bedWidth}
              bedHeight={bedHeight}
              animate={!reduceMotion && rect.itemId === latestId && playing}
              selected={rect.itemId === selectedId}
              dimmed={selectedId !== null && rect.itemId !== selectedId}
              onPress={() => onSelect(rect.itemId === selectedId ? null : rect.itemId)}
            />
          ))}
        </View>
      </View>

      <View style={[styles.ends, { marginLeft: CAB_WIDTH + space.sm }]}>
        <Text style={styles.endLabel}>front of the truck</Text>
        <Text style={styles.endLabel}>
          {view === 'side' ? 'door' : 'door · left wall at the top'}
        </Text>
      </View>

      <View style={styles.progressTrack} accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: order.length, now: loaded }}
        accessibilityLabel={`${loaded} of ${order.length} items loaded`}>
        <View
          style={[
            styles.progressFill,
            { width: `${order.length === 0 ? 0 : (loaded / order.length) * 100}%` },
          ]}
        />
      </View>

      <View style={styles.controls}>
        <Control
          label={playing ? 'Pause' : loaded >= order.length ? 'Replay' : 'Play'}
          hint="Loads the truck one piece at a time, in the order the plan prescribes"
          primary
          onPress={() => {
            if (playing) return setPlaying(false);
            if (loaded >= order.length) return replay();
            setPlaying(true);
          }}
        />
        <Control
          label="Back"
          hint="Take the last piece back off"
          disabled={loaded === 0}
          onPress={() => {
            setPlaying(false);
            setLoaded((n) => Math.max(0, n - 1));
          }}
        />
        <Control
          label="Next"
          hint="Load the next piece"
          disabled={loaded >= order.length}
          onPress={() => {
            setPlaying(false);
            setLoaded((n) => Math.min(order.length, n + 1));
          }}
        />
      </View>

      <Text style={styles.counter}>
        {loaded} of {order.length} loaded
        {reduceMotion ? ' · motion reduced' : ''}
      </Text>

      {spotlight ? (
        <View style={styles.spotlight}>
          <View style={[styles.swatch, { backgroundColor: STEP_COLORS[spotlight.step] }]} />
          <View style={styles.spotlightBody}>
            <Text style={styles.spotlightName}>{spotlight.name}</Text>
            <Text style={styles.spotlightMeta}>
              {POSE_LABEL[spotlight.pose]} ·{' '}
              {spotlightPlacement ? sideOfTruck(spotlightPlacement, plan.bed) : ''} ·{' '}
              {STEP_LABELS[spotlight.step]} · {spotlight.cubicFeet} ft³
            </Text>
            {spotlight.posedDownFrom ? (
              // The one place the picture and the written instruction can differ,
              // so it is stated rather than left to be noticed.
              <Text style={styles.spotlightNote}>
                {POSE_LABEL[spotlight.posedDownFrom].toLowerCase()} is the ideal, but it will not
                stand in this truck — laid down instead.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <Text style={styles.solverNote}>
        Best of {plan.strategy.tried} arrangements · {plan.strategy.name}
      </Text>

      {plan.overflow.length > 0 ? (
        <Text style={styles.overflow}>
          The solver could not find room for {listNames(plan.overflow.map((o) => o.name))}. It tries{' '}
          {plan.strategy.tried} arrangements and keeps the best; a person at the tailgate will beat
          it. The truck size is worked out from volume with a 15% reserve and is the number to trust.
        </Text>
      ) : null}
    </View>
  );
}

const CAB_WIDTH = 34;

/** "the sofa", "the sofa and the lamp", "the sofa, the lamp and the rug". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'one item';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function ViewTab({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.viewTab,
        active && styles.viewTabActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function LoadedPiece({
  rect,
  view,
  bedWidth,
  bedHeight,
  animate,
  selected,
  dimmed,
  onPress,
}: {
  rect: ProjectedRect;
  view: ProjectionView;
  bedWidth: number;
  bedHeight: number;
  animate: boolean;
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  /*
   * Created once, via lazy initial state rather than a ref.
   *
   * The piece animates as it is placed, and a re-render for a selection change
   * must not make the whole load drop in again. A ref would do that too, but
   * reading `.current` while rendering is exactly what the compiler's rules
   * forbid — and this value IS read during render, to build the style.
   */
  const [enter] = useState(() => new Animated.Value(animate ? 0 : 1));

  useEffect(() => {
    if (!animate) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animate, enter]);

  const width = Math.max(2, rect.width * bedWidth);
  const height = Math.max(3, rect.height * bedHeight);
  /*
   * The two views measure their second axis in opposite directions.
   *
   * From the side, y is height off the DECK and the canvas measures down from
   * the top, so it flips. From above, y is already distance from the left wall
   * measured downwards, so it does not. Flipping both, or neither, silently
   * mirrors one of the drawings — which is exactly the kind of wrong that still
   * looks plausible.
   */
  const top = view === 'side' ? (1 - rect.y - rect.height) * bedHeight : rect.y * bedHeight;

  /*
   * Depth is what the projection throws away, so it is put back as tone: pieces
   * further from the viewer sit further back in the stack and read dimmer.
   * Without it, a top view of a full truck is a solid slab of colour.
   */
  const behind = 1 - 0.4 * rect.depth;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: rect.x * bedWidth,
        top,
        width,
        height,
        opacity: enter.interpolate({
          inputRange: [0, 1],
          outputRange: [0, dimmed ? 0.3 : behind],
        }),
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${rect.name}, ${POSE_LABEL[rect.pose].toLowerCase()}, ${STEP_LABELS[rect.step]}`}
        // A thin sliver still has to be tappable. Not so much slop that it steals
        // its neighbour's taps — a wrong answer is worse than no answer.
        hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
        accessibilityState={{ selected }}
        style={[
          styles.piece,
          { backgroundColor: STEP_COLORS[rect.step] },
          selected && styles.pieceSelected,
        ]}
      />
    </Animated.View>
  );
}

function Control({
  label,
  hint,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.control,
        primary && styles.controlPrimary,
        disabled && styles.controlDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.controlText,
          primary && styles.controlTextPrimary,
          disabled && styles.controlTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  viewTabs: { flexDirection: 'row', gap: space.sm },
  viewTab: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
  },
  viewTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  viewTabText: { ...type.caption, color: colors.text, fontWeight: '600' },
  viewTabTextActive: { color: colors.accentText },
  solverNote: { ...type.caption, fontSize: 11, color: colors.textDim, textAlign: 'center' },
  canvasRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  cab: {
    width: CAB_WIDTH,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderTopLeftRadius: radius.sm,
    borderBottomLeftRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cabText: { ...type.label, fontSize: 8, color: colors.textMuted },
  bed: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  piece: { flex: 1, borderRadius: 2, borderWidth: 1, borderColor: colors.bg },
  pieceSelected: { borderColor: colors.text, borderWidth: 2 },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  endLabel: { ...type.caption, fontSize: 10, color: colors.textDim },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  progressFill: { height: 4, backgroundColor: colors.accent },
  controls: { flexDirection: 'row', gap: space.sm },
  control: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  controlDisabled: { borderColor: colors.disabled, backgroundColor: colors.disabled },
  controlText: { ...type.bodyStrong, color: colors.text },
  controlTextPrimary: { color: colors.accentText },
  controlTextDisabled: { color: colors.disabledText },
  pressed: { opacity: 0.8 },
  counter: { ...type.caption, color: colors.textDim, textAlign: 'center' },
  spotlight: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: space.md,
  },
  swatch: { width: 12, height: 12, borderRadius: 3, marginTop: 4 },
  spotlightBody: { flex: 1, gap: 2 },
  spotlightName: { ...type.bodyStrong, color: colors.text },
  spotlightMeta: { ...type.caption, color: colors.textMuted },
  spotlightNote: { ...type.caption, color: colors.amber, lineHeight: 18, marginTop: 2 },
  overflow: { ...type.caption, fontSize: 12, color: colors.amber, lineHeight: 18 },
});
