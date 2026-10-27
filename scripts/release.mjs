import { lstat, readdir, readFile, mkdir, writeFile, open } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES, inspectTree, sha256 } from './files.mjs';

export const ORIGIN = 'https://bilingual-subs.glossquote.com';
export const TOOL_SLUG = 'subtitle-bilingual';
// Fixed M1 public bytes, not a value read from the editable release manifest.
export const M1_PUBLIC_FINGERPRINT = '70979b1ef42cf37cae7034124f813e18f3553e1378a92bdd2cca03538dbf3b55';
export const SITE_FILES = Object.freeze([...new Set([...PUBLIC_FILES, 'robots.txt', '_headers', 'sitemap.xml', '_redirects'])].sort());
const legacyManifestSha256 = '7c0572463e122fe437d97d5f1d47381bbc53f4a30e1006f11fe0d8195c2ffc00';
const toolRoot = fileURLToPath(new URL('../', import.meta.url));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const rowsFor = map => [...map.keys()].sort().map(path => ({ path, bytes: map.get(path).byteLength, sha256: sha256(map.get(path)) }));
const manifestText = manifest => JSON.stringify(manifest, null, 2) + '\n';
const decoder = new TextDecoder('utf-8', { fatal: true });

export function releaseMode(args) {
  if (args.length !== 1 || !['build', 'check'].includes(args[0])) fail('RELEASE_ARGUMENTS');
  return args[0];
}

function fixedOrigin() {
  const url = new URL(ORIGIN);
  if (url.protocol !== 'https:' || url.origin !== ORIGIN || url.hostname !== 'bilingual-subs.glossquote.com' ||
    url.pathname !== '/' || url.username || url.password || url.port || url.search || url.hash) fail('RELEASE_ORIGIN');
}

// Fixed assets-only hosting contract. No environment, CLI or binding overrides.
const hostingText = JSON.stringify({
  name: 'glossquote-subtitle-bilingual', compatibility_date: '2026-10-24',
  workers_dev: false, preview_urls: false, send_metrics: false,
  observability: { enabled: false, logs: { enabled: false, invocation_logs: false }, traces: { enabled: false } },
  routes: [{ pattern: 'bilingual-subs.glossquote.com', custom_domain: true }],
  assets: { directory: './release-artifacts/site', run_worker_first: false, html_handling: 'none', not_found_handling: 'none' },
  build: { command: 'npm run build:release' }
}, null, 2) + '\n';

export async function checkHostingConfig(root = toolRoot) {
  const path = resolve(root, 'wrangler.jsonc');
  let info;
  try { info = await lstat(path); } catch { fail('RELEASE_HOSTING_CONFIG_MISSING'); }
  if (info.isSymbolicLink() || !info.isFile()) fail('RELEASE_HOSTING_CONFIG_UNSAFE');
  const actual = await readFile(path, 'utf8');
  try { JSON.parse(actual); } catch { fail('RELEASE_HOSTING_CONFIG_JSON'); }
  // Canonical JSON (a JSONC subset) also rejects duplicate keys, comments and hidden overrides.
  if (actual !== hostingText) fail('RELEASE_HOSTING_CONFIG_MISMATCH');
  return { name: 'glossquote-subtitle-bilingual', domain: 'bilingual-subs.glossquote.com',
    assets: './release-artifacts/site', sha256: sha256(actual), runtime: 'assets-only', deployed: false };
}

