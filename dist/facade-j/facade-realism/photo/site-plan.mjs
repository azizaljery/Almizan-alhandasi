// مخطط المحيط (نقي، بلا three ولا DOM): من مستند العميل نفسه — حدود الأرض، موضع المبنى والمدخل، الشوارع، وقطع الحوش الخارجية —
// يُشتق السور والبوابات والأرصفة والأحواض ومواضع النباتات بعشوائية مبذورة من المخطط، فيكون لكل تصميم محيطه ويتكرر كما هو في كل فتح.
// المحيط تنسيق موقع إيضاحي للعرض: السور والنباتات والجوار ليست من مخطط العميل ولا تدّعي ذلك؛ المبنى والأرض والمداخل وقطع الحوش منه.
import { rnd } from './util.mjs';

const bbox = pts => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });
const OUTDOOR = new Set(['pool', 'waterfall', 'lawn', 'planter', 'carport', 'pergola', 'bbq', 'fountain', 'tree']);
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;

/**
 * يدير المستند حتى تصير جهة المدخل جنوبًا (محرك الواجهة يعامل الجنوب واجهةً أمامية). دوران صِرف بمضاعفات 90° حول الأصل ثم إزاحة إلى الربع الموجب:
 * لا يغيّر أي بُعد ولا علاقة. يعيد المستند نفسه إن كان المدخل جنوبيًا أصلًا.
 */
export function frontSouthDoc(doc) {
  const e = doc?.entry || 's'; if (e === 's' || !doc?.plot?.polygon?.length) return doc;
  const turns = { n: 2, e: 3, w: 1 }[e]; if (!turns) return doc; // عدد أرباع الدورة عكس عقارب الساعة
  const rot = p => { let x = p.x, y = p.y; for (let i = 0; i < turns; i++) [x, y] = [-y, x]; return { x, y }; };
  const P = bbox(doc.plot.polygon.map(rot)), mv = p => { const r = rot(p); return { ...p, x: +(r.x - P.x0).toFixed(4), y: +(r.y - P.y0).toFixed(4) }; };
  const SIDES = ['s', 'e', 'n', 'w'], side = s => { const i = SIDES.indexOf(s); return i < 0 ? s : SIDES[(i + turns) % 4]; }; // جنوب ← شرق ← شمال ← غرب مع الدوران عكس العقارب
  const d = { ...doc, entry: side(e), plot: { ...doc.plot, polygon: doc.plot.polygon.map(mv) } };
  if (doc.plot.setbacks) d.plot.setbacks = Object.fromEntries(Object.entries(doc.plot.setbacks).map(([k, v]) => [side(k), v]));
  for (const k of ['streets', 'entries']) if (Array.isArray(doc[k])) d[k] = doc[k].map(side);
  d.walls = (doc.walls || []).map(w => ({ ...w, a: mv(w.a), b: mv(w.b) }));
  for (const k of ['fixtures', 'stairs', 'columns']) if (Array.isArray(doc[k])) d[k] = doc[k].map(f => ({ ...mv(f), ...(typeof f.rot === 'number' ? { rot: f.rot + turns * Math.PI / 2 } : {}) }));
  if (Array.isArray(doc.labels)) d.labels = doc.labels.map(l => l.seed ? { ...l, seed: mv(l.seed) } : l);
  if (typeof doc.north === 'number') d.north = doc.north + turns * 90;
  return d;
}

/** فتحات الواجهة الأمامية (الجنوبية) من المستند: أبواب المدخل والنوافذ على الجدران الخارجية الأفقية عند أدنى y. */
export function frontOpenings(doc) {
  const L0 = doc.levels?.[0]?.id, walls = (doc.walls || []).filter(w => (w.level ?? L0) === L0 && w.kind !== 'fence'); if (!walls.length) return { doors: [], windows: [], B: null };
  const B = bbox(walls.flatMap(w => [w.a, w.b])), doors = [], windows = [];
  for (const o of doc.openings || []) { const w = walls.find(v => v.id === o.wall); if (!w || Math.abs(w.a.y - w.b.y) > .01 || w.a.y > B.y0 + 2.6) continue;
    const dir = Math.sign(w.b.x - w.a.x) || 1, c = w.a.x + dir * (o.at ?? 0), r = { x0: c - o.w / 2, x1: c + o.w / 2, y: w.a.y, entry: !!o.entry, kind: o.kind };
    (/^door|^arch|^garage/.test(o.kind || '') ? doors : windows).push(r); }
  return { doors, windows, B };
}

