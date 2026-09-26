/**
 * The materials menu for the dog portrait print product, and the printer it
 * is printed on. Pure data and pure functions – nothing here imports React,
 * Expo or React Native, so `npm test` still runs with nothing installed.
 *
 * `docs/dog-print-brief.md` argues every row. This file is the one place the
 * menu is defined, and `__tests__/dogprintMaterials.test.ts` pins the
 * constraints that make a row true: a material we sell must feed through the
 * AMS Lite, must not need an enclosure the A1 does not have, and no order may
 * ask for more colours than the printer has slots.
 *
 * Facts about the printer and each material were checked against third-party
 * reproductions of Bambu's compatibility table on 2026-09-26, because Bambu's
 * own site was unreachable from the cloud container. Rows whose AMS Lite
 * status could not be settled say so in `amsLite`, and `offered` keeps them
 * off the menu until someone confirms them on the Mac.
 */

/** Bambu Lab A1 with AMS Lite, as it ships. */
export const PRINTER = {
  name: 'Bambu Lab A1 + AMS Lite',
  /** Millimetres, each axis. */
  buildVolumeMm: { x: 256, y: 256, z: 256 },
  maxHotendC: 300,
  maxBedC: 100,
  /** An open frame. Anything that needs an enclosure is out. */
  enclosed: false,
  /** Four spools, so four filaments per print without a manual swap. */
  amsLiteSlots: 4,
  /** As shipped. The hardened steel hotend is an inexpensive optional part. */
  nozzleAsShipped: 'stainless' as const,
} as const;

/** Slots minus the one a support material would occupy, if any. */
export const MAX_COLOURS = PRINTER.amsLiteSlots;

/** Purge per filament change on the A1, grams. Default profile, and tuned. */
export const PURGE_GRAMS_PER_CHANGE = { default: 6, tuned: 4.5 } as const;

export type Family = 'PLA' | 'PETG' | 'TPU' | 'engineering' | 'support';

export type AmsLite =
  /** On Bambu's compatible list, confirmed by more than one guide. */
  | 'compatible'
  /** Bambu says do not: feed failures, or not designed for the unit. */
  | 'not-recommended'
  /** Guides disagree or are silent. Check the wiki table on the Mac. */
  | 'unverified';

export type Offered =
  /** On the menu from day one. */
  | 'standard'
  /** On the menu once the hardened hotend is fitted and the row is verified. */
  | 'specialty'
  /** Not a colour option for the figurine. `why` says the reason. */
  | 'no';

export interface Material {
  id: string;
  name: string;
  family: Family;
  amsLite: AmsLite;
  /** The nozzle Bambu recommends for it. */
  nozzle: 'stainless' | 'hardened';
  needsEnclosure: boolean;
  offered: Offered;
  /** One sentence the menu can show, or the reason it is not on the menu. */
  why: string;
}