async function directory(path, optional = false) {
  let stat;
  try { stat = await lstat(path); }
  catch (error) { if (optional && error.code === 'ENOENT') return false; fail('RELEASE_DIRECTORY_MISSING'); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('RELEASE_DIRECTORY_UNSAFE');
  return true;
}

async function sourceBytes(root) {
  await directory(root);
  const publicRoot = resolve(root, 'public');
  await inspectTree(publicRoot);
  const data = new Map();
  for (const path of PUBLIC_FILES) data.set(path, await readFile(resolve(publicRoot, path)));
  const rows = rowsFor(data);
  if (sha256(JSON.stringify(rows)) !== M1_PUBLIC_FINGERPRINT) fail('RELEASE_SOURCE_CHANGED');
  return { data, rows };
}

function headRange(html) {
  const opens = [...html.matchAll(/<head>/g)];
  const closes = [...html.matchAll(/<\/head>/g)];
  if (opens.length !== 1 || closes.length !== 1 || opens[0].index >= closes[0].index) fail('RELEASE_HEAD');
  return { start: opens[0].index + 6, end: closes[0].index };
}

function htmlRelease(bytes, path) {
  const html = decoder.decode(bytes);
  const { start, end } = headRange(html);
  let head = html.slice(start, end);
  const previewRobots = '<meta name="robots" content="noindex,nofollow,noarchive">';
  if (head.split(previewRobots).length !== 2 || /rel=["'](?:canonical|alternate)["']/i.test(head)) fail('RELEASE_PREVIEW_SEO');
  head = head.replace(previewRobots, '<meta name="robots" content="index,follow">');
  head += `  <link rel="canonical" href="${ORIGIN}/${path}">\n`;
  for (const [lang, page] of [['zh-Hant', 'index.html'], ['en', 'en/index.html'], ['x-default', 'index.html']]) {
    head += `  <link rel="alternate" hreflang="${lang}" href="${ORIGIN}/${page}">\n`;
  }
  return Buffer.from(html.slice(0, start) + head + html.slice(end), 'utf8');
}

function headersRelease(bytes) {
  const text = decoder.decode(bytes);
  const rule = /^([ \t]*X-Robots-Tag:[ \t]*)noindex, nofollow, noarchive(?=\r?$)/gm;
  if ([...text.matchAll(rule)].length !== 1) fail('RELEASE_PREVIEW_HEADERS');
  return Buffer.from(text.replace(rule, '$1index, follow'), 'utf8');
}

// This narrow static auditor parses complete relevant tags/attributes. It is not a browser parser.
function attrs(text) {
  const values = {};
  const pattern = /\s+([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;
  let cursor = 0;
  while (cursor < text.length) {
    if (!text.slice(cursor).trim()) break;
    pattern.lastIndex = cursor;
    const match = pattern.exec(text);
    if (!match || Object.hasOwn(values, match[1].toLowerCase())) fail('RELEASE_HTML_ATTRIBUTES');
    values[match[1].toLowerCase()] = match[2] ?? match[3];
    cursor = pattern.lastIndex;
  }
  return values;
}

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^<>]*?)>`, 'gi'))].map(match => ({
    index: match.index, end: match.index + match[0].length, attrs: attrs(match[1])
  }));
}

const HTML_CONTRACT = {
  'index.html': { lang: 'zh-Hant', title: '雙語字幕合併｜Gloss Tools', h1: '把兩份 SRT 合成雙語字幕',
    description: '在本機合併兩份 SRT 字幕，按時間重疊配對、檢查歧義並保留未配對字幕，再下載雙語 SRT。' },
  'en/index.html': { lang: 'en', title: 'Merge Bilingual Subtitles | Gloss Tools', h1: 'Merge two SRT files into bilingual subtitles',
    description: 'Match two SRT files by timeline, review ambiguous and unmatched cues, then download a bilingual SRT locally.' }
};

function visibleReleaseText(html) {
  const body = /<body>([\s\S]*?)<\/body>/i.exec(html);
  if (!body) fail('RELEASE_HTML_BODY');
  const text = body[1].replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|[0-9]+);?/gi, (_, code) => {
      const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '\uFFFD';
    }).replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_, name) => ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name.toLowerCase()]);
  return text.normalize('NFKC').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/\s+/g, ' ');
}

function rejectStageCopy(html) {
  const text = visibleReleaseText(html);
  // Subtitle matching "候選/candidate" is real product terminology and remains allowed.
  if (/(?:候選\s*(?:版|網站|頁面|工具|產物)|(?:尚未|未)\s*(?:正式\s*)?(?:發布|發佈|上線)|(?:瀏覽器|browser)\s*(?:尚未|未|not yet)\s*(?:驗證|verified|tested))/i.test(text) ||
    /\b(?:release\s+candidate|unpublished|not\s+yet\s+(?:published|released|live)|preview[- ]only|candidate\s+(?:build|version|website|site)|not\s+(?:yet\s+)?browser[- ](?:verified|tested))\b/i.test(text)) fail('RELEASE_STAGE_COPY');
}

export function auditReleaseHtml(bytes, path) {
  const html = decoder.decode(bytes);
  const expected = HTML_CONTRACT[path];
  if (!expected) fail('RELEASE_HTML_PATH');
  rejectStageCopy(html);
  const range = headRange(html);
  const insideHead = tag => tag.index >= range.start && tag.end <= range.end;
  const roots = tags(html, 'html');
  if (roots.length !== 1 || roots[0].attrs.lang !== expected.lang) fail('RELEASE_HTML_LANGUAGE');
  const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)];
  const h1s = [...html.matchAll(/<h1>([\s\S]*?)<\/h1>/gi)];
  if (titles.length !== 1 || titles[0][1] !== expected.title || titles[0].index < range.start || titles[0].index >= range.end ||
    h1s.length !== 1 || h1s[0][1] !== expected.h1 || h1s[0].index < range.end) fail('RELEASE_HTML_CONTENT');
  const metas = tags(html, 'meta');
  const robots = metas.filter(tag => tag.attrs.name?.toLowerCase() === 'robots');
  const descriptions = metas.filter(tag => tag.attrs.name?.toLowerCase() === 'description');
  if (robots.length !== 1 || robots[0].attrs.content !== 'index,follow' || !insideHead(robots[0]) ||
    descriptions.length !== 1 || descriptions[0].attrs.content !== expected.description || !insideHead(descriptions[0])) fail('RELEASE_HTML_META');
  const links = tags(html, 'link');
  const scripts = tags(html, 'script');
  const scriptBodies = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const prefix = path === 'en/index.html' ? '../' : './';
  const styles = links.filter(tag => tag.attrs.rel === 'stylesheet');
  if (scripts.length !== 1 || scriptBodies.length !== 1 || scriptBodies[0][1].trim() ||
    JSON.stringify(scripts[0].attrs) !== JSON.stringify({ type: 'module', src: `${prefix}js/app.js` }) ||
    styles.length !== 1 || JSON.stringify(styles[0].attrs) !== JSON.stringify({ rel: 'stylesheet', href: `${prefix}css/app.css` }) ||
    /\bdata-cf-beacon\s*=|\bon[a-z]+\s*=|<(?:iframe|object|embed|base|img|style)\b/i.test(html)) fail('RELEASE_HTML_ASSETS');
  const canonical = links.filter(tag => tag.attrs.rel?.toLowerCase() === 'canonical');
  const alternates = links.filter(tag => tag.attrs.rel?.toLowerCase() === 'alternate');
  if (canonical.length !== 1 || canonical[0].attrs.href !== `${ORIGIN}/${path}` || !insideHead(canonical[0])) fail('RELEASE_HTML_CANONICAL');
  const languagePages = { 'zh-Hant': 'index.html', en: 'en/index.html', 'x-default': 'index.html' };
  if (alternates.length !== 3 || new Set(alternates.map(tag => tag.attrs.hreflang)).size !== 3 ||
    alternates.some(tag => !insideHead(tag) || !Object.hasOwn(languagePages, tag.attrs.hreflang) || tag.attrs.href !== `${ORIGIN}/${languagePages[tag.attrs.hreflang]}`)) fail('RELEASE_HTML_ALTERNATES');
  if (links.length !== 5) fail('RELEASE_HTML_ASSETS');
  return { path, lang: roots[0].attrs.lang, canonical: canonical[0].attrs.href,
    alternates: alternates.map(tag => ({ lang: tag.attrs.hreflang, href: tag.attrs.href })) };
}

async function expectedRelease(root) {
  if (Number(process.versions.node.split('.')[0]) !== 24) fail('NODE_24_REQUIRED');
  fixedOrigin();
  await checkHostingConfig(root);
  const source = await sourceBytes(root);
  const site = new Map(source.data);
  for (const path of Object.keys(HTML_CONTRACT)) {
    const bytes = htmlRelease(source.data.get(path), path);
    auditReleaseHtml(bytes, path);
    site.set(path, bytes);
  }
  site.set('robots.txt', Buffer.from(`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`));
  site.set('_headers', headersRelease(source.data.get('_headers')));
  site.set('_redirects', Buffer.from('/ /index.html 301\n/en /en/index.html 301\n/en/ /en/index.html 301\n'));
  site.set('sitemap.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${ORIGIN}/index.html</loc></url>\n  <url><loc>${ORIGIN}/en/index.html</loc></url>\n</urlset>\n`));
  const manifest = { schemaVersion: 1, mode: 'release-candidate', origin: ORIGIN, toolSlug: TOOL_SLUG,
    files: rowsFor(site), sourceFiles: source.rows };
  return { site, manifest, text: manifestText(manifest) };
}

