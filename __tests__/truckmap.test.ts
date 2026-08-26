import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeZones,
  renderTruckMapSVG,
  renderZoneSVG,
  truckMapAriaLabel,
  zoneAriaLabel,
} from '../src/truckmap/renderSvg';
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

test('each load step gets its own diagram with exactly one zone filled', () => {
  // The whole point of a per-step diagram: one zone answers "where does THIS go",
  // the rest stay visible because position means nothing without its neighbours.
  resetIds();
  const items = [
    makeItem({ id: 'a', category: 'appliance', estimatedWeightClass: 'heavy', cubicFeet: 46 }),
    makeItem({ id: 'b', category: 'furniture', estimatedWeightClass: 'medium', cubicFeet: 33 }),
    makeItem({ id: 'c', category: 'box', estimatedWeightClass: 'heavy', cubicFeet: 12 }),
    makeItem({ id: 'd', category: 'fragile', isFragile: true, cubicFeet: 4 }),
    makeItem({ id: 'e', category: 'box', estimatedWeightClass: 'light', cubicFeet: 2 }),
  ];
  const steps = computeZones(items).map((z) => z.step);
  assert.ok(steps.length >= 4, 'fixture should span most of the load order');

  for (const step of steps) {
    const svg = renderZoneSVG(items, '15ft', step);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    // Exactly one zone at full opacity; every other zone dimmed.
    const filled = (svg.match(/opacity="0\.92"/g) ?? []).length;
    assert.equal(filled, 1, `step ${step} filled ${filled} zones`);
    const dimmed = (svg.match(/opacity="0\.28"/g) ?? []).length;
    assert.equal(dimmed, steps.length - 1, `step ${step} dimmed the wrong number of zones`);
  }
});

test('a zone diagram never renders its label outside the canvas', () => {
  // The smallest zones sit hard against the door end. A label centred on a 6px
  // strip would be clipped by the edge, which is where it is least readable.
  resetIds();
  const items = [
    makeItem({ id: 'huge', category: 'appliance', estimatedWeightClass: 'heavy', cubicFeet: 400 }),
    // ~0.2% of the load — the narrowest a zone can get.
    makeItem({ id: 'tiny', category: 'box', estimatedWeightClass: 'light', cubicFeet: 1 }),
  ];
  for (const step of computeZones(items).map((z) => z.step)) {
    const svg = renderZoneSVG(items, '26ft', step);
    for (const match of svg.matchAll(/<text x="([\d.]+)"/g)) {
      const x = Number(match[1]);
      assert.ok(x >= 0 && x <= 320, `label at x=${x} falls outside the 320-wide canvas`);
    }
  }
});

test('the zone accessibility label says where in the truck, not just what', () => {
  resetIds();
  const items = [
    makeItem({ id: 'a', category: 'appliance', estimatedWeightClass: 'heavy', cubicFeet: 46 }),
    makeItem({ id: 'b', category: 'box', estimatedWeightClass: 'light', cubicFeet: 6 }),
  ];
  const first = zoneAriaLabel(items, '15ft', 1);
  assert.match(first, /behind the cab/i, 'the first zone should describe its position');
  assert.match(first, /cubic feet/i);
  assert.match(first, /percent/i);

  const last = zoneAriaLabel(items, '15ft', 5);
  assert.match(last, /door|loaded last/i);

  // A step with no items in it must not claim a position.
  assert.equal(zoneAriaLabel(items, '15ft', 4), 'Truck diagram');
});