export const MATERIALS: readonly Material[] = [
  {
    id: 'pla-matte',
    name: 'PLA Matte',
    family: 'PLA',
    amsLite: 'compatible',
    nozzle: 'stainless',
    needsEnclosure: false,
    offered: 'standard',
    why: 'Hides layer lines best, which on fur is the difference between a print and a figurine.',
  },
  {
    id: 'pla-basic',
    name: 'PLA Basic',
    family: 'PLA',
    amsLite: 'compatible',
    nozzle: 'stainless',
    needsEnclosure: false,
    offered: 'standard',
    why: 'The widest palette and the cheapest spool; glossier than Matte, so layer lines show more.',
  },
  {
    id: 'pla-silk-plus',
    name: 'PLA Silk+',
    family: 'PLA',
    amsLite: 'compatible',
    nozzle: 'stainless',
    needsEnclosure: false,
    offered: 'standard',
    why: 'High-gloss gift finish; the outer wall prints slowly and fine fur detail suffers.',
  },
  {
    id: 'petg-hf',
    name: 'PETG HF',
    family: 'PETG',
    amsLite: 'compatible',
    nozzle: 'stainless',
    needsEnclosure: false,
    offered: 'standard',
    why: 'For a dashboard, a sunny windowsill or a garden, where PLA softens. Less fine detail.',
  },
  {
    id: 'pla-sparkle',
    name: 'PLA Sparkle',
    family: 'PLA',
    amsLite: 'compatible',
    nozzle: 'hardened',
    needsEnclosure: false,
    offered: 'specialty',
    why: 'Glitter fleck. Needs the hardened steel nozzle.',
  },
  {
    id: 'pla-marble',
    name: 'PLA Marble',
    family: 'PLA',
    amsLite: 'unverified',
    nozzle: 'hardened',
    needsEnclosure: false,
    offered: 'no',
    why: 'Stone finish. Guides disagree on AMS Lite feeding – verify on the Mac before offering.',
  },
  {
    id: 'pla-wood',
    name: 'PLA Wood',
    family: 'PLA',
    amsLite: 'unverified',
    nozzle: 'hardened',
    needsEnclosure: false,
    offered: 'no',
    why: 'Carved look, single colour. Not on any AMS Lite list found – expect external spool only.',
  },
  {
    id: 'pla-galaxy',
    name: 'PLA Galaxy',
    family: 'PLA',
    amsLite: 'unverified',
    nozzle: 'hardened',
    needsEnclosure: false,
    offered: 'no',
    why: 'Metallic fleck. AMS Lite feeding unverified.',
  },
  {
    id: 'pla-metal',
    name: 'PLA Metal',
    family: 'PLA',
    amsLite: 'unverified',
    nozzle: 'hardened',
    needsEnclosure: false,
    offered: 'no',
    why: 'Metallic finish. AMS Lite feeding unverified.',
  },
  {
    id: 'pla-glow',
    name: 'PLA Glow',
    family: 'PLA',
    amsLite: 'not-recommended',
    nozzle: 'hardened',
    needsEnclosure: false,
    offered: 'no',
    why: 'Bambu says not through the AMS Lite: hard, rough, feed failures. External spool, single colour, later.',
  },
  {
    id: 'pla-cf',
    name: 'PLA-CF',
    family: 'PLA',
    amsLite: 'compatible',
    nozzle: 'hardened',
    needsEnclosure: false,
    offered: 'no',
    why: 'Dark colours only and it wears the AMS tubing. Nothing a figurine needs.',
  },
  {
    id: 'pla-silk-multicolor',
    name: 'PLA Silk Multi-Color',
    family: 'PLA',
    amsLite: 'compatible',
    nozzle: 'stainless',
    needsEnclosure: false,
    offered: 'no',
    why: 'Bambu does not recommend it on A-series printers: the strand rotates and the colour comes out uneven.',
  },
  {
    id: 'tpu-95a-hf',
    name: 'TPU 95A HF',
    family: 'TPU',
    amsLite: 'not-recommended',
    nozzle: 'stainless',
    needsEnclosure: false,
    offered: 'no',
    why: 'Not AMS or AMS Lite compatible. A squishy toy would use "TPU for AMS" and is a separate product.',
  },
  {
    id: 'abs-asa-pc-pa',
    name: 'ABS, ASA, PC, PA',
    family: 'engineering',
    amsLite: 'compatible',
    nozzle: 'hardened',
    needsEnclosure: true,
    offered: 'no',
    why: 'Need an enclosure the A1 does not have.',
  },
  {
    id: 'support-pla-petg',
    name: 'Support for PLA/PETG',
    family: 'support',
    amsLite: 'compatible',
    nozzle: 'stainless',
    needsEnclosure: false,
    offered: 'no',
    why: 'A support material, not a colour. It spends one of the four slots.',
  },
];

export function material(id: string): Material | undefined {
  return MATERIALS.find((m) => m.id === id);
}

/** The menu a customer sees, in the order the brief argues for. */
export function menu(hardenedNozzleFitted: boolean): Material[] {
  return MATERIALS.filter(
    (m) => m.offered === 'standard' || (hardenedNozzleFitted && m.offered === 'specialty'),
  );
}

export interface OrderColours {
  materialId: string;
  /** Distinct filament colours the customer picked, in AMS slot order. */
  colours: readonly string[];
  /** Whether the pose needs breakaway support material, which takes a slot. */
  supportMaterial: boolean;
}

/**
 * Says whether an order can be loaded into one AMS Lite, and why not.
 * Empty array means it can.
 */
export function orderProblems(order: OrderColours, hardenedNozzleFitted = false): string[] {
  const problems: string[] = [];
  const m = material(order.materialId);
  if (!m) return [`Unknown material "${order.materialId}".`];
  if (!menu(hardenedNozzleFitted).includes(m)) problems.push(`${m.name} is not on the menu: ${m.why}`);

  const slots = PRINTER.amsLiteSlots - (order.supportMaterial ? 1 : 0);
  const distinct = new Set(order.colours);
  if (distinct.size === 0) problems.push('Pick at least one colour.');
  if (distinct.size > slots) {
    problems.push(
      order.supportMaterial
        ? `Support material takes a slot, leaving ${slots} for colours; ${distinct.size} were picked.`
        : `The AMS Lite holds ${slots} spools; ${distinct.size} colours were picked.`,
    );
  }
  return problems;
}

/**
 * Filament purged by colour changes over a whole print, grams. `changesPerLayer`
 * is the number of filament swaps a typical layer makes – zero for a
 * single-colour dog, up to colours minus one when every colour appears in
 * every layer. The brief's argument for banding colours by height is this
 * number: a plinth in a second colour is one change in the whole print, a
 * collar that spans the dog's height is a change on every layer it touches.
 */
export function purgeGrams(
  layers: number,
  changesPerLayer: number,
  gramsPerChange: number = PURGE_GRAMS_PER_CHANGE.default,
): number {
  if (layers < 0 || changesPerLayer < 0 || gramsPerChange < 0) throw new RangeError('negative input');
  return layers * changesPerLayer * gramsPerChange;
}

/** Layers for a figurine of a given height, at the layer height the A1 prints well. */
export function layersFor(heightMm: number, layerHeightMm = 0.2): number {
  return Math.ceil(heightMm / layerHeightMm);
}
