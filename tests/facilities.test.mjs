import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns } from '../dist/villa-layout.mjs';
import { reviewDoc, fixtureRect } from '../dist/draw/review.mjs';
import { validateDoc } from '../dist/draw/doc.mjs';
import { computeDocQuantities } from '../dist/draw/quantities-doc.mjs';
import { siteSheet } from '../dist/draw/site-sheet.mjs';
import { FIXTURES, isOutdoorKind, CARPORT_STALL } from '../dist/draw/catalog.mjs';
import { fixtureSymbol } from '../dist/draw/plan-annot.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { SharaSession } from '../dist/home-flow.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';

const OUT = { carport: 2, pergola: true, bbq: true, fountain: true };
const gen = (w, l, outdoor) => generateVillaDesigns({ land: { width: w, length: l, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1 }, requirements: { prefs: { outdoor } }, keep: 2 });

test('الكتالوج: مظلة سيارات وبرجولة وشواء ونافورة قطع خارجية', () => {
  for (const k of ['carport', 'pergola', 'bbq', 'fountain']) { assert.ok(FIXTURES[k]?.outdoor, k); assert.ok(isOutdoorKind(k), k); }
  assert.equal(CARPORT_STALL.w, 2.7);
});

test('المولّد: المرافق الخارجية داخل الأرض وخارج المبنى ولا تتداخل وسجل التحقق ناجح', () => {
  const r = gen(25, 30, OUT);
  for (const d of r.designs) {
    for (const k of ['carport', 'pergola', 'bbq', 'fountain']) assert.ok(d.garden.placed.some(p => p.kind === k), k);
    assert.deepEqual(validateDoc(d.doc), []);
    const out = d.doc.fixtures.filter(f => FIXTURES[f.kind]?.outdoor && f.kind !== 'tree');
    for (const f of out) for (const c of fixtureRect(f)) assert.ok(pointInPolygon(c, d.doc.plot.polygon, 1e-6), `${f.kind} داخل الأرض`);
    assert.deepEqual(reviewDoc(d.doc).filter(i => ['GARDEN_PLACEMENT', 'FIXTURE_OUTSIDE', 'FIXTURE_OVERLAP'].includes(i.code)), []);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const A = fixtureRect(out[i]), B = fixtureRect(out[j]), ax = A.map(p => p.x), ay = A.map(p => p.y), bx = B.map(p => p.x), by = B.map(p => p.y);
      const ov = Math.min(Math.max(...ax), Math.max(...bx)) - Math.max(Math.min(...ax), Math.min(...bx)) > 1e-6 && Math.min(Math.max(...ay), Math.max(...by)) - Math.max(Math.min(...ay), Math.min(...by)) > 1e-6;
      assert.ok(!ov, `${out[i].kind} يتداخل مع ${out[j].kind}`);
    }
    const g = d.ledger.filter(x => /^G-(carport|pergola|bbq|fountain)$/.test(x.id)); assert.equal(g.length, 4);
    assert.ok(g.every(x => x.ok), JSON.stringify(g));
  }
});

test('الأرض الضيقة: ما لا يتسع يُقال بسببه ولا يُرسم قسرًا', () => {
  const r = gen(15, 20, OUT), d = r.designs[0];
  const missing = d.garden.missing;
  assert.ok(missing.length > 0);
  for (const k of missing) assert.ok(!d.doc.fixtures.some(f => f.kind === k), k + ' لم يُرسم');
  assert.ok(d.garden.notes.length >= missing.length);
  assert.ok(d.ledger.some(x => /^G-/.test(x.id) && !x.ok && x.why));
});

test('الكميات واللوحة والرموز ثنائية الأبعاد للمرافق', () => {
  const d = gen(25, 30, OUT).designs[0], q = computeDocQuantities(d.doc), ids = JSON.stringify(q);
  for (const id of ['carportArea', 'pergolaArea', 'bbqCount', 'fountainCount']) assert.ok(ids.includes(id), id);
  assert.ok(/غير متحقق/.test(ids), 'عرض الموقف افتراض معلن');
  const svg = siteSheet(d.doc); const s = typeof svg === 'string' ? svg : svg.svg;
  for (const k of ['carport', 'pergola', 'bbq', 'fountain']) assert.ok(s.includes(`data-kind="${k}"`), k);
  for (const k of ['carport', 'pergola', 'bbq', 'fountain']) { const sym = fixtureSymbol({ kind: k, x: 0, y: 0, w: FIXTURES[k].w, d: FIXTURES[k].d, rot: 0 }); assert.ok(sym.rects.length + sym.lines.length + sym.ellipses.length > 0, k); }
});

test('شرعاء: كراج ومظلة وبرجولة وشواية ونافورة تُفهم وتُطبَّق لا تُهمل', () => {
  const b = buildBrief('ابي كراج لسيارتين وبرجولة وشواية ونافورة');
  assert.deepEqual(b.requirements.prefs.outdoor, { carport: 2, pergola: true, bbq: true, fountain: true });
  assert.ok(!b.unsupported.some(u => /الكراج|الجلسات|النافورة/.test(u)));
  assert.equal(buildBrief('كراج لثلاث سيارات').requirements.prefs.outdoor.carport, 3);
  assert.equal(buildBrief('مظلة سيارات 4 سيارات').requirements.prefs.outdoor.carport, 4);
  assert.equal(buildBrief('ابي مواقف').requirements.prefs.outdoor.carport, 2);
  assert.equal(buildBrief('ما ابي كراج').requirements.prefs.outdoor, undefined);
  assert.ok(buildBrief('ابي كراج مغلق بباب').unsupported.some(u => /الكراج المغلق/.test(u)));
  assert.ok(buildBrief('ابي باربيكيو وجلسة برا').requirements.prefs.outdoor.bbq);
});

test('شرعاء: سؤال عدد السيارات يظهر بلا ذكر عدد ولا يتكرر بعد الجواب', () => {
  const b = buildBrief('ابي كراج وغرفتين نوم');
  assert.ok(b.questions.some(q => q.id === 'cars'));
  assert.ok(!buildBrief('ابي كراج لسيارتين').questions.some(q => q.id === 'cars'));
  const s = new SharaSession({ land: { length: 30, width: 25, streets: ['s'], entries: ['s'] } }); s.start(); s.answer('mode', 'free');
  let out = s.answer('free', 'فيلا 4 غرف مع كراج');
  let ask = out.find(m => m.kind === 'ask');
  for (let i = 0; i < 4 && ask && ask.id !== 'cars'; i++) { out = s.answer(ask.id, { picks: [], text: ask.id === 'bedrooms' ? '4' : 'لا' }); ask = out.find(m => m.kind === 'ask'); }
  if (ask?.id === 'cars') { out = s.answer('cars', { picks: [], text: '3 سيارات' }); assert.equal(s.brief.requirements.prefs.outdoor.carport, 3); assert.ok(!out.some(m => m.kind === 'ask' && m.id === 'cars')); }
});
