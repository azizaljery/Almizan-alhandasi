import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { generateModel, generateAlternatives, defaultRooms, validateModel, quantities } from '../dist/planner.mjs';
import { encodeProject, decodeProject } from '../dist/project.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { analyzeGeminiEngineering, describeEngineeringProvenance } from '../dist/gemini-engineering-layer.mjs';
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
test('Gemini engineering review declares statutory compliance unevaluated and exposes regulatory/heuristic arrays', () => {
  const review = analyzeGeminiEngineering(model);
  assert.equal(review.coverage.statutoryCompliance, 'NOT_EVALUATED');
  assert.ok(Array.isArray(review.regulatory));
  assert.ok(Array.isArray(review.heuristicRules));
  for (const row of review.regulatory) {
    assert.equal(row.status, 'UNVERIFIED');
    assert.match(row.category, /استشهادات كود/);
    assert.match(row.evidence, /لم تُراجع/);
  }
  assert.ok(review.limitations.some(line => /SBC/.test(line) && /لم تُراجع/.test(line)));
});
test('a real statutory-rule violation fired by the live Gemini coordination pipeline is surfaced as an unverified citation, not a certified pass/fail', () => {
  // A corridor narrower than the registry's 900mm minimum makes the real
  // ArchitecturalReviewer -> EngineeringRulesRegistry pipeline fire
  // RULE-SBC-1101-CORRIDOR-WIDTH-01, independent of any test fixture.
  const narrow = structuredClone(model);
  narrow.corridors = [{ id: 'narrow-corridor', name: 'ممر ضيق', x: 0, y: 0, w: 0.5, h: 4 }];
  const review = analyzeGeminiEngineering(narrow);
  const row = review.regulatory.find(item => item.id === 'gemini-rule-RULE-SBC-1101-CORRIDOR-WIDTH-01');
  assert.ok(row, 'the real rules registry must have fired the corridor-width rule');
  assert.equal(row.status, 'UNVERIFIED');
  assert.match(row.evidence, /R311\.6/);
  assert.match(row.evidence, /لم تُراجع هذه الاستشهادات بشكل مستقل/);
});
test('engineering provenance disclosure separates statutory-cited rules from internal heuristics and never certifies them', () => {
  const fixture = {
    engineeringProvenance: {
      appliedRules: [
        {
          ruleId: 'RULE-SBC-1101-CORRIDOR-WIDTH-01', title: 'Corridor width', classification: 'STATUTORY_SBC',
          documentId: 'SBC-1101-2024', authority: 'SBC_1101_2024', edition: '2024', section: 'Chapter 3', subsection: 'Section R311.6',
          reference: 'Saudi Residential Building Code (SBC 1101:2024), Chapter 3, Section R311.6 Hallways',
          effectiveFrom: '2025-06-30', verifiedAt: '2026-09-23', confidence: 1, isStatutoryCode: true,
        },
        {
          ruleId: 'RULE-ARCH-HEURISTIC-DOOR-SWING-03', title: 'Door swing clearance', classification: 'PRELIMINARY_HEURISTIC',
          documentId: 'HEURISTIC-ARCH-001', authority: 'UNOFFICIAL_PRACTICE', edition: 'UNVERSIONED_HEURISTIC',
          reference: 'AEC Preliminary Space Planning Guideline (Non-Statutory Heuristic)',
          effectiveFrom: 'N/A', verifiedAt: '2026-09-23', confidence: .7, isStatutoryCode: false,
        },
        { ruleId: 'RULE-UNKNOWN-FUTURE-ID', title: 'x', classification: 'STATUTORY_SBC', documentId: 'd', reference: 'r', confidence: 1, isStatutoryCode: true },
      ],
    },
  };
  const { regulatory, heuristicRules } = describeEngineeringProvenance(fixture);
  assert.equal(regulatory.length, 2);
  assert.equal(heuristicRules.length, 1);
  const corridor = regulatory.find(row => row.id === 'gemini-rule-RULE-SBC-1101-CORRIDOR-WIDTH-01');
  assert.ok(corridor);
  assert.equal(corridor.status, 'UNVERIFIED');
  assert.match(corridor.title, /[؀-ۿ]/);
  assert.match(corridor.evidence, /R311\.6/);
  assert.match(corridor.evidence, /لم تُراجع هذه الاستشهادات بشكل مستقل/);
  assert.ok(!regulatory.some(row => /HEURISTIC/.test(row.title)));
  assert.match(heuristicRules[0], /قاعدة داخلية غير نظامية/);
  const unknown = regulatory.find(row => row.id === 'gemini-rule-RULE-UNKNOWN-FUTURE-ID');
  assert.match(unknown.title, /RULE-UNKNOWN-FUTURE-ID/);
  assert.deepEqual(describeEngineeringProvenance({}), { regulatory: [], heuristicRules: [] });
});
