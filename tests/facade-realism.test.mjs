// (طلب المالك 2026-11-02) عينة الواجهات الواقعية: ثلاثة بدائل على الواجهة الأمامية لمسقط C1.
// (أ) الفتحات من المسقط حرفيًا، (ب) البدائل مختلفة في توزيع الكسوات، (ج) كل طبقة خارج المخطط موسومة،
// (د) كل خامة لها اسم ومكان ومرجع وحالة تحقق، (هـ) الطرز الأربعة القائمة لم تتغير (بصمات الخرج من الشيفرة قبل هذه الإضافة).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseDoc } from '../dist/draw/doc.mjs';
import * as F from '../dist/facade-styles.mjs';
import * as R from '../dist/facade-realism/index.mjs';
import { MATERIALS, CLASSES, TAG } from '../dist/facade-realism/model.mjs';

const C1 = parseDoc(readFileSync(new URL('./fixtures/facade/C1.json', import.meta.url), 'utf8'));
const SAMPLE = R.buildSample(C1);
const MIN_PAIR_DISTANCE = .25; // مجموع الفروق المطلقة لنسب الكسوات الظاهرة (0 = متطابق، 2 = متعاكس تمامًا)

test('(أ) الفتحات الأمامية من المسقط: العدد والمكان والمقاس متطابقة في البدائل الثلاثة', () => {
  const docFront = F.facadeGeometry(C1).sides.s.pieces.flatMap(p => p.openings.map(o => o.id)).sort();
  assert.equal(docFront.length, 8);
  for (const id of ['A', 'B', 'C']) {
    const c = SAMPLE.variants[id].checks;
    assert.deepEqual(c.sizeErrors, [], `البديل ${id}: مقاسات مختلفة`);
    assert.equal(c.openingsDocFront, docFront.length, `البديل ${id}: عدد الفتحات`);
    assert.equal(c.openingsInPlan, docFront.length, `البديل ${id}: الفتحات المرسومة`);
    assert.ok(c.openingsDrawnOnce, `البديل ${id}: فتحة مرسومة أكثر من مرة أو لا تُرسم`);
    assert.equal(c.fakeHoles, 0, `البديل ${id}: ثقب لا يقابل فتحة في المسقط`);
    assert.equal(c.frameHoles, 0, `البديل ${id}: إطار لا يطابق فتحة`);
    const ids = SAMPLE.variants[id].built.F.pieces.flatMap(p => p.openings.map(o => o.id)).sort();
    assert.deepEqual(ids, docFront, `البديل ${id}: معرّفات الفتحات`);
  }
});

test('(ب) البدائل الثلاثة مختلفة في توزيع الكسوات الظاهرة (بصمة التوزيع)', () => {
  for (const { pair, distance } of SAMPLE.pairs) assert.ok(distance >= MIN_PAIR_DISTANCE, `${pair}: الفرق ${distance} أقل من ${MIN_PAIR_DISTANCE}`);
  const fp = id => SAMPLE.variants[id].fingerprint;
  assert.ok(fp('A').stone > .8, 'A: الحجر هو الكسوة الغالبة');
  assert.ok(fp('B').render > .6 && fp('B').stone < .3, 'B: رندر مع قاعدة حجرية');
  assert.ok(fp('C').timber > .1, 'C: الفاسيا الخشبية المشابهة ظاهرة');
});

test('(ج) كل طبقة خارج المخطط موسومة «تعديل مقترح»، والطبقات من المخطط هي الجدار والفتحات فقط', () => {
  for (const id of ['A', 'B', 'C']) {
    const { built, checks } = SAMPLE.variants[id];
    assert.deepEqual(checks.untaggedNonPlan, [], `البديل ${id}: طبقات بلا وسم`);
    assert.deepEqual(checks.planLayersNotWallOrOpening, [], `البديل ${id}: طبقة من المخطط ليست جدارًا ولا فتحة`);
    for (const l of built.layers) if (!l.plan) assert.equal(l.tag, TAG, `${l.id}`);
    assert.ok(built.layers.some(l => !l.plan), `البديل ${id}: يجب أن يحمل تعديلات مقترحة`);
  }
});

