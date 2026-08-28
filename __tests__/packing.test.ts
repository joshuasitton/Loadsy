import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadSteps, stepForItem } from '../src/domain/packing';
import { buildPackingPlan } from '../src/domain/packingPlan';
import { guidanceFor, loadsFirstInZone } from '../src/domain/itemGuidance';
import { buildDemoMove, DEMO_SCENARIOS } from '../src/demo/scenarios';
import { allItems } from '../src/domain/volume';
import { makeItem, resetIds } from './helpers';

/** One representative name per guidance rule, for the consistency sweep below. */
const NAMED_ITEMS = [
  'Propane Grill', 'Lawn Mower', 'Refrigerator', 'Washer', 'Dryer',
  'Queen Mattress', '3-Seat Sofa', 'Dining Table', 'Bed Frame', 'Media Console',
  'TV (55")', 'Wall Mirror', 'Upright Piano', 'Treadmill', 'Bicycle',
  'Bookshelf', 'Dresser', 'Wardrobe', 'Floor Lamp', 'Area Rug', 'Potted Plant',
];

test('weight class, not category, decides the step for a box (spec Screen 5)', () => {
  const books = makeItem({ id: 'a', category: 'box', estimatedWeightClass: 'heavy', name: 'Books' });
  const linens = makeItem({ id: 'b', category: 'box', estimatedWeightClass: 'light', name: 'Linens' });
  assert.notEqual(
    stepForItem(books),
    stepForItem(linens),
    'a heavy box of books must not share a step with a light box of linens',
  );
});

test('heavy furniture loads first, lighter furniture second', () => {
  // The fallback, for pieces with no named rule.
  assert.equal(stepForItem(makeItem({ category: 'furniture', estimatedWeightClass: 'heavy' })), 1);
  assert.equal(stepForItem(makeItem({ category: 'furniture', estimatedWeightClass: 'medium' })), 2);
  assert.equal(stepForItem(makeItem({ category: 'furniture', estimatedWeightClass: 'light' })), 2);
});

test('appliances go in the heavy step', () => {
  assert.equal(stepForItem(makeItem({ category: 'appliance', estimatedWeightClass: 'heavy' })), 1);
});

test('fragile overrides weight so nothing gets buried', () => {
  const heavyMirror = makeItem({
    category: 'furniture',
    estimatedWeightClass: 'heavy',
    isFragile: true,
  });
  assert.equal(stepForItem(heavyMirror), 4);
  assert.equal(stepForItem(makeItem({ category: 'fragile', estimatedWeightClass: 'light' })), 4);
});

test('other items fall back to pure weight class', () => {
  assert.equal(stepForItem(makeItem({ category: 'other', estimatedWeightClass: 'heavy' })), 1);
  assert.equal(stepForItem(makeItem({ category: 'other', estimatedWeightClass: 'medium' })), 3);
  assert.equal(stepForItem(makeItem({ category: 'other', estimatedWeightClass: 'light' })), 5);
});

test('CONTRACT 4.3: load steps are deterministic regardless of input order', () => {
  resetIds();
  const items = [
    makeItem({ id: 'i1', category: 'furniture', estimatedWeightClass: 'heavy' }),
    makeItem({ id: 'i2', category: 'box', estimatedWeightClass: 'light' }),
    makeItem({ id: 'i3', category: 'fragile', isFragile: true }),
    makeItem({ id: 'i4', category: 'appliance', estimatedWeightClass: 'heavy' }),
    makeItem({ id: 'i5', category: 'box', estimatedWeightClass: 'heavy' }),
  ];
  const forward = buildLoadSteps(items);
  const reversed = buildLoadSteps([...items].reverse());
  const shuffled = buildLoadSteps([items[2]!, items[0]!, items[4]!, items[1]!, items[3]!]);

  assert.deepEqual(forward, reversed, 'reversing the input changed the plan');
  assert.deepEqual(forward, shuffled, 'shuffling the input changed the plan');
});

