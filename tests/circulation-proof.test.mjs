// «اتصال الغرف عبر الأبواب والحركة الفعلية» (scripts/circulation-proof.mjs): أطوال مسارات حقيقية على شبكة مشي بخلوص جسم،
// والعيوب المعروفة من مجموعة المخططات المعيبة تُكشف، وعيوب الدرج في بدائل C7 (الجولة التاسعة) تُكشف.
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { circulationProof, serializable } from '../scripts/circulation-proof.mjs';
import { miniDoc, rect, loadDoc } from './_mini-docs.mjs';

const has = (r, code, sev) => r.findings.some(f => f.code === code && (!sev || f.severity === sev));
const room = (r, name) => r.rooms.find(x => x.name === name);

test('مسار فعلي: مدخل ← باب داخلي ← صالة؛ الطول قريب من المسافة الهندسية والخلاصة قابلة للحفظ', () => {
  const d = miniDoc({ levels: [{
    walls: [...rect(0, 0, 10, 4), [5, 0, 5, 4]],
    openings: [[3, 'door', 2, 1.0, { entry: true }], [4, 'door', 2, 0.9]],
    labels: [['مدخل العائلة', 'entrance', 2.5, 2], ['الصالة', 'living', 7.5, 2]],
  }] });
  const r = circulationProof(d), liv = room(r, 'الصالة');
  assert.ok(liv.graphReachable && liv.actual.reachable);
  assert.ok(liv.actual.toThreshold > 4.6 && liv.actual.toThreshold < 5.6, `العتبة ${liv.actual.toThreshold}`);
  assert.ok(liv.actual.toCenter >= liv.actual.toThreshold && liv.actual.toCenter < 8.5, `المركز ${liv.actual.toCenter}`);
  assert.deepEqual(liv.actual.via, ['مدخل العائلة', 'الصالة']);
  assert.equal(r.counts.serious, 0);
  assert.doesNotThrow(() => JSON.stringify(serializable(r)));
});

test('باب 0.7 م = تنبيه عرض، وغرفة لا تُبلغ إلا عبر غرفة نوم = جسيم، والأثاث أمام الباب يُسمّى', () => {
  const d = miniDoc({ levels: [{
    walls: [...rect(0, 0, 15, 4), [5, 0, 5, 4], [10, 0, 10, 4]],
    openings: [[3, 'door', 2, 1.0, { entry: true }], [4, 'door', 2, 0.7], [5, 'door', 2, 0.9]],
    labels: [['مدخل العائلة', 'entrance', 2.5, 2], ['غرفة نوم', 'bedroom', 7.5, 2], ['الصالة', 'living', 12.5, 2]],
    fixtures: [{ kind: 'wardrobe', x: 10.45, y: 2, w: 0.5, d: 1.6, rot: 0, h: 2.2 }],
  }] });
  const r = circulationProof(d);
  assert.ok(has(r, 'DOOR_NARROW', 'warn'));
  const tp = r.findings.find(f => f.code === 'THROUGH_PRIVATE');
  assert.ok(tp && tp.severity === 'serious' && /غرفة نوم/.test(tp.message), JSON.stringify(r.findings.map(f => f.code)));
  const bl = r.findings.find(f => f.code === 'BLOCKED_BY_FURNITURE');
  assert.ok(bl && bl.elements.includes('f1') && /الصالة/.test(bl.message), JSON.stringify(bl));
});

test('مجموعة المخططات المعيبة: غرفة بلا باب، ومجلس الرجال عبر جناح العائلة، ولا مدخل، وباب يصطدم فتحه', () => {
  assert.ok(has(circulationProof(loadDoc('evidence/review-proof/corpus/unreachable-room__C1-alt-1.json')), 'UNREACHABLE', 'serious'));
  const g = circulationProof(loadDoc('evidence/review-proof/corpus/guest-through-hall__C2-alt-1.json'));
  assert.ok(has(g, 'GUEST_CROSSES_FAMILY', 'serious') && has(g, 'GUEST_NO_OWN_ENTRY', 'serious'), JSON.stringify(g.findings.map(f => f.code)));
  assert.ok(has(circulationProof(loadDoc('evidence/review-proof/corpus/no-front-door__C1-alt-1.json')), 'NO_ENTRANCE', 'serious'));
  // الباب المقصود في العيب من بيانات المجموعة نفسها (target) — تُعاد صناعة المجموعة على أساس كل جولة
  const sj = JSON.parse(readFileSync(new URL('../evidence/review-proof/corpus/swing-blocked__C1-alt-1.json', import.meta.url), 'utf8'));
  const s = circulationProof(sj.doc);
  assert.ok(s.findings.some(f => f.code === 'DOOR_SWING' && f.elements.includes(sj.target)), sj.target);
});

test('بدائل C7 (الجولة التاسعة): الدرج في البديل الأول مسدود البداية والوصول، والثالث يُصعد إليه ويصل كل الأدوار', () => {
  const t0 = performance.now();
  const a1 = circulationProof(loadDoc('evidence/acceptance/after-9/C7/alt-1.json'));
  assert.ok(has(a1, 'STAIR_ACCESS', 'serious') && has(a1, 'STAIR_ARRIVAL', 'serious'), JSON.stringify(a1.findings.map(f => f.code)));
  const a3 = circulationProof(loadDoc('evidence/acceptance/after-9/C7/alt-3.json'));
  assert.equal(a3.counts.serious, 0, JSON.stringify(a3.findings.filter(f => f.severity === 'serious')));
  // في الثالث: بسطة الوصول أعلى الدرج ضيقة (تنبيه لا جسيم)، وكل غرفة في الدور الأول تُبلغ مشيًا من مدخل العائلة عبر الدرج بممر 0.3 م
  assert.ok(has(a3, 'STAIR_ARRIVAL', 'warn'));
  const up = a3.rooms.filter(x => x.level === 'L2' && x.type !== 'void').map(x => ({ ...x, d: x.bare.reachable ? x.bare : x.tight }));
  assert.ok(up.length >= 10 && up.every(x => x.d?.toCenter > 0), JSON.stringify(up.filter(x => !x.d).map(x => x.name)));
  const majlis = room(a3, 'المجلس');
  assert.equal(majlis.zone, 'men'); assert.ok(majlis.actual.toCenter < 6, 'المجلس قريب من مدخله');
  assert.ok(Math.min(...up.map(x => x.d.toCenter)) > 8, 'الدور الأول أبعد من الأرضي');
  assert.ok(performance.now() - t0 < 15000);
});
