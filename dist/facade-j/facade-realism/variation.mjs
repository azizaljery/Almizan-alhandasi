// طبقة التنوّع: تشتق من هندسة التصميم الحقيقية (جدران، فتحات، أدوار، قطعة الأرض، السقف) بذرة ثابتة
// ومعاملات تركيب مشتركة بين الأنماط. لا تدخل العناوين أو المعرّفات (قد تتغير) في البصمة.
const q2 = (v, s = 20) => Math.round((Number(v) || 0) * s); // تكميم 5 سم
function fnv(str, h = 2166136261) { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function mix32(x) { x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0; x = Math.imul(x ^ (x >>> 13), 3266489909) >>> 0; return (x ^ (x >>> 16)) >>> 0; }
const get = (q, k) => { try { if (!q) return null; if (typeof q.get === 'function') return q.get(k); return q[k] ?? null; } catch { return null; } };
const isDoor = k => /door|arch|garage|slider/i.test(k || '');

/** ملخّص هندسي مستقل عن المعرّفات. الواجهة الأمامية = الجنوب (أصغر y). */
export function designFeatures(doc) {
  const walls = (doc?.walls || []).filter(w => w?.a && w?.b);
  const byId = new Map(walls.map(w => [w.id, w]));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of walls) for (const p of [w.a, w.b]) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (!walls.length) { minX = minY = 0; maxX = maxY = 1; }
  const width = Math.max(.1, maxX - minX), depth = Math.max(.1, maxY - minY), tol = .25;
  const ops = [];
  for (const o of doc?.openings || []) {
    const w = byId.get(o.wall); if (!w) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, t = Math.min(1, Math.max(0, (o.at ?? 0) / L));
    const cx = w.a.x + (w.b.x - w.a.x) * t, cy = w.a.y + (w.b.y - w.a.y) * t;
    ops.push({ kind: o.kind, w: o.w ?? 1, h: o.h ?? 1.2, sill: o.sill ?? 0, entry: !!o.entry, cx, cy, level: o.level, wall: w });
  }
  const onFront = o => Math.abs(o.wall.a.y - o.wall.b.y) < .02 && Math.abs(o.cy - minY) < tol;
  const front = ops.filter(onFront).map(o => ({ ...o, u: (o.cx - minX) / width })).sort((a, b) => a.u - b.u);
  let entry = front.find(o => o.entry) || front.find(o => isDoor(o.kind)) || null;
  if (!entry) { const e = ops.find(o => o.entry); if (e) entry = { ...e, u: .5, off: true }; }
  const wins = front.filter(o => !isDoor(o.kind));
  const widest = wins.reduce((m, o) => (!m || o.w > m.w ? o : m), null);
  const frontArea = width * ((doc?.levels?.[0]?.height) || 3.2);
  const cover = Math.min(1, front.reduce((s, o) => s + o.w * o.h, 0) / frontArea);
  const levels = Math.max(1, (doc?.levels || []).length || 1);
  return { minX, maxX, minY, maxY, width, depth, front, windows: wins, entry, widest, cover, levels, openingsCount: ops.length, wallsCount: walls.length };
}

/** بصمة ثابتة للهندسة (عدد صحيح 32 بت). */
export function designHash(doc) {
  const parts = [];
  parts.push('W' + (doc?.walls || []).map(w => { const a = [q2(w.a?.x), q2(w.a?.y)], b = [q2(w.b?.x), q2(w.b?.y)]; const [p, r] = (a[0] - b[0] || a[1] - b[1]) <= 0 ? [a, b] : [b, a]; return [...p, ...r, q2(w.t, 100), w.level || ''].join(','); }).sort().join(';'));
  const byId = new Map((doc?.walls || []).map(w => [w.id, w]));
  parts.push('O' + (doc?.openings || []).map(o => { const w = byId.get(o.wall); if (!w) return ''; const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, t = (o.at ?? 0) / L; return [o.kind, q2(w.a.x + (w.b.x - w.a.x) * t), q2(w.a.y + (w.b.y - w.a.y) * t), q2(o.w), q2(o.h), q2(o.sill), o.entry ? 1 : 0].join(','); }).sort().join(';'));
  parts.push('L' + (doc?.levels || []).map(l => [q2(l.elevation), q2(l.height)].join(',')).join(';'));
  parts.push('P' + (doc?.plot?.polygon || []).map(p => q2(p.x) + ',' + q2(p.y)).join(';') + '|' + ['s', 'n', 'e', 'w'].map(k => q2(doc?.plot?.setbacks?.[k])).join(',') + '|' + (doc?.entry || ''));
  parts.push('R' + q2(doc?.roof?.parapet) + ',' + q2(doc?.roof?.overhang));
  return mix32(fnv(parts.join('|')));
}

