// درجة مطابقة مفسَّرة لكل بديل (0–100): تركيب من ثمانية مؤشرات يقيسها الكود من المخطط المرسوم نفسه لا من نية المولّد،
// وكل مؤشر يعيد قيمته المقيسة وجملة «لماذا؟» تُبنى من أرقامه (لا نصوص ثابتة). الأوزان افتراض تصميمي من الميزان قابل للضبط،
// وليست اشتراطًا نظاميًا ولا معيارًا خارجيًا؛ والدرجة للمقارنة بين بدائل الجلسة نفسها لا حكم مطلق على جودة العمارة.
// نقي: لا DOM ولا شبكة. يعتمد على digestDoc (تفسير المخطط) وanalyzeSun (التوجيه) وسجل الطلب (verifyRequest) المحسوب مسبقًا.
import { digestDoc } from './draw/digest.mjs';
import { analyzeSun } from './sun-analysis.mjs';

/** أوزان المؤشرات (المجموع 100). */
export const SCORE_WEIGHTS = Object.freeze({ req: 22, eff: 12, sun: 12, privacy: 15, light: 9, kitchen: 10, pipes: 8, shape: 12 });
export const SCORE_LABELS = Object.freeze({
  req: 'مطابقة ما طلبته', eff: 'كفاءة المساحة', sun: 'التوجيه والشمس', privacy: 'خصوصية المجلس', light: 'الإنارة والتهوية', kitchen: 'قرب المطبخ من الطعام والخدمة', pipes: 'اقتصاد التمديدات', shape: 'تناسب الفراغات وطول الحركة',
});
/** حدود قياس المؤشرات (افتراضات تصميمية). */
export const SCORE_LIMITS = Object.freeze({ circGood: .22, circBad: .42, winRatio: .10, stackDist: 2.5, hallAbs: 34, hallShare: .2, hallStrip: 2.2, walk: 14, roomRatio: 1.5, majlisRatio: 1.8 });

const r0 = v => Math.round(v), clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const pct = v => Math.round(v * 100);
const HABIT = new Set(['bedroom', 'master', 'majlis', 'kitchen', 'office', 'service']);
const WET = new Set(['bath', 'kitchen', 'laundry']);
const num = v => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 1 }).format(v);

function roomsOf(dg) { return dg.levels.flatMap((lv, li) => lv.rooms.filter(r => !r.unlabelled).map(r => ({ ...r, li, lname: lv.name }))); }
const isCirc = r => r.type === 'corridor' || r.type === 'entrance' || r.type === 'stairs' || (r.type === 'living' && /^(الصالة|الردهة|صالة الحركة|الصالة العلوية)$/.test(r.name));

