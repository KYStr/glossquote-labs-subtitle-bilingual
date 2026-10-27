// Node worker_threads adapter. It is not a browser and provides no browser acceptance evidence.
import { parentPort } from 'node:worker_threads';
globalThis.self = {
  postMessage: data => parentPort.postMessage(data),
  addEventListener: (type, listener) => {
    if (type === 'message') parentPort.on('message', data => listener({ data }));
  }
};
await import('../public/js/merge-worker.js');
