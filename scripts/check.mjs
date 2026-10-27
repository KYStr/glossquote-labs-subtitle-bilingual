import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PUBLIC_FILES, inspectTree } from './files.mjs';
import { checkHostingConfig } from './release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function checkPublic(directory = resolve(root, 'public')) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('NODE_24_REQUIRED');
  await inspectTree(directory);
  const texts = new Map(await Promise.all(PUBLIC_FILES.map(async path => [path, await readFile(resolve(directory, path), 'utf8')])));
  for (const [path, text] of texts) {
    if (/\b(?:innerHTML|outerHTML|insertAdjacentHTML|eval|localStorage|sessionStorage|indexedDB|sendBeacon|fetch|XMLHttpRequest|WebSocket|serviceWorker)\b|document\s*\.\s*(?:write|cookie)|console\s*\./.test(text)) throw new Error(`FORBIDDEN_API: ${path}`);
    if (/@import|url\s*\(\s*["']?\s*(?:https?:|\/\/)|<(?:script|link|img|iframe)[^>]*(?:src|href)=["'](?:https?:|\/\/)/i.test(text)) throw new Error(`REMOTE_RESOURCE: ${path}`);
    if (path.endsWith('.js')) {
      const checked = spawnSync(process.execPath, ['--check', resolve(directory, path)], { shell: false, windowsHide: true, encoding: 'utf8' });
      if (checked.status !== 0) throw new Error(`SYNTAX: ${path}`);
      for (const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
        if (!match[1].startsWith('./')) throw new Error(`NONLOCAL_IMPORT: ${path}`);
        const target = new URL(match[1], `https://local.invalid/${path}`).pathname.slice(1);
        if (!PUBLIC_FILES.includes(target)) throw new Error(`MISSING_IMPORT: ${path}`);
      }
    }
  }
  const expected = [
    ['index.html', 'zh-Hant', '雙語字幕合併｜Gloss Tools', '把兩份 SRT 合成雙語字幕', './en/index.html', 'https://glossquote.com/index.html', '在本機合併兩份 SRT 字幕，按時間重疊配對、檢查歧義並保留未配對字幕，再下載雙語 SRT。'],
    ['en/index.html', 'en', 'Merge Bilingual Subtitles | Gloss Tools', 'Merge two SRT files into bilingual subtitles', '../index.html', 'https://glossquote.com/en/index.html', 'Match two SRT files by timeline, review ambiguous and unmatched cues, then download a bilingual SRT locally.']
  ];
  let firstIds;
  for (const [path, lang, title, h1, language, home, description] of expected) {
    const html = texts.get(path);
    if (!html.includes(`<html lang="${lang}">`) || !html.includes(`<title>${title}</title>`) || !html.includes(`<h1>${h1}</h1>`) ||
      !html.includes(`<meta name="description" content="${description}">`) || !html.includes('<meta name="robots" content="noindex,nofollow,noarchive">')) throw new Error(`PAGE_SEMANTICS: ${path}`);
    if ((html.match(/<h1>/g) ?? []).length !== 1 || (html.match(/<title>/g) ?? []).length !== 1) throw new Error(`DUPLICATE_HEADING: ${path}`);
    if (!html.includes(`href="${language}" aria-describedby="language-warning"`) || !html.includes(`href="${home}"`)) throw new Error(`NAVIGATION: ${path}`);
    if ((html.match(/<details>/g) ?? []).length !== 9) throw new Error(`FAQ_COUNT: ${path}`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    if (new Set(ids).size !== ids.length) throw new Error(`DUPLICATE_ID: ${path}`);
    if (firstIds && JSON.stringify([...ids].sort()) !== JSON.stringify(firstIds)) throw new Error('LOCALE_STRUCTURE');
    firstIds = [...ids].sort();
    for (const reference of html.matchAll(/(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
      for (const id of reference[1].split(' ')) if (!ids.includes(id)) throw new Error(`MISSING_LABEL_TARGET: ${id}`);
    }
    for (const link of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if ([home, '#workspace'].includes(link[1])) continue;
      const target = new URL(link[1], `https://local.invalid/${path}`);
      if (target.origin !== 'https://local.invalid' || target.search || target.hash || !PUBLIC_FILES.includes(target.pathname.slice(1))) throw new Error(`UNSAFE_LINK: ${path}`);
    }
  }
  for (const id of texts.get('js/ui.js').matchAll(/\$\('([^']+)'\)/g)) {
    if (!firstIds.includes(id[1])) throw new Error(`UI_TARGET: ${id[1]}`);
  }
  if (!texts.get('_headers').includes("connect-src 'none'") || !texts.get('_headers').includes('X-Robots-Tag: noindex, nofollow, noarchive') ||
    texts.get('robots.txt').trim() !== 'User-agent: *\nDisallow: /') throw new Error('PREVIEW_HEADERS');
  return { files: texts.size, pages: 2, syntax: PUBLIC_FILES.filter(path => path.endsWith('.js')).length };
}

export async function checkPackage() {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (pkg.private !== true || pkg.type !== 'module' || pkg.engines?.node !== '>=24' ||
    ['dependencies', 'devDependencies', 'optionalDependencies'].some(key => Object.keys(pkg[key] ?? {}).length)) throw new Error('PACKAGE_CONTRACT');
  if (JSON.stringify(pkg.scripts) !== JSON.stringify({ dev: 'node scripts/serve.mjs', test: 'node --test test/*.test.mjs', check: 'node scripts/check.mjs', build: 'node scripts/build.mjs',
    'build:release': 'node scripts/release.mjs build', 'check:release': 'node scripts/release.mjs check' })) throw new Error('PACKAGE_SCRIPTS');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await checkPackage(); const hosting = await checkHostingConfig(); console.log(JSON.stringify({ status: 'PASS', ...await checkPublic(), hosting })); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
