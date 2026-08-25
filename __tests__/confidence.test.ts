import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canLeaveInventory,
  confidenceBannerCopy,
  isUnresolved,
  markConfirmed,
  unresolvedCount,
} from '../src/domain/confidence';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

test('a low-confidence AI item is unresolved until the user touches it', () => {
  const item = makeItem({ confidence: 'low', confidenceReason: 'Partly hidden in photo' });
  assert.equal(isUnresolved(item), true);
  assert.equal(isUnresolved(markConfirmed(item)), false);
});

test('a high-confidence item is never unresolved', () => {
  assert.equal(isUnresolved(makeItem({ confidence: 'high' })), false);
});

test('spec 6.3 resolved: manually added items skip the confidence system entirely', () => {
  const manual = makeItem({ confidence: null, sourcePhotoId: null, userEdited: true });
  assert.equal(isUnresolved(manual), false);

  resetIds();
  const move = makeMove([makeRoom([manual])]);
  assert.equal(unresolvedCount(move), 0);
  assert.equal(canLeaveInventory(move), true, 'a manual-only inventory must not be gated');
});

test('HARD REQUIREMENT: the primary CTA is blocked while any item is unresolved', () => {
  resetIds();
  const move = makeMove([
    makeRoom([
      makeItem({ id: 'ok', confidence: 'high' }),
      makeItem({ id: 'bad', confidence: 'low', confidenceReason: 'Partly hidden in photo' }),
    ]),
  ]);
  assert.equal(unresolvedCount(move), 1);
  assert.equal(canLeaveInventory(move), false);
});

test('resolving the last low-confidence item unblocks the CTA', () => {
  resetIds();
  const flagged = makeItem({ id: 'bad', confidence: 'low', confidenceReason: 'Partly hidden' });
  const blocked = makeMove([makeRoom([flagged])]);
  assert.equal(canLeaveInventory(blocked), false);

  const unblocked = makeMove([makeRoom([markConfirmed(flagged)])]);
  assert.equal(canLeaveInventory(unblocked), true);
});

test('unresolved items are counted across every room, not just the first', () => {
  resetIds();
  const move = makeMove([
    makeRoom([makeItem({ id: 'a', confidence: 'low', confidenceReason: 'Dark corner' })]),
    makeRoom([
      makeItem({ id: 'b', confidence: 'low', confidenceReason: 'Partly hidden' }),
      makeItem({ id: 'c', confidence: 'high' }),
    ]),
  ]);
  assert.equal(unresolvedCount(move), 2);
});

test('an empty inventory cannot advance either', () => {
  resetIds();
  assert.equal(canLeaveInventory(makeMove([])), false);
  assert.equal(canLeaveInventory(makeMove([makeRoom([])])), false);
});

test('banner copy is singular for one item and plural beyond', () => {
  assert.equal(confidenceBannerCopy(0), '');
  assert.equal(confidenceBannerCopy(1), '1 item needs a quick check');
  assert.equal(confidenceBannerCopy(3), '3 items need a quick check');
});
