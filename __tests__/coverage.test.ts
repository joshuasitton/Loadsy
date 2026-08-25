import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMONLY_MISSED, shouldPromptCoverage, uncoveredAreas } from '../src/domain/coverage';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

const roomsNamed = (...names: string[]) =>
  makeMove(names.map((name, i) => makeRoom([makeItem({ id: `i${i}` })], { id: `r${i}`, name })));

test('nothing is prompted before there is an inventory to be incomplete', () => {
  resetIds();
  // The empty state already tells them what to do; asking about the attic first
  // is noise, and noise here costs the prompts that actually matter.
  assert.equal(shouldPromptCoverage(makeMove([])), false);
});

test('a room already captured is never asked for again', () => {
  resetIds();
  const move = roomsNamed('Living Room', 'Garage', 'Basement');
  const ids = uncoveredAreas(move).map((a) => a.id);
  assert.ok(!ids.includes('garage'));
  assert.ok(!ids.includes('basement'));
  assert.ok(ids.includes('attic'), 'an area they have not captured should still be offered');
});

test('the way a person actually names a room still counts as covered', () => {
  // A repeated prompt for a room they already did erodes trust in the whole list.
  resetIds();
  for (const typed of ['Garage', 'garage', '  GARAGE  ', 'Front Garage', 'Garage / Workshop', 'carport']) {
    const ids = uncoveredAreas(roomsNamed('Living Room', typed)).map((a) => a.id);
    assert.ok(!ids.includes('garage'), `"${typed}" should count as the garage`);
  }
});

test('every area is reachable and offers a reason', () => {
  resetIds();
  const move = roomsNamed('Living Room');
  const offered = uncoveredAreas(move);
  assert.equal(offered.length, COMMONLY_MISSED.length, 'one bedroom should surface every area');
  for (const area of offered) {
    assert.ok(area.label.length > 0);
    assert.ok(area.hint.length > 10, `${area.id} has no usable hint`);
    // The label is what gets added as a room name, so it must round-trip.
    assert.ok(area.match.test(area.label.toLowerCase()), `${area.id} would re-prompt after being added`);
  }
});

test('the prompt goes away once everything is accounted for', () => {
  resetIds();
  const move = roomsNamed('Living Room', ...COMMONLY_MISSED.map((a) => a.label));
  assert.deepEqual(uncoveredAreas(move), []);
  assert.equal(shouldPromptCoverage(move), false);
});

test('areas are ordered by how much volume is at stake', () => {
  // A missed garage can be a truck size on its own; a missed coat closet is not.
  // If the list is ever reordered alphabetically this fails, which is the point.
  const ids = COMMONLY_MISSED.map((a) => a.id);
  assert.equal(ids[0], 'garage');
  assert.ok(ids.indexOf('garage') < ids.indexOf('closets'));
  assert.ok(ids.indexOf('basement') < ids.indexOf('outdoor'));
});

test('the areas are storage and edge spaces, not rooms nobody forgets', () => {
  // Prompting for the room with the sofa in it would be pure noise.
  const ids = COMMONLY_MISSED.map((a) => a.id);
  for (const obvious of ['living', 'bedroom', 'kitchen', 'bathroom']) {
    assert.ok(!ids.includes(obvious), `${obvious} is not commonly missed`);
  }
});
