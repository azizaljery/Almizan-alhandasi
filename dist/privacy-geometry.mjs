// هندسة الخصوصية على مستند الرسم نفسه (لا على نية المولّد): ثلاثة فحوص كانت «غير مُقيّم» في preference-evidence:
//   avoid_bedroom_kitchen_sightline  خط رؤية مباشر بين فتحة غرفة نوم وفتحة مطبخ تفتحان على الحيّز نفسه بلا جدار بينهما.
//   avoid_exposed_bedrooms           باب غرفة نوم مرئي من باب المدخل أو من باب مجلس على الحيّز نفسه، ونافذة غرفة نوم أرضية على جهة شارع.
//   avoid_dark_corridors             ممر (≥ 3 م) بلا أي نافذة طبيعية على جدرانه.
// ما لا تتوفر بياناته يبقى «غير متحقق»: لا سور ولا تظليل ولا ارتفاع نوافذ ولا إنارة صناعية في الرسم، فلا يُدّعى حجب أو إنارة منها.
// العتبات افتراضات تصميمية معلنة (ليست اشتراطات نظامية): PRIVACY_LIMITS.
import { analyzeDoc } from './draw/digest.mjs';
import { wallRect } from './draw/review.mjs';

export const PRIVACY_VERSION = 'privacy-geometry/1';
export const PRIVACY_KINDS = Object.freeze(['avoid_bedroom_kitchen_sightline', 'avoid_exposed_bedrooms', 'avoid_dark_corridors']);
export const PRIVACY_LIMITS = Object.freeze({ maxSight: 12, facing: .5, corridorMinLen: 3 });
const BED = new Set(['bedroom', 'master']);
const r2 = v => Math.round(v * 100) / 100;
const num = v => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 1 }).format(v);

function segHitsPoly(p, q, poly) {
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inter = (a, b, c, d) => { const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)); };
  for (let i = 0; i < poly.length; i++) if (inter(p, q, poly[i], poly[(i + 1) % poly.length])) return true;
  const inside = pt => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > pt.y) !== (poly[j].y > pt.y) && pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) c = !c; return c; };
  return inside(p) || inside(q);
}
/** هل يقطع المقطع p→q جدارًا (غير جداري الفتحتين)؟ */
function blocked(lv, p, q, skip) {
  for (const w of lv.walls) { if (skip.has(w.id) || (w.kind || 'wall') === 'fence') continue; if (segHitsPoly(p, q, wallRect(w, .03))) return true; }
  return false;
}
/** الحيّز الذي تفتح عليه فتحة من جهة غرفتها: غرفة الجهة الأخرى (id) أو null للخارج. */
function otherSide(op, room) {
  const mine = op.sides.find(s => s.room.id === room.id); if (!mine) return null;
  const other = op.sides.find(s => s.room.id !== room.id);
  return other ? { room: other.room, outward: mine.outward } : { room: null, outward: mine.outward, exterior: true };
}
const unit = (a, b) => { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d, d }; };
/** مواجهة فتحتين: على الحيّز نفسه، بلا جدار بينهما، ودرجة المحاذاة (cos بين اتجاه الرؤية ومحور فتحة الغرفة الأولى) ≥ PRIVACY_LIMITS.facing. */
function facing(lv, opA, roomA, opB, roomB) {
  const sa = otherSide(opA, roomA), sb = otherSide(opB, roomB);
  if (!sa || !sb || !sa.room || !sb.room || sa.room.id !== sb.room.id) return null;
  const u = unit(opA.p, opB.p); if (u.d > PRIVACY_LIMITS.maxSight) return null;
  const cosA = u.x * sa.outward.x + u.y * sa.outward.y, cosB = -(u.x * sb.outward.x + u.y * sb.outward.y);
  if (cosA < PRIVACY_LIMITS.facing || cosB < PRIVACY_LIMITS.facing) return null;
  if (blocked(lv, opA.p, opB.p, new Set([opA.wall.id, opB.wall.id]))) return null;
  return { length: r2(u.d), via: sa.room.name, a: { x: r2(opA.p.x), y: r2(opA.p.y) }, b: { x: r2(opB.p.x), y: r2(opB.p.y) } };
}

