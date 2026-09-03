import { useEffect, useState, useRef} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addressForMove,
  formatAddressLine,
  isEmptyAddress,
  isPreciseAddress,
  isUsableAddress,
  normaliseAddress,
  type Address,
} from '../src/domain/address';
import { buildTrip, estimateTripMiles, LONG_HAUL_MILES } from '../src/domain/trip';
import { getDeviceZip, hasLocationPermission } from '../src/location/deviceZip';
import { useMove } from '../src/state/moveStore';
import { Card, Screen, SecondaryButton, SectionLabel } from '../src/ui/components';
import { StepNav } from '../src/ui/StepNav';
import { colors, radius, space, type } from '../src/ui/theme';

/**
 * Step 2 — where the move starts and where it ends.
 *
 * This is a step of its own rather than a field buried on the prices screen
 * because it decides two things that change which vendor wins, not merely what
 * each one costs: whether a one-way drop fee applies at all, and how many miles
 * are metered. Both were previously guessed from a single origin ZIP.
 *
 * Only the ZIP is required. Someone who knows they are moving to 78745 but has
 * not signed a lease can still get a truck size and a comparison, which is the
 * point of the app — and the street lines buy nothing computationally until a
 * routing service exists. The screen says so rather than demanding them.
 *
 * Nothing entered here leaves the device. See src/domain/address.ts.
 */
