// (ملاحظات المالك على المعاينة 2026-10-31، iPad) اختبارات الإصلاحات: كل اختبار هنا يفشل على f8e1844 وينجح بعد الإصلاح،
// ما عدا F9 (تسليم التصميم إلى المرسم) فهو حارس يثبت أن مسار النقل لا يحوّل المستند — نجح قبل الإصلاح وبعده.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLand } from '../dist/home-flow.mjs';
import * as B from '../dist/sharaa/brief.mjs';
import { SharaFlow, liveProfile } from '../dist/sharaa/flow.mjs';
import { supportRows } from '../dist/sharaa/adapter.mjs';
import { createDoc, applyCommand, serialize, parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { writeHandoff, consumeHandoff, STUDIO_KEY } from '../dist/draw/handoff.mjs';
import { summarizeDoc } from '../dist/design-session.mjs';

const LAND = normalizeLand({ length: 18, width: 30, streets: ['n'], entries: ['n'], floors: 1 }).land;
const COUNTS = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
// طلب العميل كما في الصورة C (بصياغة حرة فيها «ولازم» ملتصقة بالواو)
const TEXT_C = 'أبي ثلاث غرف نوم وأربع دورات مياه ومجلس رجال بمدخل مستقل ومقلط، ولازم مجلس الرجال بباب مباشر على غرفة الطعام، وغرفة كبار السن قريبة من الصالة، ومطبخ مفتوح على الصالة';
/** يقود الحوار كما تفعل الواجهة: كل سؤال يُجاب، وتأكيد البنود يأخذ الدرجة المقترحة (الزر الافتراضي في الواجهة). */
function drive(text = TEXT_C) {
  const f = new SharaFlow({ land: LAND, mode: 'free' }); let out = f.answer('free', text); const confirms = [];
  for (let i = 0; i < 30; i++) {
    const q = out[out.length - 1]; if (!q?.kind) break;
    if (q.kind === 'counts') out = f.answer('counts', COUNTS);
    else if (q.kind === 'confirm_items') { confirms.push(q.items); out = f.answer('ask', { key: 'confirm', value: { decisions: Object.fromEntries(q.items.map(it => [it.ref, it.suggested || 'preferred'])) } }); }
    else if (q.kind === 'choice' && q.id === 'ask') out = f.answer('ask', { key: q.key, value: q.key === 'guest_entrance' ? 'must' : q.options[q.options.length - 1].id });
    else if (q.kind === 'household') out = f.answer('ask', { key: 'household', value: { currentMembers: 5, picked: [] } });
    else if (q.kind === 'multi') out = f.answer('ask', { key: q.key, value: [] });
    else break;
  }
  return { f, out, confirms };
}

test('F1 «ولازم …بباب مباشر» يُقترح «لازم» لا «تفضيل» (الواو الملتصقة كانت تُسقط قرينة اللزوم)', () => {
  assert.equal(B.priorityOfRule({ quote: 'x' }, 'ولازم مجلس الرجال بباب مباشر علي غرفه الطعام'), 'mandatory');
  assert.equal(B.priorityOfRule({ quote: 'x' }, 'فلازم المطبخ مغلق'), 'mandatory');
  assert.equal(B.priorityOfRule({ quote: 'x' }, 'وضروري المجلس قريب من المدخل'), 'mandatory');
  // «أبي» وحدها رغبة لا شرط (مبدأ شرعاء القائم لم يتغير)، و«مو لازم» قابل للتنازل
  assert.equal(B.priorityOfRule({ quote: 'x' }, 'ابي المجلس بباب مباشر علي الطعام'), 'preferred');
  assert.equal(B.priorityOfRule({ quote: 'x' }, 'مو لازم المجلس بباب مباشر علي الطعام'), 'flexible');
});

test('F2 رحلة C: الباب المباشر المؤكد «لازم» يصل المحرك DIRECT_DOOR صلبًا؛ لا شرط إلزامي قبل التأكيد', () => {
  const f = new SharaFlow({ land: LAND, mode: 'free' }); f.answer('free', TEXT_C);
  const e0 = f.engineInput();
  assert.ok(!e0.requirements.relations.some(r => r.kind === 'DIRECT_DOOR'), 'قبل التأكيد لا يُرسل الباب صلبًا');
  const { f: g, confirms } = drive();
  const door = confirms.flat().find(it => /بباب مباشر على غرفة الطعام/.test(it.text));
  assert.equal(door?.suggested, 'mandatory', 'الدرجة المقترحة في سؤال التأكيد: ' + JSON.stringify(door));
  const e = g.engineInput();
  assert.ok(e.requirements.relations.some(r => r.kind === 'DIRECT_DOOR' && r.level === 'HARD'), JSON.stringify(e.requirements.relations));
  assert.ok(e.requirements.rules.some(r => r.door && r.level === 'must'));
});

test('F3 رحلة C لا تعلق عند «عدد المقلط لم يؤكده العميل»: المقلط يُسأل عنه ضمن تأكيد البنود ويصير الملف جاهزًا', () => {
  const { f, confirms } = drive();
  assert.ok(confirms.flat().some(it => it.ref === 'space:guest_dining'), 'المقلط ضمن بنود التأكيد');
  const R = f.readiness();
  assert.ok(R.canGenerate, 'الملف قابل للتوليد: ' + R.label_ar + ' ' + JSON.stringify(R.reasons.map(r => r.text_ar)));
  assert.ok(!R.reasons.some(r => r.type === 'UNCONFIRMED_COUNT'));
  // «احذفه» على المقلط: عدده صفر مؤكد، لا عالق
  const f2 = new SharaFlow({ land: LAND, mode: 'free' }); let out = f2.answer('free', 'أبي مجلس رجال ومقلط'); out = f2.answer('counts', COUNTS);
  const q = out.find(m => m.kind === 'confirm_items') || f2.nextQuestion();
  if (q?.kind === 'confirm_items') f2.answer('ask', { key: 'confirm', value: { decisions: Object.fromEntries(q.items.map(it => [it.ref, it.ref === 'space:guest_dining' ? 'drop' : 'preferred'])) } });
  assert.equal(B.spaceOf(f2.brief, 'guest_dining')?.count, 0);
  assert.ok(!f2.readiness().reasons.some(r => r.type === 'UNCONFIRMED_COUNT'));
});

test('F4 الملف الحي: «بدون مجلس النساء» لا «مجلس النساء × 0»، و«مطبخ مفتوح على الصالة» لا يوصف «بباب مباشر»', () => {
  const { f } = drive();
  const labels = supportRows(f.brief).map(r => r.label);
  assert.ok(labels.includes('بدون مجلس النساء'), labels.join(' | '));
  assert.ok(!labels.some(l => /× 0/.test(l)));
  const k = f.brief.relations.find(r => r.from === 'kitchen' && r.relation === 'direct_access');
  assert.ok(k && !/بباب مباشر/.test(B.describeRelation(k)), B.describeRelation(k));
  const aw = liveProfile(f.brief).awaiting; assert.ok(!aw.some(r => /المقلط/.test(r.label)), 'المقلط ليس عالقًا في «ينتظر تأكيدك»: ' + JSON.stringify(aw.map(r => r.label)));
});

test('F5 «هل نُفّذ طلبك؟»: كل طلب صريح ظاهر بحالته، والحكم لا يناقض «مسودة مرفوضة»', async () => {
  const { completeLedger, ledgerVerdict } = await import('../dist/request-ledger.mjs');
  const doc = sampleVilla();
  const req = { rules: [], relations: [{ id: 'g', kind: 'GUEST_ACCESS', from: 'majlis', to: 'dining', level: 'HARD', directDoor: 'unspecified' }, { id: 'd', kind: 'DIRECT_DOOR', from: 'majlis', to: 'dining', level: 'HARD' }], unsupported: ['الإطلالة على الحديقة'] };
  const base = [{ id: 'C-bed', kind: 'count', text: '3 غرف نوم', ok: true }, { id: 'P-old', kind: 'pref', text: 'غرفة لكبار السن قرب الصالة', ok: false, why: 'تبعد 4 م' }];
  const items = completeLedger(base, req, { doc, review: { gates: [{ id: 'GUEST_ROUTE', ok: true }, { id: 'MAJLIS_DINING', ok: false, reasons_ar: ['لا باب'] }] }, entry: 's' });
  assert.ok(items.some(x => /المقلط/.test(x.text) && x.state === 'missing'), 'المقلط ظاهر وحالته من بوابات المراجعة');
  assert.ok(items.some(x => /بباب مباشر/.test(x.text) && x.level === 'must'), 'الباب المباشر الصلب ظاهر «لازم»');
  assert.ok(items.some(x => x.state === 'pref-unmet' && /كبار السن/.test(x.text)), 'التفضيل غير المتحقق مميز عن الإلزامي');
  assert.ok(items.some(x => x.state === 'unsupported'));
  // كل البنود منفذة لكن العرض محجوب: لا «نُفّذت كل البنود» بالأخضر
  const allOk = completeLedger([{ id: 'C-bed', kind: 'count', text: '3 غرف نوم', ok: true }], {}, {});
  const V = ledgerVerdict(allOk, { status: 'hidden' });
  assert.notEqual(V.cls, 'full'); assert.match(V.text, /مرفوض/);
  assert.equal(ledgerVerdict(allOk, { status: 'ready' }).cls, 'full');
  assert.equal(ledgerVerdict(allOk, { status: 'needs-edits' }).cls, 'part');
});

test('F6 أبعاد الغرفة موجّهة (أفقي × رأسي) ومطابقة بين صفحة التصميم والمرسم — لا «طويل × قصير» مرة و«قصير × طويل» مرة', async () => {
  const { roomSpan } = await import('../dist/draw/digest.mjs');
  const room = (x0, y0, x1, y1, name) => d => { for (const [a, b] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]) d = applyCommand(d, { type: 'add-wall', level: 'L1', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, t: .2 }).doc; return applyCommand(d, { type: 'add-label', level: 'L1', name, roomType: 'bedroom', seed: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } }).doc; };
  let d = createDoc({ title: 't' }); d = room(0, 0, 6, 4, 'عريضة')(d); d = room(10, 0, 14, 6, 'طويلة')(d);
  const rooms = analyzeDoc(d).levels[0].rooms, wide = rooms.find(r => r.name === 'عريضة'), tall = rooms.find(r => r.name === 'طويلة');
  const a = roomSpan(wide), b = roomSpan(tall);
  assert.ok(a.aligned && a.x > a.y, 'العريضة: الأفقي أكبر ' + JSON.stringify(a));
  assert.ok(b.aligned && b.y > b.x, 'الطويلة: الرأسي أكبر ' + JSON.stringify(b));
  const S = summarizeDoc(d).rooms, sw = S.find(r => r.name === 'عريضة');
  assert.equal(sw.x, Math.round(a.x * 100) / 100); assert.equal(sw.y, Math.round(a.y * 100) / 100);
});