const row = (kind, status, detail, data = {}, where = [], marks = []) => ({ kind, status, score: status === 'PASS' ? 100 : status === 'FAIL' ? 0 : null, detail, data, where, marks, source: PRIVACY_VERSION });

function bedroomKitchen(doc, m) {
  const hits = []; let beds = 0, kits = 0;
  for (const lv of m.levels) {
    const B = lv.rooms.filter(r => !r.unlabelled && BED.has(r.type)), K = lv.rooms.filter(r => !r.unlabelled && r.type === 'kitchen'); beds += B.length; kits += K.length;
    for (const b of B) for (const k of K) for (const oa of lv.openings) {
      if (!oa.sides.some(s => s.room.id === b.id)) continue;
      for (const ob of lv.openings) {
        if (!ob.sides.some(s => s.room.id === k.id) || oa.id === ob.id) continue;
        const f = facing(lv, oa, b, ob, k); if (f) hits.push({ bedroom: b.name, kitchen: k.name, level: lv.level.name, levelId: lv.level.id, opening: oa.door ? 'باب' : 'نافذة', kitchenOpening: ob.door ? 'باب' : 'نافذة', ...f });
      }
    }
  }
  if (!beds || !kits) return row('avoid_bedroom_kitchen_sightline', 'NOT_EVALUATED', `غير مُقيّم: ${!beds ? 'لا غرفة نوم' : 'لا مطبخ'} في التصميم.`);
  const where = [...new Set(hits.flatMap(h => [`${h.levelId}|${h.bedroom}`, `${h.levelId}|${h.kitchen}`]))].map(s => { const [level, name] = s.split('|'); return { name, level }; });
  const marks = hits.map(h => ({ level: h.levelId, a: h.a, b: h.b, text: `خط رؤية ${num(h.length)} م` }));
  if (hits.length) return row('avoid_bedroom_kitchen_sightline', 'FAIL', `${hits.length} خط رؤية مباشر بين غرفة نوم ومطبخ: ` + hits.slice(0, 3).map(h => `«${h.bedroom}» (${h.opening}) ↔ «${h.kitchen}» (${h.kitchenOpening}) على «${h.via}» بطول ${num(h.length)} م`).join('؛ ') + '. القياس: فتحتان على الحيّز نفسه، بلا جدار بينهما، ومحاذاة ≥ ' + PRIVACY_LIMITS.facing + ' (افتراض تصميمي). الأبواب محسوبة مفتوحة.', { sightlines: hits, limits: PRIVACY_LIMITS }, where, marks);
  return row('avoid_bedroom_kitchen_sightline', 'PASS', `لا خط رؤية مباشر بين فتحات ${beds} غرف نوم وفتحات ${kits} مطبخ (فتحتان على حيّز واحد بلا جدار بينهما). الأبواب محسوبة مفتوحة؛ الرؤية عبر الخارج (حديقة/شارع) غير مقيسة.`, { sightlines: [], limits: PRIVACY_LIMITS });
}

