import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCues, resolveDecision, confirmDecision, releaseManualMatch, releaseSeparate, candidatesFor,
  MAX_ELIGIBLE_EDGES } from '../public/js/core/match.js';
import { cue } from '../scripts/fixtures.mjs';

const pair = (mainCueIndex, secondaryCueIndex) => ({ type: 'pair', mainCueIndex, secondaryCueIndex });
const keep = (side, cueIndex) => ({ type: 'keep-separate', side, cueIndex });
const accept = (analysis, decision) => {
  const value = resolveDecision(analysis, decision);
  return value.kind === 'applied' ? value.analysis : confirmDecision(analysis, value.pending, true);
};
function exactlyOnce(result, mainCount, secondaryCount) {
  const main = result.outputCues.flatMap(cue => cue.origin.mainCueIndex === null ? [] : [cue.origin.mainCueIndex]).sort((a, b) => a - b);
  const secondary = result.outputCues.flatMap(cue => cue.origin.secondaryCueIndex === null ? [] : [cue.origin.secondaryCueIndex]).sort((a, b) => a - b);
  assert.deepEqual(main, Array.from({ length: mainCount }, (_, i) => i));
  assert.deepEqual(secondary, Array.from({ length: secondaryCount }, (_, i) => i));
}
test('AC07 full independent oracle result', () => {
  assert.deepEqual(matchCues([cue(0, 0, 2000, 'A')], [cue(0, 500, 2000, 'B')]), {
    schemaVersion: 1, jobId: 'job-1', status: 'ready', mainCueCount: 1, secondaryCueCount: 1,
    matches: [{ mainCueIndex: 0, secondaryCueIndex: 0, intersectionMs: 1500, unionMs: 2000,
      iou: { numerator: 3, denominator: 4 }, kind: 'automatic' }], ambiguous: [],
    unmatchedMain: [], unmatchedSecondary: [], keptSeparateMain: [], keptSeparateSecondary: [],
    outputCues: [{ startMs: 0, endMs: 2000, lines: ['A', 'B'], origin: { mainCueIndex: 0, secondaryCueIndex: 0 } }]
  });
});
test('AC08 boundary is exact, no near-match rounding', () => {
  assert.equal(matchCues([cue(0, 0, 2000)], [cue(0, 0, 1000)]).matches.length, 1);
  const below = matchCues([cue(0, 0, 2000)], [cue(0, 0, 999)]);
  assert.deepEqual(below.unmatchedMain, [0]); assert.deepEqual(below.unmatchedSecondary, [0]);
});
test('AC09 equal best secondary cues require review; exact candidate sorting', () => {
  const result = matchCues([cue(0, 0, 1000)], [cue(0, 0, 800), cue(1, 0, 1000), cue(2, 0, 1000), cue(3, 2000, 3000)]);
  assert.equal(result.status, 'review'); assert.deepEqual(result.matches, []); assert.deepEqual(result.outputCues, []);
  assert.deepEqual(candidatesFor(result, 'main', 0).map(edge => [edge.secondaryCueIndex, edge.iou]), [
    [1, { numerator: 1, denominator: 1 }], [2, { numerator: 1, denominator: 1 }],
    [0, { numerator: 4, denominator: 5 }], [3, { numerator: 0, denominator: 1 }]
  ]);
  for (const edge of result.ambiguous) assert.deepEqual(edge.reasons, ['main-tie', 'non-mutual']);
});
test('AC10 stronger mutual match wins while weaker non-mutual remains ambiguous', () => {
  const result = matchCues([cue(0, 0, 1000), cue(1, 0, 800)], [cue(0, 0, 1000)]);
  assert.deepEqual(result.matches.map(edge => [edge.mainCueIndex, edge.secondaryCueIndex]), [[0, 0]]);
  assert.deepEqual(result.ambiguous, [{ mainCueIndex: 1, secondaryCueIndex: 0, intersectionMs: 800, unionMs: 1000,
    iou: { numerator: 4, denominator: 5 }, reasons: ['non-mutual'] }]);
  assert.equal(result.status, 'review'); assert.deepEqual(result.outputCues, []);
});
test('AC11 equal-best competition never resolves by traversal order', () => {
  const result = matchCues([cue(0, 0, 1000), cue(1, 0, 1000)], [cue(0, 0, 1000)]);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.ambiguous.map(edge => edge.reasons), [['secondary-tie', 'non-mutual'], ['secondary-tie', 'non-mutual']]);
});
test('AC12 all disjoint cues remain independent', () => {
  const result = matchCues([cue(0, 0, 1000)], [cue(0, 1000, 2000)]);
  assert.deepEqual(result.unmatchedMain, [0]); assert.deepEqual(result.unmatchedSecondary, [0]);
  exactlyOnce(result, 1, 1);
});
test('AC13 fixed manual pairs are one-to-one and cannot be overwritten', () => {
  let result = matchCues([cue(0, 0, 1000), cue(1, 0, 1000)], [cue(0, 0, 1000), cue(1, 0, 1000)]);
  result = accept(result, pair(0, 0));
  assert.throws(() => resolveDecision(result, pair(0, 1)), { code: 'MATCH_CONFLICT' });
  assert.throws(() => resolveDecision(result, keep('secondary', 0)), { code: 'MATCH_CONFLICT' });
  assert.deepEqual(result.matches.map(edge => edge.kind), ['manual', 'automatic']);
});
test('AC28 exactly 50,000 eligible edges accepted', () => {
  let comparisons = 0;
  const result = matchCues(Array.from({ length: 250 }, (_, i) => cue(i, 0, 1000)),
    Array.from({ length: 200 }, (_, i) => cue(i, 0, 1000)), { onComparison: n => { comparisons = n; } });
  assert.equal(MAX_ELIGIBLE_EDGES, 50_000); assert.equal(comparisons, 50_000);
  assert.equal(result.ambiguous.length, 50_000); assert.equal(result.status, 'review'); assert.deepEqual(result.outputCues, []);
  assert.equal(new Set(result.ambiguous.map(edge => `${edge.mainCueIndex}:${edge.secondaryCueIndex}`)).size, 50_000);
});
test('AC28 50,001 stops pair scan immediately, zero partial arrays', () => {
  let comparisons = 0;
  const result = matchCues(Array.from({ length: 250 }, (_, i) => cue(i, 0, 1000)),
    Array.from({ length: 201 }, (_, i) => cue(i, 0, 1000)), { onComparison: n => { comparisons = n; } });
  assert.equal(comparisons, 50_001); assert.equal(result.status, 'error');
  assert.deepEqual(result.error, { code: 'CANDIDATE_LIMIT', fileIndex: null, offset: null, messageKey: 'shorten-subtitles-and-retry' });
  for (const field of ['matches', 'ambiguous', 'unmatchedMain', 'unmatchedSecondary', 'keptSeparateMain', 'keptSeparateSecondary', 'outputCues']) assert.deepEqual(result[field], []);
});
test('cancellation checked before pair 1 and at least every 1024 comparisons', () => {
  let scans = 0, checks = 0;
  const result = matchCues(Array.from({ length: 40 }, (_, i) => cue(i, i * 2000, i * 2000 + 1000)),
    Array.from({ length: 40 }, (_, i) => cue(i, 100_000 + i * 2000, 101_000 + i * 2000)),
    { onComparison: n => { scans = n; }, isCanceled: () => ++checks === 2 });
  assert.equal(scans, 1024); assert.equal(checks, 2); assert.equal(result.error.code, 'CANCELED');
  assert.equal(matchCues([], [], { isCanceled: () => true }).error.code, 'CANCELED');
});
test('AC29 reasons exactly main-tie, secondary-tie, non-mutual; keep-separate persists', () => {
  let result = matchCues([cue(0, 0, 1000, 'A'), cue(1, 0, 1000, 'B')], [cue(0, 0, 1000, 'X'), cue(1, 0, 1000, 'Y')]);
  assert.equal(result.ambiguous.length, 4);
  for (const edge of result.ambiguous) assert.deepEqual(edge.reasons, ['main-tie', 'secondary-tie', 'non-mutual']);
  result = accept(result, keep('main', 0));
  assert.deepEqual(result.keptSeparateMain, [0]);
  result = accept(result, pair(1, 0));
  assert.equal(result.status, 'ready'); assert.deepEqual(result.unmatchedSecondary, [1]); exactlyOnce(result, 2, 2);
  assert.throws(() => resolveDecision(result, pair(0, 1)), { code: 'MATCH_CONFLICT' });
  result = releaseSeparate(result, 'main', 0);
  assert.equal(result.matches.find(edge => edge.mainCueIndex === 1).kind, 'manual');
});
test('AC30 replacing A-X with B-X returns A to full residual graph; cancel identical', () => {
  const initial = matchCues([cue(0, 0, 1000, 'A'), cue(1, 0, 800, 'B')],
    [cue(0, 0, 1000, 'X'), cue(1, 0, 600, 'Y'), cue(2, 0, 600, 'Z')]);
  const saved = structuredClone(initial);
  const first = resolveDecision(initial, pair(1, 0));
  assert.equal(first.kind, 'confirmation-required'); assert.strictEqual(first.analysis, initial);
  assert.deepEqual(first.pending.reasons, ['replace-automatic-match']);
  assert.deepEqual(first.pending.replacedAutomaticMatches.map(edge => [edge.mainCueIndex, edge.secondaryCueIndex]), [[0, 0]]);
  assert.deepEqual(first.pending.releasedMain, [0]); assert.deepEqual(first.pending.releasedSecondary, []);
  assert.strictEqual(confirmDecision(initial, first.pending, false), initial); assert.deepEqual(initial, saved);
  const second = resolveDecision(initial, pair(1, 0));
  let result = confirmDecision(initial, second.pending, true);
  assert.deepEqual(result.matches.map(edge => [edge.mainCueIndex, edge.secondaryCueIndex, edge.kind]), [[1, 0, 'manual']]);
  assert.deepEqual(result.ambiguous, [
    { mainCueIndex: 0, secondaryCueIndex: 1, intersectionMs: 600, unionMs: 1000, iou: { numerator: 3, denominator: 5 }, reasons: ['main-tie', 'non-mutual'] },
    { mainCueIndex: 0, secondaryCueIndex: 2, intersectionMs: 600, unionMs: 1000, iou: { numerator: 3, denominator: 5 }, reasons: ['main-tie', 'non-mutual'] }
  ]);
  assert.equal(result.status, 'review'); assert.deepEqual(result.outputCues, []);
  result = accept(result, keep('main', 0));
  assert.equal(result.status, 'ready'); assert.deepEqual(result.unmatchedSecondary, [1, 2]);
  assert.equal(result.matches[0].kind, 'manual'); exactlyOnce(result, 2, 3);
});
test('AC31 2/5 override confirmation, cancellation, fixed result, release', () => {
  const initial = matchCues([cue(0, 0, 1000, 'M')], [cue(0, 0, 400, 'S')]);
  assert.equal(initial.outputCues.length, 2);
  let proposal = resolveDecision(initial, pair(0, 0));
  assert.deepEqual(proposal.pending.exactIou, { numerator: 2, denominator: 5 });
  assert.deepEqual(proposal.pending.reasons, ['below-threshold']);
  assert.strictEqual(confirmDecision(initial, proposal.pending, false), initial);
  proposal = resolveDecision(initial, pair(0, 0));
  const result = confirmDecision(initial, proposal.pending, true);
  assert.equal(result.matches[0].kind, 'manual-override');
  assert.deepEqual(result.outputCues, [{ startMs: 0, endMs: 1000, lines: ['M', 'S'], origin: { mainCueIndex: 0, secondaryCueIndex: 0 } }]);
  assert.deepEqual(releaseManualMatch(result, 0, 0), initial);
});
test('AC32 ready automatic pair can be kept separate; released X becomes unmatched', () => {
  const initial = matchCues([cue(0, 0, 1000, 'A')], [cue(0, 0, 1000, 'X')]);
  let proposal = resolveDecision(initial, keep('main', 0));
  assert.deepEqual(proposal.pending.releasedMain, []); assert.deepEqual(proposal.pending.releasedSecondary, [0]);
  assert.strictEqual(confirmDecision(initial, proposal.pending, false), initial);
  proposal = resolveDecision(initial, keep('main', 0));
  let result = confirmDecision(initial, proposal.pending, true);
  assert.equal(result.status, 'ready'); assert.deepEqual(result.matches, []);
  assert.deepEqual(result.keptSeparateMain, [0]); assert.deepEqual(result.unmatchedSecondary, [0]);
  exactlyOnce(result, 1, 1);
  result = accept(result, keep('secondary', 0));
  assert.deepEqual(result.keptSeparateMain, [0]); assert.deepEqual(result.keptSeparateSecondary, [0]); exactlyOnce(result, 1, 1);
});
test('both conflicting automatic pairs and below-threshold share one confirmation', () => {
  const initial = matchCues([cue(0, 0, 1000), cue(1, 2000, 3000)], [cue(0, 0, 1000), cue(1, 2000, 3000)]);
  const proposal = resolveDecision(initial, pair(0, 1));
  assert.deepEqual(proposal.pending.reasons, ['replace-automatic-match', 'below-threshold']);
  assert.deepEqual(proposal.pending.releasedMain, [1]); assert.deepEqual(proposal.pending.releasedSecondary, [0]);
  assert.equal(proposal.pending.replacedAutomaticMatches.length, 2);
  const result = confirmDecision(initial, proposal.pending, true); exactlyOnce(result, 2, 2);
});
test('stale or replayed confirmation cannot overwrite newer analysis', () => {
  const initial = matchCues([cue(0, 0, 1000)], [cue(0, 0, 400)]);
  const proposal = resolveDecision(initial, pair(0, 0));
  const newer = accept(initial, keep('main', 0));
  assert.strictEqual(confirmDecision(newer, proposal.pending, true), newer);
  const accepted = confirmDecision(initial, proposal.pending, true);
  assert.strictEqual(confirmDecision(accepted, proposal.pending, true), accepted);
});