test('CONTRACT 4.3: the same item set round-trips through JSON identically (Save Plan)', () => {
  resetIds();
  const items = [
    makeItem({ id: 'z', category: 'box', estimatedWeightClass: 'heavy' }),
    makeItem({ id: 'a', category: 'furniture', estimatedWeightClass: 'light' }),
  ];
  const first = buildLoadSteps(items);
  const roundTripped = buildLoadSteps(JSON.parse(JSON.stringify(items)));
  assert.deepEqual(first, roundTripped);
});

test('steps come back ordered 1..5 with no empty steps', () => {
  resetIds();
  const steps = buildLoadSteps([
    makeItem({ id: 'i1', category: 'furniture', estimatedWeightClass: 'heavy' }),
    makeItem({ id: 'i2', category: 'box', estimatedWeightClass: 'light' }),
  ]);
  assert.deepEqual(steps.map((s) => s.order), [1, 5]);
  for (const step of steps) {
    assert.ok(step.itemIds.length > 0, `step ${step.order} is empty and should be omitted`);
    assert.ok(step.title.length > 0);
    assert.ok(step.instruction.length > 0);
  }
});

test('an empty inventory produces no steps rather than five empty ones', () => {
  assert.deepEqual(buildLoadSteps([]), []);
});

test('every item lands in exactly one step', () => {
  resetIds();
  const items = Array.from({ length: 12 }, (_, i) =>
    makeItem({
      id: `item-${i}`,
      category: (['furniture', 'box', 'appliance', 'fragile', 'other'] as const)[i % 5],
      estimatedWeightClass: (['light', 'medium', 'heavy'] as const)[i % 3],
    }),
  );
  const assigned = buildLoadSteps(items).flatMap((s) => s.itemIds);
  assert.equal(assigned.length, items.length);
  assert.equal(new Set(assigned).size, items.length);
});

test('an item edited out of the fragile category stops being loaded as fragile', () => {
  // stepForItem is `isFragile || category === 'fragile'` — deliberately not
  // symmetric, so a heavy mirror stays protected. That asymmetry means a stale
  // isFragile survives a category change and silently misplaces the item.
  resetIds();
  const wasFragile = makeItem({
    id: 'mirror',
    // Deliberately unnamed: a real "Mirror" is placed by its own rule and the
    // flag never comes into it, which is the point of the rules. This is the
    // fallback path, where the flag is all there is to go on.
    category: 'box',
    isFragile: true, // stale flag left behind by an edit
    estimatedWeightClass: 'heavy',
  });
  assert.equal(stepForItem(wasFragile), 4, 'a stale flag still forces the fragile step');

  const corrected = { ...wasFragile, isFragile: false };
  assert.equal(stepForItem(corrected), 3, 'once corrected it loads with the boxes');
});

test('turning an item INTO a fragile category protects it even without the flag', () => {
  resetIds();
  const nowFragile = makeItem({
    id: 'shelf',
    category: 'fragile',
    isFragile: false,
    estimatedWeightClass: 'heavy',
  });
  assert.equal(stepForItem(nowFragile), 4, 'category alone must be enough to protect it');
});

test('the plan is a function of the inventory, so it cannot describe a different one', () => {
  // This is what deleting /v1/packing-plan bought. A fetched plan was a COPY of a
  // past inventory, and keeping the copy in step with the real one needed a
  // freshness check, a convergence guard and a retry path — all of which had bugs.
  // A derived plan has no copy to fall out of step.
  resetIds();
  const before = [
    makeItem({ id: 'sofa', category: 'furniture', estimatedWeightClass: 'heavy', cubicFeet: 59.5 }),
    makeItem({ id: 'chair', category: 'furniture', estimatedWeightClass: 'light', cubicFeet: 7.5 }),
  ];
  // The exact edit that used to defeat the count-based freshness check: swap one
  // item for another, leaving the count identical.
  const after = [
    before[0]!,
    makeItem({ id: 'piano', category: 'furniture', estimatedWeightClass: 'heavy', cubicFeet: 60 }),
  ];

  const planBefore = buildPackingPlan('m1', before, '15ft');
  const planAfter = buildPackingPlan('m1', after, '15ft');
  assert.ok(planBefore && planAfter);

  const covered = (plan: NonNullable<typeof planBefore>) =>
    plan.loadSteps.flatMap((step) => step.itemIds).sort();
  assert.deepEqual(covered(planAfter), ['piano', 'sofa']);
  assert.ok(!covered(planAfter).includes('chair'), 'the removed item must not survive');
});