test('F7 قائمة التصدير تبقى داخل النافذة حين يكون الزر عند الحافة اليسرى (RTL) وعلى الهاتف', async () => {
  const { placeMenu } = await import('../dist/draw/menu-place.mjs');
  for (const [vw, vh, btn] of [[390, 844, { left: 6, right: 70, top: 8, bottom: 44 }], [1024, 768, { left: 12, right: 100, top: 6, bottom: 48 }], [1366, 1024, { left: 1200, right: 1290, top: 6, bottom: 48 }]]) {
    const p = placeMenu(btn, { w: 230, h: 260 }, vw, vh);
    assert.ok(p.left >= 8 && p.left + p.width <= vw - 8 && p.top >= 8 && p.top + p.maxHeight <= vh - 8 + 1e-9, JSON.stringify({ vw, p }));
  }
  const tiny = placeMenu({ left: 2, right: 40, top: 2, bottom: 30 }, { w: 600, h: 900 }, 320, 500);
  assert.ok(tiny.width <= 304 && tiny.maxHeight <= 484);
});

test('F8 الوضع البسيط للمرسم: الأدوات الأساسية ظاهرة والمتقدمة مخفية بالأنماط فقط (لا حذف)', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../dist/studio.html', import.meta.url), 'utf8'), css = readFileSync(new URL('../dist/studio.css', import.meta.url), 'utf8');
  assert.match(html, /data-mode="simple"/);
  for (const t of ['select', 'pan', 'wall', 'rect', 'opening', 'dimension']) assert.match(html, new RegExp(`data-tool="${t}"(?! data-adv)`), t);
  for (const t of ['room', 'fixture', 'stair', 'column', 'measure', 'text', 'erase']) assert.match(html, new RegExp(`data-tool="${t}" data-adv`), t);
  for (const t of ['props', 'rooms', 'review', 'ai']) assert.doesNotMatch(html, new RegExp(`data-adv data-tab="${t}"`), t);
  assert.match(html, /id="modeToggle"/); assert.match(css, /\[data-mode="simple"\] \[data-adv\]\{display:none!important\}/);
});

