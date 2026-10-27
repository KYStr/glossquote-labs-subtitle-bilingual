import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile, mkdir, mkdtemp, readdir, lstat, rm, rename, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildRelease, checkRelease, auditReleaseHtml, checkHostingConfig, releaseMode, ORIGIN, TOOL_SLUG, M1_PUBLIC_FINGERPRINT } from '../scripts/release.mjs';
import { PUBLIC_FILES, inside, snapshot } from '../scripts/files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = resolve(root, 'evidence/m2a/test-workspaces');
const EXPECTED_ORIGIN = 'https://bilingual-subs.glossquote.com';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function inventory(directory, prefix = '') {
  const rows = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), relative = prefix ? `${prefix}/${name}` : name;
    const info = await lstat(path);
    if (info.isSymbolicLink()) rows.push({ path: relative, kind: 'link' });
    else if (info.isDirectory()) { rows.push({ path: relative, kind: 'directory' }); rows.push(...await inventory(path, relative)); }
    else { const bytes = await readFile(path); rows.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) }); }
  }
  return rows;
}

async function workspace(action, { built = true } = {}) {
  await mkdir(fixtures, { recursive: true });
  const directory = await mkdtemp(join(fixtures, 'release-synthetic-'));
  try {
    await cp(resolve(root, 'public'), join(directory, 'public'), { recursive: true });
    await cp(resolve(root, 'wrangler.jsonc'), join(directory, 'wrangler.jsonc'));
    if (built) await buildRelease(directory);
    return await action(directory);
  } finally {
    const target = resolve(directory);
    assert.ok(inside(fixtures, target) && target !== fixtures);
    assert.equal((await lstat(target)).isSymbolicLink(), false);
    await rm(target, { recursive: true, force: false });
  }
}

async function rejectedWithoutWrite(directory, pattern = /RELEASE_|UNKNOWN_|MISSING_/) {
  const before = await inventory(directory);
  await assert.rejects(() => checkRelease(directory), pattern);
  assert.deepEqual(await inventory(directory), before);
  await assert.rejects(() => buildRelease(directory), pattern);
  assert.deepEqual(await inventory(directory), before);
}

