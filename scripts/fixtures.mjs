export const bytes = text => new TextEncoder().encode(text).buffer;
export const cue = (sourceIndex, startMs, endMs, ...textLines) => ({ sourceIndex, startMs, endMs, textLines: textLines.length ? textLines : [`synthetic-${sourceIndex}`] });
export const file = (text, name = 'synthetic.srt') => ({ name, size: bytes(text).byteLength, arrayBuffer: async () => bytes(text) });
export const MAIN = '1\n00:00:00,000 --> 00:00:02,000\nA\n';
export const SECONDARY = '1\n00:00:00,500 --> 00:00:02,000\nB\n';
export const EXPECTED = '1\n00:00:00,000 --> 00:00:02,000\nA\nB\n';
