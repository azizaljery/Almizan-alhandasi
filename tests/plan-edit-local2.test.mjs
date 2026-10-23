// الجولة العاشرة (dev/edit-local2): البصمة الهندسية، والاستراتيجيات الموضعية للأدوار التي كانت تعيد توزيع البيت،
// والأبواب والنوافذ، والرجوع إلى نسخة بعينها مع إعادة تعديل محدد. سريع: المستندات من أدلة r9 المحفوظة في المستودع
// (مخططات حقيقية من المولّد) ولا يولّد شيئًا — إعادة التوليد في اختبار «اسأل قبل إعادة التوزيع» مولّد مزيّف حتمي.
import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { parseEdit, applyEdits, inspect } from '../dist/plan-edit.mjs';
import { fingerprint, diffFingerprint, touchedKeys, outsideRegion, countAr } from '../dist/plan-fingerprint.mjs';
import { createSession, redesign, currentDoc, versionOf } from '../dist/design-session.mjs';
import { verifyRules } from '../dist/rules.mjs';
import { evaluateGates } from '../dist/plan-review.mjs';

const DOC = (s, n) => parseDoc(readFileSync(new URL(`../evidence/dialog/r9/sessions/${s}/doc-${n}.json`, import.meta.url), 'utf8'));
const REQ = { counts: { bedrooms: 4, majlis: 1, kitchens: 1, dining: 1 }, entry: 's' };
const edit = (doc, text, opts = {}) => { const more = extractRequirements(text, { counts: {} }); const p = parseEdit(text, doc, { more, lastSubject: opts.lastSubject || null }); return { p, r: applyEdits(doc, p, { req: { ...REQ, ...(opts.req || {}) }, history: opts.history || [] }) }; };
const roomsTouched = d => [...d.changed, ...d.added, ...d.removed].filter(e => e.kind === 'room').map(e => e.name_ar.replace(/[«»]/g, ''));
const newGateFails = (a, b, req = REQ) => { const before = new Set(evaluateGates(a, req).filter(g => !g.ok).map(g => g.id)); return evaluateGates(b, req).filter(g => !g.ok && !before.has(g.id)).map(g => g.id); };

test('البصمة: المستند مقارنًا بنفسه مطابق، والواجهة عنصر واحد، والحذف يعدّد عناصره بأسمائها', () => {
  const d = DOC('S1', 3), same = diffFingerprint(d, parseDoc(serialize(d)));
  assert.ok(same.identical); assert.equal(same.counts.touched, 0); assert.ok(same.counts.unchanged > 100);
  const f = fingerprint(d); assert.ok(f.elements.some(e => e.kind === 'wall') && f.elements.some(e => e.kind === 'opening') && f.elements.some(e => e.kind === 'room') && f.byKey.has('F|finish'));
  // الواجهة: عنصر «الواجهة» وحده
  const fac = parseDoc(serialize(d)); fac.finish = { ...(fac.finish || {}), facade: { base: 'stone', material: 'stone' } };
  const df = diffFingerprint(d, fac); assert.equal(df.counts.touched, 1); assert.equal(df.changed[0].kind, 'finish');
  // حذف المكتب (r9: تعديل موضعي): جداره الخارجيان وفتحاته الثلاث والغرفة نفسها فقط
  const del = diffFingerprint(DOC('S1', 3), DOC('S1', 4));
  assert.deepEqual(del.byKind.room, { changed: 0, added: 0, removed: 1, unchanged: 21 });
  assert.equal(del.removed.find(e => e.kind === 'room').name_ar, '«المكتب»');
  assert.ok(del.removed.filter(e => e.kind === 'opening').every(e => /المكتب/.test(e.name_ar)));
  assert.match(del.summary_ar, /تغيّر 6 عناصر/);
  assert.equal(countAr(1), 'عنصر واحد'); assert.equal(countAr(2), 'عنصران'); assert.equal(countAr(7), '7 عناصر'); assert.equal(countAr(40), '40 عنصرًا');
});

