import type { InventoryItem, TruckSize } from '../domain/types';
import { stepForItem, type LoadStepOrder } from '../domain/packing';
import { TRUCK_CAPACITY } from '../domain/truck';

/**
 * Client-side truck-map schematic (spec §3 Screen 6).
 *
 * This is intentionally a load-zone diagram, not a bin-packing solution — true 3D
 * optimisation is explicitly out of scope for MVP (§1). It shows WHERE each load
 * step goes and how much of the truck that step's volume occupies, which is what
 * the packing plan actually promises.
 *
 * Deterministic: same items in, same SVG out, so "Save Plan" round-trips.
 */

export type TruckView = 'top' | '3d';

/** Internal truck bed dimensions in feet, by size — used for proportional layout. */
const BED_DIMENSIONS: Record<TruckSize, { lengthFt: number; widthFt: number }> = {
  van: { lengthFt: 9, widthFt: 5.5 },
  '10ft': { lengthFt: 9.9, widthFt: 6.4 },
  '15ft': { lengthFt: 15, widthFt: 7.7 },
  '20ft': { lengthFt: 19.5, widthFt: 7.7 },
  '26ft': { lengthFt: 26, widthFt: 8.1 },
};

/**
 * Retuned as one set so every zone carries its white label at AA. Zone 2 measured
 * 2.92:1 and zone 5 4.09:1 — the labels inside those blocks were effectively
 * unreadable — while zones 1 and 3 sat on the 4.5 line with no margin.
 */
/** Exported for the contrast test: these fills are backgrounds for white labels. */
export const STEP_COLORS_FOR_TEST: Record<LoadStepOrder, string> = {
  1: '#9C3F2A',
  2: '#8A5A0B',
  3: '#3F6480',
  4: '#63467F',
  5: '#2E6B48',
};

const STEP_LABELS: Record<LoadStepOrder, string> = {
  1: 'Heavy',
  2: 'Furniture',
  3: 'Boxes',
  4: 'Fragile',
  5: 'Essentials',
};

const CANVAS = { width: 320, height: 200 };

export interface TruckMapOptions {
  /**
   * Embed the accessible name as `aria-label` on the root element.
   *
   * True for the file we save and share — a standalone SVG has to carry its own
   * label. False when the markup is about to be handed to `SvgXml`, whose parser
   * camelCases every attribute into `ariaLabel`, a prop neither React Native nor
   * the DOM reads. The screen passes the label as a real prop instead; leaving the
   * attribute in would only produce an unreadable one it has to strip again.
   */
  labelled?: boolean;
}

export function renderTruckMapSVG(
  items: InventoryItem[],
  truckSize: TruckSize,
  view: TruckView = 'top',
  { labelled = true }: TruckMapOptions = {},
): string {
  const zones = computeZones(items);
  const bed = BED_DIMENSIONS[truckSize];
  const body = view === '3d' ? renderIsometric(zones, truckSize) : renderTopDown(zones, bed);
  const label = labelled ? ` aria-label="${truckMapAriaLabel(zones, truckSize)}"` : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" width="100%" height="100%" role="img"${label}>`,
    body,
    '</svg>',
  ].join('');
}

export interface LoadZone {
  step: LoadStepOrder;
  label: string;
  color: string;
  cubicFeet: number;
  /** share of the loaded volume, 0–1 */
  fraction: number;
}

/** Exported for tests: the zone maths is the part worth asserting on. */
export function computeZones(items: InventoryItem[]): LoadZone[] {
  const totals = new Map<LoadStepOrder, number>();
  for (const item of items) {
    const step = stepForItem(item);
    totals.set(step, (totals.get(step) ?? 0) + item.cubicFeet);
  }

  const loaded = [...totals.values()].reduce((a, b) => a + b, 0);
  if (loaded === 0) return [];

  return ([1, 2, 3, 4, 5] as LoadStepOrder[])
    .filter((step) => (totals.get(step) ?? 0) > 0)
    .map((step) => ({
      step,
      label: STEP_LABELS[step],
      color: STEP_COLORS_FOR_TEST[step],
      cubicFeet: Math.round((totals.get(step) ?? 0) * 100) / 100,
      fraction: (totals.get(step) ?? 0) / loaded,
    }));
}

/** Height of a single-zone strip. Shorter than the full map — it is a locator, not a chart. */
const ZONE_CANVAS = { width: 320, height: 96 };

/**
 * One load step, drawn in place inside the truck.
 *
 * The combined map answers "how is the truck divided?". Standing in the doorway
 * holding a sofa, that is the wrong question — you need "where does THIS go?", and
 * scanning a five-colour chart for your colour is work the diagram should have
 * done for you.
 *
 * So every other zone drops to a faint outline and only this one is filled. The
 * others stay visible rather than being erased because position is the entire
 * message: a zone means nothing without the ones it is loaded against.
 */
