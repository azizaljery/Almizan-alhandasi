// (الجولة التاسعة عشرة — توجيه المالك، سادسًا) سجل Mizan Score لكل بديل: البنود الإلزامية التي اجتازها أو خالفها (طلب العميل الصريح،
// وبوابات المراجعة، والمخالفات الإلزامية في الميزان MANDATORY_R16)، والعيوب المعمارية المقيسة، وما يحتاج مراجعة متخصصة، وحكم النظام،
// وحكم المراجع المستقل (إن وُجد لهذه المستندات)، وسبب الخلاف، والقاعدة أو الاختبار الذي أُضيف لمنع تكراره.
// كل القياسات بالشيفرة الحالية على مستندات المرحلة نفسها. لا وزن يُغيَّر هنا؛ السجل يقرأ فقط.
// المراجع المستقل وكيل ذكاء اصطناعي (Claude) بدور معماري — ليس معماريًا مرخّصًا؛ ولا يُعدّ أي حكم آلي اعتمادًا هندسيًا أو إنشائيًا.
// الاستعمال: node scripts/mizan-ledger.mjs --stage after-19 [--verdicts docs/research/verdicts-r18.json] [--cases heldout] --out <json>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDoc } from '../dist/draw/doc.mjs';
import { extractRequirements, applyLiteralReadings } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { measureR16, MANDATORY_R16 } from '../dist/privacy-defects.mjs';
import { CASES as MAIN } from './acceptance-cases.mjs';
import { HELDOUT } from './heldout-cases.mjs';

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const STAGE = opt('--stage', 'after-19'), VERD = opt('--verdicts', null), OUT = opt('--out', `evidence/acceptance/${STAGE}/mizan-ledger.json`);
const CASES = opt('--cases', '') === 'heldout' ? HELDOUT : MAIN;
const root = new URL('../', import.meta.url).pathname;
const V = VERD && existsSync(root + VERD) ? JSON.parse(readFileSync(root + VERD, 'utf8')) : null;

/** القاعدة/الاختبار الذي يمنع تكرار ملاحظة المراجع (بمفتاح من نص الملاحظة) — مصدر واحد للسجل والتقرير. */
export const PREVENTION = [
  { re: /الطعام|المقلط|مسار الضيف|مدخل العائلة وبهو/, rule: 'GUEST_DINING (مخالفة إلزامية منذ r19: MANDATORY_R16)', test: 'tests/stage2-r19.test.mjs: لا بديل معروض فيه مخالفة إلزامية في أي حالة' },
  { re: /المجالس.*بالجمع|مجلس واحد فقط/, rule: 'قراءة «المجالس» تُرسم فقط إن كانت سليمة، ويُذكر ما لم يُعرض (withPresentation)', test: 'tests/stage2-r19.test.mjs: C7' },
  { re: /موقف|المواقف|السيارة/, rule: 'PARKING_SHALLOW (إلزامية منذ r19) وrefineParking وclearDimsOffParking', test: 'tests/stage2-r19.test.mjs: لا خط أبعاد فوق موقف' },
  { re: /حمام|تراكب الحمامات|صرف|دورة مياه .*فوق/, rule: 'WET_STACK (عيب معماري + مراجعة متخصصة)', test: 'tests/stage2-r19.test.mjs: WET_STACK على C7' },
  { re: /باب الماستر|باب الرئيسية|الملاصقة للدرج|البعد عن الدرج/, rule: 'MASTER_STAIR_DOOR وmasterStairDoor', test: 'tests/stage2-r19.test.mjs: MASTER_STAIR_DOOR' },
  { re: /نافذة.*(?:عادية|الموقف|الشارع|البوابة)/, rule: 'r16-polish 1-ج: نافذة علوية لمجلس النساء والطعام بشرط زجاج ≥ 5٪', test: 'tests/stage2-r19.test.mjs: الخصوصية المتكاملة' },
  { re: /دهليز|مصدّ|يكشف المجلس/, rule: 'MAJLIS_LOBBY؛ والمدخل الثاني إلى دهليز الرجال (r19)', test: 'tests/stage2-r19.test.mjs: C3' },
  { re: /الصالة .*أصغر من المجلس|المجلس أكبر من الصالة/, rule: 'HALL_SMALL/HALL_THROUGH وrefineHall', test: 'tests/stage2-r17.test.mjs' },
  { re: /م² بدل|يجب إبلاغ العميل بالفرق|×4\.96|3\.86/, rule: 'DIM_TOL: كل ضلع ±0.05 م (r19)', test: 'tests/stage2-r19.test.mjs: المقاس الصريح' },
  { re: /بطاقة الخيار|فارغة/, rule: 'لا بطاقة خيار بلا مخطط (design-session r19)', test: 'tests/stage2-r19.test.mjs' },
  { re: /تسمية|«مدخل»|مدخل مدخل|تحجب رقم/, rule: 'render2d: كلمة «مدخل» في أقل المواضع تراكبًا', test: 'غير متحقق آليًا (صورة)' },
];
const prevent = t => PREVENTION.find(p => p.re.test(t)) || null;

