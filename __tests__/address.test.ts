import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addressForMove,
  EMPTY_ADDRESS,
  formatAddressLine,
  formatAddressShort,
  isEmptyAddress,
  isPreciseAddress,
  isUsableAddress,
  normaliseAddress,
  parseAddress,
  zipFor,
} from '../src/domain/address';
import { parseStoredState } from '../src/state/persistence';
import { buildTrip } from '../src/domain/trip';
import { buildDemoMove, DEMO_SCENARIOS } from '../src/demo/scenarios';

test('an address is usable as soon as it has a ZIP', () => {
  // Deliberate: everything Loadsy computes from a location is ZIP-level, so
  // demanding a street line would block someone who has not signed a lease yet
  // from getting a truck size, for no computational gain at all.
  assert.equal(isUsableAddress(normaliseAddress({ postalCode: '78704' })), true);
  assert.equal(isUsableAddress(normaliseAddress({ line1: '1 Main St', city: 'Austin' })), false);
  assert.equal(isUsableAddress(null), false);
});

test('a ZIP+4 from the OS geocoder is stored as five digits', () => {
  // reverseGeocodeAsync returns "94110-1234" on some devices, and the raw string
  // fails every five-digit check downstream.
  assert.equal(normaliseAddress({ postalCode: '94110-1234' }).postalCode, '94110');
  assert.equal(normaliseAddress({ postalCode: ' 94110 ' }).postalCode, '94110');
  assert.equal(normaliseAddress({ postalCode: '9411O' }).postalCode, '9411');
});

test('state is upper-cased so the two ends never differ invisibly', () => {
  assert.equal(normaliseAddress({ state: 'tx' }).state, 'TX');
  assert.equal(normaliseAddress({ state: 'Texas' }).state, 'TE');
});

test('normalising trims, and survives junk without throwing', () => {
  assert.deepEqual(normaliseAddress(null), EMPTY_ADDRESS);
  assert.deepEqual(normaliseAddress(undefined), EMPTY_ADDRESS);
  assert.equal(normaliseAddress({ line1: '  1 Main St  ' }).line1, '1 Main St');
});

test('precise means a routing service could place it', () => {
  const zipOnly = normaliseAddress({ postalCode: '78704' });
  const full = normaliseAddress({
    line1: '1100 S Congress Ave',
    city: 'Austin',
    state: 'TX',
    postalCode: '78704',
  });
  assert.equal(isPreciseAddress(zipOnly), false);
  assert.equal(isPreciseAddress(full), true);
  // Usable is the lower bar, and it is the one anything actually depends on.
  assert.equal(isUsableAddress(zipOnly), true);
});

test('formatting falls back through whatever is actually filled in', () => {
  assert.equal(formatAddressLine(EMPTY_ADDRESS), '');
  assert.equal(formatAddressLine(normaliseAddress({ postalCode: '78704' })), '78704');
  assert.equal(
    formatAddressLine(normaliseAddress({ city: 'Austin', state: 'TX', postalCode: '78704' })),
    'Austin, TX 78704',
  );
  assert.equal(
    formatAddressLine(
      normaliseAddress({ line1: '1100 S Congress Ave', city: 'Austin', state: 'TX', postalCode: '78704' }),
    ),
    '1100 S Congress Ave, Austin, TX 78704',
  );
  // Short form prefers the human landmark, falls back to the ZIP.
  assert.equal(formatAddressShort(normaliseAddress({ postalCode: '78704' })), '78704');
  assert.equal(
    formatAddressShort(normaliseAddress({ city: 'Austin', state: 'TX', postalCode: '78704' })),
    'Austin, TX',
  );
});

test('emptiness is distinguishable from a half-filled address', () => {
  assert.equal(isEmptyAddress(EMPTY_ADDRESS), true);
  assert.equal(isEmptyAddress(null), true);
  assert.equal(isEmptyAddress(normaliseAddress({ city: 'Austin' })), false);
});

