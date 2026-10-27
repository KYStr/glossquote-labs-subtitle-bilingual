import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sha256, snapshot } from './files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(root, 'evidence/m1');
async function inventory(path, prefix = '') {
  const rows = [];
  for (const name of (await readdir(path)).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    if (!prefix && ['dist', 'evidence', '.git', 'node_modules'].includes(name)) continue;
    const target = resolve(path, name);
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error('FREEZE_LINK_REJECTED');
    if (info.isDirectory()) rows.push(...await inventory(target, relative));
    else {
      const bytes = await readFile(target);
      rows.push({ path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) });
    }
  }
  return rows;
}
const before = await inventory(root);
const dist = await snapshot(resolve(root, 'dist'));
const sourcePublic = await snapshot(resolve(root, 'public'));
if (JSON.stringify(dist) !== JSON.stringify(sourcePublic)) throw new Error('DIST_DRIFT');
if (JSON.stringify(before) !== JSON.stringify(await inventory(root))) throw new Error('SOURCE_DRIFT');
const value = { schemaVersion: 1, candidate: 'B20-50-M1 / 0.1.0-m1', date: '2026-10-23', timezone: 'Asia/Taipei',
  status: 'M1_LOCAL_CANDIDATE_BROWSER_NOT_RUN', sourceFiles: before.length,
  sourceBytes: before.reduce((sum, row) => sum + row.bytes, 0), sources: before,
  distFiles: dist.length, distBytes: dist.reduce((sum, row) => sum + row.bytes, 0), dist,
  note: 'Fixed source/spec/handoff bytes; evidence and generated dist are outside the source list. Dist is separately compared byte-for-byte with public. No Git commit, publication, hosting or browser PASS is implied.' };
await mkdir(evidence, { recursive: true });
const text = JSON.stringify(value, null, 2) + '\n';
await writeFile(resolve(evidence, 'source-manifest.json'), text);
console.log(JSON.stringify({ status: 'PASS', sourceFiles: value.sourceFiles, sourceBytes: value.sourceBytes,
  distFiles: value.distFiles, distBytes: value.distBytes, manifestBytes: Buffer.byteLength(text), manifestSha256: sha256(text) }));
