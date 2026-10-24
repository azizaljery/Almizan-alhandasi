// يشغّل حالات القبول المعمارية على الشيفرة الحالية ويحفظ: المستندات، ومقاييس كل بديل، وسجل المطابقة،
// ومصفوفة اختلاف البدائل، والزمن. الاستعمال: node scripts/acceptance-run.mjs <stage> [نمط الحالات] [--engine v1|v2]
// (أو MIZAN_ENGINE=v2). الافتراضي v1: المولّد المنشور dist/villa-layout.mjs؛ و v2: dist/villa-layout-v2.mjs.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { CASES as MAIN_CASES } from './acceptance-cases.mjs';
import { HELDOUT } from './heldout-cases.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as V1 from '../dist/villa-layout.mjs';
import * as V2 from '../dist/villa-layout-v2.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { verifyRequest, docRooms } from '../dist/rules.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { serialize } from '../dist/draw/doc.mjs';
import { zoneDiff, matchShown } from '../dist/edit-truth.mjs';
import { archMatrix, THRESHOLDS as ARCH_T, archSignatureV2, archDifferenceV2, explainDifference, SUBSTANTIVE_V2 } from '../dist/arch-difference.mjs';

const argv = process.argv.slice(2), ei = argv.indexOf('--engine');
const engine = (ei >= 0 ? argv[ei + 1] : process.env.MIZAN_ENGINE) || 'v1';
if (!['v1', 'v2', 'v3'].includes(engine)) throw Error('المحرك v1 أو v2 أو v3');
// (الجولة 19) الحالات المحجوزة H1–H5 (صارت معروفة بعد مراجعة r19)؛ (الجولة 20) dev: حالات تطوير D1–D10، وheldout2: الحالات المحجوزة الثانية
// H6–H10 — تُحمَّل ديناميكيًا عند طلبها وحده (لا تُفتح ولا تُشغَّل قبل التجميد)، وأي مصفوفة حالات يصدّرها الملف تُستعمل كما هي
const ci = argv.indexOf('--cases'), setName = ci >= 0 ? argv[ci + 1] : 'main';
let CASES = MAIN_CASES;
if (setName === 'heldout') CASES = HELDOUT;
else if (setName === 'dev') CASES = (await import('./dev-cases-r20.mjs')).DEV;
else if (setName === 'heldout2') { const m = await import('./heldout2-cases.mjs'); CASES = Object.values(m).find(v => Array.isArray(v) && v.every(c => c && c.id && c.land && c.text)); if (!CASES) throw Error('heldout2-cases.mjs: لا مصفوفة حالات'); }
else if (setName !== 'main') throw Error('--cases: main | heldout | heldout2 | dev');
const pos = argv.filter((a, i) => !a.startsWith('--') && !['--engine', '--cases'].includes(argv[i - 1]));
const stage = pos[0] || 'before', only = pos[1] ? new RegExp(pos[1]) : null;
const { generateVillaDesigns, generateVillaTwoFloors } = engine === 'v3' ? V3 : engine === 'v2' ? V2 : V1;
const OUT = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const r2 = v => Math.round(v * 100) / 100;

