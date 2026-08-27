import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  signInWithGoogle,
  signInWithPassword,
} from '../src/auth/demoCredentials';

/**
 * The demo sign-in is not security and is not tested as though it were. What is
 * worth pinning down is that it behaves the same way every time it is shown to
 * somebody: the documented pair works, near-misses a phone keyboard will produce
 * still work, and a wrong password does not.
 */

test('the documented demo pair signs in', () => {
  const result = signInWithPassword(DEMO_EMAIL, DEMO_PASSWORD);
  assert.equal(result.ok, true);
  assert.equal(result.user.email, DEMO_EMAIL);
  assert.equal(result.user.provider, 'password');
});

test('the email is forgiving about case and surrounding space', () => {
  // A phone keyboard capitalises the first letter, and a paste brings a trailing
  // space. Either rejecting the demo account in front of an audience is a
  // self-inflicted wound.
  for (const typed of [
    DEMO_EMAIL.toUpperCase(),
    `  ${DEMO_EMAIL}  `,
    DEMO_EMAIL.charAt(0).toUpperCase() + DEMO_EMAIL.slice(1),
  ]) {
    assert.equal(signInWithPassword(typed, DEMO_PASSWORD).ok, true, `rejected "${typed}"`);
  }
});

test('the password is compared exactly', () => {
  for (const wrong of [
    DEMO_PASSWORD.toUpperCase(),
    ` ${DEMO_PASSWORD}`,
    `${DEMO_PASSWORD} `,
    `${DEMO_PASSWORD}x`,
  ]) {
    assert.equal(signInWithPassword(DEMO_EMAIL, wrong).ok, false, `accepted "${wrong}"`);
  }
});

test('a wrong email and a wrong password give the same message', () => {
  // Which half was wrong is not the user's business, even here. The habit is
  // what matters; the shape of this answer is the part that survives into real auth.
  const badEmail = signInWithPassword('someone@else.com', DEMO_PASSWORD);
  const badPassword = signInWithPassword(DEMO_EMAIL, 'not-the-password');
  assert.equal(badEmail.ok, false);
  assert.equal(badPassword.ok, false);
  assert.equal(badEmail.reason, badPassword.reason);
});

test('empty fields ask for the fields rather than claiming a mismatch', () => {
  const empty = signInWithPassword('', '');
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /Enter the demo email and password/);
});

test('the Google button signs in and says which provider it was', () => {
  // It never contacts Google. The provider is recorded honestly so any surface
  // that reports how the session started cannot claim otherwise.
  const result = signInWithGoogle();
  assert.equal(result.ok, true);
  assert.equal(result.user.provider, 'google');
});