function exposedBedrooms(doc, m) {
  const hits = [], street = [], streets = new Set(doc.streets || doc.plot?.streets || []); let beds = 0;
  const lv0 = m.levels[0]; if (!lv0) return row('avoid_exposed_bedrooms', 'NOT_EVALUATED', 'غير مُقيّم: لا دور.');
  // مناظير الرؤية: أبواب المدخل (إلى الخارج) وأبواب المجالس إلى حيّز مشترك
  const viewers = lv0.openings.filter(o => o.door && o.o.entry && o.kind !== 'garage' && o.sides.length === 1);
  const majlisDoors = lv0.openings.filter(o => o.door && o.sides.some(s => s.room.type === 'majlis') && o.sides.length === 2);
  for (const lv of m.levels) {
    const B = lv.rooms.filter(r => !r.unlabelled && BED.has(r.type)); beds += B.length;
    if (lv.levelIndex === 0) {
      for (const b of B) for (const od of lv.openings) {
        if (!od.door || !od.sides.some(s => s.room.id === b.id)) continue;
        for (const v of viewers) { // المدخل: الرؤية من الداخل (غرفة المدخل) إلى باب النوم
          const vr = v.sides[0]?.room; if (!vr) continue;
          const sb = otherSide(od, b); if (!sb?.room || sb.room.id !== vr.id) continue;
          const u = unit(v.p, od.p); if (u.d > PRIVACY_LIMITS.maxSight || u.d < .2) continue;
          const cosB = -(u.x * sb.outward.x + u.y * sb.outward.y); if (cosB < PRIVACY_LIMITS.facing * .6) continue;
          if (blocked(lv, v.p, od.p, new Set([v.wall.id, od.wall.id]))) continue;
          hits.push({ bedroom: b.name, level: lv.level.name, levelId: lv.level.id, from: 'باب المدخل', via: vr.name, length: r2(u.d), a: { x: r2(v.p.x), y: r2(v.p.y) }, b: { x: r2(od.p.x), y: r2(od.p.y) } });
        }
        for (const md of majlisDoors) {
          const mr = md.sides.find(s => s.room.type === 'majlis')?.room; if (!mr) continue;
          const sm = otherSide(md, mr), sb = otherSide(od, b); if (!sm?.room || !sb?.room || sm.room.id !== sb.room.id) continue;
          const u = unit(md.p, od.p); if (u.d > PRIVACY_LIMITS.maxSight || u.d < .2) continue;
          if (-(u.x * sb.outward.x + u.y * sb.outward.y) < PRIVACY_LIMITS.facing * .6 || (u.x * sm.outward.x + u.y * sm.outward.y) < PRIVACY_LIMITS.facing * .6) continue;
          if (blocked(lv, md.p, od.p, new Set([md.wall.id, od.wall.id]))) continue;
          hits.push({ bedroom: b.name, level: lv.level.name, levelId: lv.level.id, from: `باب «${mr.name}»`, via: sm.room.name, length: r2(u.d), a: { x: r2(md.p.x), y: r2(md.p.y) }, b: { x: r2(od.p.x), y: r2(od.p.y) } });
        }
      }
      for (const op of lv.openings) {
        if (!op.window) continue;
        for (const s of op.sides) if (BED.has(s.room.type) && s.exterior && (!s.other || s.other === 'outside') && streets.has(s.compass)) street.push({ bedroom: s.room.name, level: lv.level.name, levelId: lv.level.id, side: s.compass, a: { x: r2(op.p.x), y: r2(op.p.y) } });
      }
    }
  }
  if (!beds) return row('avoid_exposed_bedrooms', 'NOT_EVALUATED', 'غير مُقيّم: لا غرف نوم.');
  const names = [...new Set([...hits, ...street].map(h => `${h.levelId}|${h.bedroom}`))].map(s => { const [level, name] = s.split('|'); return { name, level }; });
  const marks = hits.map(h => ({ level: h.levelId, a: h.a, b: h.b, text: `رؤية من ${h.from}` })).concat(street.map(h => ({ level: h.levelId, a: h.a, b: h.a, text: 'نافذة نوم أرضية على الشارع' })));
  if (hits.length || street.length) return row('avoid_exposed_bedrooms', 'FAIL', [hits.length ? `${hits.length} باب غرفة نوم مرئي من ${[...new Set(hits.map(h => h.from))].join('، ')}: ` + hits.slice(0, 3).map(h => `«${h.bedroom}» عبر «${h.via}» (${num(h.length)} م)`).join('؛ ') : '', street.length ? `${street.length} نافذة غرفة نوم أرضية على جهة شارع (${[...new Set(street.map(s => s.bedroom))].slice(0, 3).join('، ')}) — السور والتظليل غير ممثلين في الرسم فلا يُحسب حجبهما` : ''].filter(Boolean).join('. ') + '.', { exposures: hits, streetWindows: street, limits: PRIVACY_LIMITS }, names, marks);
  return row('avoid_exposed_bedrooms', 'PASS', `لا باب غرفة نوم مرئي من المدخل أو من باب مجلس على حيّز مشترك، ولا نافذة غرفة نوم أرضية على جهة شارع (${[...streets].join('، ') || 'لا جهة شارع مسجلة'}). الرؤية من الجار أو من الخارج عبر السور غير مقيسة.`, { exposures: [], streetWindows: [], limits: PRIVACY_LIMITS });
}