/** مقاييس موضوعية لمخطط واحد: الحركة، الفراغات بلا نوافذ، العيوب، المطابقة. */
export function metrics(doc, req, entry) {
  const { rooms } = docRooms(doc), net = rooms.reduce((a, r) => a + r.area, 0);
  const circ = rooms.filter(r => ['entrance', 'corridor', 'living'].includes(r.type) && /مدخل|ممر|ردهة|مغاسل/.test(r.name)).reduce((a, r) => a + r.area, 0);
  const rv = reviewDoc(doc), by = c => rv.filter(i => i.code === c).length;
  const led = verifyRequest(doc, req, { entry });
  const beds = rooms.filter(r => r.type === 'bedroom' || r.type === 'master');
  const hall = rooms.find(r => r.name === 'الصالة' && r.li === 0) || rooms.find(r => /^الصالة/.test(r.name));
  // الجولة السادسة: أطول ممر غرف (ومن جهة واحدة أم جهتين)، وأصغر غرفة نوم، والمطبخ، وأضيق مدخل/ممر فرعي — مقيسة من المستند
  const cors = V2.planCorridors(rooms), kit = rooms.find(r => r.type === 'kitchen' && r.name === 'المطبخ');
  const subs = rooms.filter(r => ['corridor', 'entrance'].includes(r.type)).map(r => ({ name: r.name, s: Math.min(r.x1 - r.x0, r.y1 - r.y0) })).sort((a, b) => a.s - b.s);
  const bedMin = beds.length ? beds.reduce((a, b) => (b.area < a.area ? b : a)) : null;
  return {
    corridorMax: cors.length ? cors.reduce((a, c) => (c.len > a.len ? c : a)) : null,
    smallestBedroom: bedMin ? { name: bedMin.name, area: r2(bedMin.area) } : null,
    kitchen: kit ? { w: r2(Math.min(kit.x1 - kit.x0, kit.y1 - kit.y0)), l: r2(Math.max(kit.x1 - kit.x0, kit.y1 - kit.y0)), area: r2(kit.area) } : null,
    narrowestSubCirculation: subs[0] ? { name: subs[0].name, clear: r2(subs[0].s) } : null,
    hall: hall ? { w: r2(Math.min(hall.x1 - hall.x0, hall.y1 - hall.y0)), l: r2(Math.max(hall.x1 - hall.x0, hall.y1 - hall.y0)), ratio: r2(Math.max(hall.x1 - hall.x0, hall.y1 - hall.y0) / Math.min(hall.x1 - hall.x0, hall.y1 - hall.y0)) } : null,
    rooms: rooms.length, net: r2(net), circulationPct: r2(100 * circ / Math.max(1, net)), bedrooms: beds.length,
    noWindow: by('NO_WINDOW'), minWidth: by('MIN_WIDTH'), unreachable: by('UNREACHABLE_ROOM'), swingBlocked: by('SWING_BLOCKED'), bathPrivacy: by('BATH_PRIVACY'),
    reviewWarnings: rv.filter(i => i.severity === 'warning').length,
    ledger: led.map(x => ({ text: x.text, ok: x.ok, why: x.why })), ledgerFails: led.filter(x => !x.ok).length,
  };
}
/** اختلاف تنظيمي بين بديلين (0..1): إزاحة مراكز الفراغات المتناظرة بالاسم نسبة لقطر المبنى، بعد أفضل انعكاس أفقي. */
export function difference(a, b) {
  const A = docRooms(a), B = docRooms(b);
  const norm = (R, flip) => new Map(R.rooms.filter(r => r.area >= 6).map(r => { const w = R.B.x1 - R.B.x0, d = R.B.y1 - R.B.y0; let x = ((r.x0 + r.x1) / 2 - R.B.x0) / w; if (flip) x = 1 - x; return [r.name + '@' + r.li, { x, y: ((r.y0 + r.y1) / 2 - R.B.y0) / d }]; }));
  const one = flip => { const p = norm(A, false), q = norm(B, flip); let s = 0, n = 0; for (const [k, v] of p) { const u = q.get(k); if (!u) { s += .5; n++; continue; } s += Math.hypot(v.x - u.x, v.y - u.y) / Math.SQRT2; n++; } for (const k of q.keys()) if (!p.has(k)) { s += .5; n++; } return n ? s / n : 0; };
  return r2(Math.min(one(false), one(true)));
}