test('البصمة: جدار قُسم إلى قطعتين على خطه نفسه ثابت، وجدار انزاح = أزيل وأضيف', () => {
  const d = DOC('S1', 0), split = parseDoc(serialize(d)), w = split.walls.find(x => Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y) > 4 && !split.openings.some(o => o.wall === x.id));
  const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
  split.walls.push({ ...w, id: 'wSPLIT', a: m }); w.b = m;
  assert.ok(diffFingerprint(d, split).identical, 'إعادة التقسيم وحدها ليست تغييرًا');
  const moved = parseDoc(serialize(d)), w2 = moved.walls.find(x => x.id === w.id);
  const dx = Math.abs(w2.a.x - w2.b.x) < 1e-6 ? .5 : 0, dy = dx ? 0 : .5; w2.a = { x: w2.a.x + dx, y: w2.a.y + dy }; w2.b = { x: w2.b.x + dx, y: w2.b.y + dy };
  const dm = diffFingerprint(d, moved); assert.ok(dm.byKind.wall.removed >= 1 && dm.byKind.wall.added >= 1);
});

test('(أ-د) «المجلس على يمين الداخل»: عكس الشريط الأمامي موضعيًا — كل ما تغيّر داخل الشريط، وبقية البيت ثابتة بالبصمة', () => {
  const d = DOC('S5', 4), { p, r } = edit(d, 'خل المجلس على يمين الداخل', { req: { counts: { bedrooms: 3, majlis: 1, kitchens: 1, dining: 1 } } });
  assert.equal(p.intents[0].op, 'rule');
  assert.equal(r.status, 'local'); assert.ok(r.results[0].ok, r.results[0].why_ar); assert.match(r.results[0].how_ar, /عُكس الشريط/);
  assert.ok(verifyRules(r.doc, [{ ...p.intents[0].rule, id: 'X' }], { entry: 's' })[0].ok, 'المجلس يمين الداخل مقيسًا');
  const fd = diffFingerprint(d, r.doc);
  // الشريط الأمامي: من الواجهة (y=3.13) إلى حده الخلفي (y=7.33) — لا عنصر متغير خارجه (بهامش عرض فتحة على حدوده)
  assert.deepEqual(outsideRegion(fd, { x0: 4.38, x1: 15.58, y0: 3.13, y1: 7.33 }, 1).map(e => e.name_ar), []);
  assert.ok(fd.region.y1 <= 7.33 + 1 && fd.region.y0 >= 3.13 - 1, JSON.stringify(fd.region));
  assert.deepEqual(roomsTouched(fd).sort(), ['المجلس', 'دورة مياه الرجال', 'مدخل الرجال', 'مدخل العائلة'].sort());
  for (const name of ['الصالة', 'صالة الطعام', 'المطبخ', 'غرفة النوم الرئيسية', 'غرفة نوم 2', 'غرفة نوم 3', 'ممر الغرف']) assert.ok(!roomsTouched(fd).includes(name), name);
  // المجلس يبقى على الطعام ولا يفتح على الصالة العائلية
  const I = inspect(r.doc), maj = [...I.rooms.values()].find(x => x.name === 'المجلس');
  assert.ok(maj.links.some(l => I.rooms.get(l.to)?.name === 'صالة الطعام'));
  assert.ok(!maj.links.some(l => I.rooms.get(l.to)?.name === 'الصالة'));
  assert.deepEqual(newGateFails(d, r.doc, { counts: { bedrooms: 3, majlis: 1, kitchens: 1, dining: 1 } }), []);
});

