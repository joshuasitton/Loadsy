import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VENDOR_LABEL, VENDOR_SEARCH_URL } from '../src/domain/quotes';
import { TRUCK_LABEL } from '../src/domain/truck';
import type { RentalVendor } from '../src/domain/types';
import { useMove } from '../src/state/moveStore';
import { Card, Screen, SectionLabel } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';
import { StepNav } from '../src/ui/StepNav';

/**
 * Where to rent the truck – decided 15 September in place of prices.
 *
 * The prices screen had nothing behind it: `/v1/quotes` was never built, and the
 * numbers the demo showed were a table of unsourced rates with invented availability.
 * A release build would have shown every user an error, and showing that table
 * instead would have presented guesses as local prices. Live pricing means
 * partnerships and a service to run, which the company will not take on. So v1 gives
 * the size and where to rent it, and each company's own site gives the price.
 *
 * The trip step went with it: addresses, mileage and the move date were collected
 * only to price the truck, and so was the location permission.
 */

/** The companies listed, in this order. "Local" is left out: a search link is not a company. */
const VENDORS: readonly RentalVendor[] = ['uhaul', 'penske', 'budget', 'homeDepot', 'enterprise'];

export default function RentScreen() {
  const { dispatch, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const size = TRUCK_LABEL[recommendation.size];

  async function open(vendor: RentalVendor) {
    try {
      // In-app browser (SFSafariViewController on iOS) so the user never fully leaves.
      await WebBrowser.openBrowserAsync(VENDOR_SEARCH_URL[vendor], {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        toolbarColor: colors.bg,
        controlsColor: colors.accent,
      });
    } catch {
      // Rejects on a double-tap and when there is no view controller to present from.
      Alert.alert(`Couldn't open ${VENDOR_LABEL[vendor]}`, 'Check your connection and try again.');
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <SectionLabel>WHERE TO RENT</SectionLabel>
          <Text style={styles.title}>Rent a {size}</Text>
          <Text style={styles.body}>
            Companies name their sizes differently. Ask for a {size.toLowerCase()} – or the next size up
            if they don&apos;t have one. Never the size below: that is how a load becomes two trips.
          </Text>
        </View>

        <View style={styles.list}>
          {VENDORS.map((vendor) => (
            <Card key={vendor} style={styles.vendor}>
              <Text style={styles.vendorName}>{VENDOR_LABEL[vendor]}</Text>
              <Pressable
                onPress={() => { void open(vendor); }}
                accessibilityRole="link"
                accessibilityLabel={`Check prices for a ${size} at ${VENDOR_LABEL[vendor]}`}
                style={({ pressed }) => [styles.link, pressed && styles.pressed]}
              >
                <Text style={styles.linkText}>Check prices →</Text>
              </Pressable>
            </Card>
          ))}
        </View>

        <Text style={styles.note}>
          Prices and availability come from each company&apos;s own site. Loadsy isn&apos;t paid to list
          them.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <StepNav current="/rent" onAdvance={() => dispatch({ type: 'setStatus', status: 'packingPlan' })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },
  header: { gap: space.xs, marginTop: space.sm },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.textMuted, lineHeight: 22 },
  list: { gap: space.sm },
  vendor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  vendorName: { ...type.heading, color: colors.text, flexShrink: 1 },
  link: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { ...type.bodyStrong, color: colors.accent },
  pressed: { opacity: 0.7 },
  note: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  footer: {
    padding: space.lg,
    paddingBottom: space.xl,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
