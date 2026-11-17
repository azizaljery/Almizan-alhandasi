// أقسام كود وادي حنيفة + مؤشر مطابقة الواجهة للدليل المنشور (ثانوي) + مصطلح «المعالجة المعمارية».
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultRooms, generateModel } from '../dist/planner.mjs';
import { evaluateRequirementEvidence, facadeGuideNotes, WADI_SECTIONS, WADI_SECTION_NUMBERS_NOTE, WADI_SECTION_NOTE } from '../dist/requirement-evidence.mjs';

const plot = { width: 30, length: 40, floors: 1, entry: 's', streets: { s: true, n: false, e: false, w: false }, streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null };
const rooms = defaultRooms();
const model = generateModel(plot, rooms, { strategy: 'balanced' });
const find = (r, id) => r.rows.find(row => row.id === id);
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');

test('قائمة المقاطع في الصفحة: كل الخيارات المطلوبة ومرتبطة بالتقييم', () => {
  const sel = html.match(/<select id="wadiSection">([\s\S]*?)<\/select>/)[1];
  for (const v of ['', 'T4.1', 'T3.2', 'T3.1', 'T2.2', 'T5.1', 'unknown']) assert.ok(sel.includes(`value="${v}"`), v);
  assert.match(html, /تحدده الهيئة الملكية لمدينة الرياض\/الأمانة وليس هذه الأداة/);
  assert.match(app, /wadiSection: \$\('wadiSection'\)/);
});

test('T4.1 من القائمة = السلوك القائم نفسه (أرقام متحقق منها)', () => {
  const viaBox = evaluateRequirementEvidence({ model, program: rooms, plot, jurisdiction: 'wadi-hanifah-t4-1' });
  const viaSel = evaluateRequirementEvidence({ model, program: rooms, plot, wadiSection: 'T4.1' });
  for (const id of ['reg-jurisdiction', 'reg-neighbor-setback', 'reg-coverage']) assert.deepEqual(find(viaSel, id), find(viaBox, id));
  assert.equal(find(viaSel, 'reg-wadi-section'), undefined);
});

test('المقاطع الأخرى: الاسم المتحقق فقط + «الأرقام غير متحقق منها» + نسبة الجهة، ولا أرقام كود مخترعة', () => {
  for (const sec of ['T3.2', 'T3.1', 'T2.2', 'T5.1', 'unknown']) {
    const r = evaluateRequirementEvidence({ model, program: rooms, plot, wadiSection: sec });
    const row = find(r, 'reg-wadi-section');
    assert.ok(row, sec); assert.equal(row.status, 'UNVERIFIED');
    assert.ok(row.evidence.includes(WADI_SECTION_NUMBERS_NOTE)); assert.ok(row.evidence.includes(WADI_SECTION_NOTE));
    assert.ok(row.evidence.includes(WADI_SECTIONS[sec].name));
    const jur = find(r, 'reg-jurisdiction');
    assert.equal(jur.status, 'UNVERIFIED', 'لا حكم نظامي من مقطع غير متحقق');
    assert.equal(find(r, 'reg-coverage').status, 'UNVERIFIED', 'التغطية تبقى دون حكم نظامي');
    assert.ok(!/٧٥٪/.test(row.evidence), 'لا أرقام T4.1 في المقاطع الأخرى');
  }
  assert.match(WADI_SECTIONS['T3.2'].name, /فلل \(صغيرة–متوسطة\)/);
  assert.match(find(evaluateRequirementEvidence({ model, program: rooms, plot, wadiSection: 'T3.2' }), 'reg-wadi-section').evidence, /غير متحقق من الوثيقة الرسمية/);
});

test('مؤشر الواجهة: ملاحظات إرشادية بمصدر «دليل منشور — ثانوي» ولا تظهر كاعتماد', () => {
  const r = evaluateRequirementEvidence({ model, program: rooms, plot });
  const notes = r.rows.filter(x => x.id.startsWith('facade-guide-'));
  assert.deepEqual(notes.map(x => x.id).sort(), ['facade-guide-colour', 'facade-guide-height', 'facade-guide-materials', 'facade-guide-windows']);
  for (const n of notes) {
    assert.match(n.source, /^دليل منشور — ثانوي/); assert.equal(n.status, 'MEASURED');
    assert.match(n.evidence, /ليست اعتمادًا رسميًا/);
  }
  assert.match(find(r, 'facade-guide-height').evidence, /3[,٫.]2|٣[,٫.]٢/);
});

test('مؤشر الواجهة: حدود الارتفاع والمواد والنوافذ تُحسب فعلًا', () => {
  const tall = facadeGuideNotes({ model: { ...model, plot: { ...model.plot, floors: 4 } }, facadeFinish: null });
  assert.match(tall.find(x => x.id.endsWith('height')).evidence, /أعلى من ذلك/);
  const two = facadeGuideNotes({ model: { ...model, plot: { ...model.plot, floors: 3 } } }); // 9.6 م
  assert.match(two.find(x => x.id.endsWith('height')).evidence, /ضمن ذلك/);
  assert.match(facadeGuideNotes({ model, plot, facadeFinish: { base: 'stone', accent: 'paint' } }).find(x => x.id.endsWith('materials')).evidence, /ضمن ذلك/);
  assert.match(facadeGuideNotes({ model, plot, facadeFinish: { base: 'stone', accent: 'render' }, }).find(x => x.id.endsWith('materials')).evidence, /ضمن ذلك/);
  assert.match(facadeGuideNotes({ model, plot }).find(x => x.id.endsWith('materials')).evidence, /غير متحقق/);
  const win = facadeGuideNotes({ model: { ...model, openings: [] }, plot }).find(x => x.id.endsWith('windows'));
  assert.match(win.evidence, /أقل من ذلك/);
});

test('المصطلح: «المعالجة المعمارية» تحل محل «الطراز» في واجهات المستخدم بلا تغيير للمعرّفات', () => {
  const rd = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
  assert.match(rd('view3d.html'), /جرّب معالجة أخرى/); assert.doesNotMatch(rd('view3d.html'), /<button[^>]*>جرّب طرازًا|قوالب هذا الطراز</);
  assert.match(rd('exterior-brief.mjs'), /أي معالجة معمارية تحب/);
  assert.match(rd('shara/brief-engine.mjs'), /أي معالجة معمارية للواجهة تعجبك/);
  assert.match(rd('facade-j/facade-realism/alternatives.mjs'), /ضمن هذه المعالجة/);
  assert.match(rd('shara-assistant.mjs'), /فالمعالجة المعمارية تلقائية/);
  assert.match(rd('exterior-brief.mjs'), /id: 'style'/);
});
