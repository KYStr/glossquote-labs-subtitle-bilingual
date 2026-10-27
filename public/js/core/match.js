import { measure, compareRatio } from './iou.js';
import { buildOutput } from './merge.js';

export const MAX_ELIGIBLE_EDGES = 50_000;
const contexts = new WeakMap();
const proposals = new WeakMap();
const key = edge => `${edge.mainCueIndex}:${edge.secondaryCueIndex}`;
const half = { numerator: 1, denominator: 2 };
const conflict = () => { const error = new Error('MATCH_CONFLICT'); error.code = 'MATCH_CONFLICT'; throw error; };
const sorted = values => [...values].sort((a, b) => a - b);

export function errorResult(jobId, code, fileIndex = null, offset = null) {
  return {
    schemaVersion: 1, jobId, status: 'error',
    error: { code, fileIndex, offset, messageKey: code === 'CANDIDATE_LIMIT' ? 'shorten-subtitles-and-retry' : code },
    matches: [], ambiguous: [], unmatchedMain: [], unmatchedSecondary: [],
    keptSeparateMain: [], keptSeparateSecondary: [], outputCues: []
  };
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateCues(cues) {
  return Array.isArray(cues) && cues.length <= 3000 && cues.every((cue, i) =>
    cue?.sourceIndex === i && Number.isSafeInteger(cue.startMs) && cue.startMs >= 0 &&
    Number.isSafeInteger(cue.endMs) && cue.endMs > cue.startMs && cue.endMs <= 359_999_999_999_999 &&
    Array.isArray(cue.textLines) && cue.textLines.length && cue.textLines.every(line =>
      typeof line === 'string' && line.trim() && !/[\r\n]/.test(line)));
}

function bestEdges(edges, field, count) {
  const best = Array.from({ length: count }, () => ({ edge: null, ties: 0 }));
  for (const edge of edges) {
    const value = best[edge[field]];
    const compare = value.edge ? compareRatio(edge.iou, value.edge.iou) : 1;
    if (compare > 0) { value.edge = edge; value.ties = 1; }
    else if (compare === 0) value.ties++;
  }
  return best;
}

function analyze(context) {
  const { main, secondary, fixed, keptMain, keptSecondary, excludedMain, excludedSecondary } = context;
  const usedMain = new Set([...keptMain, ...excludedMain, ...fixed.map(edge => edge.mainCueIndex)]);
  const usedSecondary = new Set([...keptSecondary, ...excludedSecondary, ...fixed.map(edge => edge.secondaryCueIndex)]);
  // Always start from the full original graph; previous automatic pairs are proposals.
  const residual = context.edges.filter(edge => !usedMain.has(edge.mainCueIndex) && !usedSecondary.has(edge.secondaryCueIndex));
  const bestMain = bestEdges(residual, 'mainCueIndex', main.length);
  const bestSecondary = bestEdges(residual, 'secondaryCueIndex', secondary.length);
  const automatic = [];
  const ambiguous = [];
  for (const edge of residual) {
    const a = bestMain[edge.mainCueIndex];
    const b = bestSecondary[edge.secondaryCueIndex];
    const mutual = a.ties === 1 && b.ties === 1 && a.edge === edge && b.edge === edge;
    if (mutual) automatic.push({ ...edge, kind: 'automatic' });
    else {
      const reasons = [];
      if (a.ties > 1) reasons.push('main-tie');
      if (b.ties > 1) reasons.push('secondary-tie');
      reasons.push('non-mutual');
      ambiguous.push({ ...edge, reasons });
    }
  }
  ambiguous.sort((a, b) => compareRatio(b.iou, a.iou) || a.mainCueIndex - b.mainCueIndex || a.secondaryCueIndex - b.secondaryCueIndex);
  const unmatchedMain = main.filter(cue => !usedMain.has(cue.sourceIndex) && bestMain[cue.sourceIndex].edge === null).map(cue => cue.sourceIndex);
  const unmatchedSecondary = secondary.filter(cue => !usedSecondary.has(cue.sourceIndex) && bestSecondary[cue.sourceIndex].edge === null).map(cue => cue.sourceIndex);
  const matches = [...fixed, ...automatic].sort((a, b) => a.mainCueIndex - b.mainCueIndex || a.secondaryCueIndex - b.secondaryCueIndex);
  const result = {
    schemaVersion: 1, jobId: context.jobId, status: ambiguous.length ? 'review' : 'ready',
    mainCueCount: main.length, secondaryCueCount: secondary.length, matches, ambiguous,
    unmatchedMain, unmatchedSecondary, keptSeparateMain: sorted(keptMain), keptSeparateSecondary: sorted(keptSecondary),
    outputCues: ambiguous.length ? [] : buildOutput(main, secondary, matches, unmatchedMain, unmatchedSecondary, sorted(keptMain), sorted(keptSecondary))
  };
  contexts.set(result, context);
  return freeze(result);
}

export function matchCues(main, secondary, options = {}) {
  const jobId = options.jobId ?? 'job-1';
  if (!validateCues(main) || !validateCues(secondary)) return errorResult(jobId, 'INVALID_SRT');
  const edges = [];
  let comparisons = 0;
  for (const a of main) {
    for (const b of secondary) {
      if (comparisons % 1024 === 0 && options.isCanceled?.()) return errorResult(jobId, 'CANCELED');
      comparisons++;
      options.onComparison?.(comparisons);
      const stats = measure(a, b);
      if (compareRatio(stats.iou, half) < 0) continue;
      if (edges.length === MAX_ELIGIBLE_EDGES) return errorResult(jobId, 'CANDIDATE_LIMIT');
      edges.push({ mainCueIndex: a.sourceIndex, secondaryCueIndex: b.sourceIndex, ...stats });
    }
  }
  if (options.isCanceled?.()) return errorResult(jobId, 'CANCELED');
  return analyze({ main: freeze(structuredClone(main)), secondary: freeze(structuredClone(secondary)),
    edges: freeze(edges), jobId, fixed: [], keptMain: new Set(), keptSecondary: new Set(), excludedMain: new Set(), excludedSecondary: new Set() });
}

function contextFor(analysis) {
  const context = contexts.get(analysis);
  if (!context) conflict();
  return context;
}

function checkIndex(context, side, index) {
  if (!['main', 'secondary'].includes(side) || !Number.isInteger(index) || !context[side][index]) conflict();
}

function isFixed(context, side, index) {
  return (side === 'main' ? context.keptMain : context.keptSecondary).has(index) ||
    (side === 'main' ? context.excludedMain : context.excludedSecondary).has(index) ||
    context.fixed.some(edge => edge[`${side}CueIndex`] === index);
}

function apply(context, decision) {
  if (decision.type === 'pair') {
    const stats = measure(context.main[decision.mainCueIndex], context.secondary[decision.secondaryCueIndex]);
    return analyze({ ...context, fixed: [...context.fixed, { mainCueIndex: decision.mainCueIndex,
      secondaryCueIndex: decision.secondaryCueIndex, ...stats,
      kind: compareRatio(stats.iou, half) < 0 ? 'manual-override' : 'manual' }] });
  }
  const field = decision.side === 'main' ? 'keptMain' : 'keptSecondary';
  return analyze({ ...context, [field]: new Set([...context[field], decision.cueIndex]) });
}

export function resolveDecision(analysis, decision) {
  const context = contextFor(analysis);
  let replaced;
  let stats;
  if (decision?.type === 'pair') {
    checkIndex(context, 'main', decision.mainCueIndex);
    checkIndex(context, 'secondary', decision.secondaryCueIndex);
    if (isFixed(context, 'main', decision.mainCueIndex) || isFixed(context, 'secondary', decision.secondaryCueIndex)) conflict();
    replaced = analysis.matches.filter(edge => edge.kind === 'automatic' &&
      (edge.mainCueIndex === decision.mainCueIndex || edge.secondaryCueIndex === decision.secondaryCueIndex));
    stats = measure(context.main[decision.mainCueIndex], context.secondary[decision.secondaryCueIndex]);
  } else if (decision?.type === 'keep-separate') {
    checkIndex(context, decision.side, decision.cueIndex);
    if (isFixed(context, decision.side, decision.cueIndex)) conflict();
    replaced = analysis.matches.filter(edge => edge.kind === 'automatic' && edge[`${decision.side}CueIndex`] === decision.cueIndex);
  } else conflict();
  const reasons = [];
  if (replaced.length) reasons.push('replace-automatic-match');
  if (stats && compareRatio(stats.iou, half) < 0) reasons.push('below-threshold');
  if (!reasons.length) return { kind: 'applied', analysis: apply(context, decision) };
  const mainSelected = decision.type === 'pair' ? decision.mainCueIndex : decision.side === 'main' ? decision.cueIndex : null;
  const secondarySelected = decision.type === 'pair' ? decision.secondaryCueIndex : decision.side === 'secondary' ? decision.cueIndex : null;
  const pending = freeze({ jobId: analysis.jobId, decision: structuredClone(decision), reasons,
    replacedAutomaticMatches: replaced, releasedMain: sorted(new Set(replaced.filter(edge => edge.mainCueIndex !== mainSelected).map(edge => edge.mainCueIndex))),
    releasedSecondary: sorted(new Set(replaced.filter(edge => edge.secondaryCueIndex !== secondarySelected).map(edge => edge.secondaryCueIndex))),
    ...(stats ? { exactIou: stats.iou } : {}) });
  proposals.set(pending, analysis);
  return { kind: 'confirmation-required', pending, analysis };
}

export function confirmDecision(analysis, pending, accepted) {
  // An old confirmation can never be applied to a newer analysis, even in the same job.
  if (proposals.get(pending) !== analysis || pending.jobId !== analysis.jobId) return analysis;
  proposals.delete(pending);
  if (!accepted) return analysis;
  return apply(contextFor(analysis), pending.decision);
}

export function releaseManualMatch(analysis, mainCueIndex, secondaryCueIndex) {
  const context = contextFor(analysis);
  if (!context.fixed.some(edge => key(edge) === `${mainCueIndex}:${secondaryCueIndex}`)) conflict();
  return analyze({ ...context, fixed: context.fixed.filter(edge => key(edge) !== `${mainCueIndex}:${secondaryCueIndex}`) });
}

export function releaseSeparate(analysis, side, index) {
  const context = contextFor(analysis);
  checkIndex(context, side, index);
  const field = side === 'main' ? 'keptMain' : 'keptSecondary';
  if (!context[field].has(index)) conflict();
  const next = new Set(context[field]); next.delete(index);
  return analyze({ ...context, [field]: next });
}

export function excludeCue(analysis, side, index) {
  const context = contextFor(analysis);
  checkIndex(context, side, index);
  const excludedField = side === 'main' ? 'excludedMain' : 'excludedSecondary';
  const keptField = side === 'main' ? 'keptMain' : 'keptSecondary';
  const kept = new Set(context[keptField]); kept.delete(index);
  return analyze({ ...context, [excludedField]: new Set([...context[excludedField], index]), [keptField]: kept,
    fixed: context.fixed.filter(edge => edge[`${side}CueIndex`] !== index) });
}

export function restoreExcluded(analysis, side, index) {
  const context = contextFor(analysis);
  checkIndex(context, side, index);
  const field = side === 'main' ? 'excludedMain' : 'excludedSecondary';
  const next = new Set(context[field]); next.delete(index);
  return analyze({ ...context, [field]: next });
}

export function getExcluded(analysis) {
  const context = contextFor(analysis);
  return { main: sorted(context.excludedMain), secondary: sorted(context.excludedSecondary) };
}

export function candidatesFor(analysis, side, cueIndex) {
  const context = contextFor(analysis);
  checkIndex(context, side, cueIndex);
  const opposite = side === 'main' ? 'secondary' : 'main';
  if (isFixed(context, side, cueIndex)) return [];
  return context[opposite].filter(cue => !isFixed(context, opposite, cue.sourceIndex)).map(cue => {
    const mainCueIndex = side === 'main' ? cueIndex : cue.sourceIndex;
    const secondaryCueIndex = side === 'secondary' ? cueIndex : cue.sourceIndex;
    return { mainCueIndex, secondaryCueIndex, ...measure(context.main[mainCueIndex], context.secondary[secondaryCueIndex]) };
  }).sort((a, b) => compareRatio(b.iou, a.iou) || a[`${opposite}CueIndex`] - b[`${opposite}CueIndex`]);
}
