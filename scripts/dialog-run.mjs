// أداة إثبات الحوار (شرط المالك): فهم الطلبات العربية الطويلة، والتعديلات المتتابعة، وإثبات عدم تغيير ما لم يُطلب.
// الاستعمال: node scripts/dialog-run.mjs <stage> [--only <نمط المعرّفات>] [--no-png]
// المخرجات: evidence/dialog/<stage>/{long/<id>.json, sessions/<id>/turn-N.json + doc-N.json + turn-N.png, summary.json}
// كل شيء يُقاس من المستند نفسه (المسقط الناتج)، لا من سجل المطابقة (ledger) الذي يكتبه النظام عن نفسه؛ والسجل
// يُحفظ بجانب القياس لكشف أي فرق بين ما يقوله النظام وما في المخطط.
// المولّد: ما يستعمله dist/ افتراضيًا (generateInitialDesign بلا engine ← المولّد الثاني).
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LONG, SESSIONS } from './dialog-cases.mjs';
import { extractRequirements, coverage, detectConflicts, normalizeAr } from '../dist/requirements.mjs';
import { generateInitialDesign, interpretFree } from '../dist/home-flow.mjs';
import { createSession, redesign, currentDoc } from '../dist/design-session.mjs';
import { docRooms, doorInfo } from '../dist/rules.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { serialize, parseDoc } from '../dist/draw/doc.mjs';

const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
// الحدود (من التكليف): تغيّر مساحة غرفة لم تُطلب > 5٪ أو إزاحة مركزها > 0.5 م = مخالفة
export const THRESHOLDS = Object.freeze({ areaPct: 5, shift: .5 });

// ------------------------------------------------------------------------------------------ فهم الطلبات الطويلة
const OPP = { front: 'back', back: 'front', right: 'left', left: 'right', n: 's', s: 'n', e: 'w', w: 'e' };
const RIGHT = { s: 'e', n: 'w', e: 'n', w: 's' }, CMP_OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
/** الجهة النسبية (أمام/خلف/يمين/يسار الداخل) ← جهة مطلقة بحسب المدخل الأول. */
export const absSide = (side, entry) => side === 'front' ? entry : side === 'back' ? CMP_OPP[entry] : side === 'right' ? RIGHT[entry] : side === 'left' ? CMP_OPP[RIGHT[entry]] : side;
const pair = (a, b) => [a, b].sort().join('+');
/** قاعدة مستخرجة ← بند ذرّي مقارن. النفي («لا يطل على…» أو منع الجهة المقابلة) يصير «!جهة». */
export function ruleItem(r, entry) {
  if (r.kind === 'place') {
    if (r.side === 'center') return `place:${r.a}:center`;
    let side = r.side, neg = r.mode === 'avoid';
    // النفي على منطقة («ما يكون المطبخ في الأمام») يُخزَّن جهةً مقابلة بدرجة منع: نعيده إلى صيغته الأصلية
    if (!neg && r.level === 'forbid' && r.mode === 'half' && OPP[side]) { neg = true; side = OPP[side]; }
    return `place:${r.a}:${neg ? '!' : ''}${absSide(side, entry)}`;
  }
  if (r.kind === 'floor') return `floor:${r.a}:${r.floor}`;
  if (r.kind === 'adjacent' || r.kind === 'near') return `close:${pair(r.a, r.b)}`;
  if (r.kind === 'far' || r.kind === 'apart') return `away:${pair(r.a, r.b)}`;
  if (r.kind === 'cluster') return `cluster:${r.a}`;
  return `${r.kind}:${r.a}${r.b ? '+' + r.b : ''}`;
}
const normExpRule = s => { const m = s.match(/^(close|away):(.+)\+(.+)$/); return m ? `${m[1]}:${pair(m[2], m[3])}` : s; };
const UNSUP = [['garage', /الكراج/], ['pool', /المسبح/], ['annex', /الملحق/], ['roof', /السطح/], ['balcony', /الشرفات/], ['elevator', /المصعد/], ['basement', /القبو/], ['courtyard', /الفناء/], ['site', /شكل الأرض/]];
const fmt = v => String(r2(v));
const COUNT_KEYS = ['bedrooms', 'majlis', 'kitchens', 'dining', 'baths'];