test('(ب) «كبّر المجلس ٦×٧» على مجلس واجهته على خط الارتداد: الخارجية حتى الارتداد ثم الباقي من الداخل — بإذن لأن الصالة يتغير شكلها', () => {
  const d = DOC('S1', 0), { r } = edit(d, 'كبّر المجلس ٦×٧');
  assert.equal(r.status, 'clarify'); assert.equal(r.questions[0].type, 'needs-consent'); assert.match(r.questions[0].question_ar, /الصالة/);
  const y = edit(d, 'كبّر المجلس ٦×٧', { req: { consent: true } }).r;
  assert.equal(y.status, 'local'); assert.ok(y.results[0].ok, y.results[0].why_ar);
  const M = [...inspect(y.doc).rooms.values()].find(x => x.name === 'المجلس'), w = Math.min(M.net.x1 - M.net.x0, M.net.y1 - M.net.y0), l = Math.max(M.net.x1 - M.net.x0, M.net.y1 - M.net.y0);
  assert.ok(Math.abs(w - 6) <= .3 && Math.abs(l - 7) <= .3, `${w}×${l}`);
  const fd = diffFingerprint(d, y.doc);
  for (const n of roomsTouched(fd)) assert.ok(['المجلس', 'مدخل العائلة', 'الصالة', 'مغاسل', 'دورة مياه الرجال'].includes(n), n);
  assert.ok(fd.counts.unchanged > fd.counts.touched * 3, fd.summary_ar);
});

test('(ب) إزاحة سلسلة جدارين: «غرفة نوم ٢ ٤×٥ والباقي لا تلمسها» يسأل (الرئيسية تصغر)، و«نعم» تنقل الملابس والحمام كما هما', () => {
  const d = DOC('S4', 4), { r } = edit(d, 'ودي غرفة نوم ٢ تكون ٤×٥ والباقي لا تلمسها');
  assert.equal(r.status, 'clarify'); assert.match(r.questions[0].question_ar, /غرفة النوم الرئيسية/);
  const y = edit(d, 'غرفة نوم ٢ تكون ٤×٥', { req: { consent: true } }).r;
  assert.ok(y.results[0].ok, y.results[0].why_ar); assert.match(y.results[0].how_ar, /كما هي/);
  const A = inspect(d), B = inspect(y.doc), by = (I, n) => [...I.rooms.values()].find(x => x.name === n);
  const b2 = by(B, 'غرفة نوم 2'), w = Math.min(b2.net.x1 - b2.net.x0, b2.net.y1 - b2.net.y0), l = Math.max(b2.net.x1 - b2.net.x0, b2.net.y1 - b2.net.y0);
  assert.ok(Math.abs(w - 4) <= .35 && Math.abs(l - 5) <= .35, `${w}×${l}`);
  for (const n of ['غرفة الملابس', 'حمام الرئيسية']) assert.ok(Math.abs(by(B, n).area - by(A, n).area) / by(A, n).area < .03, n + ' بالمساحة نفسها');
  assert.ok(by(B, 'غرفة النوم الرئيسية').area < by(A, 'غرفة النوم الرئيسية').area);
  for (const n of roomsTouched(diffFingerprint(d, y.doc))) assert.ok(['غرفة نوم 2', 'غرفة النوم الرئيسية', 'غرفة الملابس', 'حمام الرئيسية', 'ممر الغرف'].includes(n), n);
});