function pickMass(F, rnd) {
  const u = F.entry && !F.entry.off ? F.entry.u : null, ratio = F.depth / F.width;
  let emphasis;
  if (u == null) emphasis = ['centre', 'left', 'right', 'corners'][Math.floor(rnd(11) * 4)];
  else if (u < .36) emphasis = 'left'; else if (u > .64) emphasis = 'right';
  else {
    const wu = F.widest ? F.widest.u : .5;
    emphasis = (F.windows.length >= 4 && (wu < .2 || wu > .8) && rnd(12) > .35) ? 'corners' : 'centre';
  }
  return { emphasis, ratio: Math.round((u ?? .5) * 1000) / 1000, entryU: u, entryX: F.entry && !F.entry.off ? F.entry.cx : null, entryW: F.entry?.w ?? null, widestU: F.widest ? F.widest.u : null, widestW: F.widest ? F.widest.w : null, floors: F.levels, width: F.width, depth: F.depth, aspect: Math.round(F.width / F.depth * 100) / 100, projectionBias: Math.round((.25 + .5 * rnd(13)) * 100) / 100 };
}

// ---------- فضاء التصميم: مناطق معمارية منفصلة (لا ألوان) ----------
export const KNOBS = Object.freeze({
  e: ['centre', 'left', 'right', 'corners'],                                  // موضع التركيز في الكتلة
  r: ['منتظم', 'مزدوج', 'مجمّع'],                                              // إيقاع الفتحات
  t: ['إبراز المدخل', 'إبراز الفتحات', 'إبراز الكتلة'],                          // معالجة العنصر الرئيسي
  p: ['بروز خفيف', 'بروز متوسط', 'بروز عميق'],                                  // عمق البروز (ضمن حدود 15–25 سم للإطارات)
  c: ['خط سقف مستقيم', 'خط سقف متدرج', 'تاج بارز'],                             // خط السقف
});
const ORDER = ['e', 'r', 't', 'p', 'c'];
export const regionId = r => ORDER.map(k => r[k]).join('.');
export function parseRegion(str) {
  if (!str) return null; const a = String(str).split('.').map(Number);
  if (a.length !== 5 || a.some((n, i) => !Number.isInteger(n) || n < 0 || n >= KNOBS[ORDER[i]].length)) return null;
  const r = {}; ORDER.forEach((k, i) => { r[k] = a[i]; }); return r;
}
export const describeRegion = r => `${KNOBS.e[r.e] === 'centre' ? 'تركيز وسط' : KNOBS.e[r.e] === 'left' ? 'تركيز يسار' : KNOBS.e[r.e] === 'right' ? 'تركيز يمين' : 'تركيز الزوايا'} · إيقاع ${KNOBS.r[r.r]} · ${KNOBS.t[r.t]} · ${KNOBS.p[r.p]} · ${KNOBS.c[r.c]}`;
/** عدد المسافات بين منطقتين (عدد المقابض المختلفة). اللون ليس مقبضًا: تغيير اللوحة وحدها = مسافة 0. */
export const regionDistance = (a, b) => ORDER.reduce((n, k) => n + (a[k] !== b[k] ? 1 : 0), 0);
export const familyOf = r => r.e + '.' + r.t;