async function inspectSite(siteRoot, files) {
  const allowedDirs = new Set(files.flatMap(path => {
    const chunks = path.split('/'); return chunks.slice(0, -1).map((_, i) => chunks.slice(0, i + 1).join('/'));
  }));
  const found = [];
  async function walk(path, prefix = '') {
    await directory(path);
    for (const name of (await readdir(path)).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name;
      const target = resolve(path, name);
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) fail('RELEASE_LINK');
      if (stat.isDirectory()) {
        if (!allowedDirs.has(relative)) fail('RELEASE_UNKNOWN_DIRECTORY');
        await walk(target, relative);
      } else {
        if (!stat.isFile() || !files.includes(relative)) fail('RELEASE_UNKNOWN_FILE');
        found.push(relative);
      }
    }
  }
  await walk(siteRoot);
  if (JSON.stringify(found.sort()) !== JSON.stringify(files)) fail('RELEASE_MISSING_FILE');
}

async function verifyOutput(root, expected, output = resolve(root, 'release-artifacts')) {
  await directory(output);
  const entries = (await readdir(output)).sort();
  if (JSON.stringify(entries) !== JSON.stringify(['manifest.json', 'site'])) fail('RELEASE_UNMANAGED_OUTPUT');
  const manifestPath = resolve(output, 'manifest.json');
  const info = await lstat(manifestPath);
  if (info.isSymbolicLink() || !info.isFile()) fail('RELEASE_MANIFEST_UNSAFE');
  const files = [...expected.site.keys()].sort();
  await inspectSite(resolve(output, 'site'), files);
  const actualText = await readFile(manifestPath, 'utf8');
  let manifest;
  try { manifest = JSON.parse(actualText); } catch { fail('RELEASE_MANIFEST_JSON'); }
  if (manifest.schemaVersion !== 1 || manifest.mode !== 'release-candidate' || manifest.origin !== ORIGIN || manifest.toolSlug !== TOOL_SLUG ||
    actualText !== expected.text) fail('RELEASE_MANIFEST_MISMATCH');
  for (const path of files) {
    const actual = await readFile(resolve(output, 'site', path));
    if (Object.hasOwn(HTML_CONTRACT, path)) auditReleaseHtml(actual, path);
    if (!actual.equals(expected.site.get(path))) fail('RELEASE_BYTES_MISMATCH');
  }
  // Catch a source change during generation/checking as well as one before it.
  await sourceBytes(root);
  const hosting = await checkHostingConfig(root);
  return { status: 'PASS', mode: 'release-candidate', origin: ORIGIN, toolSlug: TOOL_SLUG,
    sourceFiles: expected.manifest.sourceFiles.length, files: expected.manifest.files.length,
    siteBytes: expected.manifest.files.reduce((sum, row) => sum + row.bytes, 0), manifestSha256: sha256(actualText),
    sourceFingerprint: M1_PUBLIC_FINGERPRINT, hosting, browser: 'NOT_RUN_BY_THIS_OFFLINE_COMMAND', published: false };
}

