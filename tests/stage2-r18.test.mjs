// الجولة الثامنة عشرة: صدق النص الذي يراه العميل (العنوان الفرعي لصور الفرق من البصمة نفسها، ولا لغة داخلية)، وقياس مسار ضيف الرجال
// إلى الطعام (الطعام لا يُفتح بلا باب على منطقة العائلة)، ومسار الضيف شرطًا افتراضيًا قويًا في الاختيار، وغرفة الملابس ≥ 1.6 م،
// ونطاق تعديل الواجهة. المراجع المستقل r17 وكيل ذكاء اصطناعي (Claude) بدور معماري — ليس معماريًا بشريًا مرخّصًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { diffFingerprint, diffCaption } from '../dist/plan-fingerprint.mjs';
import { internalLeaks, isClientSafe } from '../dist/client-text.mjs';
import { measureR16 } from '../dist/privacy-defects.mjs';
import { polishR16 } from '../dist/r16-polish.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { parseEdit, applyEdits } from '../dist/plan-edit.mjs';

const root = new URL('../', import.meta.url).pathname;
const raw = (stage, id, f) => readFileSync(`${root}evidence/acceptance/${stage}/${id}/${f}`, 'utf8');
const ev = (stage, id, f) => parseDoc(raw(stage, id, f));
const STAGE = 'after-18';
const cases = () => readdirSync(`${root}evidence/acceptance/${STAGE}`).filter(x => /^C\d+$/.test(x));

test('العنوان الفرعي لصورة الفرق من البصمة: توزيع جديد حين انتقلت الغرف (C8 الخيار 3 في r17)، ولا «الغرف نفسها في أماكنها»', () => {
  const c = diffCaption(diffFingerprint(ev('after-17', 'C8', 'alt-2.json'), ev('after-17', 'C8', 'edit-alt2-opt-full.json')));
  assert.equal(c.kind, 'relayout');
  assert.match(c.client_ar, /^توزيع جديد: انتقلت الغرف/);
  assert.doesNotMatch(c.client_ar, /الغرف نفسها في أماكنها/);
  assert.ok(c.rooms.moved + c.rooms.removed >= c.rooms.before / 2);
});

test('تعديل الواجهة وحدها (C9 في r17): «لم يتغيّر المخطط — تغيّرت مادة الواجهة فقط»، لا «تغيّرت جدران أو أبواب أو نوافذ»', () => {
  for (const a of [1, 2, 3, 4]) {
    const c = diffCaption(diffFingerprint(ev('after-17', 'C9', `alt-${a}.json`), ev('after-17', 'C9', `edit-alt${a}-after.json`)));
    assert.equal(c.kind, 'facade', `C9-${a}`);
    assert.equal(c.client_ar, 'لم يتغيّر المخطط — تغيّرت مادة الواجهة فقط');
    assert.doesNotMatch(c.client_ar, /جدران|أبواب|نوافذ/);
  }
  const d = ev('after-17', 'C9', 'alt-1.json');
  assert.equal(diffCaption(diffFingerprint(d, d)).kind, 'identical');
});

test('تعديل باب وحده: «تغيّرت أبواب أو نوافذ؛ الغرف نفسها في أماكنها» — والعبارة لا تُقال إلا حين لم تتغيّر غرفة', () => {
  const a = ev('after-17', 'C9', 'alt-1.json'), b = parseDoc(raw('after-17', 'C9', 'alt-1.json'));
  const o = b.openings.find(x => x.kind === 'window'); o.at += .2;
  const c = diffCaption(diffFingerprint(a, b));
  assert.equal(c.kind, 'openings'); assert.match(c.client_ar, /الغرف نفسها في أماكنها/);
  assert.equal(c.rooms.moved + c.rooms.resized + c.rooms.added + c.rooms.removed, 0);
});

