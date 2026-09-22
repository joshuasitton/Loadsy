import { Link, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_PATH } from '../src/domain/site';
import { markWelcomeSeen } from '../src/onboarding/welcome';
import { Mark } from '../src/ui/Mark';
import { PrimaryButton, Screen } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';

/**
 * The first screen on a new phone, once.
 *
 * Asked for by the Chairman after the first TestFlight install: the store build opened
 * straight onto an empty dashboard, which is the right screen for the fiftieth launch and
 * a cold one for the first. This says what the app is in three lines and gets out of the
 * way – no pages to swipe, no account, nothing to skip on every open, because it is never
 * shown again. `src/onboarding/welcome.ts` holds the flag; the gate is in app/_layout.tsx.
 *
 * The tagline is not here. "Right price." is under review now that v1 shows no prices,
 * and the one screen that introduces the product should not introduce a claim it does
 * not make.
 */
const STEPS = [
  { title: 'Photograph each room', body: 'Stand in the doorway and get the whole room in. One more from another corner helps.' },
  { title: 'Check the list', body: 'Loadsy names each piece and sizes it. Fix anything it got wrong, add what it missed.' },
  { title: 'Get the truck that fits', body: 'The smallest truck with room to spare, who rents it near you, and the order to load it in.' },
];

export default function WelcomeScreen() {
  const router = useRouter();

  async function start() {
    await markWelcomeSeen();
    router.replace('/');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Mark size={72} accessibilityLabel="Loadsy" />
          <Text style={styles.wordmark}>Loadsy</Text>
          <Text style={styles.lede}>
            Photograph what you&apos;re moving. Loadsy works out how much truck you actually need.
          </Text>
        </View>

        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{index + 1}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepText}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <PrimaryButton title="Get started" onPress={() => void start()} />
          <Text style={styles.note}>
            No account. Everything stays on this phone, and photos are read once and not kept.
          </Text>
          <Link href={PRIVACY_PATH} style={styles.footLink}>
            <Text style={styles.footText}>Privacy</Text>
          </Link>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.xl, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: space.sm, marginTop: space.xl },
  wordmark: { ...type.display, color: colors.text, letterSpacing: -1 },
  lede: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: space.md },
  steps: { gap: space.md },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  badge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeText: { ...type.label, color: colors.accentText },
  stepBody: { flex: 1, gap: 2 },
  stepTitle: { ...type.heading, color: colors.text },
  stepText: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  actions: { gap: space.md, alignItems: 'stretch' },
  note: { ...type.caption, color: colors.textDim, textAlign: 'center', lineHeight: 19 },
  footLink: { alignSelf: 'center', paddingVertical: space.xs },
  footText: { ...type.caption, color: colors.textDim },
});
