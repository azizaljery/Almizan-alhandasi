// البصمة الهندسية للمخطط (plan-fingerprint): لكل عنصر في المستند (mizan-draw/1) معرّف ثابت وبصمة (hash) لمحتواه،
// فيُثبت كل تعديل ما الذي تغيّر وما الذي بقي ثابتًا حرفيًا — لا بالتقدير ولا بما يقوله النظام عن نفسه.
//
// شرط المالك: «المطلوب أن يستطيع العميل تغيير غرفة أو باب أو واجهة دون إفساد بقية المخطط. اختبر ذلك باستخدام بصمة
// هندسية قبل التعديل وبعده، بحيث يمكن إثبات الأجزاء التي تغيرت والأجزاء التي بقيت ثابتة.»
//
// العناصر:
//   - wall: قطعة جدار ذرّية — كل جدار يُقسم عند كل نقطة يلتقي فيها جدار آخر (طرف جدار على امتداده)، فلا يتأثر المعرّف
//     بطريقة تقسيم الجدران في المستند؛ المعرّف هندسي (الدور + طرفا القطعة) والبصمة تضيف السماكة والارتفاع والنوع.
//     جدار انزاح = قطعة أزيلت وقطعة أضيفت (لا «تغيّر»)؛ نقطة التقاء انتقلت تغيّر القطع الذرية حولها فقط.
//   - opening: باب/نافذة/فتحة — المعرّف معرّف الفتحة في المستند، والبصمة موضعها المطلق (لا موضعها على جدار بعينه)
//     ومقاسها ونوعها واتجاه فتحها؛ فتحة أعيد إنشاؤها بمعرّف جديد في الموضع نفسه حرفيًا تُعد ثابتة.
//   - room: غرفة مسماة — المعرّف معرّف تسميتها، والبصمة اسمها ونوعها ومضلعها (محاور الجدران) ومساحتها الصافية.
//   - finish (الواجهة والتشطيب)، roof، level (ارتفاع الدور ومنسوبه)، site (الأرض والارتدادات والشمال والمدخل).
//   - fixture/stair/column: الأثاث والسلالم والأعمدة (تُعد وتُعرض منفصلة عن عناصر المخطط في الملخص).
// خطوط الأبعاد والنصوص (dimensions/texts) حواشٍ للرسم لا تُحتسب.
// وحدة نقية بلا DOM ولا Node: تعمل في المتصفح وفي الاختبار.
import { analyzeDoc } from './draw/digest.mjs';

export const FINGERPRINT_VERSION = 'plan-fingerprint/1.0.0';
/** عناصر المخطط (ما يُحسب في «تغيّر X عنصرًا، بقي Y ثابتًا»)؛ الأثاث يُذكر منفصلًا. */
export const PLAN_KINDS = Object.freeze(['wall', 'opening', 'room', 'finish', 'roof', 'level', 'site', 'stair', 'column']);
const OPEN_AR = { door: 'باب', door2: 'باب مزدوج', slider: 'باب منزلق', arch: 'فتحة مفتوحة', garage: 'باب كراج', window: 'نافذة', window2: 'نافذة' };

const q = v => Math.round(v * 1000) / 1000; // ملّيمتر: أصغر من أي تعديل له معنى، وأكبر من أخطاء الفاصلة العائمة
const r2 = v => Math.round(v * 100) / 100;
const P = p => `${q(p.x)},${q(p.y)}`;
/** FNV-1a 32 بت (متزامن، بلا تبعيات): بصمة قصيرة لنص المحتوى. */
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const stable = v => JSON.stringify(v, (k, x) => typeof x === 'number' ? q(x) : x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);