function building(F, fl, doc) {
  const bins = [0, 0, 0, 0, 0]; for (const o of F.front) bins[Math.min(4, Math.floor(o.u * 5))]++;
  const us = F.front.map(o => o.u), mirrored = us.map(u => 1 - u);
  let sym = 1; if (us.length) { sym = 1 - Math.min(1, us.reduce((s, u) => s + Math.min(...mirrored.map(m => Math.abs(m - u))), 0) / us.length * 4); } else sym = .5;
  const gaps = F.front.slice(1).map((o, i) => o.u - F.front[i].u), mg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const regular = gaps.length ? 1 - Math.min(1, Math.sqrt(gaps.reduce((s, g) => s + (g - mg) ** 2, 0) / gaps.length) / (mg || 1)) : .5;
  return { frontWidth: F.width, depth: F.depth, floors: fl, entryU: F.entry && !F.entry.off ? F.entry.u : null, openingBins: bins, frontOpenings: F.front.length, windowsCount: F.windows.length, solidVoid: Math.round((1 - F.cover) * 1000) / 1000, symmetry: Math.round(sym * 100) / 100, regularity: Math.round(regular * 100) / 100, cornerWindows: F.windows.some(o => o.u < .15 || o.u > .85), parapet: doc?.roof?.parapet ?? null, overhang: doc?.roof?.overhang ?? 0 };
}
function viableE(F, fl) {
  const u = F.entry && !F.entry.off ? F.entry.u : null, v = new Set();
  if (u == null) return [0, 1, 2, 3];
  v.add(u < .36 ? 1 : u > .64 ? 2 : 0); // حقيقة المبنى: موضع المدخل
  if (u >= .3 && u <= .7) v.add(0);
  if (F.windows.length >= 4) v.add(3);
  return [...v];
}
function knobAllowed(F, fl, k, v) { // قيود الحقيقة: لا إيقاع مزدوج بلا نوافذ كافية، ولا تاج متدرج لدور واحد
  if (k === 'r' && v === 1) return F.windows.length >= 4;
  if (k === 'r' && v === 2) return F.windows.length >= 3;
  if (k === 'c' && v === 1) return fl >= 2;
  return true;
}
/** كل المناطق الممكنة لهذا المبنى (وقيود النمط الاختيارية limits مثل {p:[0,1]}). */
export function viableRegions(doc, { floors, limits = {} } = {}) {
  const F = designFeatures(doc), fl = floors || F.levels, out = [];
  const ok = (k, v) => knobAllowed(F, fl, k, v) && (!limits[k] || limits[k].includes(v));
  for (const e of viableE(F, fl)) if (!limits.e || limits.e.includes(e)) for (let r = 0; r < 3; r++) if (ok('r', r)) for (let t = 0; t < 3; t++) if (ok('t', t)) for (let p = 0; p < 3; p++) if (ok('p', p)) for (let c = 0; c < 3; c++) if (ok('c', c)) out.push({ e, r, t, p, c });
  return out;
}
export function baseRegion(doc, floors) {
  const F = designFeatures(doc), fl = floors || F.levels, h = designHash(doc), mass = pickMass({ ...F, levels: fl }, () => .5), B = building(F, fl, doc);
  let e = KNOBS.e.indexOf(mass.emphasis); if (!viableE(F, fl).includes(e)) e = viableE(F, fl)[0];
  const r0 = B.regularity > .7 ? 0 : B.windowsCount >= 4 && h % 2 ? 1 : 2, t0 = B.solidVoid > .88 ? 2 : B.solidVoid > .8 ? 0 : 1;
  const cand = { e, r: knobAllowed(F, fl, 'r', r0) ? r0 : 0, t: t0, p: fl >= 2 ? 1 : (h >> 3) % 3, c: fl >= 2 && (h >> 5) % 2 ? 1 : ((h >> 7) % 3 === 1 ? 2 : 0) };
  if (!knobAllowed(F, fl, 'c', cand.c)) cand.c = 0;
  const via = viableRegions(doc, { floors: fl }); // تأكّد أنها ضمن الممكن للمبنى (أقرب منطقة ممكنة)
  return via.find(v => regionDistance(v, cand) === 0) || via.slice().sort((a, b) => regionDistance(a, cand) - regionDistance(b, cand))[0] || cand;
}

export function deriveParams(doc, q, styleId) {
  const designSeed = designHash(doc), alt = (parseInt(get(q, 'seed') ?? 0, 10) || 0) | 0;
  const F = designFeatures(doc), fl = parseInt(get(q, 'floors') ?? 0, 10) || F.levels;
  const given = parseRegion(get(q, 'region')), via = viableRegions(doc, { floors: fl });
  const region = given && via.some(v => regionDistance(v, given) === 0) ? given : baseRegion(doc, fl);
  const regGiven = !!(given && region === given);
  const seed = mix32((designSeed ^ Math.imul(alt + 1, 0x9e3779b1) ^ (regGiven ? fnv(regionId(region)) : 0)) >>> 0) >>> 0;
  const rnd = (k = 0) => { let s = mix32((seed + Math.imul((k | 0) + 1, 40503)) >>> 0) || 1; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const mass = pickMass({ ...F, levels: fl }, rnd); mass.emphasis = KNOBS.e[region.e];
  const palette = Math.floor(rnd(1) * 8);
  const density = Math.max(0, Math.min(1, F.cover * 2.2 + (rnd(2) - .5) * .35));
  return { seed, designSeed, alt, styleId, rnd, mass, palette, density,
    // region: مقابض معمارية منفصلة تقرؤها الأنماط (إيقاع/معالجة/بروز/خط سقف) — ليست لونًا
    region: { ...region, id: regionId(region), family: familyOf(region), rhythm: KNOBS.r[region.r], treatment: region.t, projection: region.p, crown: region.c, desc: describeRegion(region) },
    building: building(F, fl, doc),
    features: { entry: F.entry && { u: F.entry.u, x: F.entry.cx, w: F.entry.w, kind: F.entry.kind }, windows: F.windows.map(o => ({ u: o.u, x: o.cx, w: o.w, h: o.h, sill: o.sill })), widest: F.widest && { u: F.widest.u, w: F.widest.w }, frontWidth: F.width, floors: fl } };
}