/** البنود المستخرجة من الطلب (X)، بنفس صيغة البنود المتوقعة. */
export function extractedItems(req, land, conflicts, expectUnclear = []) {
  const entry = land.entries?.[0] || 's', X = new Map(); // item -> تفصيل (مثل الدرجة)
  for (const k of COUNT_KEYS) if (Number.isInteger(req.counts?.[k])) X.set(`count:${k}=${req.counts[k]}`, null);
  for (const [k, v] of Object.entries(req.prefs || {})) {
    if (k === 'floors') continue;
    if (k === 'openKitchen') { X.set(v ? 'pref:openKitchen' : 'pref:closedKitchen', null); continue; }
    if (v === true) X.set(`pref:${k}`, null);
  }
  if (typeof req.tweaks?.envScale === 'number' && req.tweaks.envScale < 1) X.set('pref:economy', null);
  for (const [k, v] of Object.entries(req.extras || {})) { if (!v) continue; X.set(`extra:${k}`, null); if (v && typeof v === 'object') { if (v.bath) X.set(`extra:${k}.bath`, null); if (v.ext) X.set(`extra:${k}.ext`, null); } }
  for (const k of req.absent || []) X.set(`absent:${k}`, null);
  for (const [k, d] of Object.entries(req.dims || {})) X.set(`dim:${k}=${fmt(Math.min(d.w, d.l))}x${fmt(Math.max(d.w, d.l))}`, null);
  for (const [k, a] of Object.entries(req.areas || {})) if (!req.dims?.[k]) X.set(`area:${k}=${fmt(a)}`, null);
  for (const r of req.rules || []) { const it = 'rule:' + ruleItem(r, entry); if (!X.has(it)) X.set(it, { level: r.level, quote: r.quote || r.text }); }
  if (req.prefs?.floors) X.set(`floors=${req.prefs.floors}`, null);
  const fac = req.tweaks?.facade; if (fac) { if (fac.material) X.set(`facade:${fac.material}`, null); if (fac.style) X.set(`facade:${fac.style}`, null); }
  for (const u of req.unsupported || []) for (const [k, re] of UNSUP) if (re.test(u)) X.set(`unsupported:${k}`, null);
  for (const c of conflicts || []) X.set(`conflict:${c.type}`, { question: c.question_ar });
  const unc = (req.unclear || []).map(normalizeAr);
  for (const p of expectUnclear) if (unc.some(u => u.includes(normalizeAr(p)))) X.set(`unclear:${p}`, null);
  return X;
}
/** البنود المتوقعة (E) من الفهم المكتوب بيد إنسان. */
export function expectedItems(e) {
  const E = new Map();
  for (const [k, v] of Object.entries(e.counts || {})) E.set(`count:${k}=${v}`, null);
  for (const p of e.prefs || []) E.set(`pref:${p}`, null);
  for (const x of e.extras || []) E.set(`extra:${x}`, null);
  for (const a of e.absent || []) E.set(`absent:${a}`, null);
  for (const [k, [w, l]] of Object.entries(e.dims || {})) E.set(`dim:${k}=${fmt(Math.min(w, l))}x${fmt(Math.max(w, l))}`, null);
  for (const [k, a] of Object.entries(e.areas || {})) E.set(`area:${k}=${fmt(a)}`, null);
  for (const r of e.rules || []) E.set('rule:' + normExpRule(r.r), { level: r.level });
  if (e.floors) E.set(`floors=${e.floors}`, null);
  for (const f of e.facade || []) E.set(`facade:${f}`, null);
  for (const u of e.unsupported || []) E.set(`unsupported:${u}`, null);
  for (const c of e.conflicts || []) E.set(`conflict:${c}`, null);
  for (const u of e.unclear || []) E.set(`unclear:${u}`, null);
  return E;
}
const FIELD = it => { const f = it.split(/[:=]/)[0]; return f === 'dim' || f === 'area' ? 'dims' : f; };
export const FIELDS = ['count', 'pref', 'extra', 'absent', 'dims', 'rule', 'floors', 'facade', 'unsupported', 'conflict', 'unclear'];
/** دقة واستدعاء لكل حقل، ومجموع F1، والبنود الفائتة والمضافة خطأً. البنود الاختيارية لا تُحتسب. */
export function score(E, X, optional = []) {
  const opt = it => optional.some(o => it === o || it.startsWith(o + '=') || (o.startsWith('rule:') && it === 'rule:' + normExpRule(o.slice(5))));
  const tp = [...E.keys()].filter(k => X.has(k)), fn = [...E.keys()].filter(k => !X.has(k)), fp = [...X.keys()].filter(k => !E.has(k) && !opt(k));
  const per = {};
  for (const f of FIELDS) {
    const T = tp.filter(k => FIELD(k) === f).length, N = fn.filter(k => FIELD(k) === f).length, P = fp.filter(k => FIELD(k) === f).length;
    per[f] = { tp: T, fn: N, fp: P, precision: T + P ? r3(T / (T + P)) : null, recall: T + N ? r3(T / (T + N)) : null };
  }
  const T = tp.length, P = fp.length, N = fn.length, precision = T + P ? T / (T + P) : 1, recall = T + N ? T / (T + N) : 1;
  // درجة كل قاعدة طابقت: هل فُهمت «لازم/يفضل/ممنوع» كما قالها العميل؟ (النفي يقبل must أو forbid)
  const levels = tp.filter(k => FIELD(k) === 'rule' && E.get(k)?.level).map(k => { const want = E.get(k).level, got = X.get(k)?.level; const ok = want === got || (k.includes(':!') && ['must', 'forbid'].includes(want) && ['must', 'forbid'].includes(got)) || (k.startsWith('rule:away:') && want === 'forbid' && got === 'forbid'); return { item: k, want, got, ok }; });
  return { per, precision: r3(precision), recall: r3(recall), f1: r3(precision + recall ? 2 * precision * recall / (precision + recall) : 0), tp, missed: fn, wrong: fp, levels, levelAccuracy: levels.length ? r3(levels.filter(l => l.ok).length / levels.length) : null };
}
const words = t => t.trim().split(/\s+/).filter(Boolean).length;

