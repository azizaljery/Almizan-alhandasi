// «التطابق الهندسي بين 2D و3D»: يُبنى المجسّم بالباني الذي تعرضه صفحة view3d (buildBuildingScene) ثم يُقاس من هندسته
// (رؤوس مثلثات الجدران، وأشعة عبر الفتحات، ومثلثات الأرضيات) ويُقارن بالمستند. هنا في Node لسرعة الحزمة؛
// والسكربت scripts/consistency-2d3d.mjs يشغّل القياس نفسه داخل صفحة view3d.html الحقيقية في Chromium (وضعه الافتراضي).
// ويُشغَّل هنا أيضًا داخل المتصفح على مستند صغير إن وُجد Chromium (MIZAN_NO_BROWSER=1 يتخطاه).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import { expected2d, runNode, runBrowser } from '../scripts/consistency-2d3d.mjs';
import { measure3d, compare2d3d } from '../scripts/consistency-2d3d-lib.mjs';
import { miniDoc, rect, loadDoc } from './_mini-docs.mjs';

const clone = d => JSON.parse(JSON.stringify(d));
const simple = () => miniDoc({ levels: [
  { walls: [...rect(0, 0, 10, 6), [5, 0, 5, 6]], openings: [[3, 'door', 3, 1.0, { entry: true }], [4, 'door', 3, 0.9], [0, 'window', 2.5, 1.4], [1, 'window2', 3, 2.2]], labels: [['مدخل العائلة', 'entrance', 2.5, 3], ['الصالة', 'living', 7.5, 3]] },
  { walls: [...rect(0, 0, 10, 6), [5, 0, 5, 6]], openings: [[3, 'window', 3, 1.4], [4, 'door', 3, 0.9]], labels: [['غرفة نوم 1', 'bedroom', 2.5, 3], ['غرفة نوم 2', 'bedroom', 7.5, 3]] },
] });

test('مستند بسيط بدورين: المجسّم يطابق المسقط تمامًا (جدران، فتحات، أرضيات، أدوار)', async () => {
  const r = await runNode(simple());
  assert.deepEqual(r.mismatches, []);
  // القياس فعلي لا شكلي: كل الفتحات وُجدت بعرضها وجلستها
  for (const o of r.exp.openings) { const m = r.mea.openings[o.id]; assert.ok(m.found && Math.abs(m.width - o.w) < 0.02 && Math.abs(m.sill - o.sill) < 0.02, o.id); }
  assert.equal(Object.keys(r.mea.floors).length, 4);
  assert.deepEqual(r.mea.levels.map(l => l.elevation), [0, 3.2]);
});

test('ضوابط سلبية: فرق متعمد بين المسقط والمجسّم يُكشف بنوعه', () => {
  const doc = simple(), built = buildBuildingScene(doc, THREE, { textures: false });
  try {
    const moved = clone(doc); moved.openings[0].at += 0.3;           // باب المدخل
    const wider = clone(doc); wider.openings[2].w = 1.8;              // نافذة
    const thick = clone(doc); thick.walls[4].t = 0.3;                 // جدار داخلي
    const tall = clone(doc); tall.levels[1].height = 3.5;             // ارتفاع الدور الأول
    const renamed = clone(doc); renamed.labels[1].name = 'المجلس';
    const codesFor = d => { const e = expected2d(d); return compare2d3d(e, measure3d(THREE, built, e)).map(m => `${m.code}:${m.id}`); };
    assert.ok(codesFor(moved).includes('OPENING_POSITION:o1'));
    assert.ok(codesFor(wider).includes('OPENING_WIDTH:o3'));
    assert.ok(codesFor(thick).includes('WALL_THICKNESS:w5'));
    const t = codesFor(tall); assert.ok(t.includes('LEVEL_HEIGHT:L2') && t.some(c => c.startsWith('WALL_HEIGHT')));
    assert.ok(codesFor(renamed).includes('ROOM_NAME:L1:r2'));
  } finally { built.dispose(); }
});

test('C7 البديل الأول (الجولة التاسعة): كل شيء متطابق إلا النافذة o15 التي تعبر تقاطع جدار فيُسقطها المجسّم', async () => {
  const t0 = performance.now(), r = await runNode(loadDoc('evidence/acceptance/after-9/C7/alt-1.json'));
  assert.ok(performance.now() - t0 < 20000);
  assert.deepEqual(r.mismatches.map(m => `${m.code}:${m.id}`), ['OPENING_MISSING:o15']);
  assert.ok(r.exp.walls.length === 32 && r.exp.openings.length === 46 && Object.keys(r.mea.floors).length >= 24);
});

test('C7 البديل الثاني: باب مدخل الرجال o8 مفقود في المجسّم لأن نافذة o23 العابرة لتقاطع أُزيحت فوقه', async () => {
  const r = await runNode(loadDoc('evidence/acceptance/after-9/C7/alt-2.json'));
  const c = r.mismatches.map(m => `${m.code}:${m.id}`);
  assert.ok(c.includes('OPENING_MISSING:o8') && c.includes('OPENING_POSITION:o23'), JSON.stringify(c));
});

test('المتصفح: القياس نفسه داخل صفحة view3d.html الحقيقية يعطي النتيجة نفسها (يُتخطى مع MIZAN_NO_BROWSER=1 أو بلا Chromium)', { skip: !!process.env.MIZAN_NO_BROWSER || !existsSync('/opt/pw-browsers/chromium') || !existsSync('/opt/npm-tools/node_modules/playwright/index.mjs'), timeout: 60000 }, async () => {
  const doc = simple(), [b] = await runBrowser([{ key: 'simple', doc }]);
  assert.deepEqual(b.mismatches, []);
  assert.deepEqual(b.pageErrors, []);
});
