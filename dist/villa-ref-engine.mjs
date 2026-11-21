// محرك التكييف: هيكل مرجعي (شجرة مناطق) + برنامج العميل → مستندات مخطط (layout) لكل دور بنفس شكل realizeLayout.
// المراحل: (1) توزيع وحدات البرنامج على مناطق الهيكل، (2) حدود كل منطقة من حدود محتواها (تقاطع الدورين)،
// (3) حلّ الهيكل في الغلاف المتاح، (4) حلّ محتوى كل منطقة، (5) اشتقاق الأبواب من روابط الوحدات وتجاور الحركة.
// لا يمدّد نسبيًا: انظر villa-ref-core.fill. وما لا يتسع يُرفض بسببه (rejected.why) فيبحث المولّد عن مرجع آخر.
import { X, Y, L, iv, badPath, solve, snap, r2, sharedEdge, exposure, deriveDoors, tagDoorSides, W_, H_, A_ } from './villa-ref-core.mjs';
import { padLeaf, suiteUnit, menUnit, womenUnit, dineUnit, serviceUnit, simpleUnit, familyUnit, hallLeaf, foyerLeaf, stairLeaf, corrLeaf, courtLeaf, adapt } from './villa-ref-units.mjs';

/**
 * منطقة في الهيكل. axis: اتجاه رصّ الوحدات ('x' صف | 'y' عمود)، corr: جهة شريط الممر، front: تلامس الواجهة (يجوز فيها مجلس الرجال)،
 * pref: فئات تفضّلها المنطقة ('guest' ضيافة وطعام | 'svc' خدمة | 'bed' نوم)، cap: أقصى عدد وحدات، opt: يجوز أن تخلو.
 */
export const Z = (id, o = {}) => ({ t: 'zone', id, axis: o.axis || 'y', corr: o.corr || null, front: !!o.front, pref: o.pref || [], cap: o.cap || 9, opt: !!o.opt, empty: o.empty || 'fail', flip: !!o.flip, ...(o.minLen ? { minLen: o.minLen } : {}), ...(o.noBed ? { noBed: true } : {}) });
export const isZone = n => n && n.t === 'zone';

/** وحدات البرنامج لكل دور. floors: 1 → 's'؛ 2 → 'g' و'u' بقاعدة التقسيم المعتادة (ضيافة وخدمة أرضًا، نوم علوًا). */
export function unitsOf(P, lv, floors, { flip = false, rules = null } = {}) {
  const U = [], add = (kind, make, extra = {}) => U.push({ kind, make, ...extra });
  const ground = lv !== 'u', upper = lv !== 'g';
  const wantsBedGround = b => b.elderly || b.guest;
  if (ground) {
    if (P.men) add('men', o => menUnit(P.men, P, { ...o, flip }));
    if (P.women) add('women', o => womenUnit(P.women, P, { ...o, flip: !flip }));
    P.majlisExtra.forEach(b => add('svc', o => womenUnit(b, P, o)));
    const k0 = P.kitchens[0], d0 = P.dining[0];
    if (k0 || d0) add('dine', o => dineUnit(d0, k0, P, { ...o, flip }));
    for (const d of P.dining.slice(1)) add('svc', o => simpleUnit(d, 'dining', P));
    for (const k of P.kitchens.slice(1)) add('svc', o => simpleUnit(k, 'kitchen', P));
    if (P.maid) add('maid', o => serviceUnit(P.maid, 'maid', P, o));
    if (P.driver) add('driver', o => serviceUnit(P.driver, 'driver', P, o));
    if (P.office) add('office', o => simpleUnit(P.office, 'office', P));
    if (P.prayer) add('prayer', o => simpleUnit(P.prayer, 'prayer', P));
  }
  const fam = P.family.slice();
  if (floors === 2) {
    if (upper) for (const b of P.beds) { if (wantsBedGround(b) && ground) continue; add(b.master ? 'master' : 'bed', o => suiteUnit(b, P, { ...o, flip: flip ^ !!o.flip }), { b }); }
    if (ground) for (const b of P.beds.filter(wantsBedGround)) add(b.master ? 'master' : 'bed', o => suiteUnit(b, P, o), { b, ground: true });
    for (const f of fam.slice(1)) if (ground) add('svc', o => familyUnit(f, P));
  } else {
    for (const b of P.beds) add(b.master ? 'master' : 'bed', o => suiteUnit(b, P, { ...o, flip: flip ^ !!o.flip }), { b });
    for (const f of fam) add('family', o => familyUnit(f, P));
  }
  return U;
}

