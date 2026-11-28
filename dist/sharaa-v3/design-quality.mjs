// SHARAA V3 — فحوص جودة التصميم المبنية على الدليل الهندسي لمستند مخطط فعلي.
// ليست حكمًا نهائيًا ولا بديلًا عن Mizan Score: تعيد قياسات وحالات PASS / REVIEW_REQUIRED / NOT_EVALUATED فقط، و verdict دائمًا null.
// العتبات الافتراضية معايير تصميمية مبدئية قابلة للمعايرة وليست اشتراطات نظامية.
// ما لا يمكن قياسه من المستند يُكتب NOT_EVALUATED مع السبب؛ والقدرات غير المنفذة تُعلَن في CAPABILITIES.
import { analyzeDesign, entranceIndependence, walkPath } from './relations.mjs';
import { qualityReview } from './quality.mjs';
import { minRect, compassOf, SIDE_NAME_AR } from '../draw/digest.mjs';
import { pointInPolygon, closestOnSegment } from '../draw/geom.mjs';

export const CAPABILITIES = Object.freeze({
  proportion: { status: 'IMPLEMENTED', basis: 'أقل مستطيل محيط بصافي الفراغ (minRect) ونسبة الطول إلى العرض' },
  hospitality: { status: 'IMPLEMENTED', basis: 'مسارات المشي والمداخل من العلاقات المقاسة على المستند، عبر qualityReview القائم' },
  furnitureFit: { status: 'IMPLEMENTED', basis: 'مستطيلات الأثاث في المستند داخل صافي الفراغ وعدم تداخلها' },
  glazingOrientation: { status: 'IMPLEMENTED', basis: 'مساحة الزجاج الخارجي لكل جهة بوصلة (قياس هندسي)، دون حكم حراري' },
  diversity: { status: 'IMPLEMENTED', basis: 'بصمة طوبولوجية للعلاقات؛ لا يُعد اللون أو التدوير أو الانعكاس تنوعًا' },
  critic: { status: 'IMPLEMENTED', basis: 'تجميع الفحوص في ملاحظات مرتبة دون حكم نهائي' },
  environmentalPerformance: { status: 'NOT_EVALUATED', reason: 'لا مناخ موثق ولا مسار شمس ولا مواصفة زجاج/عزل في المستند' },
  imageGeometryConsistency: { status: 'NOT_EVALUATED', reason: 'لا ربط بين صور مولّدة وهندسة المخطط في هذه الوحدة' },
  conceptGenerator: { status: 'NOT_IMPLEMENTED', reason: 'توليد أفنية وأجنحة وأشكال L وU يتطلب محرك توليد جديدًا؛ المحرك القائم لا يدعمها' },
  refinementLoop: { status: 'NOT_IMPLEMENTED', reason: 'حلقة تحسين محدودة المحاولات لم تُبنَ؛ لا يوجد مولّد قابل للتوجيه بنتائج الفحص' },
});

const DEFAULT_POLICY = { ratio: { living: 2, majlis: 2.5, bedroom: 2, master: 2, dining: 2.2, kitchen: 3 }, minRectangularity: 0.9, serviceWalkM: 12, guestWalkM: 8 };
const ROLE_AR = { living: 'الصالة', majlis: 'المجلس', bedroom: 'غرفة النوم', master: 'الرئيسية', dining: 'الطعام', kitchen: 'المطبخ' };
const r2 = v => Math.round(v * 100) / 100;

