import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, generateModel } from '../dist/planner.mjs';
import {
  createEngineeringProject,
  modelToEngineeringDesign,
  evaluateHomeModel,
  compareHomeModels,
  buildEngineeringPromptContext
} from '../dist/home-design-engine.mjs';

const plot = { width: 25, length: 50, floors: 1, streets: { s: true, n: false, e: true, w: false }, entry: 's', streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: 500 };
const rooms = defaultRooms({ bedrooms: 3, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 });

test('attached home-design engine builds a structured customer and site context', () => {
  const project = createEngineeringProject({ plot, rooms, discovery: { likes: [], rejects: [], avoids: ['غرف نوم مكشوفة أو قريبة من الضيافة'], life: { future: 'مهمة' } } });
  assert.equal(project.site.dimensions.width, 25);
  assert.ok(project.site.opportunities.some(item => item.type === 'multiple_frontages'));
  assert.ok(project.preferences.some(item => item.key === 'privacy_high'));
  assert.ok(project.customer.futureNeeds.includes('future_floor'));
});

test('planner models are evaluated by the attached decision engine', () => {
  const model = generateModel(plot, rooms);
  const design = modelToEngineeringDesign(model);
  const result = evaluateHomeModel({ plot, rooms, model });
  assert.equal(design.areas.totalBuiltArea, model.building.w * model.building.h);
  assert.ok(result.evaluation.score >= 0 && result.evaluation.score <= 100);
  assert.ok(Number.isFinite(result.evaluation.metrics.privacy));
  assert.ok(Array.isArray(result.evaluation.explanations));
});

test('alternative comparison and AI context use the same deterministic customer inputs', () => {
  const first = generateModel(plot, rooms, { strategy: 'compact' });
  const second = generateModel(plot, rooms, { strategy: 'balanced' });
  const discovery = { likes: ['courtyard_privacy'], rejects: [], avoids: ['مطبخ بعيد عن الطعام والخدمات'], life: { children: 'قريبون من الصالة' } };
  const comparison = compareHomeModels({ plot, rooms, discovery, models: [first, second] });
  const context = buildEngineeringPromptContext({ plot, rooms, discovery, model: first });
  assert.equal(comparison.rows.length, 2);
  assert.ok(comparison.rows.every(row => row.evaluation.metrics.functionalAdjacency >= 0));
  assert.ok(context.relationships.some(item => item.from === 'kitchen' && item.to === 'dining'));
  assert.equal(context.designDNA.hospitality, 0.6);
});
