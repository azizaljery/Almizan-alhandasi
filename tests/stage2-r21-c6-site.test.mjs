// الجولة 21 — 02c، قرار المالك 2026-10-26: ساتر الخصوصية C6 عنصر موقع. فحص حدود القطعة لا خط الارتداد، خطوط الرؤية بارتفاعات العين، حركة
// المركبات والمداخل والإضاءة والتهوية، والوسم «تحتاج تحققًا نظاميًا» (لا اعتماد نظامي). المستند من evidence/acceptance/c6-after (ناتج scripts/kit2-case.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { siteElementReport, SITE_DEFAULTS } from '../dist/site-element-check.mjs';
import { screenWindowPrivacy, planWindowScreen, windowExposure } from '../dist/privacy-gate.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';

const load = () => JSON.parse(readFileSync(new URL('../evidence/acceptance/c6-rework-a/C6/alt-1.json', import.meta.url), 'utf8'));
const fenceOf = d => d.walls.find(w => w.kind === 'fence');
const get = (rep, id) => rep.fences[0].checks.find(c => c.id === id);

test('C6: الساتر داخل القطعة ولا ينطبق عليه خط ارتداد المبنى، وكل فحوصه الهندسية ناجحة', () => {
  const r = siteElementReport(load());
  assert.equal(r.fences.length, 1); assert.equal(r.geometryOk, true, r.failures_ar.join('|'));
  assert.equal(get(r, 'PLOT_BOUNDARY').pass, true);
  assert.equal(get(r, 'BUILDING_SETBACK_LINE').applicable, false);
  for (const id of ['BAY_CLEARANCE', 'BAY_APPROACH', 'DOOR_FRONT', 'ENTRY_PATH']) assert.equal(get(r, id).pass, true, id);
  assert.ok(get(r, 'BAY_CLEARANCE').measured >= SITE_DEFAULTS.bayClear);
});
test('الاشتراط النظامي للساتر «لم يتم التحقق» ولا pass أبدًا (لا مصدر في regulations-sa)', () => {
  const r = siteElementReport(load());
  assert.equal(r.pendingRegulatory, true);
  assert.ok(r.regulatory.length >= 2 && r.regulatory.every(c => c.status === 'unverified' && c.source === null));
});
test('ساتر خارج القطعة أو يقطع ممر الموقف أو يعترض مدخلًا: يرسب بقياسه', () => {
  let d = load(); fenceOf(d).a = { x: -1, y: 3 }; fenceOf(d).b = { x: -1, y: 6 };
  assert.equal(get(siteElementReport(d), 'PLOT_BOUNDARY').pass, false);
  d = load(); const z = d.zones.find(q => q.type === 'garage'), x = (z.polygon[0].x + z.polygon[1].x) / 2; fenceOf(d).a = { x, y: 2 }; fenceOf(d).b = { x, y: 3 };
  const r = siteElementReport(d); assert.equal(get(r, 'BAY_CLEARANCE').pass, false); assert.equal(r.geometryOk, false);
  d = load(); fenceOf(d).a = { x: 15, y: 0.3 }; fenceOf(d).b = { x: 16.5, y: 0.3 }; // أمام ممر الموقف إلى الشارع
  assert.equal(get(siteElementReport(d), 'BAY_APPROACH').pass, false);
});
test('نوافذ الساتر: لا استثناء عام للممر؛ كل نافذة تُقاس بغلاف ضلفتها (WINDOW_CLEARANCE وWINDOW_SWING) وساتر قريب منها يرسب', () => {
  const d = load(), G = analyzeDoc(d).levels[0], op = G.openings.find(o => o.id === 'o22');
  fenceOf(d).a = { x: op.p.x + 0.3, y: op.p.y - 1 }; fenceOf(d).b = { x: op.p.x + 0.3, y: op.p.y + 1 };
  const r = siteElementReport(d); assert.equal(get(r, 'WINDOW_CLEARANCE:o22').pass, false); assert.equal(r.geometryOk, false);
  const ok = siteElementReport(load()), c = ok.fences[0].checks.find(x => x.id === 'WINDOW_CLEARANCE:o23');
  assert.ok(c && c.pass === true && c.measured >= SITE_DEFAULTS.minWindowOffset, 'نافذة الممر o23 تبلغ الخلوص نفسه بلا استثناء');
  assert.ok(!ok.fences[0].checks.some(x => x.noted), 'لا بند «مذكور» يُعفي نافذة');
});
test('زاوية حجب الإضاءة تُقاس ولا تُحكم: حدها «غير متحقق»', () => {
  const c = get(siteElementReport(load()), 'DAYLIGHT_OBSTRUCTION:o22');
  assert.equal(c.status, 'unverified'); assert.equal(c.pass, null); assert.ok(c.measured > 0 && c.measured < 90);
});
test('خطوط الرؤية بارتفاعات العين: ساتر 1.0 م لا يحجب عين السائق الجالس 1.2 م ولا الواقف، و1.8 م يحجبهما', () => {
  const win = { a: { x: 0, y: -1 }, b: { x: 0, y: 1 }, sillHeight: 0.5, headHeight: 2.2 }, eyes = { outside: [1.2, 1.6], inside: [1.1, 1.6] };
  const base = { window: win, parkingPoints: [{ x: 5, y: 0 }], interiorPoints: [{ x: -3, y: 0 }], eyes };
  const low = screenWindowPrivacy({ ...base, opaqueScreens: [{ a: { x: 2, y: -2 }, b: { x: 2, y: 2 }, height: 1.0 }] });
  const hi = screenWindowPrivacy({ ...base, opaqueScreens: [{ a: { x: 2, y: -2 }, b: { x: 2, y: 2 }, height: 1.8 }] });
  assert.equal(low.potentialExposure, true); assert.equal(hi.potentialExposure, false);
  assert.ok(low.paths.every(p => Array.isArray(p.eyes) && Number.isFinite(p.zAtWindow)));
});
test('خط رؤية يعبر النافذة فوق رأسها أو تحت جلستها لا يُكشف (ارتفاع الخط عند النافذة لا مستوى عين واحد)', () => {
  const eyes = { outside: [1.2], inside: [1.1] };
  const win = { a: { x: 0, y: -1 }, b: { x: 0, y: 1 }, sillHeight: 1.6, headHeight: 2.2 };
  assert.equal(screenWindowPrivacy({ window: win, parkingPoints: [{ x: 5, y: 0 }], interiorPoints: [{ x: -3, y: 0 }], eyes }).potentialExposure, false);
  assert.equal(screenWindowPrivacy({ window: { ...win, sillHeight: 0.9 }, parkingPoints: [{ x: 5, y: 0 }], interiorPoints: [{ x: -3, y: 0 }], eyes }).potentialExposure, true);
});
test('C6: الساتر يحجب كل خطوط الرؤية إلى نافذة الصالة بالارتفاعات الأربعة ولم يكن الأمر كذلك قبله', () => {
  const d = load(), bare = load(); bare.walls = bare.walls.filter(w => w.kind !== 'fence');
  const exp = dd => { const G = analyzeDoc(dd).levels[0], op = G.openings.find(o => o.id === 'o22'), side = op.sides.find(x => x.other === 'outside'); return windowExposure(dd, G, op, side, dd.zones.filter(z => z.type === 'garage')); };
  assert.equal(exp(d).potentialExposure, false); assert.ok(exp(bare).paths.length > 0);
});
test('planWindowScreen لا يقبل ساترًا يلاصق موقفًا أو ممر دخوله ولا نافذة مأهولة', () => {
  const d = load(); d.walls = d.walls.filter(w => w.kind !== 'fence');
  const G = analyzeDoc(d).levels[0], op = G.openings.find(o => o.id === 'o22'), side = op.sides.find(x => x.other === 'outside'), bays = d.zones.filter(z => z.type === 'garage');
  const ok = planWindowScreen(d, G, op, side, bays); assert.ok(ok);
  assert.equal(planWindowScreen(d, G, op, side, bays, { ...planDefaults(), bayClear: 5 }), null);
});
import { SCREEN_DEFAULTS } from '../dist/privacy-gate.mjs';
const planDefaults = () => SCREEN_DEFAULTS;

