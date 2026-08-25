import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guidanceFor, guidanceRuleFor, LARGE_ITEM_CUBIC_FEET } from '../src/domain/itemGuidance';
import { makeItem, resetIds } from './helpers';

test('the hazards are called out, at any size', () => {
  // These are the entries that justify the feature. A propane cylinder in a sealed
  // truck is a real hazard and forbidden by most rental agreements; petrol fumes
  // likewise. Both items are small enough to fall under the size threshold, so a
  // volume-only rule would have silently skipped exactly the two that matter most.
  resetIds();
  const grill = guidanceFor(makeItem({ name: 'Gas Grill', cubicFeet: 5, category: 'other' }));
  assert.match(grill?.prep ?? '', /propane/i);
  assert.match(grill?.caution ?? '', /enclosed truck|forbid/i);

  const mower = guidanceFor(makeItem({ name: 'Push Lawn Mower', cubicFeet: 6, category: 'other' }));
  assert.match(mower?.prep ?? '', /fuel|drain/i);
  assert.match(mower?.caution ?? '', /fire|fumes/i);
});

test('appliances that must stay upright say why', () => {
  resetIds();
  const fridge = guidanceFor(makeItem({ name: 'Refrigerator', cubicFeet: 46.67 }));
  assert.match(fridge?.orientation ?? '', /upright/i);
  assert.match(fridge?.orientation ?? '', /never on its back|never on its side/i);
  assert.match(fridge?.caution ?? '', /compressor oil/i);

  const washer = guidanceFor(makeItem({ name: 'Washing Machine', cubicFeet: 20 }));
  assert.match(washer?.prep ?? '', /transit bolt/i);
  assert.match(washer?.caution ?? '', /drum|bearing/i);
});

test('a named rule wins over the generic size rule', () => {
  resetIds();
  // A sofa is large enough to earn generic guidance, but the specific advice —
  // stand it on end to reclaim floor — is the whole point.
  const sofa = guidanceFor(makeItem({ name: '3-Seat Sofa', cubicFeet: 59.5 }));
  assert.match(sofa?.orientation ?? '', /on end/i);
  assert.match(sofa?.prep ?? '', /cushion/i);
});

test('small unremarkable items get no guidance at all', () => {
  // Annotating every item is the same as annotating none: people stop reading, and
  // then "drain the fuel" gets skipped too.
  resetIds();
  assert.equal(guidanceFor(makeItem({ name: 'Dining Chair', cubicFeet: 7.5, isFragile: false })), null);
  assert.equal(guidanceFor(makeItem({ name: 'Storage Tote', cubicFeet: 4, isFragile: false })), null);
});

test('anything fragile is annotated regardless of size', () => {
  resetIds();
  const small = guidanceFor(makeItem({ name: 'Vase', cubicFeet: 1, isFragile: true, category: 'fragile' }));
  assert.ok(small, 'a fragile item should always carry guidance');
  assert.match(small.orientation, /nothing stacked|wedged/i);
});

test('large items get guidance even with no rule, and heavy ones differ from light', () => {
  resetIds();
  const heavy = guidanceFor(
    makeItem({ name: 'Antique Butter Churn', cubicFeet: 30, estimatedWeightClass: 'heavy' }),
  );
  const light = guidanceFor(
    makeItem({ name: 'Antique Butter Churn', cubicFeet: 30, estimatedWeightClass: 'light' }),
  );
  assert.match(heavy?.orientation ?? '', /low|axle/i);
  assert.notEqual(heavy?.orientation, light?.orientation);

  // And the threshold is a real boundary, not decoration.
  assert.equal(
    guidanceFor(makeItem({ name: 'Nondescript Thing', cubicFeet: LARGE_ITEM_CUBIC_FEET - 0.1 })),
    null,
  );
  assert.ok(guidanceFor(makeItem({ name: 'Nondescript Thing', cubicFeet: LARGE_ITEM_CUBIC_FEET })));
});

test('a caution is only ever a real consequence', () => {
  // The amber caution line has to stay scarce to keep meaning anything. Every one
  // must describe damage or danger, not encouragement.
  const named = [
    'Gas Grill', 'Push Lawn Mower', 'Refrigerator', 'Washing Machine', 'Queen Mattress',
    'Dining Table', 'TV (55")', 'Wall Mirror', 'Piano', 'Bicycle', 'Potted Plant',
  ];
  for (const name of named) {
    const guidance = guidanceRuleFor(name);
    if (guidance?.caution) {
      assert.match(
        guidance.caution,
        /crack|break|damage|wreck|ruin|risk|injure|forbid|oil|bearing|missing|survive|press/i,
        `"${name}" caution reads as advice, not consequence: ${guidance.caution}`,
      );
    }
  }
});

test('every mock item that gets guidance gets usable guidance', () => {
  // Guards against a rule matching but returning empty strings.
  const names = ['3-Seat Sofa', 'Refrigerator', 'Queen Mattress', 'Bookshelf', 'Dresser', 'TV (55")'];
  for (const name of names) {
    const guidance = guidanceFor(makeItem({ name, cubicFeet: 40 }));
    assert.ok(guidance, `${name} should have guidance`);
    assert.ok(guidance.orientation.length > 20, `${name} orientation is too terse`);
    assert.ok(!/undefined|null|\{|\}/.test(guidance.orientation), `${name} leaks internals`);
  }
});