// ------------------------------------------------------------------------------------------ المؤشرات
function eff(rooms) {
  const net = rooms.reduce((s, r) => s + r.area, 0), circ = rooms.filter(isCirc).reduce((s, r) => s + r.area, 0), share = net ? circ / net : 0;
  const L = SCORE_LIMITS, score = clamp(100 * (L.circBad - share) / (L.circBad - L.circGood));
  return { score, value: share, good: `الصالات والممرات ${pct(share)}٪ فقط من المساحة الصافية (${num(circ)} م² من ${num(net)} م²)`, bad: `الصالات والممرات تأخذ ${pct(share)}٪ من المساحة الصافية (${num(circ)} م²) والمستهدف دون ${pct(L.circGood)}٪` };
}
function kitchen(rooms) {
  const ks = rooms.filter(r => r.type === 'kitchen'); if (!ks.length) return null;
  const byId = new Map(rooms.map(r => [r.id, r])), k = ks[0], din = rooms.filter(r => r.type === 'dining' && r.li === k.li);
  const doorTo = (a, b) => a.doors.some(d => d.connects === b.id);
  let score, good, bad;
  if (!din.length) { const hall = rooms.some(r => r.li === k.li && r.type === 'living' && doorTo(k, r)); score = hall ? 85 : 55; good = 'المطبخ يفتح على الصالة مباشرة (لا صالة طعام منفصلة في البرنامج)'; bad = 'المطبخ لا يفتح على الصالة مباشرة'; }
  else {
    const d0 = din[0], touch = (k.neighbours || []).includes(d0.id), door = doorTo(k, d0) || doorTo(d0, k);
    const dist = Math.hypot(k.centroid.x - d0.centroid.x, k.centroid.y - d0.centroid.y);
    score = door ? 100 : touch ? 72 : clamp(60 - (dist - 4) * 6, 15, 60);
    good = `المطبخ ملاصق ${door ? 'لصالة الطعام بباب مباشر' : 'لصالة الطعام'}`; bad = touch ? 'المطبخ يلاصق صالة الطعام بلا باب مباشر بينهما' : `المطبخ بعيد عن صالة الطعام (${num(dist)} م بين مركزيهما)`;
  }
  // باب خدمة خارجي أو غرفة غسيل/مخزن مجاورة تُحسب لصالح الخدمة
  const svc = k.doors.some(d => d.connects === 'outside') || (k.neighbours || []).some(id => ['laundry', 'storage'].includes(byId.get(id)?.type));
  if (svc) { score = Math.min(100, score + 8); good += '، وله باب خدمة أو ملحق خدمة'; }
  return { score: clamp(score), good, bad };
}
function privacy(rooms) {
  const ms = rooms.filter(r => r.type === 'majlis'); if (!ms.length) return null;
  const byId = new Map(rooms.map(r => [r.id, r])), per = [];
  for (const m of ms) {
    // مدخل مستقل: باب مدخل خارجي على المجلس نفسه أو على «ممره» الملاصق الذي يفتح عليه
    const entryOn = r => r.doors.some(d => d.entry && d.connects === 'outside' || (d.connects === 'outside' && r.type !== 'majlis'));
    const lobby = (m.doors.map(d => byId.get(d.connects)).find(x => x && x.type === 'corridor' && entryOn(x)));
    const own = m.doors.some(d => d.connects === 'outside') || !!lobby;
    const beds = (m.neighbours || []).map(id => byId.get(id)).filter(x => x && (x.type === 'bedroom' || x.type === 'master') && x.li === m.li);
    const toFamily = m.doors.some(d => { const o = byId.get(d.connects); return o && (o.type === 'living' || o.type === 'entrance') && !/مدخل الرجال|ممر/.test(o.name); });
    const wcOk = (m.neighbours || []).some(id => byId.get(id)?.type === 'bath');
    const s = 40 * own + 30 * (beds.length ? 0 : 1) + 15 * (toFamily ? 0 : 1) + 15 * wcOk;
    per.push({ m, own, beds, toFamily, wcOk, s });
  }
  // غرفة نوم يفتح بابها على مدخل العائلة مباشرة: يُرى بابها من الباب الرئيسي (10 نقاط لكل غرفة)
  const onEntry = rooms.filter(r => (r.type === 'bedroom' || r.type === 'master') && r.doors.some(d => byId.get(d.connects)?.type === 'entrance'));
  const score = Math.max(0, per.reduce((a, p) => a + p.s, 0) / per.length - 10 * onEntry.length), w = per.reduce((a, p) => (p.s < a.s ? p : a), per[0]);
  const ownN = per.filter(p => p.own).length, bedN = per.filter(p => p.beds.length).length;
  return { score, good: `${ownN === per.length ? 'كل مجلس بمدخل خارجي مستقل' : `${ownN} من ${per.length} مجالس بمدخل خارجي مستقل`}${bedN ? '' : '، ولا يجاور أي مجلس غرفة نوم'}`, bad: `«${w.m.name}» ${w.own ? '' : 'بلا مدخل خارجي مستقل'}${!w.own && w.beds.length ? '، و' : ''}${w.beds.length ? `يجاور ${w.beds[0].name}` : ''}${w.toFamily && w.own ? 'يفتح على ردهة العائلة' : ''}${onEntry.length ? `${w.own && !w.beds.length && !w.toFamily ? '' : '؛ '}باب «${onEntry[0].name}» يفتح على مدخل العائلة مباشرة` : ''}`.trim() };
}
function light(rooms) {
  const hs = rooms.filter(r => HABIT.has(r.type) || (r.type === 'dining' && r.area >= 9)); if (!hs.length) return null;
  const L = SCORE_LIMITS; let sum = 0; const none = [], low = [];
  for (const r of hs) {
    const c = r.windows.count, ratio = r.windows.ratioToFloor, sides = r.windows.sides.length;
    let s = !c ? 0 : ratio >= L.winRatio ? 85 : 55 + 30 * (ratio / L.winRatio);
    if (c && sides >= 2) s += 15; // نافذتان على جهتين: تهوية متقاطعة
    sum += Math.min(100, s); if (!c) none.push(r); else if (ratio < L.winRatio) low.push(r);
  }
  const ok = hs.length - none.length - low.length, two = hs.filter(r => r.windows.sides.length >= 2).length;
  return { score: sum / hs.length, good: `${ok} من ${hs.length} فراغات معيشية لها نوافذ تبلغ ${pct(L.winRatio)}٪ فأكثر من مساحتها${two ? `، و${two} منها بنوافذ على جهتين للتهوية المتقاطعة` : ''}`, bad: none.length ? `${none.slice(0, 2).map(r => '«' + r.name + '»').join(' و')} بلا نافذة خارجية` : `${low.slice(0, 2).map(r => `«${r.name}» نوافذها ${pct(r.windows.ratioToFloor)}٪ من مساحتها`).join(' و')} (الأدنى المستهدف ${pct(L.winRatio)}٪)` };
}
function pipes(rooms) {
  const wet = rooms.filter(r => WET.has(r.type) || r.type === 'bath'); if (wet.length < 2) return null;
  const byId = new Map(rooms.map(r => [r.id, r])), L = SCORE_LIMITS;
  // التجاور: كل غرفة مبللة يجاورها مبللة أخرى بجدار على الدور نفسه (بما فيها حمام الرئيسية والخزانة بينهما)
  const adj = wet.filter(r => (r.neighbours || []).some(id => { const o = byId.get(id); return o && o !== r && WET.has(o.type) && o.li === r.li; })).length;
  // التراص الرأسي: كل غرفة مبللة في دور علوي يقع مركزها قرب غرفة مبللة في الأرضي
  const up = wet.filter(r => r.li > 0), gr = wet.filter(r => r.li === 0);
  const stacked = up.filter(u => gr.some(g => Math.hypot(u.centroid.x - g.centroid.x, u.centroid.y - g.centroid.y) <= L.stackDist)).length;
  const A = adj / wet.length, S = up.length ? stacked / up.length : null;
  const score = 100 * (S === null ? A : .55 * A + .45 * S);
  return { score, good: `${adj} من ${wet.length} غرف مبللة متجاورة${S !== null ? `، و${stacked} من ${up.length} حمامات علوية فوق غرفة مبللة في الأرضي` : ''}، فالتمديدات أقصر`, bad: `${wet.length - adj} من ${wet.length} غرف مبللة منفردة بلا جار مبلل${S !== null ? `، و${up.length - stacked} من ${up.length} حمامات علوية لا تعلو غرفة مبللة` : ''}، فالتمديدات أطول` };
}

