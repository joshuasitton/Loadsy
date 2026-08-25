import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPhoto, type PhotoQualitySignals } from '../src/domain/photoQuality';

const good: PhotoQualitySignals = {
  brightness: 0.55,
  sharpness: 0.7,
  widthPx: 1920,
  heightPx: 1440,
  detectedItemCount: 6,
};

test('a good photo passes', () => {
  const verdict = assessPhoto(good);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.code, null);
});

test('a dark photo is rejected with an actionable reason', () => {
  const verdict = assessPhoto({ ...good, brightness: 0.05 });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'tooDark');
  assert.ok(verdict.message.length > 0);
});

test('a blurry photo is rejected', () => {
  assert.equal(assessPhoto({ ...good, sharpness: 0.1 }).code, 'tooBlurry');
});

test('a screenshot-sized image is rejected', () => {
  assert.equal(assessPhoto({ ...good, widthPx: 320, heightPx: 240 }).code, 'tooSmall');
});

test('HARD REQUIREMENT: zero detections never produce a silent empty inventory', () => {
  const verdict = assessPhoto({ ...good, detectedItemCount: 0 });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'noFurniture');
  // recoverable: the user can still add items by hand rather than hitting a dead end
  assert.equal(verdict.recoverable, true);
  assert.match(verdict.message, /by hand/i);
});

test('detection count is not checked before detection has run', () => {
  const { detectedItemCount, ...beforeDetection } = good;
  assert.equal(assessPhoto(beforeDetection).ok, true);
});

test('every rejection carries a title and a message the user can act on', () => {
  const rejections = [
    assessPhoto({ ...good, brightness: 0 }),
    assessPhoto({ ...good, sharpness: 0 }),
    assessPhoto({ ...good, widthPx: 100, heightPx: 100 }),
    assessPhoto({ ...good, detectedItemCount: 0 }),
  ];
  for (const verdict of rejections) {
    assert.equal(verdict.ok, false);
    assert.ok(verdict.title.length > 0, `${verdict.code} has no title`);
    assert.ok(verdict.message.length > 10, `${verdict.code} has no actionable message`);
  }
});

test('dimensions the picker never reported are unknown, not too small', () => {
  // iOS returns no width/height for some library assets and for iCloud originals
  // that have not downloaded. Coercing that to 0 failed the size gate, and
  // tooSmall is a BLOCKING verdict — so a perfectly good photo was rejected with
  // "try taking the photo with the camera instead" and no way forward.
  for (const missing of [{}, { widthPx: undefined, heightPx: undefined }]) {
    const verdict = assessPhoto({ ...good, ...missing, widthPx: undefined, heightPx: undefined });
    assert.equal(verdict.ok, true, `unknown dimensions were rejected as ${verdict.code}`);
  }

  // A half-known pair is still unknown — one axis cannot establish the other.
  assert.equal(assessPhoto({ ...good, widthPx: 4032, heightPx: undefined }).ok, true);
  assert.equal(assessPhoto({ ...good, widthPx: undefined, heightPx: 3024 }).ok, true);

  // And a genuinely small photo is still caught.
  assert.equal(assessPhoto({ ...good, widthPx: 100, heightPx: 100 }).code, 'tooSmall');
});

test('a rejection the user can act on is never marked unrecoverable', () => {
  // `recoverable: false` suppresses the manual-entry button on Screen 1, so any
  // verdict that blocks must be one a retake can actually fix.
  const blocking = [
    assessPhoto({ ...good, widthPx: 100, heightPx: 100 }),
    assessPhoto({ ...good, brightness: 0 }),
    assessPhoto({ ...good, sharpness: 0 }),
  ];
  for (const verdict of blocking) {
    assert.equal(verdict.recoverable, false, `${verdict.code} should block`);
    assert.match(verdict.message, /photo|camera|lights|focus/i, `${verdict.code} lacks a retake instruction`);
  }
  // Zero detections is the one the user cannot fix by retaking, so it must offer
  // the manual path instead.
  assert.equal(assessPhoto({ ...good, detectedItemCount: 0 }).recoverable, true);
});

test('unmeasured brightness and sharpness do not reject a good photo', () => {
  // capture.tsx passes these as undefined until on-device measurement exists.
  // Unknown must behave exactly like the size gate's unknown: skipped, not failed.
  const { brightness, sharpness, ...withoutSignals } = good;
  assert.equal(assessPhoto(withoutSignals).ok, true);
  assert.equal(assessPhoto({ ...withoutSignals, detectedItemCount: 3 }).ok, true);

  // And unknown must not mask a genuine rejection from another signal.
  assert.equal(assessPhoto({ ...withoutSignals, detectedItemCount: 0 }).code, 'noFurniture');
  assert.equal(assessPhoto({ ...withoutSignals, widthPx: 100, heightPx: 100 }).code, 'tooSmall');
});

test('a measured signal still fires once it exists', () => {
  // Guards the wiring: the gates must remain live for the day real measurement
  // lands, not be permanently disabled by the optional type.
  assert.equal(assessPhoto({ ...good, brightness: 0.05 }).code, 'tooDark');
  assert.equal(assessPhoto({ ...good, sharpness: 0.05 }).code, 'tooBlurry');
  // Zero is a real measurement, not a missing one.
  assert.equal(assessPhoto({ ...good, brightness: 0 }).code, 'tooDark');
  // NaN is not a measurement at all.
  assert.equal(assessPhoto({ ...good, brightness: NaN }).ok, true);
});