test('an empty inventory has no plan rather than an empty one', () => {
  // Null, not a plan with zero steps: the dashboard reads a null plan as "not yet"
  // and a present one as "ready", and "0 load steps ready" is neither.
  assert.equal(buildPackingPlan('m1', [], '15ft'), null);
});

test('a derived plan always covers exactly the inventory it was built from', () => {
  resetIds();
  const items = [
    makeItem({ id: 'a', category: 'appliance', estimatedWeightClass: 'heavy' }),
    makeItem({ id: 'b', category: 'box', estimatedWeightClass: 'light' }),
    makeItem({ id: 'c', category: 'fragile', isFragile: true }),
    makeItem({ id: 'd', category: 'other', estimatedWeightClass: 'medium' }),
  ];
  const plan = buildPackingPlan('m1', items, '20ft');
  assert.ok(plan);
  const covered = plan.loadSteps.flatMap((step) => step.itemIds).sort();
  assert.deepEqual(covered, ['a', 'b', 'c', 'd']);
  assert.ok(plan.truckMapSVG && plan.truckMapSVG.startsWith('<svg'));
});

/**
 * The plan is an order of operations. People load in the order it is printed, so
 * anything that reorders it for tidiness is telling somebody to carry the wrong
 * thing next — and anything that places a piece somewhere its own instructions
 * contradict is worse than saying nothing.
 */

test('an area rug loads against the back wall, where its own guidance says', () => {
  // The bug this closes, reported from a real 1-bedroom plan. The rug's guidance
  // read "at the very back, under everything else" while placement was decided
  // separately by weight — 'other' + medium landed it in group 4 of 5, three
  // quarters of the way to the door. Anyone following the plan as printed put
  // the rug on top of their furniture.
  const rug = makeItem({
    name: 'Area Rug',
    category: 'other',
    estimatedWeightClass: 'medium',
    cubicFeet: 8,
  });
  assert.equal(stepForItem(rug), 1);

  const guidance = guidanceFor(rug);
  assert.ok(guidance, 'the rug should still carry its own guidance');
  assert.match(guidance.orientation, /back/i);
});

test('INVARIANT: no guidance rule places an item where its own words deny', () => {
  // The structural fix, asserted rather than trusted. A rule that says "behind
  // the cab" and assigns zone 4 is the class of bug the rug was, and it can be
  // caught by reading the sentence the rule itself writes.
  const BACK = /behind the cab|at the very back|under everything/i;
  const DOOR = /near the door|by the door|come off first/i;

  const failures: string[] = [];
  for (const name of NAMED_ITEMS) {
    const zone = stepForItem(makeItem({ name, category: 'other' }));
    const guidance = guidanceFor(makeItem({ name, category: 'other' }));
    if (!guidance) continue;

    if (BACK.test(guidance.orientation) && zone !== 1) {
      failures.push(`${name}: says back wall, placed in zone ${zone}`);
    }
    if (DOOR.test(guidance.orientation) && zone !== 5) {
      failures.push(`${name}: says by the door, placed in zone ${zone}`);
    }
  }
  assert.deepEqual(failures, [], `guidance contradicts placement:\n  ${failures.join('\n  ')}`);
});