test('F9 (حارس) تسليم التصميم إلى المرسم لا يحوّل المستند: الأسماء والمساحات والأبعاد والأرض والمدخل والشمال كما هي', () => {
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  let doc = sampleVilla(); doc = applyCommand(doc, { type: 'set-plot', polygon: [{ x: -2, y: -3 }, { x: 28, y: -3 }, { x: 28, y: 15 }, { x: -2, y: 15 }], entry: 'n' }).doc;
  const ss = mem(), ls = mem(); writeHandoff(ss, doc, { source: 'design-page' }); const got = consumeHandoff(ss, ls);
  const sig = d => { const L = analyzeDoc(d).levels[0]; return { plot: d.plot, entry: d.entry, north: d.north || 0, rooms: L.rooms.map(r => [r.name, Math.round(r.area * 100), Math.round(r.rect.w * 100), Math.round(r.rect.l * 100), Math.round(r.centroid.x * 100), Math.round(r.centroid.y * 100)]), S: summarizeDoc(d).specs }; };
  assert.deepEqual(sig(got.doc), sig(doc)); assert.equal(serialize(got.doc), serialize(doc));
  assert.equal(serialize(parseDoc(ls.getItem(STUDIO_KEY))), serialize(doc), 'المحفوظ للمرسم بعد إعادة التحميل هو المستند نفسه');
});

test('F10 خطوة الأرض وشريط شرعاء يقولان الواجهة على شارع المدخل والعمق صراحةً (الطول/العرض محاور بوصلة لا «أطول/أقصر»)', async () => {
  const { landFaceText } = await import('../dist/home-flow.mjs');
  assert.match(landFaceText({ length: 18, width: 30, entries: ['n'] }), /واجهة الأرض على شارع المدخل \(شمال\): 30 م، وعمقها من الشارع: 18 م/);
  assert.match(landFaceText({ length: 18, width: 30, entries: ['e'] }), /\(شرق\): 18 م، وعمقها من الشارع: 30 م/);
  const f = new SharaFlow({ land: LAND });
  assert.ok(f.landBar().rows.some(r => r.k === 'الواجهة والعمق' && /واجهة 30 م على شارع شمال، وعمق 18 م/.test(r.v)));
});
