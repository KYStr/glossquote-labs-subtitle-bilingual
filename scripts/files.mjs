import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export const PUBLIC_FILES = Object.freeze([
  '_headers', 'robots.txt', 'index.html', 'en/index.html', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/i18n.js', 'js/job-controller.js', 'js/merge-worker.js',
  'js/core/decode.js', 'js/core/parse-srt.js', 'js/core/iou.js', 'js/core/match.js',
  'js/core/merge.js', 'js/core/serialize-srt.js'
].sort());
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function inside(root, target) {
  const relation = relative(resolve(root), resolve(target));
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

export async function inspectTree(root, { allowMissing = false } = {}) {
  const files = [];
  const allowedDirs = new Set(PUBLIC_FILES.flatMap(file => {
    const chunks = file.split('/'); return chunks.slice(0, -1).map((_, i) => chunks.slice(0, i + 1).join('/'));
  }));
  async function walk(path, prefix = '') {
    let stat;
    try { stat = await lstat(path); } catch (error) { if (allowMissing && error.code === 'ENOENT' && !prefix) return; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('UNSAFE_DIRECTORY');
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = resolve(path, entry.name);
      if (!inside(root, target)) throw new Error('UNSAFE_PATH');
      const info = await lstat(target);
      if (info.isSymbolicLink()) throw new Error('LINK_REJECTED');
      if (info.isDirectory()) {
        if (!allowedDirs.has(name)) throw new Error(`UNKNOWN_DIRECTORY: ${name}`);
        await walk(target, name);
      } else {
        if (!info.isFile() || !PUBLIC_FILES.includes(name)) throw new Error(`UNKNOWN_FILE: ${name}`);
        files.push(name);
      }
    }
  }
  await walk(resolve(root));
  if (!allowMissing && files.length !== PUBLIC_FILES.length) throw new Error('MISSING_PUBLIC_FILE');
  return files.sort();
}

export async function snapshot(root) {
  await inspectTree(root);
  return Promise.all(PUBLIC_FILES.map(async path => {
    const bytes = await readFile(resolve(root, path));
    return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }));
}