const classOf = u => ['bed', 'master'].includes(u.kind) ? 'bed' : ['men', 'women', 'dine', 'family'].includes(u.kind) ? u.kind : 'svc';

const PRI = { men: 0, women: 1, dine: 2, family: 3, maid: 4, driver: 5, office: 6, prayer: 7, svc: 8, bed: 9, master: 10 };
const CLS = { men: 'guest', women: 'guest', dine: 'guest', family: 'guest', maid: 'svc', driver: 'svc', office: 'svc', prayer: 'svc', svc: 'svc', bed: 'bed', master: 'bed' };
const noise = (seed, a, b) => { let h = 2166136261 ^ seed; for (const c of a + '|' + b) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const lenOf = (u, z) => { const I = iv(u.make({ along: z.axis, zone: z.id }).node); return z.axis === 'x' ? I.w[0] : I.h[0]; };

/**
 * يوزّع وحدات الدور على المناطق: أولًا وحدة لكل منطقة لازمة (الأنسب بفئتها)، ثم باقي الوحدات الأثقل فالأخف على المنطقة الأقل حملًا
 * بعد تفضيل فئتها؛ seed يغيّر الكسور والترتيب فيعطي توزيعات مختلفة. مجلس الرجال لا يقع إلا في منطقة تلامس الواجهة،
 * والرئيسية تُبعد عن الواجهة ما أمكن. يعيد { by, unplaced }.
 */
export function assign(units, zones, lv, seed = 0) {
  const by = Object.fromEntries(zones.map(z => [z.id, []])), load = Object.fromEntries(zones.map(z => [z.id, 0])), unplaced = [];
  const ok = (u, z) => by[z.id].length < z.cap && !(u.kind === 'men' && !z.front) && !(z.noBed && CLS[u.kind] === 'bed');
  const score = (u, z) => load[z.id] + lenOf(u, z) + (z.pref.length && !z.pref.includes(CLS[u.kind]) ? 6 : 0) + (u.kind === 'master' && z.front ? 5 : 0) + (seed ? 4 * noise(seed, u.kind + (u.b?.id || ''), z.id) : 0);
  const put = (u, z) => { by[z.id].push(u); load[z.id] += lenOf(u, z); };
  const pool = [...units].sort((a, b) => PRI[a.kind] - PRI[b.kind]);
  // وحدة أولى لكل منطقة لازمة
  for (const z of zones.filter(z => !z.opt && z.empty === 'fail')) {
    const cands = pool.filter(u => ok(u, z) && (!z.pref.length || z.pref.includes(CLS[u.kind]))); if (!cands.length) continue;
    const best = cands.sort((a, b) => (seed ? noise(seed, a.kind, z.id) - noise(seed, b.kind, z.id) : 0) || PRI[a.kind] - PRI[b.kind])[0];
    pool.splice(pool.indexOf(best), 1); put(best, z);
  }
  for (const u of pool) {
    const zs = zones.filter(z => ok(u, z)).sort((a, b) => score(u, a) - score(u, b));
    if (!zs.length) { unplaced.push(u); continue; }
    put(u, zs[0]);
  }
  for (const z of zones) by[z.id].sort((a, b) => PRI[a.kind] - PRI[b.kind]);
  return { by, unplaced };
}

/** شجرة محتوى منطقة: الوحدات على محور المنطقة + شريط الممر إن وُجد. */
export function zoneTree(z, units, { flipUnits = false, lv = 's', pad = true } = {}) {
  if (!units.length) return null;
  const along = z.axis, built = units.map((u, i) => u.make({ along, flip: flipUnits ^ (z.flip ? 1 : 0) ^ (i % 2) , zone: z.id }));
  const nodes0 = built.map(b => b.node), padN = pad && z.pad !== false ? padLeaf(z.id, lv, along) : null;
  const body = along === 'x' ? X(...nodes0, padN) : Y(...nodes0, padN);
  let node = body;
  if (z.corr) {
    const c = corrLeaf('corr:' + z.id, along === 'x' ? 'x' : 'y', { min: z.minLen || 3 });
    node = along === 'x' ? Y(z.corr === 'y0' ? [c, body] : [body, c]) : X(z.corr === 'x0' ? [c, body] : [body, c]);
  }
  return { node, built };
}

const ivMerge = (a, b) => { if (!a) return b; if (!b) return a; const mn = Math.max(a[0], b[0]), mx = Math.min(a[2], b[2]); return [mn, Math.min(Math.max((a[1] + b[1]) / 2, mn), Math.max(mx, mn)), Math.max(mx, mn), Math.min(a[3], b[3])]; };

/**
 * يُنشئ تصميمًا من هيكل مرجعي. sk: { tree (فيه عقد Z وأوراق الحركة)، zones:[Z...], core:{ids} }.
 * يعيد { ok, why, levels:[{lv, layout}], meta } أو { ok:false, why }.
 */
export function instantiate(sk, P, { floors = 1, envW, envH, mode = 'max', flipUnits = false, upperFamily = null, flipGuest = false, split = 0, padOff = [] } = {}) {
  const opts = { padOff };
  const lvs = floors === 2 ? ['g', 'u'] : ['s'], zones = sk.zones;
  const contents = {}, builtBy = {}; const unplaced = [];
  for (const lv of lvs) {
    const units = unitsOf(P, lv, floors, { flip: flipGuest });
    const { by, unplaced: up } = assign(units, zones, lv, split);
    if (up.length) unplaced.push(...up.map(u => u.kind));
    for (const z of zones) { const t = zoneTree(z, by[z.id], { flipUnits, lv, pad: !(opts.padOff || []).includes(z.id) }); (contents[lv] ||= {})[z.id] = t; }
  }
  if (unplaced.length) return { ok: false, why: 'unplaced:' + [...new Set(unplaced)].join(',') };
  // حدود المناطق المشتركة بين الدورين
  const joint = {}, fixedEmpty = {};
  for (const z of zones) {
    let w = null, h = null, any = false;
    for (const lv of lvs) { const t = contents[lv][z.id]; if (!t) continue; any = true; const I = iv(t.node); w = ivMerge(w, I.w); h = ivMerge(h, I.h); if (I.bad) return { ok: false, why: 'zone-conflict:' + z.id }; }
    if (!any) { if (z.empty === 'fail') return { ok: false, why: 'empty-zone:' + z.id }; fixedEmpty[z.id] = true; continue; }
    if (w[0] > w[2] + 1e-6 || h[0] > h[2] + 1e-6) return { ok: false, why: 'levels-conflict:' + z.id };
    joint[z.id] = L('Z:' + z.id, w, h, { zoneId: z.id });
  }
  const mapTree = n => {
    if (isZone(n)) return fixedEmpty[n.id] ? (n.empty === 'yard' ? courtLeaf('yard:' + n.id, [2.5, 4, 14], [2.5, 4, 14], { name: 'ساحة خارجية', sink: 1, trees: false, court: false }) : null) : joint[n.id];
    if (n.t === 'leaf') return n;
    return { ...n, k: n.k.map(mapTree).filter(Boolean) };
  };
  const tree = mapTree(sk.tree);
  const I = iv(tree);
  if (I.bad) return { ok: false, why: 'tree-conflict:' + badPath(tree) };
  if (envW < I.w[0] - 1e-6 || envH < I.h[0] - 1e-6) return { ok: false, why: `small:${r2(I.w[0])}x${r2(I.h[0])}`, need: [I.w[0], I.h[0]] };
  const pick = (a, avail) => mode === 'pref' ? Math.min(avail, a[1]) : mode === 'mid' ? Math.min(avail, (a[1] + a[2]) / 2) : Math.min(avail, a[2]);
  const W = snap(Math.max(I.w[0], pick(I.w, envW))), D = snap(Math.max(I.h[0], pick(I.h, envH)));
  const top = solve(tree, W, D);
  if (top.viol > .02) return { ok: false, why: 'solve-violation:' + r2(top.viol) };
  { // حشوات صغيرة (أقل من 1.6 م) ليست غرفًا نافعة: تُزال ويُعاد الحل
    const tiny = [];
    for (const l of top.leaves) if (l.node.zoneId) { const z = zones.find(q => q.id === l.node.zoneId); if (!z) continue; for (const lv of lvs) { const t = contents[lv][z.id]; if (!t) continue; const sub = solve(t.node, l.x1 - l.x0, l.y1 - l.y0, l.x0, l.y0); const pd = sub.leaves.find(s => s.node.pad); if (pd) { const sz = z.axis === 'x' ? pd.x1 - pd.x0 : pd.y1 - pd.y0; if (sz < 1.6 && !padOff.includes(z.id)) tiny.push(z.id); } } }
    if (tiny.length) return instantiate(sk, P, { floors, envW, envH, mode, flipUnits, upperFamily, flipGuest, split, padOff: [...padOff, ...tiny] });
  }
  const rectOf = new Map(top.leaves.map(l => [l.node.id, l]));
  const levels = [];
  for (const lv of lvs) {
    const rooms = [], links = [], accesses = [], upper = lv === 'u';
    const push = (r, node, extra = {}) => { const o = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, id: node.id, type: node.type, name: node.name, kind: node.kind, ...(node.circ ? { circ: true, ckind: node.ckind } : {}), ...(node.zone ? { zone: node.zone } : {}), ...(node.master ? { master: true } : {}), ...(node.men ? { men: true } : {}), ...(node.women ? { women: true } : {}), ...(node.trees ? { trees: true } : {}), ...(node.fenceH ? { fenceH: node.fenceH } : {}), ...(node.outdoor ? { outdoor: true, court: !!node.court } : {}), ...extra }; rooms.push(o); return o; };
    for (const l of top.leaves) {
      const n = l.node;
      if (n.zoneId) {
        const t = contents[lv][n.zoneId];
        if (!t) { if (lv === 'g' && lvs.includes('u') && contents.u[n.zoneId]) return { ok: false, why: 'overhang:' + n.zoneId }; push(l, courtLeaf('roof:' + n.zoneId, [1, 1, 1], [1, 1, 1], { name: upper ? 'تراس علوي' : 'ساحة خارجية', sink: 0, trees: false, court: false }), { type: upper ? 'balcony' : 'courtyard', kind: 'terrace', roof: true }); continue; }
        const sub = solve(t.node, l.x1 - l.x0, l.y1 - l.y0, l.x0, l.y0);
        if (sub.viol > .06) return { ok: false, why: 'zone-violation:' + n.zoneId + ':' + r2(sub.viol) };
        for (const s of sub.leaves) { if (s.node.pad && (s.x1 - s.x0 < 1.6 || s.y1 - s.y0 < 1.6)) continue; push(s, s.node); }
        for (const b of t.built) { links.push(...b.links); accesses.push(...b.access.map(a => ({ ...a, unit: b.kind }))); }
        continue;
      }
      if (['foyer', 'hall', 'stair'].includes(n.id)) continue;
      push(l, n);
    }
    // الحركة الرأسية: القلب (مدخل، صالة، سلم) ← يُنشأ من أوراق الهيكل
    const core = sk.core || {};
    for (const key of ['foyer', 'hall', 'stair']) {
      const lf = rectOf.get(key); if (!lf) continue;
      if (lv === 'u' && key === 'stair') { push(lf, { ...lf.node, name: 'السلم' }); continue; }
      if (lv === 'u' && key === 'foyer') continue; // يُدمج في الصالة العلوية
      push(lf, lf.node);
    }
    if (lv === 'u') {
      const f = rectOf.get('foyer'), h = rectOf.get('hall');
      if (f && h) {
        const same = Math.abs(f.x0 - h.x0) < 1e-3 && Math.abs(f.x1 - h.x1) < 1e-3 && (Math.abs(f.y1 - h.y0) < 1e-3 || Math.abs(h.y1 - f.y0) < 1e-3);
        const hr = rooms.find(r => r.id === 'hall');
        if (same && hr) { hr.x0 = Math.min(f.x0, h.x0); hr.x1 = Math.max(f.x1, h.x1); hr.y0 = Math.min(f.y0, h.y0); hr.y1 = Math.max(f.y1, h.y1); }
        else if (!same) { rooms.push({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, id: 'foyer', type: 'corridor', name: 'ممر الصالة', kind: 'corr', circ: true, ckind: 'corr' }); }
      }
      const hr = rooms.find(r => r.id === 'hall'); if (hr) hr.name = upperFamily || 'الصالة العلوية';
    }
    if (lv !== 'u') { const fr = rooms.find(r => r.id === 'foyer'); if (fr) links.push(sk.entryVia ? { a: 'foyer', b: sk.entryVia, kind: 'door2', w: 1.6, flags: { entry: true } } : { a: 'foyer', entry: true, side: 'y0', kind: 'door2', w: 1.6 }); }
    // خارج الغلاف: ساحات الهيكل (فناء/ساحة) تُرسم غرفًا مكشوفة
    levels.push({ lv, rooms, links, accesses, upper });
  }
  return { ok: true, W, D, levels, tree, meta: { floors, mode } };
}

