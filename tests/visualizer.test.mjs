import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDallePrompt } from '../dist/render-visualizer.mjs';

test('visual prompt is derived from the generated plan without secrets', () => {
  const prompt = buildDallePrompt({
    plot: { width: 20, length: 30 },
    building: { w: 16, h: 24 },
    program: [{ name: 'مجلس رجال' }, { name: 'صالة عائلية' }],
  }, { style: 'classic', timeLighting: 'golden', viewAngle: 'entry' });
  assert.match(prompt, /neoclassical Saudi Arabian luxury villa/);
  assert.match(prompt, /384 square metres/);
  assert.match(prompt, /مجلس رجال/);
  assert.doesNotMatch(prompt, /sk-[A-Za-z0-9_-]{12,}/);
});

test('visual prompt falls back to safe defaults for unknown options', () => {
  const prompt = buildDallePrompt(null, { style: 'unknown', timeLighting: 'unknown', viewAngle: 'unknown' });
  assert.match(prompt, /Saudi Arabian villa/);
  assert.match(prompt, /photorealistic architectural photography/);
});
