import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeZones, renderTruckMapSVG, truckMapAriaLabel } from '../src/truckmap/renderSvg';
import { rawVolumeCuFt } from '../src/domain/volume';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

test('zone fractions always sum to 1', () => {
  resetIds();
  const zones = computeZones([
    makeItem({ id: 'a', category: 'furniture', estimatedWeightClass: 'heavy', cubicFeet: 60 }),
    makeItem({ id: 'b', category: 'box', estimatedWeightClass: 'light', cubicFeet: 20 }),
    makeItem({ id: 'c', category: 'fragile', isFragile: true, cubicFeet: 20 }),
  ]);
  const sum = zones.reduce((acc, z) => acc + z.fraction, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `fractions summed to ${sum}`);
});

test('zone volumes account for every cubic foot of the inventory', () => {
  // Screen 6's header states the total the zone legend adds up to. If zones ever
  // dropped or double-counted an item, that header would quietly start lying —
  // and it must agree with the "Everything you listed" figure on Screen 3.
  resetIds();
  const items = [
    makeItem({ id: 'a', category: 'furniture', estimatedWeightClass: 'heavy', cubicFeet: 59.5 }),
    makeItem({ id: 'b', category: 'box', estimatedWeightClass: 'heavy', cubicFeet: 3.38 }),
    makeItem({ id: 'c', category: 'fragile', isFragile: true, cubicFeet: 10.1 }),
    makeItem({ id: 'd', category: 'furniture', estimatedWeightClass: 'medium', cubicFeet: 33.33 }),
    makeItem({ id: 'e', category: 'appliance', estimatedWeightClass: 'heavy', cubicFeet: 46.67 }),
  ];
  const zoned = computeZones(items).reduce((sum, zone) => sum + zone.cubicFeet, 0);
  assert.equal(Math.round(zoned * 100) / 100, rawVolumeCuFt(makeMove([makeRoom(items)])));
});

test('zones come back in load order with no empty zones', () => {
  resetIds();
  const zones = computeZones([
    makeItem({ id: 'a', category: 'box', estimatedWeightClass: 'light', cubicFeet: 10 }),
    makeItem({ id: 'b', category: 'appliance', estimatedWeightClass: 'heavy', cubicFeet: 40 }),
  ]);
  assert.deepEqual(zones.map((z) => z.step), [1, 5]);
  for (const zone of zones) assert.ok(zone.cubicFeet > 0);
});

test('an empty inventory renders without dividing by zero', () => {
  assert.deepEqual(computeZones([]), []);
  const svg = renderTruckMapSVG([], '15ft', 'top');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
});

test('the SVG is deterministic for the same items (Save Plan round-trip)', () => {
  resetIds();
  const items = [
    makeItem({ id: 'a', category: 'furniture', estimatedWeightClass: 'heavy', cubicFeet: 60 }),
    makeItem({ id: 'b', category: 'box', estimatedWeightClass: 'heavy', cubicFeet: 25 }),
  ];
  assert.equal(renderTruckMapSVG(items, '20ft', 'top'), renderTruckMapSVG([...items].reverse(), '20ft', 'top'));
  assert.equal(renderTruckMapSVG(items, '20ft', '3d'), renderTruckMapSVG([...items].reverse(), '20ft', '3d'));
});

test('both views render and carry an accessibility label', () => {
  resetIds();
  const items = [makeItem({ id: 'a', category: 'furniture', estimatedWeightClass: 'heavy', cubicFeet: 60 })];
  for (const view of ['top', '3d'] as const) {
    const svg = renderTruckMapSVG(items, '15ft', view);
    assert.match(svg, /role="img"/);
    assert.match(svg, /aria-label="[^"]+"/);
  }
});

test('the exported file keeps its label; the rendered one delegates it to a prop', () => {
  // SvgXml mangles aria-label into a prop no platform reads, so the on-screen
  // variant omits it and the screen supplies the name itself. A file leaving the
  // app has no component behind it, so that variant must keep the attribute — and
  // both must still describe the same diagram.
  resetIds();
  const items = [
    makeItem({ id: 'a', category: 'appliance', estimatedWeightClass: 'heavy', cubicFeet: 46.67 }),
    makeItem({ id: 'b', category: 'fragile', isFragile: true, cubicFeet: 10.1 }),
  ];
  const exported = renderTruckMapSVG(items, '15ft', 'top');
  const rendered = renderTruckMapSVG(items, '15ft', 'top', { labelled: false });

  assert.match(exported, /aria-label="[^"]+"/);
  assert.ok(!rendered.includes('aria-label'), 'rendered variant must not carry aria-label');

  // role stays on both — it is the one a11y attribute the parser leaves intact.
  assert.match(rendered, /role="img"/);

  // The attribute is the only difference: same diagram, same description.
  const label = truckMapAriaLabel(computeZones(items), '15ft');
  assert.equal(exported, rendered.replace('role="img"', `role="img" aria-label="${label}"`));
});

test('the accessible name describes the zones actually drawn', () => {
  resetIds();
  const items = [
    makeItem({ id: 'a', category: 'furniture', estimatedWeightClass: 'heavy', cubicFeet: 75 }),
    makeItem({ id: 'b', category: 'box', estimatedWeightClass: 'light', cubicFeet: 25 }),
  ];
  const label = truckMapAriaLabel(computeZones(items), '20ft');
  assert.match(label, /20ft truck/);
  assert.match(label, /Heavy 75 percent/);
  assert.match(label, /Essentials 25 percent/);
  assert.equal(truckMapAriaLabel([], 'van'), 'Empty truck diagram — no items in your inventory yet');
});
