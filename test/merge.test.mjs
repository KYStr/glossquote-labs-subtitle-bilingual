import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { matchCues } from '../public/js/core/match.js';
import { parseSrt } from '../public/js/core/parse-srt.js';
import { serializeSrt, formatTimestamp } from '../public/js/core/serialize-srt.js';
import { bytes, cue, MAIN, SECONDARY, EXPECTED } from '../scripts/fixtures.mjs';

test('AC14 stable start, main-before-secondary and source order; multiline matched text', () => {
  const result = matchCues([cue(0, 2000, 3000, 'main-later'), cue(1, 0, 1000, 'main-first', 'main-second')],
    [cue(0, 0, 400, 'secondary-alone'), cue(1, 0, 700, 'secondary-match'), cue(2, 2000, 2400, 'secondary-later')]);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.outputCues, [
    { startMs: 0, endMs: 1000, lines: ['main-first', 'main-second', 'secondary-match'], origin: { mainCueIndex: 1, secondaryCueIndex: 1 } },
    { startMs: 0, endMs: 400, lines: ['secondary-alone'], origin: { mainCueIndex: null, secondaryCueIndex: 0 } },
    { startMs: 2000, endMs: 3000, lines: ['main-later'], origin: { mainCueIndex: 0, secondaryCueIndex: null } },
    { startMs: 2000, endMs: 2400, lines: ['secondary-later'], origin: { mainCueIndex: null, secondaryCueIndex: 2 } }
  ]);
});
test('AC14 equal starts on main-only cues use original index even if ends differ', () => {
  const result = matchCues([cue(0, 0, 1000, 'first'), cue(1, 0, 2000, 'second')], []);
  assert.deepEqual(result.outputCues.map(value => value.lines), [['first'], ['second']]);
});
test('AC16 exact serialization, numbering, one blank line and final LF', () => {
  const output = [
    { startMs: 3_600_001_002, endMs: 3_600_002_003, lines: ['later'], origin: { mainCueIndex: 1, secondaryCueIndex: null } },
    { startMs: 0, endMs: 1000, lines: ['A', 'B'], origin: { mainCueIndex: 0, secondaryCueIndex: 0 } }
  ];
  assert.equal(serializeSrt(output), '1\n00:00:00,000 --> 00:00:01,000\nA\nB\n\n2\n1000:00:01,002 --> 1000:00:02,003\nlater\n');
  assert.equal(serializeSrt([]), '');
  assert.equal(formatTimestamp(359_999_999_999_999), '99999999:59:59,999');
});
test('AC17 styling-looking and script-looking text stays opaque in SRT', () => {
  const result = matchCues([cue(0, 0, 1000, '<script>alert(1)</script>')], [cue(0, 0, 1000, '<b>乙</b>')]);
  assert.equal(serializeSrt(result.outputCues), '1\n00:00:00,000 --> 00:00:01,000\n<script>alert(1)</script>\n<b>乙</b>\n');
});
test('AC07/16 actual artifact bytes match an independently written SRT oracle', async () => {
  const main = parseSrt(bytes(MAIN)), secondary = parseSrt(bytes(SECONDARY));
  const result = matchCues(main.cues, secondary.cues);
  const actual = bytes(serializeSrt(result.outputCues));
  assert.deepEqual(new Uint8Array(actual), new Uint8Array(bytes(EXPECTED)));
  assert.notEqual(new Uint8Array(actual)[0], 0xef);
  const directory = new URL('../evidence/m2a/oracle/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('main.synthetic.srt', directory), new Uint8Array(bytes(MAIN)));
  await writeFile(new URL('secondary.synthetic.srt', directory), new Uint8Array(bytes(SECONDARY)));
  await writeFile(new URL('expected.srt', directory), new Uint8Array(bytes(EXPECTED)));
  await writeFile(new URL('actual.srt', directory), new Uint8Array(actual));
  assert.deepEqual(await readFile(new URL('actual.srt', directory)), Buffer.from(EXPECTED));
  await writeFile(new URL('result.json', directory), JSON.stringify(result, null, 2) + '\n');
  await writeFile(new URL('artifact.json', directory), JSON.stringify({ synthetic: true, bytes: actual.byteLength,
    sha256: createHash('sha256').update(new Uint8Array(actual)).digest('hex'), oracle: 'handwritten EXPECTED constant; byte equality verified' }, null, 2) + '\n');
});
