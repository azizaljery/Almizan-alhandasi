// فتحات الأدوار العليا من غرف الدور العلوي الفعلية (لا تكرارًا لفتحات الأرضي).
// المصدر: فتحات المستند الكامل في الأدوار العليا (مواضعها في المسقط) ← الجهة والموضع الأفقي u على قطع الواجهة المبنية؛
// الغرفة صاحبة الفتحة من أقرب ملصق غرفة في الدور نفسه (نوم، صالة، حمام، مطبخ، سلم، تراس…).
// الصدق: الموضع الأفقي ونوع الغرفة من المخطط؛ أبعاد الفتحة ومنسوبها «افتراض تصوير» بنسب الطراز (غير متحقق من المخطط التنفيذي)،
// وتُحدّ بالعرض الحقيقي للفتحة في المخطط ولا تتجاوز عرض جدارها. فتحة على جدار ليس على مستوى وجه الأرضي (دور مرتد/تراس) لا تُرسم.
import { facadeGeometry } from '../facade-styles.mjs';
import { floorLevel } from './floors.mjs';
import { findTerraces } from './massing.mjs';

const OUT = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] };
export const UPPER_NOTE = 'فتحات الأدوار العليا: موضعها ونوع غرفتها من مخططك، وأبعادها ومنسوبها بنسب المعالجة المعمارية افتراضًا للعرض (غير متحقق من المخطط التنفيذي)';

/** رمز الغرفة من نوع الملصق. */
export function roomRole(type) {
  if (/^(bedroom|master)/.test(type || '')) return type === 'master' ? 'master' : 'bed';
  if (/^(living|majlis|hall|dining|lounge)/.test(type || '')) return 'living';
  if (/^(bath|wc|toilet)/.test(type || '')) return 'bath';
  if (/^(kitchen|laundry|maid|utility)/.test(type || '')) return 'service';
  if (/^(storage|closet|dress)/.test(type || '')) return 'store';
  if (/^(corridor|stair|lobby|entry)/.test(type || '')) return 'circ';
  if (/^balcony|terrace/.test(type || '')) return 'balcony';
  return 'other';
}

/** u في إطار الجهة المبنية من نقطة المسقط (عكس sideTransform). */
const uOf = (side, off, p) => side === 's' ? p.x - off.minX : side === 'n' ? off.maxX - p.x : side === 'e' ? p.y - off.minY : off.maxY - p.y;

const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };

/**
 * فتحات الأدوار العليا الخارجية من المستند الكامل، مُسقَطة على قطع الواجهة المبنية.
 * @param doc    المستند الكامل (كل الأدوار)
 * @param built  buildAllSides للدور الأرضي (بعد قالب الطراز إن وُجد)
 * @returns { levels:Set<number>, sides:{s,n,e,w:[{k,id,u,w,h,sill,kind,room,roomName,stair,piece}]}, stats:{real,dropped,reasons} }
 */
