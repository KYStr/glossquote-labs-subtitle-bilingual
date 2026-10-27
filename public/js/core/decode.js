export const MAX_FILE_BYTES = 1_048_576;
export const MAX_CUES = 3_000;

export function decodeUtf8(bytes) {
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
    return { ok: false, error: { code: 'INVALID_SRT', offset: 0 } };
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: { code: 'FILE_TOO_LARGE', offset: 0 } };
  }
  try {
    // ignoreBOM=true preserves the BOM so exactly one can be handled here.
    let text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const bomBytes = text.startsWith('\uFEFF') ? 3 : 0;
    if (bomBytes) text = text.slice(1);
    if (text.startsWith('\uFEFF')) {
      return { ok: false, error: { code: 'INVALID_SRT', offset: 3 } };
    }
    return { ok: true, text, bomBytes };
  } catch {
    return { ok: false, error: { code: 'INVALID_ENCODING', offset: 0 } };
  }
}