function darkCorridors(doc, m) {
  const dark = [], lit = []; let n = 0;
  for (const lv of m.levels) for (const r of lv.rooms) {
    if (r.unlabelled || r.type !== 'corridor' || r.rect.l < PRIVACY_LIMITS.corridorMinLen) continue; n++;
    const wins = lv.openings.filter(o => o.window && o.sides.some(s => s.room.id === r.id));
    (wins.length ? lit : dark).push({ name: r.name, level: lv.level.name, levelId: lv.level.id, length: r2(r.rect.l), width: r2(r.rect.w), windows: wins.length, a: { x: r2(r.centroid.x), y: r2(r.centroid.y) } });
  }
  if (!n) return row('avoid_dark_corridors', 'PASS', `لا ممر طوله ≥ ${PRIVACY_LIMITS.corridorMinLen} م في التصميم (الصالات ليست ممرات).`, { dark: [], lit: [] });
  const where = dark.map(d => ({ name: d.name, level: d.levelId })), marks = dark.map(d => ({ level: d.levelId, a: d.a, b: d.a, text: 'ممر بلا نافذة' }));
  if (dark.length) return row('avoid_dark_corridors', 'FAIL', `${dark.length} ممر طويل بلا أي نافذة طبيعية: ` + dark.slice(0, 3).map(d => `«${d.name}» ${num(d.length)}×${num(d.width)} م (${d.level})`).join('؛ ') + '. الإنارة الصناعية غير ممثلة في الرسم؛ الحكم على الضوء الطبيعي المباشر فقط.', { dark, lit }, where, marks);
  return row('avoid_dark_corridors', 'PASS', `كل الممرات الطويلة (${n}) فيها نافذة طبيعية على الأقل. الإنارة الصناعية غير ممثلة؛ لا يُقاس مقدار الضوء.`, { dark: [], lit });
}

/** يقيس نوع خصوصية واحد على مستند. يعيد صفًا بحالة PASS|FAIL|NOT_EVALUATED مع الدليل والغرف والعلامات. لا يرمي. */
export function evaluatePrivacyKind(doc, kind) {
  try {
    const m = analyzeDoc(doc);
    if (kind === 'avoid_bedroom_kitchen_sightline') return bedroomKitchen(doc, m);
    if (kind === 'avoid_exposed_bedrooms') return exposedBedrooms(doc, m);
    if (kind === 'avoid_dark_corridors') return darkCorridors(doc, m);
  } catch (err) { return row(kind, 'NOT_EVALUATED', 'غير مُقيّم: تعذّر القياس — ' + err.message); }
  return row(kind, 'NOT_EVALUATED', 'نوع خصوصية غير مدعوم.');
}
export const evaluatePrivacy = (doc, kinds = PRIVACY_KINDS) => kinds.map(k => evaluatePrivacyKind(doc, k));

export default { PRIVACY_VERSION, PRIVACY_KINDS, PRIVACY_LIMITS, evaluatePrivacyKind, evaluatePrivacy };
