import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../src/auth/authStore';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../src/auth/demoCredentials';
import { DEMO_MODE } from '../src/demo/mode';
import { buildDemoMove, DEMO_SCENARIOS } from '../src/demo/scenarios';
import { useMove } from '../src/state/moveStore';
import { Card, PrimaryButton, Screen } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';

/**
 * The demo's front door.
 *
 * Two jobs. It makes the walkthrough start where a real product starts, instead
 * of dropping a first-time visitor into a dashboard with no explanation. And it
 * gives whoever is testing one place to wipe the last person's move and begin
 * again — the thing you always want and never have when a demo link has been
 * passed around a room.
 *
 * The sign-in is not real; src/auth/demoCredentials.ts explains exactly how not
 * real it is. Nothing behind it is private, which is the only reason a bundled
 * password is acceptable here.
 */
export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const { dispatch } = useMove();

  const [email, setEmail] = useState(DEMO_MODE ? DEMO_EMAIL : '');
  const [password, setPassword] = useState(DEMO_MODE ? DEMO_PASSWORD : '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The gate redirects on its own once the session lands, so nothing here needs
  // to navigate. Doing both raced, and produced a visible double transition.
  async function attempt(run: () => Promise<string | null>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const failure = await run();
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  /** Load a scenario, sign in, and land on the dashboard with it already there. */
  async function startWith(scenarioId: string) {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;
    dispatch({ type: 'loadMove', move: buildDemoMove(scenario) });
    await attempt(() => signIn(DEMO_EMAIL, DEMO_PASSWORD));
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.wordmark}>Loadsy</Text>
            <Text style={styles.tagline}>Right size truck. Right price. Right plan.</Text>
          </View>

          <Card style={styles.card}>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              accessibilityLabel="Email address"
              editable={!busy}
            />

            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <TextInput
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              accessibilityLabel="Password"
              editable={!busy}
              onSubmitEditing={() => attempt(() => signIn(email, password))}
              returnKeyType="go"
            />

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <PrimaryButton
              title="Sign in"
              loading={busy}
              onPress={() => attempt(() => signIn(email, password))}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={() => attempt(signInWithGoogle)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              accessibilityHint="Demo placeholder — completes locally without contacting Google"
              style={({ pressed }) => [styles.google, pressed && !busy && styles.pressed]}
            >
              <Text style={styles.googleMark}>G</Text>
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>

            {/*
              Said plainly rather than buried. A button that looks like Google
              sign-in and is not Google sign-in is the kind of thing that gets
              noticed at the worst possible moment; better to be the one who
              mentioned it first.
            */}
            <Text style={styles.googleNote}>
              Placeholder for the demo — this signs in locally and never contacts Google.
            </Text>
          </Card>

          {DEMO_MODE ? (
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>For testers</Text>
              <Text style={styles.sectionBody}>
                Sign in with{' '}
                <Text style={styles.mono}>{DEMO_EMAIL}</Text> /{' '}
                <Text style={styles.mono}>{DEMO_PASSWORD}</Text>, or jump straight in with a
                prepared move. Nothing here is private — the credentials are in the app
                bundle, which is why they can be printed on the screen.
              </Text>

              <Text style={styles.fieldLabel}>START THE WALKTHROUGH WITH</Text>
              <View style={styles.scenarioGrid}>
                {DEMO_SCENARIOS.map((scenario) => (
                  <Pressable
                    key={scenario.id}
                    onPress={() => startWith(scenario.id)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Start the walkthrough with ${scenario.label}`}
                    accessibilityHint={scenario.blurb}
                    style={({ pressed }) => [styles.scenario, pressed && !busy && styles.pressed]}
                  >
                    <Text style={styles.scenarioLabel}>{scenario.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => {
                  dispatch({ type: 'reset' });
                  setEmail(DEMO_EMAIL);
                  setPassword(DEMO_PASSWORD);
                  setError(null);
                  setNotice('Demo reset — the inventory is empty again.');
                }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Reset the demo"
                accessibilityHint="Clears the inventory so the walkthrough starts from nothing"
                style={({ pressed }) => [styles.reset, pressed && !busy && styles.pressed]}
              >
                <Text style={styles.resetText}>Reset the demo</Text>
              </Pressable>

              {notice ? (
                <Text style={styles.notice} accessibilityRole="alert">
                  {notice}
                </Text>
              ) : null}
            </Card>
          ) : null}

          <Text style={styles.footer}>
            Estimates only. Loadsy is not a moving company and never sees your photos after
            they are measured.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  hero: { alignItems: 'center', gap: space.xs, marginTop: space.xl, marginBottom: space.sm },
  wordmark: { ...type.display, color: colors.text, letterSpacing: -1 },
  tagline: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  card: { gap: space.md },
  fieldLabel: { ...type.label, color: colors.textDim },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    ...type.body,
    minHeight: 48,
  },
  error: { ...type.caption, color: colors.danger },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...type.caption, color: colors.textDim },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 48,
  },
  googleMark: { ...type.heading, color: colors.text },
  googleText: { ...type.bodyStrong, color: colors.text },
  googleNote: { ...type.caption, fontSize: 12, color: colors.textDim, lineHeight: 17 },
  sectionTitle: { ...type.heading, color: colors.text },
  sectionBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  mono: { color: colors.text, fontWeight: '700' },
  scenarioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  scenario: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: space.md,
  },
  scenarioLabel: { ...type.caption, color: colors.text, fontWeight: '600' },
  reset: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: space.md,
  },
  resetText: { ...type.caption, color: colors.textMuted },
  notice: { ...type.caption, color: colors.green },
  pressed: { opacity: 0.7 },
  footer: { ...type.caption, fontSize: 12, color: colors.textDim, textAlign: 'center', lineHeight: 17 },
});
