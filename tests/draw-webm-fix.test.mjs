import test from 'node:test';
import assert from 'node:assert/strict';
import { webmWithDuration, withDuration } from '../dist/draw/webm-fix.mjs';

const hex = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
// the start of a real Chrome MediaRecorder file: EBML header, Segment of unknown size, Info (no Duration), then a Tracks marker
const INFO = '1549a966992ad7b1830f42404d80864368726f6d655741864368726f6d65', REST = '1654ae6b8100';
const file = hex('1a45dfa3' + '8400000000' + '18538067' + '01ffffffffffffff' + INFO + REST + 'deadbeef');
const readDuration = out => { const i = out.findIndex((_, k) => out[k] === 0x44 && out[k + 1] === 0x89); return new DataView(out.buffer, out.byteOffset + i + 3, 8).getFloat64(0, false); };

test('a Duration is written into Info; size grows by exactly the new element and nothing else moves', () => {
  const out = webmWithDuration(file, 23456);
  assert.equal(out.length, file.length + 11);
  const at = out.findIndex((_, k) => out[k] === 0x15 && out[k + 1] === 0x49 && out[k + 2] === 0xA9 && out[k + 3] === 0x66);
  assert.equal(out[at + 4], 0x80 | (0x19 + 11), 'Info size 25 -> 36');
  assert.equal(readDuration(out), 23456, 'timecode scale is 1 ms, so the value is in milliseconds');
  assert.deepEqual([...out.subarray(0, at + 4)], [...file.subarray(0, at + 4)], 'everything before Info is identical');
  assert.deepEqual([...out.subarray(out.length - 4 - 6)], [...file.subarray(file.length - 4 - 6)], 'everything after Info is identical');
});

test('files that already have a duration, or are not WebM, or have a bad length are left alone', () => {
  const once = webmWithDuration(file, 1000);
  assert.equal(webmWithDuration(once, 2000), null);
  assert.equal(webmWithDuration(hex('0102030405'), 1000), null);
  assert.equal(webmWithDuration(file, 0), null); assert.equal(webmWithDuration(file, NaN), null);
});

test('withDuration works on a Blob and returns the original Blob when it cannot help', async () => {
  const fixed = await withDuration(new Blob([file], { type: 'video/webm' }), 5000);
  assert.equal(fixed.size, file.length + 11); assert.equal(fixed.type, 'video/webm');
  const junk = new Blob(['hello']); assert.equal(await withDuration(junk, 5000), junk);
});
