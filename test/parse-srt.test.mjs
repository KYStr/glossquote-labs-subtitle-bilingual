import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt, parseTimestamp } from '../public/js/core/parse-srt.js';
import { MAX_FILE_BYTES } from '../public/js/core/decode.js';
import { bytes } from '../scripts/fixtures.mjs';

const text = '1\n00:00:01,000 --> 00:00:02,003\n甲 <script>alert(1)</script>\nsecond line\n\n2\n00:00:00,000 --> 00:00:00,001\n乙\n';
const expected = [
  { sourceIndex: 0, startMs: 1000, endMs: 2003, textLines: ['甲 <script>alert(1)</script>', 'second line'] },
  { sourceIndex: 1, startMs: 0, endMs: 1, textLines: ['乙'] }
];
for (const newline of ['\n', '\r\n', '\r']) {
  test(`AC01 parser newline ${JSON.stringify(newline)} preserves source order and text`, () => {
    assert.deepEqual(parseSrt(bytes(text.replaceAll('\n', newline))), { ok: true, cues: expected });
  });
}
test('AC02 one BOM is accepted and trailing empty lines ignored', () => {
  assert.deepEqual(parseSrt(bytes('\uFEFF' + text + '\n\n')), { ok: true, cues: expected });
});
const invalid = [
  ['double BOM', '\uFEFF\uFEFF' + text, 'INVALID_SRT', 3],
  ['empty file', '', 'INVALID_SRT', 0],
  ['empty text', '1\n00:00:00,000 --> 00:00:01,000\n\n', 'INVALID_SRT', 33],
  ['whitespace text', '1\n00:00:00,000 --> 00:00:01,000\n \n', 'INVALID_SRT', 32],
  ['starts at 2', text.replace(/^1/, '2'), 'INVALID_CUE_ORDER', 0],
  ['skipped cue number', text.replace('\n2\n', '\n3\n'), 'INVALID_CUE_ORDER'],
  ['hex number', text.replace(/^1/, '0x1'), 'INVALID_CUE_ORDER', 0],
  ['leading zero', text.replace(/^1/, '01'), 'INVALID_CUE_ORDER', 0],
  ['missing timestamp', '1', 'INVALID_SRT', 1],
  ['timestamp settings', text.replace('02,003', '02,003 X1:10'), 'INVALID_TIMECODE', 2],
  ['extra block', text + '\nextra', 'INVALID_CUE_ORDER'],
  ['minutes 60', text.replace('00:00:01,000', '00:60:01,000'), 'INVALID_TIMECODE', 2],
  ['seconds 60', text.replace('00:00:01,000', '00:00:60,000'), 'INVALID_TIMECODE', 2],
  ['short milliseconds', text.replace('01,000', '01,00'), 'INVALID_TIMECODE', 2],
  ['dot milliseconds', text.replace('01,000', '01.000'), 'INVALID_TIMECODE', 2],
  ['equal times', '1\n00:00:01,000 --> 00:00:01,000\nA', 'INVALID_TIMECODE', 2],
  ['backward times', '1\n00:00:02,000 --> 00:00:01,000\nA', 'INVALID_TIMECODE', 2],
  ['one hour digit', '1\n0:00:00,000 --> 00:00:01,000\nA', 'INVALID_TIMECODE', 2],
  ['nine hour digits', '1\n000000000:00:00,000 --> 00:00:01,000\nA', 'INVALID_TIMECODE', 2],
  ['unsafe time', '1\n999999999999:00:00,000 --> 999999999999:00:00,001\nA', 'INVALID_TIMECODE', 2]
];
for (const [name, input, code, offset] of invalid) {
  test(`AC02–05 reject ${name} without partial cues`, () => {
    const result = parseSrt(bytes(input));
    assert.equal(result.ok, false); assert.equal(result.error.code, code);
    assert.equal(typeof result.error.offset, 'number');
    if (offset !== undefined) assert.equal(result.error.offset, offset);
    assert.equal('cues' in result, false);
  });
}
test('AC02 invalid UTF-8 fatal decode', () => {
  assert.deepEqual(parseSrt(new Uint8Array([0xc3, 0x28]).buffer), { ok: false, error: { code: 'INVALID_ENCODING', offset: 0 } });
});
test('byte offsets preserve BOM, CRLF and Unicode prefixes', () => {
  const first = '\uFEFF1\r\n00:00:00,000 --> 00:00:01,000\r\n甲\r\n\r\n';
  assert.deepEqual(parseSrt(bytes(first + '3\r\n')), { ok: false, error: { code: 'INVALID_CUE_ORDER', offset: bytes(first).byteLength } });
});
test('AC05 eight-hour-digit maximum stays exact', () => {
  assert.equal(parseTimestamp('99999999:59:59,999'), 359_999_999_999_999);
  assert.equal(parseSrt(bytes('1\n99999999:59:59,998 --> 99999999:59:59,999\nA')).ok, true);
});
test('AC06/18 exact 1 MiB accepted, plus one byte rejected without truncation', () => {
  const prefix = '1\n00:00:00,000 --> 00:00:01,000\n';
  const exact = prefix + 'x'.repeat(MAX_FILE_BYTES - bytes(prefix).byteLength);
  const parsed = parseSrt(bytes(exact));
  assert.equal(parsed.ok, true); assert.equal(parsed.cues[0].textLines[0].length, 1_048_544);
  assert.deepEqual(parseSrt(bytes(exact + 'x')), { ok: false, error: { code: 'FILE_TOO_LARGE', offset: 0 } });
});
test('AC06/18 exactly 3000 cues accepted, 3001 rejected whole file', () => {
  const blocks = Array.from({ length: 3001 }, (_, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\nsynthetic\n`);
  assert.equal(parseSrt(bytes(blocks.slice(0, 3000).join('\n'))).cues.length, 3000);
  const bad = parseSrt(bytes(blocks.join('\n')));
  assert.equal(bad.ok, false); assert.equal(bad.error.code, 'INVALID_SRT'); assert.equal('cues' in bad, false);
});