/**
 * تناسب الفراغات وطول الحركة: صالة تتضخم (فوق السقف المطلق أو حصة الدور) أو تصير شريطًا (نسبتها فوق 1:2.2)، أطول مشي من مدخل الدور (أو السلم في العلوي)
 * إلى غرفة نوم (مسافة مراكز عبر مخطط الأبواب)، وغرف نوم/مجالس نسبتها فوق حدها. كل ما يخصم يُذكر بقيمته المقيسة.
 */
function shape(dg) {
  const L = SCORE_LIMITS; let score = 100; const bad = [], good = [];
  let worstWalk = 0, walkFrom = '';
  dg.levels.forEach((lv, li) => {
    const rs = lv.rooms.filter(r => !r.unlabelled), net = rs.reduce((s, r) => s + r.area, 0) || 1, byId = new Map(rs.map(r => [r.id, r]));
    for (const h of rs.filter(r => r.type === 'living' && /^(الصالة|الردهة|صالة الحركة|الصالة العلوية)$/.test(r.name))) {
      const cap = Math.max(L.hallAbs, L.hallShare * net), over = h.area - cap, rat = h.size[1] / Math.max(.1, h.size[0]);
      if (over > 2) { score -= Math.min(30, over * 1.2); bad.push(`«${h.name}» ${num(h.area)} م² (${pct(h.area / net)}٪ من صافي ${lv.name}) فوق السقف المستهدف ${num(cap)} م²`); }
      if (rat > L.hallStrip) { score -= Math.min(25, 12 * (rat - L.hallStrip)); bad.push(`«${h.name}» شريط ${num(h.size[0])}×${num(h.size[1])} م (نسبة 1:${num(rat)}) أقرب إلى ممر منه إلى صالة`); }
    }
    const g = new Map(); for (const [a, b] of lv.circulation.graph) { (g.get(a) || g.set(a, []).get(a)).push(b); (g.get(b) || g.set(b, []).get(b)).push(a); }
    const src = li === 0 ? lv.circulation.entryRooms[0] : lv.stairs[0]?.room;
    if (src && byId.has(src)) {
      const dist = new Map([[src, 0]]), q = [src];
      while (q.length) { const a = q.shift(); for (const b of g.get(a) || []) { const A = byId.get(a), B = byId.get(b); if (dist.has(b) || !A || !B) continue; dist.set(b, dist.get(a) + Math.hypot(A.centroid.x - B.centroid.x, A.centroid.y - B.centroid.y)); q.push(b); } }
      for (const r of rs) if ((r.type === 'bedroom' || r.type === 'master') && dist.has(r.id) && dist.get(r.id) > worstWalk) { worstWalk = dist.get(r.id); walkFrom = li === 0 ? 'المدخل' : 'السلم'; }
    }
    for (const r of rs) {
      const rat = r.size[1] / Math.max(.1, r.size[0]);
      if ((r.type === 'bedroom' || r.type === 'master') && rat > L.roomRatio) { score -= Math.min(12, 25 * (rat - L.roomRatio)); bad.push(`«${r.name}» ${num(r.size[0])}×${num(r.size[1])} م (نسبة 1:${num(rat)}) أطول من المريح للأثاث`); }
      if (r.type === 'majlis' && rat > L.majlisRatio) { score -= Math.min(12, 25 * (rat - L.majlisRatio)); bad.push(`«${r.name}» ${num(r.size[0])}×${num(r.size[1])} م (نسبة 1:${num(rat)}) طويل ضيق للجلسة`); }
    }
  });
  if (worstWalk > L.walk) { score -= Math.min(25, 3 * (worstWalk - L.walk)); bad.push(`أبعد غرفة نوم تبعد نحو ${num(worstWalk)} م مشيًا من ${walkFrom} (المستهدف حتى ${L.walk} م)`); }
  if (!bad.length) good.push(`لا صالة متضخمة ولا شريطية، وأبعد غرفة نوم نحو ${num(worstWalk)} م من ${walkFrom || 'المدخل'}، ونسب غرف النوم والمجالس ضمن الحدود`);
  return { score: clamp(score), good: good[0] || `أبعد غرفة نوم نحو ${num(worstWalk)} م من ${walkFrom || 'المدخل'}`, bad: bad.slice(0, 2).join('؛ ') || 'لا عيب مقيس في تناسب الفراغات ولا طول الحركة' };
}
function req(ledger) {
  if (!Array.isArray(ledger) || !ledger.length) return null;
  const ok = ledger.filter(x => x.ok).length, miss = ledger.filter(x => !x.ok);
  return { score: 100 * ok / ledger.length, good: `نُفّذ ${ok} من ${ledger.length} بنود من طلبك`, bad: `لم يُنفَّذ ${miss.length} من ${ledger.length} بنود من طلبك${miss[0] ? ` (أولها: ${miss[0].text})` : ''}` };
}
function sun(doc, site) {
  let a = null; try { a = analyzeSun(doc, site || {}); } catch { return null; }
  return { score: a.score, good: (a.ups[0] || a.lines[0] || 'توجيه معتدل').replace(/[.؛]$/, ''), bad: (a.downs[0] || a.lines[1] || 'توجيه يحتاج كاسرات').replace(/[.؛]$/, '') };
}