test('a half-typed address survives storage; only nothing at all is null', () => {
  // Street first, ZIP last is how most people write an address, and the move is
  // saved on every keystroke. Dropping partials would mean reopening the app
  // mid-entry silently deleted the street line. Nothing downstream is at risk:
  // the ZIP is derived separately and stays empty until there is a real one.
  assert.equal(parseAddress({ line1: '1 Main St', city: 'Austin' })?.line1, '1 Main St');
  assert.equal(zipFor(parseAddress({ line1: '1 Main St', city: 'Austin' })), '');

  assert.equal(parseAddress(null), null);
  assert.equal(parseAddress('78704'), null);
  assert.equal(parseAddress([]), null);
  assert.equal(parseAddress({}), null);
  assert.equal(parseAddress({ postalCode: '78704' })?.postalCode, '78704');
  assert.equal(zipFor(parseAddress({ postalCode: '78704' })), '78704');
});

test('the derived ZIP is strict even when the address is not', () => {
  assert.equal(zipFor(normaliseAddress({ postalCode: '787' })), '');
  assert.equal(zipFor(normaliseAddress({ city: 'Austin' })), '');
  assert.equal(zipFor(null), '');
  assert.equal(zipFor(normaliseAddress({ postalCode: '78704' })), '78704');
});

test('INVARIANT: a stored ZIP can never contradict its stored address', () => {
  // The reducer derives the ZIPs from the addresses and is the only writer of
  // either — the action type does not permit setting a ZIP on its own. This
  // asserts the other half: a payload hand-edited (or written by an older build,
  // then partially updated) into disagreeing with itself resolves to the address.
  const parsed = parseStoredState(
    JSON.stringify({
      move: {
        id: 'm',
        rooms: [],
        packingBufferPct: 0.2,
        recommendedTruckSize: 'van',
        originAddress: { line1: '1 Main St', city: 'Austin', state: 'TX', postalCode: '78704' },
        destinationAddress: { city: 'Dallas', state: 'TX', postalCode: '75201' },
        originZip: '00000',
        destinationZip: '11111',
        moveDate: null,
        status: 'inventory',
      },
    }),
  );

  assert.equal(parsed?.move.originZip, '78704');
  assert.equal(parsed?.move.destinationZip, '75201');
});

test('a payload from before addresses existed still loads, keeping its ZIPs', () => {
  // Somebody's move. A new field is never worth losing one over.
  const parsed = parseStoredState(
    JSON.stringify({
      move: {
        id: 'm',
        rooms: [],
        packingBufferPct: 0.2,
        recommendedTruckSize: 'van',
        originZip: '78704',
        destinationZip: '75201',
        moveDate: null,
        status: 'inventory',
      },
    }),
  );

  assert.equal(parsed?.move.originAddress, null);
  assert.equal(parsed?.move.originZip, '78704');
  assert.equal(parsed?.move.destinationZip, '75201');
  // And it still prices, because the trip reads the ZIPs.
  assert.equal(buildTrip(parsed!.move).kind, 'oneWay');
});

test('every demo scenario carries an address whose ZIP matches its move', () => {
  for (const scenario of DEMO_SCENARIOS) {
    const move = buildDemoMove(scenario);
    assert.ok(isUsableAddress(move.originAddress), `${scenario.id} has no usable origin`);
    assert.equal(move.originAddress!.postalCode, move.originZip, `${scenario.id} origin`);
    assert.equal(
      move.destinationAddress?.postalCode ?? null,
      move.destinationZip,
      `${scenario.id} destination`,
    );
  }
});

test('a move with a ZIP and no address still fills the form', () => {
  // The regression this closes: seeding the trip form from the address alone
  // left anyone with a pre-existing move looking at an empty field and a Next
  // button that refused to move, while the app held their ZIP the whole time.
  const recovered = addressForMove(null, '78704');
  assert.equal(recovered.postalCode, '78704');
  assert.equal(isUsableAddress(recovered), true);

  // A real address always wins over the bare ZIP.
  const full = normaliseAddress({ line1: '1 Main St', postalCode: '78704' });
  assert.equal(addressForMove(full, '99999').line1, '1 Main St');

  // And nothing usable stays empty rather than becoming a broken half-address.
  assert.deepEqual(addressForMove(null, null), EMPTY_ADDRESS);
  assert.deepEqual(addressForMove(null, ''), EMPTY_ADDRESS);
  assert.deepEqual(addressForMove(null, '787'), EMPTY_ADDRESS);
});