export default function TripScreen() {
  const { move, dispatch } = useMove();
  const insets = useSafeAreaInsets();

  /**
   * Rendered straight from the move, not from a local copy.
   *
   * A local copy seeded at mount went stale the moment the move changed
   * underneath it — load a demo scenario from the dashboard, come back here, and
   * the form still showed the previous trip while the app priced the new one.
   * React Navigation keeps screens mounted, so the initialiser that would have
   * refreshed it never ran again.
   *
   * `addressForMove` recovers a bare ZIP from a move saved before addresses
   * existed, so nobody's origin is lost to the upgrade.
   */
  const origin = addressForMove(move.originAddress, move.originZip);
  const destination = addressForMove(move.destinationAddress, move.destinationZip);
  const milesDraft = move.tripMiles === null ? '' : String(move.tripMiles);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  /**
   * Fill the pickup address from the device — but ONLY when permission is
   * already granted.
   *
   * Requesting on first paint would put a system location prompt in front of
   * someone who has not yet been told why Loadsy wants it: poor practice, and a
   * reliable App Store review note. Anyone who has not granted gets the explicit
   * button below instead, next to the copy explaining the reason. This is a
   * commitment recorded in APP_STORE.md, not a preference.
   */
  // Fire once per mount, not on every empty-string transition. Without the ref
  // a user who clears the field to type a new ZIP gets overwritten by the
  // device location before they can type a digit.
  const autoFilled = useRef(false);
  useEffect(() => {
    if (autoFilled.current || move.originZip !== '') return;
    let cancelled = false;
    (async () => {
      if (!(await hasLocationPermission())) return;
      const result = await getDeviceZip();
      if (cancelled || result.status !== 'ok') return;
      autoFilled.current = true;
      dispatch({ type: 'setOriginAddress', address: result.address });
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trip = buildTrip(move);
  const originReady = isUsableAddress(origin);
  const destinationEntered = !isEmptyAddress(destination);
  const suggestedMiles = originReady
    ? estimateTripMiles(origin.postalCode, isUsableAddress(destination) ? destination.postalCode : null)
    : null;

  /**
   * Committed on every edit rather than behind a Save button.
   *
   * The step has a Next button already, and a second commit control beside it is
   * the kind of thing people miss — then walk forward and find the old ZIP still
   * priced. The reducer is the single writer and derives the ZIPs, so a partial
   * address simply does not reach the quote until it has one.
   */
  function commitOrigin(next: Address) {
    dispatch({ type: 'setOriginAddress', address: next });
  }

  function commitDestination(next: Address) {
    dispatch({ type: 'setDestinationAddress', address: next });
  }

  async function fillFromLocation() {
    setLocating(true);
    setLocationNote(null);
    try {
      const result = await getDeviceZip({ request: true });

      if (result.status === 'ok') {
        // Merged, not replaced: an apartment number the user typed is not something
        // the geocoder knows, and overwriting it would be a silent data loss.
        commitOrigin(normaliseAddress({ ...result.address, line2: origin.line2 }));
        return;
      }
      setLocationNote(
        result.status === 'denied'
          ? 'Location is off for Loadsy. Type the address instead.'
          : "Couldn't read your location. Type the address instead.",
      );
    } catch {
      setLocationNote("Couldn't read your location. Type the address instead.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Where the truck picks up and drops off. This sets your mileage — and whether
            vendors add a one-way drop fee, which changes who comes out cheapest.
          </Text>

          <Card style={styles.card}>
            <SectionLabel>MOVING FROM</SectionLabel>
            <AddressFields
              value={origin}
              onChange={commitOrigin}
              autoCompletePrefix="from"
              zipRequired
            />
            <SecondaryButton
              title={locating ? 'Finding you…' : 'Use my current location'}
              onPress={() => void fillFromLocation()}
              disabled={locating}
              accessibilityLabel="Fill in the pickup address from my current location"
            />
            {locationNote ? <Text style={styles.note}>{locationNote}</Text> : null}
          </Card>

          <Card style={styles.card}>
            <SectionLabel>MOVING TO</SectionLabel>
            <Text style={styles.help}>Blank means a local move — same town, truck comes back.</Text>
            <AddressFields
              value={destination}
              onChange={commitDestination}
              autoCompletePrefix="to"
              zipRequired={false}
            />
          </Card>

          <Card style={styles.card}>
            <SectionLabel>HOW FAR IS THE DRIVE?</SectionLabel>
            <Text style={styles.help}>
              {suggestedMiles === null
                ? 'Enter a pickup ZIP and Loadsy will suggest a distance.'
                : `Blank uses about ${suggestedMiles} miles${
                    isUsableAddress(destination) && destination.postalCode !== origin.postalCode
                      ? ''
                      : ' for the round trip'
                  }.`}
            </Text>
            {/*
              Said plainly, because the number is load-bearing. Turning two
              addresses into real road miles needs a geocoder and a routing
              service, and Loadsy has neither yet — so the suggestion reads the
              ZIPs and nothing else. An estimate somebody can see and correct
              beats a confident one they cannot.
            */}
            <Text style={styles.help}>
              A guess from the ZIP codes, not a route. Worth correcting if you know it.
            </Text>
            <TextInput
              value={milesDraft}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, 4);
                dispatch({
                  type: 'setTripMiles',
                  miles: digits === '' ? null : Number(digits),
                });
              }}
              keyboardType="number-pad"
              placeholder={suggestedMiles === null ? 'Miles' : String(suggestedMiles)}
              placeholderTextColor={colors.textDim}
              style={[styles.input, styles.milesInput]}
              accessibilityLabel="Distance in miles, optional"
              maxLength={4}
            />
          </Card>

          {originReady ? (
            <Card style={styles.summary}>
              <SectionLabel>THIS TRIP</SectionLabel>
              <Text style={styles.summaryLine}>{formatAddressLine(origin)}</Text>
              <Text style={styles.summaryArrow}>↓</Text>
              <Text style={styles.summaryLine}>
                {destinationEntered ? formatAddressLine(destination) : 'Somewhere local'}
              </Text>
              <Text style={styles.summaryMeta}>
                {trip.kind === 'oneWay'
                  ? `${trip.distanceMiles} mi one way · vendors may add a drop fee`
                  : `${trip.distanceMiles} mi round trip · no one-way drop fee`}
              </Text>
              {trip.isEstimated && trip.distanceMiles >= LONG_HAUL_MILES ? (
                <Text style={styles.warn}>
                  On a drive this long, mileage and fuel decide which vendor is cheapest.
                  Worth entering the real distance above before you compare.
                </Text>
              ) : null}
              {destinationEntered && !isPreciseAddress(destination) ? (
                <Text style={styles.note}>
                  A ZIP is enough to compare prices. The street is for your own record and
                  never leaves this device.
                </Text>
              ) : null}
            </Card>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
          <StepNav
            current="/trip"
            blockedReason={
              originReady ? null : 'Enter the ZIP you are moving from to compare prices'
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * One address, five fields.
 *
 * Kept as one component so both ends of the move look and behave identically —
 * two hand-written copies is how the destination ends up without the state field
 * somebody added to the origin.
 */
function AddressFields({
  value,
  onChange,
  autoCompletePrefix,
  zipRequired,
}: {
  value: Address;
  onChange: (next: Address) => void;
  autoCompletePrefix: string;
  zipRequired: boolean;
}) {
  const set = (patch: Partial<Address>) => onChange(normaliseAddress({ ...value, ...patch }));

  return (
    <View style={styles.fields}>
      <TextInput
        value={value.line1}
        onChangeText={(v) => set({ line1: v })}
        placeholder="Street address"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        accessibilityLabel={`Street address, moving ${autoCompletePrefix}`}
        autoCapitalize="words"
        textContentType="streetAddressLine1"
      />
      <TextInput
        value={value.line2}
        onChangeText={(v) => set({ line2: v })}
        placeholder="Apt, unit, floor (optional)"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        accessibilityLabel={`Apartment or unit, moving ${autoCompletePrefix}`}
        autoCapitalize="words"
        textContentType="streetAddressLine2"
      />
      <View style={styles.row}>
        <TextInput
          value={value.city}
          onChangeText={(v) => set({ city: v })}
          placeholder="City"
          placeholderTextColor={colors.textDim}
          style={[styles.input, styles.city]}
          accessibilityLabel={`City, moving ${autoCompletePrefix}`}
          autoCapitalize="words"
          textContentType="addressCity"
        />
        <TextInput
          value={value.state}
          onChangeText={(v) => set({ state: v })}
          placeholder="ST"
          placeholderTextColor={colors.textDim}
          style={[styles.input, styles.state]}
          accessibilityLabel={`State, moving ${autoCompletePrefix}`}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={2}
          textContentType="addressState"
        />
      </View>
      <TextInput
        value={value.postalCode}
        onChangeText={(v) => set({ postalCode: v })}
        placeholder={zipRequired ? 'ZIP code' : 'ZIP code (optional)'}
        placeholderTextColor={colors.textDim}
        style={[styles.input, styles.zip]}
        accessibilityLabel={`ZIP code, moving ${autoCompletePrefix}${zipRequired ? '' : ', optional'}`}
        keyboardType="number-pad"
        maxLength={5}
        textContentType="postalCode"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  intro: { ...type.body, color: colors.textMuted, lineHeight: 21, marginTop: space.sm },
  card: { gap: space.md },
  help: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  note: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  warn: { ...type.caption, color: colors.amber, lineHeight: 19 },
  fields: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
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
  /*
   * flexBasis 0 and minWidth 0, not just flex.
   *
   * A TextInput carries an intrinsic width — roughly twenty characters — and a
   * bare `flex: 1` grows FROM that rather than shrinking to it. On a 375pt phone
   * the state field kept its natural size and ran 67pt off the right edge, with
   * no horizontal scroll to reach it. The city field hid the same fault by being
   * wide enough that its intrinsic width never bound.
   */
  city: { flex: 3, flexBasis: 0, minWidth: 0 },
  state: { flex: 1, flexBasis: 0, minWidth: 0, textAlign: 'center', letterSpacing: 2 },
  // Letter-spaced digits read as a code rather than a number, but 3pt turned
  // "78704" into something closer to five separate numerals.
  zip: { letterSpacing: 1.5 },
  milesInput: { textAlign: 'center', letterSpacing: 2 },
  summary: { gap: space.xs },
  summaryLine: { ...type.bodyStrong, color: colors.text },
  summaryArrow: { ...type.caption, color: colors.textDim },
  summaryMeta: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
