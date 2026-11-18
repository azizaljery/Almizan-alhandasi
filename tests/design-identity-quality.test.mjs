import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, quality } from '../dist/villa-layout.mjs';
import { designSignature, signatureSimilarity } from '../dist/design-signature.mjs';
import { architecturalQuality } from '../dist/architectural-quality.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { oneRoom } from './fixtures/draw-cases.mjs';

test('architectural daylight quality is derived from actual exterior openings, not a style or room name', () => {
  const lit = oneRoom({ type: 'bedroom', window: true }), dark = structuredClone(lit); dark.openings = dark.openings.filter(o => !o.kind.startsWith('window'));
  const a = architecturalQuality(analyzeDoc(lit)), b = architecturalQuality(analyzeDoc(dark));
  assert.ok(a.axes.daylight > b.axes.daylight); assert.ok(a.cost < b.cost); assert.ok(b.defects.some(s => /الإضاءة/.test(s)));
  const renamed = structuredClone(lit); renamed.labels[0].name = 'الجناح الفخم';
  assert.equal(architecturalQuality(analyzeDoc(renamed)).cost, a.cost);
});
test('client seeds create different actual geometries among comparable plans; a repeated seed is reproducible', () => {
  const input = { land: { width: 20, length: 30, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, keep: 4 };
  const run = seed => generateVillaDesigns({ ...input, requirements: { tweaks: { designSeed: seed } } });
  const runs = ['client-1', 'client-2', 'client-3', 'client-4', 'client-5'].map(run);
  const identities = runs.map(r => designSignature(r.designs[0].doc).key);
  assert.ok(new Set(identities).size >= 2, 'different geometry, not a title/palette change');
  assert.equal(designSignature(run('client-1').designs[0].doc).key, identities[0]);
  for (const r of runs) {
    assert.ok(r.designs.every(d => !quality(d.doc).reject));
    for (let i = 0; i < r.designs.length; i++) for (let j = i + 1; j < r.designs.length; j++) assert.ok(signatureSimilarity(designSignature(r.designs[i].doc), designSignature(r.designs[j].doc)).whole < .90);
  }
});
