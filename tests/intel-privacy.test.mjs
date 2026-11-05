// مؤشر الخصوصية السعودي: رسم المجاورة وخط الرؤية الهندسي والمعايير الخمسة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { generateVillaDesigns } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { privacyIndex, traceRay, sightFan, zoneOfRoom, THRESHOLDS } from '../dist/intel/privacy-index.mjs';
import { rect, label, open } from './fixtures/draw-cases.mjs';

const base = () => createDoc({ title: 'اختبار الخصوصية' });
const crit = (r, id) => r.criteria.find(c => c.id === id);

test('traceRay: الجدار يوقف الشعاع وفتحة الباب تمرّره إلى الفراغ المجاور', () => {
  let d = rect(base(), 0, 0, 4, 4); d = rect(d, 4, 0, 8, 4);
  d = label(d, 2, 2, 'أ', 'living'); d = label(d, 6, 2, 'ب', 'living');
  const blocked = traceRay(analyzeDoc(d).levels[0], { x: 1, y: 2 }, { x: 1, y: 0 });
  assert.deepEqual(blocked.rooms.map(r => r.name), ['أ']); assert.ok(blocked.blockedAt > 2.9 && blocked.blockedAt < 3.1);
  const withDoor = traceRay(analyzeDoc(open(d, 4, 2, 'door')).levels[0], { x: 1, y: 2 }, { x: 1, y: 0 });
  assert.deepEqual(withDoor.rooms.map(r => r.name), ['أ', 'ب']); assert.ok(withDoor.blockedAt > 6.9);
  // شعاع يمرّ بجانب الباب (خارج عرضه) يُحجب
  const aside = traceRay(analyzeDoc(open(d, 4, 2, 'door')).levels[0], { x: 1, y: 3.5 }, { x: 1, y: 0 });
  assert.deepEqual(aside.rooms.map(r => r.name), ['أ']);
});

test('sightFan: مروحة 180° من باب المدخل ترى الغرفة على المحور ولا ترى الغرفة المنحرفة عنه', () => {
  // مدخل (4..8 × 0..3) ← ممر (4..8 × 3..6) ← غرفة على المحور (4..8 × 6..10) وغرفة غرب الممر (0..4 × 3..6)
  let d = rect(base(), 4, 0, 8, 3); d = rect(d, 4, 3, 8, 6); d = rect(d, 4, 6, 8, 10); d = rect(d, 0, 3, 4, 6);
  d = open(d, 6, 0, 'door2', { entry: true }); d = open(d, 6, 3, 'arch'); d = open(d, 6, 6, 'door'); d = open(d, 4, 4.5, 'door');
  d = label(d, 6, 1.5, 'المدخل', 'entrance'); d = label(d, 6, 4.5, 'ممر', 'corridor'); d = label(d, 6, 8, 'غرفة نوم 1', 'bedroom'); d = label(d, 2, 4.5, 'غرفة نوم 2', 'bedroom');
  const lv = analyzeDoc(d).levels[0];
  const seen = sightFan(lv, { x: 6, y: 0.4 }, { x: 0, y: 1 });
  const names = [...seen.values()].map(v => v.room.name);
  assert.ok(names.includes('غرفة نوم 1')); assert.ok(!names.includes('غرفة نوم 2'));
  assert.deepEqual(seen.get([...seen.values()].find(v => v.room.name === 'غرفة نوم 1').room.id).via, ['المدخل', 'ممر']);
  const r = privacyIndex(d);
  const c = crit(r, 'bedroomSight');
  assert.equal(c.earned, THRESHOLDS.weights.bedroomSight / 2);
  const v = r.violations.find(x => x.criterion === 'bedroomSight');
  assert.match(v.problem, /غرفة نوم 1/); assert.ok(v.where.includes('غرفة نوم 1')); assert.match(v.fix, /[؀-ۿ]/);
});

test('(أ) مسار الضيف: عبور الصالة مخالفة، والباب المباشر من المدخل إلى المجلس يحلّها', () => {
  const build = direct => {
    let d = rect(base(), 4, 0, 8, 3); d = rect(d, 4, 3, 8, 7); d = rect(d, 0, 0, 4, 7);
    d = open(d, 6, 0, 'door2', { entry: true }); d = open(d, 6, 3, 'arch'); d = open(d, 4, 5, 'door');
    if (direct) d = open(d, 4, 1.5, 'door');
    d = label(d, 6, 1.5, 'المدخل', 'entrance'); d = label(d, 6, 5, 'الصالة', 'living'); d = label(d, 2, 3.5, 'مجلس الرجال', 'majlis');
    return privacyIndex(d);
  };
  const bad = build(false), good = build(true);
  assert.ok(crit(bad, 'guestPath').earned < THRESHOLDS.weights.guestPath / 2);
  const v = bad.violations.find(x => x.criterion === 'guestPath' && /العائلة/.test(x.problem));
  assert.ok(v && v.where.includes('الصالة'));
  assert.equal(crit(good, 'guestPath').earned, THRESHOLDS.weights.guestPath / 2); // المجلس يصل، ودورة مياه الضيوف مفقودة
  assert.ok(good.violations.some(x => /دورة مياه/.test(x.problem)));
});