/** حالة طلب طويل: الفهم المحلي كما في الموقع (interpretFree ثم extractRequirements)، ثم المقارنة والتغطية والتعارضات. */
export async function runLong(C) {
  const land = { floors: 1, ...C.land }, t0 = performance.now();
  // الفهم المحلي للأعداد كما في الموقع؛ إن رمى (مثل «راجع مساحة مجلس») فالموقع يعرض الخطأ ولا يكمل —
  // نسجّله كما هو، ونكمل القياس بلا أعداد مسبقة لنقيس المحلل نفسه
  let free = { counts: {} }, interpretError = null;
  try { free = await interpretFree(C.text); } catch (e) { interpretError = e.message; }
  const req = extractRequirements(C.text, { counts: free.counts });
  let conflicts = []; try { conflicts = detectConflicts(req, land); } catch (e) { conflicts = [{ type: 'error', question_ar: e.message }]; }
  const cov = coverage(C.text, req);
  const E = expectedItems(C.expect), X = extractedItems(req, land, conflicts, C.expect.unclear || []);
  const S = score(E, X, C.expect.optional || []);
  const fates = cov.clauses.reduce((a, c) => (a[c.kind || c.fate] = (a[c.kind || c.fate] || 0) + 1, a), {});
  return {
    id: C.id, name: C.name, words: words(C.text), ms: Math.round(performance.now() - t0), text: C.text,
    formCounts: free.counts, interpretError, score: S,
    extracted: { counts: req.counts, prefs: req.prefs, extras: req.extras, absent: req.absent, dims: req.dims, areas: req.areas, rules: (req.rules || []).map(r => ({ item: ruleItem(r, land.entries[0]), level: r.level, levelCue: r.levelCue, quote: r.quote, text: r.text })), tweaks: req.tweaks, unsupported: req.unsupported, unclear: req.unclear, understood: req.understood },
    conflicts: conflicts.map(c => ({ type: c.type, question: c.question_ar })),
    coverage: { clauses: cov.clauses.length, fates, dropped: cov.dropped, unclearClauses: cov.clauses.filter(c => c.fate === 'unclear').map(c => c.quote) },
    expected: C.expect, traps: C.expect.traps || '',
  };
}

