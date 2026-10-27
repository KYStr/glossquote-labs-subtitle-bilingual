import test from 'node:test';
import assert from 'node:assert/strict';
import { intersectionMs, unionMs, normalizeRatio, compareRatio, eligible } from '../public/js/core/iou.js';
import { cue } from '../scripts/fixtures.mjs';

test('AC07 exact 1500/2000 becomes 3/4', () => {
  const a = cue(0, 0, 2000), b = cue(0, 500, 2000);
  assert.equal(intersectionMs(a, b), 1500); assert.equal(unionMs(a, b), 2000);
  assert.deepEqual(normalizeRatio(1500, 2000), { numerator: 3, denominator: 4 });
});
test('AC08 exact threshold and one millisecond below', () => {
  assert.equal(eligible(cue(0, 0, 2000), cue(0, 0, 1000)), true);
  assert.equal(eligible(cue(0, 0, 2000), cue(0, 0, 999)), false);
});
test('half-open adjacency and disjoint intervals have zero intersection', () => {
  const a = cue(0, 0, 1000), b = cue(0, 1000, 2000);
  assert.equal(intersectionMs(a, b), 0); assert.equal(unionMs(a, b), 2000);
  assert.deepEqual(normalizeRatio(0, 2000), { numerator: 0, denominator: 1 });
});
test('BigInt products distinguish ratios beyond double product precision', () => {
  assert.equal(compareRatio({ numerator: 9_007_199_254_740_989, denominator: 9_007_199_254_740_990 },
    { numerator: 9_007_199_254_740_990, denominator: 9_007_199_254_740_991 }), -1);
  assert.equal(compareRatio({ numerator: 3, denominator: 4 }, { numerator: 6, denominator: 8 }), 0);
  assert.equal(compareRatio({ numerator: 2, denominator: 3 }, { numerator: 1, denominator: 2 }), 1);
});
test('maximum profile durations stay safe and reduce precisely', () => {
  const a = cue(0, 0, 359_999_999_999_999), b = cue(0, 1, 359_999_999_999_999);
  assert.deepEqual(normalizeRatio(intersectionMs(a, b), unionMs(a, b)), { numerator: 359_999_999_999_998, denominator: 359_999_999_999_999 });
});
test('invalid ratio integers are rejected', () => {
  for (const [a, b] of [[1, 0], [-1, 2], [0.5, 1], [1, Infinity], [NaN, 1]]) assert.throws(() => normalizeRatio(a, b));
});
