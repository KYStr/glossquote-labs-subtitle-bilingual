import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerSession } from '../public/js/merge-worker.js';
import { createJobController } from '../public/js/job-controller.js';
import { bytes, file, MAIN, SECONDARY, EXPECTED } from '../scripts/fixtures.mjs';

function workerSession(main = MAIN, secondary = SECONDARY) {
  const events = [];
  const session = createWorkerSession(data => events.push(structuredClone(data)));
  const job = { type: 'run', jobId: 'job-test', mainBytes: bytes(main), secondaryBytes: bytes(secondary) };
  session.receive(job);
  return { events, session, job, result: () => events.findLast(event => event.type === 'result'),
    send: message => session.receive({ jobId: 'job-test', ...message }) };
}
function harness({ automatic = true } = {}) {
  const workers = [], revoked = [], blobs = [], updates = [];
  const controller = createJobController({
    makeWorker: () => {
      const transport = { terminated: false, sent: [], onmessage: null, onerror: null,
        terminate() { this.terminated = true; session.dispose(); },
        postMessage(data) { this.sent.push(data); if (automatic) session.receive(data); } };
      const session = createWorkerSession(data => transport.onmessage?.({ data: structuredClone(data) }));
      transport.deliver = data => transport.onmessage?.({ data });
      workers.push(transport); return transport;
    },
    onChange: state => updates.push(state),
    makeBlob: (parts, options) => { const blob = { text: parts.join(''), options }; blobs.push(blob); return blob; },
    createUrl: () => `blob:synthetic-${blobs.length}`, revokeUrl: url => revoked.push(url)
  });
  return { controller, workers, revoked, blobs, updates };
}
test('worker stages and successful result; input buffers cleared', () => {
  const value = workerSession();
  assert.deepEqual(value.events.filter(event => event.type === 'progress').map(event => [event.stage, event.fileIndex]),
    [['parsing', 0], ['parsing', 1], ['matching', null], ['output', null]]);
  assert.equal(value.result().result.status, 'ready'); assert.equal(value.job.mainBytes, null); assert.equal(value.job.secondaryBytes, null);
});
test('parse failure in second source emits zero partial result and no sources', () => {
  const value = workerSession(MAIN, '1\nbad\nB');
  const error = value.events.at(-1);
  assert.equal(error.type, 'error'); assert.equal(error.result.error.fileIndex, 1);
  assert.deepEqual(error.result.outputCues, []); assert.equal(value.result(), undefined);
});
test('AC15 exclusion requires confirmation, cancel unchanged, accept count and undo', () => {
  const value = workerSession(MAIN, '1\n00:00:03,000 --> 00:00:04,000\nB\n');
  const before = value.result();
  value.send({ type: 'exclude', side: 'secondary', cueIndex: 0 });
  let pending = value.events.at(-1).pending;
  assert.deepEqual(pending.reasons, ['exclude-cue']); assert.deepEqual(value.result(), before);
  value.send({ type: 'confirm', decisionId: pending.decisionId, accepted: false });
  assert.deepEqual(value.result(), before);
  value.send({ type: 'exclude', side: 'secondary', cueIndex: 0 }); pending = value.events.at(-1).pending;
  value.send({ type: 'confirm', decisionId: pending.decisionId, accepted: true });
  assert.deepEqual(value.result().excluded, { main: [], secondary: [0] }); assert.equal(value.result().result.outputCues.length, 1);
  value.send({ type: 'restore-excluded', side: 'secondary', cueIndex: 0 }); assert.deepEqual(value.result(), before);
});
test('excluding a matched endpoint releases the other source cue, then restoration recomputes', () => {
  const value = workerSession(); const before = value.result();
  value.send({ type: 'exclude', side: 'main', cueIndex: 0 });
  const pending = value.events.at(-1).pending;
  assert.deepEqual(pending.releasedSecondary, [0]);
  value.send({ type: 'confirm', decisionId: pending.decisionId, accepted: true });
  assert.deepEqual(value.result().result.unmatchedSecondary, [0]);
  assert.deepEqual(value.result().result.outputCues[0].lines, ['B']);
  value.send({ type: 'restore-excluded', side: 'main', cueIndex: 0 }); assert.deepEqual(value.result(), before);
});
test('worker blocks decisions during confirmation and ignores stale confirm/job', () => {
  const value = workerSession(MAIN, '1\n00:00:00,000 --> 00:00:00,400\nB\n');
  value.send({ type: 'decision', decision: { type: 'pair', mainCueIndex: 0, secondaryCueIndex: 0 } });
  const pending = value.events.at(-1).pending; const count = value.events.length;
  value.send({ type: 'decision', decision: { type: 'keep-separate', side: 'main', cueIndex: 0 } });
  value.send({ type: 'confirm', decisionId: pending.decisionId + 1, accepted: true });
  value.session.receive({ type: 'confirm', jobId: 'old-job', decisionId: pending.decisionId, accepted: true });
  assert.equal(value.events.length, count);
  value.send({ type: 'confirm', decisionId: pending.decisionId, accepted: false });
  assert.equal(value.result().result.outputCues.length, 2);
});
test('AC30 worker full replacement/Cancel/released-A tie/keep flow preserves every source', () => {
  const value = workerSession('1\n00:00:00,000 --> 00:00:01,000\nA\n\n2\n00:00:00,000 --> 00:00:00,800\nB\n',
    '1\n00:00:00,000 --> 00:00:01,000\nX\n\n2\n00:00:00,000 --> 00:00:00,600\nY\n\n3\n00:00:00,000 --> 00:00:00,600\nZ\n');
  const before = value.result();
  value.send({ type: 'decision', decision: { type: 'pair', mainCueIndex: 1, secondaryCueIndex: 0 } });
  let pending = value.events.at(-1).pending;
  value.send({ type: 'confirm', decisionId: pending.decisionId, accepted: false }); assert.deepEqual(value.result(), before);
  value.send({ type: 'decision', decision: { type: 'pair', mainCueIndex: 1, secondaryCueIndex: 0 } });
  pending = value.events.at(-1).pending;
  value.send({ type: 'confirm', decisionId: pending.decisionId, accepted: true });
  assert.deepEqual(value.result().result.ambiguous.map(edge => [edge.mainCueIndex, edge.secondaryCueIndex]), [[0, 1], [0, 2]]);
  assert.deepEqual(value.result().result.outputCues, []);
  value.send({ type: 'decision', decision: { type: 'keep-separate', side: 'main', cueIndex: 0 } });
  assert.equal(value.result().result.status, 'ready');
  assert.deepEqual(value.result().result.matches.map(edge => [edge.mainCueIndex, edge.secondaryCueIndex, edge.kind]), [[1, 0, 'manual']]);
  assert.deepEqual(value.result().result.outputCues.map(cue => cue.lines), [['A'], ['B', 'X'], ['Y'], ['Z']]);
});
test('AC32 worker ready automatic keep confirmation/Cancel/accept preserves standalone cues', () => {
  const value = workerSession(MAIN, MAIN.replace('\nA\n', '\nX\n')); const before = value.result();
  value.send({ type: 'decision', decision: { type: 'keep-separate', side: 'main', cueIndex: 0 } });
  let pending = value.events.at(-1).pending;
  assert.deepEqual(pending.releasedSecondary, [0]);
  value.send({ type: 'confirm', decisionId: pending.decisionId, accepted: false }); assert.deepEqual(value.result(), before);
  value.send({ type: 'decision', decision: { type: 'keep-separate', side: 'main', cueIndex: 0 } }); pending = value.events.at(-1).pending;
  value.send({ type: 'confirm', decisionId: pending.decisionId, accepted: true });
  assert.deepEqual(value.result().result.keptSeparateMain, [0]); assert.deepEqual(value.result().result.unmatchedSecondary, [0]);
  assert.deepEqual(value.result().result.outputCues.map(cue => cue.lines), [['A'], ['X']]);
});
test('AC19 cancellation terminates worker, increments epoch and clears buffers/result', async () => {
  const { controller, workers } = harness({ automatic: false });
  controller.setFiles([file(MAIN), file(SECONDARY)]); await controller.start();
  const before = controller.diagnostics().epoch;
  controller.cancel();
  assert.equal(workers[0].terminated, true); assert.equal(controller.diagnostics().epoch, before + 1);
  assert.equal(controller.diagnostics().bufferCount, 0); assert.equal(controller.getState().result, null);
  assert.equal(controller.download(), null); assert.equal(controller.getState().error.code, 'CANCELED');
});
test('cancel while file reading ignores delayed completion and creates no worker', async () => {
  let finish;
  const { controller, workers } = harness();
  controller.setFiles([{ name: 'slow.srt', size: 100, arrayBuffer: () => new Promise(resolve => { finish = resolve; }) }, file(SECONDARY)]);
  const running = controller.start(); controller.cancel(); finish(bytes(MAIN)); await running;
  assert.equal(workers.length, 0); assert.equal(controller.diagnostics().bufferCount, 0); assert.equal(controller.getState().result, null);
});
test('AC20 stale success/error/progress from canceled A cannot overwrite B', async () => {
  const { controller, workers } = harness({ automatic: false });
  controller.setFiles([file(MAIN), file(SECONDARY)]); await controller.start();
  const oldId = controller.getState().jobId; controller.cancel(); await controller.start();
  const saved = controller.getState();
  for (const type of ['result', 'error', 'progress']) workers[0].deliver({ type, jobId: oldId, result: { status: 'ready', outputCues: [] }, stage: 'output' });
  assert.deepEqual(controller.getState(), saved);
  workers[1].deliver({ type: 'progress', jobId: oldId, stage: 'output' }); assert.deepEqual(controller.getState(), saved);
});
test('AC21 explicit repeated downloads; URLs revoked on source/reset/pagehide, no auto-expiry', async () => {
  const { controller, revoked, blobs } = harness();
  controller.setFiles([file(MAIN), file(SECONDARY)]); await controller.start();
  assert.equal(blobs.length, 0);
  const first = controller.download(), second = controller.download();
  assert.equal(first.name, 'bilingual-subtitles.srt'); assert.equal(blobs[0].text, EXPECTED); assert.equal(blobs[1].text, EXPECTED);
  assert.equal(controller.getState().phase, 'ready');
  controller.setFiles([file(MAIN), file(SECONDARY)]);
  assert.ok(revoked.includes(first.url)); assert.ok(revoked.includes(second.url)); assert.equal(controller.download(), null);
  await controller.start(); const third = controller.download(); controller.clear(); assert.ok(revoked.includes(third.url));
  controller.setFiles([file(MAIN), file(SECONDARY)]); await controller.start(); const fourth = controller.download(); controller.pagehide();
  assert.ok(revoked.includes(fourth.url)); assert.equal(controller.getState().result, null); assert.deepEqual(controller.getState().files, [null, null]);
});
test('AC22 same source names and identical contents remain distinct tracks', async () => {
  const { controller } = harness(); controller.setFiles([file(MAIN, 'same.srt'), file(MAIN, 'same.srt')]); await controller.start();
  assert.equal(controller.getState().result.mainCueCount, 1); assert.equal(controller.getState().result.secondaryCueCount, 1);
  assert.deepEqual(controller.getState().result.outputCues[0].lines, ['A', 'A']);
});
test('swap invalidates fixed decisions/output and starts a new job when explicitly requested', async () => {
  const { controller } = harness(); controller.setFiles([file(MAIN), file(SECONDARY)]); await controller.start();
  const id = controller.getState().jobId; const sources = controller.getState().files;
  controller.swap(); assert.equal(controller.getState().result, null); assert.equal(controller.download(), null);
  assert.deepEqual(controller.getState().files, [sources[1], sources[0]]);
  await controller.start(); assert.notEqual(controller.getState().jobId, id);
  assert.equal(controller.getState().result.outputCues[0].startMs, 500);
  assert.deepEqual(controller.getState().result.outputCues[0].lines, ['B', 'A']);
});
test('review state never creates Blob; pending confirmation blocks download and cancel preserves result', async () => {
  const { controller, blobs } = harness();
  controller.setFiles([file(MAIN), file('1\n00:00:00,000 --> 00:00:00,800\nB\n')]); await controller.start();
  const saved = structuredClone(controller.getState().result);
  controller.command({ type: 'decision', decision: { type: 'pair', mainCueIndex: 0, secondaryCueIndex: 0 } });
  assert.ok(controller.getState().pending); assert.equal(controller.download(), null); assert.deepEqual(controller.getState().result, saved);
  controller.confirm(false); assert.deepEqual(controller.getState().result, saved); assert.equal(blobs.length, 0);
  controller.command({ type: 'decision', decision: { type: 'pair', mainCueIndex: 0, secondaryCueIndex: 0 } }); controller.confirm(true);
  assert.equal(controller.getState().result.matches[0].kind, 'manual-override'); assert.ok(controller.download());
  controller.setFiles([file(MAIN), file('1\n00:00:00,000 --> 00:00:02,000\nX\n\n2\n00:00:00,000 --> 00:00:02,000\nY\n')]);
  await controller.start(); assert.equal(controller.getState().phase, 'review');
  const count = blobs.length; assert.equal(controller.download(), null); assert.equal(blobs.length, count); assert.deepEqual(controller.getState().result.outputCues, []);
});
test('AC28 candidate-limit transport produces error, no preview or Blob', async () => {
  const srt = n => Array.from({ length: n }, (_, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\nsynthetic\n`).join('\n');
  const { controller, blobs } = harness(); controller.setFiles([file(srt(250)), file(srt(201))]); await controller.start();
  assert.equal(controller.getState().error.code, 'CANDIDATE_LIMIT'); assert.equal(controller.getState().sources, null);
  assert.equal(controller.download(), null); assert.equal(blobs.length, 0); assert.equal(controller.diagnostics().bufferCount, 0);
});
test('file count and declared/actual size gates; old successful output cannot survive errors', async () => {
  const { controller, revoked } = harness();
  controller.setFiles([file(MAIN)]); await controller.start(); assert.equal(controller.getState().error.code, 'NO_FILES');
  controller.setFiles([file(MAIN), file(SECONDARY), file(MAIN)]); assert.equal(controller.getState().error.code, 'TOO_MANY_FILES');
  controller.setFiles([file(MAIN), file(SECONDARY)]); await controller.start(); const download = controller.download();
  controller.setFiles([{ name: 'large.srt', size: 1_048_577, arrayBuffer: () => { throw new Error('MUST_NOT_READ'); } }, file(MAIN)]);
  await controller.start(); assert.equal(controller.getState().error.code, 'FILE_TOO_LARGE'); assert.ok(revoked.includes(download.url));
  controller.setFiles([{ name: 'wrong-size.srt', size: 1, arrayBuffer: async () => new ArrayBuffer(1_048_577) }, file(MAIN)]);
  await controller.start(); assert.equal(controller.getState().error.code, 'FILE_TOO_LARGE'); assert.equal(controller.download(), null);
});
test('read/worker failure clears result and raw exceptions stay out of UI state', async () => {
  const { controller, workers } = harness({ automatic: false });
  controller.setFiles([{ name: 'bad.srt', size: 1, arrayBuffer: async () => { throw new Error('synthetic-private-body'); } }, file(MAIN)]);
  await controller.start(); assert.equal(controller.getState().error.code, 'BUILD_FAILED'); assert.equal(JSON.stringify(controller.getState()).includes('synthetic-private-body'), false);
  controller.setFiles([file(MAIN), file(SECONDARY)]); await controller.start();
  let prevented = false; workers.at(-1).onerror({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(controller.getState().error.code, 'BUILD_FAILED'); assert.equal(controller.getState().sources, null);
});