// ------------------------------------------------------------------------------------------ الجدران الذرّية
/** يقسم جدران الدور عند نقاط الالتقاء: كل طرف جدار يقع داخل جدار آخر (على امتداده) نقطة تقسيم له. */
function atomicWalls(walls) {
  const out = [];
  const ends = walls.flatMap(w => [w.a, w.b]);
  for (const w of walls) {
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy); if (L < 1e-6) continue;
    const ux = dx / L, uy = dy / L, ts = [0, L];
    for (const p of ends) {
      const px = p.x - w.a.x, py = p.y - w.a.y, t = px * ux + py * uy, off = Math.abs(px * uy - py * ux);
      if (off <= .004 && t > .004 && t < L - .004) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    for (let i = 0; i < ts.length - 1; i++) {
      if (ts[i + 1] - ts[i] < .004) continue;
      const a = { x: w.a.x + ux * ts[i], y: w.a.y + uy * ts[i] }, b = { x: w.a.x + ux * ts[i + 1], y: w.a.y + uy * ts[i + 1] };
      const [p0, p1] = P(a) <= P(b) ? [a, b] : [b, a];
      out.push({ w, a: p0, b: p1, len: ts[i + 1] - ts[i] });
    }
  }
  return out;
}

const nameOf = r => r ? (r.unlabelled ? 'فراغ بلا تسمية' : r.name) : null;
/**
 * بصمة المستند: { version, elements: [{ key, kind, level, id, hash, name_ar, box }], byKey: Map }.
 * key معرّف العنصر الثابت؛ hash بصمة محتواه؛ box مستطيله (لإثبات أن التغيير محصور في جوار محدد).
 */
