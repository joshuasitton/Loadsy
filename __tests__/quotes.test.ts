import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatUSD,
  formatUSDPrecise,
  hasV1DeepLink,
  isEstimatedLineItem,
  QUOTE_LINE_ITEM_KEYS,
  sortQuotes,
  sumLineItems,
  totalMatchesLineItems,
  VENDOR_SEARCH_URL,
} from '../src/domain/quotes';
import { mockQuotes } from '../src/api/mocks/quotes';
import { TRUCK_SIZES } from '../src/domain/types';
import { makeQuote, resetIds } from './helpers';

/** Reads a rendered money string back as a number, the way a user adding up a column does. */
function readMoney(rendered: string): number {
  return Number(rendered.replace(/[$,]/g, ''));
}

const SWEEP_ZIPS = ['94110', '20147', '10001', '90210', '60601'];

test('the breakdown a user can add up reconciles with the total shown above it', () => {
  // totalMatchesLineItems runs at cent precision, so it cannot see a discrepancy
  // that exists only in the rendering. This asserts the DISPLAYED numbers, which
  // is what the price-breakdown screen actually promises.
  let checked = 0;
  for (const size of TRUCK_SIZES) {
    for (const zip of SWEEP_ZIPS) {
      for (const quote of mockQuotes(size, zip, '2026-09-12T00:00:00.000Z')) {
        const shownLines = QUOTE_LINE_ITEM_KEYS.filter((key) => quote[key] != null).map((key) =>
          readMoney(formatUSDPrecise(quote[key] ?? 0)),
        );
        const shownSum = Math.round(shownLines.reduce((a, b) => a + b, 0) * 100) / 100;
        const shownTotal = readMoney(formatUSDPrecise(quote.estimatedTotal));
        assert.equal(
          shownSum,
          shownTotal,
          `${quote.id} @ ${zip}: displayed lines sum to ${shownSum}, displayed total says ${shownTotal}`,
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 100, `expected a broad sweep, only checked ${checked} quotes`);
});

test('whole-dollar formatting is why the breakdown may not use it', () => {
  // Pins the reason formatUSDPrecise exists. If this ever stops finding a
  // mismatch, formatUSD became safe for itemised surfaces and the split can go.
  const offenders = TRUCK_SIZES.flatMap((size) =>
    SWEEP_ZIPS.flatMap((zip) =>
      mockQuotes(size, zip, '2026-09-12T00:00:00.000Z').filter((quote) => {
        const lines = QUOTE_LINE_ITEM_KEYS.filter((key) => quote[key] != null).map((key) =>
          readMoney(formatUSD(quote[key] ?? 0)),
        );
        return lines.reduce((a, b) => a + b, 0) !== readMoney(formatUSD(quote.estimatedTotal));
      }),
    ),
  );
  assert.ok(offenders.length > 0, 'expected whole-dollar rounding to produce visible mismatches');
});

test('CONTRACT 4.2: estimatedTotal is reconstructable from its own line items', () => {
  resetIds();
  const quote = makeQuote();
  assert.ok(totalMatchesLineItems(quote), 'total did not equal the sum of its line items');
  assert.equal(sumLineItems(quote), quote.estimatedTotal);
});

test('CONTRACT 4.2: the invariant holds for every mock quote the app ships with', () => {
  const quotes = mockQuotes('20ft', '20147', '2026-09-01');
  assert.ok(quotes.length > 0, 'no mock quotes to assert against');
  for (const quote of quotes) {
    assert.ok(
      totalMatchesLineItems(quote),
      `${quote.vendor} ${quote.truckSize}: total ${quote.estimatedTotal} != line items ${sumLineItems(quote)}`,
    );
  }
});

test('CONTRACT 4.2: a quote whose total has been tampered with fails the invariant', () => {
  resetIds();
  const bad = makeQuote({ estimatedTotal: 1 });
  assert.equal(totalMatchesLineItems(bad), false, 'the invariant check is not actually checking');
});

test('null line items are treated as zero, not NaN', () => {
  resetIds();
  const sparse = makeQuote({
    baseRate: 100,
    estimatedMileageFee: null,
    estimatedFuelFee: null,
    estimatedInsuranceFee: null,
    oneWayFee: null,
    taxesAndFees: null,
    estimatedTotal: 100,
  });
  assert.equal(sumLineItems(sparse), 100);
  assert.ok(totalMatchesLineItems(sparse));
});

test('estimated line items are distinguishable from confirmed ones (amber vs green)', () => {
  assert.equal(isEstimatedLineItem('baseRate'), false);
  assert.equal(isEstimatedLineItem('oneWayFee'), false);
  assert.equal(isEstimatedLineItem('estimatedMileageFee'), true);
  assert.equal(isEstimatedLineItem('estimatedFuelFee'), true);
  assert.equal(isEstimatedLineItem('estimatedInsuranceFee'), true);
  assert.equal(isEstimatedLineItem('taxesAndFees'), true);
});

test('the breakdown sheet renders every line item the spec lists', () => {
  assert.deepEqual([...QUOTE_LINE_ITEM_KEYS], [
    'baseRate',
    'estimatedMileageFee',
    'estimatedFuelFee',
    'estimatedInsuranceFee',
    'oneWayFee',
    'taxesAndFees',
  ]);
});

test('cheapest sorts by total ascending', () => {
  const quotes = [
    makeQuote({ id: 'q-a', estimatedTotal: 300, baseRate: 300, estimatedMileageFee: null, estimatedFuelFee: null, estimatedInsuranceFee: null, oneWayFee: null, taxesAndFees: null }),
    makeQuote({ id: 'q-b', estimatedTotal: 100, baseRate: 100, estimatedMileageFee: null, estimatedFuelFee: null, estimatedInsuranceFee: null, oneWayFee: null, taxesAndFees: null }),
    makeQuote({ id: 'q-c', estimatedTotal: 200, baseRate: 200, estimatedMileageFee: null, estimatedFuelFee: null, estimatedInsuranceFee: null, oneWayFee: null, taxesAndFees: null }),
  ];
  assert.deepEqual(sortQuotes(quotes, 'cheapest').map((q) => q.id), ['q-b', 'q-c', 'q-a']);
});

test('earliest sorts by availability ascending', () => {
  const quotes = [
    makeQuote({ id: 'q-a', earliestAvailability: '2026-09-10T09:00:00.000Z' }),
    makeQuote({ id: 'q-b', earliestAvailability: '2026-09-01T09:00:00.000Z' }),
    makeQuote({ id: 'q-c', earliestAvailability: '2026-09-05T09:00:00.000Z' }),
  ];
  assert.deepEqual(sortQuotes(quotes, 'earliest').map((q) => q.id), ['q-b', 'q-c', 'q-a']);
});

test('best match trades price off against availability', () => {
  const quotes = [
    // cheapest, but three weeks out
    makeQuote({ id: 'q-slow', estimatedTotal: 100, baseRate: 100, estimatedMileageFee: null, estimatedFuelFee: null, estimatedInsuranceFee: null, oneWayFee: null, taxesAndFees: null, earliestAvailability: '2026-09-21T09:00:00.000Z' }),
    // slightly pricier, available tomorrow
    makeQuote({ id: 'q-fast', estimatedTotal: 115, baseRate: 115, estimatedMileageFee: null, estimatedFuelFee: null, estimatedInsuranceFee: null, oneWayFee: null, taxesAndFees: null, earliestAvailability: '2026-09-01T09:00:00.000Z' }),
  ];
  assert.equal(sortQuotes(quotes, 'bestMatch')[0]!.id, 'q-fast');
  assert.equal(sortQuotes(quotes, 'cheapest')[0]!.id, 'q-slow');
});

test('sorting never mutates the source array (filters are client-side re-sorts)', () => {
  const quotes = [
    makeQuote({ id: 'q-a', estimatedTotal: 300 }),
    makeQuote({ id: 'q-b', estimatedTotal: 100 }),
  ];
  const before = quotes.map((q) => q.id);
  sortQuotes(quotes, 'cheapest');
  assert.deepEqual(quotes.map((q) => q.id), before);
});

test('sorting is stable for identical values so the list cannot reshuffle', () => {
  const quotes = [
    makeQuote({ id: 'q-c', estimatedTotal: 100 }),
    makeQuote({ id: 'q-a', estimatedTotal: 100 }),
    makeQuote({ id: 'q-b', estimatedTotal: 100 }),
  ];
  assert.deepEqual(sortQuotes(quotes, 'cheapest').map((q) => q.id), ['q-a', 'q-b', 'q-c']);
});

test('spec 6.2 resolved: U-Haul and Penske carry v1 deep links, others do not', () => {
  assert.equal(hasV1DeepLink('uhaul'), true);
  assert.equal(hasV1DeepLink('penske'), true);
  assert.equal(hasV1DeepLink('budget'), false);
  assert.equal(hasV1DeepLink('enterprise'), false);
});

test('every vendor has a search URL so the empty state is never a dead end', () => {
  for (const [vendor, url] of Object.entries(VENDOR_SEARCH_URL)) {
    assert.ok(url.startsWith('https://'), `${vendor} search URL is not https`);
  }
});
