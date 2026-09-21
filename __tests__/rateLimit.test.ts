import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clientKey,
  PER_CLIENT,
  PER_INSTANCE,
  SlidingWindow,
  UNKNOWN_CLIENT,
} from '../src/vision/rateLimit';

/**
 * What bounds one client's spend on the vision model, until App Attest does it properly.
 */

const RULE = { limit: 3, windowMs: 1_000 };

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

test('a client gets the limit, then is refused with the time until the next slot', () => {
  const window = new SlidingWindow(RULE);
  assert.deepEqual(window.take('a', 0), { ok: true });
  assert.deepEqual(window.take('a', 100), { ok: true });
  assert.deepEqual(window.take('a', 200), { ok: true });
  // The fourth is refused, and the wait is until the first attempt leaves the window.
  assert.deepEqual(window.take('a', 300), { ok: false, retryAfterMs: 700 });
});

test('the window slides: an old attempt expiring frees one slot, not the whole limit', () => {
  const window = new SlidingWindow(RULE);
  window.take('a', 0);
  window.take('a', 500);
  window.take('a', 900);
  assert.equal(window.take('a', 999).ok, false);
  // At 1001 the attempt at 0 has expired; exactly one slot is free.
  assert.equal(window.take('a', 1001).ok, true);
  assert.deepEqual(window.take('a', 1002), { ok: false, retryAfterMs: 498 });
});

test('a refused attempt is not counted, so retrying does not lengthen the wait', () => {
  // The failure this pins: a client at the limit that retries every second would
  // otherwise never get back in, because each refusal would be logged as an attempt.
  const window = new SlidingWindow(RULE);
  for (let at = 0; at < 3; at += 1) window.take('a', at);
  assert.deepEqual(window.take('a', 500), { ok: false, retryAfterMs: 500 });
  assert.deepEqual(window.take('a', 800), { ok: false, retryAfterMs: 200 });
  // The retries at 500 and 800 left no trace: the attempt at 0 expires on time.
  assert.equal(window.take('a', 999).ok, false);
  assert.equal(window.take('a', 1000).ok, true);
});

test('clients are counted apart', () => {
  const window = new SlidingWindow(RULE);
  for (let at = 0; at < 3; at += 1) window.take('a', at);
  assert.equal(window.take('a', 10).ok, false);
  assert.equal(window.take('b', 10).ok, true);
});

test('idle clients are forgotten once the map grows, and busy ones are kept', () => {
  const window = new SlidingWindow(RULE);
  for (let i = 0; i < 1_200; i += 1) window.take(`idle-${i}`, 0);
  // Nothing has expired yet, so growing past the threshold sweeps nothing away.
  assert.equal(window.size, 1_200);
  // The first attempt after they all expire sweeps them, and keeps itself.
  window.take('busy', 5_000);
  assert.equal(window.size, 1);
  assert.equal(window.take('busy', 5_001).ok, true);
});

test('the client is the first forwarded address, or one shared bucket', () => {
  assert.equal(clientKey(headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9');
  assert.equal(clientKey(headers({ 'x-forwarded-for': ' 203.0.113.9 ' })), '203.0.113.9');
  assert.equal(clientKey(headers({ 'cf-connecting-ip': '198.51.100.4' })), '198.51.100.4');
  assert.equal(clientKey(headers({ 'x-real-ip': '198.51.100.5' })), '198.51.100.5');
  // Forwarded wins over the others when both are present.
  assert.equal(
    clientKey(headers({ 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '198.51.100.5' })),
    '203.0.113.9',
  );
  // No address at all is not "unlimited"; it is one bucket everyone unidentified shares.
  assert.equal(clientKey(headers({})), UNKNOWN_CLIENT);
  assert.equal(clientKey(headers({ 'x-forwarded-for': ' , ' })), UNKNOWN_CLIENT);
});

test('the shipped limits are sized for a person, and the instance cap is the larger', () => {
  // A move is a handful of photo sets plus retries. If someone lowers this under a
  // realistic move, real users get refused; if someone raises it past a script's
  // appetite, the spend limit is the only thing left.
  assert.equal(PER_CLIENT.limit >= 10 && PER_CLIENT.limit <= 30, true);
  assert.equal(PER_CLIENT.windowMs, 15 * 60_000);
  assert.equal(PER_INSTANCE.limit > PER_CLIENT.limit, true);
  assert.equal(PER_INSTANCE.windowMs, PER_CLIENT.windowMs);
});
