import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { legacyToDoc } from '../dist/draw/import-legacy.mjs';
import { computeStructure } from '../dist/draw/structure.mjs';
import { structureSheetSvg, structureTypes, structureAxes, structureCsv } from '../dist/draw/structure-sheet.mjs';

const mk = (strategy = 'compact') => { const d = legacyToDoc(generateModel({ width: 18, length: 26, floors: 1, streets: { s: true }, entry: 's' }, defaultRooms({ bedrooms: 3, majlis: 1 }), { strategy })).doc; d.title = 'مشروع اختبار'; return d; };

test('اللوحة: SVG سليم يحمل الجداول والمحاور والتنبيه ولا NaN', () => {
  const doc = mk(), st = computeStructure(doc), svg = structureSheetSvg(doc, st, { fingerprint: 'abc123', date: '2026-10-16' });
  assert.match(svg, /^<svg /); assert.match(svg, /<\/svg>$/);
  assert.ok(!/NaN|undefined|Infinity/.test(svg), 'لا قيم فاسدة في الرسم');
  for (const k of ['جدول الأعمدة', 'جدول الجسور', 'البلاطة والمواد', 'ملاحظات', 'abc123', 'لا يغني', 'تحجيم أولي من الرسم']) assert.ok(svg.includes(k), k);
  assert.ok((svg.match(/<text/g) || []).length > 100);
});

test('اللوحة: عدد الأنواع والعناصر في الجداول يطابق الحساب', () => {
  const doc = mk(), L = computeStructure(doc).levels[0], T = structureTypes(L);
  assert.equal(T.colTypes.reduce((a, t) => a + t.count, 0), L.columns.length);
  assert.equal(T.beamTypes.reduce((a, t) => a + t.count, 0), L.beams.length);
  assert.ok(Math.abs(T.beamTypes.reduce((a, t) => a + t.length, 0) - L.beams.reduce((a, b) => a + b.length, 0)) < 1e-6);
  const ax = structureAxes(L); assert.ok(ax.x.length >= 2 && ax.y.length >= 2);
  for (const c of L.columns) assert.ok(ax.x.some(a => Math.abs(a.pos - c.x) <= 0.5) && ax.y.some(a => Math.abs(a.pos - c.y) <= 0.5), 'كل عمود على محور (±0.5 م)');
});

test('اللوحة: التعديل يغيّر اللوحة (عمود رسمه المستخدم يظهر بحلقة ذهبية)', async () => {
  const { applyCommand } = await import('../dist/draw/doc.mjs');
  const doc = mk(), base = computeStructure(doc).levels[0], p = base.columns[0];
  const d2 = applyCommand(doc, { type: 'add-column', level: doc.levels[0].id, x: p.x, y: p.y, size: 0.4 }).doc;
  const a = structureSheetSvg(doc, computeStructure(doc), {}), b = structureSheetSvg(d2, computeStructure(d2), {});
  assert.notEqual(a, b); assert.ok(b.includes('stroke="#d9ba79" stroke-width="2.2"'));
});

test('اللوحة: دور بلا أعمدة يعرض رسالة لا أرقامًا؛ وCSV يحمل الدرجة والمصدر', () => {
  const doc = mk(); doc.walls = [];
  const svg = structureSheetSvg(doc, computeStructure(doc), {}); assert.ok(svg.includes('ارسم محيط مبنى') || svg.includes('لا توجد'));
  const csv = structureCsv(computeStructure(mk())); assert.ok(csv.includes('عمود') && csv.includes('جسر') && csv.includes('بلاطة') && csv.includes('تقدير'));
});

test('اللوحة: كل الاستراتيجيات تنتج لوحة صالحة', () => {
  for (const s of ['claude-rect', 'compact', 'balanced', 'frontage', 'courtyard', 'u-court', 'pavilions', 'staggered']) {
    const doc = mk(s), svg = structureSheetSvg(doc, computeStructure(doc), {}); assert.ok(!/NaN/.test(svg), s);
  }
});
