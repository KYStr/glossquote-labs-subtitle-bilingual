import { createJobController } from './job-controller.js';
import { createUI } from './ui.js';

let ui;
const controller = createJobController({
  makeWorker: () => new Worker(new URL('./merge-worker.js', import.meta.url), { type: 'module' }),
  onChange: state => ui?.render(state),
  makeBlob: (parts, options) => new Blob(parts, options),
  createUrl: blob => URL.createObjectURL(blob),
  revokeUrl: url => URL.revokeObjectURL(url)
});
ui = createUI(controller);
ui.render(controller.getState());
window.addEventListener('pagehide', () => controller.pagehide());
