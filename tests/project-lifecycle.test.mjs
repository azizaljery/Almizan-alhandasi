import test from 'node:test';
import assert from 'node:assert/strict';
import { beginVisit, touchVisit, startNewProject, archiveCurrent, listPast, restorePast, deletePast, hasProject, takeNotice, clearProject, PROJECT_KEYS, KEPT_KEYS, PAST_KEY, PAST_MAX, ACTIVE_KEY } from '../dist/project-lifecycle.mjs';

const store = (init = {}, { failSet = false } = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (failSet) throw new Error('quota'); m.set(k, String(v)); }, removeItem: k => m.delete(k), get length() { return m.size; } }; };
const session = (land = { width: 20, length: 30 }) => JSON.stringify({ v: 1, input: { land }, designs: [{ doc: '{}' }, { doc: '{}' }], current: 0, approved: 1, createdAt: 7 });
const project = () => ({ 'mizan.design.session.v1': session(), 'mizan.studio.doc.v1': '{"schema":"mizan-draw/1"}', 'mizan.studio.snap3d.v1': 'data:image/png;base64,AAAA', 'mizan.home.state.v1': JSON.stringify({ confirmedLand: { width: 20, length: 30 } }), 'mizan.exterior.v1': '{"style":"S"}', 'mizan.land.geo.v1': '{}' });
const prefs = { 'mizan.shara.voice': '1', 'mizan.shara.open': '0', 'mizan.final.rates.v1': '{"a":1}', 'mizan_image_access_code': 'x', 'mizan.archive.consent.v1': '{"id":5}' };

test('دخول جديد (لا علامة نشطة): يحفظ السابق في «مشاريعي السابقة» ثم يمسح، ويبقي الإعدادات', () => {
  const local = store({ ...project(), ...prefs }), ses = store({ 'mizan.shara.chat.v1': '[]', 'mizan.home.handoff.v1': '{}' });
  const r = beginVisit(local, ses, 1000);
  assert.equal(r.fresh, true); assert.ok(r.archived);
  for (const k of PROJECT_KEYS) assert.equal(local.getItem(k), null, k);
  assert.equal(local.getItem('mizan.studio.snap3d.v1'), null);
  for (const [k, v] of Object.entries(prefs)) assert.equal(local.getItem(k), v, k);
  assert.equal(ses.getItem('mizan.shara.chat.v1'), null); assert.equal(ses.getItem('mizan.home.handoff.v1'), null);
  const past = listPast(local); assert.equal(past.length, 1); assert.deepEqual(past[0].summary.land, { width: 20, length: 30 }); assert.equal(past[0].summary.designs, 2);
  assert.ok(past[0].data['mizan.design.session.v1'] && !('mizan.studio.snap3d.v1' in past[0].data));
  assert.equal(takeNotice(ses), 'archived'); assert.equal(takeNotice(ses), null);
  assert.ok(ses.getItem(ACTIVE_KEY));
});
test('نفس التبويب (علامة نشطة): يستعيد مشروعه ولا يمسح شيئًا — رجوع/تحديث/عودة إلى تصميمي', () => {
  const local = store(project()), ses = store({ [ACTIVE_KEY]: '1' });
  const r = beginVisit(local, ses); assert.equal(r.fresh, false);
  assert.equal(local.getItem('mizan.design.session.v1'), project()['mizan.design.session.v1']); assert.equal(listPast(local).length, 0);
  beginVisit(local, ses); beginVisit(local, ses); assert.ok(hasProject(local));
});
test('دخول جديد بلا مشروع: لا إدخال في السابقة ولا تلميح', () => {
  const local = store(prefs), ses = store(); const r = beginVisit(local, ses);
  assert.equal(r.fresh, true); assert.equal(r.archived, null); assert.equal(listPast(local).length, 0); assert.equal(takeNotice(ses), null);
});
test('صفحة داخلية أولًا: touchVisit يضع العلامة بلا مسح، ثم الرئيسية في التبويب نفسه تستعيد', () => {
  const local = store(project()), ses = store(); touchVisit(ses);
  assert.ok(hasProject(local)); assert.equal(beginVisit(local, ses).fresh, false); assert.ok(hasProject(local));
});
test('sessionStorage غير متاح للكتابة: لا مسح أبدًا', () => {
  const local = store(project()), ses = store({}, { failSet: true }); const r = beginVisit(local, ses);
  assert.equal(r.fresh, false); assert.ok(hasProject(local));
});
test('مشروع جديد من داخل التبويب: يحفظ ثم يمسح؛ فشل الحفظ (امتلاء) يُعلن lost ولا يخفي', () => {
  const local = store(project()), ses = store({ [ACTIVE_KEY]: '1' });
  const r = startNewProject(local, ses, 5); assert.ok(r.archived); assert.equal(hasProject(local), false); assert.equal(takeNotice(ses), 'archived');
  const full = store(project(), { failSet: true }), s2 = store({ [ACTIVE_KEY]: '1' });
  const r2 = startNewProject(full, s2, 5); assert.equal(r2.archived, null); assert.equal(r2.hadProject, true); assert.equal(takeNotice(s2) , 'lost');
});
test('السابقة محدودة بـ 20 والأحدث أولًا، والاستعادة تحفظ الحالي أولًا، والحذف يعمل', () => {
  const local = store(), ses = store({ [ACTIVE_KEY]: '1' });
  for (let i = 0; i < 25; i++) { Object.assign(local.m, {}); local.setItem('mizan.design.session.v1', session({ width: 10 + i, length: 30 })); archiveCurrent(local, 1000 + i); clearProject(local, ses); }
  const past = listPast(local); assert.equal(past.length, PAST_MAX); assert.equal(past[0].summary.land.width, 34);
  local.setItem('mizan.design.session.v1', session({ width: 99, length: 99 }));
  const target = past[3].id; assert.ok(restorePast(local, ses, target, 9999));
  assert.equal(JSON.parse(local.getItem('mizan.design.session.v1')).input.land.width, 31);
  assert.ok(listPast(local).some(i => i.summary.land.width === 99)); assert.ok(!listPast(local).some(i => i.id === target));
  const id = listPast(local)[0].id; deletePast(local, id); assert.ok(!listPast(local).some(i => i.id === id));
  assert.equal(restorePast(local, ses, 'nope'), false);
});
test('مفاتيح الإعدادات لا تتقاطع مع مفاتيح المشروع، وPAST_KEY ليس منها', () => {
  for (const k of KEPT_KEYS) assert.ok(!PROJECT_KEYS.includes(k), k);
  assert.ok(!PROJECT_KEYS.includes(PAST_KEY));
  const local = store({ [PAST_KEY]: 'مشوّه{' }); assert.deepEqual(listPast(local), []);
});