export function upperOpenings(doc, built) {
  const out = { levels: new Set(), sides: { s: [], n: [], e: [], w: [] }, fallback: {}, stats: { real: 0, dropped: 0, terrace: 0, mismatch: 0, reasons: {}, bySide: {} } };
  const L = doc?.levels || []; if (L.length < 2) return out;
  let terr = []; try { terr = findTerraces(doc); } catch { /* بلا تراسات */ }
  const nearTerrace = (c, k) => terr.some(t => t.level === k && c.x > t.x0 - .8 && c.x < t.x1 + .8 && c.y > t.y0 - .8 && c.y < t.y1 + .8);
  const drop = (r, side, c, k) => { out.stats.dropped++; out.stats.reasons[r] = (out.stats.reasons[r] || 0) + 1; const t = c && nearTerrace(c, k), b = out.stats.bySide[side] ||= { real: 0, terrace: 0, mismatch: 0 }; if (t) { out.stats.terrace++; b.terrace++; } else { out.stats.mismatch++; b.mismatch++; } };
  let g; try { g = facadeGeometry(doc); } catch { return out; }
  const wallOf = new Map((doc.walls || []).map(w => [w.id, w])), opOf = new Map((doc.openings || []).map(o => [o.id, o]));
  const labelsOf = new Map(); for (let k = 1; k < L.length; k++) labelsOf.set(L[k].id, (doc.labels || []).filter(l => l.level === L[k].id && l.seed));
  for (let k = 1; k < L.length; k++) out.levels.add(k);
  for (const side of ['s', 'n', 'e', 'w']) {
    const B = built?.[side]; if (!B?.F) continue;
    const gp = B.F.pieces; // قطع الأرضي المبنية: u0,u1,C (= −العمق)
    for (const up of g.sides[side].pieces) {
      if (!(up.li >= 1)) continue;
      // قطعة الدور العلوي في إطارها الأصلي؛ نحوّل مواضع فتحاتها عبر المسقط إلى إطار الأرضي
      for (const o of up.openings) {
        const op = opOf.get(o.id), w = op && wallOf.get(op.wall); if (!op || !w) continue;
        const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, c = { x: w.a.x + (w.b.x - w.a.x) * op.at / len, y: w.a.y + (w.b.y - w.a.y) * op.at / len };
        const u = uOf(side, B.off, c);
        // مستوى جدار هذا الدور مقارنًا بمستوى قطعة الأرضي التي تحمله
        const host = gp.find(p => u >= p.u0 + .05 && u <= p.u1 - .05);
        if (!host) { drop('خارج قطع الأرضي', side, c, up.li); continue; }
        if (Math.abs(up.depth + host.C) > .35) { drop('جدار مرتد عن وجه الأرضي', side, c, up.li); continue; }
        // الغرفة: أقرب ملصق غرفة داخل المبنى (نزاحة نصف متر إلى الداخل من الفتحة)
        const n = OUT[side], inward = { x: c.x - n[0] * .6, y: c.y + n[1] * .6 };
        let best = null, bd = 1e9; for (const lab of labelsOf.get(L[up.li].id) || []) { const d = Math.hypot(lab.seed.x - inward.x, lab.seed.y - inward.y); if (d < bd) { bd = d; best = lab; } }
        const stair = (doc.stairs || []).some(s => { const x0 = s.x - 0.1, y0 = s.y - 0.1, x1 = s.x + (s.w || 1.2) + 0.1, y1 = s.y + ((s.run || 3) + 1) * .3 + 1.4; return c.x > x0 - .5 && c.x < x1 + .5 && c.y > y0 - .5 && c.y < y1 + .5; });
        out.sides[side].push({ k: up.li, id: o.id, u, w: o.w, h: o.h, sill: o.sill || 0, kind: o.kind, room: roomOf(best?.type, stair), roomName: best?.name || '', stair, piece: host.id, door: !/^window/.test(o.kind || '') });
        out.stats.real++; (out.stats.bySide[side] ||= { real: 0, terrace: 0, mismatch: 0 }).real++;
      }
    }
  }
  // جهة لا يطابق قالب الطراز مسقطها (فتحات خارج قطع الأرضي المبنية أو على مستوى آخر لا يفسره تراس): تُشتق فتحات علوية من إيقاع الأرضي بنسب الطراز
  for (const [side, b] of Object.entries(out.stats.bySide)) if (b.mismatch >= 2 && b.mismatch > b.real) out.fallback[side] = true;
  for (const side of ['s', 'n', 'e', 'w']) if (!out.stats.bySide[side] && built?.[side]?.F?.pieces?.some(p => p.openings.length)) out.fallback[side] = out.fallback[side] ?? false;
  return out;
}
/** فتحات علوية مشتقة من فتحات الأرضي (جهة لا يطابقها المسقط العلوي): نافذة فوق كل نافذة، وفوق المدخل صالة/شرفة أوسع؛ لا شيء فوق أبواب المرآب. */
export function deriveUpper(pieces, levels) {
  const out = [];
  for (const k of levels) for (const pc of pieces) pc.openings.forEach((o, i) => {
    if (/^(garage|gate)/.test(o.kind || '')) return;
    const room = o.entry ? 'living' : /^window/.test(o.kind) ? (i % 3 === 1 ? 'master' : 'bed') : null; if (!room) return;
    out.push({ k, id: o.id, u: (o.u0 + o.u1) / 2, w: o.u1 - o.u0, h: o.h, sill: 0, kind: 'window', room, piece: pc.id, door: false, derived: true });
  });
  return out;
}
const roomOf = (type, stair) => stair ? 'stair' : roomRole(type);

