import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchQuotes } from '../src/api/rentals';
import {
  formatUSD,
  QUOTE_FILTER_LABEL,
  sortQuotes,
  VENDOR_LABEL,
  VENDOR_SEARCH_URL,
  type QuoteFilter,
} from '../src/domain/quotes';
import type { RentalQuote } from '../src/domain/types';
import {
  buildTrip,
  describeTrip,
  estimateTripMiles,
  isValidZip,
  LONG_HAUL_MILES,
} from '../src/domain/trip';
import { TRUCK_LABEL } from '../src/domain/truck';
import { getDeviceZip, hasLocationPermission } from '../src/location/deviceZip';
import { useMove } from '../src/state/moveStore';
import {
  Banner,
  Card,
  Chip,
  EstimateTag,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionLabel,
} from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';
import { StepNav } from '../src/ui/StepNav';

/** Screen 4 — Local Prices. */

const FILTERS: QuoteFilter[] = ['bestMatch', 'cheapest', 'earliest'];

export default function PricesScreen() {
  const router = useRouter();
  const { move, dispatch, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const [zipDraft, setZipDraft] = useState(move.originZip);
  const [destinationDraft, setDestinationDraft] = useState(move.destinationZip ?? '');
  /**
   * Blank means "use the estimate". Kept as text rather than a number so a
   * half-typed "12" is not read as twelve miles and requoted on every keystroke.
   */
  const [milesDraft, setMilesDraft] = useState(
    move.tripMiles === null ? '' : String(move.tripMiles),
  );
  /**
   * Forces the ZIP card back open after one has been set.
   *
   * The card rendered only while the stored ZIP was under 5 digits, and nothing in
   * the app dispatched setOriginZip anywhere else — so a single fat-fingered entry
   * locked every quote, distance and depot lookup to the wrong metro for the life
   * of the install, recoverable only by deleting app data.
   */
  const [editingZip, setEditingZip] = useState(false);
  /** null while idle; a message when a location attempt could not produce a ZIP. */
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuoteFilter>('bestMatch');
  /** The last result, tagged with the request it actually answered. */
  const [result, setResult] = useState<{
    key: string;
    quotes: RentalQuote[];
    failed: boolean;
  } | null>(null);
  /** Bumped by Retry, so an unchanged request can still be run again. */
  const [attempt, setAttempt] = useState(0);

  const zip = move.originZip;

  /**
   * Default the ZIP from the device — but only when permission is ALREADY granted.
   *
   * Requesting on first paint would put a system location prompt in front of a user
   * who has not yet been told why Loadsy wants it, which is both poor practice and
   * a reliable App Store review note. Users who have not granted get the explicit
   * button below instead, next to the copy explaining the reason.
   */
  useEffect(() => {
    if (move.originZip.length === 5) return;
    let cancelled = false;
    (async () => {
      if (!(await hasLocationPermission())) return;
      const result = await getDeviceZip();
      if (cancelled || result.status !== 'ok') return;
      setZipDraft(result.zip);
      dispatch({ type: 'setOriginZip', zip: result.zip });
    })();
    return () => {
      cancelled = true;
    };
  }, [move.originZip, dispatch]);

  async function fillZipFromLocation() {
    setLocating(true);
    setLocationNote(null);
    const result = await getDeviceZip({ request: true });
    setLocating(false);
    if (result.status === 'ok') {
      setZipDraft(result.zip);
      dispatch({ type: 'setOriginZip', zip: result.zip });
      setEditingZip(false);
      return;
    }
    // Never a blocking error: the text field beside this is the real path.
    setLocationNote(
      result.status === 'denied'
        ? 'Location is off for Loadsy. Enter your ZIP below instead.'
        : "Couldn't read your location. Enter your ZIP below instead.",
    );
  }
  // Must be memoised. `new Date()` on every render would give the effect below a
  // new date every render, and it would refetch forever.
  const isoDate = useMemo(() => move.moveDate ?? new Date().toISOString(), [move.moveDate]);

  const trip = useMemo(() => buildTrip(move), [move]);
  /**
   * Every input the quotes depend on. The destination and the mileage belong in
   * here as much as the origin does: changing either changes the mileage line,
   * the fuel line and — for a one-way — which vendors charge a drop fee at all.
   * Left out, the screen would keep showing the previous trip's prices under the
   * new trip's heading.
   */
  const requestKey = `${recommendation.size}|${zip}|${trip.destinationZip ?? '-'}|${trip.kind}|${trip.distanceMiles}|${isoDate}`;

  // Tagging the result means a stale one stops counting the instant the zip, date
  // or truck size changes, rather than showing prices for the previous query.
  const current = result?.key === requestKey ? result : null;
  const quotes = current?.quotes ?? null;
  const failed = current?.failed ?? false;
  // Derived, not stored. A `loading` flag would have to be raised synchronously
  // inside the effect, which costs an extra render pass before anything paints.
  const loading = zip.length >= 5 && current === null;

  useEffect(() => {
    if (zip.length < 5) return;
    let cancelled = false;
    fetchQuotes(recommendation.size, trip, isoDate)
      .then((next) => {
        if (!cancelled) setResult({ key: requestKey, quotes: next, failed: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, quotes: [], failed: true });
      });
    // A zip edited mid-flight must not have the old response land on top of it.
    return () => {
      cancelled = true;
    };
  }, [requestKey, attempt, zip, isoDate, recommendation.size, trip]);

  const retry = useCallback(() => {
    // An event handler, not an effect — setting state here is exactly right.
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  // Client-side re-sort only — spec §3 Screen 4 forbids an API call per filter.
  const sorted = useMemo(() => (quotes ? sortQuotes(quotes, filter) : []), [quotes, filter]);

  async function openUrl(url: string) {
    try {
      // In-app browser (SFSafariViewController on iOS) so the user never fully leaves.
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        toolbarColor: colors.bg,
        controlsColor: colors.accent,
      });
    } catch {
      // openBrowserAsync rejects on a double-tap ("Another WebBrowser is already
      // being presented") and when it cannot find a presenting view controller.
      Alert.alert("Couldn't open the vendor page", 'Check your connection and try again.');
    }
  }

  // Computed from the DRAFTS, not the saved move: this card is showing what the
  // user is typing, and a suggestion that lags a field behind is worse than none.
  const draftKind = isValidZip(destinationDraft) && destinationDraft !== zipDraft ? 'oneWay' : 'local';
  const draftMilesPlaceholder = isValidZip(zipDraft)
    ? estimateTripMiles(zipDraft, isValidZip(destinationDraft) ? destinationDraft : null)
    : null;

  if (zip.length < 5 || editingZip) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.zipCard}>
            <SectionLabel>WHERE ARE YOU MOVING FROM?</SectionLabel>
            <Text style={styles.zipBody}>
              Rental rates and availability are local. Your ZIP stays on your device — we only use
              it to look up nearby depots.
            </Text>
            <TextInput
              value={zipDraft}
              onChangeText={(v) => setZipDraft(v.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              placeholder="20147"
              placeholderTextColor={colors.textDim}
              style={styles.zipInput}
              accessibilityLabel="Origin ZIP code"
              maxLength={5}
            />
            <SecondaryButton
              title={locating ? 'Finding you…' : 'Use my current location'}
              onPress={() => {
                void fillZipFromLocation();
              }}
              disabled={locating}
              accessibilityLabel="Fill in my ZIP code from my current location"
            />
            {locationNote ? <Text style={styles.zipNote}>{locationNote}</Text> : null}

            <SectionLabel>AND WHERE TO?</SectionLabel>
            <Text style={styles.zipBody}>
              Leave this blank for a local move. It decides two things that change the
              ranking, not just the totals: how far the truck is metered, and whether
              vendors add a one-way drop fee at all.
            </Text>
            <TextInput
              value={destinationDraft}
              onChangeText={(v) => setDestinationDraft(v.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              placeholder="Same town"
              placeholderTextColor={colors.textDim}
              style={styles.zipInput}
              accessibilityLabel="Destination ZIP code, optional"
              maxLength={5}
            />

            <SectionLabel>HOW FAR IS THE DRIVE?</SectionLabel>
            <Text style={styles.zipBody}>
              {draftMilesPlaceholder === null
                ? 'Enter both ZIPs and Loadsy will suggest a distance.'
                : `Blank uses about ${draftMilesPlaceholder} miles${
                    draftKind === 'local' ? ' for the round trip' : ''
                  } — a rough guess from your ZIPs, not a route. If you know the real figure, it is worth typing: mileage and fuel are what separate the vendors on a long move.`}
            </Text>
            <TextInput
              value={milesDraft}
              onChangeText={(v) => setMilesDraft(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder={draftMilesPlaceholder === null ? 'Miles' : String(draftMilesPlaceholder)}
              placeholderTextColor={colors.textDim}
              style={styles.zipInput}
              accessibilityLabel="Distance in miles, optional"
              maxLength={4}
            />

            <PrimaryButton
              title="Compare local prices"
              disabled={zipDraft.length < 5}
              onPress={() => {
                dispatch({ type: 'setOriginZip', zip: zipDraft });
                dispatch({
                  type: 'setDestinationZip',
                  zip: isValidZip(destinationDraft) ? destinationDraft : null,
                });
                // Blank means "keep using the estimate", which is null rather
                // than zero — zero would be a claim that the truck does not move.
                dispatch({
                  type: 'setTripMiles',
                  miles: milesDraft.trim() === '' ? null : Number(milesDraft),
                });
                setEditingZip(false);
              }}
            />
            {zip.length === 5 ? (
              <SecondaryButton
                title="Cancel"
                onPress={() => {
                  setZipDraft(zip);
                  setEditingZip(false);
                }}
                accessibilityLabel={`Keep the current ZIP code, ${zip}`}
              />
            ) : null}
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>
              {TRUCK_LABEL[recommendation.size]} near {zip}
            </Text>
            <Pressable
              onPress={() => {
                setZipDraft(zip);
                setDestinationDraft(move.destinationZip ?? '');
                setMilesDraft(move.tripMiles === null ? '' : String(move.tripMiles));
                setEditingZip(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Change the trip. Currently ${describeTrip(trip)}`}
              hitSlop={8}
            >
              <Text style={styles.headerChange}>Change</Text>
            </Pressable>
          </View>
          <Text style={styles.headerSubtitle}>{describeTrip(trip)}</Text>
          {trip.isEstimated && trip.distanceMiles >= LONG_HAUL_MILES ? (
            <Text style={styles.headerWarn}>
              That distance is a guess from your ZIP codes. On a drive this long, mileage
              and fuel decide which vendor is cheapest — tap Change and enter the real
              figure before you trust the ranking.
            </Text>
          ) : null}
          <Text style={styles.headerSubtitle}>
            Every price below is an estimate. The vendor confirms the exact total at booking.
          </Text>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f}
              label={QUOTE_FILTER_LABEL[f]}
              active={filter === f}
              onPress={() => setFilter(f)}
              accessibilityLabel={`Sort by ${QUOTE_FILTER_LABEL[f]}`}
            />
          ))}
        </View>

        {loading ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.busyText}>Checking local rates…</Text>
          </View>
        ) : sorted.length === 0 ? (
          <EmptyState zip={zip} failed={failed} onRetry={retry} onOpen={openUrl} />
        ) : (
          sorted.map((quote) => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              onOpenBreakdown={() => router.push({ pathname: '/quote/[id]', params: { id: quote.id } })}
              onViewDeal={() => { void openUrl(quote.deepLinkURL); }}
            />
          ))
        )}

        {sorted.length > 0 ? (
          <Text style={styles.disclosure}>
            Loadsy shows estimated totals so you can compare like for like. We do not add fees, and
            we may earn a commission when you book through a link here.
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <StepNav
          current="/prices"
          onAdvance={() => dispatch({ type: 'setStatus', status: 'packingPlan' })}
        />
      </View>
    </Screen>
  );
}

function QuoteCard({
  quote,
  onOpenBreakdown,
  onViewDeal,
}: {
  quote: RentalQuote;
  onOpenBreakdown: () => void;
  onViewDeal: () => void;
}) {
  const available = new Date(quote.earliestAvailability);
  /*
   * The card is a plain container with two controls inside it, not one control
   * containing another.
   *
   * It used to be pressable itself, with the View Deal button nested inside — two
   * <button> elements one inside the other on web. React reported it as a
   * hydration error on every render of this screen, and it is a real defect
   * rather than a lint nicety: a screen reader announces one control where there
   * are two, keyboard focus lands somewhere ambiguous, and a tap near the button
   * edge is a coin flip between reading a breakdown and leaving for a vendor site.
   */
  return (
    <Card style={styles.quoteCard}>
      <Pressable
        onPress={onOpenBreakdown}
        accessibilityRole="button"
        accessibilityLabel={`${VENDOR_LABEL[quote.vendor]}, estimated total ${formatUSD(quote.estimatedTotal)}. Tap for the full price breakdown.`}
        style={({ pressed }) => [styles.quoteSummary, pressed && styles.quotePressed]}
      >
        <View style={styles.quoteTop}>
          <View style={styles.quoteVendorBlock}>
            <Text style={styles.quoteVendor}>{VENDOR_LABEL[quote.vendor]}</Text>
            <Text style={styles.quoteMeta}>
              Available {available.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
              {Math.round(quote.distanceMiles)} mi
            </Text>
          </View>
          <View style={styles.quotePriceBlock}>
            <Text style={styles.quotePrice}>{formatUSD(quote.estimatedTotal)}</Text>
            <EstimateTag compact />
          </View>
        </View>

        <Text style={styles.quoteBreakdownHint}>
          {formatUSD(quote.baseRate)} base + mileage, fuel and coverage · tap for the full breakdown
        </Text>
      </Pressable>

      <SecondaryButton
        title="View Deal"
        onPress={onViewDeal}
        accessibilityLabel={`View this deal on ${VENDOR_LABEL[quote.vendor]}, opens in an in-app browser`}
      />
    </Card>
  );
}

function EmptyState({
  zip,
  failed,
  onRetry,
  onOpen,
}: {
  zip: string;
  failed: boolean;
  onRetry: () => void;
  onOpen: (url: string) => void;
}) {
  const vendors = Object.entries(VENDOR_SEARCH_URL).filter(([vendor]) => vendor !== 'local');

  return (
    <View style={styles.emptyWrap}>
      <Banner
        tone={failed ? 'danger' : 'amber'}
        title={failed ? "Couldn't reach the rate lookup" : `No rates came back for ${zip}`}
        message="You can still search each vendor directly — here are the links, so this isn't a dead end."
      />
      <View style={styles.emptyLinks}>
        {vendors.map(([vendor, url]) => (
          <Pressable
            key={vendor}
            accessibilityRole="link"
            accessibilityLabel={`Search on ${VENDOR_LABEL[vendor as keyof typeof VENDOR_LABEL]}`}
            onPress={() => onOpen(url)}
            style={styles.emptyLink}
          >
            <Text style={styles.emptyLinkText}>
              Search on {VENDOR_LABEL[vendor as keyof typeof VENDOR_LABEL]} →
            </Text>
          </Pressable>
        ))}
      </View>
      <SecondaryButton title="Try again" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },
  zipNote: { ...type.caption, color: colors.textMuted },
  headerTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  headerChange: { ...type.caption, color: colors.accent, textDecorationLine: 'underline' },
  headerWarn: { ...type.caption, color: colors.amber, lineHeight: 19 },
  header: { gap: space.xs, marginTop: space.sm },
  headerTitle: { ...type.title, color: colors.text },
  headerSubtitle: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  filterRow: { flexDirection: 'row', gap: space.sm },
  busy: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  busyText: { ...type.body, color: colors.textMuted },
  quoteCard: { gap: space.md },
  quoteSummary: { gap: space.md },
  quotePressed: { opacity: 0.7 },
  quoteTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  quoteVendorBlock: { flex: 1, gap: 2 },
  quoteVendor: { ...type.heading, color: colors.text },
  quoteMeta: { ...type.caption, color: colors.textMuted },
  quotePriceBlock: { alignItems: 'flex-end', gap: space.xs },
  quotePrice: { ...type.title, color: colors.text },
  quoteBreakdownHint: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  disclosure: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  emptyWrap: { gap: space.lg },
  emptyLinks: { gap: space.sm },
  emptyLink: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 48,
    justifyContent: 'center',
  },
  emptyLinkText: { ...type.body, color: colors.accent },
  zipCard: { gap: space.md, marginTop: space.lg },
  zipBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  zipInput: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.lg,
    color: colors.text,
    ...type.title,
    letterSpacing: 4,
    textAlign: 'center',
    minHeight: 60,
  },
  footer: {
    padding: space.lg,
    paddingBottom: space.xl,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
