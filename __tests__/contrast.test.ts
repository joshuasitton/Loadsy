import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AA_LARGE, AA_TEXT, contrastRatio } from '../src/ui/contrast';
import { colors } from '../src/ui/theme';
import { STEP_COLORS_FOR_TEST } from '../src/truckmap/renderSvg';

/**
 * Every text pair the app actually renders, checked against WCAG AA.
 *
 * Five of these shipped below AA — including the PrimaryButton label at 3.30:1 and
 * the affiliate disclosure at 3.21:1, which is a commitment made in APP_STORE.md.
 * Contrast is easy to break with a well-meant colour tweak, so it is pinned here.
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

test('interactive boundaries meet the 3:1 minimum for non-text UI', () => {
  // WCAG 1.4.11: a control's boundary has to be distinguishable from its surround.
  assert.ok(
    contrastRatio(colors.accent, colors.bg) >= AA_LARGE,
    `accent boundary on background is ${contrastRatio(colors.accent, colors.bg).toFixed(2)}:1`,
  );
});

test('the contrast maths matches the WCAG reference values', () => {
  // Anchors the formula itself, so a refactor cannot quietly make every pair pass.
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.equal(Math.round(contrastRatio('#767676', '#FFFFFF') * 10) / 10, 4.5);
});
