import { Pressable, StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/authStore';
import { colors, radius, space, type } from './theme';

/**
 * Sign out, in the navigation header, on every screen that has one.
 *
 * It lives in `screenOptions` rather than being pasted into each screen so it
 * cannot go missing from one of them — which is exactly what happens to a control
 * that has to be remembered eight times, and the screen it goes missing from is
 * always the one somebody is stuck on.
 *
 * Renders nothing when signed out, so the login screen and any future
 * unauthenticated route are unaffected without needing to know about this.
 */
export function SignOutButton() {
  const { status, signOut } = useAuth();

  if (status !== 'signedIn') return null;

  return (
    <Pressable
      onPress={() => void signOut()}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      accessibilityHint="Returns to the sign-in screen. Your move stays saved on this device."
      // A wider tap target than the text: this sits at the very edge of the
      // screen, where a thumb lands imprecisely.
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>Sign out</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  pressed: { opacity: 0.6 },
  label: { ...type.caption, color: colors.accent, fontWeight: '600' },
});