export function fingerprint(doc) {
  const model = analyzeDoc(doc), els = [];
  const push = e => { let key = e.key, n = 1; while (els.some(x => x.key === key)) key = `${e.key}#${++n}`; els.push({ ...e, key }); };
  const boxOf = pts => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });
  for (const lv of doc.levels) {
    const L = model.levelById.get(lv.id); if (!L) continue;
    push({ key: `L|${lv.id}`, kind: 'level', level: lv.id, id: lv.id, hash: fnv(stable({ name: lv.name, elevation: lv.elevation, height: lv.height })), name_ar: `الدور «${lv.name || lv.id}»`, box: null });
    // الجدران
    for (const s of atomicWalls(L.walls)) {
      const w = s.w, dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, Ls = Math.hypot(dx, dy), nx = -dy / Ls, ny = dx / Ls, m = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, reach = (w.t || .12) / 2 + .08;
      const A = L.roomAt({ x: m.x + nx * reach, y: m.y + ny * reach }), B = L.roomAt({ x: m.x - nx * reach, y: m.y - ny * reach });
      const names = [nameOf(A), nameOf(B)].filter(Boolean).sort();
      const name_ar = w.kind === 'parapet' ? `درابزين ${names.length ? `«${names.join('» و«')}»` : ''}`.trim() : names.length === 2 ? (names[0] === names[1] ? `جدار داخل «${names[0]}»` : `جدار بين «${names[0]}» و«${names[1]}»`) : names.length === 1 ? `جدار خارجي لـ«${names[0]}»` : 'جدار';
      // الخط الحامل (للتمييز بين جدار انزاح وجدار أعيد تقسيمه فقط عند نقطة التقاء انتقلت): الاتجاه الموحّد والإزاحة والخصائص
      let ux = dx / Ls, uy = dy / Ls; if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) { ux = -ux; uy = -uy; }
      const off = q(s.a.x * uy - s.a.y * ux), t0 = s.a.x * ux + s.a.y * uy, t1 = s.b.x * ux + s.b.y * uy;
      const line = `${lv.id}|${q(ux)},${q(uy)}|${off}|${q(w.t)}|${w.h ?? ''}|${w.kind || 'wall'}`;
      push({ key: `W|${lv.id}|${P(s.a)}|${P(s.b)}`, kind: 'wall', level: lv.id, id: w.id, hash: fnv(stable({ t: w.t, h: w.h ?? null, kind: w.kind || 'wall' })), name_ar, len: r2(s.len), box: boxOf([s.a, s.b]), line, span: [Math.min(t0, t1), Math.max(t0, t1)] });
    }
    // الفتحات: الموضع المطلق
    for (const op of L.openings) {
      const o = op.o, sides = op.sides.map(x => nameOf(x.room)), others = op.sides.map(x => x.other === 'outside' ? 'الخارج' : null).filter(Boolean);
      const between = [...new Set([...sides, ...others])];
      const kindAr = OPEN_AR[o.kind] || 'فتحة';
      const name_ar = `${kindAr}${o.entry ? ' (مدخل)' : ''} ${between.length === 2 ? `بين «${between[0]}» و«${between[1]}»` : between.length === 1 ? `«${between[0]}»` : ''}`.trim();
      const axis = Math.abs(op.u.x) > Math.abs(op.u.y) ? 'x' : 'y';
      push({ key: `O|${o.id}`, kind: 'opening', level: lv.id, id: o.id, hash: fnv(stable({ p: { x: op.p.x, y: op.p.y }, axis, kind: o.kind, w: o.w, h: o.h, sill: o.sill, swing: o.swing ?? null, hinge: o.hinge ?? null, entry: !!o.entry })), name_ar, box: (() => { const hw = o.w / 2, ht = (op.wall.t || .12) / 2, ex = Math.abs(op.u.x) * hw + Math.abs(op.u.y) * ht, ey = Math.abs(op.u.y) * hw + Math.abs(op.u.x) * ht; return { x0: op.p.x - ex, x1: op.p.x + ex, y0: op.p.y - ey, y1: op.p.y + ey }; })(), geom: `${P(op.p)}|${axis}|${o.kind}|${q(o.w)}|${q(o.h)}|${q(o.sill)}|${o.swing}|${o.hinge}|${!!o.entry}` });
    }
    // الغرف المسماة
    for (const r of L.rooms) {
      if (r.unlabelled) continue;
      // المضلع بلا رؤوس على استقامة واحدة (نقطة التقاء جدار آخر بحد الغرفة ليست تغييرًا في الغرفة)
      const poly0 = r.space.polygon || r.net, poly = poly0.filter((b, i) => { const a = poly0[(i + poly0.length - 1) % poly0.length], c = poly0[(i + 1) % poly0.length]; return Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 1e-6; });
      const pts = poly.map(P), k = pts.indexOf([...pts].sort()[0]), canon = [...pts.slice(k), ...pts.slice(0, k)];
      push({ key: `R|${lv.id}|${r.id}`, kind: 'room', level: lv.id, id: r.id, hash: fnv(stable({ name: r.name, type: r.type, poly: canon.join(' '), area: r2(r.area) })), name_ar: `«${r.name}»`, name: r.name, area: r2(r.area), box: boxOf(poly) });
    }
  }
  for (const f of doc.fixtures || []) push({ key: `X|${f.id}`, kind: 'fixture', level: f.level, id: f.id, hash: fnv(stable({ kind: f.kind, x: f.x, y: f.y, rot: f.rot || 0, w: f.w, d: f.d, h: f.h ?? null })), name_ar: `أثاث (${f.kind})`, box: { x0: f.x - (f.w || 0) / 2, x1: f.x + (f.w || 0) / 2, y0: f.y - (f.d || 0) / 2, y1: f.y + (f.d || 0) / 2 } });
  for (const s of doc.stairs || []) push({ key: `S|${s.id}`, kind: 'stair', level: s.level, id: s.id, hash: fnv(stable(s)), name_ar: 'سلم', box: null });
  for (const c of doc.columns || []) push({ key: `C|${c.id}`, kind: 'column', level: c.level, id: c.id, hash: fnv(stable({ ...c, id: undefined })), name_ar: 'عمود', box: null });
  push({ key: 'F|finish', kind: 'finish', level: null, id: 'finish', hash: fnv(stable(doc.finish || null)), name_ar: 'الواجهة والتشطيب', box: null });
  push({ key: 'F|roof', kind: 'roof', level: null, id: 'roof', hash: fnv(stable(doc.roof || null)), name_ar: 'السطح', box: null });
  push({ key: 'F|site', kind: 'site', level: null, id: 'site', hash: fnv(stable({ plot: doc.plot || null, north: doc.north ?? 0, entry: doc.entry ?? null, streets: doc.streets ?? null, entries: doc.entries ?? null })), name_ar: 'الأرض والارتدادات', box: null });
  const byKey = new Map(els.map(e => [e.key, e]));
  return { version: FINGERPRINT_VERSION, elements: els, byKey, digest: fnv(els.filter(e => e.kind !== 'fixture').map(e => e.key + ':' + e.hash).join('|')) };
}