async function forgedManifest(directory, path, bytes) {
  const manifestPath = join(directory, 'release-artifacts/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const row = manifest.files.find(row => row.path === path);
  assert.ok(row); row.bytes = bytes.length; row.sha256 = digest(bytes);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

test('RP01/02 fixed origin/slug, strict mode; no environmental or CLI origin injection', () => {
  assert.equal(ORIGIN, EXPECTED_ORIGIN); assert.equal(TOOL_SLUG, 'subtitle-bilingual');
  assert.equal(M1_PUBLIC_FINGERPRINT, '70979b1ef42cf37cae7034124f813e18f3553e1378a92bdd2cca03538dbf3b55');
  assert.equal(releaseMode(['build']), 'build'); assert.equal(releaseMode(['check']), 'check');
  for (const args of [[], ['deploy'], ['Build'], ['build', 'extra'], ['check', '--origin', 'https://evil.invalid']]) {
    assert.throws(() => releaseMode(args), { code: 'RELEASE_ARGUMENTS' });
  }
});

test('RP01/08 real CLI rejects missing/wrong/extra arguments before creating output (own copy)', async () => workspace(async directory => {
  await mkdir(join(directory, 'scripts'));
  await cp(join(root, 'scripts/release.mjs'), join(directory, 'scripts/release.mjs'));
  await cp(join(root, 'scripts/files.mjs'), join(directory, 'scripts/files.mjs'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
  const before = await inventory(directory);
  for (const args of [[], ['publish'], ['build', 'unexpected'], ['check', '--origin=https://evil.invalid']]) {
    const child = spawnSync(process.execPath, [join(directory, 'scripts/release.mjs'), ...args], {
      cwd: directory, shell: false, windowsHide: true, encoding: 'utf8', timeout: 10_000
    });
    assert.equal(child.status, 1); assert.equal(child.stdout, ''); assert.match(child.stderr, /RELEASE_ARGUMENTS/);
    assert.deepEqual(await inventory(directory), before);
  }
}, { built: false }));

test('RP03–07 real files: head-only bilingual SEO, exact robots/sitemap/security headers and M1 assets', async () => workspace(async directory => {
  const output = join(directory, 'release-artifacts/site');
  const original = await snapshot(join(directory, 'public'));
  const manifestBytes = await readFile(join(directory, 'release-artifacts/manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(Object.keys(manifest), ['schemaVersion', 'mode', 'origin', 'toolSlug', 'files', 'sourceFiles']);
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.mode, 'release-candidate');
  assert.equal(manifest.origin, EXPECTED_ORIGIN); assert.equal(manifest.toolSlug, 'subtitle-bilingual');
  assert.equal(manifest.files.length, 18); assert.deepEqual(manifest.sourceFiles, original);
  assert.deepEqual(manifest.files.map(row => row.path), [...PUBLIC_FILES, 'sitemap.xml', '_redirects'].sort());
  assert.equal(new Set(manifest.files.map(row => row.path)).size, 18);
  assert.doesNotMatch(manifestBytes.toString(), /[A-Z]:\\|createdAt|timestamp|lastmod|\.\.\//);
  for (const path of PUBLIC_FILES.filter(path => !['index.html', 'en/index.html', '_headers', 'robots.txt'].includes(path))) {
    assert.deepEqual(await readFile(join(output, path)), await readFile(join(directory, 'public', path)));
  }
  for (const [path, lang] of [['index.html', 'zh-Hant'], ['en/index.html', 'en']]) {
    const html = await readFile(join(output, path), 'utf8');
    const preview = await readFile(join(directory, 'public', path), 'utf8');
    const audited = auditReleaseHtml(Buffer.from(html), path);
    assert.equal(audited.lang, lang); assert.equal(audited.canonical, `${EXPECTED_ORIGIN}/${path}`);
    // Independent extraction: expected links are handwritten, not copied from the release manifest.
    const links = [...html.matchAll(/<link rel="(canonical|alternate)"(?: hreflang="([^"]+)")? href="([^"]+)">/g)]
      .map(match => [match[1], match[2] ?? null, match[3]]);
    assert.deepEqual(links, [
      ['canonical', null, `${EXPECTED_ORIGIN}/${path}`],
      ['alternate', 'zh-Hant', 'https://bilingual-subs.glossquote.com/index.html'],
      ['alternate', 'en', 'https://bilingual-subs.glossquote.com/en/index.html'],
      ['alternate', 'x-default', 'https://bilingual-subs.glossquote.com/index.html']
    ]);
    assert.equal(html.split('</head>')[1], preview.split('</head>')[1]);
    const restored = html.replace('content="index,follow"', 'content="noindex,nofollow,noarchive"')
      .replace(/^  <link rel="(?:canonical|alternate)"[^\n]*\n/gm, '');
    assert.equal(restored, preview);
    assert.match(preview, /name="robots" content="noindex,nofollow,noarchive"/);
    assert.doesNotMatch(preview, /rel="canonical"|hreflang="x-default"/);
  }
  assert.equal(await readFile(join(output, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\nSitemap: https://bilingual-subs.glossquote.com/sitemap.xml\n');
  assert.equal(await readFile(join(output, '_redirects'), 'utf8'), '/ /index.html 301\n/en /en/index.html 301\n/en/ /en/index.html 301\n');
  assert.deepEqual((await readFile(join(output, '_redirects'), 'utf8')).trimEnd().split('\n'), ['/ /index.html 301', '/en /en/index.html 301', '/en/ /en/index.html 301']);
  const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), [
    'https://bilingual-subs.glossquote.com/index.html', 'https://bilingual-subs.glossquote.com/en/index.html'
  ]);
  assert.match(sitemap, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/); assert.doesNotMatch(sitemap, /lastmod/);
  const headers = await readFile(join(output, '_headers'), 'utf8');
  assert.equal(headers.replace('X-Robots-Tag: index, follow', 'X-Robots-Tag: noindex, nofollow, noarchive'),
    await readFile(join(directory, 'public/_headers'), 'utf8'));
  assert.match(headers, /connect-src 'none'/); assert.match(headers, /script-src 'self'/);
  for (const row of manifest.files) {
    const bytes = await readFile(join(output, row.path)); assert.equal(bytes.length, row.bytes); assert.equal(digest(bytes), row.sha256);
  }
  assert.deepEqual(await snapshot(join(directory, 'public')), original);
  assert.equal((await checkRelease(directory)).published, false);
}));

test('RP03/08 identical rebuild reuses bytes and deterministic manifest without rewriting', async () => workspace(async directory => {
  const before = await inventory(join(directory, 'release-artifacts'));
  const manifestPath = join(directory, 'release-artifacts/manifest.json'); const stat = await lstat(manifestPath);
  assert.equal((await buildRelease(directory)).reused, true);
  assert.deepEqual(await inventory(join(directory, 'release-artifacts')), before);
  assert.equal((await lstat(manifestPath)).mtimeMs, stat.mtimeMs);
  assert.equal((await checkRelease(directory)).files, 18);
}));

test('RP03 check with missing release does not create files', async () => workspace(async directory => {
  const before = await inventory(directory); await assert.rejects(() => checkRelease(directory), /RELEASE_DIRECTORY_MISSING/);
  assert.deepEqual(await inventory(directory), before);
}, { built: false }));

for (const [name, mutate] of [
  ['tampered runtime', async directory => { await writeFile(join(directory, 'release-artifacts/site/js/app.js'), 'synthetic changed runtime\n'); }],
  ['extra site file', async directory => { await writeFile(join(directory, 'release-artifacts/site/operator-note.txt'), 'synthetic preserve'); }],
  ['extra site directory', async directory => { await mkdir(join(directory, 'release-artifacts/site/unmanaged')); }],
  ['missing expected asset', async directory => { await rm(join(directory, 'release-artifacts/site/js/ui.js')); }],
  ['extra output-root file', async directory => { await writeFile(join(directory, 'release-artifacts/operator-note.txt'), 'synthetic preserve'); }],
  ['manifest incorrectly included in site', async directory => { await cp(join(directory, 'release-artifacts/manifest.json'), join(directory, 'release-artifacts/site/manifest.json')); }],
  ['wrong manifest origin', async directory => {
    const path = join(directory, 'release-artifacts/manifest.json'); const value = JSON.parse(await readFile(path)); value.origin = 'https://wrong.glossquote.com'; await writeFile(path, JSON.stringify(value, null, 2) + '\n');
  }],
  ['duplicate manifest path', async directory => {
    const path = join(directory, 'release-artifacts/manifest.json'); const value = JSON.parse(await readFile(path)); value.files[1] = value.files[0]; await writeFile(path, JSON.stringify(value, null, 2) + '\n');
  }],
  ['traversal manifest path', async directory => {
    const path = join(directory, 'release-artifacts/manifest.json'); const value = JSON.parse(await readFile(path)); value.files[0].path = '../unmanaged'; await writeFile(path, JSON.stringify(value, null, 2) + '\n');
  }],
  ['unknown manifest property', async directory => {
    const path = join(directory, 'release-artifacts/manifest.json'); const value = JSON.parse(await readFile(path)); value.verifiedLive = true; await writeFile(path, JSON.stringify(value, null, 2) + '\n');
  }],
  ['polluted robots', async directory => { await writeFile(join(directory, 'release-artifacts/site/robots.txt'), 'User-agent: *\nDisallow: /\n'); }],
  ['extra sitemap URL', async directory => { const path = join(directory, 'release-artifacts/site/sitemap.xml'); await writeFile(path, (await readFile(path, 'utf8')).replace('</urlset>', '<url><loc>https://evil.invalid/</loc></url></urlset>')); }],
  ['weakened CSP', async directory => { const path = join(directory, 'release-artifacts/site/_headers'); await writeFile(path, (await readFile(path, 'utf8')).replace("connect-src 'none'", 'connect-src *')); }]
]) {
  test(`RP03/07/08 reject ${name}; check/build preserve every existing byte`, async () => workspace(async directory => {
    await mutate(directory); await rejectedWithoutWrite(directory);
  }));
}

test('RP07 asset and manifest forged together still rejected', async () => workspace(async directory => {
  const path = 'js/app.js', bytes = Buffer.from('synthetic forged runtime\n');
  await writeFile(join(directory, 'release-artifacts/site', path), bytes); await forgedManifest(directory, path, bytes);
  await rejectedWithoutWrite(directory, /RELEASE_MANIFEST_MISMATCH|RELEASE_BYTES_MISMATCH/);
}));

for (const [name, mutate, error] of [
  ['wrong-domain canonical', html => html.replace('rel="canonical" href="https://bilingual-subs', 'rel="canonical" href="https://wrong'), /RELEASE_HTML_CANONICAL/],
  ['duplicate canonical', html => html.replace('</head>', '<link rel="canonical" href="https://bilingual-subs.glossquote.com/index.html">\n</head>'), /RELEASE_HTML_CANONICAL/],
  ['wrong English alternate', html => html.replace('hreflang="en" href="https://bilingual-subs.glossquote.com/en/index.html"', 'hreflang="en" href="https://bilingual-subs.glossquote.com/index.html"'), /RELEASE_HTML_ALTERNATES/],
  ['duplicate alternate language', html => html.replace('hreflang="x-default"', 'hreflang="en"'), /RELEASE_HTML_ALTERNATES/],
  ['robots in body instead of head', html => html.replace('  <meta name="robots" content="index,follow">\n', '').replace('<body>', '<body>\n<meta name="robots" content="index,follow">'), /RELEASE_HTML_META/],
  ['incorrect visible heading', html => html.replace('把兩份 SRT 合成雙語字幕', 'synthetic false heading'), /RELEASE_HTML_CONTENT/]
]) {
  test(`RP04/07 semantic auditor rejects ${name} even with matching forged manifest hashes`, async () => workspace(async directory => {
    const path = 'index.html', bytes = Buffer.from(mutate(await readFile(join(directory, 'release-artifacts/site', path), 'utf8')));
    assert.throws(() => auditReleaseHtml(bytes, path), error);
    await writeFile(join(directory, 'release-artifacts/site', path), bytes); await forgedManifest(directory, path, bytes);
    await rejectedWithoutWrite(directory);
  }));
}

test('RP07/08 changed source rejected before output creation and after existing build', async () => {
  for (const built of [false, true]) await workspace(async directory => {
    const source = join(directory, 'public/js/app.js'); await writeFile(source, (await readFile(source, 'utf8')) + '\n// synthetic source change\n');
    await rejectedWithoutWrite(directory, /RELEASE_SOURCE_CHANGED/);
  }, { built });
});

test('RP03 unknown source file rejected before writes', async () => workspace(async directory => {
  await writeFile(join(directory, 'public/unmanaged.txt'), 'synthetic'); await rejectedWithoutWrite(directory, /UNKNOWN_FILE/);
}, { built: false }));

test('RP03 unmanaged empty or partial output is not adopted or overwritten', async () => {
  for (const partial of [false, true]) await workspace(async directory => {
    const output = join(directory, 'release-artifacts'); await mkdir(output);
    if (partial) { await mkdir(join(output, 'site')); await writeFile(join(output, 'site/index.html'), 'synthetic preserve'); }
    await rejectedWithoutWrite(directory, /RELEASE_UNMANAGED_OUTPUT/);
  }, { built: false });
});

for (const scope of ['source-js', 'site', 'release-root']) {
  test(`RP03 ${scope} junction rejected without following or changing it`, async () => workspace(async directory => {
    const original = scope === 'source-js' ? join(directory, 'public/js') : scope === 'site' ? join(directory, 'release-artifacts/site') : join(directory, 'release-artifacts');
    const target = join(directory, 'synthetic-junction-target');
    // Both exact resolved paths are checked before moving a recursive directory on Windows.
    assert.ok(inside(directory, resolve(original)) && inside(directory, resolve(target)));
    await rename(original, target); await symlink(target, original, 'junction');
    await rejectedWithoutWrite(directory, /LINK_|RELEASE_DIRECTORY_UNSAFE|RELEASE_LINK/);
  }));
}

test('M2A exact assets-only domain/config with telemetry disabled and fixed build command', async () => {
  const raw = await readFile(join(root, 'wrangler.jsonc'), 'utf8'), config = JSON.parse(raw);
  assert.deepEqual(config, {
    name: 'glossquote-subtitle-bilingual', compatibility_date: '2026-10-24',
    workers_dev: false, preview_urls: false, send_metrics: false,
    observability: { enabled: false, logs: { enabled: false, invocation_logs: false }, traces: { enabled: false } },
    routes: [{ pattern: 'bilingual-subs.glossquote.com', custom_domain: true }],
    assets: { directory: './release-artifacts/site', run_worker_first: false, html_handling: 'none', not_found_handling: 'none' },
    build: { command: 'npm run build:release' }
  });
  assert.equal((await checkHostingConfig(root)).sha256, digest(Buffer.from(raw)));
  assert.equal('main' in config, false); assert.equal('vars' in config, false); assert.equal('analytics_engine_datasets' in config, false);
});

for (const [name, change] of [
  ['worker name', value => { value.name = 'wrong-worker'; }],
  ['compatibility date', value => { value.compatibility_date = '2026-10-27'; }],
  ['workers.dev enabled', value => { value.workers_dev = true; }],
  ['preview URLs enabled', value => { value.preview_urls = true; }],
  ['metrics enabled', value => { value.send_metrics = true; }],
  ['observability enabled', value => { value.observability.enabled = true; }],
  ['logs enabled', value => { value.observability.logs.enabled = true; }],
  ['invocation logs enabled', value => { value.observability.logs.invocation_logs = true; }],
  ['traces enabled', value => { value.observability.traces.enabled = true; }],
  ['wrong domain', value => { value.routes[0].pattern = 'date.glossquote.com'; }],
  ['domain with wildcard path', value => { value.routes[0].pattern = 'bilingual-subs.glossquote.com/*'; }],
  ['custom domain disabled', value => { value.routes[0].custom_domain = false; }],
  ['extra route', value => { value.routes.push({ pattern: '040141.xyz', custom_domain: true }); }],
  ['preview assets path', value => { value.assets.directory = './public'; }],
  ['path traversal', value => { value.assets.directory = '../outside'; }],
  ['runtime before assets', value => { value.assets.run_worker_first = true; }],
  ['HTML rewriting', value => { value.assets.html_handling = 'auto-trailing-slash'; }],
  ['SPA fallback', value => { value.assets.not_found_handling = 'single-page-application'; }],
  ['deploy instead of build', value => { value.build.command = 'wrangler deploy'; }],
  ['extra runtime entry', value => { value.main = 'src/worker.js'; }],
  ['analytics binding', value => { value.analytics_engine_datasets = [{ binding: 'TRACKING' }]; }],
  ['storage binding', value => { value.kv_namespaces = [{ binding: 'DATA', id: 'synthetic' }]; }],
  ['environment override', value => { value.env = { production: { workers_dev: true } }; }]
]) test(`M2A rejects ${name} before writing any output`, async () => workspace(async directory => {
  const path = join(directory, 'wrangler.jsonc'), config = JSON.parse(await readFile(path, 'utf8'));
  change(config); await writeFile(path, JSON.stringify(config, null, 2) + '\n');
  await assert.rejects(() => checkHostingConfig(directory), /RELEASE_HOSTING_CONFIG_MISMATCH/);
  await rejectedWithoutWrite(directory, /RELEASE_HOSTING_CONFIG_MISMATCH/);
}));

test('M2A rejects duplicate JSON keys even when the last value is the allowed value', async () => workspace(async directory => {
  const path = join(directory, 'wrangler.jsonc'), raw = await readFile(path, 'utf8');
  await writeFile(path, raw.replace('"send_metrics": false,', '"send_metrics": true,\n  "send_metrics": false,'));
  await rejectedWithoutWrite(directory, /RELEASE_HOSTING_CONFIG_MISMATCH/);
}));
test('M2A missing hosting file is not adopted or written automatically', async () => workspace(async directory => {
  await rm(join(directory, 'wrangler.jsonc')); await rejectedWithoutWrite(directory, /RELEASE_HOSTING_CONFIG_MISSING/);
}));
test('M2A directory in place of hosting config is rejected', async () => workspace(async directory => {
  const path = join(directory, 'wrangler.jsonc'); await rm(path); await mkdir(path);
  await rejectedWithoutWrite(directory, /RELEASE_HOSTING_CONFIG_UNSAFE/);
}));

for (const [path, slogans] of [
  ['index.html', ['候選版，尚未發布', '尚未正式上線', '瀏覽器尚未驗證', '尚未&#x767c;布']],
  ['en/index.html', ['Release candidate', 'Not yet published', 'Not browser-verified', 'Not yet &#112;ublished']]
]) for (const slogan of slogans) test(`M2A rejects release-stage copy ${path}: ${slogan}`, async () => workspace(async directory => {
  const bytes = Buffer.from((await readFile(join(directory, 'release-artifacts/site', path), 'utf8')).replace('<body>', `<body>\n<p>${slogan}</p>`));
  assert.throws(() => auditReleaseHtml(bytes, path), /RELEASE_STAGE_COPY/);
  await writeFile(join(directory, 'release-artifacts/site', path), bytes); await forgedManifest(directory, path, bytes);
  await rejectedWithoutWrite(directory);
}));

for (const path of ['index.html', 'en/index.html']) for (const [name, injected] of [
  ['external analytics', '<script src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="synthetic"></script>'],
  ['inline analytics', '<script>globalThis.syntheticAnalytics = true</script>'],
  ['remote stylesheet', '<link rel="stylesheet" href="https://evil.invalid/tracker.css">']
]) test(`M2A rejects ${name} in ${path} without executing it`, async () => workspace(async directory => {
  const bytes = Buffer.from((await readFile(join(directory, 'release-artifacts/site', path), 'utf8')).replace('</head>', `${injected}\n</head>`));
  assert.throws(() => auditReleaseHtml(bytes, path), /RELEASE_HTML_ASSETS/);
  await writeFile(join(directory, 'release-artifacts/site', path), bytes); await forgedManifest(directory, path, bytes);
  await rejectedWithoutWrite(directory);
}));

for (const [name, text] of [
  ['302 status', '/ /index.html 302\n/en /en/index.html 301\n/en/ /en/index.html 301\n'],
  ['external target', '/ https://evil.invalid/index.html 301\n/en /en/index.html 301\n/en/ /en/index.html 301\n'],
  ['missing en rules', '/ /index.html 301\n'],
  ['literal backslash n', '/ /index.html 301\\n/en /en/index.html 301\\n/en/ /en/index.html 301\\n'],
  ['extra rule', '/ /index.html 301\n/en /en/index.html 301\n/en/ /en/index.html 301\n/private /index.html 301\n']
]) test(`M2A rejects redirect ${name}, including a forged matching manifest row`, async () => workspace(async directory => {
  const bytes = Buffer.from(text), path = '_redirects';
  await writeFile(join(directory, 'release-artifacts/site', path), bytes); await forgedManifest(directory, path, bytes);
  await rejectedWithoutWrite(directory);
}));

// Independent reconstruction of the already-frozen M1B fixture. The known SHA is the oracle.
// No production build/check function is used to generate this previous-version input.
async function previousRelease(directory) {
  const output = join(directory, 'release-artifacts'), site = join(output, 'site');
  await mkdir(site, { recursive: true });
  const paths = [...PUBLIC_FILES, 'sitemap.xml'].sort();
  for (const path of paths) {
    let bytes;
    if (path === 'sitemap.xml') bytes = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://bilingual-subs.glossquote.com/index.html</loc></url>\n  <url><loc>https://bilingual-subs.glossquote.com/en/index.html</loc></url>\n</urlset>\n');
    else {
      bytes = await readFile(join(directory, 'public', path));
      if (path.endsWith('.html')) {
        const links = `  <link rel="canonical" href="https://bilingual-subs.glossquote.com/${path}">\n` +
          '  <link rel="alternate" hreflang="zh-Hant" href="https://bilingual-subs.glossquote.com/index.html">\n' +
          '  <link rel="alternate" hreflang="en" href="https://bilingual-subs.glossquote.com/en/index.html">\n' +
          '  <link rel="alternate" hreflang="x-default" href="https://bilingual-subs.glossquote.com/index.html">\n';
        bytes = Buffer.from(bytes.toString().replace('content="noindex,nofollow,noarchive"', 'content="index,follow"').replace('</head>', `${links}</head>`));
      } else if (path === '_headers') bytes = Buffer.from(bytes.toString().replace('X-Robots-Tag: noindex, nofollow, noarchive', 'X-Robots-Tag: index, follow'));
      else if (path === 'robots.txt') bytes = Buffer.from('User-agent: *\nAllow: /\nSitemap: https://bilingual-subs.glossquote.com/sitemap.xml\n');
    }
    const target = join(site, path); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
  }
  const rows = await Promise.all(paths.map(async path => { const bytes = await readFile(join(site, path)); return { path, bytes: bytes.length, sha256: digest(bytes) }; }));
  const text = JSON.stringify({ schemaVersion: 1, mode: 'release-candidate', origin: 'https://bilingual-subs.glossquote.com',
    toolSlug: 'subtitle-bilingual', files: rows, sourceFiles: await snapshot(join(directory, 'public')) }, null, 2) + '\n';
  assert.equal(digest(Buffer.from(text)), '7c0572463e122fe437d97d5f1d47381bbc53f4a30e1006f11fe0d8195c2ffc00');
  await writeFile(join(output, 'manifest.json'), text, { flag: 'wx' });
}
async function backUpPrevious(directory) {
  const parent = join(directory, 'evidence/m2a/before'); await mkdir(parent, { recursive: true });
  await cp(join(directory, 'release-artifacts'), join(parent, 'release-artifacts'), { recursive: true });
  return join(parent, 'release-artifacts');
}
test('M2A exact previous version migrates only after full backup verification, preserving all 17 old site files', async () => workspace(async directory => {
  await previousRelease(directory); const backup = await backUpPrevious(directory);
  const beforeSite = await inventory(join(directory, 'release-artifacts/site')), beforeBackup = await inventory(backup);
  const result = await buildRelease(directory);
  assert.equal(result.migrated, true); assert.equal(result.files, 18);
  assert.equal(result.previousManifestSha256, '7c0572463e122fe437d97d5f1d47381bbc53f4a30e1006f11fe0d8195c2ffc00');
  assert.deepEqual((await inventory(join(directory, 'release-artifacts/site'))).filter(row => row.path !== '_redirects'), beforeSite);
  assert.deepEqual(await inventory(backup), beforeBackup);
  assert.equal((await buildRelease(directory)).reused, true);
}, { built: false }));
test('M2A previous version without a complete backup refuses upgrade without writes', async () => workspace(async directory => {
  await previousRelease(directory); await rejectedWithoutWrite(directory);
}, { built: false }));
test('M2A modified old artifact refuses upgrade and never overwrites it', async () => workspace(async directory => {
  await previousRelease(directory); await backUpPrevious(directory);
  await writeFile(join(directory, 'release-artifacts/site/js/app.js'), 'synthetic preserve modified artifact');
  await rejectedWithoutWrite(directory);
}, { built: false }));
test('M2A modified backup refuses upgrade and remains untouched', async () => workspace(async directory => {
  await previousRelease(directory); const backup = await backUpPrevious(directory);
  await writeFile(join(backup, 'site/js/app.js'), 'synthetic preserve modified backup'); await rejectedWithoutWrite(directory);
}, { built: false }));