/** (الجولة الخامسة عشرة) يحفظ مقترحات خيارات التعديل (منطقة واحدة / توزيع جديد) مستندات أدلة: <prefix>-opt-zone.json و<prefix>-opt-full.json. */
function savePending(session, dir, prefix) {
  const pe = session.pendingEdit; if (!pe) return;
  for (const k of ['zone', 'full']) if (pe[k]?.doc) writeFileSync(dir + `${prefix}-opt-${k}.json`, pe[k].doc);
}
function listPending(dir, prefix) { return ['zone', 'full'].filter(k => existsSync(dir + `${prefix}-opt-${k}.json`)).map(k => `${prefix}-opt-${k}.json`); }
const summary = [];
for (const C of CASES) {
  if (only && !only.test(C.id)) continue;
  const dir = OUT + C.id + '/'; mkdirSync(dir, { recursive: true });
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = { floors: 1, ...C.land }, entry = land.entries[0];
  const row = { id: C.id, engine, name: C.name, text: C.text, understood: req.understood, unclear: req.unclear, unsupported: req.unsupported, designs: [], notes: [] };
  if (C.irregular && engine === 'v1') row.notes.push('المولّد يقبل أرضًا مستطيلة فقط (عرض × طول)؛ شكل الأرض في الطلب لا يُمثَّل. وُلّد على مستطيل محيط.');
  if (C.irregular && engine !== 'v1') row.notes.push('المولّد الثاني: الأرض مضلع فعلي (الواجهة 18 م، الخلف 24 م، العمق 30 م) والارتدادات داخل حدوده.');
  if (engine === 'v1') delete land.polygon;
  const t0 = performance.now();
  let out;
  try {
    const fn = (land.floors >= 2 || req.prefs?.floors === 2) ? generateVillaTwoFloors : generateVillaDesigns;
    out = fn({ land, counts: req.counts, requirements: req, keep: C.want || 4 });
  } catch (e) { row.error = e.message; row.errorCode = e.code || null; if (e.report_ar) row.report_ar = e.report_ar; if (e.feasibility) row.feasibility = e.feasibility; if (e.search) row.search = e.search; }
  if (out?.engine3) { row.feasibility = out.engine3.feasibility; row.search = out.engine3.search; }
  row.ms = Math.round(performance.now() - t0);
  if (out) {
    // المراجعة المستقلة (plan-review) المرفقة بكل بديل من المولّد الثاني: البوابات الراسبة والدرجة وأسباب الرفض
    const HEAVY = ['STRUCTURAL', 'CIRCULATION', 'CONSISTENCY_2D3D'];
    const rv = d => (d.review ? { passed: d.review.passed, failedGates: d.review.failedGates, score: d.review.score, rejectReasons_ar: d.review.rejectReasons_ar,
      gates: Object.fromEntries((d.review.gates || []).map(g => [g.id, { ok: g.ok, applicable: g.applicable }])), heavy: Object.fromEntries((d.review.gates || []).filter(g => HEAVY.includes(g.id)).map(g => [g.id, { ok: g.ok, value: g.value }])) } : null);
    out.designs.forEach((d, i) => { writeFileSync(dir + `alt-${i + 1}.json`, serialize(d.doc)); row.designs.push({ file: `alt-${i + 1}.json`, mode: d.mode, pat: d.pat || null, presentation: d.presentation || null, prefFails: d.prefFails || null, summary: d.summary, review: rv(d), ...metrics(d.doc, req, entry) }); });
    row.requestedAlternatives = C.want || 4; row.producedAlternatives = out.designs.length; row.hidden = out.hidden || []; row.presentation = out.presentation || null; row.proposalLabel_ar = out.presentation?.label_ar || null;
    row.diversity = out.designs.map((a, i) => out.designs.map((b, j) => (i === j ? 0 : difference(a.doc, b.doc))));
    row.modes = [...new Set(out.designs.map(d => d.mode))];
    const pairs = row.diversity.flatMap((r, i) => r.filter((_, j) => j > i));
    row.minDifference = pairs.length ? Math.min(...pairs) : null; row.meanDifference = pairs.length ? r2(pairs.reduce((a, b) => a + b, 0) / pairs.length) : null;
    if (out.rejected) row.rejectedCandidates = out.rejected.length;
    // الاختلاف المعماري (الحاكم في الاختيار منذ الجولة السادسة): المصفوفة وأدناه والأزواج الشكلية (< 0.18)
    const am = archMatrix(out.designs.map(d => d.doc));
    row.archDiversity = am.matrix; row.minArchDifference = am.min; row.cosmeticPairs = am.cosmeticPairs.map(p => [p.i + 1, p.j + 1]); row.archThresholds = ARCH_T;
    // (الجولة الحادية عشرة) المقياس الوظيفي v2 الحاكم: لكل زوج الحكم والأبعاد الجوهرية والشرح العربي (explainDifference)
    const sig2 = out.designs.map(d => archSignatureV2(d.doc)), pairs2 = [];
    for (let i = 0; i < sig2.length; i++) for (let j = i + 1; j < sig2.length; j++) { const dd = archDifferenceV2(sig2[i], sig2[j]), ex = explainDifference(dd); pairs2.push({ pair: [i + 1, j + 1], verdict: dd.verdict, verdict_ar: dd.verdict_ar, substantive: dd.substantive, dims: { zoning: dd.zoning, circulation: dd.circulation, privacy: dd.privacy, relations: dd.relations }, total: dd.total, explanation_ar: ex.text }); }
    row.archV2 = { thresholds: SUBSTANTIVE_V2, pairs: pairs2, allDistinct: pairs2.every(p => p.verdict === 'distinct'), minSubstantive: pairs2.length ? Math.min(...pairs2.map(p => p.substantive.length)) : null, minTotal: pairs2.length ? Math.min(...pairs2.map(p => p.total)) : null };
    row.heavyRejected = (out.rejected || []).filter(r => r.by === 'heavy-gates');
    // سبب النقص عن العدد المطلوب (نص عربي من المولّد نفسه: ما بُني وما رُفض ولماذا)
    if (out.designs.length < (C.want || 4)) row.shortfallReason = out.shortfall_ar || 'لم يذكر المولّد سببًا.';
  }
  if (C.edit && out) {
    try {
      const first = await generateInitialDesign({ land, counts: req.counts, requirements: req, engine });
      const s0 = createSession({ land, counts: req.counts, requirements: req, result: first, engine });
      writeFileSync(dir + 'edit-before.json', serialize(first.doc));
      const t1 = performance.now();
      let { session, reply } = await redesign(s0, { text: C.edit });
      // (الجولة الرابعة عشرة) لا حل موضعي: تُعرض الخيارات (إبقاء / منطقة واحدة / بديل معروض يحققه / توزيع كامل جديد) — يُسجَّل
      // السؤال والخيارات، ثم يختار «العميل» المنطقة الواحدة إن عُرضت، وإلا يُبقي المخطط (لا استبدال صامت)
      let consentAsked = null, options = null, choice = null;
      let partial = null;
      if (reply.mode === 'ask-options') { consentAsked = reply.questions?.[0] || true; options = reply.options; partial = reply.partial || null; savePending(session, dir, 'edit'); choice = String((options.find(o => o.id === 'zone') || options[0]).n); ({ session, reply } = await redesign(session, { text: choice })); }
      else if (reply.mode === 'ask-regenerate' || (reply.conflicts || []).some(c => c.type === 'needs-consent')) { consentAsked = reply.questions?.[0] || true; ({ session, reply } = await redesign(session, { text: 'نعم' })); }
      const after = JSON.parse((session.designs[1] || session.designs[0]).doc);
      writeFileSync(dir + 'edit-after.json', (session.designs[1] || session.designs[0]).doc);
      const bRooms = docRooms(first.doc).rooms.map(r => r.name).sort(), aRooms = docRooms(after).rooms.map(r => r.name).sort();
      // غرف البرنامج (نوم، مجالس، صالة، طعام، مطبخ، خدمة، دورات مياه بالعدد) مقابل كل الأسماء (ومنها أجزاء الأجنحة كمدخل الجناح)
      const PROG = ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'service'];
      const prog = d => docRooms(d).rooms.filter(r => PROG.includes(r.type)).map(r => r.name).sort(), nb = d => docRooms(d).rooms.filter(r => r.type === 'bath').length;
      const bP = prog(first.doc), aP = prog(after);
      const aD = session.designs[1] || session.designs[0];
      row.edit = { text: C.edit, ms: Math.round(performance.now() - t1), consentAsked, options, choice, partial, reply, beforePattern: session.designs[0].pat, afterPattern: aD.pat, samePattern: aD.pat === session.designs[0].pat, kept: !session.designs[1], shownMatch: matchShown(after, out.designs.map((x, j) => ({ index: j, doc: x.doc }))), zoneDiff: zoneDiff(first.doc, after), difference: difference(first.doc, after), roomsKept: bRooms.every(n => aRooms.includes(n)), roomsLost: bRooms.filter(n => !aRooms.includes(n)), programRoomsKept: bP.every(n => aP.includes(n)) && nb(after) >= nb(first.doc), programRoomsLost: bP.filter(n => !aP.includes(n)), editLedgerBefore: verifyRequest(first.doc, session.input.requirements, { entry }).map(x => ({ text: x.text, status: x.status, why: x.why })), after: metrics(after, session.input.requirements, entry) };
    } catch (e) { row.edit = { text: C.edit, error: e.message, code: e.code || null }; }
    // التعديل نفسه على كل بديل معروض (لا الأول فقط): هل بقي النمط؟ وكم تغيّر المخطط؟ وهل بقيت الغرف؟
    row.editAll = [];
    for (let i = 0; i < out.designs.length && engine !== 'v1'; i++) {
      try {
        const d = out.designs[i], shownAlts = out.designs.map((x, j) => ({ index: j, doc: x.doc, pat: x.pat, summary: x.summary, notes: x.notes, mirror: x.mirror, review: x.review || null }));
        const s0 = createSession({ land, counts: req.counts, requirements: req, result: { doc: d.doc, pat: d.pat, mirror: d.mirror, summary: d.summary, notes: d.notes, villaEngine: 'v2', alternatives: shownAlts }, engine });
        let { session, reply } = await redesign(s0, { text: C.edit }), asked = null, options = null, choice = null, partial = null;
        const first = reply;
        if (reply.mode === 'ask-options') { asked = reply.questions?.[0] || true; options = reply.options; partial = reply.partial || null; savePending(session, dir, `edit-alt${i + 1}`); choice = String((options.find(o => o.id === 'zone') || options[0]).n); ({ session, reply } = await redesign(session, { text: choice })); }
        else if (reply.mode === 'ask-regenerate' || (reply.conflicts || []).some(c => c.type === 'needs-consent')) { asked = reply.questions?.[0] || true; ({ session, reply } = await redesign(session, { text: 'نعم' })); }
        // (الجولة الخامسة عشرة) المخطط المُبقى يُكتب أيضًا (edit-altN-after = المعروض حرفيًا) لتُرسم صورة فرقه بالسبب والخيارات المرقّمة
        if (!session.designs[1]) { writeFileSync(dir + `edit-alt${i + 1}-after.json`, serialize(d.doc)); row.editAll.push({ alt: i + 1, notDone: true, kept: true, consentAsked: asked, options, choice, partial, question_ar: asked === true ? null : asked, reply_ar: reply.summary_ar || null, failed: first.failed, unchanged: true, zoneDiff: zoneDiff(d.doc, d.doc), proposals: listPending(dir, `edit-alt${i + 1}`) }); continue; }
        const after = JSON.parse(session.designs[1].doc);
        writeFileSync(dir + `edit-alt${i + 1}-after.json`, session.designs[1].doc);
        // غرف البرنامج (نوم، مجالس، صالة، طعام، مطبخ، خدمة) بالاسم، ودورات المياه بالعدد — لا أجزاء الأجنحة (مدخل جناح/خزانة)
        const PROG2 = ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'service'];
        const names = x => docRooms(x).rooms.filter(r => PROG2.includes(r.type)).map(r => r.name).sort(), nB = x => docRooms(x).rooms.filter(r => r.type === 'bath').length;
        const bN = names(d.doc), aN = names(after), bathsKept = nB(after) >= nB(d.doc);
        row.editAll.push({ alt: i + 1, consentAsked: asked, options, choice, mode: reply.mode || null, shownMatch: matchShown(after, shownAlts.filter(x => x.index !== i)), zoneDiff: zoneDiff(d.doc, after), beforePattern: d.pat, afterPattern: session.designs[1].pat, samePattern: session.designs[1].pat === d.pat, unchanged: !!reply.unchanged, difference: difference(d.doc, after), programRoomsKept: bN.every(n => aN.includes(n)) && bathsKept, done: reply.done, failed: reply.failed, already: (reply.already || []).map(x => x.text), reply_ar: reply.summary_ar || null, question_ar: typeof asked === 'string' ? asked : null, partial, patternChanged: reply.patternChanged || null, note: session.designs[1].notes.slice(-1)[0] || '' });
      } catch (e) { row.editAll.push({ alt: i + 1, error: e.message }); }
    }
  }
  writeFileSync(dir + 'result.json', JSON.stringify(row, null, 1));
  summary.push(row);
  const best = row.designs[0];
  console.log(`${C.id} ${C.name}: ${row.error ? 'خطأ: ' + row.error : `${row.producedAlternatives}/${row.requestedAlternatives} بدائل، أنماط ${row.modes.join('/')}, اختلاف معماري أدنى ${row.minArchDifference}، مراكز ${Math.min(...row.diversity.flatMap((r, i) => r.filter((_, j) => j > i)))}، أفضل: إخفاق ${best.ledgerFails}، بلا نافذة ${best.noWindow}، حركة ${best.circulationPct}%`} ${row.ms}ms${row.edit ? ' | تعديل: ' + (row.edit.error ? 'خطأ ' + row.edit.error.slice(0, 80) : `نفس النمط ${row.edit.samePattern}، غرف محفوظة ${row.edit.roomsKept}، فرق ${row.edit.difference}`) : ''}`);
}
writeFileSync(OUT + 'summary.json', JSON.stringify(summary, null, 1));