// ------------------------------------------------------------------------------------------ قياس المستند
/** غرف المستند المسمّاة: المعرّف والاسم والمساحة والمركز والمستطيل وعدد الأبواب والنوافذ. */
export function roomsOf(doc) {
  const A = analyzeDoc(doc), out = [];
  doc.levels.forEach((lv, li) => {
    const L = A.levelById.get(lv.id); if (!L) return;
    for (const r of L.rooms) {
      if (r.unlabelled || !r.net?.length) continue;
      let doors = 0, windows = 0, arches = 0; const links = [];
      for (const op of L.openings) for (const s of op.sides || []) if (s.room.id === r.id) { if (op.window) windows++; else if (op.door) { doors++; if (op.kind === 'arch') arches++; } if (op.door) links.push({ kind: op.kind, to: s.other === 'outside' ? 'outside' : s.other }); }
      const xs = r.net.map(q => q.x), ys = r.net.map(q => q.y);
      out.push({ id: r.id, name: r.name, type: r.type, li, ext: [...new Set((r.edges || []).filter(e => e.exterior && e.length >= 1).map(e => e.side))], area: r.area, cx: r.centroid.x, cy: r.centroid.y, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), doors, windows, arches, links });
    }
  });
  return out;
}
/** اختلاف تنظيمي (0..1) بين مخططين — منسوخ من scripts/acceptance-run.mjs (difference) ليبقى القياس نفسه. */
export function difference(a, b) {
  const A = docRooms(a), B = docRooms(b);
  const norm = (R, flip) => new Map(R.rooms.filter(r => r.area >= 6).map(r => { const w = R.B.x1 - R.B.x0, d = R.B.y1 - R.B.y0; let x = ((r.x0 + r.x1) / 2 - R.B.x0) / w; if (flip) x = 1 - x; return [r.name + '@' + r.li, { x, y: ((r.y0 + r.y1) / 2 - R.B.y0) / d }]; }));
  const one = flip => { const p = norm(A, false), q = norm(B, flip); let s = 0, n = 0; for (const [k, v] of p) { const u = q.get(k); if (!u) { s += .5; n++; continue; } s += Math.hypot(v.x - u.x, v.y - u.y) / Math.SQRT2; n++; } for (const k of q.keys()) if (!p.has(k)) { s += .5; n++; } return n ? s / n : 0; };
  return r2(Math.min(one(false), one(true)));
}
const gapOf = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));
const overlapOf = (a, b) => Math.max(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const touches = (a, b) => gapOf(a, b) <= .45 && overlapOf(a, b) >= .6;
/** يطابق غرف المخططين: بالاسم والدور، ثم الأقرب مركزًا عند تكرار الاسم (ممر الغرف، مدخل الجناح…). */
export function matchRooms(A, B) {
  const pairs = [], usedB = new Set();
  const groups = new Map(); for (const r of A) { const k = r.li + '|' + r.name; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, list] of groups) {
    const cand = B.filter(r => r.li + '|' + r.name === k);
    const all = []; for (const a of list) for (const b of cand) all.push({ a, b, d: Math.hypot(a.cx - b.cx, a.cy - b.cy) });
    all.sort((x, y) => x.d - y.d); const usedA = new Set();
    for (const { a, b } of all) if (!usedA.has(a) && !usedB.has(b)) { usedA.add(a); usedB.add(b); pairs.push([a, b]); }
  }
  const matchedA = new Set(pairs.map(p => p[0]));
  return { pairs, removed: A.filter(r => !matchedA.has(r)), added: B.filter(r => !usedB.has(r)) };
}
const inScope = (name, scope) => scope.some(re => new RegExp(re).test(name));
const MAIN = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'office', 'service']);
/** إثبات الحفظ: لكل غرفة لم يذكرها التعديل — نفس المعرّف/الاسم، فرق المساحة، إزاحة المركز، تغيّر الأبواب والنوافذ. */
export function preservation(before, after, scope) {
  const A = roomsOf(before), B = roomsOf(after), { pairs, removed, added } = matchRooms(A, B);
  const targetsBefore = A.filter(r => inScope(r.name, scope));
  const rows = pairs.map(([a, b]) => ({
    name: a.name, type: a.type, li: a.li, idBefore: a.id, idAfter: b.id, sameId: a.id === b.id, inScope: inScope(a.name, scope),
    areaBefore: r2(a.area), areaAfter: r2(b.area), areaPct: r2(100 * (b.area - a.area) / Math.max(.01, a.area)), shift: r2(Math.hypot(b.cx - a.cx, b.cy - a.cy)),
    doors: b.doors - a.doors, windows: b.windows - a.windows, arches: b.arches - a.arches,
    adjacentToTarget: targetsBefore.some(t => t !== a && touches(t, a)), main: MAIN.has(a.type),
  }));
  const violations = [];
  for (const r of rows) if (!r.inScope && (Math.abs(r.areaPct) > THRESHOLDS.areaPct || r.shift > THRESHOLDS.shift)) violations.push({ name: r.name, kind: 'moved/resized', areaPct: r.areaPct, shift: r.shift, main: r.main, adjacentToTarget: r.adjacentToTarget, idAfter: r.idAfter });
  for (const r of removed) if (!inScope(r.name, scope)) violations.push({ name: r.name, kind: 'removed', main: MAIN.has(r.type) });
  for (const r of added) if (!inScope(r.name, scope)) violations.push({ name: r.name, kind: 'added', main: MAIN.has(r.type), idAfter: r.id });
  const openingChanges = rows.filter(r => !r.inScope && (r.doors || r.windows || r.arches)).map(r => ({ name: r.name, doors: r.doors, windows: r.windows, arches: r.arches, idAfter: r.idAfter }));
  const RB = docRooms(before).B, RA = docRooms(after).B;
  return {
    rows, removed: removed.map(r => r.name), added: added.map(r => r.name), violations, openingChanges,
    mainViolations: violations.filter(v => v.main).length,
    envelope: { before: { w: r2(RB.x1 - RB.x0), d: r2(RB.y1 - RB.y0) }, after: { w: r2(RA.x1 - RA.x0), d: r2(RA.y1 - RA.y0) } },
    idsStable: rows.filter(r => r.sameId).length + '/' + rows.length,
    difference: difference(before, after),
    geometryIdentical: JSON.stringify([before.walls, before.openings, before.labels]) === JSON.stringify([after.walls, after.openings, after.labels]),
  };
}

