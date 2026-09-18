import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMMONLY_MISSED } from '../src/domain/coverage';

test('every area offers a reason', () => {
  for (const area of COMMONLY_MISSED) {
    assert.ok(area.label.length > 0);
    assert.ok(area.hint.length > 10, `${area.id} has no usable hint`);
  }
  assert.equal(new Set(COMMONLY_MISSED.map((a) => a.id)).size, COMMONLY_MISSED.length);
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

test('SINGLE SOURCE: the inventory checklist is rendered from this list, not written out again', () => {
  // When rooms stopped being named (18 September) the checklist was first written into
  // the screen as a sentence – a second copy of this list, free to drift from it.
  const screen = readFileSync(new URL('../app/inventory.tsx', import.meta.url), 'utf8');
  assert.match(screen, /import \{[^}]*\bCOMMONLY_MISSED\b[^}]*\} from '[./]+\/src\/domain\/coverage'/);
  assert.match(screen, /COMMONLY_MISSED\.map\(/);
  for (const area of COMMONLY_MISSED) {
    assert.ok(!screen.includes(area.hint), `${area.id}'s hint is copied into the screen`);
  }
});