/** نسبة أبعاد الفراغات الرئيسية من الصافي. الفراغ غير المستطيل (rectangularity منخفضة) NOT_EVALUATED. */
export function proportionAnalyzer(model, policy = {}) {
  const P = { ...DEFAULT_POLICY, ...policy, ratio: { ...DEFAULT_POLICY.ratio, ...(policy.ratio || {}) } };
  const findings = [];
  for (const r of model.rooms) {
    const limit = P.ratio[r.type]; if (limit === undefined) continue;
    const mr = minRect(r.net), rect = mr.w > 0 ? r.net && Math.abs(polyArea(r.net)) / (mr.w * mr.l) : 0;
    if (!(mr.w > 0) || rect < P.minRectangularity) { findings.push({ id: 'proportion:' + r.id, room: r.id, status: 'NOT_EVALUATED', measured: { rectangularity: r2(rect || 0) }, reason: 'الفراغ غير مستطيل بما يكفي لنسبة موثوقة' }); continue; }
    const ratio = mr.l / mr.w;
    findings.push({ id: 'proportion:' + r.id, room: r.id, status: ratio > limit ? 'REVIEW_REQUIRED' : 'PASS', measured: { shortM: r2(mr.w), longM: r2(mr.l), ratio: r2(ratio), limit },
      reason: `نسبة استطالة ${ROLE_AR[r.type]}${r.name ? ' «' + r.name + '»' : ''}: ${r2(ratio)} (الحد المبدئي ${limit})`, provisionalThreshold: true });
  }
  return findings;
}
const polyArea = poly => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; };

/** يحوّل التصميم إلى «ملف أدلة» موثّق (verified:true) من قياسات العلاقات، ويمرّره إلى qualityReview القائم. */
export function evidenceFromDesign(model, policy = {}) {
  const P = { ...DEFAULT_POLICY, ...policy };
  const rooms = model.rooms.filter(r => r.type === 'living').map(r => { const mr = minRect(r.net), rect = mr.w ? polyArea(r.net) / (mr.w * mr.l) : 0; return { id: r.id, role: 'living', rectangular: rect >= P.minRectangularity, clearWidthM: r2(mr.w), clearDepthM: r2(mr.l) }; });
  const zoneOf = id => (['bedroom', 'master'].includes(model.byId.get(id)?.type) ? 'family_private' : 'other');
  const paths = {}, kitchen = model.rooms.find(r => r.type === 'kitchen'), dining = model.rooms.find(r => r.type === 'dining'), maj = model.rooms.find(r => r.type === 'majlis' && /الرجال/.test(r.name || ''));
  const mkPath = (a, b) => { const w = a && b ? walkPath(model, a.id, b.id) : null; if (!w) return undefined; const crossed = new Set(w.doorIds.flatMap(id => model.doors.find(d => d.id === id)?.rooms || [])); return { verified: w.exact === true, lengthM: w.lengthM, zones: [...crossed].map(zoneOf) }; };
  const kd = mkPath(kitchen, dining), md = mkPath(maj, dining);
  if (kd) paths.kitchenDining = kd; if (md) paths.maleMajlisDining = md;
  const women = model.rooms.find(r => r.type === 'majlis' && /النساء/.test(r.name || ''));
  let entrances;
  if (maj && women) {
    const m = entranceIndependence(model, maj.id, { forbidTypes: [] }), f = entranceIndependence(model, women.id, { forbidTypes: [] });
    // المناطق = معرّفات الفراغات المعبورة (التقاطع الفعلي لا تشابه النوع)
    const zones = e => [...new Set((e.source?.openingIds || []).flatMap(id => model.doors.find(d => d.id === id)?.rooms || []))];
    if (m.entry && f.entry) entrances = { verified: true, maleDoorId: m.entry, femaleDoorId: f.entry, maleZones: zones(m), femaleZones: zones(f) };
  }
  return { rooms, paths, ...(entrances ? { entrances } : {}), source: 'relations-engine' };
}
export function hospitalityReview(model, policy = {}) {
  const evidence = evidenceFromDesign(model, policy);
  return { evidence, review: qualityReview(evidence, { serviceWalkM: policy.serviceWalkM ?? DEFAULT_POLICY.serviceWalkM, guestWalkM: policy.guestWalkM ?? DEFAULT_POLICY.guestWalkM, livingRatio: policy.ratio?.living ?? DEFAULT_POLICY.ratio.living }) };
}

