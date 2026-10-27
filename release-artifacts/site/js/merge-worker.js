import { parseSrt } from './core/parse-srt.js';
import { matchCues, resolveDecision, confirmDecision, releaseManualMatch, releaseSeparate,
  excludeCue, restoreExcluded, getExcluded, candidatesFor, errorResult } from './core/match.js';

// This transport-neutral session is also tested in Node; browser execution is a separate gate.
export function createWorkerSession(post) {
  let analysis = null;
  let sources = null;
  let pending = null;
  let serial = 0;
  let jobId = null;
  function result() {
    post({ type: 'result', jobId, result: analysis, sources, excluded: getExcluded(analysis) });
  }
  function clear() { analysis = null; sources = null; pending = null; jobId = null; }
  function receive(data) {
    if (data?.type === 'run') {
      clear();
      jobId = typeof data.jobId === 'string' ? data.jobId : '';
      try {
        const parsed = [];
        for (let index = 0; index < 2; index++) {
          post({ type: 'progress', jobId, stage: 'parsing', fileIndex: index });
          const bytes = index === 0 ? data.mainBytes : data.secondaryBytes;
          const value = parseSrt(bytes);
          if (!value.ok) {
            post({ type: 'error', jobId, result: errorResult(jobId, value.error.code, index, value.error.offset) });
            return;
          }
          parsed.push(value.cues);
        }
        post({ type: 'progress', jobId, stage: 'matching', fileIndex: null });
        analysis = matchCues(parsed[0], parsed[1], { jobId });
        if (analysis.status === 'error') {
          post({ type: 'error', jobId, result: analysis }); analysis = null; return;
        }
        sources = { main: parsed[0], secondary: parsed[1] };
        post({ type: 'progress', jobId, stage: 'output', fileIndex: null });
        result();
      } catch {
        analysis = null; sources = null;
        post({ type: 'error', jobId, result: errorResult(jobId, 'BUILD_FAILED') });
      } finally {
        data.mainBytes = null; data.secondaryBytes = null;
      }
      return;
    }
    if (!analysis || data?.jobId !== jobId) return;
    try {
      if (data.type === 'confirm') {
        if (!pending || data.decisionId !== pending.id || typeof data.accepted !== 'boolean') return;
        if (pending.kind === 'match') analysis = confirmDecision(analysis, pending.value, data.accepted);
        else if (data.accepted) analysis = excludeCue(analysis, pending.side, pending.index);
        pending = null;
        result();
        return;
      }
      if (pending) return;
      if (data.type === 'candidates') {
        post({ type: 'candidates', jobId, side: data.side, cueIndex: data.cueIndex,
          candidates: candidatesFor(analysis, data.side, data.cueIndex) });
      } else if (data.type === 'decision') {
        const resolution = resolveDecision(analysis, data.decision);
        if (resolution.kind === 'applied') { analysis = resolution.analysis; result(); }
        else {
          pending = { kind: 'match', value: resolution.pending, id: ++serial };
          post({ type: 'confirmation', jobId, pending: { ...resolution.pending, decisionId: pending.id } });
        }
      } else if (data.type === 'exclude') {
        if (!['main', 'secondary'].includes(data.side) || !Number.isInteger(data.cueIndex) || !sources[data.side][data.cueIndex]) {
          throw new Error('MATCH_CONFLICT');
        }
        pending = { kind: 'exclude', side: data.side, index: data.cueIndex, id: ++serial };
        const replaced = analysis.matches.filter(edge => edge[`${data.side}CueIndex`] === data.cueIndex);
        post({ type: 'confirmation', jobId, pending: { jobId, decisionId: pending.id,
          decision: { type: 'exclude', side: data.side, cueIndex: data.cueIndex }, reasons: ['exclude-cue'],
          replacedAutomaticMatches: replaced, releasedMain: data.side === 'secondary' ? replaced.map(edge => edge.mainCueIndex) : [],
          releasedSecondary: data.side === 'main' ? replaced.map(edge => edge.secondaryCueIndex) : [] } });
      } else if (data.type === 'release-match') {
        analysis = releaseManualMatch(analysis, data.mainCueIndex, data.secondaryCueIndex); result();
      } else if (data.type === 'release-separate') {
        analysis = releaseSeparate(analysis, data.side, data.cueIndex); result();
      } else if (data.type === 'restore-excluded') {
        analysis = restoreExcluded(analysis, data.side, data.cueIndex); result();
      }
    } catch {
      post({ type: 'operation-error', jobId, code: 'MATCH_CONFLICT' });
    }
  }
  return { receive, dispose: clear };
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  const session = createWorkerSession(message => self.postMessage(message));
  self.addEventListener('message', event => session.receive(event.data));
}
