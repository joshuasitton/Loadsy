import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecommendation,
  recommendTruckSize,
  TRUCK_CAPACITY,
  TRUCK_ROOM_EQUIVALENCE,
  usableCapacityCuFt,
} from '../src/domain/truck';
import { TRUCK_SIZES } from '../src/domain/types';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

test('recommends the smallest truck that holds the load with its reserve intact', () => {
  // Boundaries are the USABLE capacity — published interior less the 10% reserve —
  // not the interior itself. A load that would exactly fill a truck gets the next
  // size up, on purpose.
  assert.equal(recommendTruckSize(200), 'van');
  assert.equal(recommendTruckSize(209.1), 'van');
  assert.equal(recommendTruckSize(209.2), '10ft');
  assert.equal(recommendTruckSize(341.7), '10ft');
  assert.equal(recommendTruckSize(341.8), '15ft');
  assert.equal(recommendTruckSize(649.4), '15ft');
  assert.equal(recommendTruckSize(649.5), '20ft');
  assert.equal(recommendTruckSize(863.6), '20ft');
  assert.equal(recommendTruckSize(863.7), '26ft');
});

test('GUARANTEE: the recommended truck is never smaller than the load', () => {
  // The invariant the whole reserve exists to make true. Swept at 0.5 ft³ across
  // the entire usable range: the buffered load must always fit inside the
  // recommended truck's PUBLISHED interior, with the reserve still unspent.
  for (let load = 0; load <= usableCapacityCuFt('26ft'); load += 0.5) {
    const size = recommendTruckSize(load);
    const interior = TRUCK_CAPACITY[size].max;
    assert.ok(
      load <= usableCapacityCuFt(size),
      `${load} ft³ was given a ${size} whose usable capacity is ${usableCapacityCuFt(size)}`,
    );
    assert.ok(
      load <= interior * 0.91,
      `${load} ft³ in a ${size} leaves under 9% of its ${interior} ft³ interior spare`,
    );
  }
});

test('GUARANTEE: more volume never yields a smaller truck', () => {
  // Monotonicity. Without it a rounding seam could let extra furniture select a
  // SMALLER truck, which no amount of headroom would catch.
  let previous = 0;
  for (let load = 0; load <= 1800; load += 0.25) {
    const index = TRUCK_SIZES.indexOf(recommendTruckSize(load));
    assert.ok(index >= previous, `${load} ft³ stepped down to ${TRUCK_SIZES[index]}`);
    previous = index;
  }
});

test('GUARANTEE: an unmeasurable load never selects the smallest truck', () => {
  // NaN fails every comparison, so the old loop fell through to its final return.
  // Falling through to '26ft' is safe; falling through to 'van' would not be.
  assert.equal(recommendTruckSize(NaN), '26ft');
  assert.equal(recommendTruckSize(Infinity), '26ft');
  assert.equal(recommendTruckSize(50000), '26ft');
});

test('the second-trip warning fires before a single truck stops being enough', () => {
  // 1150 raw -> 1380 buffered, inside the 26ft usable ceiling of 1429.7.
  assert.equal(buildRecommendation(moveOf(1150)).exceedsLargest, false);
  // 1250 raw -> 1500 buffered, past it. The warning fires here rather than at the
  // 1682 interior, so the user learns a second trip is coming with time to plan.
  assert.equal(buildRecommendation(moveOf(1250)).exceedsLargest, true);
});

test('anything past the largest truck still returns 26ft', () => {
  assert.equal(recommendTruckSize(5000), '26ft');
  assert.equal(buildRecommendation(moveOf(5000)).exceedsLargest, true);
});

