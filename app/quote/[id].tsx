import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCachedQuote } from '../../src/api/quoteCache';
import {
  formatUSD,
  isEstimatedLineItem,
  LINE_ITEM_LABEL,
  QUOTE_LINE_ITEM_KEYS,
  sumLineItems,
  totalMatchesLineItems,
  VENDOR_LABEL,
} from '../../src/domain/quotes';
import { TRUCK_LABEL } from '../../src/domain/truck';
import { Banner, Card, PrimaryButton, Screen, SecondaryButton } from '../../src/ui/components';
import { colors, radius, space, type } from '../../src/ui/theme';

/**
 * Spec §3.1 — Price Breakdown Sheet.
 *
 * Trust-critical. The per-line breakdown is the whole point of this screen and must
 * not be collapsed into a single total, whatever the schedule pressure.
 */
export default function QuoteBreakdownScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const quote = typeof id === 'string' ? getCachedQuote(id) : null;

  if (!quote) {
    return (
      <Screen>
        <View style={styles.missing}>
          <Banner
            tone="neutral"
            title="That quote is no longer loaded"
            message="Rates refresh when you reopen the prices list. Head back and tap it again."
          />
          <SecondaryButton title="Back to prices" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const lineItems = QUOTE_LINE_ITEM_KEYS.map((key) => ({
    key,
    label: LINE_ITEM_LABEL[key],
    value: quote[key] ?? 0,
    present: quote[key] !== null,
    estimated: isEstimatedLineItem(key),
  }));

  // Belt and braces: the fetch layer already drops quotes that fail §4.2, but if one
  // ever reached this screen we would rather say so than quietly show a wrong total.
  const reconciles = totalMatchesLineItems(quote);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.vendor}>{VENDOR_LABEL[quote.vendor]}</Text>
          <Text style={styles.truck}>
            {TRUCK_LABEL[quote.truckSize]} · {Math.round(quote.distanceMiles)} miles
          </Text>
        </View>

        {!reconciles ? (
          <Banner
            tone="danger"
            title="These numbers don't add up"
            message={`The line items total ${formatUSD(sumLineItems(quote))} but the quote says ${formatUSD(quote.estimatedTotal)}. Check with the vendor directly before booking.`}
          />
        ) : null}

        <Card style={styles.breakdown}>
          {lineItems.map((line) => (
            <View key={line.key} style={styles.line}>
              <View style={styles.lineLabelBlock}>
                <Text style={styles.lineLabel}>{line.label}</Text>
                <LineTag value={line.value} estimated={line.estimated} present={line.present} />
              </View>
              <Text
                style={[
                  styles.lineValue,
                  !line.present
                    ? styles.lineValueAbsent
                    : line.estimated
                      ? styles.lineValueEstimated
                      : styles.lineValueConfirmed,
                ]}
              >
                {line.present ? formatUSD(line.value) : '—'}
              </Text>
            </View>
          ))}

          <View style={styles.totalDivider} />

          <View style={styles.line}>
            <Text style={styles.totalLabel}>Estimated total</Text>
            <Text style={styles.totalValue}>{formatUSD(quote.estimatedTotal)}</Text>
          </View>
        </Card>

        <View style={styles.legend}>
          <LegendSwatch color={colors.amber} label="Estimated by Loadsy" />
          <LegendSwatch color={colors.green} label="Stated by the vendor" />
        </View>

        <Card style={styles.methodology}>
          <Text style={styles.methodologyTitle}>How we got here</Text>
          <Text style={styles.methodologyBody}>
            Base rate and any one-way fee come from {VENDOR_LABEL[quote.vendor]}&apos;s published
            rates. Mileage is {Math.round(quote.distanceMiles)} miles at their per-mile rate. Fuel
            assumes the truck&apos;s typical mileage at current pump prices, and coverage is their
            standard damage waiver.
          </Text>
          <Text style={styles.methodologyEmphasis}>
            {VENDOR_LABEL[quote.vendor]} confirms the exact price at booking. Loadsy does not add
            fees of any kind.
          </Text>
        </Card>

        <PrimaryButton
          title={`Continue on ${VENDOR_LABEL[quote.vendor]}`}
          onPress={() => { void openVendor(quote.deepLinkURL); }}
          accessibilityHint="Opens the vendor's booking page in an in-app browser"
        />

        <Text style={styles.affiliate}>
          Loadsy may earn a commission if you book through this link. It never changes the price you
          pay or how we rank the options.
        </Text>
      </ScrollView>
    </Screen>
  );
}