test('الأبواب: فتح باب بين غرفتين متجاورتين = فتحة واحدة، و«سد الباب» يعود عليه فيرجع المخطط حرفيًا', () => {
  const d = DOC('S4', 0), { p, r } = edit(d, 'افتح باب بين المجلس والطعام');
  assert.deepEqual(p.intents.map(i => [i.op, i.action]), [['door', 'add']]);
  assert.equal(r.status, 'local'); assert.ok(r.results[0].ok);
  const fd = diffFingerprint(d, r.doc); assert.equal(fd.counts.touched, 1); assert.equal(fd.added[0].kind, 'opening');
  const id = r.results[0].subjectDoor; assert.ok(id);
  const c = edit(r.doc, 'سد الباب', { lastSubject: 'door:' + id }).r;
  assert.equal(c.status, 'local'); assert.ok(c.results[0].ok, c.results[0].why_ar);
  assert.ok(diffFingerprint(d, c.doc).identical, 'بعد فتحه وسده: مطابق للأصل بالبصمة');
  // «سد الباب» بلا غرفة ولا باب سابق: سؤال لا تخمين
  assert.equal(edit(d, 'سد الباب').p.questions[0].type, 'ambiguous-door');
  // سدّ باب يعزل غرفة: يُرفض بالبوابة ولا يتغير شيء
  const k = edit(d, 'سد الباب بين المطبخ والطعام').r; assert.ok(!k.results[0].ok); assert.match(k.results[0].why_ar, /يُوصل إليها|مسار/);
  // باب يكشف القسم العائلي للضيوف (المجلس يجاور الصالة في S1): يُسأل أولًا؛ وغرفتان لا تتجاوران: لم يُنفَّذ بسببه
  const g = edit(DOC('S1', 0), 'افتح باب بين المجلس والصالة').r; assert.equal(g.status, 'clarify'); assert.equal(g.questions[0].type, 'needs-consent');
  const nn = edit(d, 'افتح باب بين المجلس والصالة').r; assert.ok(!nn.results[0].ok); assert.match(nn.results[0].why_ar, /لا تتجاوران/);
  // باب موجود أصلًا: لا تغيير
  const e = edit(d, 'افتح باب بين المطبخ والطعام').r; assert.ok(e.results[0].already); assert.ok(diffFingerprint(d, e.doc).identical);
});

test('الأبواب والنوافذ: نقل باب غرفة 2 على جداره، وتكبير نافذة الصالة — فتحة واحدة فقط تتغير', () => {
  const d = DOC('S4', 0);
  const m = edit(d, 'انقل باب غرفة 2').r; assert.ok(m.results[0].ok, m.results[0].why_ar);
  const fm = diffFingerprint(d, m.doc); assert.equal(fm.counts.touched, 1); assert.equal(fm.changed[0].kind, 'opening');
  const b = fm.changed[0].box, a = fm.changed[0].before.box; assert.ok(Math.hypot((b.x0 + b.x1 - a.x0 - a.x1) / 2, (b.y0 + b.y1 - a.y0 - a.y1) / 2) >= .5);
  const w = edit(d, 'كبّر نافذة الصالة').r; assert.ok(w.results[0].ok, w.results[0].why_ar);
  const fw = diffFingerprint(d, w.doc); assert.equal(fw.counts.touched, 1); assert.equal(fw.changed[0].kind, 'opening'); assert.match(fw.changed[0].name_ar, /نافذة/);
  assert.ok(w.results[0].measured.after >= w.results[0].measured.before * 1.2);
  // «كبّر نافذة الصالة» لا تكبّر الصالة نفسها
  assert.ok(!edit(d, 'كبّر نافذة الصالة').p.intents.some(i => i.op === 'resize'));
});

const LAND5 = { width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1 };
const COUNTS5 = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
const session5 = () => { const req = extractRequirements('3 غرف نوم منها ماستر، مجلس، صالة، مطبخ وطعام', { counts: COUNTS5 }); req.counts = { ...req.counts, ...COUNTS5 }; return createSession({ land: LAND5, counts: req.counts, requirements: req, result: { doc: DOC('S5', 0), pat: 'r9-S5' } }); };
const noGen = async () => { throw Error('لا يُتوقع توليد في هذا الاختبار'); };