// ------------------------------------------------------------------------------------------ المقارنة
const slim = e => ({ key: e.key, kind: e.kind, level: e.level, id: e.id, name_ar: e.name_ar, ...(e.name !== undefined ? { name: e.name } : {}), ...(e.area !== undefined ? { area: e.area } : {}), ...(e.len !== undefined ? { len: e.len } : {}), box: e.box ? { x0: r2(e.box.x0), x1: r2(e.box.x1), y0: r2(e.box.y0), y1: r2(e.box.y1) } : null });
/**
 * يقارن بصمتين (أو مستندين): { changed, unchanged, added, removed, counts, byKind, region, summary_ar }.
 * المطابقة بالمعرّف أولًا؛ ثم الفتحات والغرف التي تغيّر معرّفها بالمحتوى نفسه حرفيًا (ثابتة)؛ ثم الغرف بالاسم (تغيّرت).
 * unchanged قائمة مفاتيح (قد تكون طويلة)؛ والبقية بأسماء عربية لكل عنصر.
 */
export function diffFingerprint(before, after) {
  const A = before?.byKey ? before : fingerprint(before), B = after?.byKey ? after : fingerprint(after);
  const changed = [], unchanged = [], added = [], removed = [];
  const leftA = [], leftB = new Map();
  for (const e of B.elements) if (!A.byKey.has(e.key)) leftB.set(e.key, e);
  for (const a of A.elements) {
    const b = B.byKey.get(a.key);
    // معرّف التسمية نفسه لغرفة باسم آخر (بعد إعادة التوليد تتبدل المعرّفات): ليست الغرفة نفسها
    if (!b || (a.kind === 'room' && a.name !== b.name)) { leftA.push(a); if (b) leftB.set(b.key, b); continue; }
    if (a.hash === b.hash) unchanged.push(a.key);
    else changed.push({ ...slim(b), before: slim(a), how_ar: howChanged(a, b) });
  }
  // فتحة بمعرّف جديد بالموضع والمقاس نفسيهما حرفيًا = ثابتة؛ غرفة بمعرّف جديد بالمحتوى نفسه = ثابتة
  const byGeom = new Map(); for (const e of leftB.values()) if (e.kind === 'opening' && e.geom) byGeom.set(e.geom, e);
  const rest = [];
  for (const a of leftA) {
    if (a.kind === 'opening' && byGeom.has(a.geom)) { const b = byGeom.get(a.geom); byGeom.delete(a.geom); leftB.delete(b.key); unchanged.push(a.key); continue; }
    if (a.kind === 'room' || a.kind === 'fixture') { const b = [...leftB.values()].find(x => x.kind === a.kind && x.hash === a.hash && x.level === a.level); if (b) { leftB.delete(b.key); unchanged.push(a.key); continue; } }
    rest.push(a);
  }
  // قطعة جدار أزيلت وهي مغطاة كلها بجدران الخط نفسه بعد التعديل (والعكس): أعيد تقسيمها فقط عند نقطة التقاء انتقلت —
  // مادة الجدار في موضعها كما هي، فتُعد ثابتة
  const covered = (e, F) => { const iv = F.elements.filter(x => x.kind === 'wall' && x.line === e.line).map(x => x.span).sort((p, q2) => p[0] - q2[0]); let at = e.span[0]; for (const [a0, a1] of iv) { if (a0 > at + .004) break; at = Math.max(at, a1); if (at >= e.span[1] - .004) return true; } return at >= e.span[1] - .004; };
  for (let i = rest.length - 1; i >= 0; i--) { const a = rest[i]; if (a.kind === 'wall' && covered(a, B)) { unchanged.push(a.key); rest.splice(i, 1); } }
  for (const [k, b] of [...leftB]) if (b.kind === 'wall' && covered(b, A)) leftB.delete(k);
  for (const a of rest) {
    if (a.kind === 'room') { const b = [...leftB.values()].find(x => x.kind === 'room' && x.name === a.name && x.level === a.level); if (b) { leftB.delete(b.key); changed.push({ ...slim(b), before: slim(a), how_ar: howChanged(a, b) }); continue; } }
    removed.push(slim(a));
  }
  for (const b of leftB.values()) added.push(slim(b));
  const plan = e => e.kind !== 'fixture';
  const cnt = f => ({ changed: changed.filter(f).length, added: added.filter(f).length, removed: removed.filter(f).length, unchanged: unchanged.filter(k => f(A.byKey.get(k))).length });
  const counts = cnt(plan); counts.touched = counts.changed + counts.added + counts.removed; counts.total = counts.touched + counts.unchanged;
  const byKind = {}; for (const k of [...PLAN_KINDS, 'fixture']) { const c = cnt(e => e.kind === k); if (c.changed + c.added + c.removed + c.unchanged) byKind[k] = c; }
  const touchedEls = [...changed, ...added, ...removed].filter(plan);
  const boxes = touchedEls.flatMap(e => [e.box, e.before?.box]).filter(Boolean);
  const region = boxes.length ? { x0: r2(Math.min(...boxes.map(b => b.x0))), x1: r2(Math.max(...boxes.map(b => b.x1))), y0: r2(Math.min(...boxes.map(b => b.y0))), y1: r2(Math.max(...boxes.map(b => b.y1))) } : null;
  const identical = counts.touched === 0;
  return { version: FINGERPRINT_VERSION, before: A.digest, after: B.digest, identical, counts, byKind, changed, added, removed, unchanged, region, summary_ar: summarize(counts, byKind, identical) };
}
function howChanged(a, b) {
  if (a.kind === 'room') { const parts = []; if (a.name !== b.name) parts.push(`صارت «${b.name}»`); if (a.area !== b.area) parts.push(`المساحة ${a.area} ← ${b.area} م²`); if (!parts.length) parts.push('تغيّر شكلها أو موضعها'); return parts.join('، '); }
  if (a.kind === 'opening') return 'تغيّر موضعها أو مقاسها أو نوعها';
  if (a.kind === 'wall') return 'تغيّرت سماكته أو ارتفاعه أو نوعه';
  return 'تغيّر';
}
// العدد والمعدود بالعربية: 1 مفرد، 2 مثنى، 3–10 جمع، 11+ مفرد منصوب
const NOUN = { item: ['عنصر', 'عنصران', 'عناصر', 'عنصرًا'], wall: ['جدار', 'جداران', 'جدران', 'جدارًا'], opening: ['فتحة', 'فتحتان', 'فتحات', 'فتحةً'], room: ['غرفة', 'غرفتان', 'غرف', 'غرفةً'], fixture: ['قطعة أثاث', 'قطعتا أثاث', 'قطع أثاث', 'قطعةَ أثاث'], stair: ['سلم', 'سلمان', 'سلالم', 'سلمًا'], column: ['عمود', 'عمودان', 'أعمدة', 'عمودًا'], level: ['دور', 'دوران', 'أدوار', 'دورًا'] };
/** «عنصر واحد»، «عنصران»، «5 عناصر»، «12 عنصرًا». */
export function countAr(n, k = 'item') {
  const N = NOUN[k] || NOUN.item;
  if (n === 0) return `0 ${N[3]}`;
  if (n === 1) return k === 'item' ? 'عنصر واحد' : N[0];
  if (n === 2) return N[1];
  if (n <= 10) return `${n} ${N[2]}`;
  return `${n} ${N[3]}`;
}
function summarize(counts, byKind, identical) {
  if (identical) return `البصمة الهندسية: لم يتغيّر أي عنصر؛ بقي ثابتًا حرفيًا ${countAr(counts.unchanged)}.`;
  const parts = Object.entries(byKind).filter(([k, c]) => k !== 'fixture' && c.changed + c.added + c.removed).map(([k, c]) => { const t = c.changed + c.added + c.removed; return k === 'finish' ? 'الواجهة' : k === 'site' ? 'الأرض' : k === 'roof' ? 'السطح' : countAr(t, k); });
  const fx = byKind.fixture, fxT = fx ? fx.changed + fx.added + fx.removed : 0;
  return `البصمة الهندسية: تغيّر ${countAr(counts.touched)} (${parts.join('، ')})، وبقي ثابتًا حرفيًا ${countAr(counts.unchanged)}${fxT ? `؛ وتغيّر من الأثاث ${countAr(fxT, 'fixture')}` : ''}.`;
}
// (الجولة الثامنة عشرة) العنوان الفرعي لصورة الفرق من البصمة نفسها لا من قالب عام (المراجع المستقل r17: صورة فرق C8 قالت
// «الغرف نفسها في أماكنها» وقد انتقلت الغرف كلها، وفروق واجهة C9 قالت «تغيّرت جدران…» ولم يتغيّر في المخطط شيء).
/** حد انتقال الغرفة (م): إزاحة مركز مستطيلها أكثر من هذا = «انتقلت»؛ وأقل منه مع تغيّر الشكل = «تغيّر مقاسها». */
export const ROOM_MOVE_M = .5;
/** نسبة الغرف المنتقلة (من غرف المخطط قبل) التي يُسمّى بعدها الفرق «توزيعًا جديدًا». */
export const RELAYOUT_SHARE = .5;
const ctr = b => b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : null;
/**
 * يصف الفرق بلغة العميل من البصمة: { kind, client_ar, evidence_ar, rooms: { before, moved, resized, added, removed, same } }.
 * kind: identical | facade | relayout | rooms | openings. client_ar للعميل (بلا معرّفات ولا أعداد عناصر)،
 * وevidence_ar للأدلة الداخلية (الأعداد والبصمة).
 */