const pick = (rooms, re) => rooms.filter(r => new RegExp(re).test(r.name));
/** فحص طلب واحد على المستند الناتج. يعيد { type, ok, measured, why }. */
export function runCheck(ck, ctx) {
  const { after, before, docs, entry, outcome } = ctx, R = roomsOf(after), P = roomsOf(before), B = docRooms(after).B;
  const one = (re, rooms = R) => pick(rooms, re)[0] || null;
  const res = (ok, measured, why = '') => ({ type: ck.type, ok: !!ok, measured, why });
  switch (ck.type) {
    case 'side': {
      const r = one(ck.room); if (!r) return res(false, null, 'الغرفة غير موجودة');
      const c = absSide(ck.side, entry), W = B.x1 - B.x0, D = B.y1 - B.y0;
      const frac = { n: (r.cy - B.y0) / D, s: (B.y1 - r.cy) / D, e: (r.cx - B.x0) / W, w: (B.x1 - r.cx) / W }[c];
      const edge = { n: B.y1 - r.y1, s: r.y0 - B.y0, e: B.x1 - r.x1, w: r.x0 - B.x0 }[c];
      // في تلك الجهة فعلًا: مركزها في نصفها، ومع ذلك تلامس واجهة المبنى من تلك الجهة (≤ 0.6 م)، أو لها جدار خارجي
      // يطل على تلك الجهة (مبنى بشكل L)، أو مركزها في الثلث الخارجي منها
      const own = r.ext.includes(c);
      return res(frac >= .5 && (edge <= .6 || own || frac >= 2 / 3), { compass: c, frac: r2(frac), edgeGap: r2(edge), exteriorWallToward: own }, frac < .5 ? 'مركز الغرفة ليس في نصف تلك الجهة' : 'في نصفها لكن لا تلامس واجهتها ولا جدار خارجي لها نحوها ولا في ثلثها الخارجي');
    }
    case 'near': {
      const as = pick(R, ck.a), bs = pick(R, ck.b); if (!as.length || !bs.length) return res(false, null, 'غرفة غير موجودة');
      let best = null; for (const a of as) for (const b of bs) { const g = gapOf(a, b), t = touches(a, b), door = a.links.some(l => l.to === b.id); if (!best || g < best.gap) best = { gap: r2(g), sharedWall: t, door }; }
      return res(ck.adjacent ? best.sharedWall : best.gap <= 3, best, ck.adjacent ? 'لا تتشاركان جدارًا' : 'المسافة بينهما أكثر من 3 م');
    }
    case 'far': {
      const a = one(ck.a), b = one(ck.b); if (!a || !b) return res(false, null, 'غرفة غير موجودة');
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      return res(!touches(a, b) && d >= (ck.min || 8), { centroidDist: r2(d), sharedWall: touches(a, b) }, `المسافة بين المركزين ${r2(d)} م (المطلوب ≥ ${ck.min || 8} م ولا جدار مشترك)`);
    }
    case 'dims': {
      const r = one(ck.room); if (!r) return res(false, null, 'الغرفة غير موجودة');
      const w = Math.min(r.x1 - r.x0, r.y1 - r.y0), l = Math.max(r.x1 - r.x0, r.y1 - r.y0), tol = ck.tol ?? .35;
      return res(Math.abs(w - ck.w) <= tol && Math.abs(l - ck.l) <= tol, { w: r2(w), l: r2(l), area: r2(r.area) }, `المقاس ${r2(w)}×${r2(l)} والمطلوب ${ck.w}×${ck.l} (±${tol})`);
    }
    case 'bigger': case 'smaller': {
      const a = one(ck.room, P), b = one(ck.room); if (!a || !b) return res(false, null, 'الغرفة غير موجودة');
      const k = b.area / a.area;
      return res(ck.type === 'bigger' ? k >= ck.factor : k <= ck.factor, { before: r2(a.area), after: r2(b.area), ratio: r2(k) }, `النسبة ${r2(k)} والمطلوب ${ck.type === 'bigger' ? '≥' : '≤'} ${ck.factor}`);
    }
    case 'sameAs': {
      const a = one(ck.room, roomsOf(docs[ck.turn])), b = one(ck.room); if (!a || !b) return res(false, null, 'الغرفة غير موجودة');
      const shift = Math.hypot(a.cx - b.cx, a.cy - b.cy), pct = 100 * (b.area - a.area) / a.area;
      return res(shift <= THRESHOLDS.shift && Math.abs(pct) <= THRESHOLDS.areaPct, { shift: r2(shift), areaPct: r2(pct) }, `بعيدة عن موضعها في الدور ${ck.turn} بـ${r2(shift)} م ومساحتها ${r2(pct)}٪`);
    }
    case 'absent': { const r = pick(R, ck.room); return res(!r.length, { found: r.map(x => x.name) }, 'الغرفة ما زالت في المخطط'); }
    case 'present': { const r = pick(R, ck.room); return res(r.length > 0, { found: r.map(x => x.name) }, 'الغرفة غير موجودة'); }
    case 'count': { const n = R.filter(r => ck.types.includes(r.type) && r.name !== 'غرفة الضيوف').length; return res(n === ck.n, { n }, `العدد ${n} والمطلوب ${ck.n}`); }
    case 'docField': { const has = JSON.stringify(after).includes(`"${ck.field}"`); return res(has, { found: has }, `المستند لا يحمل الحقل «${ck.field}»: الطلب غير ممثّل في المخطط ولا في المجسّم`); }
    case 'unchanged': { const same = JSON.stringify([before.walls, before.openings, before.labels]) === JSON.stringify([after.walls, after.openings, after.labels]); return res(same, { identical: same, difference: difference(before, after) }, 'المخطط تغيّر مع أن الطلب لا يمسّه'); }
    case 'clarify': {
      const same = JSON.stringify([before.walls, before.openings, before.labels]) === JSON.stringify([after.walls, after.openings, after.labels]);
      return res(['unclear', 'asked'].includes(outcome) && same, { outcome, unchanged: same }, outcome === 'applied' ? 'نُفّذ شيء بدل أن يُسأل العميل عن المقصود' : 'لم يُسأل العميل');
    }
    case 'openTo': case 'closedTo': {
      const a = one(ck.a), b = one(ck.b); if (!a || !b) return res(false, null, 'غرفة غير موجودة');
      const kinds = a.links.filter(l => l.to === b.id).map(l => l.kind), arch = kinds.includes('arch');
      return res(ck.type === 'openTo' ? arch : !arch, { openings: kinds, sharedWall: touches(a, b) }, ck.type === 'openTo' ? 'لا فتحة مفتوحة بينهما' : 'بينهما فتحة مفتوحة');
    }
    case 'revertDoc': {
      const d = difference(docs[ck.turn], after), na = roomsOf(docs[ck.turn]).map(r => r.name).sort().join('|'), nb = R.map(r => r.name).sort().join('|');
      return res(d <= ck.max && na === nb, { difference: d, sameRooms: na === nb }, `الفرق عن مخطط الدور ${ck.turn} = ${d} (المسموح ≤ ${ck.max})`);
    }
    case 'extAccess': {
      const r = one(ck.room); if (!r) return res(false, null, 'الغرفة غير موجودة');
      const di = doorInfo(after), own = di.extDoors(r.name), via = di.neighbors(r.name).filter(n => /^مدخل/.test(n) && /النساء/.test(n) && di.extDoors(n) > 0);
      return res(own > 0 || via.length > 0, { ownExteriorDoors: own, dedicatedEntrance: via, neighbors: di.neighbors(r.name) }, 'لا باب خارجي خاص ولا مدخل مستقل خاص بها');
    }
    default: return res(false, null, 'فحص غير معروف');
  }
}

