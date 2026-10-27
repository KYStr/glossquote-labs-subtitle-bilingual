import { decodeUtf8, MAX_CUES } from './decode.js';

const timestamp = '[0-9]{2,8}:[0-5][0-9]:[0-5][0-9],[0-9]{3}';
const timeLine = new RegExp(`^(${timestamp}) --> (${timestamp})$`);
const encoder = new TextEncoder();

export function parseTimestamp(value) {
  if (!new RegExp(`^${timestamp}$`).test(value)) return null;
  const [h, m, s, ms] = value.split(/[:,]/).map(Number);
  const result = h * 3_600_000 + m * 60_000 + s * 1_000 + ms;
  return Number.isSafeInteger(result) ? result : null;
}

export function parseSrt(bytes) {
  const decoded = decodeUtf8(bytes);
  if (!decoded.ok) return decoded;
  const records = [];
  let offset = decoded.bomBytes;
  // Keep original newline byte lengths for error offsets, including CRLF.
  for (const entry of decoded.text.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    if (entry[0] === '') break;
    records.push({ text: entry[1], offset });
    offset += encoder.encode(entry[0]).byteLength;
  }
  while (records.at(-1)?.text === '') records.pop();
  const fail = (code, at) => ({ ok: false, error: { code, offset: at ?? offset } });
  if (!records.length) return fail('INVALID_SRT', decoded.bomBytes);
  const cues = [];
  for (let i = 0; i < records.length;) {
    const number = records[i];
    if (!/^[1-9][0-9]*$/.test(number.text) || Number(number.text) !== cues.length + 1) {
      return fail('INVALID_CUE_ORDER', number.offset);
    }
    if (cues.length === MAX_CUES) return fail('INVALID_SRT', number.offset);
    const times = records[++i];
    if (!times) return fail('INVALID_SRT');
    const values = timeLine.exec(times.text);
    if (!values) return fail('INVALID_TIMECODE', times.offset);
    const startMs = parseTimestamp(values[1]);
    const endMs = parseTimestamp(values[2]);
    if (startMs === null || endMs === null || startMs >= endMs) {
      return fail('INVALID_TIMECODE', times.offset);
    }
    const textLines = [];
    i++;
    while (i < records.length && records[i].text !== '') {
      if (!records[i].text.trim()) return fail('INVALID_SRT', records[i].offset);
      textLines.push(records[i++].text);
    }
    if (!textLines.length) return fail('INVALID_SRT', records[i]?.offset);
    cues.push({ sourceIndex: cues.length, startMs, endMs, textLines });
    while (records[i]?.text === '') i++;
  }
  return { ok: true, cues };
}