test('لغة داخلية في نص العميل تُكشف: معرّفات الملفات والبدائل والحالات وعبارة المحاكاة', () => {
  for (const t of ['C8 — خيارات التعديل (alt-2)', 'فرق التعديل: alt-2 ← edit-alt2-opt-full', 'بعد الاختيار (محاكاة اختبار القبول، لا اختيار عميل حقيقي)', 'النمط centralhall:ch1', 'edit-alt2-opt-full-diff.png'])
    assert.ok(internalLeaks(t).length, t);
  for (const t of ['فرق التعديل: التصميم 2 ← توزيع جديد مقترح للتصميم 2', 'خيارات التعديل — التصميم 2', 'لم يتغيّر المخطط — تغيّرت مادة الواجهة فقط', 'المطبخ 4×5 م في الخلف'])
    assert.ok(isClientSafe(t), t);
});

test(`صور ${STAGE}: كل عنوان فرعي لصورة فرق مطابق للبصمة المعادة حسابها، وبلا لغة داخلية، ولا يناقض حركة الغرف`, { skip: !existsSync(`${root}evidence/acceptance/${STAGE}`) }, () => {
  let n = 0;
  for (const id of cases()) {
    const f = `${root}evidence/acceptance/${STAGE}/${id}/captions.json`; if (!existsSync(f)) continue;
    const caps = JSON.parse(readFileSync(f, 'utf8'));
    for (const [png, c] of Object.entries(caps)) {
      if (!c.client_ar) continue; n++;
      const [bf, af] = c.source, re = diffCaption(diffFingerprint(ev(STAGE, id, bf), ev(STAGE, id, af)));
      assert.equal(c.client_ar, re.client_ar, `${id}/${png}`);
      assert.deepEqual(internalLeaks(c.client_ar), [], `${id}/${png}`);
      const r = re.rooms;
      if (r.moved + r.added + r.removed + r.resized) assert.doesNotMatch(c.client_ar, /الغرف نفسها في أماكنها|لم يتغيّر/, `${id}/${png}`);
      if (re.kind === 'facade' || re.kind === 'identical') assert.equal(r.moved + r.added + r.removed + r.resized, 0, `${id}/${png}`);
      // المرجع الداخلي (الحالة والملفات وعبارة المحاكاة) في captions.json وحده
      assert.match(c.internal_ar, new RegExp(id));
    }
  }
  assert.ok(n >= 4, `صور فرق ${n}`);
});

test(`نص العميل في ${STAGE} (خيارات التعديل وأسئلتها وردودها) بلا لغة داخلية`, { skip: !existsSync(`${root}evidence/acceptance/${STAGE}`) }, () => {
  for (const id of cases()) {
    const r = JSON.parse(raw(STAGE, id, 'result.json'));
    for (const e of [r.edit, ...(r.editAll || [])].filter(Boolean)) {
      for (const t of [e.question_ar, typeof e.consentAsked === 'string' ? e.consentAsked : null, ...(e.options || []).map(o => o.text_ar)].filter(Boolean))
        assert.deepEqual(internalLeaks(t), [], `${id}: ${t}`);
    }
  }
});

test('قياس مسار الضيف: طعام C8-2 (r17) يصله الضيف من «مدخل الرجال» لكنه مفتوح بقوس على «مدخل العائلة» — يُكشف، ويُصلح ببابٍ يُغلق', () => {
  const d = ev('after-17', 'C8', 'alt-2.json');
  const g = measureR16(d).find(x => x.id === 'GUEST_DINING');
  assert.equal(g.pass, false); assert.deepEqual(g.value.exposedTo, ['مدخل العائلة']);
  // البدائل التي حكم عليها المراجع «يُعرض» تبقى سليمة (لا تشديد يتجاوزه)
  for (const [id, a] of [['C1', 1], ['C5', 1], ['C6', 1], ['C9', 1], ['C10', 3]]) assert.equal(measureR16(ev('after-17', id, `alt-${a}.json`)).find(x => x.id === 'GUEST_DINING').pass, true, `${id}-${a}`);
  const p = polishR16(d);
  assert.ok(p.notes_ar.some(n => /يُغلق على «مدخل العائلة»/.test(n)));
  assert.equal(measureR16(d).find(x => x.id === 'GUEST_DINING').pass, true);
});