const FLOOR_LAYER = new Set(['rug']);
const corners = f => { const c = Math.cos(f.rot || 0), s = Math.sin(f.rot || 0), hw = f.w / 2, hd = f.d / 2; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({ x: f.x + x * c - y * s, y: f.y + x * s + y * c })); };
function satOverlap(A, B) {
  let min = Infinity;
  for (const poly of [A, B]) for (let i = 0; i < 4; i++) {
    const p = poly[i], q = poly[(i + 1) % 4], ax = -(q.y - p.y), ay = q.x - p.x, l = Math.hypot(ax, ay); const nx = ax / l, ny = ay / l;
    const pr = P => P.map(v => v.x * nx + v.y * ny), a = pr(A), b = pr(B);
    const o = Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)); if (o <= 0) return 0; min = Math.min(min, o);
  }
  return min;
}
/** مواءمة الأثاث: كل قطعة داخل صافي فراغها، ولا تتداخل قطعتان داخل الفراغ نفسه بأكثر من هامش. */
export function furnitureFit(doc, model, { overlapTolM = 0.05 } = {}) {
  const findings = [], fx = doc.fixtures || [];
  if (!fx.length) return [{ id: 'furniture', status: 'NOT_EVALUATED', reason: 'لا أثاث في المستند' }];
  const byRoom = new Map();
  for (const f of fx) {
    if (FLOOR_LAYER.has(f.kind)) continue; // السجاد طبقة أرضية لا جسم صلب
    const room = model.rooms.find(r => r.level === f.level && pointInPolygon({ x: f.x, y: f.y }, r.net));
    if (!room) { findings.push({ id: 'furniture-outside:' + f.id, status: 'REVIEW_REQUIRED', measured: { x: f.x, y: f.y }, reason: `قطعة ${f.kind} مركزها خارج أي فراغ` }); continue; }
    const outside = corners(f).filter(c => !pointInPolygon(c, room.net, 0.03));
    if (outside.length) {
      const depth = Math.max(...outside.map(c => Math.min(...room.net.map((a, i) => closestOnSegment(c, a, room.net[(i + 1) % room.net.length]).dist))));
      findings.push({ id: 'furniture-spill:' + f.id, room: room.id, status: 'REVIEW_REQUIRED', measured: { cornersOutside: outside.length, protrusionM: r2(depth) }, reason: `قطعة ${f.kind} تتجاوز صافي ${room.name || room.type} بعمق ${r2(depth)} م (${outside.length} من 4 زوايا)` });
    }
    if (!byRoom.has(room.id)) byRoom.set(room.id, []); byRoom.get(room.id).push(f);
  }
  for (const [rid, list] of byRoom) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const o = satOverlap(corners(list[i]), corners(list[j]));
    if (o > overlapTolM) findings.push({ id: `furniture-overlap:${list[i].id}:${list[j].id}`, room: rid, status: 'REVIEW_REQUIRED', measured: { penetrationM: r2(o) }, reason: `تداخل ${list[i].kind} مع ${list[j].kind} بعمق ${r2(o)} م` });
  }
  if (!findings.length) findings.push({ id: 'furniture', status: 'PASS', measured: { fixtures: fx.length }, reason: `${fx.length} قطعة أثاث داخل صافي فراغاتها بلا تداخل` });
  return findings;
}

