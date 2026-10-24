// (الجولة العشرون) قياسات أثبتتها المراجعة العمياء r19 ولم يكن النظام يقيسها بها (docs/research/independent-architecture-review-r19.md):
//  MAJLIS_ISOLATED  — مجلس الرجال (بدهليزه ودورة مياهه) بلا أي باب داخلي إلى البيت: الضيافة من الخارج (H1، H5) — مخالفة إلزامية في الميزان.
//  COURT_OVERLOOK   — نافذة مجلس الرجال أو الطعام الذي يدخله الضيف (المقلط) على حوش داخلي تطل عليه فراغات العائلة (C9-4) — مخالفة إلزامية في الميزان.
//  HALL_LT_MAJLIS   — الصالة العائلية أصغر من مجلس الرجال (C6، C8-2، C4) — عيب معماري (قيمة الميزان: الصالة ≥ المجلس).
//  FAMILY_WC        — لا دورة مياه في دور الصالة تُبلغ من حركة العائلة دون المرور بغرفة نوم أو بمنطقة الضيوف (C9-3) — عيب معماري.
//  HALL_DAYLIGHT    — نوافذ الصالة كلها علوية (جلسة ≥ 1.5 م): حل الخصوصية أفقدها الإطلالة (C5-3) — عيب معماري.
//  ENTRANCES_TOGETHER — باب مدخل الرجال وباب مدخل العائلة على الواجهة نفسها بأقل من 3 م بينهما — ملاحظة (يُفصلان حيث تتسع الأرض).
//  BATH_NO_WINDOW   — حمام أو دورة مياه بلا نافذة خارجية: تهوية ميكانيكية — ملاحظة.
// كلها قيم تصميمية للميزان (غير نظامية)، تُقاس من المستند المرسوم وحده، ويغلبها طلب صريح من العميل.
import { analyzeDoc } from './draw/digest.mjs';

export const R20_DEFECTS = Object.freeze({
  MAJLIS_ISOLATED: { ar: 'مجلس الرجال بلا باب داخلي إلى البيت: الضيافة تُقدَّم من الخارج', tier: 'mizan-mandatory' },
  COURT_OVERLOOK: { ar: 'نافذة مجلس الرجال أو المقلط تطل على حوش داخلي تطل عليه العائلة', tier: 'mizan-mandatory' },
  HALL_LT_MAJLIS: { ar: 'الصالة العائلية أصغر من مجلس الرجال', tier: 'architectural' },
  FAMILY_WC: { ar: 'لا دورة مياه للعائلة تُبلغ من الصالة أو المدخل دون المرور بغرفة نوم أو بمنطقة الضيوف', tier: 'architectural' },
  HALL_DAYLIGHT: { ar: 'نوافذ الصالة كلها علوية: لا إطلالة ولا ضوء كافٍ على مستوى الجلوس', tier: 'architectural' },
  ENTRANCES_TOGETHER: { ar: 'مدخل الرجال ومدخل العائلة متجاوران على الواجهة نفسها', tier: 'note' },
  BATH_NO_WINDOW: { ar: 'حمامات بلا نافذة خارجية (تحتاج تهوية ميكانيكية)', tier: 'note' },
});
export const R20_MANDATORY = Object.freeze(['MAJLIS_ISOLATED', 'COURT_OVERLOOK']);
export const R20_MAJOR = Object.freeze(['HALL_LT_MAJLIS', 'FAMILY_WC', 'HALL_DAYLIGHT']);
const r2 = v => Math.round(v * 100) / 100;
const isMen = r => r.type === 'majlis' && !/النساء/.test(r.name || '');
const isGuestSpace = r => isMen(r) || /الرجال|الضيوف/.test(r.name || '');
const isFamilyHall = r => r.type === 'living' && !/الضيوف|الطعام|مغاسل|العلوية/.test(r.name || '');
const doorsOf = (lv, room) => lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === room.id)).map(op => { const me = op.sides.find(s => s.room.id === room.id); return { op, other: me.other === 'outside' ? null : lv.roomsById.get(me.other) || null }; });