// ---------------------------------------------------------------- نسب الطراز (افتراض تصوير)
// لكل طراز ولكل دور غرفة: عرض/ارتفاع/منسوب الفتحة بالنسبة إلى أرضية الدور. fit: يحدّ العرض بعرض فتحة المخطط (ضرب ثم حد).
// الإيقاع يختلف عن الأرضي: الأرضي واسع/منخفض القائمة للمجالس، والعلوي نوم (خصوصية: جلسة أعلى أو نافذة أصغر) وشرفات وسلم قائم.
const P = {
  // معاصر: نوافذ عريضة منخفضة، زجاج حتى الأرضية للماستر/الصالة، بحر حمام شريطي عالٍ، شق سلم رأسي
  M: { bed: { f: 1.2, min: 1.3, max: 2.2, h: 1.45, sill: .8 }, master: { f: 1.45, min: 1.8, max: 2.6, h: 2.25, sill: .2 }, living: { f: 1.3, min: 1.8, max: 3.0, h: 2.1, sill: .3 }, bath: { f: 1, min: .5, max: 1.2, h: .45, sill: 1.9 }, service: { f: 1, min: .9, max: 1.4, h: 1.0, sill: 1.1 }, store: { f: 1, min: .5, max: 1, h: .5, sill: 1.9 }, circ: { f: 1, min: .5, max: .8, h: 2.4, sill: .3 }, stair: { f: 1, min: .5, max: .7, h: 2.5, sill: .25 }, balcony: { f: 1, min: 1.7, max: 3.2, h: 2.3, sill: 0 }, other: { f: 1.1, min: 1, max: 1.8, h: 1.3, sill: .9 } },
  // كلاسيكي: نوافذ رأسية منتظمة (ارتفاع ≈ 1.6 العرض)، أبواب فرنسية للشرفة، سلم بنافذة مقوسة
  C: { bed: { f: 1, min: 1, max: 1.3, h: 1.7, sill: .8 }, master: { f: 1, min: 1.1, max: 1.4, h: 1.9, sill: .6 }, living: { f: 1, min: 1.1, max: 1.5, h: 1.9, sill: .6 }, bath: { f: 1, min: .5, max: .8, h: .8, sill: 1.5 }, service: { f: 1, min: .8, max: 1.1, h: 1.2, sill: 1 }, store: { f: 1, min: .5, max: .7, h: .6, sill: 1.6 }, circ: { f: 1, min: .6, max: .9, h: 1.5, sill: .8 }, stair: { f: 1, min: .8, max: 1, h: 2.5, sill: .3, arch: true }, balcony: { f: 1, min: 1.1, max: 1.5, h: 2.4, sill: 0 }, other: { f: 1, min: .9, max: 1.2, h: 1.5, sill: .85 } },
  // نجدي: فتحات صغيرة غائرة بنسبة قريبة من المربع وبجلسة مرتفعة، شق تهوية صغير للحمام، باب شرفة مفرد
  N: { bed: { f: .7, min: .75, max: 1.0, h: 1.05, sill: 1.05 }, master: { f: .75, min: .85, max: 1.1, h: 1.2, sill: .95 }, living: { f: .75, min: .9, max: 1.2, h: 1.3, sill: .9 }, bath: { f: 1, min: .3, max: .4, h: .45, sill: 1.9 }, service: { f: .7, min: .6, max: .8, h: .8, sill: 1.3 }, store: { f: 1, min: .3, max: .4, h: .45, sill: 1.9 }, circ: { f: 1, min: .3, max: .45, h: .9, sill: 1.1 }, stair: { f: 1, min: .3, max: .4, h: 1.4, sill: .7 }, balcony: { f: .6, min: .9, max: 1.1, h: 2.1, sill: 0 }, other: { f: .7, min: .7, max: .95, h: 1, sill: 1.1 } },
  // حجازي: نوافذ رأسية ضيقة طويلة (مصاريع)، شرفة بباب طويل ضيق، سلم بنافذة مقوسة صغيرة
  H: { bed: { f: .85, min: .8, max: 1.0, h: 1.95, sill: .55 }, master: { f: .9, min: .85, max: 1.05, h: 2.05, sill: .45 }, living: { f: .9, min: .85, max: 1.05, h: 2.05, sill: .45 }, bath: { f: 1, min: .5, max: .6, h: 1.0, sill: 1.35 }, service: { f: .85, min: .7, max: .9, h: 1.3, sill: .9 }, store: { f: 1, min: .5, max: .6, h: .9, sill: 1.4 }, circ: { f: 1, min: .5, max: .7, h: 1.3, sill: .8 }, stair: { f: 1, min: .55, max: .7, h: 1.8, sill: .5, arch: true }, balcony: { f: .8, min: .9, max: 1.1, h: 2.4, sill: 0 }, other: { f: .85, min: .75, max: .95, h: 1.7, sill: .65 } },
  // سلماني: فتحات غائرة متوسطة رأسية الطابع، مجموعات صغيرة، باب شرفة مقوس
  S: { bed: { f: .9, min: .9, max: 1.2, h: 1.4, sill: .85 }, master: { f: 1, min: 1, max: 1.4, h: 1.6, sill: .7 }, living: { f: 1, min: 1.1, max: 1.5, h: 1.7, sill: .6 }, bath: { f: 1, min: .35, max: .5, h: .5, sill: 1.8 }, service: { f: .9, min: .7, max: 1, h: .9, sill: 1.15 }, store: { f: 1, min: .35, max: .5, h: .5, sill: 1.8 }, circ: { f: 1, min: .4, max: .6, h: 1.1, sill: 1 }, stair: { f: 1, min: .4, max: .55, h: 2, sill: .5 }, balcony: { f: .9, min: 1, max: 1.3, h: 2.3, sill: 0, arch: true }, other: { f: .9, min: .8, max: 1.1, h: 1.2, sill: .95 } },
};
P.J = P.M;
/** معاملات الطراز لغرفة، ما لم يكن للطراز جدول فالمعاصر. */
export const proportions = (style, room) => (P[style] || P.M)[room] || (P[style] || P.M).other;