/** جلسة تعديل متتابعة: التصميم الأول ثم كل دور، مع إثبات الحفظ وفحوص الطلب على المستند. */
export async function runSession(S, { maxTurns = Infinity } = {}) {
  const land = { floors: 1, ...S.land }, entry = land.entries[0], t0 = performance.now();
  const req = extractRequirements(S.text, { counts: S.counts }); req.counts = { ...req.counts, ...S.counts };
  const first = await generateInitialDesign({ land, counts: req.counts, requirements: req });
  let s = createSession({ land, counts: req.counts, requirements: req, result: first });
  const docs = [currentDoc(s)], pats = [s.designs[0].pat], turns = [];
  const initMs = Math.round(performance.now() - t0);
  for (let i = 0; i < Math.min(S.turns.length, maxTurns); i++) {
    const T = S.turns[i], before = docs[i], t1 = performance.now();
    let outcome = 'applied', reply = null, changes = [], error = null;
    try {
      const r = await redesign(s, { text: T.text });
      reply = r.reply; changes = r.changes;
      if (r.reply?.conflicts?.length) outcome = 'asked'; else s = r.session;
    } catch (e) { error = { code: e.code || null, message: e.message, unclear: e.unclear || [] }; outcome = e.code === 'SHARA_UNCLEAR' ? 'unclear' : 'error'; }
    const after = currentDoc(s), pat = s.designs[s.current].pat;
    docs.push(after); pats.push(pat);
    const pres = preservation(before, after, T.scope);
    // alreadyBefore: هل كان الفحص ناجحًا قبل التعديل أصلًا؟ (نجاح بلا تغيير ليس دليلًا على الفهم)
    const NOPRE = new Set(['bigger', 'smaller', 'sameAs', 'unchanged', 'clarify', 'revertDoc', 'docField']);
    const checks = T.checks.map(ck => ({ ...runCheck(ck, { after, before, docs, entry, outcome }), alreadyBefore: NOPRE.has(ck.type) ? null : runCheck(ck, { after: before, before, docs, entry, outcome }).ok }));
    const happened = checks.every(c => c.ok);
    // السجل (ما يقوله النظام عن نفسه) مقابل القياس: «نُفّذ» في السجل مع فحص راسب = ادعاء غير صحيح
    const ledgerDone = reply?.done || [], ledgerFailed = (reply?.failed || []).map(x => x.text), ledgerPending = (reply?.pending || []).map(x => x.text);
    const claimMismatch = ledgerDone.length > 0 && !happened;
    turns.push({
      n: i + 1, text: T.text, scope: T.scope, outcome, error, ms: Math.round(performance.now() - t1), understood: changes, unclear: reply?.unclear || error?.unclear || [],
      questions: reply?.questions || [], patternBefore: pats[i], patternAfter: pat, patternKept: pats[i] === pat, patternChanged: reply?.patternChanged || null,
      checks, happened, ledger: { done: ledgerDone, failed: ledgerFailed, pending: ledgerPending, unchanged: reply?.unchanged ?? null, reused: reply?.reused ?? null }, claimMismatch,
      preservation: pres, violations: pres.violations.length, mainViolations: pres.mainViolations,
    });
  }
  return { id: S.id, name: S.name, land, text: S.text, counts: S.counts, initMs, docs, turns };
}

// ------------------------------------------------------------------------------------------ الرسم (قبل/بعد)
const HARNESS = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:Tahoma}#w{display:flex;gap:0}canvas{display:block}</style></head><body><div id="w"><canvas id="a" width="1000" height="860"></canvas><canvas id="b" width="1000" height="860"></canvas></div><script type="module">
import { renderPlan, fitView, docBounds } from '/draw/editor/render2d.mjs'; import { analyzeDoc } from '/draw/digest.mjs'; import { exteriorWallIds } from '/draw/topology.mjs'; import { parseDoc } from '/draw/doc.mjs';
const one = (cv, doc, li, colors, bounds, head, sub) => { const lv = doc.levels[li], m = analyzeDoc(doc), L = m.levelById.get(lv.id), ctx = cv.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,1000,860);
  const view = fitView(bounds, 1000, 720, 30); ctx.save(); ctx.translate(0, 70);
  renderPlan(ctx, { doc, levelId: lv.id, view, W: 1000, H: 720, analysis: L ? { rooms: L.rooms, gaps: [], exteriorWallIds: exteriorWallIds(L.analysis) } : null, flags: { grid: false, dims: true, areas: true, fixtures: false, underlay: false, roomDims: true }, roomFill: rm => colors[rm.id] || '#f3f1ec' }); ctx.restore();
  ctx.fillStyle = '#1d2a24'; ctx.textAlign = 'right'; ctx.font = 'bold 24px Tahoma'; ctx.fillText(head, 980, 34); ctx.font = '17px Tahoma'; ctx.fillText(sub, 980, 60);
  ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(cv.id === 'a' ? 0 : 999, 0); ctx.lineTo(cv.id === 'a' ? 0 : 999, 860); ctx.stroke(); };
