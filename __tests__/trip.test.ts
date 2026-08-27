import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrip,
  describeTrip,
  estimateTripMiles,
  isValidZip,
  LOCAL_ROUND_TRIP_MILES,
  normaliseMiles,
  tripKind,
} from '../src/domain/trip';
import { mockQuotes } from '../src/api/mocks/quotes';
import { sumLineItems, totalMatchesLineItems } from '../src/domain/quotes';
import { makeMove } from './helpers';
import type { Move } from '../src/domain/types';

const DATE = '2026-09-12T00:00:00.000Z';

function move(overrides: Partial<Move>): Move {
  return makeMove([], { originZip: '78704', destinationZip: null, tripMiles: null, ...overrides });
}

test('a move with no destination is local', () => {
  // Silence is not evidence of a long trip. Quoting a one-way drop fee on an
  // unanswered question overstates every total on the screen.
  assert.equal(tripKind('78704', null), 'local');
  assert.equal(tripKind('78704', ''), 'local');
  assert.equal(tripKind('78704', 'nonsense'), 'local');
});

test('a move that ends where it started is local', () => {
  assert.equal(tripKind('78704', '78704'), 'local');
  assert.equal(tripKind('78704', ' 78704 '), 'local');
});

test('a move to a different ZIP is one way', () => {
  assert.equal(tripKind('78704', '75201'), 'oneWay');
});

test('only five digits count as a ZIP', () => {
  assert.equal(isValidZip('78704'), true);
  assert.equal(isValidZip(' 78704 '), true);
  assert.equal(isValidZip('7870'), false);
  assert.equal(isValidZip('787045'), false);
  assert.equal(isValidZip('7870a'), false);
  assert.equal(isValidZip(null), false);
  assert.equal(isValidZip(undefined), false);
});

test('a local move is quoted as a round trip, not as zero miles', () => {
  // Zero would say the truck never moves, and would zero the mileage and fuel
  // lines on every vendor at once — making them look identically cheap.
  assert.equal(estimateTripMiles('78704', null), LOCAL_ROUND_TRIP_MILES);
  assert.equal(estimateTripMiles('78704', '78704'), LOCAL_ROUND_TRIP_MILES);
});

test('the distance estimate grows with the gap between ZIPs', () => {
  const acrossTown = estimateTripMiles('78704', '78745');
  const acrossState = estimateTripMiles('78704', '75201');
  const acrossCountry = estimateTripMiles('78704', '10001');

  assert.ok(acrossTown < acrossState, `${acrossTown} !< ${acrossState}`);
  assert.ok(acrossState < acrossCountry, `${acrossState} !< ${acrossCountry}`);
  // Sanity, not accuracy: this is a stand-in for a routing service, and the
  // only property worth pinning is that it stays in the realm of road travel.
  assert.ok(acrossCountry > 1_000 && acrossCountry < 4_000, `${acrossCountry} mi`);
});

test('the estimate is symmetric and stable', () => {
  assert.equal(estimateTripMiles('78704', '10001'), estimateTripMiles('10001', '78704'));
  assert.equal(estimateTripMiles('78704', '10001'), estimateTripMiles('78704', '10001'));
});

test('an unusable mileage becomes null rather than a bad quote', () => {
  for (const bad of [0, -5, NaN, Infinity, -Infinity, null, undefined]) {
    assert.equal(normaliseMiles(bad as number), null, `accepted ${String(bad)}`);
  }
  assert.equal(normaliseMiles(12.4), 12);
  assert.equal(normaliseMiles(1_200), 1_200);
  // A fat-fingered extra digit would otherwise produce a five-figure quote.
  assert.equal(normaliseMiles(90_000), 9_999);
});

test("the user's mileage wins over the estimate, and is marked as theirs", () => {
  const estimated = buildTrip(move({ destinationZip: '10001' }));
  assert.equal(estimated.isEstimated, true);

  const entered = buildTrip(move({ destinationZip: '10001', tripMiles: 1_750 }));
  assert.equal(entered.distanceMiles, 1_750);
  assert.equal(entered.isEstimated, false);
});

test('GUARANTEE: a local move is never charged a one-way fee', () => {
  // This shipped backwards. Every quote carried its vendor's drop fee, so a move
  // across town was priced $50-75 high — and because the fee differs by vendor,
  // it moved the ranking too. The cheapest truck for driving across town was
  // being decided partly by a fee for not driving across town.
  const local = buildTrip(move({ destinationZip: null }));
  const quotes = mockQuotes('15ft', local, DATE);

  assert.ok(quotes.length > 0);
  for (const quote of quotes) {
    assert.equal(quote.oneWayFee, 0, `${quote.vendor} charged a one-way fee on a local move`);
  }
});

test('a one-way move does carry the fee, for the vendors that charge one', () => {
  const oneWay = buildTrip(move({ destinationZip: '75201' }));
  const quotes = mockQuotes('15ft', oneWay, DATE);
  assert.ok(
    quotes.some((q) => (q.oneWayFee ?? 0) > 0),
    'no vendor charged a one-way fee on a one-way move',
  );
});

test('the same move quoted locally is cheaper than quoted one way', () => {
  const local = mockQuotes('15ft', buildTrip(move({ destinationZip: null })), DATE);
  const oneWay = mockQuotes('15ft', buildTrip(move({ destinationZip: '75201' })), DATE);

  const cheapest = (qs: typeof local) => Math.min(...qs.map((q) => q.estimatedTotal));
  assert.ok(cheapest(local) < cheapest(oneWay), 'a longer one-way trip should not be cheaper');
});

test('distance reaches the quote: doubling the miles raises every total', () => {
  // Mileage and fuel are the two lines that scale with distance, and they are
  // what separate vendors on a long move. If distance did not reach the quote,
  // every trip would be priced as if it were across town.
  const near = mockQuotes('15ft', buildTrip(move({ destinationZip: '75201', tripMiles: 100 })), DATE);
  const far = mockQuotes('15ft', buildTrip(move({ destinationZip: '75201', tripMiles: 200 })), DATE);

  for (const [i, quote] of near.entries()) {
    const other = far[i];
    assert.ok(other && other.estimatedTotal > quote.estimatedTotal, `${quote.vendor} did not move`);
  }
});

test('CONTRACT 4.2 still holds once the one-way fee is conditional', () => {
  // Dropping a line item to zero must not leave the total carrying it.
  for (const destination of [null, '75201']) {
    for (const quote of mockQuotes('20ft', buildTrip(move({ destinationZip: destination })), DATE)) {
      assert.ok(
        totalMatchesLineItems(quote),
        `${quote.vendor} (${destination ?? 'local'}): ${quote.estimatedTotal} != ${sumLineItems(quote)}`,
      );
    }
  }
});

test('the trip reads back in plain language', () => {
  assert.match(describeTrip(buildTrip(move({ destinationZip: null }))), /Local move.*round trip/);
  assert.match(
    describeTrip(buildTrip(move({ destinationZip: '75201', tripMiles: 200 }))),
    /78704 → 75201 · 200 mi one way/,
  );
});