test('a named rule outranks the category-and-weight fallback', () => {
  // A rug is not heavy, is not furniture and is not a box. It goes at the back
  // because that is where a rug goes, and no combination of category and weight
  // could have expressed that.
  const asBox = makeItem({ name: 'Area Rug', category: 'box', estimatedWeightClass: 'light' });
  assert.equal(stepForItem(asBox), 1, 'the rule should win over the box heuristic');

  const anonymous = makeItem({ category: 'box', estimatedWeightClass: 'light' });
  assert.equal(stepForItem(anonymous), 5, 'an unnamed light box still follows the fallback');
});

test('within a zone, the biggest pieces are listed first', () => {
  // Same reasoning as the zones. The large pieces go against the wall before the
  // small ones fill in around them, and the list is read top to bottom. Sorting
  // by id, as this did, printed them in whatever order the detector emitted.
  resetIds();
  const steps = buildLoadSteps([
    makeItem({ id: 'zzz-small', category: 'other', estimatedWeightClass: 'heavy', cubicFeet: 5 }),
    makeItem({ id: 'aaa-big', category: 'other', estimatedWeightClass: 'heavy', cubicFeet: 50 }),
    makeItem({ id: 'mmm-mid', category: 'other', estimatedWeightClass: 'heavy', cubicFeet: 20 }),
  ]);
  assert.deepEqual(steps[0]?.itemIds, ['aaa-big', 'mmm-mid', 'zzz-small']);
});

test('equal-sized items still sort stably, so the plan stays deterministic', () => {
  resetIds();
  const items = [
    makeItem({ id: 'b', category: 'other', estimatedWeightClass: 'heavy', cubicFeet: 10 }),
    makeItem({ id: 'a', category: 'other', estimatedWeightClass: 'heavy', cubicFeet: 10 }),
  ];
  assert.deepEqual(buildLoadSteps(items)[0]?.itemIds, ['a', 'b']);
  assert.deepEqual(buildLoadSteps([...items].reverse())[0]?.itemIds, ['a', 'b']);
});

test('the 1-bedroom demo lists nothing after the rug that belongs beneath it', () => {
  // End to end, on the inventory the report came from.
  const scenario = DEMO_SCENARIOS.find((s) => s.id === 'one-bed')!;
  const move = buildDemoMove(scenario);
  const items = allItems(move);
  const steps = buildLoadSteps(items);
  const byId = new Map(items.map((i) => [i.id, i]));

  const rugStep = steps.find((s) => s.itemIds.some((id) => byId.get(id)?.name === 'Area Rug'));
  assert.ok(rugStep, 'the rug should be in the plan');
  assert.equal(rugStep.order, 1, 'the rug should be in the first group loaded');

  // And the groups themselves are printed back-to-front, which is the order
  // somebody will physically carry things in.
  assert.deepEqual(
    steps.map((s) => s.order),
    [...steps.map((s) => s.order)].sort((a, b) => a - b),
  );
});

test('anything that goes under the load is listed before what goes on top of it', () => {
  // Zone alone was not enough. It put the rug in the first group, correctly, and
  // then the group's biggest-first ordering printed it after the fridge and the
  // bookshelf — after the very things it is supposed to be underneath.
  resetIds();
  const steps = buildLoadSteps([
    makeItem({ id: 'fridge', name: 'Refrigerator', cubicFeet: 46.7 }),
    makeItem({ id: 'rug', name: 'Area Rug', category: 'other', cubicFeet: 8 }),
    makeItem({ id: 'shelf', name: 'Bookshelf', cubicFeet: 16 }),
  ]);
  assert.deepEqual(steps[0]?.itemIds, ['rug', 'fridge', 'shelf']);
});

test('INVARIANT: a rule saying "under everything" is loaded first in its zone', () => {
  const failures = NAMED_ITEMS.filter((name) => {
    const guidance = guidanceFor(makeItem({ name, category: 'other' }));
    return guidance !== null && /under everything/i.test(guidance.orientation) && !loadsFirstInZone(name);
  });
  assert.deepEqual(failures, [], `these say "under everything" but are not loaded first: ${failures}`);
});