test('الرجوع إلى نسخة: «ارجع للنسخة الثانية» مطابق لها بالبصمة، و«رجّع مثل أول بس خل تعديل المجلس» لا يختلف عن الأولى إلا بعناصر تعديل المجلس نفسها', async () => {
  let s = session5(); const v = [currentDoc(s)];
  for (const t of ['كبّر نافذة الصالة', 'المجلس أصغر', 'غيّر الواجهة حجر']) { const o = await redesign(s, { text: t }, { generate: noGen }); assert.equal(o.reply.mode, 'local', t); assert.ok(o.reply.fingerprint, t); s = o.session; v.push(currentDoc(s)); }
  assert.equal(versionOf(s), 4);
  let o = await redesign(s, { text: 'ارجع للنسخة الثانية' }, { generate: noGen });
  assert.equal(o.reply.mode, 'restore'); assert.ok(o.reply.restoreProof.identical); assert.equal(o.reply.restoreProof.version, 2);
  s = o.session; assert.ok(diffFingerprint(v[1], currentDoc(s)).identical, 'مطابق للنسخة 2 حرفيًا'); assert.equal(versionOf(s), 5);
  o = await redesign(s, { text: 'رجّع مثل أول بس خل تعديل المجلس' }, { generate: noGen });
  assert.equal(o.reply.mode, 'restore'); const P = o.reply.restoreProof;
  assert.equal(P.version, 1); assert.ok(!P.identical); assert.ok(P.originalTouched > 0); assert.equal(P.common, P.originalTouched); assert.equal(P.replayTouched, P.originalTouched);
  s = o.session;
  const orig = touchedKeys(diffFingerprint(v[1], v[2])), now = touchedKeys(diffFingerprint(v[0], currentDoc(s)));
  assert.deepEqual([...now].sort(), [...orig].sort(), 'العناصر المتغيرة عن الأولى = عناصر تعديل المجلس');
  // نسخة غير موجودة: سؤال لا تخمين
  o = await redesign(s, { text: 'ارجع للنسخة التاسعة' }, { generate: noGen });
  assert.ok(o.reply.questions?.length); assert.ok(diffFingerprint(currentDoc(s), currentDoc(o.session)).identical);
});

test('اسأل قبل إعادة التوزيع: طلب لا حل موضعيًا له يُعرض أثره بالبصمة ولا يتغير المخطط، و«نعم» تعتمد المقترح نفسه، و«لا» تبقيه', async () => {
  const req = extractRequirements('4 غرف نوم منها ماستر، ومجلس رجال، وصالة، ومطبخ وطعام، ومكتب', { counts: REQ.counts }); req.counts = { ...req.counts, bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 };
  const s0 = createSession({ land: { ...LAND5 }, counts: req.counts, requirements: req, result: { doc: DOC('S1', 0), pat: 'r9-S1' } });
  const proposal = DOC('S1', 1); let calls = 0;
  const gen = async () => { calls++; return { doc: parseDoc(serialize(proposal)), pat: 'regen', summary: '', notes: [], floors: 1 }; };
  const o = await redesign(s0, { text: 'انقل المطبخ ورا جنب الطعام' }, { generate: gen });
  // (الجولة الرابعة عشرة) خيارات صريحة بدل «نعم/لا»: إبقاء المخطط، أو إعادة توزيع البيت (المقترح نفسه، مقيسًا بالبصمة)
  assert.equal(calls, 1); assert.equal(o.reply.mode, 'ask-options');
  assert.equal(o.reply.conflicts[0].type, 'needs-consent'); assert.match(o.reply.questions[0], /أعد توزيع البيت/); assert.match(o.reply.questions[0], /البصمة الهندسية/);
  assert.deepEqual(o.reply.options.map(x => x.id), ['keep', 'full']);
  assert.ok(o.reply.proposal.full.fingerprint.counts.touched > 50);
  assert.ok(diffFingerprint(currentDoc(s0), currentDoc(o.session)).identical, 'لم يتغير شيء قبل الموافقة');
  const no = await redesign(o.session, { text: 'لا' }, { generate: noGen });
  assert.ok(diffFingerprint(currentDoc(s0), currentDoc(no.session)).identical); assert.ok(!no.session.pendingEdit);
  const yes = await redesign(o.session, { text: 'نعم' }, { generate: noGen });
  assert.equal(yes.reply.mode, 'regenerated'); assert.ok(diffFingerprint(proposal, currentDoc(yes.session)).identical, 'المعتمد هو المقترح نفسه حرفيًا');
  assert.equal(versionOf(yes.session), 2);
});
