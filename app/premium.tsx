import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEntitlement } from '../src/billing/entitlementStore';
import { PREMIUM_FEATURES } from '../src/domain/tier';
import { Card, Screen, SecondaryButton, SectionLabel } from '../src/ui/components';
import { PremiumWall } from '../src/ui/PremiumWall';
import { colors, radius, space, type } from '../src/ui/theme';

/**
 * The Premium screen, reached from a lock or opened directly.
 *
 * Two states, because a URL that means "tell me about Premium" has to answer
 * somebody who already has it as well as somebody who does not — and for the
 * second, the honest answer is a list of what is on, plus the way back off it.
 */
export default function PremiumScreen() {
  const router = useRouter();
  const { tier, canPreview, setTier } = useEntitlement();

  if (tier === 'free') return <PremiumWall />;

  const built = PREMIUM_FEATURES.filter((feature) => feature.built);
  const planned = PREMIUM_FEATURES.filter((feature) => !feature.built);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.badge}>PREMIUM ON</Text>
          <Text style={styles.title}>Everything is unlocked</Text>
        </View>

        <Card style={styles.block}>
          <SectionLabel>OPEN NOW</SectionLabel>
          {built.map((feature) => (
            <Text key={feature.title} style={styles.line}>
              {feature.title}
            </Text>
          ))}
          <SecondaryButton title="Open the Packing Plan" onPress={() => router.replace('/packing')} />
        </Card>

        <Card style={styles.block}>
          <SectionLabel>STILL TO COME</SectionLabel>
          {planned.map((feature) => (
            <Text key={feature.title} style={styles.lineDim}>
              {feature.title} — not in this release
            </Text>
          ))}
        </Card>

        <SecondaryButton title="Back to my move" onPress={() => router.replace('/')} />

        {canPreview ? (
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>DEMO</Text>
            <SecondaryButton
              title="Back to Free"
              onPress={() => setTier('free')}
              accessibilityLabel="Return this demo to the free tier"
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  head: { gap: space.sm, marginTop: space.sm },
  badge: {
    ...type.label,
    fontSize: 10,
    alignSelf: 'flex-start',
    color: colors.accentText,
    backgroundColor: colors.accent,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  title: { ...type.title, color: colors.text },
  block: { gap: space.md },
  line: { ...type.body, color: colors.text },
  lineDim: { ...type.body, color: colors.textMuted },
  preview: {
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.lg,
  },
  previewLabel: { ...type.label, fontSize: 9, color: colors.textDim, textAlign: 'center' },
});