test('capacity maxima match the vendor published interior volumes', () => {
  // Deliberately NOT the figures in the spec. The spec listed capacities larger
  // than the trucks: a 10ft truck at 550 ft³ against a real interior of 402 is a
  // claim that 137% of the box can be filled. Verified on uhaul.com/Truck-Rentals.
  assert.equal(TRUCK_CAPACITY.van.max, 246);
  assert.equal(TRUCK_CAPACITY['10ft'].max, 402);
  assert.equal(TRUCK_CAPACITY['15ft'].max, 764);
  assert.equal(TRUCK_CAPACITY['20ft'].max, 1016);
  assert.equal(TRUCK_CAPACITY['26ft'].max, 1682);
});

test('no truck is ever asked to hold more than it physically can', () => {
  // The invariant the old numbers broke. recommendTruckSize returns the smallest
  // truck whose max clears the load, so a max above the real interior silently
  // recommends a truck the load cannot fit into.
  const PUBLISHED_INTERIOR: Record<string, number> = {
    van: 246,
    '10ft': 402,
    '15ft': 764,
    '20ft': 1016,
    '26ft': 1682,
  };
  for (const size of TRUCK_SIZES) {
    assert.ok(
      TRUCK_CAPACITY[size].max <= PUBLISHED_INTERIOR[size]!,
      `${size} claims ${TRUCK_CAPACITY[size].max} ft³ of a ${PUBLISHED_INTERIOR[size]} ft³ truck`,
    );
  }
});

test('capacity ranges are contiguous with no gaps', () => {
  for (let i = 1; i < TRUCK_SIZES.length; i++) {
    const prev = TRUCK_CAPACITY[TRUCK_SIZES[i - 1]!];
    const cur = TRUCK_CAPACITY[TRUCK_SIZES[i]!];
    assert.equal(cur.min, prev.max, `gap between ${TRUCK_SIZES[i - 1]} and ${TRUCK_SIZES[i]}`);
  }
});

test('every truck size has static room-equivalence copy (spec forbids computing it)', () => {
  for (const size of TRUCK_SIZES) {
    assert.ok(TRUCK_ROOM_EQUIVALENCE[size].length > 0, `${size} missing equivalence copy`);
  }
});

test('the recommendation carries the full raw to buffered to capacity breakdown', () => {
  const rec = buildRecommendation(moveOf(700));
  assert.equal(rec.rawCuFt, 700);
  assert.equal(rec.bufferPct, 0.2);
  assert.equal(rec.adjustedCuFt, 840);
  assert.equal(rec.size, '20ft');
  assert.deepEqual(rec.capacity, { min: 764, max: 1016 });
  assert.equal(rec.headroomCuFt, 176);
  assert.equal(rec.exceedsLargest, false);
});

test('the reported buffer is the one actually applied, even out of band', () => {
  // A move can carry any number (hydrated storage, a future settings UI). The
  // breakdown must never show a percentage that its own arithmetic did not use.
  for (const pct of [0.05, 0.2, 0.9]) {
    const rec = buildRecommendation(makeMove([makeRoom([makeItem({ cubicFeet: 100 })])], { packingBufferPct: pct }));
    assert.equal(
      rec.adjustedCuFt,
      Math.round(rec.rawCuFt * (1 + rec.bufferPct) * 100) / 100,
      `buffer ${pct} does not reconcile`,
    );
  }
});

function moveOf(cuFt: number) {
  resetIds();
  return makeMove([makeRoom([makeItem({ cubicFeet: cuFt })])]);
}

/**
 * Deterministic PRNG. A seeded generator keeps this test reproducible — a flaky
 * statistical assertion is worse than none, because it trains people to re-run
 * until it passes.
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function standardNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * A volume-weighted inventory for a 1-2 bedroom move: a handful of large pieces
 * carry most of the load. That concentration is the point — errors average over
 * the EFFECTIVE item count, which is far smaller than the raw count, so a naive
 * "it averages out over 37 items" intuition badly overstates the cancellation.
 */
const REALISTIC_INVENTORY = [
  59.5, 46.67, 43.56, 43.5, 37.5, 33.33, 24.3, 23.61, 21.3, 19.5, 19.5, 16, 16.4,
  12, 11.8, 8.9, 7.5, 7.5, 7.5, 7.5, 6.7, 6, 5, 4.5, 4.5, 4.5, 3.4, 3.4, 3.4,
  3.4, 3.3, 3, 3, 2.3, 2.2, 1.5, 1.5,
];