/** مساحة الزجاج الخارجي لكل جهة بوصلة: قياس هندسي (الاتجاه من doc.north بحسب اصطلاح digest). لا حكم على الأداء الحراري. */
export function glazingByOrientation(model) {
  const sides = {};
  for (const w of model.windows) { const side = compassOf(w.normal, model.north || 0), a = (w.widthM || 0) * (w.heightM || 0); (sides[side] ||= { count: 0, areaM2: 0 }); sides[side].count++; sides[side].areaM2 = r2(sides[side].areaM2 + a); }
  return { status: 'MEASURED', basis: 'مساحة النافذة = العرض × الارتفاع، الجهة = اتجاه العمودي الخارجي على الجدار مع doc.north', sides, labelsAr: Object.fromEntries(Object.keys(sides).map(k => [k, SIDE_NAME_AR[k]])) };
}
export function environmentalPerformance(model, { climate } = {}) {
  return { status: 'NOT_EVALUATED', reason: climate ? 'لا مسار شمس ولا بيانات رياح ولا مواصفة زجاج/عزل؛ الأداء الحراري لا يُستنتج من الاتجاه وحده' : 'لا بيانات مناخ موثقة', measured: glazingByOrientation(model) };
}

/** بصمة طوبولوجية: أزواج (نوعان + نوع العلاقة) وعدد الفراغات؛ لا تتأثر بالتدوير أو الانعكاس أو اللون. */
export function designSignature(model) {
  const t = id => model.byId.get(id)?.type || '?', bag = new Map(), add = k => bag.set(k, (bag.get(k) || 0) + 1);
  for (const r of model.relations) add(`${r.kind}|${[t(r.a), t(r.b)].sort().join('+')}`);
  for (const r of model.rooms) add('room|' + r.type);
  add('entrances|' + model.entranceDoors.length); add('service-doors|' + model.serviceDoors.length);
  return bag;
}
export function signatureDistance(a, b) {
  let inter = 0, uni = 0; for (const k of new Set([...a.keys(), ...b.keys()])) { inter += Math.min(a.get(k) || 0, b.get(k) || 0); uni += Math.max(a.get(k) || 0, b.get(k) || 0); }
  return uni ? 1 - inter / uni : 0;
}
/** تنوع البدائل: مصفوفة مسافات بنيوية؛ بديل أقرب من العتبة إلى آخر يُعدّ تكرارًا. العتبة مبدئية. */
export function diversityReport(docs, { duplicateBelow = 0.08 } = {}) {
  const models = docs.map(analyzeDesign), sigs = models.map(designSignature), pairs = [];
  for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) { const d = signatureDistance(sigs[i], sigs[j]); pairs.push({ a: i, b: j, distance: r2(d), duplicate: d < duplicateBelow }); }
  return { pairs, duplicates: pairs.filter(p => p.duplicate).length, notCountedAsDiversity: ['اللون', 'التدوير', 'الانعكاس', 'تغيير الأبعاد دون تغيير العلاقات'], provisionalThreshold: duplicateBelow };
}

/** الناقد المعماري: يجمع الفحوص في ملاحظات مرتبة؛ لا حكم نهائي (Mizan Score هو المرجع). */
export function architecturalCritic(doc, { policy = {} } = {}) {
  const model = analyzeDesign(doc), notes = [];
  const push = (area, f) => notes.push({ area, id: f.id, status: f.status, reason: f.reason, measured: f.measured ?? null });
  for (const f of proportionAnalyzer(model, policy)) push('proportion', f);
  for (const f of hospitalityReview(model, policy).review.findings) push('hospitality', f);
  for (const f of furnitureFit(doc, model)) push('furniture', f);
  push('environment', { id: 'environment', ...(() => { const e = environmentalPerformance(model, {}); return { status: e.status, reason: e.reason, measured: e.measured }; })() });
  const rank = { REVIEW_REQUIRED: 0, NOT_EVALUATED: 1, PASS: 2 };
  notes.sort((a, b) => rank[a.status] - rank[b.status] || a.id.localeCompare(b.id));
  const count = s => notes.filter(n => n.status === s).length;
  return { notes, summary: { review: count('REVIEW_REQUIRED'), notEvaluated: count('NOT_EVALUATED'), pass: count('PASS') }, capabilities: CAPABILITIES, verdict: null, finalAuthority: 'Mizan Score', engineeringApproval: false };
}
