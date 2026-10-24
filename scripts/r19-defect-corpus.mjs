// (الجولة التاسعة عشرة) مجموعة عيوب لقياسي الدور العلوي والمخالفة الإلزامية — كشف وعدم إنذار كاذب:
//  (1) إيجابيات حقيقية من حكم المراجع المستقل r18 (docs/research/verdicts-r18.json): C7-1 (حمامات علوية فوق الطعام والمدخل، وباب الماستر
//      على الصالة الملاصقة للدرج) وC7-2 (مسار الضيف عبر مدخل العائلة: مخالفة إلزامية) — مستندات after-18.
//  (2) إيجابيات مصنوعة على مستندات المرحلة: (أ) باب يفصل الصالة العلوية عن الدرج يعود قوسًا ⇐ MASTER_STAIR_DOOR؛ (ب) باب المقلط يُلغى في
//      بديل دور واحد ⇐ GUEST_DINING محجوب (مخالفة إلزامية).
//  (3) سلبيات: كل بديل دور واحد في المرحلة (القياسان العلويان لا ينطبقان، فلا إنذار)، وكل بديل معروض في المرحلة (لا مخالفة إلزامية).
// المراجع المستقل وكيل ذكاء اصطناعي (Claude) — ليس معماريًا مرخّصًا.
// الاستعمال: node scripts/r19-defect-corpus.mjs [stage=after-19] → evidence/review-proof/r19-corpus.json
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { measureR16, MANDATORY_R16 } from '../dist/privacy-defects.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { extractRequirements, applyLiteralReadings } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { CASES } from './acceptance-cases.mjs';

const stage = process.argv[2] || 'after-19', ROOT = new URL('../', import.meta.url).pathname;
const load = (st, id, f) => parseDoc(readFileSync(ROOT + `evidence/acceptance/${st}/${id}/${f}`, 'utf8'));
const ctx = id => { const C = CASES.find(c => c.id === id), req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts }; const land = { floors: 1, ...C.land }; applyLiteralReadings(req, land); return { C, req, land, rq: { text: C.text, counts: { ...C.counts, ...req.counts }, land, rules: req.rules || [] } }; };
const fails = (doc, id) => measureR16(doc, ctx(id).rq).filter(g => g.applicable && !g.pass && !g.clientAsked).map(g => g.id);
const status = (doc, id) => { const { req, land, rq } = ctx(id); return presentationStatus({ doc, ledger: verifyRequest(doc, req, { entry: land.entries[0] }) }, rq).status; };
const rows = [];
// (1)
for (const [alt, want, wantStatus] of [['C7-1', ['WET_STACK', 'MASTER_STAIR_DOOR'], null], ['C7-2', ['GUEST_DINING'], 'hidden']]) {
  const [id, i] = alt.split('-'), doc = load('after-18', id, `alt-${i}.json`), got = fails(doc, id), st = status(doc, id);
  rows.push({ kind: 'real-r18', alt, expected: want, detected: want.every(w => got.includes(w)) && (!wantStatus || st === wantStatus), got, status: st });
}
// (2) و(3)
for (const C of CASES) {
  const f = ROOT + `evidence/acceptance/${stage}/${C.id}/result.json`; if (!existsSync(f)) continue;
  const res = JSON.parse(readFileSync(f, 'utf8'));
  (res.designs || []).forEach((d, i) => {
    const doc = load(stage, C.id, d.file), got = fails(doc, C.id), two = doc.levels.length > 1;
    if (!two) rows.push({ kind: 'negative-upper', alt: `${C.id}-${i + 1}`, detected: got.some(x => ['WET_STACK', 'MASTER_STAIR_DOOR'].includes(x)), got });
    if (d.presentation?.status !== 'hidden') rows.push({ kind: 'negative-mandatory', alt: `${C.id}-${i + 1}`, detected: got.some(x => MANDATORY_R16.includes(x)), got });
    // (أ) الباب الفاصل بين الصالة العلوية والدرج يعود قوسًا
    // (أ) الباب الذي سجّل المولّد أنه يفصل الصالة العلوية عن الدرج (ملاحظة البديل في polish-notes.json) يعود قوسًا ⇐ يجب أن يُكشف
    if (two) { const PN = existsSync(ROOT + `evidence/acceptance/${stage}/polish-notes.json`) ? JSON.parse(readFileSync(ROOT + `evidence/acceptance/${stage}/polish-notes.json`, 'utf8')) : {};
      const sep = (PN[C.id] || []).find(x => x.alt === i + 1)?.notes_ar?.find(n => /الصالة العلوية تُغلق على الدرج/.test(n));
      if (sep) { const nm = [...sep.matchAll(/«([^»]+)»/g)].map(m => m[1]).slice(0, 2), U = analyzeDoc(doc).levels[1];
        const op = U.openings.find(o => !o.window && o.sides.length === 2 && /^door/.test(o.o.kind || '') && nm.every(n => o.sides.some(s => s.room.name === n)));
        if (op) { const doc2 = JSON.parse(JSON.stringify(doc)); Object.assign(doc2.openings.find(o => o.id === op.id), { kind: 'arch' }); const g2 = fails(doc2, C.id); rows.push({ kind: 'fabricated-stairdoor', alt: `${C.id}-${i + 1}`, opening: nm.join(' / '), expected: ['MASTER_STAIR_DOOR'], detected: g2.includes('MASTER_STAIR_DOOR'), got: g2 }); } } }
    // (ب) باب المقلط بين المجلس (أو دهليز الرجال) والطعام يُلغى (جدار مصمت) في بديل معروض لدور واحد
    if (!two && d.presentation?.status !== 'hidden') { const G = analyzeDoc(doc).levels[0], isM = r => (r.type === 'majlis' && !/النساء/.test(r.name)) || /الرجال/.test(r.name || '');
      const ops = G.openings.filter(o => o.door && o.sides.length === 2 && o.sides.some(s => s.room.type === 'dining') && o.sides.some(s => isM(s.room)));
      if (ops.length) { const doc2 = JSON.parse(JSON.stringify(doc)); doc2.openings = doc2.openings.filter(o => !ops.some(p => p.id === o.id)); const g2 = fails(doc2, C.id); rows.push({ kind: 'fabricated-guest', alt: `${C.id}-${i + 1}`, expected: ['GUEST_DINING'], detected: g2.includes('GUEST_DINING') && status(doc2, C.id) === 'hidden', got: g2 }); } }
  });
}
const by = k => rows.filter(r => r.kind === k), s = k => `${by(k).filter(r => r.detected).length}/${by(k).length}`;
const summary = { stage, realR18: s('real-r18'), fabricatedStairDoor: s('fabricated-stairdoor'), fabricatedGuest: s('fabricated-guest'), falseAlarmsUpper: s('negative-upper'), falseAlarmsMandatory: s('negative-mandatory'),
  note_ar: 'الإيجابية تُعدّ كشفًا إن ظهر العيب المتوقع (والحالة «محجوب» للمخالفة الإلزامية)؛ السلبية تُعدّ إنذارًا كاذبًا إن ظهر فيها العيب. المراجع المستقل وكيل ذكاء اصطناعي، ليس معماريًا مرخّصًا.' };
mkdirSync(ROOT + 'evidence/review-proof', { recursive: true });
writeFileSync(ROOT + 'evidence/review-proof/r19-corpus.json', JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