test('العرض: الحالات الثلاث منفصلة والوسم الإلزامي ظاهر ولا اعتماد نظامي', () => {
  const doc = load(), p = presentationStatus({ doc, ledger: [] }, {});
  assert.ok(p.needsRegulatoryVerification); assert.match(p.label_ar, /المطابقة النظامية لستارة الخصوصية لم تُتحقق بعد/); assert.match(p.regulatoryTag_ar, /^تصميم مبدئي — المطابقة النظامية لستارة الخصوصية لم تُتحقق بعد$/);
  assert.ok(p.regulatory_ar.length === 1 && /لم يتم التحقق/.test(p.regulatory_ar[0])); assert.ok(p.siteElements.fences.length === 1);
  assert.deepEqual(Object.keys(p.states).sort(), ['architectural', 'regulatory', 'tests']); assert.equal(p.states.regulatory.status, 'unverified');
  if (p.status === 'hidden') assert.doesNotMatch(p.label_ar, /لم تُتحقق بعد/);
});
test('عرض بلا ساتر: لا وسم نظامي', () => {
  const doc = load(); doc.walls = doc.walls.filter(w => w.kind !== 'fence');
  const p = presentationStatus({ doc, ledger: [] }, {}); assert.equal(p.needsRegulatoryVerification, false); assert.equal(p.regulatory_ar.length, 0); assert.doesNotMatch(p.label_ar, /نظاميًا/);
});
