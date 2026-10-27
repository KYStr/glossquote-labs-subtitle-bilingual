import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), evidence = resolve(root, 'evidence/m2a');
async function inventory(directory, prefix = '', skip = () => false) {
  const rows = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = prefix ? `${prefix}/${name}` : name; if (skip(path)) continue;
    const target = resolve(directory, name), info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error('M2A_LINK_REJECTED');
    if (info.isDirectory()) rows.push(...await inventory(target, path, skip));
    else if (info.isFile()) { const bytes = await readFile(target); rows.push({ path, bytes: bytes.length, sha256: sha256(bytes) }); }
    else throw new Error('M2A_NONFILE_REJECTED');
  }
  return rows;
}
const baseline = JSON.parse(await readFile(resolve(evidence, 'baseline.json'), 'utf8'));
const current = await inventory(root, '', path => /^evidence\/m2a(\/|$)/.test(path));
const before = new Map(baseline.map(row => [row.path, row])), after = new Map(current.map(row => [row.path, row]));
const allowed = new Set(['scripts/release.mjs', 'scripts/check.mjs', 'scripts/validate-m2a.mjs', 'scripts/record-m2a.mjs',
  'test/release.test.mjs', 'test/merge.test.mjs', 'test/toolchain.test.mjs', 'wrangler.jsonc', 'HANDOFF.md', 'TASK-ENTRY.md', 'M2A-RELEASE.md',
  'release-artifacts/site/_redirects', 'release-artifacts/manifest.json']);
const changes = [];
for (const row of baseline) {
  const now = after.get(row.path);
  if (!now || row.bytes !== now.bytes || row.sha256 !== now.sha256) {
    if (!allowed.has(row.path)) throw new Error(`PROTECTED_DRIFT: ${row.path}`);
    changes.push({ path: row.path, kind: now ? 'modified' : 'deleted', before: row, after: now ?? null });
  }
}
for (const row of current) if (!before.has(row.path)) {
  if (!allowed.has(row.path)) throw new Error(`OUT_OF_SCOPE: ${row.path}`);
  changes.push({ path: row.path, kind: 'added', before: null, after: row });
}
const protectedRows = baseline.filter(row => /^(public|dist|release-artifacts|evidence)\//.test(row.path) && row.path !== 'release-artifacts/manifest.json');
const releaseBefore = baseline.filter(row => row.path.startsWith('release-artifacts/'));
const backupRoot = resolve(evidence, 'before/release-artifacts');
if ((await lstat(backupRoot)).isSymbolicLink()) throw new Error('OLD_RELEASE_BACKUP_LINK');
if ((await inventory(backupRoot)).length !== releaseBefore.length) throw new Error('OLD_RELEASE_BACKUP_CLOSURE');
for (const row of releaseBefore) {
  const bytes = await readFile(resolve(evidence, 'before', row.path));
  if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error('OLD_RELEASE_BACKUP_DRIFT');
}
const sourceSkip = path => /^(dist|release-artifacts|evidence|node_modules|\.git)(\/|$)/.test(path);
const sources = await inventory(root, '', sourceSkip), artifacts = await inventory(resolve(root, 'release-artifacts'));
if (JSON.stringify(sources) !== JSON.stringify(await inventory(root, '', sourceSkip))) throw new Error('SOURCE_CHANGED_DURING_RECORD');
const releaseManifest = await readFile(resolve(root, 'release-artifacts/manifest.json'));
const releaseData = JSON.parse(releaseManifest.toString('utf8'));
if (artifacts.length !== releaseData.files.length + 1) throw new Error('ARTIFACT_CLOSURE');
for (const row of releaseData.files) {
  const actual = artifacts.find(item => item.path === `site/${row.path}`);
  if (!actual || actual.bytes !== row.bytes || actual.sha256 !== row.sha256) throw new Error('ARTIFACT_MANIFEST_DRIFT');
}
if (!(await readFile(resolve(root, 'release-artifacts/site/_redirects'))).equals(Buffer.from('/ /index.html 301\n/en /en/index.html 301\n/en/ /en/index.html 301\n'))) throw new Error('REDIRECTS_DRIFT');
const record = { schemaVersion: 1, task: 'B20-50-M2A', date: '2026-10-27', timezone: 'Asia/Taipei',
  status: 'M2A_LOCAL_PREPARATION_WAITING_ROOT_M2B', changes: changes.sort((a, b) => a.path.localeCompare(b.path, 'en')),
  protectedUnchanged: protectedRows.length, oldReleaseBackupVerified: releaseBefore.length,
  sourceFiles: sources.length, sourceBytes: sources.reduce((sum, row) => sum + row.bytes, 0), sourceSetSha256: sha256(JSON.stringify(sources)), sources,
  artifactFiles: artifacts.length, artifactBytes: artifacts.reduce((sum, row) => sum + row.bytes, 0), artifactSetSha256: sha256(JSON.stringify(artifacts)), artifacts,
  releaseManifestSha256: sha256(releaseManifest), wranglerSha256: sha256(await readFile(resolve(root, 'wrangler.jsonc'))),
  historicalBrowserEvidence: { run: '.runs/batch20-browser-release-2026-10-25/isolated/b20-50-r1', pass: 32, notRun: 6, fail: 0 },
  browserRerun: false, deployment: 'NOT_DEPLOYED', publication: 'NOT_PUBLISHED' };
const text = JSON.stringify(record, null, 2) + '\n'; await writeFile(resolve(evidence, 'source-artifact-manifest.json'), text);
console.log(JSON.stringify({ status: 'PASS', changed: changes.length, protectedUnchanged: protectedRows.length, oldReleaseBackupVerified: releaseBefore.length,
  sourceFiles: record.sourceFiles, sourceBytes: record.sourceBytes, sourceSetSha256: record.sourceSetSha256,
  artifactFiles: artifacts.length, artifactBytes: record.artifactBytes, artifactSetSha256: record.artifactSetSha256,
  releaseManifestSha256: record.releaseManifestSha256, wranglerSha256: record.wranglerSha256, recordSha256: sha256(text) }));
