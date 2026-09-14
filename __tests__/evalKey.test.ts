import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanKey, describeKey, keyProblem } from '../scripts/eval/key';

/*
 * The eval asks for the vision key itself because setting it through the shell failed
 * in ways that all looked like "not set" or a bare 401. These pin what is taken off a
 * pasted key, what is refused, and that nothing describing a key ever quotes it.
 */

const KEY = `sk-ant-api03-${'Ab1_-'.repeat(19)}`;

test('a clean key passes through untouched', () => {
  const cleaned = cleanKey(KEY);
  assert.deepEqual(cleaned, { key: KEY, removed: 0, unexpected: 0 });
  assert.equal(keyProblem(cleaned), null);
});

test("a terminal's paste markers, line endings and edge spaces are wrapping, and come off", () => {
  const cleaned = cleanKey(`  \x1b[200~${KEY}\x1b[201~\r\n`);
  assert.equal(cleaned.key, KEY);
  assert.equal(cleaned.removed, 16);
  assert.equal(keyProblem(cleaned), null);
});

test('a character that could have been meant is refused, not repaired', () => {
  // A smart dash where a hyphen belongs, and a non-breaking space inside the key.
  const smart = cleanKey(KEY.replace('sk-ant', 'sk–ant'));
  assert.equal(smart.unexpected, 1);
  assert.match(keyProblem(smart)!, /1 character an API key never contains/);

  const nbsp = cleanKey(`${KEY.slice(0, 40)} ${KEY.slice(40)}`);
  assert.equal(nbsp.unexpected, 1);
  assert.notEqual(keyProblem(nbsp), null);
});

test('the wrong kind of key is named', () => {
  assert.match(keyProblem(cleanKey('sk-ant-admin01-abc'))!, /Admin key/);
  assert.match(keyProblem(cleanKey('sk-ant-oat01-abc'))!, /not a Console API key/);
  assert.match(keyProblem(cleanKey('   '))!, /No key was entered/);
});

test('nothing that describes a key quotes it', () => {
  for (const raw of [KEY, `\x1b[200~${KEY}\x1b[201~`, KEY.replace('sk-ant', 'sk–ant'), 'sk-ant-admin01-secretpart']) {
    const cleaned = cleanKey(raw);
    for (const text of [describeKey(cleaned), keyProblem(cleaned) ?? '']) {
      assert.doesNotMatch(text, /Ab1_-Ab1|secretpart/, text);
    }
  }
});
