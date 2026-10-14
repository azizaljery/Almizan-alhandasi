// Chrome's MediaRecorder writes WebM without a Duration: players then show no length and cannot seek.
// withDuration() writes the missing Duration element into the Info block (the rest of the file is copied untouched).
const ID_INFO = [0x15, 0x49, 0xA9, 0x66], ID_DURATION = [0x44, 0x89], ID_TIMESCALE = [0x2A, 0xD7, 0xB1];

function readVint(b, at) { // EBML variable-length integer: { len, value } (value null for the "unknown size" pattern)
  const first = b[at]; if (!first) return null;
  let len = 1; while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || at + len > b.length) return null;
  let value = first & (0xFF >> len), unknown = value === (0xFF >> len);
  for (let i = 1; i < len; i++) { value = value * 256 + b[at + i]; if (b[at + i] !== 0xFF) unknown = false; }
  return { len, value: unknown ? null : value };
}
function writeVint(value) { let len = 1; while (len < 8 && value >= Math.pow(2, 7 * len) - 1) len++; const out = new Uint8Array(len); let v = value; for (let i = len - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); } out[0] |= 0x80 >> (len - 1); return out; }
const find = (b, id, from = 0, to = b.length) => { outer: for (let i = from; i <= to - id.length; i++) { for (let k = 0; k < id.length; k++) if (b[i + k] !== id[k]) continue outer; return i; } return -1; };

/** Bytes of a WebM file with a Duration (milliseconds) added to its Info block; returns null when it cannot (or need not) be done. */
export function webmWithDuration(bytes, durationMs) {
  if (!(durationMs > 0) || !Number.isFinite(durationMs)) return null;
  const head = bytes.subarray(0, Math.min(bytes.length, 4096)), at = find(head, ID_INFO); if (at < 0) return null;
  const size = readVint(head, at + 4); if (!size || size.value === null) return null;
  const bodyStart = at + 4 + size.len, bodyEnd = bodyStart + size.value; if (bodyEnd > head.length) return null;
  if (find(head, ID_DURATION, bodyStart, bodyEnd) >= 0) return null; // already has one
  let scale = 1e6; const ts = find(head, ID_TIMESCALE, bodyStart, bodyEnd);
  if (ts >= 0) { const l = readVint(head, ts + 3); if (l && l.value > 0 && l.value <= 6) { scale = 0; for (let i = 0; i < l.value; i++) scale = scale * 256 + head[ts + 3 + l.len + i]; } }
  const units = durationMs * 1e6 / scale, el = new Uint8Array(11); el.set(ID_DURATION); el[2] = 0x88; new DataView(el.buffer).setFloat64(3, units, false);
  const newSize = writeVint(size.value + el.length), out = new Uint8Array(bytes.length + el.length + (newSize.length - size.len));
  let o = 0; const put = part => { out.set(part, o); o += part.length; };
  put(bytes.subarray(0, at + 4)); put(newSize); put(bytes.subarray(bodyStart, bodyEnd)); put(el); put(bytes.subarray(bodyEnd));
  return out;
}

/** Same for a Blob; on any trouble the original Blob is returned unchanged. */
export async function withDuration(blob, durationMs) {
  try {
    const fixed = webmWithDuration(new Uint8Array(await blob.arrayBuffer()), durationMs);
    return fixed ? new Blob([fixed], { type: blob.type || 'video/webm' }) : blob;
  } catch { return blob; }
}

export default { webmWithDuration, withDuration };
