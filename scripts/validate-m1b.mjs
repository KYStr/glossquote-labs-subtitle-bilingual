import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(root, 'evidence/m1b');
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const steps = [
  ['npm test', ['test'], 'npm-test-final.log'],
  ['npm run check', ['run', 'check'], 'npm-check-final.log'],
  ['npm run build:release', ['run', 'build:release'], 'npm-build-release-final.log'],
  ['npm run check:release', ['run', 'check:release'], 'npm-check-release-final.log']
];

if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('NODE_24_REQUIRED');
await access(npmCli, constants.R_OK);
await mkdir(evidence, { recursive: true });
for (const path of ['commands-final.json', ...steps.map(step => step[2])]) {
  try { await access(resolve(evidence, path)); throw new Error('FINAL_EVIDENCE_ALREADY_EXISTS'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const userConfig = resolve(evidence, 'npm-user.conf');
const globalConfig = resolve(evidence, 'npm-global.conf');
await writeFile(userConfig, '', { flag: 'wx' });
await writeFile(globalConfig, '', { flag: 'wx' });
const flags = [`--userconfig=${userConfig}`, `--globalconfig=${globalConfig}`,
  `--cache=${resolve(evidence, 'npm-cache')}`, '--logs-max=0', '--offline', '--audit=false', '--fund=false', '--update-notifier=false'];
const records = [];
for (const [command, args, log] of steps) {
  const child = spawnSync(process.execPath, [npmCli, ...flags, ...args], {
    cwd: root, shell: false, windowsHide: true, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024
  });
  const output = (child.stdout ?? '') + (child.stderr ? `\n${child.stderr}` : '');
  await writeFile(resolve(evidence, log), output, { flag: 'wx' });
  records.push({ command, exit: child.status, signal: child.signal, error: child.error?.code ?? null, log });
  console.log(JSON.stringify(records.at(-1)));
  if (child.status !== 0) break;
}
const testRecord = records.find(row => row.command === 'npm test');
const testText = testRecord ? await readFile(resolve(evidence, testRecord.log), 'utf8') : '';
const counts = {};
for (const label of ['tests', 'pass', 'fail', 'skipped']) {
  const match = new RegExp(`(?:^|\\n)[^\\n]*?\\b${label} (\\d+)(?:\\r?\\n|$)`).exec(testText);
  if (match) counts[label] = Number(match[1]);
}
const result = { status: records.length === steps.length && records.every(row => row.exit === 0) ? 'PASS' : 'FAIL',
  node: process.version, commands: records, tests: counts,
  npmInvocation: 'Existing npm-cli.js through current Node; shell:false/windowsHide:true; offline, update checks disabled, empty task-local user/global config and task-local cache; no install.',
  browser: 'NOT_RUN_USER_FOCUS_INCIDENT', publication: 'NOT_PUBLISHED' };
await writeFile(resolve(evidence, 'commands-final.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, tests: counts }));
if (result.status !== 'PASS') process.exitCode = 1;