window.drawPair = (rawA, rawB, li, cA, cB, hA, hB, sA, sB, foot) => { const A = parseDoc(rawA), B = parseDoc(rawB);
  const ba = docBounds(A, A.levels[li].id), bb = docBounds(B, B.levels[li]?.id || B.levels[0].id), u = { x0: Math.min(ba.x0, bb.x0) - 1.5, y0: Math.min(ba.y0, bb.y0) - 1.5, x1: Math.max(ba.x1, bb.x1) + 1.5, y1: Math.max(ba.y1, bb.y1) + 1.5 };
  // RTL: «قبل» على اليمين و«بعد» على اليسار
  // الصفحة RTL: اللوحة الأولى (a) على اليمين = «قبل»، والثانية (b) على اليسار = «بعد»
  one(document.getElementById('a'), A, li, cA, u, hA, sA); one(document.getElementById('b'), B, Math.min(li, B.levels.length - 1), cB, u, hB, sB);
  for (const id of ['a', 'b']) { const ctx = document.getElementById(id).getContext('2d'); ctx.fillStyle = '#333'; ctx.font = '15px Tahoma'; ctx.textAlign = 'right'; ctx.fillText(id === 'b' ? foot : 'أزرق: ما طلبه العميل · أحمر: تغيّر دون طلب (> 5٪ مساحة أو > 0.5 م إزاحة) · برتقالي: تغيّرت فتحاته فقط', 980, 845); }
  return true; };
window.ready = true;</script></body></html>`;
const C_TARGET = '#9cc3f0', C_VIOL = '#f19a9a', C_OPEN = '#f5c77a';
async function renderAll(jobs, distRoot) {
  if (!jobs.length) return;
  const http = await import('node:http'), { readFile } = await import('node:fs/promises'), { existsSync } = await import('node:fs'), { join, normalize, extname } = await import('node:path');
  const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer(async (rq, rs) => {
    const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
    if (p === '/__d.html') { rs.writeHead(200, { 'content-type': MIME['.html'] }); return rs.end(HARNESS); }
    const f = normalize(join(distRoot, p)); if (!f.startsWith(distRoot) || !existsSync(f)) { rs.writeHead(404); return rs.end('nf'); }
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(await readFile(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await br.newContext({ viewport: { width: 2000, height: 860 } })).newPage();
  page.on('pageerror', e => console.error('خطأ في صفحة الرسم:', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__d.html`); await page.waitForFunction(() => window.ready);
  for (const j of jobs) { await page.evaluate(a => window.drawPair(...a), [j.a, j.b, j.li, j.cA, j.cB, j.hA, j.hB, j.sA, j.sB, j.foot]); await page.locator('#w').screenshot({ path: j.path }); }
  await br.close(); server.close();
}
function renderJobs(sess, dir) {
  const jobs = [];
  sess.turns.forEach((t, i) => {
    const A = sess.docs[i], B = sess.docs[i + 1], cA = {}, cB = {};
    for (const r of roomsOf(A)) if (inScope(r.name, t.scope)) cA[r.id] = C_TARGET;
    for (const r of roomsOf(B)) if (inScope(r.name, t.scope)) cB[r.id] = C_TARGET;
    for (const o of t.preservation.openingChanges) if (o.idAfter) cB[o.idAfter] = C_OPEN;
    for (const v of t.preservation.violations) if (v.idAfter) cB[v.idAfter] = C_VIOL;
    const verdict = `${t.happened ? 'تحقق الطلب (مقيس)' : 'لم يتحقق الطلب (مقيس)'} · مخالفات الحفظ: ${t.violations} · ${t.outcome === 'unclear' ? 'شرعاء: لم أفهم' : t.outcome === 'asked' ? 'شرعاء سألت' : t.outcome === 'error' ? 'خطأ' : 'نُفّذ'}`;
    for (let li = 0; li < Math.max(A.levels.length, B.levels.length); li++)
      jobs.push({ path: `${dir}turn-${t.n}${A.levels.length > 1 ? '-L' + (li + 1) : ''}.png`, a: serialize(A), b: serialize(B), li: Math.min(li, A.levels.length - 1), cA, cB, hA: `${sess.id} — قبل الدور ${t.n}`, hB: `بعد: «${t.text}»`, sA: `النمط ${t.patternBefore || '-'}`, sB: `النمط ${t.patternAfter || '-'} · الفرق ${t.preservation.difference}`, foot: verdict });
  });
  return jobs;
}

