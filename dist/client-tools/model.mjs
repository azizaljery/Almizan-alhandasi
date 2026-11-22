import { createDoc, parseDoc, serialize, applyCommand } from '../draw/doc.mjs';
import { analyzeDoc } from '../draw/digest.mjs';
import { computeDocQuantities } from '../draw/quantities-doc.mjs';
import { FLOOR_PRESETS } from '../draw/interior-themes.mjs';
import { validateVisionResult } from './vision-schema.mjs';
import { reviewGate, ctxOfSession } from '../design-review.mjs';
import { sessionForDocument } from '../project-context.mjs';

export const TOOLS_KEY = 'mizan.client.tools.v1';
export const SCHEMA = 'mizan-client-tools/1';
export const TOOL_IDS = ['mood', 'finishes', 'import', 'renovation', 'tenders', 'execution'];
export const uid = () => globalThis.crypto.randomUUID();
export const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const bounded = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export function number(v, { min = 0, max = 1e10, name = 'القيمة' } = {}) {
  if (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < min || Number(v) > max) throw Error(`${name} غير صالحة.`);
  return Number(v);
}
export function safeUrl(v) {
  if (!v) return '';
  const u = new URL(v); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error('رابط المنتج يجب أن يكون رابط ويب.');
  return u.href;
}
export function newWorkspace() {
  return { schema: SCHEMA, id: uid(), title: 'أدوات مشروعي', updatedAt: new Date().toISOString(), mood: { items: [], summary: '', palette: [], notes: '' }, products: [], selections: [], imported: null, renovation: null, boq: [], offers: [], tasks: [], payments: [] };
}
export function validateWorkspace(raw) {
  if (!raw || raw.schema !== SCHEMA || typeof raw.id !== 'string' || !raw.mood || !Array.isArray(raw.mood.items)) throw Error('ملف الأدوات غير معروف.');
  const out = newWorkspace(); out.id = bounded(raw.id, 100); out.title = bounded(raw.title);
  out.mood = { items: raw.mood.items.slice(0, 40).map(i => ({ id: bounded(i.id, 100), blobId: bounded(i.blobId, 100), name: bounded(i.name), note: bounded(i.note, 1500), colors: (i.colors || []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8) })), summary: bounded(raw.mood.summary, 4000), notes: bounded(raw.mood.notes, 4000), palette: (raw.mood.palette || []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 12) };
  for (const k of ['products', 'selections', 'boq', 'offers', 'tasks', 'payments']) if (!Array.isArray(raw[k]) || raw[k].length > 500) throw Error('حجم ملف الأدوات أكبر من المسموح.');
  out.products = raw.products.map(validateProduct);
  out.selections = raw.selections.map(s => ({ id: bounded(s.id, 100), roomKey: bounded(s.roomKey, 150), productId: bounded(s.productId, 100), waste: number(s.waste, { max: 50 }), quantity: number(s.quantity), mode: ['manual', 'room-floor', 'room-wall'].includes(s.mode) ? s.mode : String(s.basis || '').startsWith('تقدير:') ? 'room-wall' : 'manual', basis: bounded(s.basis, 300) }));
  out.boq = raw.boq.map(validateBoqItem);
  out.offers = raw.offers.map(o => ({ id: bounded(o.id, 100), name: bounded(o.name), notes: bounded(o.notes, 2000), items: (o.items || []).slice(0, 500).map(validateBoqItem) }));
  out.tasks = raw.tasks.map(t => validateTask(t));
  out.payments = raw.payments.map(p => ({ id: bounded(p.id, 100), taskId: bounded(p.taskId, 100), amount: number(p.amount, { min: .01 }), date: validDate(p.date), note: bounded(p.note, 1000) }));
  for (const k of ['renovation', 'imported']) if (raw[k]) {
    const v = raw[k]; out[k] = { ...v };
    for (const f of ['baseline', 'proposed', 'doc']) if (v[f]) out[k][f] = serialize(parseDoc(v[f]));
  }
  if (out.imported) {
    const v = out.imported;
    if (typeof v.blobId !== 'string' || !v.blobId || typeof v.sourceBlobId !== 'string' || !v.sourceBlobId) throw Error('مراجع ملف المخطط غير مكتملة.');
    v.width = number(v.width, { min: 1, max: 100000 }); v.height = number(v.height, { min: 1, max: 100000 });
    if (v.width * v.height > 60_000_000) throw Error('أبعاد صورة المخطط كبيرة جدًا.');
    if (v.scale !== null && v.scale !== undefined) v.scale = number(v.scale, { min: .000001, max: 10 });
    if (!Array.isArray(v.points) || v.points.length > 2 || v.points.some(p => !p || ![p.x, p.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1))) throw Error('نقاط معايرة المخطط غير صالحة.');
    try { v.plan = validateVisionResult('plan', v.plan, { allowEmpty: true }); } catch { throw Error('بيانات تتبع المخطط غير صالحة أو أكبر من المسموح.'); }
    v.reviewed = v.reviewed === true;
  }
  if (out.renovation) out.renovation.structuralReviewed = out.renovation.structuralReviewed === true;
  return out;
}
export function loadWorkspace(storage) {
  const raw = storage.getItem(TOOLS_KEY); return raw ? validateWorkspace(JSON.parse(raw)) : newWorkspace();
}
export function saveWorkspace(storage, state) {
  const checked = validateWorkspace(state); checked.updatedAt = new Date().toISOString();
  try { storage.setItem(TOOLS_KEY, JSON.stringify(checked)); } catch { throw Error('تعذر الحفظ في المتصفح. نزّل نسخة احتياطية قبل إغلاق الصفحة، وراجع مساحة التخزين المتاحة.'); }
  return checked;
}
export function readCurrentDoc(storage) {
  const studio = storage.getItem('mizan.studio.doc.v1');
  if (studio) return parseDoc(studio);
  const s = JSON.parse(storage.getItem('mizan.design.session.v1') || 'null');
  return s?.designs?.[s.current ?? 0]?.doc ? parseDoc(s.designs[s.current ?? 0].doc) : null;
}
export function reviewToolsDocument(doc, { sourceDoc = doc, session = null } = {}) {
  // Bind a brief only to the exact drawing it belongs to. An imported plan
  // must never inherit another customer's requirements left in this browser.
  const bound = sessionForDocument(sourceDoc, session);
  return reviewGate({ route: 'manual', doc, ctx: bound ? ctxOfSession(bound) : {} });
}
export function roomsForDoc(doc) {
  if (!doc) return [];
  return analyzeDoc(doc).levels.flatMap(l => l.rooms.filter(r => !r.unlabelled).map(r => ({ key: l.level.id + ':' + r.id, spaceKey: l.level.id + ':' + r.spaceId, labelId: r.label?.id, level: l.level.id, name: r.name, type: r.type, area: money(r.area), perimeter: r.perimeter, height: l.level.height })));
}
export const CATEGORIES = { floor: 'أرضيات', wall: 'دهان وكسوة جدران', door: 'أبواب', light: 'إنارة', furniture: 'أثاث' };
export function validateProduct(p) {
  const name = bounded(p.name); if (!name || !Object.hasOwn(CATEGORIES, p.category)) throw Error('أدخل اسم المنتج وفئته.');
  const color = p.color || '#d8d0c4'; if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error('لون المنتج غير صالح.');
  const unit = ['م²', 'م', 'عدد'].includes(p.unit) ? p.unit : 'م²';
  if (p.category === 'floor' && unit !== 'م²') throw Error('سعر الأرضية وتغطية عبوتها يُدخلان بالمتر المربع.');
  if (p.category === 'floor' && !Object.hasOwn(FLOOR_PRESETS, p.preset || 'porcelainWarm')) throw Error('خامة معاينة الأرضية غير معروفة.');
  return { id: bounded(p.id || uid(), 100), name, category: p.category, brand: bounded(p.brand), sku: bounded(p.sku), unit, price: number(p.price, { name: 'سعر الوحدة' }), pack: number(p.pack ?? 1, { min: .001, max: 1000, name: 'تغطية العبوة' }), color, preset: bounded(p.preset || 'porcelainWarm', 50), source: safeUrl(p.source), pricedAt: validDate(p.pricedAt), notes: bounded(p.notes, 1000) };
}
export function productTakeoff(product, room, { quantity = null, waste = 0 } = {}) {
  let q = quantity, basis = 'كمية أدخلها العميل';
  if (product.category === 'floor' && room) { q = room.area; basis = 'مساحة الغرفة الصافية من المخطط'; }
  if (product.category === 'wall' && product.unit === 'م²' && room && quantity === null) { q = room.perimeter * room.height; basis = 'تقدير: محيط الغرفة × الارتفاع، قبل خصم الفتحات'; }
  q = number(q, { name: 'الكمية' }); waste = number(waste, { max: 50, name: 'الهدر' });
  const required = q * (1 + waste / 100), packs = Math.ceil((required - 1e-8) / product.pack), purchased = packs * product.pack;
  return { quantity: money(q), required: money(required), purchased: money(purchased), packs, total: money(purchased * product.price), basis };
}
export function shoppingList(state, doc) {
  const rooms = roomsForDoc(doc), lines = [];
  for (const s of state.selections) {
    const p = state.products.find(p => p.id === s.productId); if (!p) continue;
    const room = rooms.find(r => r.key === s.roomKey);
    const autoWall = s.mode === 'room-wall' || (!s.mode && String(s.basis || '').startsWith('تقدير:'));
    const takeoff = productTakeoff(p, room, { quantity: autoWall && room ? null : s.quantity, waste: s.waste });
    lines.push({ ...takeoff, ...p, room: room?.name || s.roomKey || 'المشروع', stale: !!s.roomKey && !room });
  }
  return { lines, total: money(lines.reduce((s, l) => s + l.total, 0)) };
}
export function applyProduct(doc, product, roomKey) {
  const next = parseDoc(serialize(doc)), room = roomsForDoc(next).find(r => r.key === roomKey); if (!room) throw Error('الغرفة لم تعد موجودة في التصميم.');
  next.finish ||= {}; next.finish.roomProducts ||= {};
  const key = room.labelId || room.spaceKey, previous = next.finish.roomProducts[key] || {};
  next.finish.roomProducts[key] = { ...previous, ...(product.category === 'floor' ? { floor: product.preset } : product.category === 'wall' ? { paint: product.color } : {}), [product.category + 'Product']: product.id };
  return next;
}
export function calibratedScale(points, metres, width, height) {
  if (points?.length !== 2) throw Error('حدّد نقطتي بُعد معلوم على المخطط.');
  const pixels = Math.hypot((points[1].x - points[0].x) * width, (points[1].y - points[0].y) * height);
  if (pixels < 10) throw Error('نقطتا المعايرة متقاربتان جدًا.');
  return number(metres, { min: .1, max: 400, name: 'البعد المعلوم' }) / pixels;
}
export function snapTracePoint(plan, point, width, height, reach = 10) {
  const endpoints = (plan.walls || []).flatMap(w => [w.a, w.b]);
  const closest = endpoints.map(p => ({ p, d: Math.hypot((p.x - point.x) * width, (p.y - point.y) * height) })).sort((a, b) => a.d - b.d)[0];
  return closest && closest.d <= reach ? { ...closest.p } : { ...point };
}
export function vectorPlanToDoc(plan, { scale, width, height, title = 'مخطط مستورد' }) {
  scale = number(scale, { min: .000001, max: 10 });
  if (!Array.isArray(plan.walls) || plan.walls.length < 1 || plan.walls.length > 1000) throw Error('لا توجد جدران قابلة للتحويل.');
  const pt = p => ({ x: money(number(p.x, { max: 1 }) * width * scale), y: money((1 - number(p.y, { max: 1 })) * height * scale) });
  let doc = createDoc({ title }); const ids = [];
  for (const w of plan.walls) { const r = applyCommand(doc, { type: 'add-wall', level: 'L1', a: pt(w.a), b: pt(w.b), t: .2 }); doc = r.doc; ids.push(r.ids[0]); }
  for (const o of plan.openings || []) {
    const wall = doc.walls.find(w => w.id === ids[o.wallIndex]); if (!wall) throw Error('فتحة بلا جدار مرجعي.');
    const length = Math.hypot(wall.a.x - wall.b.x, wall.a.y - wall.b.y), fraction = number(o.position, { max: 1 });
    doc = applyCommand(doc, { type: 'add-opening', wall: wall.id, kind: o.kind === 'window' ? 'window' : 'door', at: fraction * length, w: number(o.widthFraction, { min: .001, max: 1 }) * length }).doc;
  }
  for (const r of plan.rooms || []) doc = applyCommand(doc, { type: 'add-label', level: 'L1', seed: pt(r.center), name: bounded(r.name, 60), roomType: r.type || 'other' }).doc;
  return doc;
}
export function quantityReference(doc) {
  if (!doc) return [];
  const source = computeDocQuantities(doc).rows;
  // Summary areas and block counts are alternative measurements of the same
  // scope: pricing all of them would silently double-count the works.
  const rows = source.filter(r => ['wallArea', 'finishArea', 'doors', 'windows'].includes(r.id));
  const floor = source.filter(r => ['rooms', 'circulation'].includes(r.id)).reduce((s, r) => s + (r.value || 0), 0);
  rows.push({ id: 'floorArea', label: 'أرضيات الفراغات المسماة والممرات', value: money(floor), unit: 'م²', basis: 'مساحات الفراغات المسماة والممرات؛ راجع المساحات غير المسماة ونطاق التشطيب قبل الطرح' });
  return rows.filter(r => Number.isFinite(r.value) && r.value > 0).map(r => ({ id: uid(), code: r.id, name: r.label, unit: r.unit, quantity: r.value, rate: null, basis: r.basis }));
}
export function renovationDiff(baseline, proposed) {
  const a = parseDoc(baseline), b = parseDoc(proposed);
  const tolerance = .005, height = (doc, w) => w.h || doc.levels.find(l => l.id === w.level)?.height || 3.2;
  function uncovered(doc, wall, otherDoc) {
    const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y, length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
    const along = p => (p.x - wall.a.x) * ux + (p.y - wall.a.y) * uy;
    const cross = p => Math.abs((p.x - wall.a.x) * uy - (p.y - wall.a.y) * ux);
    const covered = [];
    for (const other of otherDoc.walls) {
      if (wall.level !== other.level || Math.abs(wall.t - other.t) > .001 || Math.abs(height(doc, wall) - height(otherDoc, other)) > .001 || wall.kind !== other.kind || cross(other.a) > tolerance || cross(other.b) > tolerance) continue;
      const from = Math.max(0, Math.min(along(other.a), along(other.b))), to = Math.min(length, Math.max(along(other.a), along(other.b)));
      if (to - from > tolerance) covered.push([from, to]);
    }
    covered.sort((x, y) => x[0] - y[0]);
    const pieces = [], push = (from, to) => { if (to - from > tolerance) pieces.push({ ...wall, a: { x: wall.a.x + ux * from, y: wall.a.y + uy * from }, b: { x: wall.a.x + ux * to, y: wall.a.y + uy * to }, from, to }); };
    let cursor = 0; for (const [from, to] of covered) { if (from > cursor) push(cursor, from); cursor = Math.max(cursor, to); } push(cursor, length);
    return pieces;
  }
  // Compare physical coverage, not editor IDs. Splitting or reversing a wall
  // without changing its geometry is not demolition and reconstruction.
  const removed = a.walls.flatMap(w => uncovered(a, w, b)), added = b.walls.flatMap(w => uncovered(b, w, a));
  const area = (doc, walls) => walls.reduce((n, w) => {
    const openings = doc.openings.filter(o => o.wall === w.id).reduce((s, o) => s + Math.max(0, Math.min(w.to, o.at + o.w / 2) - Math.max(w.from, o.at - o.w / 2)) * o.h, 0);
    return n + Math.max(0, (w.to - w.from) * height(doc, w) - openings);
  }, 0);
  return { removed, added, kept: a.walls.filter(w => !removed.some(part => part.id === w.id)).length, demolitionArea: money(area(a, removed)), newWallArea: money(area(b, added)) };
}
export function parseCsv(source) {
  if (source.length > 2_000_000) throw Error('ملف CSV كبير جدًا.');
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i <= source.length; i++) {
    const c = source[i];
    if (c === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if ((c === ',' || c === ';' || c === '\t') && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === undefined) && !quoted) { row.push(cell.replace(/\r$/, '')); if (row.some(c => c.trim())) rows.push(row); row = []; cell = ''; }
    else if (c !== undefined) cell += c;
  }
  if (quoted) throw Error('علامات الاقتباس في CSV غير مكتملة.');
  if (rows.length > 501) throw Error('الحد الأقصى 500 بند.');
  return rows;
}
export const CSV_HEADERS = ['code', 'name', 'unit', 'quantity', 'rate'];
export function importOfferCsv(text) {
  const [headers, ...rows] = parseCsv(text.replace(/^\uFEFF/, '')); if (!headers) throw Error('الملف فارغ.');
  const aliases = { code: ['code', 'رمز', 'الرمز'], name: ['name', 'البند', 'الوصف'], unit: ['unit', 'الوحدة'], quantity: ['quantity', 'الكمية'], rate: ['rate', 'سعر الوحدة', 'السعر'] };
  const indices = Object.fromEntries(Object.entries(aliases).map(([k, v]) => [k, headers.findIndex(h => v.includes(h.trim().toLowerCase()))]));
  if (Object.values(indices).some(i => i < 0)) throw Error('يلزم أعمدة: code,name,unit,quantity,rate. نزّل القالب أولًا.');
  const items = rows.map(row => validateBoqItem(Object.fromEntries(CSV_HEADERS.map(k => [k, row[indices[k]]]))));
  if (new Set(items.map(i => i.code)).size !== items.length) throw Error('رموز البنود مكررة داخل العرض.');
  return items;
}
export function validateBoqItem(i) {
  if (!bounded(i.code, 100) || !bounded(i.name) || !bounded(i.unit, 30)) throw Error('البند يحتاج رمزًا ووصفًا ووحدة.');
  return { id: bounded(i.id || uid(), 100), code: bounded(i.code, 100), name: bounded(i.name), unit: bounded(i.unit, 30), quantity: number(i.quantity, { name: 'كمية البند' }), rate: i.rate === null || i.rate === '' || i.rate === undefined ? null : number(i.rate, { name: 'سعر البند' }), basis: bounded(i.basis, 500) };
}
export function csv(rows, headers = CSV_HEADERS) {
  const cell = v => '"' + String(v ?? '').replace(/^(\s*[=+@\-])/, "'$1").replaceAll('"', '""') + '"';
  return '\uFEFF' + [headers, ...rows.map(r => headers.map(h => r[h]))].map(r => r.map(cell).join(',')).join('\r\n');
}
export function compareOffers(reference, offers) {
  return offers.map(offer => {
    const missing = [], mismatches = [], extras = offer.items.filter(i => !reference.some(r => r.code === i.code)); let comparableTotal = 0;
    for (const r of reference) {
      const i = offer.items.find(i => i.code === r.code);
      if (!i || i.rate === null) { missing.push(r.code); continue; }
      if (i.unit !== r.unit) { mismatches.push({ code: r.code, kind: 'unit', detail: `${i.unit} بدل ${r.unit}` }); continue; }
      if (Math.abs(i.quantity - r.quantity) > .01) mismatches.push({ code: r.code, kind: 'quantity', detail: `${i.quantity} بدل ${r.quantity}` });
      comparableTotal += r.quantity * i.rate;
    }
    return { id: offer.id, name: offer.name, total: money(offer.items.reduce((s, i) => s + i.quantity * (i.rate ?? 0), 0)), comparableTotal: money(comparableTotal), complete: !missing.length && !mismatches.some(m => m.kind === 'unit'), missing, mismatches, extras, unpriced: offer.items.filter(i => i.rate === null).length };
  });
}
export function validDate(v) {
  const s = bounded(v, 10); if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s)) throw Error('التاريخ غير صالح.'); return s;
}
export function validateTask(t) {
  const title = bounded(t.title); if (!title) throw Error('أدخل اسم المهمة.');
  const start = validDate(t.start), end = validDate(t.end); if (start && end && start > end) throw Error('نهاية المهمة تسبق بدايتها.');
  const statuses = ['planned', 'active', 'submitted', 'accepted', 'blocked']; if (!statuses.includes(t.status)) throw Error('حالة المهمة غير معروفة.');
  if (t.status === 'accepted' && (!t.acceptedAt || !bounded(t.acceptanceNote, 1000))) throw Error('الاستلام يحتاج تاريخًا وملاحظة فحص.');
  return { id: bounded(t.id || uid(), 100), title, owner: bounded(t.owner), roomKey: bounded(t.roomKey, 150), start, end, budget: number(t.budget || 0), status: t.status, notes: bounded(t.notes, 2000), acceptedAt: validDate(t.acceptedAt), acceptanceNote: bounded(t.acceptanceNote, 1000), photos: (t.photos || []).slice(0, 20).map(p => ({ blobId: bounded(p.blobId, 100), name: bounded(p.name) })) };
}
export function addPayment(state, payment) {
  const task = state.tasks.find(t => t.id === payment.taskId); if (!task || task.status !== 'accepted') throw Error('الدفعة تتطلب مهمة مستلمة أولًا.');
  const amount = number(payment.amount, { min: .01 }), paid = state.payments.filter(p => p.taskId === task.id).reduce((s, p) => s + p.amount, 0);
  if (amount + paid > task.budget + .001) throw Error('الدفعات تتجاوز ميزانية المهمة.');
  return { id: uid(), taskId: task.id, amount: money(amount), date: validDate(payment.date) || new Date().toISOString().slice(0, 10), note: bounded(payment.note, 1000) };
}
export function executionSummary(state) {
  const budget = state.tasks.reduce((s, t) => s + t.budget, 0), accepted = state.tasks.filter(t => t.status === 'accepted');
  return { budget: money(budget), paid: money(state.payments.reduce((s, p) => s + p.amount, 0)), progress: Math.round(100 * (budget ? accepted.reduce((s, t) => s + t.budget, 0) / budget : accepted.length / (state.tasks.length || 1))), basis: budget ? 'حسب قيمة الأعمال المستلمة من الميزانية' : 'حسب عدد المهام المستلمة', accepted: accepted.length, total: state.tasks.length };
}