const rows = [];
for (const C of CASES) {
  const f = root + `evidence/acceptance/${STAGE}/${C.id}/result.json`; if (!existsSync(f)) continue;
  const res = JSON.parse(readFileSync(f, 'utf8')); if (!res.designs) { rows.push({ alt: `${C.id}`, error: res.error || 'لا بدائل' }); continue; }
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = { floors: 1, ...C.land }; applyLiteralReadings(req, land);
  res.designs.forEach((d, i) => {
    const doc = parseDoc(readFileSync(root + `evidence/acceptance/${STAGE}/${C.id}/${d.file}`, 'utf8'));
    const ledger = verifyRequest(doc, req, { entry: land.entries[0] });
    const rq = { text: C.text, counts: { ...C.counts, ...req.counts }, land, rules: req.rules || [] };
    const st = presentationStatus({ doc, ledger, review: d.review }, rq);
    const r16 = measureR16(doc, rq).filter(g => g.applicable);
    const clientItems = ledger.filter(x => !['unverified', 'pending-render'].includes(x.status));
    const mandatory = {
      clientPassed: clientItems.filter(x => x.ok).map(x => x.text), clientViolated: clientItems.filter(x => !x.ok).map(x => `${x.text} — ${x.why || ''}`),
      gatesFailed: d.review?.passed === false ? d.review.failedGates || [] : [],
      mizanPassed: r16.filter(g => MANDATORY_R16.includes(g.id) && g.pass && !g.clientAsked).map(g => g.id),
      mizanViolated: r16.filter(g => MANDATORY_R16.includes(g.id) && !g.pass && !g.clientAsked).map(g => `${g.id}: ${g.reasons_ar.join('؛ ')}`),
      unverified: ledger.filter(x => ['unverified', 'pending-render'].includes(x.status)).map(x => x.text),
    };
    const v = V ? V.find(x => x.case === C.id && x.alt === i + 1) : null;
    const rev = v ? (v.verdict === 'show' ? 'ready' : v.verdict === 'do-not-show' ? 'hidden' : 'needs-edits') : null;
    const bin = s => (s === 'ready' ? 'ready' : 'not-ready');
    const revMand = v ? v.findings.filter(x => x.tier === 'mandatory').map(x => x.text_ar) : [];
    let why = null;
    if (v && bin(rev) !== bin(st.status)) why = st.status === 'ready' ? `النظام قال «جاهز» والمراجع: ${v.verdict}؛ ما لم يقسه النظام: ${v.findings.filter(x => x.tier !== 'aesthetic').map(x => x.text_ar).join(' | ')}` : `النظام أشد من المراجع: ${[...st.hidden_ar, ...st.edits_ar].join(' | ')}`;
    else if (v && rev === 'hidden' && st.status !== 'hidden') why = `المراجع: لا يُعرض (مخالفة إلزامية) والنظام: ${st.status}`;
    rows.push({ alt: `${C.id}-${i + 1}`, pat: d.pat, file: d.file, mandatory, mandatoryOk: !mandatory.clientViolated.length && !mandatory.gatesFailed.length && !mandatory.mizanViolated.length,
      architectural: st.edits_ar, notes: st.notes_ar, specialist: st.specialist_ar || [], system: st.status, system_ar: st.label_ar,
      reviewer: v ? { verdict: v.verdict, mandatory: revMand, findings: v.findings.map(x => `[${x.tier}] ${x.text_ar}`) } : 'غير متحقق (لا حكم مراجع مستقل على هذه المستندات بعد)',
      agree: v ? bin(rev) === bin(st.status) : null, agree3: v ? rev === st.status : null, disagreement_ar: why,
      prevention: v ? v.findings.filter(x => x.tier !== 'aesthetic').map(x => ({ finding: x.text_ar, ...(prevent(x.text_ar) || { rule: 'لا قاعدة بعد', test: '—' }) })) : [] });
  });
}
const R = rows.filter(r => !r.error), cnt = f => R.filter(f).length;
const summary = {
  note_ar: 'سجل Mizan Score — مقيس بالشيفرة الحالية على مستندات المرحلة. المراجع المستقل وكيل ذكاء اصطناعي، لا معماري مرخّص؛ ولا يُعدّ أي تقييم آلي هنا اعتمادًا هندسيًا أو إنشائيًا (اعتماد معماري سعودي مرخّص شرط قبل طلب النشر).',
  stage: STAGE, verdicts: VERD || null, alternatives: R.length, errors: rows.filter(r => r.error).map(r => `${r.alt}: ${r.error}`),
  status: { ready: cnt(r => r.system === 'ready'), needsEdits: cnt(r => r.system === 'needs-edits'), hidden: cnt(r => r.system === 'hidden') },
  shownWithMandatoryViolation: R.filter(r => !r.mandatoryOk && r.system !== 'hidden').map(r => r.alt),
  agreement: V ? `${cnt(r => r.agree)}/${R.length}` : 'غير متحقق', agreement3: V ? `${cnt(r => r.agree3)}/${R.length}` : 'غير متحقق',
  readyPrecision: V ? `${cnt(r => r.system === 'ready' && r.reviewer.verdict === 'show')}/${cnt(r => r.system === 'ready')}` : 'غير متحقق',
};
const outP = OUT.startsWith('/') ? OUT : root + OUT;
mkdirSync(dirname(outP), { recursive: true });
writeFileSync(outP, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