test('(ب) مجلس النساء: الباب المباشر وخط الرؤية من المدخل مخالفتان، وبدونهما درجة كاملة', () => {
  const build = direct => {
    let d = rect(base(), 0, 0, 4, 4); d = rect(d, 4, 0, 8, 4);
    d = open(d, 2, 0, 'door2', { entry: true }); if (direct) d = open(d, 4, 2, 'door');
    d = label(d, 2, 2, 'مجلس الرجال', 'majlis'); d = label(d, 6, 2, 'مجلس النساء', 'majlis');
    return privacyIndex(d);
  };
  const bad = build(true), good = build(false);
  assert.equal(crit(bad, 'womenSeparation').earned, 0);
  assert.equal(bad.violations.filter(x => x.criterion === 'womenSeparation').length, 2);
  assert.equal(crit(good, 'womenSeparation').earned, THRESHOLDS.weights.womenSeparation);
  assert.equal(good.roles.womenMajlis, 'مجلس النساء'); assert.equal(good.roles.menMajlis, 'مجلس الرجال');
});

test('(د) المطبخ: خدمة المقلط عبر الصالة مخالفة، والباب المباشر يحلّها', () => {
  const build = direct => {
    let d = rect(base(), 0, 0, 4, 4); d = rect(d, 4, 0, 8, 4); d = rect(d, direct ? 0 : 8, direct ? 4 : 0, direct ? 4 : 12, direct ? 8 : 4);
    d = open(d, 6, 0, 'door2', { entry: true }); d = open(d, 4, 2, 'door');
    d = direct ? open(d, 2, 4, 'door') : open(d, 8, 2, 'door');
    d = label(d, 2, 2, 'المطبخ', 'kitchen'); d = label(d, 6, 2, 'الصالة', 'living'); d = label(d, direct ? 2 : 10, direct ? 6 : 2, 'المقلط', 'dining');
    return privacyIndex(d);
  };
  assert.equal(crit(build(false), 'kitchenService').earned, 0);
  assert.match(build(false).violations.find(x => x.criterion === 'kitchenService').fix, /باب خدمة/);
  assert.equal(crit(build(true), 'kitchenService').earned, THRESHOLDS.weights.kitchenService);
});

test('(هـ) غرفة الخادمة: باب خارجي = مدخل خدمة؛ الخروج عبر الصالة مخالفة؛ وبلا خادمة المعيار غير منطبق', () => {
  const build = ext => {
    let d = rect(base(), 0, 0, 4, 4); d = rect(d, 4, 0, 8, 4);
    d = open(d, 2, 0, 'door2', { entry: true }); d = open(d, 4, 2, 'door'); if (ext) d = open(d, 6, 4, 'door');
    d = label(d, 2, 2, 'الصالة', 'living'); d = label(d, 6, 2, 'غرفة الخادمة', 'service');
    return privacyIndex(d);
  };
  assert.equal(crit(build(true), 'maidEntrance').earned, THRESHOLDS.weights.maidEntrance);
  assert.equal(crit(build(false), 'maidEntrance').earned, 0);
  assert.equal(crit(privacyIndex(sampleVilla()), 'maidEntrance').earned, null);
  assert.equal(zoneOfRoom({ name: 'غرفة الخادمة', type: 'service' }), 'service');
  assert.equal(zoneOfRoom({ name: 'المجلس', type: 'majlis' }), 'men');
});

test('الدرجة 0-100 من المعايير المنطبقة فقط، ومستند بلا غرف يعيد null وملاحظة عربية', () => {
  const r = privacyIndex(sampleVilla());
  assert.ok(r.score >= 0 && r.score <= 100); assert.equal(r.criteria.length, 5);
  const applicable = r.criteria.filter(c => c.earned !== null);
  assert.equal(r.applicable, applicable.length);
  const expect = Math.round(applicable.reduce((s, c) => s + c.earned, 0) / applicable.reduce((s, c) => s + c.weight, 0) * 100);
  assert.equal(r.score, expect);
  assert.match(r.note, /عرف سعودي/); assert.match(r.note, /غير معايرة/);
  for (const v of r.violations) { assert.match(v.problem, /[؀-ۿ]/); assert.ok(Array.isArray(v.where) && v.where.length); assert.match(v.fix, /[؀-ۿ]/); }
  const empty = privacyIndex(createDoc());
  assert.equal(empty.score, null); assert.equal(empty.applicable, 0); assert.match(empty.note, /[؀-ۿ]/);
});

test('فيلا مولّدة بمجلسين وخادمة: الأدوار تُكتشف من الأسماء، مسار الرجال مستقل، والحساب سريع', () => {
  const req = extractRequirements('مجلس رجال ومجلس نساء وغرفة خادمة بحمام ومقلط');
  const { designs } = generateVillaDesigns({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }, requirements: req, keep: 1 });
  const t = Date.now(), r = privacyIndex(designs[0].doc), ms = Date.now() - t;
  assert.ok(ms < 500, 'ms=' + ms);
  assert.equal(r.roles.menMajlis, 'مجلس الرجال'); assert.equal(r.roles.womenMajlis, 'مجلس النساء'); assert.equal(r.roles.maid, 'غرفة الخادمة');
  assert.equal(r.roles.guestWc, 'دورة مياه الرجال');
  assert.equal(crit(r, 'guestPath').earned, THRESHOLDS.weights.guestPath);
  assert.ok(crit(r, 'womenSeparation').earned >= THRESHOLDS.weights.womenSeparation / 2);
  assert.ok(r.score > 0 && r.score <= 100);
});
