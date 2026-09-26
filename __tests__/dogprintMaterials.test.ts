import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  layersFor,
  MATERIALS,
  MAX_COLOURS,
  menu,
  orderProblems,
  PRINTER,
  PURGE_GRAMS_PER_CHANGE,
  purgeGrams,
} from '../dogprint/materials';

/**
 * The menu must agree with the printer. Every row in `MATERIALS` was argued in
 * docs/dog-print-brief.md; these tests keep a later edit from offering a
 * material the A1 with AMS Lite cannot actually run four colours of.
 */

test('the printer is an open-frame A1 with a four-slot AMS Lite', () => {
  assert.equal(PRINTER.enclosed, false);
  assert.equal(PRINTER.amsLiteSlots, 4);
  assert.equal(MAX_COLOURS, 4);
  assert.deepEqual(PRINTER.buildVolumeMm, { x: 256, y: 256, z: 256 });
});

test('every material on the menu feeds through the AMS Lite and needs no enclosure', () => {
  for (const m of menu(true)) {
    assert.equal(m.amsLite, 'compatible', `${m.name} is on the menu but its AMS Lite status is "${m.amsLite}"`);
    assert.equal(m.needsEnclosure, false, `${m.name} needs an enclosure`);
  }
});

test('nothing unverified is on the menu, whatever nozzle is fitted', () => {
  for (const m of MATERIALS) {
    if (m.amsLite !== 'compatible') assert.equal(m.offered, 'no', `${m.name} is offered but unverified`);
  }
});

test('the standard menu runs on the nozzle the printer ships with', () => {
  for (const m of menu(false)) assert.equal(m.nozzle, PRINTER.nozzleAsShipped, m.name);
});

test('specialty rows appear only once the hardened hotend is fitted', () => {
  const stainless = menu(false).map((m) => m.id);
  const hardened = menu(true).map((m) => m.id);
  assert.ok(!stainless.includes('pla-sparkle'));
  assert.ok(hardened.includes('pla-sparkle'));
  assert.deepEqual(hardened.filter((id) => stainless.includes(id)), stainless, 'fitting the hotend removes nothing');
});

test('the menu is one material family per print – nothing offered is a support or a flexible', () => {
  for (const m of menu(true)) assert.ok(m.family === 'PLA' || m.family === 'PETG', m.name);
});

test('PLA Glow and TPU are not colour options', () => {
  const glow = MATERIALS.find((m) => m.id === 'pla-glow');
  const tpu = MATERIALS.find((m) => m.id === 'tpu-95a-hf');
  assert.equal(glow?.offered, 'no');
  assert.equal(glow?.amsLite, 'not-recommended');
  assert.equal(tpu?.offered, 'no');
});

test('material ids are unique', () => {
  const ids = MATERIALS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('an order may use every slot, and not one more', () => {
  const four = { materialId: 'pla-matte', colours: ['black', 'white', 'tan', 'red'], supportMaterial: false };
  assert.deepEqual(orderProblems(four), []);
  const five = { ...four, colours: [...four.colours, 'blue'] };
  assert.equal(orderProblems(five).length, 1);
  assert.match(orderProblems(five)[0]!, /holds 4 spools; 5 colours/);
});

test('support material spends a colour slot', () => {
  const order = { materialId: 'pla-basic', colours: ['black', 'white', 'tan', 'red'], supportMaterial: true };
  assert.match(orderProblems(order)[0]!, /leaving 3 for colours; 4 were picked/);
  assert.deepEqual(orderProblems({ ...order, colours: ['black', 'white', 'tan'] }), []);
});

test('repeated colours count once, and no colours is a problem', () => {
  assert.deepEqual(orderProblems({ materialId: 'pla-matte', colours: ['black', 'black'], supportMaterial: false }), []);
  assert.match(orderProblems({ materialId: 'pla-matte', colours: [], supportMaterial: false })[0]!, /at least one/);
});

test('an order for something off the menu says why', () => {
  const glow = orderProblems({ materialId: 'pla-glow', colours: ['green'], supportMaterial: false });
  assert.match(glow[0]!, /not on the menu: Bambu says not through the AMS Lite/);
  const sparkle = { materialId: 'pla-sparkle', colours: ['gold'], supportMaterial: false };
  assert.equal(orderProblems(sparkle, false).length, 1);
  assert.deepEqual(orderProblems(sparkle, true), []);
  assert.match(orderProblems({ materialId: 'unobtainium', colours: ['x'], supportMaterial: false })[0]!, /Unknown material/);
});

test('purge is the argument for banding colours by height', () => {
  const layers = layersFor(120);
  assert.equal(layers, 600);
  // A plinth in a second colour: one change in the whole print.
  assert.equal(purgeGrams(1, 1), PURGE_GRAMS_PER_CHANGE.default);
  // Four colours in every layer: three changes a layer, kilograms of purge for a 90 g dog.
  const worst = purgeGrams(layers, 3);
  assert.equal(worst, 600 * 3 * 6);
  assert.ok(worst > 10_000);
  assert.ok(purgeGrams(layers, 3, PURGE_GRAMS_PER_CHANGE.tuned) < worst);
  assert.equal(purgeGrams(layers, 0), 0);
  assert.throws(() => purgeGrams(-1, 1), RangeError);
});
