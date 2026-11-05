// ترتيب أنماط الواجهة لتصميم معيّن. يحترم رغبة العميل الصريحة دائمًا، وإلا توزيع ثابت حسب بصمة التصميم.
import { designHash, designFeatures } from './variation.mjs';
export const STYLE_AR = Object.freeze({ J: 'معاصر حجري', M: 'معاصر خفيف', N: 'نجدي', H: 'حجازي - جدة', S: 'سلماني', C: 'كلاسيكي' });
const IDS = Object.keys(STYLE_AR);
// الكلمات المفتاحية (الأطول أولًا حتى لا تُلتقط «معاصر» من «معاصر خفيف»)
const KEYS = [['معاصر خفيف', 'M'], ['جص وزجاج', 'M'], ['سلماني', 'S'], ['نجدي', 'N'], ['حجازي', 'H'], ['كلاسيكي', 'C'], ['كلاسيك', 'C'], ['حديث', 'M'], ['معاصر', 'J']];
const norm = s => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
export function parseWish(wishes) {
  if (!wishes) return [];
  if (typeof wishes === 'object' && !Array.isArray(wishes)) { const out = []; if (wishes.style && STYLE_AR[wishes.style]) out.push(wishes.style); return [...out, ...parseWish(wishes.text)]; }
  let t = norm(Array.isArray(wishes) ? wishes.join(' ') : wishes); const found = [];
  for (const [k, id] of KEYS) { const kk = norm(k); let i; while ((i = t.indexOf(kk)) >= 0) { found.push([i, id]); t = t.slice(0, i) + ' '.repeat(kk.length) + t.slice(i + kk.length); } }
  return [...new Set(found.sort((a, b) => a[0] - b[0]).map(x => x[1]))];
}
/** @returns {{id,ar,reason,explicit:boolean,score:number}[]} الأول هو الاختيار الافتراضي */
export function rankStyles(doc, wishes, { recent = [] } = {}) {
  const wished = parseWish(wishes), F = designFeatures(doc), h = designHash(doc);
  const base = h % IDS.length, sym = F.entry && !F.entry.off && Math.abs(F.entry.u - .5) < .12;
  const aff = { J: 0, M: 0, N: 0, H: 0, S: 0, C: 0 }, why = {};
  const add = (id, v, r) => { aff[id] += v; (why[id] ||= []).push(r); };
  if (sym) { add('C', .6, 'مدخل متوسّط يناسب التماثل الكلاسيكي'); }
  if (F.levels >= 2) { add('C', .3, 'عدة أدوار'); add('M', .3, 'عدة أدوار'); }
  if (F.cover > .22) { add('M', .4, 'مساحة زجاج كبيرة'); add('H', .3, 'فتحات كثيرة تناسب الرواشين'); }
  if (F.cover < .12) { add('N', .5, 'فتحات قليلة وجدران صمّاء تناسب النجدي'); add('S', .3, 'كتلة مصمتة'); }
  if (F.width / F.depth > 1.3) add('S', .3, 'واجهة عريضة');
  add('J', -2, 'لا يُقترح تلقائيًا إلا بطلب العميل'); recent.forEach((id, i) => { if (aff[id] !== undefined) add(id, -.6 / (1 + i), 'عُرض حديثًا في الجلسة'); });
  const out = IDS.map((id, i) => {
    const jitter = ((i - base + IDS.length) % IDS.length) === 0 ? 1.2 : ((i - base + IDS.length) % IDS.length) === 1 ? .55 : 0;
    return { id, ar: STYLE_AR[id], score: aff[id] + jitter, explicit: false, reason: (why[id] || []).join('، ') || 'توزيع ثابت حسب بصمة التصميم' };
  }).sort((a, b) => b.score - a.score || IDS.indexOf(a.id) - IDS.indexOf(b.id));
  if (!wished.length) { out.forEach(o => { o.reason = (o.reason.startsWith('توزيع') ? '' : o.reason + ' — ') + 'توزيع ثابت حسب بصمة التصميم'; }); return out; }
  const head = wished.map(id => ({ id, ar: STYLE_AR[id], score: 99, explicit: true, reason: 'اختيار العميل الصريح: ' + STYLE_AR[id] }));
  return [...head, ...out.filter(o => !wished.includes(o.id))];
}