/** One simulated move. Returns true when the chosen truck cannot take the real load. */
function underSized(rng: () => number, sLinear: number, pSubType: number, pBoxMiss: number): boolean {
  let trueRaw = 0;
  let estimatedRaw = 0;
  for (const volume of REALISTIC_INVENTORY) {
    trueRaw += volume;
    // Three linear dimensions, each with log-normal error, so log-volume carries
    // three times the variance.
    let estimate = volume * Math.exp(standardNormal(rng) * sLinear * Math.sqrt(3));
    // Sub-type confusion — loveseat vs 3-seat vs sectional is a ~2x volume swing,
    // and it is the prior table's real failure mode, not imprecision.
    if (rng() < pSubType) estimate *= rng() < 0.5 ? 0.55 : 1.8;
    // Stacked boxes read low. One-sided on purpose: you cannot see boxes that are
    // hidden behind other boxes.
    if (volume <= 4.5 && rng() < pBoxMiss) estimate *= 0.6;
    estimatedRaw += estimate;
  }
  const size = recommendTruckSize(estimatedRaw * 1.2);
  // Too small when the REAL load, with its real packing loss, exceeds the truck.
  return trueRaw * 1.2 > TRUCK_CAPACITY[size].max;
}

test('GUARANTEE: under-sizing is a 3-sigma event across the realistic error range', () => {
  // One-sided 3σ is 0.135%. This is the claim SAFETY_HEADROOM_PCT is set to meet,
  // asserted rather than asserted-in-a-comment: if the error model here worsens or
  // the reserve is trimmed, this is what fails.
  const TRIALS = 60000;
  const THREE_SIGMA = 0.00135;

  const scenarios: [string, number, number, number][] = [
    ['prior table, clean classification', 0.08, 0, 0],
    ['prior table + sub-type confusion', 0.08, 0.03, 0],
    ['prior table + sub-type + box undercount', 0.08, 0.03, 0.05],
    ['looser dimensions + classification error', 0.15, 0.05, 0.05],
  ];

  for (const [label, sLinear, pSubType, pBoxMiss] of scenarios) {
    const rng = seededRandom(0x10ad57);
    let failures = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (underSized(rng, sLinear, pSubType, pBoxMiss)) failures += 1;
    }
    const rate = failures / TRIALS;
    assert.ok(
      rate <= THREE_SIGMA,
      `${label}: under-sized ${(rate * 100).toFixed(3)}% of moves, above the ${(THREE_SIGMA * 100).toFixed(3)}% 3σ ceiling`,
    );
  }
});

test('the reserve is not so large that it stops being a recommendation', () => {
  // The other side of the trade. A reserve that always jumps a size is not safe,
  // it is useless — the user stops believing the number and rents on instinct.
  const rng = seededRandom(0xc0ffee);
  let oversizedByTwo = 0;
  const TRIALS = 20000;
  for (let i = 0; i < TRIALS; i++) {
    let trueRaw = 0;
    let estimatedRaw = 0;
    for (const volume of REALISTIC_INVENTORY) {
      trueRaw += volume;
      estimatedRaw += volume * Math.exp(standardNormal(rng) * 0.08 * Math.sqrt(3));
    }
    const chosen = TRUCK_SIZES.indexOf(recommendTruckSize(estimatedRaw * 1.2));
    // What a perfectly measured load would need, with no reserve at all.
    const ideal = TRUCK_SIZES.findIndex((size) => trueRaw * 1.2 <= TRUCK_CAPACITY[size].max);
    if (chosen - ideal >= 2) oversizedByTwo += 1;
  }
  assert.ok(
    oversizedByTwo / TRIALS < 0.01,
    `${((oversizedByTwo / TRIALS) * 100).toFixed(2)}% of moves were sized two trucks too big`,
  );
});