/**
 * مستطيلات فتحات الدور k على الجهة (إحداثيات u، z مطلقة) لقطع جهة معينة. تحترم: حدود القطعة (هامش حواف)، عدم التداخل بين فتحتين،
 * وقصر العرض على الفاصل الخالي من فتحات الأرضي… لا تتحقق من الأرضي هنا (المنسوب مختلف فلا تقاطع).
 * @param ops  upperOpenings(...).sides[side]
 * @param pieces قطع الجهة المبنية (u0,u1,id)
 */
export function placeUpper(style, ops, pieces, k, { edge = .3, gap = .25 } = {}) {
  const FL = floorLevel(k), res = [];
  for (const pc of pieces) {
    const list = ops.filter(o => o.k === k && o.piece === pc.id).sort((a, b) => a.u - b.u);
    let prevEnd = pc.u0 + edge - gap;
    for (const o of list) {
      const p = proportions(style, o.room);
      let w = Math.min(p.max, Math.max(p.min, (o.w || 1) * p.f)); if (o.door && o.room === 'balcony') w = Math.min(Math.max(w, p.min), p.max);
      const lo = Math.max(pc.u0 + edge, prevEnd + gap), hi = pc.u1 - edge;
      if (hi - lo < Math.max(.3, Math.min(w, .45))) continue;
      w = Math.min(w, hi - lo);
      let u0 = o.u - w / 2; u0 = Math.max(lo, Math.min(u0, hi - w));
      const arch = !!p.arch && w >= .55 && p.h > w;
      res.push({ id: o.id, k, piece: pc.id, u0, u1: u0 + w, z0: FL + p.sill, z1: Math.min(FL + p.sill + p.h, FL + 3.0), room: o.room, kind: arch ? 'arch' : o.door && o.room === 'balcony' ? 'door' : 'window', real: true });
      prevEnd = u0 + w;
    }
  }
  return res;
}