export function measureR20(doc, request = {}, model = analyzeDoc(doc)) {
  const out = [], text = String(request.text || '').replace(/[ةه]/g, 'ه');
  const push = (id, pass, value, reasons, applicable = true, clientAsked = false) => out.push({ id, ar: R20_DEFECTS[id].ar, tier: R20_DEFECTS[id].tier, pass: !!pass, applicable, value, reasons_ar: reasons, clientAsked });
  const G = model.levels.find(l => l.rooms.some(isMen)) || model.levels[0]; if (!G) return out;
  const men = G.rooms.filter(isMen);
  // (1) المجلس المعزول: من المجلس عبر فراغات الضيوف (دهليز، دورة مياه الرجال، مقلط) — هل يُبلغ أي فراغ داخلي غيرها؟
  {
    const noLink = /مجلس[^،.]{0,20}(?:بعيد|منفصل|مستقل) (?:عن|من) (?:ال)?(?:طعام|سفر|بيت|عائل)/.test(text);
    const bad = [];
    for (const m of men) {
      const seen = new Set([m.id]), q = [m]; let reach = false;
      while (q.length && !reach) { const r = q.pop(); for (const { other } of doorsOf(G, r)) { if (!other || seen.has(other.id)) continue; seen.add(other.id); if (isGuestSpace(other) || (other.type === 'bath' && /الرجال|الضيوف/.test(other.name))) q.push(other); else reach = true; } }
      if (!reach) bad.push(`«${m.name}» ودهليزه لا يتصلان بأي فراغ داخلي (طعام أو مطبخ أو مقلط) — الضيافة من الخارج`);
    }
    push('MAJLIS_ISOLATED', !bad.length, null, bad, men.length > 0 && !noLink, noLink);
  }
  // (2) نوافذ المجلس أو المقلط على حوش داخلي عائلي
  {
    const courts = G.rooms.filter(r => r.type === 'courtyard');
    const guestDining = G.rooms.filter(r => r.type === 'dining' && doorsOf(G, r).some(d => d.other && isMen(d.other)));
    const famOn = c => G.openings.some(op => (op.window || op.door) && op.sides.some(s => s.room.id === c.id) && op.sides.some(s => s.room.id !== c.id && (isFamilyHall(s.room) || ['bedroom', 'master', 'kitchen'].includes(s.room.type) || (s.room.type === 'corridor' && !/الرجال/.test(s.room.name)))));
    const bad = [];
    for (const c of courts.filter(famOn)) for (const r of [...men, ...guestDining]) {
      if (G.openings.some(op => op.window && op.sides.some(s => s.room.id === r.id) && op.sides.some(s => s.room.id === c.id || s.other === c.id))) bad.push(`نافذة «${r.name}» تطل على «${c.name}» الذي تطل عليه فراغات العائلة`);
    }
    push('COURT_OVERLOOK', !bad.length, null, bad, courts.length > 0 && men.length > 0);
  }
  // (3) الصالة ≥ المجلس
  {
    const smallAsked = /صاله[^،.]{0,12}(?:صغير|ضيق)/.test(text) || /مجلس[^،.]{0,12}(?:كبير|واسع)/.test(text);
    const hall = G.rooms.filter(isFamilyHall).sort((a, b) => b.area - a.area)[0], m = men.sort((a, b) => b.area - a.area)[0];
    const ok = !hall || !m || hall.area >= m.area - .05;
    push('HALL_LT_MAJLIS', ok, hall && m ? { hall: r2(hall.area), majlis: r2(m.area) } : null, ok ? [] : [`«${hall.name}» ${r2(hall.area)} م² أصغر من «${m.name}» ${r2(m.area)} م²`], !!(hall && m), smallAsked);
  }
  // (4) دورة مياه للعائلة: باب على الصالة أو المدخل العائلي أو ممر/ردهة عائلية (لا داخل غرفة نوم، ولا دورة مياه الرجال)
  {
    const famCirc = r => isFamilyHall(r) || (r.type === 'entrance' && !isGuestSpace(r)) || (r.type === 'corridor' && !isGuestSpace(r)) || r.type === 'dining';
    const wcs = G.rooms.filter(r => r.type === 'bath' && !/الرجال|الضيوف|الخادمة|الرئيسية|غرفة/.test(r.name || '') && doorsOf(G, r).some(d => d.other && famCirc(d.other)));
    push('FAMILY_WC', wcs.length > 0, { wcs: wcs.map(w => w.name) }, wcs.length ? [] : ['لا دورة مياه يدخلها أفراد العائلة من الصالة أو المدخل في دور الصالة'], G.rooms.some(isFamilyHall));
  }
  // (5) ضوء الصالة وإطلالتها: نافذة واحدة على الأقل بجلسة عادية (< 1.5 م) على الخارج أو على حوش/حديقة
  {
    const hall = G.rooms.filter(isFamilyHall).sort((a, b) => b.area - a.area)[0];
    const wins = hall ? G.openings.filter(op => op.window && op.sides.some(s => s.room.id === hall.id)) : [];
    const low = wins.filter(op => (op.o?.sill ?? 1) < 1.5);
    const ok = !hall || !wins.length || low.length > 0;
    push('HALL_DAYLIGHT', ok, { windows: wins.length, low: low.length }, ok ? [] : [`كل نوافذ «${hall.name}» (${wins.length}) علوية بجلسة ≥ 1.5 م`], !!hall && wins.length > 0);
  }
  // (6) المدخلان متجاوران
  {
    const ext = G.openings.filter(op => op.door && op.sides.some(s => s.other === 'outside'));
    const menD = ext.filter(op => op.sides.some(s => isGuestSpace(s.room) || isMen(s.room))), famD = ext.filter(op => op.sides.some(s => s.room.type === 'entrance' && !isGuestSpace(s.room)));
    let best = Infinity; for (const a of menD) for (const b of famD) { const sa = a.sides.find(s => s.other === 'outside'), sb = b.sides.find(s => s.other === 'outside'); if (sa.outward.x * sb.outward.x + sa.outward.y * sb.outward.y > .9) best = Math.min(best, Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y)); }
    push('ENTRANCES_TOGETHER', !(best < 3), { distance: best === Infinity ? null : r2(best) }, best < 3 ? [`باب الرجال وباب العائلة على الواجهة نفسها بينهما ${r2(best)} م`] : [], menD.length > 0 && famD.length > 0);
  }
  // (7) حمامات بلا نافذة خارجية
  {
    const baths = model.levels.flatMap(lv => lv.rooms.filter(r => r.type === 'bath').map(r => ({ r, lv })));
    const dark = baths.filter(({ r, lv }) => !lv.openings.some(op => op.window && op.sides.some(s => s.room.id === r.id && s.other === 'outside'))).map(x => x.r.name);
    push('BATH_NO_WINDOW', !dark.length, { baths: dark }, dark.length ? [`${dark.length} من ${baths.length}: ${[...new Set(dark)].slice(0, 6).join('، ')} — تهوية ميكانيكية (مروحة شفط ومجرى إلى السطح)`] : [], baths.length > 0);
  }
  return out;
}
export default { measureR20, R20_DEFECTS, R20_MANDATORY, R20_MAJOR };