test('(د) كل خامة لها اسم عربي وإنجليزي وفئة ومكان استخدام ومرجع وحالة تحقق، ولا رقم فني مكتوب دون قراءة', () => {
  const TECH = /\d+(\.\d+)?\s*(kg|MPa|N\/mm|kN|%|°C|W\/m|مم²|ميغا)/i;
  for (const [key, m] of Object.entries(MATERIALS)) {
    assert.ok(m.ar && m.en, key + ': اسم');
    assert.ok(CLASSES.includes(m.cls), key + ': فئة');
    assert.ok(m.where && m.where.length > 10, key + ': مكان الاستخدام');
    assert.ok(m.ref && m.ref.length > 5, key + ': مرجع أو «غير متحقق»');
    assert.ok(m.verified && m.verified.length > 5, key + ': حالة التحقق');
    for (const t of [m.ar, m.en, m.where, m.ref, m.verified]) {
      assert.doesNotMatch(t, /معتمد|مطابق للكود|مطابق للمواصفات/, key + ': ادعاء اعتماد غير مثبت');
      assert.doesNotMatch(t, TECH, key + ': رقم فني غير مقروء');
    }
  }
  for (const id of ['A', 'B', 'C']) for (const l of SAMPLE.variants[id].built.layers) assert.ok(MATERIALS[l.mat], `${id}: خامة غير معرّفة ${l.mat}`);
});

test('(هـ) الطرز الأربعة القائمة: مخرجات الواجهة والمجسّم لم تتغير (بصمات من الشيفرة قبل هذه الإضافة)', () => {
  const BASE = {
 "C1.classic.svg": "0887e5df3f0006ef",
 "C1.classic.3d": "105337ee6d4a4078",
 "C1.neoclassic.svg": "a32affc1859b137e",
 "C1.neoclassic.3d": "813cf7058a8fdf01",
 "C1.modern.svg": "ddde74a7b1138df6",
 "C1.modern.3d": "cb6cbfe398d07721",
 "C1.najdi.svg": "cd73f38c692360c0",
 "C1.najdi.3d": "83aa6af250f6f467",
 "C4.classic.svg": "6b2e980952995334",
 "C4.classic.3d": "4bffbc51f405e959",
 "C4.neoclassic.svg": "b26a8e6ad336f08d",
 "C4.neoclassic.3d": "27be59a666084d22",
 "C4.modern.svg": "da10f81b2c7439e5",
 "C4.modern.3d": "48f35a7eff14cb3d",
 "C4.najdi.svg": "fcb54b7c7aed4dce",
 "C4.najdi.3d": "3afdf29bd753f3fc",
 "C7.classic.svg": "5d18f9f304279e38",
 "C7.classic.3d": "5863c06a84498717",
 "C7.neoclassic.svg": "a9eb5c15c4d53a45",
 "C7.neoclassic.3d": "57204d23edf6ee76",
 "C7.modern.svg": "6df65080af792430",
 "C7.modern.3d": "4bbc951bcdcd3d77",
 "C7.najdi.svg": "29630753141b5249",
 "C7.najdi.3d": "e83e90cff7002cb6"
};
  const h = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
  for (const id of ['C1', 'C4', 'C7']) {
    const doc = parseDoc(readFileSync(new URL(`./fixtures/facade/${id}.json`, import.meta.url), 'utf8'));
    for (const style of F.STYLE_IDS) {
      const spec = F.resolveFacade(doc, { style, clientKey: 7 });
      assert.equal(h(F.SIDES.map(s => F.elevationSvg(doc, s, spec)).join('|')), BASE[`${id}.${style}.svg`], `${id}.${style} الواجهة`);
      assert.equal(h(JSON.stringify(F.facadeStyle3D(F.withFacade(doc, { style }, 7)))), BASE[`${id}.${style}.3d`], `${id}.${style} المجسّم`);
    }
  }
});
