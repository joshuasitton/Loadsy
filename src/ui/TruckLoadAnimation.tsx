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
import { POSE_LABEL, type ElevationRect, type LoadPlan } from '../truckmap/layout';
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
 * ## What the picture is
 *
 * A side elevation: cab on the left, tailgate on the right, deck at the bottom.
 * Each piece's HEIGHT is how tall it stands in the pose it travels in, and its
 * WIDTH is how much truck length it consumes. Rectangle area is therefore exactly
 * proportional to volume — see src/truckmap/layout.ts, which owns all of it.
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
  rects,
  selectedId,
  onSelect,
}: {
  plan: LoadPlan;
  rects: ElevationRect[];
  selectedId: string | null;
  onSelect: (itemId: string | null) => void;
}) {
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState(rects.length);
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
    () => Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, RUN_MS / Math.max(1, rects.length))),
    [rects.length],
  );

  useEffect(() => {
    if (!playing || loaded >= rects.length) return;
    // Both state writes happen in the timeout, never synchronously in the effect:
    // a synchronous write here re-runs the effect before the frame is painted and
    // the whole load appears at once.
    const timer = setTimeout(() => {
      const next = Math.min(rects.length, loaded + 1);
      setLoaded(next);
      if (next >= rects.length) setPlaying(false);
    }, stepMs);
    return () => clearTimeout(timer);
  }, [playing, loaded, rects.length, stepMs]);

  const replay = useCallback(() => {
    onSelect(null);
    setLoaded(0);
    setPlaying(true);
  }, [onSelect]);

  const onCanvas = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setCanvas({ width, height: 0 });
  }, []);

  // The drawing keeps the truck's real proportions, so a 26-footer looks like one.
  const aspect = plan.bed.heightIn / plan.bed.lengthIn;
  const bedWidth = Math.max(0, canvas.width - CAB_WIDTH - space.sm);
  const bedHeight = Math.max(60, Math.min(190, bedWidth * aspect));

  const visible = rects.slice(0, loaded);
  const latest = visible[visible.length - 1] ?? null;
  const selected = rects.find((rect) => rect.itemId === selectedId) ?? null;
  const spotlight = selected ?? latest;

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
      <View style={styles.canvasRow}>
        <View style={[styles.cab, { height: bedHeight * 0.62 }]}>
          <Text style={styles.cabText}>CAB</Text>
        </View>

        <View style={[styles.bed, { width: bedWidth, height: bedHeight }]}>
          {visible.map((rect, index) => (
            <LoadedPiece
              key={rect.itemId}
              rect={rect}
              bedWidth={bedWidth}
              bedHeight={bedHeight}
              animate={!reduceMotion && index === visible.length - 1 && playing}
              selected={rect.itemId === selectedId}
              dimmed={selectedId !== null && rect.itemId !== selectedId}
              onPress={() => onSelect(rect.itemId === selectedId ? null : rect.itemId)}
            />
          ))}
        </View>
      </View>

      <View style={[styles.ends, { marginLeft: CAB_WIDTH + space.sm }]}>
        <Text style={styles.endLabel}>front of the truck</Text>
        <Text style={styles.endLabel}>door</Text>
      </View>

      <View style={styles.progressTrack} accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: rects.length, now: loaded }}
        accessibilityLabel={`${loaded} of ${rects.length} items loaded`}>
        <View
          style={[
            styles.progressFill,
            { width: `${rects.length === 0 ? 0 : (loaded / rects.length) * 100}%` },
          ]}
        />
      </View>

      <View style={styles.controls}>
        <Control
          label={playing ? 'Pause' : loaded >= rects.length ? 'Replay' : 'Play'}
          hint="Loads the truck one piece at a time, in the order the plan prescribes"
          primary
          onPress={() => {
            if (playing) return setPlaying(false);
            if (loaded >= rects.length) return replay();
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
          disabled={loaded >= rects.length}
          onPress={() => {
            setPlaying(false);
            setLoaded((n) => Math.min(rects.length, n + 1));
          }}
        />
      </View>

      <Text style={styles.counter}>
        {loaded} of {rects.length} loaded
        {reduceMotion ? ' · motion reduced' : ''}
      </Text>

      {spotlight ? (
        <View style={styles.spotlight}>
          <View style={[styles.swatch, { backgroundColor: STEP_COLORS[spotlight.step] }]} />
          <View style={styles.spotlightBody}>
            <Text style={styles.spotlightName}>{spotlight.name}</Text>
            <Text style={styles.spotlightMeta}>
              {POSE_LABEL[spotlight.pose]} · {STEP_LABELS[spotlight.step]} · {spotlight.cubicFeet} ft³
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

      {plan.overflow.length > 0 ? (
        <Text style={styles.overflow}>
          {plan.overflow.length} {plan.overflow.length === 1 ? 'item is' : 'items are'} in your plan
          but not drawn here — this packer is tidier than a person and worse than a good loader.
          Trust the truck size, which is worked out from volume with a 15% reserve.
        </Text>
      ) : null}
    </View>
  );
}

const CAB_WIDTH = 34;

function LoadedPiece({
  rect,
  bedWidth,
  bedHeight,
  animate,
  selected,
  dimmed,
  onPress,
}: {
  rect: ElevationRect;
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
  // The layout measures y from the deck; the canvas measures from the top.
  const top = (1 - rect.y - rect.height) * bedHeight;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: rect.x * bedWidth,
        top,
        width,
        height,
        opacity: enter.interpolate({ inputRange: [0, 1], outputRange: [0, dimmed ? 0.35 : 1] }),
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${rect.name}, ${POSE_LABEL[rect.pose].toLowerCase()}, ${STEP_LABELS[rect.step]}`}
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
