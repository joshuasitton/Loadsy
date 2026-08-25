/**
 * WCAG 2.x relative luminance and contrast, so the palette's accessibility is an
 * asserted invariant rather than something anyone has to remember to re-measure.
 *
 * Pure arithmetic, no React and no I/O, so the theme can be tested by the same
 * dependency-free runner as the domain layer.
 */

/** Relative luminance per WCAG 2.x, from a `#rrggbb` string. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const raw = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Contrast ratio between two colours, 1:1 (identical) to 21:1 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for body text and any text under 18pt/14pt-bold. */
export const AA_TEXT = 4.5;
/** WCAG AA for large text, and for non-text UI boundaries under 1.4.11. */
export const AA_LARGE = 3;
