/**
 * Whether two detected items are the same kind of thing, and how alike their sizes are.
 *
 * Written for the detection eval, which pairs the model's items with tape-measured ones,
 * and moved here when the app needed the same judgement to find one object listed in two
 * rooms. One definition serves both, so the product's duplicate check and the eval that
 * measures it cannot disagree about what "the same kind of thing" means.
 *
 * Pure, so `npm test` pins it with nothing installed.
 */

import { objectName } from './plausibility';

/** Words that describe an object without saying what it is. */
const IGNORED = new Set([
  'a', 'an', 'the', 'of', 'and', 'with', 'for', 'in', 'on', 'set', 'pair', 'piece',
  // What part of a thing it is, not what it is: "Sectional Sofa Long Run" is a sofa.
  'run', 'section', 'module', 'part', 'end', 'corner', 'long',
  'small', 'large', 'big', 'medium', 'mini', 'tall', 'short', 'low', 'wide', 'narrow',
  'wooden', 'wood', 'metal', 'glass', 'fabric', 'leather', 'upholstered', 'plastic', 'wicker', 'rattan',
  'white', 'black', 'grey', 'gray', 'brown', 'beige', 'blue', 'green', 'red', 'cream', 'dark', 'light',
  'round', 'square', 'rectangular', 'oval', 'old', 'new', 'modern', 'vintage',
  'king', 'queen', 'twin', 'full', 'double', 'single', 'seat', 'seater',
]);

/** Phrases that name one object in two words, joined before splitting. */
const PHRASES: [RegExp, string][] = [
  [/\bchest of drawers\b/g, 'dresser'],
  [/\bbed ?frame\b/g, 'bed'],
  [/\bbox ?spring\b/g, 'boxspring'],
  [/\bnight ?stand\b|\bbedside table\b|\bnight table\b/g, 'nightstand'],
  [/\b(tv|television|media) (stand|console|unit|cabinet)\b|\bentertainment (center|centre|unit)\b/g, 'tvstand'],
  [/\bbook ?(shelf|shelves|case)\b/g, 'shelf'],
  [/\bwashing machine\b/g, 'washer'],
  [/\bfoot ?stool\b/g, 'ottoman'],
  [/\b(hutch|china|display|curio) cabinet\b/g, 'hutch'],
  // "Fluted Sideboard Cabinet" is a sideboard: it went unpaired in 16 of 50 answers.
  [/\b(sideboard|buffet|credenza) cabinet\b/g, 'sideboard'],
  // A shadow box or display case hangs on a wall; it is not a packing box.
  [/\b(shadow box|display case)\b/g, 'displaycase'],
];

/** Different words for the same kind of object. */
const SYNONYMS: Record<string, string> = {
  couch: 'sofa', loveseat: 'sofa', settee: 'sofa', sectional: 'sofa',
  television: 'tv', tvs: 'tv',
  shelving: 'shelf', shelve: 'shelf', etagere: 'shelf',
  bureau: 'dresser',
  armchair: 'chair', recliner: 'chair',
  carpet: 'rug', runner: 'rug',
  carton: 'box', tote: 'box', bin: 'box', crate: 'box',
  pouf: 'ottoman', pouffe: 'ottoman',
  credenza: 'sideboard', buffet: 'sideboard',
  armoire: 'wardrobe',
  planter: 'plant',
  artwork: 'art', painting: 'art', picture: 'art', print: 'art', canvas: 'art',
  bike: 'bicycle',
  fridge: 'refrigerator',
  bedframe: 'bed', headboard: 'bed',
  chaise: 'sofa',
  map: 'art',
};

function singular(word: string): string {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** The words of a name that say what the object is, most important – the head noun – last. */
export function nameWords(name: string): string[] {
  // The app's own reading of what an object is – location and contents clauses off, so
  // "Wood Side Table with Drawer" is a table, not a drawer.
  let text = objectName(name).toLowerCase();
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  return text
    .split(/[^a-z]+/)
    .filter((word) => word.length > 1)
    .map((word) => SYNONYMS[word] ?? SYNONYMS[singular(word)] ?? singular(word))
    .filter((word) => !IGNORED.has(word));
}

function headOf(words: readonly string[]): string | null {
  return words.length === 0 ? null : words[words.length - 1]!;
}

/**
 * How alike two names are, 0 to 1 – and 0 unless they name the same kind of thing.
 *
 * "Same kind" means the same head noun: "Side Table" and "Coffee Table" can pair,
 * "Table Lamp" and "Side Table" cannot. Past that, shared words decide between
 * candidates.
 */
export function nameSimilarity(measuredNames: readonly string[], seenName: string): number {
  const seen = nameWords(seenName);
  const seenHead = headOf(seen);
  let best = 0;
  for (const name of measuredNames) {
    const words = nameWords(name);
    if (seenHead === null || headOf(words) !== seenHead) continue;
    const a = new Set(words);
    const b = new Set(seen);
    const shared = [...a].filter((word) => b.has(word)).length;
    best = Math.max(best, 0.5 + 0.5 * (shared / new Set([...a, ...b]).size));
  }
  return best;
}

/** How alike two sizes are, 0 to 1, ignoring which way round the sides were given. */
export function sizeSimilarity(a: Dims, b: Dims): number {
  const x = sortedSides(a);
  const y = sortedSides(b);
  return x.reduce((sum, side, i) => sum + Math.min(side, y[i]!) / Math.max(side, y[i]!), 0) / 3;
}

export interface Dims {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

function sortedSides(d: Dims): number[] {
  return [d.lengthIn, d.widthIn, d.heightIn].sort((p, q) => q - p);
}
