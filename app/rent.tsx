import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nearMeUrl } from '../src/domain/nearMe';
import { VENDOR_LABEL } from '../src/domain/quotes';
import { offersFor, type RentableKind, type RentalOffer } from '../src/domain/rentalOffers';
import { SMALL_VEHICLES } from '../src/domain/smallVehicles';
import { TRUCK_LABEL } from '../src/domain/truck';
import { assessSmallVehicles } from '../src/domain/vehicleFit';
import { useMove } from '../src/state/moveStore';
import { Card, Chip, Screen, SectionLabel } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';
import { StepNav } from '../src/ui/StepNav';

/**
 * Where to rent – the truck, or a pickup or trailer the load also fits.
 *
 * Decided 15 September in place of prices: `/v1/quotes` was never built, and the demo's
 * figures were unsourced. Live pricing means partnerships and a service to run, which the
 * company will not take on, so each company's own site gives the price. Pickups and
 * trailers were added 18 September; only the ones that fit this load are offered.
 *
 * The company's site is the main action and opens inside the app, because that is the
 * route an affiliate link will need. "Near me" is secondary: a maps search, which finds
 * the nearest branch without Loadsy asking where the person is (see nearMe.ts), but which
 * leaves the app for Maps.
 */

interface Choice {
  id: string;
  kind: RentableKind;
  label: string;
  advice: string;
}

export default function RentScreen() {
  const { move, dispatch, recommendation } = useMove();
  const insets = useSafeAreaInsets();

  const choices = useMemo<Choice[]>(() => {
    const truck = TRUCK_LABEL[recommendation.size];
    const small = assessSmallVehicles(move, SMALL_VEHICLES)
      .filter((fit) => fit.fits)
      .map((fit) => ({
        id: fit.vehicle.id,
        kind: fit.vehicle.kind,
        label: fit.vehicle.label,
        advice: fit.vehicle.needsTow
          ? `You'll need a vehicle with a hitch that can tow it – the rental company checks yours when you book. It carries up to ${fit.vehicle.maxLoadLb.toLocaleString()} lb.`
          : `It carries up to ${fit.vehicle.maxLoadLb.toLocaleString()} lb. Strap everything down – the bed is open to the weather.`,
      }));
    return [
      {
        id: 'truck',
        kind: 'truck',
        label: truck,
        advice: `Companies name their sizes differently. Ask for a ${truck.toLowerCase()} – or the next size up if they don't have one. Never the size below: that is how a load becomes two trips.`,
      },
      ...small,
    ];
  }, [move, recommendation.size]);

  const [chosenId, setChosenId] = useState('truck');
  const chosen = choices.find((choice) => choice.id === chosenId) ?? choices[0]!;
  const offers = offersFor(chosen.kind);

  async function openSite(offer: RentalOffer) {
    try {
      // In-app browser (SFSafariViewController on iOS): the person stays in Loadsy, and
      // this is the route an affiliate link will need.
      await WebBrowser.openBrowserAsync(offer.url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        toolbarColor: colors.bg,
        controlsColor: colors.accent,
      });
    } catch {
      Alert.alert(`Couldn't open ${VENDOR_LABEL[offer.vendor]}`, 'Check your connection and try again.');
    }
  }

  async function openNearMe(offer: RentalOffer) {
    try {
      await Linking.openURL(nearMeUrl(offer.nearMeQuery, Platform.OS === 'ios' ? 'ios' : 'other'));
    } catch {
      Alert.alert("Couldn't open Maps", 'Search your maps app for ' + offer.nearMeQuery + '.');
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <SectionLabel>WHERE TO RENT</SectionLabel>
          <Text style={styles.title}>Rent a {chosen.label}</Text>
          <Text style={styles.body}>{chosen.advice}</Text>
        </View>

        {choices.length > 1 ? (
          <View style={styles.choices}>
            {choices.map((choice) => (
              <Chip
                key={choice.id}
                label={choice.id === 'truck' ? `${choice.label} (recommended)` : choice.label}
                active={choice.id === chosen.id}
                onPress={() => setChosenId(choice.id)}
                accessibilityLabel={`Show where to rent a ${choice.label}`}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.list}>
          {offers.map((offer) => (
            <Card key={`${chosen.id}-${offer.vendor}`} style={styles.vendor}>
              <View style={styles.vendorHead}>
                <View style={styles.vendorText}>
                  <Text style={styles.vendorName}>{VENDOR_LABEL[offer.vendor]}</Text>
                  {offer.note ? <Text style={styles.vendorNote}>{offer.note}</Text> : null}
                </View>
                <Pressable
                  onPress={() => { void openSite(offer); }}
                  accessibilityRole="link"
                  accessibilityLabel={`Check prices for a ${chosen.label} at ${VENDOR_LABEL[offer.vendor]}`}
                  style={({ pressed }) => [styles.link, pressed && styles.pressed]}
                >
                  <Text style={styles.linkText}>Check prices →</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => { void openNearMe(offer); }}
                accessibilityRole="link"
                accessibilityLabel={`Find ${VENDOR_LABEL[offer.vendor]} near me in Maps`}
                hitSlop={8}
                style={({ pressed }) => [styles.nearMe, pressed && styles.pressed]}
              >
                <Text style={styles.nearMeText}>Near me ↗</Text>
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
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  list: { gap: space.sm },
  vendor: { gap: space.sm },
  vendorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  vendorText: { flexShrink: 1, gap: 2 },
  vendorName: { ...type.heading, color: colors.text },
  vendorNote: { ...type.caption, color: colors.textMuted },
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
  nearMe: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  nearMeText: { ...type.caption, color: colors.accent, textDecorationLine: 'underline' },
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
