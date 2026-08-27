import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AA_LARGE, AA_TEXT, contrastRatio } from '../src/ui/contrast';
import { colors } from '../src/ui/theme';
import { DIAGRAM_COLORS_FOR_TEST, STEP_COLORS_FOR_TEST } from '../src/truckmap/renderSvg';

/**
 * Every text pair the app actually renders, checked against WCAG AA.
 *
 * Five of these shipped below AA — including the PrimaryButton label at 3.30:1 and
 * the affiliate disclosure at 3.21:1, which is a commitment made in APP_STORE.md.
 * Contrast is easy to break with a well-meant colour tweak, so it is pinned here.
 *
 * The list grew when the palette went from dark to white. A light theme fails
 * contrast far more readily: a muted grey that clears AA on a dark card is
 * nowhere near it on a pale one, and every surface the app can put text on now
 * has to be checked rather than assumed.
 */
const TEXT_PAIRS: [string, string, string][] = [
  ['body text on the screen background', colors.text, colors.bg],
  ['body text on a card', colors.text, colors.surface],
  ['muted text on the background', colors.textMuted, colors.bg],
  ['muted text on a card', colors.textMuted, colors.surface],
  ['dim text on the background', colors.textDim, colors.bg],
  ['dim text on a card (affiliate disclosure)', colors.textDim, colors.surface],
  ['PrimaryButton label', colors.accentText, colors.accent],
  ['accent used as link text', colors.accent, colors.bg],
  ['estimate tag', colors.amber, colors.amberDim],
  ['estimate text on the background', colors.amber, colors.bg],
  ['confirmed line item', colors.green, colors.greenDim],
  ['danger banner title', colors.danger, colors.dangerDim],
  ['danger text on the background', colors.danger, colors.bg],

  // Raised blocks — inputs, figure tiles, the demo scenario buttons — are the
  // palest surface in the app, so they are the first place a muted colour fails.
  ['body text on a raised block', colors.text, colors.surfaceRaised],
  ['muted text on a raised block', colors.textMuted, colors.surfaceRaised],
  ['dim text on a raised block', colors.textDim, colors.surfaceRaised],
  ['accent used as link text on a card', colors.accent, colors.surface],
  ['status text on its own tint', colors.text, colors.accentDim],
  ['a completed step badge', colors.accent, colors.accentDim],
  ['the current step badge', colors.accentText, colors.accent],
  ['an upcoming step badge', colors.textDim, colors.surface],
  ['estimate text on a card', colors.amber, colors.surface],
  ['confirmed text on a card', colors.green, colors.surface],
  ['danger text on a card', colors.danger, colors.surface],

  // The diagram's captions sit on all three surfaces depending on the screen.
  ['diagram caption on the background', DIAGRAM_COLORS_FOR_TEST.caption, colors.bg],
  ['diagram caption on a card', DIAGRAM_COLORS_FOR_TEST.caption, colors.surface],
  ['diagram caption on a raised block', DIAGRAM_COLORS_FOR_TEST.caption, colors.surfaceRaised],
  ['the CAB label inside the cab block', DIAGRAM_COLORS_FOR_TEST.caption, DIAGRAM_COLORS_FOR_TEST.cab],
];

test('every text colour pair the app renders meets WCAG AA', () => {
  const failures = TEXT_PAIRS.filter(([, fg, bg]) => contrastRatio(fg, bg) < AA_TEXT).map(
    ([label, fg, bg]) => `${label}: ${contrastRatio(fg, bg).toFixed(2)}:1 (${fg} on ${bg})`,
  );
  assert.deepEqual(failures, [], `below the ${AA_TEXT}:1 minimum:\n  ${failures.join('\n  ')}`);
});

test('every truck-map zone carries its white label at WCAG AA', () => {
  // The zone label is printed inside the coloured block, so the block IS the
  // background. Zone 2 shipped at 2.92:1 and zone 5 at 4.09:1.
  const failures = Object.entries(STEP_COLORS_FOR_TEST)
    .filter(([, fill]) => contrastRatio('#FFFFFF', fill) < AA_TEXT)
    .map(([step, fill]) => `zone ${step}: ${contrastRatio('#FFFFFF', fill).toFixed(2)}:1 (${fill})`);
  assert.deepEqual(failures, [], `zone labels below AA:\n  ${failures.join('\n  ')}`);
});

/**
 * WCAG 1.4.11: where a control's outline is the only thing identifying it, that
 * outline has to be distinguishable from what surrounds it.
 *
 * This is the failure mode a white theme walks straight into. An outline button
 * with a comfortable-looking hairline measures about 1.5:1 on white — the button
 * is, visually, not there. Hence a second border token: `border` for the soft
 * edge of a card that its own fill already separates from the page, and
 * `borderStrong` for anything whose boundary IS the component.
 */
const BOUNDARY_PAIRS: [string, string, string][] = [
  ['accent boundary on the background', colors.accent, colors.bg],
  ['outline control on the background', colors.borderStrong, colors.bg],
  ['outline control on a card', colors.borderStrong, colors.surface],
  ['outline control on a raised block', colors.borderStrong, colors.surfaceRaised],
  ['truck bed outline on the background', DIAGRAM_COLORS_FOR_TEST.hairline, colors.bg],
  ['truck bed outline on a card', DIAGRAM_COLORS_FOR_TEST.hairline, colors.surface],
];

test('interactive boundaries meet the 3:1 minimum for non-text UI', () => {
  const failures = BOUNDARY_PAIRS.filter(([, fg, bg]) => contrastRatio(fg, bg) < AA_LARGE).map(
    ([label, fg, bg]) => `${label}: ${contrastRatio(fg, bg).toFixed(2)}:1 (${fg} on ${bg})`,
  );
  assert.deepEqual(failures, [], `below the ${AA_LARGE}:1 minimum:\n  ${failures.join('\n  ')}`);
});

test('a card is distinguishable from the page behind it', () => {
  // Not a WCAG threshold — a design one. On a white ground the card tint is what
  // makes the layout readable, and "surface equals background" is a tempting
  // simplification that quietly flattens every screen into one sheet.
  assert.notEqual(colors.surface, colors.bg);
  assert.notEqual(colors.surfaceRaised, colors.surface);
});

test('the contrast maths matches the WCAG reference values', () => {
  // Anchors the formula itself, so a refactor cannot quietly make every pair pass.
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.equal(Math.round(contrastRatio('#767676', '#FFFFFF') * 10) / 10, 4.5);
});