export function renderZoneSVG(
  items: InventoryItem[],
  truckSize: TruckSize,
  step: LoadStepOrder,
): string {
  const zones = computeZones(items);
  const bed = BED_DIMENSIONS[truckSize];
  const pad = 14;
  const cabWidth = 26;
  const bedX = pad + cabWidth + 5;
  const bedWidth = ZONE_CANVAS.width - bedX - pad;
  const bedY = 22;
  const bedHeight = Math.min(48, Math.max(34, bedWidth * (bed.widthFt / bed.lengthFt)));

  const parts: string[] = [
    `<rect x="${pad}" y="${bedY + bedHeight * 0.15}" width="${cabWidth}" height="${round(bedHeight * 0.7)}" rx="4" fill="#2B3B52"/>`,
    `<text x="${pad + cabWidth / 2}" y="${round(bedY + bedHeight / 2 + 3)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" fill="#8A94A6">CAB</text>`,
  ];

  let cursor = bedX;
  let focus: { x: number; width: number; zone: LoadZone } | null = null;
  for (const zone of zones) {
    const width = Math.max(6, bedWidth * zone.fraction);
    const isFocus = zone.step === step;
    parts.push(
      isFocus
        ? `<rect x="${round(cursor)}" y="${bedY}" width="${round(width)}" height="${round(bedHeight)}" fill="${zone.color}" opacity="0.92"/>`
        : `<rect x="${round(cursor)}" y="${bedY}" width="${round(width)}" height="${round(bedHeight)}" fill="${zone.color}" opacity="0.28"/><rect x="${round(cursor)}" y="${bedY}" width="${round(width)}" height="${round(bedHeight)}" fill="none" stroke="#0F1B2D" stroke-width="1"/>`,
    );
    if (isFocus) focus = { x: cursor, width, zone };
    cursor += width;
  }

  parts.push(
    `<rect x="${bedX}" y="${bedY}" width="${round(bedWidth)}" height="${round(bedHeight)}" fill="none" stroke="#0F1B2D" stroke-width="1.5" rx="3"/>`,
  );

  if (focus) {
    // A bracket under the zone, rather than a label inside it: a narrow zone has no
    // room for text, and a label that vanishes on small zones is worse than none.
    // Clamped inside the canvas: the smallest zones sit hard against the door end,
    // and a label centred on a 6px strip would otherwise be cut off by the edge.
    const midX = round(
      Math.min(ZONE_CANVAS.width - 42, Math.max(42, focus.x + focus.width / 2)),
    );
    const y = bedY + bedHeight + 7;
    parts.push(
      `<path d="M ${round(focus.x)} ${y} L ${round(focus.x)} ${y + 4} L ${round(focus.x + focus.width)} ${y + 4} L ${round(focus.x + focus.width)} ${y}" fill="none" stroke="${focus.zone.color}" stroke-width="1.5"/>`,
      `<text x="${midX}" y="${y + 18}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="600" fill="${focus.zone.color}">${focus.zone.label} · ${focus.zone.cubicFeet} ft³</text>`,
    );
  }

  parts.push(
    `<text x="${bedX}" y="${bedY - 7}" font-family="system-ui,sans-serif" font-size="8" fill="#8A94A6">← loaded first</text>`,
    `<text x="${bedX + bedWidth}" y="${bedY - 7}" text-anchor="end" font-family="system-ui,sans-serif" font-size="8" fill="#8A94A6">door →</text>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ZONE_CANVAS.width} ${ZONE_CANVAS.height}" width="100%" height="100%" role="img">`,
    parts.join(''),
    '</svg>',
  ].join('');
}

/** The accessible name for a single-zone diagram. */
export function zoneAriaLabel(
  items: InventoryItem[],
  truckSize: TruckSize,
  step: LoadStepOrder,
): string {
  const zones = computeZones(items);
  const index = zones.findIndex((z) => z.step === step);
  if (index < 0) return 'Truck diagram';
  const zone = zones[index]!;
  const position =
    index === 0
      ? 'against the wall behind the cab'
      : index === zones.length - 1
        ? 'at the door end, loaded last'
        : `${index + 1} of ${zones.length} back from the cab`;
  return `${zone.label}: ${zone.cubicFeet} cubic feet, ${Math.round(zone.fraction * 100)} percent of the load, ${position}.`;
}

