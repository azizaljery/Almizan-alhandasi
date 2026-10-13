import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparePlan, resolveSelection } from '../dist/compare3d.mjs';

const describe = (m, i) => ({ title: 'البديل ' + (i + 1), summary: m.id });
const alts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('comparison needs two alternatives and starts from the shown one against a different one', () => {
  assert.equal(comparePlan([], null, describe).ready, false);
  assert.match(comparePlan([alts[0]], alts[0], describe).reason, /بديلين/);
  const plan = comparePlan(alts, alts[1], describe);
  assert.equal(plan.ready, true);
  assert.equal(plan.a, 1); assert.notEqual(plan.b, plan.a);
  assert.deepEqual(plan.options.map(o => o.index), [0, 1, 2]);
  assert.equal(comparePlan(alts, { id: 'not-in-list' }, describe).a, 0);
});

test('after the alternatives change, picks follow the same models, and a removed pick falls back to a valid pair', () => {
  const plan = comparePlan(alts, alts[0], describe);
  assert.deepEqual(resolveSelection([alts[2], alts[0], alts[1]], { a: alts[0], b: alts[2] }, plan), { a: 1, b: 0 });
  const fallback = resolveSelection([alts[1], alts[2]], { a: alts[0], b: alts[1] }, comparePlan([alts[1], alts[2]], alts[1], describe));
  assert.notEqual(fallback.a, fallback.b); assert.ok(fallback.a >= 0 && fallback.b >= 0);
  const same = resolveSelection(alts, { a: alts[0], b: alts[0] }, plan);
  assert.notEqual(same.a, same.b);
});

test('the compare card is wired, read-only, and cannot change the chosen alternative', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'), app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8'), mod = readFileSync(new URL('../dist/compare3d.mjs', import.meta.url), 'utf8');
  for (const id of ['compare3d', 'compareSelectA', 'compareSelectB', 'comparePaneA', 'comparePaneB', 'compareCaptionA', 'compareCaptionB', 'compareGrid', 'compareNote']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('./compare3d.css'));
  assert.match(app, /initCompare3D/);
  assert.ok(!/state\.model\s*=/.test(mod) && !/setModel\(getCurrent/.test(mod));
});