/**
 * This screen is itself presented as a modal, which is exactly where
 * openBrowserAsync is most likely to reject — on a double-tap, or when it cannot
 * find a view controller to present from. An unhandled rejection there is a dead
 * button with no explanation.
 */
async function openVendor(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: colors.bg,
      controlsColor: colors.accent,
    });
  } catch {
    Alert.alert("Couldn't open the vendor page", 'Check your connection and try again.');
  }
}

/**
 * `present` is not decoration. Five of the six line items are `number | null`, and
 * a null one rendered as a confirmed "$0 · INCLUDED" would be an affirmative false
 * claim about what the vendor charges — on the one screen whose whole job is trust.
 */
function LineTag({
  value,
  estimated,
  present,
}: {
  value: number;
  estimated: boolean;
  present: boolean;
}) {
  if (!present) {
    return (
      <View style={[styles.tag, styles.tagNeutral]}>
        <Text style={[styles.tagText, styles.tagTextNeutral]}>NOT QUOTED</Text>
      </View>
    );
  }
  if (!estimated && value === 0) {
    return (
      <View style={[styles.tag, styles.tagGreen]}>
        <Text style={[styles.tagText, styles.tagTextGreen]}>INCLUDED</Text>
      </View>
    );
  }
  if (!estimated) {
    return (
      <View style={[styles.tag, styles.tagGreen]}>
        <Text style={[styles.tagText, styles.tagTextGreen]}>CONFIRMED</Text>
      </View>
    );
  }
  return (
    <View style={[styles.tag, styles.tagAmber]}>
      <Text style={[styles.tagText, styles.tagTextAmber]}>ESTIMATED</Text>
    </View>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  missing: { padding: space.lg, gap: space.lg, marginTop: space.xl },
  header: { gap: 2, marginTop: space.sm },
  vendor: { ...type.title, color: colors.text },
  truck: { ...type.caption, color: colors.textMuted },
  breakdown: { gap: space.md },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  lineLabelBlock: { flex: 1, gap: space.xs, alignItems: 'flex-start' },
  lineLabel: { ...type.body, color: colors.text },
  lineValue: { ...type.bodyStrong },
  lineValueEstimated: { color: colors.amber },
  lineValueConfirmed: { color: colors.green },
  lineValueAbsent: { color: colors.textDim },
  totalDivider: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  totalLabel: { ...type.heading, color: colors.text },
  totalValue: { ...type.title, color: colors.text },
  tag: { paddingHorizontal: space.sm, paddingVertical: 1, borderRadius: radius.sm },
  tagAmber: { backgroundColor: colors.amberDim },
  tagGreen: { backgroundColor: colors.greenDim },
  tagNeutral: { backgroundColor: colors.surfaceRaised },
  tagText: { ...type.label, fontSize: 9 },
  tagTextAmber: { color: colors.amber },
  tagTextGreen: { color: colors.green },
  tagTextNeutral: { color: colors.textDim },
  legend: { flexDirection: 'row', gap: space.lg, paddingHorizontal: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...type.caption, color: colors.textMuted },
  methodology: { gap: space.sm, backgroundColor: colors.surfaceRaised },
  methodologyTitle: { ...type.heading, color: colors.text },
  methodologyBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  methodologyEmphasis: { ...type.caption, color: colors.green, lineHeight: 19, fontWeight: '600' },
  affiliate: { ...type.caption, color: colors.textDim, lineHeight: 18 },
});