function renderTopDown(zones: LoadZone[], bed: { lengthFt: number; widthFt: number }): string {
  const pad = 16;
  const cabWidth = 34;
  const bedX = pad + cabWidth + 6;
  const bedWidth = CANVAS.width - bedX - pad;
  const bedY = 42;
  const aspect = bed.widthFt / bed.lengthFt;
  const bedHeight = Math.min(110, Math.max(60, bedWidth * aspect));

  const parts: string[] = [
    `<rect x="0" y="0" width="${CANVAS.width}" height="${CANVAS.height}" fill="none"/>`,
    `<text x="${pad}" y="24" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="600" fill="#8A94A6">TOP VIEW · LOAD ORDER, BACK TO FRONT</text>`,
    // cab
    `<rect x="${pad}" y="${bedY + bedHeight * 0.15}" width="${cabWidth}" height="${bedHeight * 0.7}" rx="5" fill="#2B3B52"/>`,
    `<text x="${pad + cabWidth / 2}" y="${bedY + bedHeight / 2 + 3}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" fill="#8A94A6">CAB</text>`,
  ];

  let cursor = bedX;
  for (const zone of zones) {
    const width = Math.max(6, bedWidth * zone.fraction);
    parts.push(
      `<rect x="${round(cursor)}" y="${bedY}" width="${round(width)}" height="${round(bedHeight)}" fill="${zone.color}" opacity="0.88"/>`,
    );
    if (width > 34) {
      parts.push(
        `<text x="${round(cursor + width / 2)}" y="${round(bedY + bedHeight / 2 - 2)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="600" fill="#FFFFFF">${zone.label}</text>`,
        `<text x="${round(cursor + width / 2)}" y="${round(bedY + bedHeight / 2 + 11)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" fill="#FFFFFF" opacity="0.8">${zone.cubicFeet} ft³</text>`,
      );
    }
    cursor += width;
  }

  parts.push(
    `<rect x="${bedX}" y="${bedY}" width="${round(bedWidth)}" height="${round(bedHeight)}" fill="none" stroke="#0F1B2D" stroke-width="1.5" rx="3"/>`,
    `<text x="${bedX}" y="${bedY + bedHeight + 16}" font-family="system-ui,sans-serif" font-size="9" fill="#8A94A6">← loaded first</text>`,
    `<text x="${bedX + bedWidth}" y="${bedY + bedHeight + 16}" text-anchor="end" font-family="system-ui,sans-serif" font-size="9" fill="#8A94A6">loaded last (door) →</text>`,
  );

  return parts.join('');
}

function renderIsometric(zones: LoadZone[], truckSize: TruckSize): string {
  const capacity = TRUCK_CAPACITY[truckSize];
  const originX = 46;
  const originY = 150;
  const totalWidth = 210;
  const wallHeight = 74;
  const depth = 30;

  const parts: string[] = [
    `<text x="16" y="24" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="600" fill="#8A94A6">3D VIEW · ${capacity.min}–${capacity.max} FT³ CAPACITY</text>`,
  ];

  let cursor = originX;
  for (const zone of zones) {
    const width = Math.max(8, totalWidth * zone.fraction);
    const height = wallHeight;
    // front face
    parts.push(
      `<polygon points="${round(cursor)},${originY} ${round(cursor + width)},${originY} ${round(cursor + width)},${round(originY - height)} ${round(cursor)},${round(originY - height)}" fill="${zone.color}" opacity="0.9"/>`,
    );
    // top face
    parts.push(
      `<polygon points="${round(cursor)},${round(originY - height)} ${round(cursor + width)},${round(originY - height)} ${round(cursor + width + depth * 0.6)},${round(originY - height - depth * 0.5)} ${round(cursor + depth * 0.6)},${round(originY - height - depth * 0.5)}" fill="${zone.color}" opacity="0.6"/>`,
    );
    if (width > 30) {
      parts.push(
        `<text x="${round(cursor + width / 2)}" y="${round(originY - height / 2)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="600" fill="#FFFFFF">${zone.label}</text>`,
      );
    }
    cursor += width;
  }

  parts.push(
    `<line x1="${originX}" y1="${originY}" x2="${round(cursor)}" y2="${originY}" stroke="#0F1B2D" stroke-width="2"/>`,
    `<text x="${originX}" y="${originY + 18}" font-family="system-ui,sans-serif" font-size="9" fill="#8A94A6">cab end</text>`,
    `<text x="${round(cursor)}" y="${originY + 18}" text-anchor="end" font-family="system-ui,sans-serif" font-size="9" fill="#8A94A6">door end</text>`,
  );

  return parts.join('');
}

/**
 * The diagram's accessible name.
 *
 * Exported because it has to be applied twice, in two different ways: embedded as
 * `aria-label` in the SVG string (which is saved and shared as a standalone file, so
 * it must stay spec-compliant), and handed to the renderer as a prop, because
 * `SvgXml` camelCases every attribute it parses and mangles `aria-label` into a
 * name no platform reads. Both paths must say the same thing.
 */
export function truckMapAriaLabel(zones: LoadZone[], truckSize: TruckSize): string {
  if (zones.length === 0) return 'Empty truck diagram — no items in your inventory yet';
  const parts = zones.map((z) => `${z.label} ${Math.round(z.fraction * 100)} percent`);
  return `Load diagram for a ${truckSize} truck, from the cab end to the door: ${parts.join(', ')}`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
