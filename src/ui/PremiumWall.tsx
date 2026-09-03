import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEntitlement } from '../billing/entitlementStore';
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  PREMIUM_TAGLINE,
  type TierFeature,
} from '../domain/tier';
import { Card, PrimaryButton, Screen, SecondaryButton, SectionLabel } from './components';
import { colors, radius, space, type } from './theme';

/**
 * What a Free account sees where a Premium screen would be.
 *
 * Rendered in place, not redirected to. A redirect would break the back button
 * (you would land on the wall and "back" would bounce you through the screen you
 * were never allowed into) and it would break a shared URL, which should open
 * the wall for the thing it names rather than a generic one.
 *
 * The tone is a deliberate constraint: this is a wall in front of software that
 * exists and is not for sale yet, so it can describe and it can take an address
 * for later, but it must not imply a purchase is possible. The moment
 * `PREMIUM_FOR_SALE` is true the call to action changes and the rest stays.
 */
export function PremiumWall({
  /** The screen they tried to open, if they tried to open one. */
  feature,
}: {
  feature?: string;
}) {
  const router = useRouter();
  const { forSale, interested, registerInterest, canPreview, setTier } = useEntitlement();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.lock}>PREMIUM</Text>
          <Text style={styles.title}>
            {feature ? `${feature} is part of Premium` : 'Loadsy Premium'}
          </Text>
          <Text style={styles.tagline}>{PREMIUM_TAGLINE}</Text>
        </View>

        <Card style={styles.block}>
          <SectionLabel>WHAT PREMIUM ADDS</SectionLabel>
          {PREMIUM_FEATURES.map((item) => (
            <FeatureRow key={item.title} item={item} />
          ))}
          {/*
            Said once, plainly, rather than left for someone to infer from two
            small labels. Half of this list is finished software behind a lock and
            half of it is not written yet, and a person deciding whether to care
            deserves to know which half is which.
          */}
          <Text style={styles.note}>
            The first two are built and working today. The last two are planned, and neither is
            in this release.
          </Text>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>FREE, AND STAYING FREE</SectionLabel>
          {FREE_FEATURES.map((item) => (
            <FeatureRow key={item.title} item={item} />
          ))}
          <Text style={styles.note}>
            You never need Premium to find out what size truck you need or what it costs. That is
            the whole of the free app, and it is not a trial.
          </Text>
        </Card>

        {/*
          There is deliberately no "Buy" button in any branch. This app has no
          billing — no products, no receipts, no server — so a button that looked
          like a purchase would be the one lie on the screen. The flag changes
          what the wall SAYS, and the note below is the guardrail against someone
          turning it on before the thing it advertises exists.
        */}
        {forSale ? (
          <View style={styles.done} accessibilityRole="alert">
            <Text style={styles.doneText}>
              EXPO_PUBLIC_PREMIUM_FOR_SALE is on, but no purchase flow is implemented. Wire up
              billing before this reaches anyone.
            </Text>
          </View>
        ) : interested ? (
          <View style={styles.done} accessibilityRole="alert">
            <Text style={styles.doneText}>
              Noted — we&apos;ll tell you when Premium ships. Nothing was sent anywhere; that is
              kept on this phone.
            </Text>
          </View>
        ) : (
          <PrimaryButton
            title="Tell me when Premium ships"
            onPress={registerInterest}
            accessibilityHint="Records your interest on this phone. Nothing is sent."
          />
        )}

        {!forSale ? (
          <Text style={styles.status}>
            Premium is not for sale yet — it comes after launch. There is nothing to buy on this
            screen.
          </Text>
        ) : null}

        <SecondaryButton title="Back to my move" onPress={() => router.replace('/')} />

        {/*
          Demo builds only. It is how a walkthrough gets from the locked door to
          the room behind it without a purchase — and back, which matters more,
          because the free experience is the one that ships.
        */}
        {canPreview ? (
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>DEMO</Text>
            <SecondaryButton
              title="Preview Premium"
              onPress={() => setTier('premium')}
              accessibilityLabel="Preview Premium for this demo"
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function FeatureRow({ item }: { item: TierFeature }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        {!item.built ? <Text style={styles.rowLater}>LATER</Text> : null}
      </View>
      <Text style={styles.rowBody}>{item.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  head: { gap: space.sm, marginTop: space.sm },
  lock: {
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
  tagline: { ...type.body, color: colors.textMuted, lineHeight: 21 },
  block: { gap: space.md },
  row: { gap: 2 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowTitle: { ...type.heading, color: colors.text },
  rowLater: { ...type.label, fontSize: 9, color: colors.textDim },
  rowBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  note: { ...type.caption, color: colors.textDim, lineHeight: 19 },
  status: { ...type.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  done: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
    padding: space.lg,
  },
  doneText: { ...type.caption, color: colors.text, lineHeight: 19 },
  preview: {
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.lg,
  },
  previewLabel: { ...type.label, fontSize: 9, color: colors.textDim, textAlign: 'center' },
});
