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
