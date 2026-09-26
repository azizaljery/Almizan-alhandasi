// compat-layer.test.mjs -- proves the publish-time bridge produces exactly what the live site's
// consumers (app.mjs, plan-view.mjs, viewer3d.mjs) read, using field names and access patterns
// copied from the extracted live-site snapshot (2026-09-25), not re-derived from memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAlternatives, generateModelLegacy, quantities, STRATEGIES, CONCEPT_PROFILES } from '../src/compat-layer.mjs';
import { defaultRooms } from '../src/planner.mjs';

const ENTRIES = /** @type {const} */ (['s', 'n', 'e', 'w']);
/** @param {'s'|'n'|'e'|'w'} entry @param {Partial<import('../src/PlannerOutputContract.mjs').PlotInput>} [extra] */
const plot = (entry = 's', extra = {}) => ({ width: 35, length: 45, floors: 1, entry, streets: { [entry]: true }, ...extra });
const program = () => defaultRooms({ bedrooms: 4, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 });

// ---------------------------------------------------------------------------------------
// The headline fix: U/courtyard must now succeed where the old engine's shrinking-wing loop
// routinely failed ("تعذر ملاءمة نموذج الفناء الطوبولوجي..."). This is the actual "box problem".
// ---------------------------------------------------------------------------------------
test('C01 generateAlternatives builds a real U/courtyard model for a plot the old engine could not', () => {
  for (const entry of ENTRIES) {
    const { models, failures } = generateAlternatives(plot(entry), program());
    const u = models.find(m => m.strategy === 'courtyard' || m.strategy === 'u-court');
    assert.ok(u, `${entry}: no U alternative produced (failures: ${JSON.stringify(failures)})`);
    assert.equal(u.shape, 'u'); assert.equal(u.shapeFallback, false);
    assert.equal(u.courtyards.length, 1);
  }
});

test('C02 app.mjs field contract: model.architecture.{tag,form,idea,bestFor,tradeoff}, model.strategy, STRATEGIES[strategy]', () => {
  const { models } = generateAlternatives(plot(), program());
  for (const m of models) {
    assert.ok(m.strategy, 'strategy present');
    assert.ok(STRATEGIES[m.strategy], 'STRATEGIES has an entry for ' + m.strategy);
    const concept = m.architecture || CONCEPT_PROFILES[m.strategy || 'compact'];
    for (const field of ['tag', 'form', 'idea', 'bestFor', 'tradeoff']) assert.equal(typeof concept[field], 'string', field);
  }
});

test('C03 app.mjs quantities contract: q.footprint/q.rooms/q.circulation/q.reserve/q.doors/q.windows all finite', () => {
  const { models } = generateAlternatives(plot(), program());
  for (const m of models) {
    const q = quantities(m);
    for (const k of ['footprint', 'rooms', 'circulation', 'reserve', 'doors', 'windows']) assert.ok(Number.isFinite(q[k]), `${m.strategy}.${k}`);
    assert.ok(q.footprint > 0);
  }
});

// ---------------------------------------------------------------------------------------
// plan-view.mjs / viewer3d.mjs read model.massingParts (array of boxes) and model.courtyards
// to draw the shape. Copied access pattern: `model.massingParts?.length ? model.massingParts : [model.building]`.
// ---------------------------------------------------------------------------------------
test('C04 U model exposes massingParts covering every room and corridor, building stays as fallback shape', () => {
  const { models } = generateAlternatives(plot(), program());
  const u = models.find(m => m.shape === 'u');
  assert.ok(Array.isArray(u.massingParts) && u.massingParts.length >= 2, 'massingParts is a non-trivial array');
  const shapes = u.massingParts.length ? u.massingParts : [u.building];
  for (const cell of [...u.rooms, ...u.corridors]) {
    const covered = shapes.some(p => cell.x >= p.x - 0.02 && cell.y >= p.y - 0.02 && cell.x + cell.w <= p.x + p.w + 0.02 && cell.y + cell.h <= p.y + p.h + 0.02);
    assert.ok(covered, `${cell.id ?? cell.name} not covered by any massingPart`);
  }
  assert.ok(u.building && Number.isFinite(u.building.w) && Number.isFinite(u.building.h), 'legacy `building` rect still present (backward compat passthrough from v2.2.1)');
});

