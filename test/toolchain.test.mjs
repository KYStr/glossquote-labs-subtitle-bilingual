import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, cp, readFile, writeFile, rm, symlink, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPublic, checkPackage } from '../scripts/check.mjs';
import { inspectTree, inside, snapshot } from '../scripts/files.mjs';
import { build } from '../scripts/build.mjs';
import { handleRequest } from '../scripts/serve.mjs';
import { copy } from '../public/js/i18n.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtureRoot = resolve(root, 'evidence/m2a/test-workspaces');
async function workspace(action) {
  await mkdir(fixtureRoot, { recursive: true });
  const directory = await mkdtemp(join(fixtureRoot, 'synthetic-'));
  try { return await action(directory); }
  finally {
    // Resolve and check the exact disposable target before recursive deletion.
    const target = resolve(directory);
    if (!inside(fixtureRoot, target) || target === fixtureRoot || (await lstat(target)).isSymbolicLink()) throw new Error('UNSAFE_TEST_CLEANUP');
    await rm(target, { recursive: true, force: false });
  }
}
test('AC24/26 static bilingual structure, local closure, syntax and package checks', async () => {
  await checkPackage(); assert.deepEqual(await checkPublic(), { files: 16, pages: 2, syntax: 11 });
  assert.deepEqual(Object.keys(copy['zh-Hant']).sort(), Object.keys(copy.en).sort());
  assert.deepEqual(Object.keys(copy['zh-Hant'].errors).sort(), Object.keys(copy.en.errors).sort());
  for (const locale of Object.values(copy)) for (const message of Object.values(locale.errors)) assert.ok(message.length > 12);
});
test('AC17/21 no HTML interpretation, network, persistence or auto-expiry API in public JS', async () => {
  const manifest = await snapshot(resolve(root, 'public'));
  for (const entry of manifest.filter(entry => entry.path.endsWith('.js'))) {
    const text = await readFile(resolve(root, 'public', entry.path), 'utf8');
    assert.doesNotMatch(text, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|setTimeout|setInterval|fetch|localStorage|sessionStorage|indexedDB|WebSocket|eval)\b/);
  }
});
test('check rejects actual wrong English title and forbidden executable DOM API', async () => workspace(async directory => {
  const source = join(directory, 'public'); await cp(resolve(root, 'public'), source, { recursive: true });
  const page = join(source, 'en/index.html'); const original = await readFile(page, 'utf8');
  await writeFile(page, original.replace('Merge Bilingual Subtitles | Gloss Tools', '雙語字幕合併｜Gloss Tools'));
  await assert.rejects(() => checkPublic(source), /PAGE_SEMANTICS/);
  await writeFile(page, original);
  const js = join(source, 'js/app.js'); await writeFile(js, (await readFile(js, 'utf8')) + '\ndocument.body.innerHTML = "synthetic";\n');
  await assert.rejects(() => checkPublic(source), /FORBIDDEN_API/);
}));
test('build produces byte-identical closed static tree, rejects stale unknown output without deleting it', async () => workspace(async directory => {
  const destination = join(directory, 'dist');
  const result = await build(resolve(root, 'public'), destination);
  assert.equal(result.status, 'PASS'); assert.equal(result.files, 16);
  assert.deepEqual(await snapshot(destination), await snapshot(resolve(root, 'public')));
  const marker = join(destination, 'unexpected-private-note.txt'); await writeFile(marker, 'synthetic must survive');
  await assert.rejects(() => build(resolve(root, 'public'), destination), /UNKNOWN_FILE/);
  assert.equal(await readFile(marker, 'utf8'), 'synthetic must survive');
}));
test('tree gate rejects missing, unknown, linked files and junction directories', async () => workspace(async directory => {
  const source = join(directory, 'public'); await mkdir(source);
  await assert.rejects(() => inspectTree(source), /MISSING_PUBLIC_FILE/);
  await writeFile(join(source, 'unknown.txt'), 'synthetic');
  await assert.rejects(() => inspectTree(source), /UNKNOWN_FILE/);
  await rm(join(source, 'unknown.txt'));
  await mkdir(join(directory, 'target'));
  await symlink(join(directory, 'target'), join(source, 'js'), 'junction');
  await assert.rejects(() => inspectTree(source), /LINK_REJECTED/);
}));
test('path containment rejects traversal and another absolute root', () => {
  assert.equal(inside(root, resolve(root, '..')), false);
  assert.equal(inside(root, resolve(root, 'public/index.html')), true);
  if (process.platform === 'win32') assert.equal(inside(root, 'Z:/synthetic-outside'), false);
});
test('dev request handler unit checks only; no server/listener/HTTP/browser launched', async () => {
  async function request(url, method = 'GET', host = '127.0.0.1:4230') {
    const response = { status: null, headers: null, body: null,
      writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
    await handleRequest({ url, method, headers: { host } }, response); return response;
  }
  const zh = await request('/'); assert.equal(zh.status, 200); assert.match(zh.body.toString(), /<html lang="zh-Hant">/);
  const en = await request('/en/index.html'); assert.equal(en.status, 200); assert.match(en.body.toString(), /<html lang="en">/);
  const head = await request('/js/app.js', 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, undefined);
  assert.equal((await request('/', 'POST')).status, 405);
  assert.equal((await request('/', 'GET', 'evil.invalid')).status, 403);
  for (const route of ['/../package.json', '/%2e%2e/package.json', '/js/../index.html', '/missing', '/_headers', '//index.html', '/index.html?secret=synthetic', '/index.html#x']) assert.equal((await request(route)).status, 404);
});