/** جهة الكاميرا الافتتاحية: من جهة باب المدخل (يظهر الباب أقرب)، والشمس من الجهة المقابلة فتُضاء الواجهة بضوء مائل ويبقى الجانب المرئي في الظل (عمق). */
export function heroSide(doc) { const { doors, B } = frontOpenings(doc); if (!B) return 'e'; const d = doors.find(x => x.entry) || doors[0]; return d && (d.x0 + d.x1) / 2 < (B.x0 + B.x1) / 2 ? 'w' : 'e'; }

/**
 * @param doc مستند بمدخل جنوبي (frontSouthDoc)
 * @param opt { doors, windows, B } من الواجهة المبنية فعلًا (إن لم تُعطَ تُشتق من المستند)، style، seed، density (0..1)
 */
export function planSite(doc, opt = {}) {
  const poly = doc?.plot?.polygon; const f0 = frontOpenings(doc), B = opt.B || f0.B;
  if (!B) return null;
  const P = poly?.length >= 3 ? bbox(poly) : { x0: B.x0 - 2, x1: B.x1 + 2, y0: B.y0 - 3, y1: B.y1 + 2 };
  const doors = (opt.doors || f0.doors).slice().sort((a, b) => a.x0 - b.x0), windows = opt.windows || f0.windows, style = opt.style || 'M', seed = (opt.seed >>> 0) || 1, R = rnd(seed), dens = opt.density ?? 1;
  const streets = [...new Set(['s', ...(doc.streets || [])])].filter(s => 'snew'.includes(s));
  const dF = B.y0 - P.y0, W = P.x1 - P.x0, cx = (P.x0 + P.x1) / 2, T = .2;
  const main = doors.find(d => d.entry) || doors[0] || { x0: (B.x0 + B.x1) / 2 - .6, x1: (B.x0 + B.x1) / 2 + .6 };
  const wall = { t: T, hFront: 1.25, hSide: 2.4, coping: .06 };
  // بوابة المشاة على محور باب المدخل؛ بوابة السيارات في الطرف الأبعد عنها
  const pedW = 1.4, pedX = Math.max(P.x0 + 1.3, Math.min(P.x1 - 1.3, (main.x0 + main.x1) / 2));
  const carW = 3.4, carSide = pedX > cx ? 'w' : 'e', carX = carSide === 'w' ? P.x0 + .65 + carW / 2 : P.x1 - .65 - carW / 2;
  const gates = { ped: { x: pedX, w: pedW, h: 2.3 } }; if (W >= 10 && Math.abs(carX - pedX) > (carW + pedW) / 2 + 1) gates.car = { x: carX, w: carW, h: 1.9, side: carSide };
  const cuts = Object.entries(gates).map(([k, g]) => ({ k, h: g.h, x0: g.x - g.w / 2, x1: g.x + g.w / 2 })).sort((p, q) => p.x0 - q.x0);
  const minus = (a, b, holes, m = 0) => { const out = []; let x = a; for (const h of holes) { if (h.x0 - m > x) out.push({ x0: x, x1: Math.min(b, h.x0 - m) }); x = Math.max(x, h.x1 + m); } if (x < b) out.push({ x0: x, x1: b }); return out.filter(s => s.x1 - s.x0 > .05); };
  const frontSegs = minus(P.x0, P.x1, cuts);
  const pillars = cuts.flatMap(c => [{ x: c.x0 - .225, h: c.h, gate: c.k }, { x: c.x1 + .225, h: c.h, gate: c.k }]);
  // عتبات ودرج أمام كل باب أمامي
  const landings = doors.map(d => ({ x0: d.x0 - .45, x1: d.x1 + .45, y1: B.y0, y0: B.y0 - Math.max(.6, Math.min(1.2, dF - 1.3)), h: Math.max(.05, d.sill ?? .45), entry: !!d.entry }));
  // أحواض: (أ) مرتفعة عند قاعدة الواجهة بين العتبات، (ب) أرضية داخل السور الأمامي، (ج) شريط زراعة خارج السور على الرصيف، (د) جانبية
  const beds = [];
  const hold = [...landings.map(l => ({ x0: l.x0, x1: l.x1 })), ...(gates.car ? [{ x0: gates.car.x - carW / 2 - .2, x1: gates.car.x + carW / 2 + .2 }] : [])].sort((a, b) => a.x0 - b.x0);
  if (dF >= 2.2) for (const s of minus(B.x0 + .1, B.x1 - .1, hold, .25)) if (s.x1 - s.x0 >= 1.2) beds.push({ ...s, y0: B.y0 - .75, y1: B.y0 - .02, h: .42, kind: 'planter', where: 'facade' });
  if (dF >= 2.6) for (const s of frontSegs) if (s.x1 - s.x0 >= 1.2) beds.push({ x0: s.x0 + .15, x1: s.x1 - .15, y0: P.y0 + T, y1: P.y0 + T + .55, h: .12, kind: 'bed', where: 'inner' });
  for (const s of frontSegs) if (s.x1 - s.x0 >= 1.2) beds.push({ x0: s.x0 + .1, x1: s.x1 - .1, y0: P.y0 - .8, y1: P.y0, h: .16, kind: 'bed', where: 'street' });
  const sideW = B.x0 - P.x0, sideE = P.x1 - B.x1;
  if (sideW >= 1.3) beds.push({ x0: P.x0 + T, x1: P.x0 + T + .5, y0: B.y0 + .3, y1: B.y1 - .3, h: .1, kind: 'bed', where: 'side' });
  if (sideE >= 1.3) beds.push({ x0: P.x1 - T - .5, x1: P.x1 - T, y0: B.y0 + .3, y1: B.y1 - .3, h: .1, kind: 'bed', where: 'side' });
  // قطع الحوش من المخطط (مسبح، مظلة سيارات، برجولة…)
  const fixtures = (doc.fixtures || []).filter(f => OUTDOOR.has(f.kind)).map(f => { const q = Math.abs(Math.round((f.rot || 0) / (Math.PI / 2))) % 2 === 1, w = q ? f.d : f.w, d = q ? f.w : f.d; return { kind: f.kind, x: f.x, y: f.y, w, d, h: f.h, rect: { x0: f.x - w / 2, x1: f.x + w / 2, y0: f.y - d / 2, y1: f.y + d / 2 } }; });
  const keep = [{ x0: B.x0 - .3, x1: B.x1 + .3, y0: B.y0 - .1, y1: B.y1 + .3 }, ...fixtures.map(f => f.rect)];
  const free = (x, y, m = .5) => x > P.x0 + T + .2 && x < P.x1 - T - .2 && y > P.y0 + T + .2 && y < P.y1 - T - .2 && !keep.some(k => overlap({ x0: x, x1: x, y0: y, y1: y }, k, m));
  // رصف وأرضيات
  const paving = [{ kind: 'forecourt', x0: P.x0, x1: P.x1, y0: P.y0, y1: B.y0 + .3 }, { kind: 'gravel', x0: P.x0, x1: P.x1, y0: B.y0 + .3, y1: P.y1 }];
  const rear = { x0: P.x0 + 1.6, x1: P.x1 - 1.6, y0: B.y1 + 2, y1: P.y1 - 1.4 };
  if (!fixtures.some(f => f.kind === 'lawn') && !fixtures.some(f => overlap(f.rect, rear)) && rear.x1 - rear.x0 > 3 && rear.y1 - rear.y0 > 3) paving.push({ kind: 'lawn', ...rear, illustrative: true });
  // النباتات
  const plants = [], put = (kind, x, y, o = {}) => plants.push({ kind, x: +x.toFixed(2), y: +y.toFixed(2), ...o });
  const pal = { N: ['grass', 'grass', 'shrub'], H: ['shrub', 'grass', 'shrub'], S: ['grass', 'sage', 'grass'], C: ['shrub', 'shrub', 'sage'], M: ['sage', 'grass', 'shrub'], J: ['sage', 'grass', 'shrub'] }[style] || ['shrub', 'grass', 'sage'];
  for (const b of beds) { const along = b.x1 - b.x0 >= b.y1 - b.y0, L = along ? b.x1 - b.x0 : b.y1 - b.y0, step = (b.where === 'facade' ? .5 : .62) / Math.max(.35, dens);
    for (let t = .3 + R() * .2; t < L - .2; t += step * (.75 + R() * .5)) { const k = pal[R() * pal.length | 0], off = (R() - .5) * .2, x = along ? b.x0 + t : (b.x0 + b.x1) / 2 + off, y = along ? (b.y0 + b.y1) / 2 + off : b.y0 + t;
      put(k, x, y, { base: b.h, r: k === 'grass' ? .55 + R() * .35 : .3 + R() * .25 }); if (b.where === 'street' && R() < .16) put('rock', x + .3, y + (R() - .5) * .3, { base: b.h, r: .22 + R() * .25 }); } }
  // نخلتان تؤطّران الواجهة في ركني الحوش الأمامي (داخل السور)، وأخريان في الحوش الخلفي تعلوان السطح
  const fy = P.y0 + Math.min(dF * .5, 1.5);
  for (const x of [P.x0 + 1.25, P.x1 - 1.25]) { if (gates.car && Math.abs(x - gates.car.x) < carW / 2 + .6) continue; // لا نخلة في مدخل السيارات
    if (dF >= 2 && !landings.some(l => x > l.x0 - .5 && x < l.x1 + .5) && Math.abs(x - pedX) > pedW / 2 + .6) put('palm', x, fy, { h: 5.6 + R() * 2 }); }
  for (const [x, y] of [[P.x0 + 2 + R(), P.y1 - 2 - R()], [P.x1 - 2 - R(), P.y1 - 2.2 - R()], [cx + (R() - .5) * 4, P.y1 - 1.6]]) if (free(x, y, 1)) put('palm', x, y, { h: 6.5 + R() * 2.5 });
  // زيتونة أمام أوسع مساحة مصمتة في الواجهة (لا تحجب بابًا ولا نافذة)، وأخرى في شريط الرصيف
  const blanks = minus(B.x0 + .3, B.x1 - .3, [...doors, ...windows].map(o => ({ x0: o.x0, x1: o.x1 })).sort((a, b) => a.x0 - b.x0), .3).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
  if (blanks[0] && blanks[0].x1 - blanks[0].x0 >= 1.6 && dF >= 2.4) put('olive', (blanks[0].x0 + blanks[0].x1) / 2, B.y0 - Math.min(1.5, dF * .5), { h: 3.1 + R() * .8, r: 1.2 + R() * .35, base: 0 });
  const st = frontSegs.slice().sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0]; if (st && st.x1 - st.x0 > 3) put('olive', st.x0 + (st.x1 - st.x0) * (.3 + R() * .4), P.y0 - .45, { h: 2.8 + R() * .7, r: 1.1 + R() * .3, base: .16 });
  if (style === 'C') for (const sd of [-1, 1]) { const l = landings.find(q => q.entry) || landings[0]; if (l) put('cypress', (sd < 0 ? l.x0 - .45 : l.x1 + .45), l.y0 + .45, { h: 3.2 + R() * .6 }); }
  for (const [x, y] of [[P.x0 + 2.6 + R() * 2, B.y1 + 3 + R() * 2], [P.x1 - 2.6 - R() * 2, B.y1 + 4 + R() * 3]]) if (free(x, y, 1.2)) put('olive', x, y, { h: 3.4 + R(), r: 1.5 + R() * .4 });
  // نخيل وأشجار الشارع والجوار (خارج الأرض): تملأ الأفق وتنعكس في الزجاج
  for (let i = -2; i <= 2; i++) { const x = cx + i * (W * .62 + 3) + (R() - .5) * 3; put(R() < .7 ? 'palm' : 'olive', x, P.y0 - 14.6 - R() * 1.5, { h: 6 + R() * 3, r: 1.8, outside: true }); }
  for (const sd of [-1, 1]) { put('palm', cx + sd * (W / 2 + 5 + R() * 4), P.y0 + 6 + R() * 6, { h: 6.5 + R() * 2.5, outside: true }); put('olive', cx + sd * (W / 2 + 3.5 + R() * 2), P.y0 + 1.2, { h: 3.2 + R(), r: 1.4, outside: true }); }
  return { plot: P, B, streets, wall, gates, frontSegs, pillars, landings, beds, fixtures, paving, plants, seed, style, camSide: main && (main.x0 + main.x1) / 2 < (B.x0 + B.x1) / 2 ? 'w' : 'e', frontDepth: dF };
}