/**
 * درجة المطابقة لتصميم. doc: مستند المرسم؛ opts: { ledger (سجل الطلب من verifyRequest/ledgerFor)، site ({lat,north}) }.
 * يعيد { total, grade, parts:[{id,label,weight,score,good,bad}], strong, weak, why:[جملتان], missing:[مؤشرات لم تُقَس] }.
 */
export function scorePlan(doc, { ledger = null, site = null } = {}) {
  const dg = digestDoc(doc), rooms = roomsOf(dg);
  const raw = { req: req(ledger), eff: eff(rooms), sun: sun(doc, site), privacy: privacy(rooms), light: light(rooms), kitchen: kitchen(rooms), pipes: pipes(rooms), shape: shape(dg) };
  const parts = [], missing = [];
  for (const id of Object.keys(SCORE_WEIGHTS)) { const p = raw[id]; if (!p) { missing.push(id); continue; } parts.push({ id, label: SCORE_LABELS[id], weight: SCORE_WEIGHTS[id], score: r0(clamp(p.score)), good: p.good, bad: p.bad }); }
  const W = parts.reduce((s, p) => s + p.weight, 0) || 1, total = r0(parts.reduce((s, p) => s + p.weight * p.score, 0) / W);
  const grade = total >= 85 ? 'ممتاز' : total >= 70 ? 'جيد' : total >= 55 ? 'مقبول' : 'يحتاج تحسينًا';
  // الأقوى والأضعف بالنقاط الموزونة المفقودة/المكتسبة (لا بالنسبة وحدها): ما خسر أكبر عدد من النقاط هو الأضعف
  const byGain = [...parts].sort((a, b) => b.score - a.score || b.weight - a.weight), byLoss = [...parts].sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score));
  const strong = byGain.filter(p => p.score >= 70).slice(0, 2), weak = byLoss.filter(p => p.score < 90).slice(0, 1);
  const s1 = strong.length ? `أقوى ما فيه: ${strong.map(p => p.good).join('؛ و')}.` : 'لا مؤشر فيه يبلغ 70 من 100؛ هو تصميم يحتاج مراجعة.';
  const s2 = weak.length ? `الأضعف: ${weak[0].label} (${weak[0].score}/100) — ${weak[0].bad}.` : 'لا نقطة ضعف ظاهرة في المؤشرات المقيسة.';
  return { total, grade, parts, strong: strong.map(p => p.id), weak: weak.map(p => p.id), why: [s1, s2], missing, v: 1 };
}

/** ترتيب البدائل بالدرجة (الأعلى أولًا، والتعادل بترتيبها الأصلي). scores: [{total}|null]. يعيد فهارس مرتبة. */
export function rankByScore(scores) {
  return scores.map((s, i) => ({ i, t: s?.total ?? -1 })).sort((a, b) => b.t - a.t || a.i - b.i).map(x => x.i);
}

export default { scorePlan, rankByScore, SCORE_WEIGHTS, SCORE_LABELS, SCORE_LIMITS };
