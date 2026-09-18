import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canLeaveInventory, inventoryBlockedReason, unresolvedDuplicates } from '../src/domain/confidence';
import { duplicateKey, suspectedDuplicates } from '../src/domain/duplicates';
import type { InventoryItem } from '../src/domain/types';
import { parseStoredState } from '../src/state/persistence';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

/*
 * One object listed in two rooms – the error the first real rooms showed most: a family
 * room's answers listed the breakfast room's hutch, console table and chalkboard, seen
 * through an opening, in nearly every one of 50 answers. These pin when the app asks
 * "which room is it in?", and above all when it does not – a question that is usually
 * wrong gets tapped through.
 */

function item(name: string, l: number, w: number, h: number, extra: Partial<InventoryItem> = {}): InventoryItem {
  return makeItem({ name, dimensions: { lengthIn: l, widthIn: w, heightIn: h, isEstimated: true }, cubicFeet: (l * w * h) / 1728, ...extra });
}

test('the breakfast room hutch and console table, listed in the family room too, are asked about', () => {
  resetIds();
  // Names and sizes as the model returned them for each room.
  const family = makeRoom([item('Leather Sectional Sofa', 96, 36, 34), item('Glass-Front Hutch Cabinet', 60, 20, 72), item('Narrow Console Table', 36, 16, 32)], { name: 'Family Room' });
  const breakfast = makeRoom([item('Hutch', 64, 20, 74), item('Wood Console Table', 38, 16, 30), item('Round Dining Table', 48, 48, 30)], { name: 'Breakfast Room' });
  const pairs = suspectedDuplicates(makeMove([family, breakfast]));

  assert.deepEqual(
    pairs.map((p) => [p.first.item.name, p.second.item.name].sort()).sort(),
    [['Glass-Front Hutch Cabinet', 'Hutch'], ['Narrow Console Table', 'Wood Console Table']],
  );
  assert.deepEqual(pairs.map((p) => [p.first.roomName, p.second.roomName].sort()), [['Breakfast Room', 'Family Room'], ['Breakfast Room', 'Family Room']]);
});

test('things a home normally has several of are never asked about', () => {
  resetIds();
  const primary = makeRoom([item('Queen Mattress', 80, 60, 12), item('Nightstand', 22, 18, 26), item('Table Lamp', 12, 12, 26), item('Dresser', 60, 20, 34), item('Medium Box', 18, 18, 16, { category: 'box' })]);
  const second = makeRoom([item('Queen Mattress', 80, 60, 12), item('Nightstand', 22, 18, 26), item('Table Lamp', 12, 12, 26), item('Dresser', 60, 20, 34), item('Medium Box', 18, 18, 16, { category: 'box' })]);
  assert.deepEqual(suspectedDuplicates(makeMove([primary, second])), []);
});

test('an object the app does not recognise, or a different size, or in the same room, is not asked about', () => {
  resetIds();
  const a = makeRoom([item('Chalkboard Sign', 24, 3, 30), item('Sofa', 84, 36, 34), item('Sofa', 84, 36, 34)]);
  const b = makeRoom([item('Framed Chalkboard', 24, 3, 30), item('Sofa', 60, 30, 30)]);
  // Two identical sofas in one room are two sofas; the other room's sofa is far smaller.
  assert.deepEqual(suspectedDuplicates(makeMove([a, b])), []);
});

test('each item is in one question at a time, closest match first', () => {
  resetIds();
  const hutch = (l: number) => item('Hutch', l, 20, 74);
  const rooms = [makeRoom([hutch(64)], { name: 'A' }), makeRoom([hutch(62)], { name: 'B' }), makeRoom([hutch(60)], { name: 'C' })];
  const pairs = suspectedDuplicates(makeMove(rooms));
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0]!.first.roomName, pairs[0]!.second.roomName].sort(), ['A', 'B']);
});

test('the gate holds until each pair is answered – by choosing a room or keeping both', () => {
  resetIds();
  const family = makeRoom([item('Hutch', 60, 20, 72)], { name: 'Family Room' });
  const breakfast = makeRoom([item('Hutch', 64, 20, 74)], { name: 'Breakfast Room' });
  const move = makeMove([family, breakfast]);

  assert.equal(canLeaveInventory(move), false);
  assert.equal(inventoryBlockedReason(move), '1 item may be listed twice');

  // "It's in the breakfast room": the family room's listing is removed.
  const chosen = { ...move, rooms: [{ ...family, items: [] }, breakfast] };
  assert.equal(canLeaveInventory(chosen), true);
  assert.equal(inventoryBlockedReason(chosen), null);

  // "I have two": both stay, and the question is not asked again.
  const [pair] = unresolvedDuplicates(move);
  const kept = { ...move, keptDuplicates: [pair!.key] };
  assert.equal(canLeaveInventory(kept), true);
  assert.equal(pair!.key, duplicateKey(breakfast.items[0]!.id, family.items[0]!.id), 'the same key whichever way round');
});

test('the blocked reason names every kind of check still open, in one place', () => {
  resetIds();
  const unsure = item('Unlabelled Thing', 40, 20, 20, { confidence: 'low', confidenceReason: 'Partly hidden' });
  const move = makeMove([makeRoom([item('Hutch', 60, 20, 72), unsure]), makeRoom([item('Hutch', 64, 20, 74)])]);
  assert.equal(inventoryBlockedReason(move), '1 item needs a quick check · 1 item may be listed twice');
  assert.equal(inventoryBlockedReason(makeMove([])), 'Add at least one item before sizing a truck');
});

test('an answer "I have two" survives a relaunch, and a move saved before the check is asked once', () => {
  resetIds();
  const move = makeMove([makeRoom([item('Hutch', 60, 20, 72)]), makeRoom([item('Hutch', 64, 20, 74)])]);
  const key = unresolvedDuplicates(move)[0]!.key;

  const saved = parseStoredState(JSON.stringify({ move: { ...move, keptDuplicates: [key, key, 7, 'no-bar'] } }))!;
  assert.deepEqual(saved.move.keptDuplicates, [key], 'duplicates and junk dropped, the answer kept');
  assert.equal(canLeaveInventory(saved.move), true);

  const { keptDuplicates: _dropped, ...older } = move;
  const old = parseStoredState(JSON.stringify({ move: older }))!;
  assert.deepEqual(old.move.keptDuplicates, []);
  assert.equal(canLeaveInventory(old.move), false);
});
