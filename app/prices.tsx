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

/** Screen 4 — Local Prices. */

const FILTERS: QuoteFilter[] = ['bestMatch', 'cheapest', 'earliest'];

export default function PricesScreen() {
  const router = useRouter();
  const { move, dispatch, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const [zipDraft, setZipDraft] = useState(move.originZip);
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
  const requestKey = `${recommendation.size}|${zip}|${isoDate}`;

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
    fetchQuotes(recommendation.size, zip, isoDate)
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
  }, [requestKey, attempt, zip, isoDate, recommendation.size]);

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
            <PrimaryButton
              title="Find local prices"
              disabled={zipDraft.length < 5}
              onPress={() => {
                dispatch({ type: 'setOriginZip', zip: zipDraft });
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
                setEditingZip(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Change origin ZIP code, currently ${zip}`}
              hitSlop={8}
            >
              <Text style={styles.headerChange}>Change</Text>
            </Pressable>
          </View>
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
        <PrimaryButton
          title="Build my packing plan"
          onPress={() => {
            dispatch({ type: 'setStatus', status: 'packingPlan' });
            router.push('/packing');
          }}
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
  return (
    <Card
      onPress={onOpenBreakdown}
      accessibilityLabel={`${VENDOR_LABEL[quote.vendor]}, estimated total ${formatUSD(quote.estimatedTotal)}. Tap for the full price breakdown.`}
      style={styles.quoteCard}
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
  header: { gap: space.xs, marginTop: space.sm },
  headerTitle: { ...type.title, color: colors.text },
  headerSubtitle: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  filterRow: { flexDirection: 'row', gap: space.sm },
  busy: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  busyText: { ...type.body, color: colors.textMuted },
  quoteCard: { gap: space.md },
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
