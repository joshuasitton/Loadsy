/**
 * Loadsy's palette: white ground, blues and greens.
 *
 * Every colour that ends up under text is chosen against WCAG AA rather than by
 * eye, and `__tests__/contrast.test.ts` pins each pair the app actually renders.
 * Light themes fail contrast far more easily than dark ones — a pale blue that
 * looks calm on a designer's monitor is 2.8:1 in daylight — so the muted greys
 * here are darker than they look like they need to be. That is deliberate.
 *
 * Blue carries structure: surfaces, borders, the ground the app sits on. Green
 * carries meaning.
 *
 * Which leaves one thing unresolved, and worth naming rather than papering over:
 * `accent` and `green` are both greens doing different jobs. `accent` is Loadsy
 * speaking — the recommendation, the primary action. `green` means confirmed or
 * included, which is a claim about a vendor's data, not ours. Two different
 * assertions in one hue family. Moving `accent` to blue would settle it and the
 * palette has the room, but that is a brand decision rather than a contrast one,
 * so it stays green until somebody makes it deliberately.
 */

export const colors = {
  /** White, as the ground the whole app sits on. */
  bg: '#FFFFFF',
  /** Cards. Blue-tinted rather than grey, so they read as part of the palette. */
  surface: '#F2F8FB',
  /** Nested blocks inside a card — inputs, figures, zone chips. */
  surfaceRaised: '#E4EFF5',
  /**
   * Card and divider edges. Decorative — the card's own fill is what separates it
   * from the page, so this line only has to be visible, not identifying.
   */
  border: '#C3D9E4',
  /**
   * The boundary of a control that has no fill of its own: outline buttons, text
   * inputs, the confirm/cancel pairs. Here the border IS the component, so WCAG
   * 1.4.11 applies and it has to clear 3:1 against both the page and a card.
   * That is why it is noticeably darker than `border` — on a white ground a
   * comfortable-looking hairline is about 1.5:1, and the button disappears.
   */
  borderStrong: '#6F8D9D',

  text: '#0D2430',
  textMuted: '#476170',
  /**
   * The quietest text in the app, and it carries the affiliate disclosure — an
   * App Store commitment. Darker than a "dim" colour wants to be, because it has
   * to clear 4.5:1 on the card background, not just on white.
   */
  textDim: '#4F6B79',

  /** Loadsy's own green. Dark enough to carry white text and to act as a boundary. */
  accent: '#0B7A62',
  accentText: '#FFFFFF',
  /**
   * Light green fill behind accent-coloured marks — the completed-step badge,
   * the confirm affirmative. Lighter than it first was: the accent sitting on it
   * measured 4.31:1, and the contrast test refused it.
   */
  accentDim: '#E3F6F0',

  /** estimated line items and low-confidence flags */
  amber: '#8A5300',
  amberDim: '#FBF0D9',
  /** confirmed / included line items */
  green: '#0F6B49',
  greenDim: '#DAF1E6',
  danger: '#A32A17',
  dangerDim: '#FBE4DF',

  disabled: '#E4EFF5',
  /**
   * WCAG exempts disabled controls from contrast entirely, so this is a choice
   * rather than a requirement: legible enough to read the label you cannot press,
   * muted enough that it never reads as available.
   */
  disabledText: '#63808E',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8 },
} as const;
