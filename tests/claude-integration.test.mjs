import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { generateModel, generateAlternatives, defaultRooms, validateModel, quantities } from '../dist/planner.mjs';
import { encodeProject, decodeProject } from '../dist/project.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { analyzeGeminiEngineering } from '../dist/gemini-engineering-layer.mjs';
import { evaluateHomeModel } from '../dist/home-design-engine.mjs';
const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } };
const rooms = defaultRooms();
const model = generateModel(plot, rooms, { strategy: 'claude-rect' });

test('deployed Claude sources match the acceptance-tested vendor sources byte for byte', () => {
  for (const file of readdirSync(new URL('../vendor/claude-planner/src/', import.meta.url))) {
    assert.deepEqual(readFileSync(new URL('../dist/claude/' + file, import.meta.url)), readFileSync(new URL('../vendor/claude-planner/src/' + file, import.meta.url)));
  }
});
test('live generation path includes Claude without losing legacy alternatives or room areas', () => {
  const before = JSON.stringify([plot, rooms]);
  const result = generateAlternatives(plot, rooms, { includeClaude: true });
  assert.ok(result.models.some(m => m.engineVersion === 'claude-2.2.1'));
  for (const old of generateAlternatives(plot, rooms).models) assert.ok(result.models.some(m => m.strategy === old.strategy));
  assert.deepEqual(validateModel(model), []);
  assert.equal(model.version, 2);
  assert.ok(Math.abs(quantities(model).rooms - 228) < 1e-6);
  assert.equal(JSON.stringify([plot, rooms]), before);
});
test('Claude enforces site built-area cap in generation and validation', () => {
  assert.throws(() => generateModel({ ...plot, maxBuiltArea: 228 }, rooms, { strategy: 'claude-rect' }), /سقف البناء/);
  const changed = structuredClone(model); changed.plot.maxBuiltArea = 228;
  assert.ok(validateModel(changed).some(message => message.includes('سقف البناء')));
});
test('Claude projects round-trip with their strategy, geometry and quantity totals', () => {
  const text = encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 0, vat: 0, idea: '', model, alternatives: [model] });
  const restored = decodeProject(text).model;
  assert.equal(restored.strategy, 'claude-rect');
  assert.deepEqual(restored, model);
});
test('Claude output reaches 2D, Gemini and the existing home decision engine', () => {
  const svg = buildPlanSVG(model);
  assert.match(svg, /<svg/); assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.ok(analyzeGeminiEngineering(model));
  assert.ok(evaluateHomeModel({ plot, rooms, model }));
});
