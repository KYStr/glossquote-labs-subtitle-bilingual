import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { serializeSrt } from '../public/js/core/serialize-srt.js';
import { bytes, MAIN, SECONDARY, EXPECTED } from '../scripts/fixtures.mjs';

test('real Node worker thread transfers ArrayBuffers and returns exact SRT; browser NOT_RUN', { timeout: 10_000 }, async () => {
  const worker = new Worker(new URL('../scripts/thread-adapter.mjs', import.meta.url));
  try {
    const result = new Promise((resolve, reject) => {
      worker.on('message', event => {
        if (event.type === 'error') reject(new Error(event.result.error.code));
        if (event.type === 'result') resolve(event);
      });
      worker.on('error', reject);
    });
    const mainBytes = bytes(MAIN), secondaryBytes = bytes(SECONDARY);
    worker.postMessage({ type: 'run', jobId: 'thread-oracle', mainBytes, secondaryBytes }, [mainBytes, secondaryBytes]);
    assert.equal(mainBytes.byteLength, 0); assert.equal(secondaryBytes.byteLength, 0);
    const message = await result;
    assert.equal(message.jobId, 'thread-oracle'); assert.equal(message.result.status, 'ready');
    assert.equal(serializeSrt(message.result.outputCues), EXPECTED);
    assert.deepEqual(message.excluded, { main: [], secondary: [] });
  } finally { await worker.terminate(); }
});
