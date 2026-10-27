import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './files.mjs';
import { ORIGIN, TOOL_SLUG, M1_PUBLIC_FINGERPRINT } from './release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(root, 'evidence/m1b');
async function inventory(directory, prefix = '', skip = () => false) {
  const rows = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (skip(path)) continue;
    const target = resolve(directory, name), info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error('M1B_LINK_REJECTED');
    if (info.isDirectory()) rows.push(...await inventory(target, path, skip));
    else if (info.isFile()) {
      const bytes = await readFile(target); rows.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
    } else throw new Error('M1B_NONFILE_REJECTED');
  }
  return rows;
}
const json = text => JSON.parse(text.replace(/^\uFEFF/, ''));
const baseline = json(await readFile(resolve(evidence, 'baseline-inventory.json'), 'utf8'));
const current = await inventory(root, '', path => /^(evidence\/m1b|release-artifacts)(\/|$)/.test(path));
const byPath = new Map(current.map(row => [row.path, row]));
const original = new Map(baseline.map(row => [row.path, row]));
const allowed = path => ['package.json', '.gitignore', 'HANDOFF.md', 'TASK-ENTRY.md', 'M1B-RELEASE.md'].includes(path) || /^(scripts|test)\//.test(path);
const changed = [];
for (const row of baseline) {
  const now = byPath.get(row.path);
  if (!now || row.sha256 !== now.sha256 || row.bytes !== now.bytes) {
    if (!allowed(row.path)) throw new Error(`PROTECTED_DRIFT: ${row.path}`);
    changed.push({ path: row.path, kind: now ? 'modified' : 'deleted', before: row, after: now ?? null });
  }
}
for (const row of current) if (!original.has(row.path)) {
  if (!allowed(row.path)) throw new Error(`OUT_OF_SCOPE_ADDITION: ${row.path}`);
  changed.push({ path: row.path, kind: 'added', before: null, after: row });
}
const protectedRows = baseline.filter(row => /^(public|dist|evidence\/m1)\//.test(row.path));
const sourceSkip = path => /^(dist|evidence|release-artifacts|node_modules|\.git)(\/|$)/.test(path);
const sources = await inventory(root, '', sourceSkip);
const artifacts = await inventory(resolve(root, 'release-artifacts'));
const artifactText = await readFile(resolve(root, 'release-artifacts/manifest.json'));
const artifactManifest = json(artifactText.toString('utf8'));
if (artifactManifest.origin !== ORIGIN || artifactManifest.toolSlug !== TOOL_SLUG) throw new Error('ARTIFACT_IDENTITY');
for (const row of artifactManifest.files) {
  const actual = artifacts.find(value => value.path === `site/${row.path}`);
  if (!actual || actual.bytes !== row.bytes || actual.sha256 !== row.sha256) throw new Error('ARTIFACT_DRIFT');
}
if (artifacts.length !== artifactManifest.files.length + 1) throw new Error('ARTIFACT_CLOSURE');
const repeated = await inventory(root, '', sourceSkip);
if (JSON.stringify(sources) !== JSON.stringify(repeated)) throw new Error('SOURCE_DRIFT_DURING_RECORD');
const record = { schemaVersion: 1, task: 'B20-RP-50', status: 'M1B_OFFLINE_RELEASE_CANDIDATE',
  origin: ORIGIN, toolSlug: TOOL_SLUG, m1PublicFingerprint: M1_PUBLIC_FINGERPRINT,
  protectedFilesUnchanged: protectedRows.length, changes: changed.sort((a, b) => a.path.localeCompare(b.path, 'en')),
  sourceFiles: sources.length, sourceBytes: sources.reduce((sum, row) => sum + row.bytes, 0), sources,
  artifactFiles: artifacts.length, artifactBytes: artifacts.reduce((sum, row) => sum + row.bytes, 0), artifacts,
  artifactManifestSha256: sha256(artifactText),
  browser: 'NOT_RUN_USER_FOCUS_INCIDENT', sourcePublication: 'NOT_PUBLISHED', hosting: 'NOT_DEPLOYED' };
const text = JSON.stringify(record, null, 2) + '\n';
await writeFile(resolve(evidence, 'source-artifact-manifest.json'), text);
console.log(JSON.stringify({ status: 'PASS', changed: changed.length, protectedUnchanged: record.protectedFilesUnchanged,
  sourceFiles: record.sourceFiles, sourceBytes: record.sourceBytes, artifactFiles: record.artifactFiles,
  artifactBytes: record.artifactBytes, artifactManifestSha256: record.artifactManifestSha256,
  recordBytes: Buffer.byteLength(text), recordSha256: sha256(text) }));
