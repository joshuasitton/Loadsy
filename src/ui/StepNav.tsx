import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEntitlement } from '../billing/entitlementStore';
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
  const { allows } = useEntitlement();
  const back = previousStep(current);
  const forward = nextStep(current);
  const position = stepPosition(current);

  const backLabel = back ? back.title : 'My Move';
  const blocked = blockedReason !== null;
  /*
   * The next step exists and this tier cannot open it.
   *
   * Distinct from `blocked`, and checked after it: `blocked` means the user has
   * work to finish, and telling somebody their inventory is incomplete is more
   * use than telling them it is behind a paywall they would hit afterwards
   * anyway. Fix first, then upsell.
   */
  const locked = forward !== null && !blocked && !allows(forward.route);

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

        {forward && locked ? (
          <Pressable
            onPress={() => router.push('/premium')}
            accessibilityRole="button"
            accessibilityLabel={`${forward.title}. Part of Premium`}
            accessibilityHint="Opens what Premium adds"
            style={({ pressed }) => [
              styles.button,
              styles.locked,
              pressed && styles.pressed,
            ]}
          >
            {/*
              Outline, not the filled accent the ordinary Next button uses. It is
              still the thing to tap, but tapping it does not continue the flow —
              it explains why the flow stops here — and a control that looks
              identical to "Next" while doing something else is a small lie.
            */}
            <Text style={styles.lockedText} numberOfLines={1}>
              Unlock {forward.title}
            </Text>
          </Pressable>
        ) : forward ? (
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

      {locked ? (
        <Text style={styles.lockedNote}>
          Your truck size and prices are done — that is the whole free app. The load order and
          the layout are Premium.
        </Text>
      ) : null}

      {/*
        "Setup", not "Step". The dashboard already shows "Step 1 of 5" for the
        five stages of a move — which run past booking to moving day — and two
        counters both reading "of 5" while counting different things is worse
        than no counter at all.
      */}
      {position ? (
        <Text style={styles.position}>
          Setup step {position.position} of {position.total}
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
  locked: { borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentDim },
  lockedText: { ...type.bodyStrong, color: colors.accent },
  lockedNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  forwardBlocked: { backgroundColor: colors.disabled },
  forwardText: { ...type.bodyStrong, color: colors.accentText },
  forwardTextBlocked: { color: colors.disabledText },
  pressed: { opacity: 0.8 },
  reason: { ...type.caption, color: colors.amber, textAlign: 'center', lineHeight: 19 },
  position: { ...type.caption, color: colors.textDim, textAlign: 'center' },
});
