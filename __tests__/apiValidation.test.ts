import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Exercises the LIVE (USE_MOCKS=false) request paths, which had never been run.
 *
 * USE_MOCKS is read once at module load, so the env var is set and the modules are
 * imported dynamically inside each test. `fetch` is stubbed to return the exact
 * malformed bodies the audit found reaching the UI.
 */

// react-native injects this global; the modules under test read it for dev logging.
(globalThis as Record<string, unknown>).__DEV__ = false;
process.env.EXPO_PUBLIC_USE_MOCKS = 'false';

function respondWith(body: unknown, ok = true, status = 200) {
  (globalThis as Record<string, unknown>).fetch = () =>
    Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

const REQUEST = {
  photoId: 'photo-1',
  roomId: 'room-1',
  roomName: 'Living Room',
  imageData: 'BASE64',
};

test('a detected item with no cubicFeet cannot reach the truck recommendation', async () => {
  // It used to: cubicFeet undefined -> the volume sums go NaN -> every
  // `NaN <= capacity.max` is false -> recommendTruckSize falls through and
  // returns '26ft'. The user was told to rent the largest truck for one sofa.
  const { detectItems } = await import('../src/api/detect');
  const { buildRecommendation } = await import('../src/domain/truck');

  respondWith({
    items: [
      { name: 'Sofa', category: 'furniture', confidence: 'high' }, // no dimensions
      {
        name: 'Chair',
        category: 'furniture',
        confidence: 'high',
        dimensions: { lengthIn: 24, widthIn: 24, heightIn: 36 },
      },
    ],
  });

  const items = await detectItems(REQUEST);
  assert.equal(items.length, 1, 'the unmeasurable item should have been dropped');
  assert.equal(items[0]?.name, 'Chair');
  assert.ok(items.every((item) => Number.isFinite(item.cubicFeet) && item.cubicFeet > 0));

  const move = {
    id: 'm',
    rooms: [{ id: 'room-1', name: 'Living Room', photoIds: [], items }],
    packingBufferPct: 0.2,
    recommendedTruckSize: 'van' as const,
    originZip: '94110',
    destinationZip: null,
    moveDate: null,
    status: 'inventory' as const,
  };
  const rec = buildRecommendation(move);
  assert.ok(Number.isFinite(rec.adjustedCuFt), `adjustedCuFt was ${rec.adjustedCuFt}`);
  assert.notEqual(rec.size, '26ft');
});

test('an unrecognised confidence value cannot slip past the Screen 2 gate', async () => {
  // 'medium' made isUnresolved() false for every item, so canLeaveInventory
  // returned true and a whole unreviewed inventory passed a hard spec gate.
  const { detectItems } = await import('../src/api/detect');
  respondWith({
    items: [
      {
        name: 'Bookshelf',
        category: 'furniture',
        confidence: 'medium',
        dimensions: { lengthIn: 32, widthIn: 12, heightIn: 72 },
      },
    ],
  });
  assert.deepEqual(await detectItems(REQUEST), []);
});

test('a low-confidence item always arrives with a reason (contract 4.1)', async () => {
  const { detectItems } = await import('../src/api/detect');
  respondWith({
    items: [
      {
        name: 'Nightstand',
        category: 'furniture',
        confidence: 'low',
        dimensions: { lengthIn: 22, widthIn: 18, heightIn: 26 },
      },
    ],
  });
  const [item] = await detectItems(REQUEST);
  assert.equal(item?.confidence, 'low');
  assert.ok(item?.confidenceReason && item.confidenceReason.length > 0);
});

test('a response with no item list fails loudly instead of emptying the inventory', async () => {
  const { detectItems } = await import('../src/api/detect');
  respondWith({ error: 'rate limited' });
  await assert.rejects(() => detectItems(REQUEST), /no item list/);
});

test('quotes with NaN distance or an unreadable date never reach the price list', async () => {
  // These passed the §4.2 money filter and rendered "NaN mi" and
  // "Available Invalid Date" to the user as statements of fact.
  const { fetchQuotes } = await import('../src/api/rentals');
  const good = {
    id: 'uhaul-15ft',
    vendor: 'uhaul',
    truckSize: '15ft',
    baseRate: 29.95,
    estimatedMileageFee: 66.33,
    estimatedFuelFee: 24.46,
    estimatedInsuranceFee: 28,
    oneWayFee: null,
    taxesAndFees: 7.46,
    estimatedTotal: 156.2,
    distanceMiles: 67,
    earliestAvailability: '2026-09-12T00:00:00.000Z',
    deepLinkURL: 'https://www.uhaul.com/',
    lastUpdated: '2026-08-25T00:00:00.000Z',
    isEstimate: true,
  };

  respondWith({
    quotes: [
      good,
      { ...good, id: 'penske-15ft', vendor: 'penske', distanceMiles: undefined },
      { ...good, id: 'budget-15ft', vendor: 'budget', earliestAvailability: 'next week' },
      { ...good, id: 'ghost-15ft', vendor: 'not-a-vendor' },
    ],
  });

  const quotes = await fetchQuotes('15ft', '20147', '2026-09-12T00:00:00.000Z');
  assert.deepEqual(quotes.map((q) => q.id), ['uhaul-15ft']);
  for (const quote of quotes) {
    assert.ok(Number.isFinite(quote.distanceMiles));
    assert.ok(Number.isFinite(Date.parse(quote.earliestAvailability)));
  }
});

test('a 200 response that is not a quote list throws rather than reading as no coverage', async () => {
  // {"error":"..."} made .quotes undefined; .filter threw, the screen caught it
  // and told the user there were no rates for their ZIP.
  const { fetchQuotes } = await import('../src/api/rentals');
  respondWith({ error: 'rate limited' });
  await assert.rejects(
    () => fetchQuotes('15ft', '20147', '2026-09-12T00:00:00.000Z'),
    /no quote list/,
  );
});
