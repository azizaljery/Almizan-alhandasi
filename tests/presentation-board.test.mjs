import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms, quantities } from '../dist/planner.mjs';
import { buildPresentationBoard, boardRows, boardFeatures } from '../dist/presentation-board.mjs';

const model = (plot = { width: 20, length: 30 }) => generateModel({ ...plot, floors: 1, entry: 's', streets: { s: true } }, defaultRooms({ bedrooms: 3, majlis: 2, baths: 5 }));

test('لوحة العرض: أرقامها من النموذج والكميات فقط', () => {
  const m = model(), q = quantities(m), svg = buildPresentationBoard(m, { title: 'فيلا اختبار', date: '2026-10-12' });
  assert.match(svg, /^<svg[^>]*data-mizan-board="true"/);
  assert.ok(svg.includes('فيلا اختبار') && svg.includes('2026-10-12'));
  assert.ok(svg.includes(`${Math.round(q.rooms)} م²`), 'مجموع مساحات الغرف من الكميات');
  for (const r of boardRows(m)) assert.ok(svg.includes(r.name.replace(/&/g, '&amp;')), `الصف ${r.name}`);
  assert.ok(svg.includes('ليس اعتمادًا هندسيًا'), 'إخلاء المسؤولية ثابت');
});
test('لوحة العرض: الأرض الطويلة تأخذ اتجاهًا عموديًا، والمفلطحة أفقيًا', () => {
  assert.match(buildPresentationBoard(model({ width: 20, length: 30 })), /viewBox="0 0 1300 1760"/);
  assert.match(buildPresentationBoard(model({ width: 30, length: 30 })), /viewBox="0 0 1600 1120"/);
});
test('لوحة العرض: لا تدّعي ميزة غير موجودة في النموذج', () => {
  const f = boardFeatures(model()).join('|');
  assert.ok(!/خصوصية عالية|حديقة|مسبح|موقف/.test(f));
  assert.ok(f.includes('مدخل المنزل من الجهة جنوب'));
});
test('لوحة العرض: ترفض نموذجًا فارغًا', () => {
  assert.throws(() => buildPresentationBoard({ rooms: [], plot: { width: 20, length: 30 } }), /لا يوجد مخطط/);
  assert.throws(() => buildPresentationBoard(null), /لا يوجد مخطط/);
});