test('C05 rect model has no massingParts (matches the live site: plain rect never set it)', () => {
  const { models } = generateAlternatives(plot(), program());
  const rect = models.find(m => m.shape === 'rect');
  assert.ok(rect);
  assert.equal(rect.massingParts, undefined);
});

test('C06 U courtyard box is drawable exactly as plan-view.mjs draws it (x,y,w,h, positive, inside building)', () => {
  for (const entry of ENTRIES) {
    const { models } = generateAlternatives(plot(entry), program());
    const u = models.find(m => m.shape === 'u');
    const c = u.courtyards[0];
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(c[k]) && (k === 'x' || k === 'y' || c[k] > 0), `${entry} courtyard.${k}`);
    assert.ok(c.x >= u.building.x - 0.01 && c.y >= u.building.y - 0.01 && c.x + c.w <= u.building.x + u.building.w + 0.01 && c.y + c.h <= u.building.y + u.building.h + 0.01, entry);
  }
});

// ---------------------------------------------------------------------------------------
// Old generateAlternatives semantics: never throws mid-loop, collects failures, de-duplicates,
// throws only when EVERY strategy failed.
// ---------------------------------------------------------------------------------------
test('C07 a plot too tight for U still returns a working rect alternative and named failures, never throws', () => {
  const tight = plot('s', { width: 20, length: 30 });
  const { models, failures } = generateAlternatives(tight, program());
  assert.ok(models.length >= 1, 'at least the rect alternative survives');
  assert.ok(models.every(m => m.shape === 'rect'));
  assert.ok(failures.length >= 1 && failures.every(f => typeof f.strategy === 'string' && typeof f.reason === 'string'));
});

test('C08 a plot too tight even for a rect throws a single Arabic Error (matches old `if (!models.length) throw`)', () => {
  const hopeless = plot('s', { width: 8, length: 8 });
  assert.throws(() => generateAlternatives(hopeless, program()), (e) => e instanceof Error && e.message.length > 0);
});

test('C09 generateAlternatives never mutates its plot or rooms arguments', () => {
  const p = plot(), r = program(), pBefore = JSON.stringify(p), rBefore = JSON.stringify(r);
  generateAlternatives(p, r);
  assert.equal(JSON.stringify(p), pBefore); assert.equal(JSON.stringify(r), rBefore);
});

test('C10 generateAlternatives is deterministic: same plot+rooms -> identical model list across calls', () => {
  const p = plot(), r = program();
  const a = JSON.stringify(generateAlternatives(p, r));
  const b = JSON.stringify(generateAlternatives(p, r));
  assert.equal(a, b);
});

// ---------------------------------------------------------------------------------------
// generateModelLegacy: the single-model entry point app.mjs's project-restore path uses.
// ---------------------------------------------------------------------------------------
test('C11 generateModelLegacy: "compact"/"balanced"/"frontage" -> rect; "courtyard"/"u-court" -> u', () => {
  for (const s of ['compact', 'balanced', 'frontage']) assert.equal(generateModelLegacy(plot(), program(), { strategy: s }).shape, 'rect', s);
  for (const s of ['courtyard', 'u-court']) assert.equal(generateModelLegacy(plot(), program(), { strategy: s }).shape, 'u', s);
});

test('C12 engineVersion is a NEW string distinct from the legacy "rectangular-2", so old cached/stored models are never confused with new ones', () => {
  const { models } = generateAlternatives(plot(), program());
  for (const m of models) { assert.equal(m.engineVersion, 'polygon-2'); assert.notEqual(m.engineVersion, 'rectangular-2'); }
});

// ---------------------------------------------------------------------------------------
// The bridge must never alter v2.2.1's own validity: every legacy-shaped model still satisfies
// the real validator when read back through the v2 fields it still carries.
// ---------------------------------------------------------------------------------------
test('C13 every produced model still passes v2.2.1 validateModel (bridge only adds fields, never removes/breaks geometry)', async () => {
  const { validateModel } = await import('../src/planner.mjs');
  const { models } = generateAlternatives(plot(), program());
  for (const m of models) assert.deepEqual(validateModel(m), [], m.strategy);
});