// ------------------------------------------------------------------------------------------ الأبواب والروابط
const CIRC_ORDER = { hall: 0, corr: 1, foyer: 2, stair: 9, women: 3, men: 8 };
/**
 * يحوّل روابط الوحدات وطلبات الوصول إلى أبواب فعلية على الحدود المشتركة، ويربط الممرات بالصالة/المدخل.
 * يعيد { doors, missing } (missing: روابط لا حدّ مشترك لها يتسع → يُرفض الترتيب إن كانت إلزامية).
 */
export function wireLevel(level, { W, D, prefs = {} }) {
  const { rooms, upper } = level, byId = new Map(rooms.map(r => [r.id, r])), links = [...level.links.filter(l => byId.has(l.a) && (l.entry || byId.has(l.b)))], missing = [];
  const circs = rooms.filter(r => r.circ);
  // الوصول: كل غرفة تطلب باب حركة
  const accessOf = new Map();
  for (const a of level.accesses) {
    let done = false;
    for (const id of [a.id, ...(a.alt || [])]) {
      const r = byId.get(id); if (!r) continue;
      const cands = circs.filter(c => c.id !== r.id && !(a.avoid || []).includes(c.ckind) && (a.prefer || ['hall', 'corr']).includes(c.ckind)).map(c => ({ c, e: sharedEdge(r, c) })).filter(x => x.e && x.e.to - x.e.from >= Math.min(a.w || .95, 1.0) + .5);
      cands.sort((p, q) => (a.prefer || []).indexOf(p.c.ckind) - (a.prefer || []).indexOf(q.c.ckind) || (q.e.to - q.e.from) - (p.e.to - p.e.from));
      if (!cands.length) continue;
      const ov = cands[0].e.to - cands[0].e.from;
      links.push({ a: id, b: cands[0].c.id, kind: a.kind || 'door', w: Math.max(.8, Math.min(a.w || .95, ov - .55)) });
      accessOf.set(id, cands[0].c.id); done = true; break;
    }
    if (!done && !a.optional) missing.push({ a: a.id, why: 'no-circ', unit: a.unit });
  }
  // ربط الحركة: ممرات ← صالة/مدخل/ممر؛ صالة ← مدخل؛ سلم ← صالة
  const link = (a, b, kind = 'arch', w = 1.5) => links.push({ a, b, kind, w });
  const hall = byId.get('hall'), foyer = byId.get('foyer'), stair = byId.get('stair');
  if (hall && foyer && !upper && sharedEdge(hall, foyer)) link('foyer', 'hall', 'arch', Math.min(2.4, sharedEdge(hall, foyer).to - sharedEdge(hall, foyer).from - .5));
  if (hall && foyer && upper && byId.get('foyer')?.type === 'corridor' && sharedEdge(hall, foyer)) link('foyer', 'hall', 'arch', 1.6);
  if (stair && hall && sharedEdge(stair, hall)) link('stair', 'hall', 'arch', Math.min(2.0, sharedEdge(stair, hall).to - sharedEdge(stair, hall).from - .5));
  else if (stair && foyer && sharedEdge(stair, foyer) && !upper) link('stair', 'foyer', 'arch', 1.6);
  else if (stair && !upper) missing.push({ a: 'stair', why: 'stair-unreachable' });
  const hubs = ['hall', 'foyer'].map(i => byId.get(i)).filter(Boolean);
  for (const c of circs.filter(c => c.ckind === 'corr' && c.id.startsWith('corr:'))) {
    const to = [...hubs, ...circs.filter(o => o.ckind === 'corr' && o !== c)].map(o => ({ o, e: sharedEdge(c, o) })).filter(x => x.e && x.e.to - x.e.from >= 1.15).sort((p, q) => (p.o.ckind === 'hall' ? -1 : 0) - (q.o.ckind === 'hall' ? -1 : 0) || (q.e.to - q.e.from) - (p.e.to - p.e.from))[0];
    if (to) link(c.id, to.o.id, 'arch', Math.min(1.4, to.e.to - to.e.from - .3)); else missing.push({ a: c.id, why: 'corr-isolated' });
  }
  // الفراغات المكشوفة (فناء/ساحة/تراس): باب أو منزلق واحد على الأقل من أنسب جار (صالة ثم ممر ثم غرفة معيشة/عائلة ثم غيرها)
  for (const o of rooms.filter(r => r.kind === 'terrace' || r.outdoor)) {
    if (links.some(l => l.a === o.id || l.b === o.id)) continue;
    const rank = r => (r.ckind === 'hall' ? 0 : r.ckind === 'corr' ? 1 : r.type === 'living' || r.type === 'dining' ? 2 : r.type === 'majlis' ? 4 : r.type === 'bedroom' || r.type === 'master' ? 5 : r.type === 'bath' ? 9 : 3);
    const c = rooms.filter(r => r.id !== o.id && r.kind !== 'terrace' && !r.outdoor && r.type !== 'stairs' && r.type !== 'bath').map(r => ({ r, e: sharedEdge(o, r) })).filter(x => x.e && x.e.to - x.e.from >= 1.1).sort((p, q) => rank(p.r) - rank(q.r) || (q.e.to - q.e.from) - (p.e.to - p.e.from))[0];
    if (c) links.push({ a: o.id, b: c.r.id, kind: c.e.to - c.e.from >= 2.2 ? 'slider' : 'door', w: Math.min(c.e.to - c.e.from >= 2.2 ? 1.8 : 1.0, c.e.to - c.e.from - .5) });
    else missing.push({ a: o.id, why: 'outdoor-isolated', optional: true });
  }
  // مداخل خارجية للعائلة/الخدمة: من روابط entry المسجلة (الرجال، المدخل). مجلس النساء: باب جانبي اختياري
  const dr = deriveDoors(rooms, links.map(l => (l.optional ? { ...l } : l)), { W, D });
  for (const m of dr.missing) if (!m.optional) missing.push({ a: m.a, b: m.b, why: 'door-missing', entry: !!m.entry });
  tagDoorSides(rooms, dr.doors);
  return { doors: dr.doors, missing, accessOf };
}