test('مقابل أحكام المراجع r17 على مستندات after-17 نفسها: الاتفاق 19 ← 20 من 22، ودقة «جاهز» 11/11، ولا «جاهز» كاذب', { skip: !existsSync(`${root}evidence/acceptance/after-18/recalibration-vs-r17.json`) }, () => {
  const s = JSON.parse(readFileSync(`${root}evidence/acceptance/after-18/recalibration-vs-r17.json`, 'utf8')).summary;
  assert.equal(s.agreementBefore, 19); assert.ok(s.agreementAfter >= 20);
  assert.deepEqual(s.falseReadyAfter, []);
  assert.equal(s.readyPrecisionAfter.ready, s.readyPrecisionAfter.reviewerShow);
});

test(`${STAGE}: لا يُعرض بديل يعبر فيه ضيف الرجال العائلة إلى الطعام ما دام في الحالة بديل لا يعبرها (C7: قراءتا «المجالس» مستقلتان)`, { skip: !existsSync(`${root}evidence/acceptance/${STAGE}/summary.json`) }, () => {
  const S = JSON.parse(readFileSync(`${root}evidence/acceptance/${STAGE}/summary.json`, 'utf8'));
  for (const c of S) {
    if (c.id === 'C7') continue;
    const gd = (c.designs || []).map(d => (d.presentation?.r16 || []).includes('GUEST_DINING'));
    if (gd.some(x => !x)) assert.ok(!gd.some(Boolean), `${c.id}: ${gd}`);
  }
});

test(`${STAGE}: «غرفة الملابس» التي يُمشى عبرها صافيها ≥ 1.6 م (وإلا تُسمّى مدخل الجناح)`, { skip: !existsSync(`${root}evidence/acceptance/${STAGE}`) }, () => {
  for (const id of cases()) for (const f of readdirSync(`${root}evidence/acceptance/${STAGE}/${id}`).filter(x => /^alt-\d+\.json$/.test(x))) {
    const m = analyzeDoc(ev(STAGE, id, f));
    for (const lv of m.levels) for (const r of lv.rooms.filter(x => /^غرفة (?:ال)?ملابس$/.test(x.name))) {
      const xs = r.net.map(p => p.x), ys = r.net.map(p => p.y), w = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      assert.ok(w >= 1.6 - .02, `${id}/${f}: ${r.name} ${w.toFixed(2)} م`);
    }
  }
});

test('نطاق تعديل الواجهة: «الأمامية فقط» / «والسور» / غير محدد ← الافتراضي كل الواجهات والدروة موسومًا ومعه السؤال', () => {
  const sc = t => extractRequirements(t, {}).tweaks?.facade?.scope ?? null;
  assert.equal(sc('غير الواجهة الامامية فقط الى حجر'), 'front');
  assert.equal(sc('خل الواجهات كلها والسور حجر'), 'all+fence');
  assert.equal(sc('احتفظ بهذا التوزيع وغيّر الواجهة إلى حجر'), null);
  const doc = ev('after-17', 'C9', 'alt-1.json'), text = 'احتفظ بهذا التوزيع وغيّر الواجهة إلى حجر';
  const more = extractRequirements(text, {}), parsed = parseEdit(text, doc, { more });
  const res = applyEdits(doc, parsed, {});
  assert.equal(res.doc.finish.facade.scope, 'all'); assert.equal(res.doc.finish.facade.scopeAsked, false);
  const how = res.results.map(r => r.how_ar || '').join(' ');
  assert.match(how, /كل الواجهات الظاهرة والدروة \(الافتراضي\)/); assert.match(how, /الواجهة الأمامية فقط أم كل الواجهات والدروة والسور؟/);
  // والمخطط نفسه حرفيًا
  assert.equal(diffCaption(diffFingerprint(doc, res.doc)).kind, 'facade');
});
