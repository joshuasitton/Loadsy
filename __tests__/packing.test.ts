import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadSteps, stepForItem } from '../src/domain/packing';
import { buildPackingPlan } from '../src/domain/packingPlan';
import { makeItem, resetIds } from './helpers';

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
    name: 'Mirror',
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