// ------------------------------------------------------------------------------------------ التشغيل
async function main() {
  const argv = process.argv.slice(2), oi = argv.indexOf('--only'), only = oi >= 0 ? new RegExp(argv[oi + 1]) : null, noPng = argv.includes('--no-png');
  const stage = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--only')[0] || 'r4';
  const OUT = new URL(`../evidence/dialog/${stage}/`, import.meta.url).pathname, distRoot = new URL('../dist/', import.meta.url).pathname;
  mkdirSync(OUT + 'long', { recursive: true }); mkdirSync(OUT + 'sessions', { recursive: true });
  const summary = { stage, at: new Date().toISOString(), thresholds: THRESHOLDS, long: [], sessions: [] };
  for (const C of LONG) {
    if (only && !only.test(C.id)) continue;
    const row = await runLong(C);
    writeFileSync(OUT + `long/${C.id}.json`, JSON.stringify(row, null, 1));
    const S = row.score; summary.long.push({ id: C.id, name: C.name, words: row.words, interpretError: row.interpretError, f1: S.f1, precision: S.precision, recall: S.recall, levelAccuracy: S.levelAccuracy, per: S.per, missed: S.missed, wrong: S.wrong, levels: S.levels.filter(l => !l.ok), dropped: row.coverage.dropped.length, conflicts: row.conflicts.map(c => c.type), unclearClauses: row.coverage.unclearClauses });
    if (row.words < 150 || row.words > 400) console.warn(`تنبيه: ${C.id} طوله ${row.words} كلمة (المطلوب 150–400)`);
    console.log(`${C.id} (${row.words} كلمة): F1 ${S.f1} دقة ${S.precision} استدعاء ${S.recall} درجات ${S.levelAccuracy ?? '-'} | فات ${S.missed.length}: ${S.missed.join('، ')} | أضيف خطأً ${S.wrong.length}: ${S.wrong.join('، ')}`);
  }
  const jobs = [];
  for (const S of SESSIONS) {
    if (only && !only.test(S.id)) continue;
    const sess = await runSession(S), dir = OUT + `sessions/${S.id}/`; mkdirSync(dir, { recursive: true });
    sess.docs.forEach((d, i) => writeFileSync(dir + `doc-${i}.json`, serialize(d)));
    for (const t of sess.turns) writeFileSync(dir + `turn-${t.n}.json`, JSON.stringify(t, null, 1));
    if (!noPng) jobs.push(...renderJobs(sess, dir));
    summary.sessions.push({ id: S.id, name: S.name, initMs: sess.initMs, turns: sess.turns.map(t => ({ n: t.n, text: t.text, outcome: t.outcome, happened: t.happened, failedChecks: t.checks.filter(c => !c.ok).map(c => ({ type: c.type, why: c.why, measured: c.measured })), trivial: t.happened && t.checks.every(c => c.alreadyBefore !== false) && t.checks.some(c => c.alreadyBefore === true), violations: t.preservation.violations, openingChanges: t.preservation.openingChanges.length, patternKept: t.patternKept, difference: t.preservation.difference, envelope: t.preservation.envelope, idsStable: t.preservation.idsStable, claimMismatch: t.claimMismatch, ledger: t.ledger, understood: t.understood, error: t.error?.message || null, ms: t.ms })) });
    for (const t of sess.turns) console.log(`${S.id} د${t.n} «${t.text}»: ${t.outcome} | تحقق ${t.happened}${t.happened && t.checks.some(c => c.alreadyBefore === true) && t.checks.every(c => c.alreadyBefore !== false) ? ' (كان متحققًا قبل التعديل)' : ''} | مخالفات ${t.violations} (رئيسية ${t.mainViolations}) | فتحات ${t.preservation.openingChanges.length} | نمط محفوظ ${t.patternKept} | فرق ${t.preservation.difference}${t.claimMismatch ? ' | ادعاء تنفيذ غير صحيح' : ''}`);
  }
  // الإجمالي
  const L = summary.long, T = summary.sessions.flatMap(s => s.turns);
  summary.totals = {
    longCases: L.length, meanF1: L.length ? r3(L.reduce((a, b) => a + b.f1, 0) / L.length) : null, meanPrecision: L.length ? r3(L.reduce((a, b) => a + b.precision, 0) / L.length) : null, meanRecall: L.length ? r3(L.reduce((a, b) => a + b.recall, 0) / L.length) : null,
    missed: L.reduce((a, b) => a + b.missed.length, 0), wrong: L.reduce((a, b) => a + b.wrong.length, 0), dropped: L.reduce((a, b) => a + b.dropped, 0),
    turns: T.length, happened: T.filter(t => t.happened).length, happenedTrivially: T.filter(t => t.trivial).length, turnsWithViolations: T.filter(t => t.violations.length).length, violations: T.reduce((a, t) => a + t.violations.length, 0), claimMismatches: T.filter(t => t.claimMismatch).length,
    outcomes: T.reduce((a, t) => (a[t.outcome] = (a[t.outcome] || 0) + 1, a), {}),
  };
  writeFileSync(OUT + 'summary.json', JSON.stringify(summary, null, 1));
  console.log('الإجمالي:', JSON.stringify(summary.totals));
  if (!noPng) { await renderAll(jobs, distRoot); console.log('صور:', jobs.length); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
