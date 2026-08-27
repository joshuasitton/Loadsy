import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { nextStep, previousStep, stepPosition, type FlowRoute } from '../domain/flow';
import { colors, radius, space, type } from './theme';

/**
 * Back and forward through the four working screens.
 *
 * Every screen used to end in a single forward button, with the only way back
 * being the header chevron. That is fine the first time through and wrong every
 * time after — the common act in this app is going back to correct an item and
 * returning to see what it did to the truck, and there was no return.
 *
 * Both directions are derived from `FLOW`, so they cannot disagree about what
 * follows what.
 */
export function StepNav({
  current,
  /**
   * Why forward is unavailable, or null when it is available.
   *
   * Rendered next to a programmatically disabled button rather than used to hide
   * it: a control that vanishes teaches nothing, and the reason is the whole
   * point — "four items still need a quick check" is what the user has to act on.
   */
  blockedReason = null,
  /**
   * Side effects to run just before moving forward — advancing the move's status,
   * in practice. Navigation itself stays here, so the two directions cannot end
   * up implemented differently on different screens.
   */
  onAdvance,
}: {
  current: FlowRoute;
  blockedReason?: string | null;
  onAdvance?: () => void;
}) {
  const router = useRouter();
  const back = previousStep(current);
  const forward = nextStep(current);
  const position = stepPosition(current);

  const backLabel = back ? back.title : 'My Move';
  const blocked = blockedReason !== null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => router.replace(back ? back.route : '/')}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          style={({ pressed }) => [styles.button, styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backText} numberOfLines={1}>
            ← {backLabel}
          </Text>
        </Pressable>

        {forward ? (
          <Pressable
            // `replace`, not `push`. These are steps in one flow, not a stack of
            // pages: pushing means a user who walks forward and back a few times
            // builds a history they then have to unwind, and the system back
            // gesture stops matching the button directly above it.
            onPress={() => {
              if (blocked) return;
              onAdvance?.();
              router.replace(forward.route);
            }}
            disabled={blocked}
            accessibilityRole="button"
            accessibilityLabel={`Next, ${forward.title}`}
            accessibilityHint={blockedReason ?? undefined}
            accessibilityState={{ disabled: blocked }}
            style={({ pressed }) => [
              styles.button,
              styles.forward,
              blocked && styles.forwardBlocked,
              pressed && !blocked && styles.pressed,
            ]}
          >
            <Text
              style={[styles.forwardText, blocked && styles.forwardTextBlocked]}
              numberOfLines={1}
            >
              {forward.title} →
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            accessibilityLabel="Done. Back to My Move"
            style={({ pressed }) => [styles.button, styles.forward, pressed && styles.pressed]}
          >
            <Text style={styles.forwardText} numberOfLines={1}>
              Done →
            </Text>
          </Pressable>
        )}
      </View>

      {blockedReason ? <Text style={styles.reason}>{blockedReason}</Text> : null}

      {position ? (
        <Text style={styles.position}>
          Step {position.position} of {position.total}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: space.lg },
  row: { flexDirection: 'row', gap: space.sm },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  back: { borderWidth: 1, borderColor: colors.borderStrong },
  backText: { ...type.bodyStrong, color: colors.text },
  forward: { backgroundColor: colors.accent },
  forwardBlocked: { backgroundColor: colors.disabled },
  forwardText: { ...type.bodyStrong, color: colors.accentText },
  forwardTextBlocked: { color: colors.disabledText },
  pressed: { opacity: 0.8 },
  reason: { ...type.caption, color: colors.amber, textAlign: 'center', lineHeight: 19 },
  position: { ...type.caption, color: colors.textDim, textAlign: 'center' },
});