export function diffCaption(d) {
  const touched = [...d.changed, ...d.added, ...d.removed].filter(e => e.kind !== 'fixture');
  const layout = touched.filter(e => !['finish', 'roof'].includes(e.kind));
  const facade = touched.some(e => e.kind === 'finish'), roof = touched.some(e => e.kind === 'roof');
  const nm = e => e.name || String(e.name_ar || '').replace(/[«»]/g, '');
  const changedRooms = d.changed.filter(e => e.kind === 'room');
  const moved = changedRooms.filter(e => { const a = ctr(e.before?.box), b = ctr(e.box); return a && b && Math.hypot(a.x - b.x, a.y - b.y) > ROOM_MOVE_M; });
  const resized = changedRooms.filter(e => !moved.includes(e));
  const addedR = d.added.filter(e => e.kind === 'room'), removedR = d.removed.filter(e => e.kind === 'room');
  const same = d.unchanged.filter(k => k.startsWith('R|')).length;
  const before = same + changedRooms.length + removedR.length;
  const rooms = { before, moved: moved.length, resized: resized.length, added: addedR.length, removed: removedR.length, same };
  const evidence_ar = `${d.summary_ar} الغرف: ${before} قبل؛ انتقلت ${moved.length}، وتغيّر مقاس ${resized.length}، وأضيفت ${addedR.length}، وأزيلت ${removedR.length}، وبقيت ${same} كما هي.`;
  const withFacade = facade ? '، وتغيّرت مادة الواجهة' : '';
  if (!layout.length) {
    if (facade || roof) return { kind: 'facade', client_ar: `لم يتغيّر المخطط — تغيّرت ${facade && roof ? 'مادة الواجهة والسطح' : facade ? 'مادة الواجهة' : 'السطح'} فقط`, evidence_ar, rooms };
    return { kind: 'identical', client_ar: 'لم يتغيّر شيء في المخطط — كما هو حرفيًا', evidence_ar, rooms };
  }
  const relocated = moved.length + removedR.length; // الغرفة التي أزيلت باسمها وظهرت غيرها في موضع آخر انتقال كذلك
  if (before && relocated / before >= RELAYOUT_SHARE) return { kind: 'relayout', client_ar: `توزيع جديد: انتقلت الغرف (${relocated} من ${before})${same ? `، وبقي ${same === 1 ? 'فراغ واحد' : same === 2 ? 'فراغان' : same + ' فراغات'} كما ${same === 1 ? 'هو' : 'هي'}` : ''}${withFacade}`, evidence_ar, rooms };
  const roomTouched = [...moved, ...resized, ...addedR, ...removedR];
  if (roomTouched.length) {
    const names = [...new Set(roomTouched.map(nm).filter(Boolean))];
    const list = names.slice(0, 8).join('، ') + (names.length > 8 ? '…' : '');
    const verb = moved.length || removedR.length || addedR.length ? 'ما تغيّر (مظلل)' : 'تغيّر مقاس (مظلل)';
    return { kind: 'rooms', client_ar: `${verb}: ${list}؛ وبقية الغرف في أماكنها${withFacade}`, evidence_ar, rooms };
  }
  const ops = layout.filter(e => e.kind === 'opening').length, walls = layout.filter(e => e.kind === 'wall').length;
  const what = ops && walls ? 'جدران وأبواب أو نوافذ' : ops ? 'أبواب أو نوافذ' : walls ? 'جدران' : 'عناصر في المخطط';
  return { kind: 'openings', client_ar: `تغيّرت ${what} (مظللة)؛ الغرف نفسها في أماكنها${withFacade}`, evidence_ar, rooms };
}
/** نسخة مختصرة للرد والتخزين: الأعداد، والعناصر التي تغيّرت بأسمائها (حتى limit)، والمنطقة. */
export function compactDiff(d, limit = 60) {
  const pick = L => L.filter(e => e.kind !== 'fixture').slice(0, limit).map(e => ({ key: e.key, kind: e.kind, name_ar: e.name_ar, ...(e.how_ar ? { how_ar: e.how_ar } : {}) }));
  return { version: d.version, before: d.before, after: d.after, identical: d.identical, counts: d.counts, byKind: d.byKind, region: d.region, changed: pick(d.changed), added: pick(d.added), removed: pick(d.removed), summary_ar: d.summary_ar };
}
/** العناصر المتغيرة خارج منطقة (مستطيل موسّع بهامش): لإثبات أن التعديل محصور في جوار محدد. */
export function outsideRegion(d, box, margin = .3) {
  if (!box) return [...d.changed, ...d.added, ...d.removed].filter(e => e.kind !== 'fixture');
  const inside = b => !b || (b.x0 >= box.x0 - margin && b.x1 <= box.x1 + margin && b.y0 >= box.y0 - margin && b.y1 <= box.y1 + margin);
  return [...d.changed, ...d.added, ...d.removed].filter(e => e.kind !== 'fixture' && e.box && !(inside(e.box) && inside(e.before?.box)));
}
/** مفاتيح العناصر التي مسّها الفرق (تغيّرت/أضيفت/أزيلت) — لمقارنة فرقين (مثل إعادة تعديل بعد الرجوع). */
export const touchedKeys = d => new Set([...d.changed, ...d.added, ...d.removed].filter(e => e.kind !== 'fixture').map(e => e.key));

export default { FINGERPRINT_VERSION, PLAN_KINDS, countAr, fingerprint, diffFingerprint, diffCaption, compactDiff, outsideRegion, touchedKeys, fnv };
