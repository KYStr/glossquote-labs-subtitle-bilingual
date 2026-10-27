import { MAX_FILE_BYTES } from './core/decode.js';
import { errorResult } from './core/match.js';
import { serializeSrt } from './core/serialize-srt.js';

export function createJobController({ makeWorker, onChange = () => {}, createUrl, revokeUrl, makeBlob }) {
  let epoch = 0;
  let worker = null;
  let files = [null, null];
  let urls = [];
  let byteBuffers = [];
  let commandBusy = false;
  let state = { phase: 'empty', jobId: null, result: null, sources: null, pending: null,
    excluded: { main: [], secondary: [] }, candidates: null, stage: null, fileIndex: null, error: null };
  const emit = () => onChange({ ...state, files: [...files], commandBusy });
  function revoke() { for (const url of urls) revokeUrl(url); urls = []; }
  function invalidate() {
    epoch++; worker?.terminate(); worker = null; byteBuffers = []; commandBusy = false; revoke();
    state = { phase: files.every(Boolean) ? 'selected' : 'empty', jobId: null, result: null, sources: null,
      pending: null, excluded: { main: [], secondary: [] }, candidates: null, stage: null, fileIndex: null, error: null };
  }
  function setError(code, fileIndex = null, offset = null) {
    worker?.terminate(); worker = null; byteBuffers = []; commandBusy = false; revoke();
    state.jobId ??= `job-${epoch}`;
    state = { ...state, phase: 'error', result: errorResult(state.jobId, code, fileIndex, offset), sources: null,
      pending: null, candidates: null, error: { code, fileIndex, offset } };
    emit();
  }
  function setFiles(next) {
    invalidate(); files = [next[0] ?? null, next[1] ?? null];
    state.phase = files.every(Boolean) ? 'selected' : 'empty';
    if (next.length > 2) setError('TOO_MANY_FILES'); else emit();
  }
  async function start() {
    invalidate();
    state.jobId = `job-${epoch}`;
    if (!files.every(Boolean)) { setError('NO_FILES'); return; }
    const oversized = files.findIndex(file => !Number.isSafeInteger(file.size) || file.size > MAX_FILE_BYTES || file.size < 0);
    if (oversized !== -1) { setError('FILE_TOO_LARGE', oversized, 0); return; }
    const current = epoch;
    state.phase = 'parsing'; state.stage = 'reading'; emit();
    try {
      let readBuffers = await Promise.all(files.map(file => file.arrayBuffer()));
      if (current !== epoch) { readBuffers = []; return; }
      byteBuffers = readBuffers;
      readBuffers = [];
      // Recheck actual bytes, rather than trusting a File-like object's size alone.
      const tooLarge = byteBuffers.findIndex(bytes => bytes.byteLength > MAX_FILE_BYTES);
      if (tooLarge !== -1) { setError('FILE_TOO_LARGE', tooLarge, 0); return; }
      worker = makeWorker();
      const active = worker;
      worker.onmessage = event => {
        const data = event.data;
        if (epoch !== current || worker !== active || data?.jobId !== state.jobId) return;
        if (data.type === 'progress') {
          state.stage = data.stage; state.fileIndex = data.fileIndex;
          state.phase = data.stage === 'parsing' ? 'parsing' : 'matching';
        } else if (data.type === 'result') {
          revoke(); commandBusy = false;
          state = { ...state, phase: data.result.status, result: data.result, sources: data.sources,
            excluded: data.excluded, pending: null, candidates: null, error: null };
        } else if (data.type === 'error') {
          setError(data.result.error.code, data.result.error.fileIndex, data.result.error.offset); return;
        } else if (data.type === 'confirmation') {
          commandBusy = false; state.pending = data.pending;
        } else if (data.type === 'candidates') {
          commandBusy = false; state.candidates = data;
        } else if (data.type === 'operation-error') {
          commandBusy = false; state.error = { code: data.code, fileIndex: null, offset: null };
        } else return;
        emit();
      };
      worker.onerror = event => {
        event.preventDefault?.();
        if (epoch === current && worker === active) setError('BUILD_FAILED');
      };
      worker.postMessage({ type: 'run', jobId: state.jobId, mainBytes: byteBuffers[0], secondaryBytes: byteBuffers[1] }, byteBuffers);
      byteBuffers = [];
    } catch { if (epoch === current) setError('BUILD_FAILED'); }
  }
  function command(data) {
    if (!worker || commandBusy || !['review', 'ready'].includes(state.phase) || state.pending) return false;
    commandBusy = true;
    state.error = null;
    worker.postMessage({ ...data, jobId: state.jobId });
    emit();
    return true;
  }
  function confirm(accepted) {
    if (!worker || !state.pending || commandBusy) return;
    commandBusy = true;
    worker.postMessage({ type: 'confirm', jobId: state.jobId, decisionId: state.pending.decisionId, accepted });
    emit();
  }
  function cancel() {
    invalidate(); state.error = { code: 'CANCELED', fileIndex: null, offset: null }; emit();
  }
  function download() {
    if (state.phase !== 'ready' || state.pending || commandBusy || !state.result?.outputCues.length) return null;
    try {
      const text = serializeSrt(state.result.outputCues);
      const blob = makeBlob([text], { type: 'application/x-subrip;charset=utf-8' });
      const url = createUrl(blob); urls.push(url);
      return { url, name: 'bilingual-subtitles.srt', cueCount: state.result.outputCues.length };
    } catch { setError('BUILD_FAILED'); return null; }
  }
  return { setFiles, start, cancel, command, confirm, download,
    clear() { invalidate(); files = [null, null]; state.phase = 'empty'; emit(); },
    swap() { const next = [files[1], files[0]]; setFiles(next); },
    pagehide() { invalidate(); files = [null, null]; state.phase = 'empty'; emit(); },
    closeCandidates() { state.candidates = null; emit(); },
    getState: () => ({ ...state, files: [...files], commandBusy }),
    diagnostics: () => ({ epoch, bufferCount: byteBuffers.length, urlCount: urls.length, workerActive: Boolean(worker) }) };
}