export async function checkRelease(root = toolRoot) {
  const expected = await expectedRelease(root);
  return verifyOutput(root, expected);
}

export async function buildRelease(root = toolRoot) {
  const expected = await expectedRelease(root);
  const output = resolve(root, 'release-artifacts');
  if (await directory(output, true)) {
    try { return { ...await verifyOutput(root, expected), reused: true }; }
    catch (originalError) {
      const path = resolve(output, 'manifest.json');
      let previous;
      try {
        const stat = await lstat(path);
        if (stat.isSymbolicLink() || !stat.isFile()) throw originalError;
        previous = await readFile(path);
      } catch { throw originalError; }
      if (sha256(previous) !== legacyManifestSha256) throw originalError;
      const site = new Map(expected.site); site.delete('_redirects');
      const manifest = { ...expected.manifest, files: rowsFor(site) };
      const legacy = { site, manifest, text: manifestText(manifest) };
      if (sha256(legacy.text) !== legacyManifestSha256) fail('RELEASE_LEGACY_SOURCE_MISMATCH');
      // Only the exact root-approved old package can be migrated; require its complete backup first.
      await verifyOutput(root, legacy);
      const backup = resolve(root, 'evidence/m2a/before/release-artifacts');
      await verifyOutput(root, legacy, backup);
      const handle = await open(path, 'r+');
      try {
        if (!(await handle.readFile()).equals(previous)) fail('RELEASE_LEGACY_MANIFEST_CHANGED');
        await writeFile(resolve(output, 'site/_redirects'), expected.site.get('_redirects'), { flag: 'wx' });
        const next = Buffer.from(expected.text);
        for (let offset = 0; offset < next.length;) {
          const { bytesWritten } = await handle.write(next, offset, next.length - offset, offset);
          if (!bytesWritten) fail('RELEASE_MANIFEST_WRITE');
          offset += bytesWritten;
        }
        await handle.truncate(next.length); await handle.sync();
      } finally { await handle.close(); }
      return { ...await verifyOutput(root, expected), reused: false, migrated: true,
        previousManifestSha256: legacyManifestSha256, backup: 'evidence/m2a/before/release-artifacts' };
    }
  }
  // All sources and any existing output have been checked before the first write.
  // Exclusive creation prevents replacing a race-created file or unmanaged output.
  await mkdir(output);
  await mkdir(resolve(output, 'site'));
  for (const path of SITE_FILES) {
    const target = resolve(output, 'site', path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, expected.site.get(path), { flag: 'wx' });
  }
  await writeFile(resolve(output, 'manifest.json'), expected.text, { flag: 'wx' });
  return { ...await verifyOutput(root, expected), reused: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = releaseMode(process.argv.slice(2));
    console.log(JSON.stringify(await (mode === 'build' ? buildRelease() : checkRelease())));
  } catch (error) {
    console.error(`Release candidate rejected: ${/^(RELEASE_|NODE_24_)/.test(error.code ?? '') ? error.code : 'RELEASE_IO_OR_SOURCE_INVALID'}`);
    process.exitCode = 1;
  }
}
