// (الجولة العشرون) مجموعة عيوب قياسات r20 (dist/r20-checks.mjs): كشف بلا إنذار كاذب.
//  (أ) الحقيقية: ما أثبته المراجع الأعمى r19 على مستندات after-19 وafter-19-heldout (المرجع: docs/research/system-vs-reviewer-r15-r19.md).
//  (ب) المصنوعة: تحوير مستند سليم بالقياس نفسه تحويرًا يُحدث العيب وحده (حذف الأبواب الداخلية لمجموعة المجلس، رفع جلسة كل نوافذ الصالة،
//      حذف أبواب دورة مياه العائلة) — يجب أن يُكشف.
//  (ج) الإنذار: كل مستند حكم عليه المراجع «يُعرض» بلا ملاحظة من النوع نفسه، ويرسب فيه القياس — يُعدّ إنذارًا (لا يُخفى).
// الاستعمال: node scripts/r20-defect-corpus.mjs → evidence/review-proof/r20-corpus.json
// المراجع المستقل وكيل ذكاء اصطناعي (Claude) بدور معماري — ليس معماريًا مرخّصًا.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { measureR20 } from '../dist/r20-checks.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const load = (stage, id, f) => parseDoc(readFileSync(`${ROOT}evidence/acceptance/${stage}/${id}/${f}`, 'utf8'));
const fails = doc => measureR20(doc, { text: '' }).filter(g => g.applicable && !g.pass).map(g => g.id);
const verdicts = JSON.parse(readFileSync(`${ROOT}docs/research/verdicts-r19.json`, 'utf8'));
const vOf = alt => verdicts.find(v => v && `${v.case}-${v.alt}` === alt);
// (أ) ما أثبته المراجع r19 بالنوع (من وثيقة الاختلافات، القسم 2)
const REAL = { COURT_OVERLOOK: ['C9-4'], HALL_LT_MAJLIS: ['C4-1', 'C6-1'], HALL_DAYLIGHT: ['C5-3'], MAJLIS_ISOLATED: ['H1-1', 'H5-1'], FAMILY_WC: ['C9-3'] };
const docs = [];
for (const [stage, re] of [['after-19', /^C\d+$/], ['after-19-heldout', /^H\d+$/]]) {
  if (!existsSync(`${ROOT}evidence/acceptance/${stage}`)) continue;
  for (const id of readdirSync(`${ROOT}evidence/acceptance/${stage}`).filter(x => re.test(x))) for (const f of readdirSync(`${ROOT}evidence/acceptance/${stage}/${id}`).filter(x => /^alt-\d+\.json$/.test(x))) docs.push({ alt: `${id}-${f.match(/\d+/)[0]}`, stage, id, f, doc: load(stage, id, f) });
}
const real = Object.entries(REAL).map(([id, alts]) => ({ id, alts, detected: alts.filter(a => { const d = docs.find(x => x.alt === a); return d && fails(d.doc).includes(id); }) }));
// (ب) المصنوعة
const mut = { MAJLIS_ISOLATED: { n: 0, hit: 0 }, HALL_DAYLIGHT: { n: 0, hit: 0 }, FAMILY_WC: { n: 0, hit: 0 } };
const isMen = r => r.type === 'majlis' && !/النساء/.test(r.name || ''), guestish = r => isMen(r) || /الرجال|الضيوف/.test(r.name || '');
for (const { doc } of docs) {
  const f0 = fails(doc), m = analyzeDoc(doc), G = m.levels.find(l => l.rooms.some(isMen)) || m.levels[0]; if (!G) continue;
  const opsOf = pred => G.openings.filter(pred).map(op => op.o?.id).filter(Boolean);
  if (!f0.includes('MAJLIS_ISOLATED') && G.rooms.some(isMen)) { // أبواب مجموعة المجلس إلى أي فراغ داخلي غيرها
    const ids = new Set(opsOf(op => op.door && op.sides.length === 2 && op.sides.some(s => guestish(s.room)) && op.sides.some(s => s.other !== 'outside' && !guestish(s.room) && !(s.room.type === 'bath' && /الرجال|الضيوف/.test(s.room.name)))));
    if (ids.size) { const d = parseDoc(serialize(doc)); d.openings = d.openings.filter(o => !ids.has(o.id)); mut.MAJLIS_ISOLATED.n++; if (fails(d).includes('MAJLIS_ISOLATED')) mut.MAJLIS_ISOLATED.hit++; }
  }
  const hall = G.rooms.filter(r => r.type === 'living' && !/الضيوف|الطعام|مغاسل|العلوية/.test(r.name || '')).sort((a, b) => b.area - a.area)[0];
  if (hall && !f0.includes('HALL_DAYLIGHT')) { const ids = new Set(opsOf(op => op.window && op.sides.some(s => s.room.id === hall.id)));
    if (ids.size) { const d = parseDoc(serialize(doc)); for (const o of d.openings) if (ids.has(o.id)) { o.sill = 1.6; o.h = Math.min(o.h || .9, .9); } mut.HALL_DAYLIGHT.n++; if (fails(d).includes('HALL_DAYLIGHT')) mut.HALL_DAYLIGHT.hit++; } }
  if (!f0.includes('FAMILY_WC')) { const wcs = G.rooms.filter(r => r.type === 'bath' && !/الرجال|الضيوف|الخادمة|الرئيسية|غرفة/.test(r.name || ''));
    const ids = new Set(opsOf(op => op.door && op.sides.some(s => wcs.some(w => w.id === s.room.id))));
    if (ids.size) { const d = parseDoc(serialize(doc)); d.openings = d.openings.filter(o => !ids.has(o.id)); mut.FAMILY_WC.n++; if (fails(d).includes('FAMILY_WC')) mut.FAMILY_WC.hit++; } }
}
// (ج) الإنذار: المراجع «يُعرض» ولم يذكر النوع
const KW = { COURT_OVERLOOK: /حوش|فناء/, HALL_LT_MAJLIS: /الصالة.{0,30}(?:أصغر|صغيرة)|أصغر من المجلس/, HALL_DAYLIGHT: /علوية|إطلالة|ضوء/, MAJLIS_ISOLATED: /باب داخلي|معزول|من الخارج/, FAMILY_WC: /دورة مياه|حمام/ };
const alarms = Object.fromEntries(Object.keys(REAL).map(k => [k, []])), clean = { n: 0 };
for (const x of docs) { const v = vOf(x.alt); if (!v || v.verdict !== 'show') continue; clean.n++;
  const text = (v.findings || []).map(f => f.text_ar || f).join(' ') + ' ' + JSON.stringify(v.mandatory || []);
  for (const id of fails(x.doc)) if (KW[id] && !KW[id].test(text)) alarms[id].push(x.alt); }
const out = { note_ar: 'قياسات r20 على أدلة after-19 (المعروفة والمحجوزة الأولى). المراجع وكيل ذكاء اصطناعي لا معماري مرخّص. الإنذار = رسوب القياس على بديل حكم عليه المراجع «يُعرض» دون ملاحظة من النوع نفسه.',
  real: real.map(r => ({ id: r.id, positives: r.alts.length, detected: r.detected.length, alts: r.alts })),
  synthetic: Object.fromEntries(Object.entries(mut).map(([k, v]) => [k, `${v.hit}/${v.n}`])),
  alarms: Object.fromEntries(Object.entries(alarms).map(([k, v]) => [k, { count: v.length, of: clean.n, alts: v }])) };
writeFileSync(`${ROOT}evidence/review-proof/r20-corpus.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
