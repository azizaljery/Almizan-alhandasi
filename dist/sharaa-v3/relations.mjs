// SHARAA V3 — محرك العلاقات المعمارية على مستند مخطط فعلي (mizan-draw/1).
// نقي: لا DOM ولا شبكة ولا تخزين. كل علاقة تحمل مصدرها (جدار/فتحة/مضلع) وشرحًا عربيًا قابلًا للتتبع.
// التمييز الجوهري: «القرب الهندسي» (مسافة المضلعات والمراكز) غير «قرب المسار» (طول المشي الفعلي عبر الأبواب).
// ما لا يمكن قياسه من المستند يُسجَّل NOT_EVALUATED مع السبب (الصوت الفعلي، خط الرؤية عبر باب مغلق/مفتوح).
import { analyzeWalls } from '../draw/topology.mjs';
import { pointInPolygon, closestOnSegment, dist, bounds } from '../draw/geom.mjs';

const DOOR_KINDS = new Set(['door', 'door2']);
const OPEN_KINDS = new Set(['arch']);
const WINDOW_KINDS = new Set(['window', 'window2']);
export const FAMILY_PRIVATE_TYPES = Object.freeze(['living', 'bedroom', 'master', 'family']);
const TYPE_AR = { majlis: 'مجلس', living: 'صالة', bedroom: 'غرفة نوم', master: 'غرفة النوم الرئيسية', kitchen: 'مطبخ', dining: 'طعام', bath: 'دورة مياه', entrance: 'مدخل', corridor: 'ممر', storage: 'مخزن' };
const roomName = r => r?.name || TYPE_AR[r?.type] || r?.type || 'فراغ';

function openingPoint(doc, o) {
  const w = doc.walls.find(x => x.id === o.wall); if (!w) return null;
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy); if (L < 1e-9) return null;
  const t = Math.min(Math.max(o.at / L, 0), 1);
  return { x: w.a.x + dx * t, y: w.a.y + dy * t, wallLength: L };
}
// نهايتا القطعة على حدّ الفراغ (باب على محور الجدار) فتُستثنيان؛ تُفحص النقاط الداخلية فقط
const segInside = (p, q, poly, steps = 12) => { for (let i = 1; i < steps; i++) { const t = i / steps; if (!pointInPolygon({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, poly, 0.02)) return false; } return true; };
function polyDistance(A, B) {
  let best = Infinity;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    const a1 = A[i], a2 = A[(i + 1) % A.length], b1 = B[j], b2 = B[(j + 1) % B.length];
    for (const [p, s0, s1] of [[a1, b1, b2], [a2, b1, b2], [b1, a1, a2], [b2, a1, a2]]) best = Math.min(best, closestOnSegment(p, s0, s1).dist);
  }
  return best;
}

/** يبني نموذج العلاقات لمستند مخطط. levelId اختياري (الافتراضي كل الأدوار، كل دور على حدة). */
export function analyzeDesign(doc) {
  const rooms = [], doors = [], edgesBySpace = new Map(), levelSpaces = new Map(), unattached = [];
  for (const lv of doc.levels || []) {
    const a = analyzeWalls(doc.walls.filter(w => w.level === lv.id));
    const labels = doc.labels.filter(l => l.level === lv.id);
    const list = [];
    for (const s of a.spaces) {
      if (!s.net) continue;
      const lab = labels.find(l => pointInPolygon(l.seed, s.net));
      const r = { id: lab?.id || ('sp:' + lv.id + ':' + s.id), spaceId: s.id, level: lv.id, type: lab?.type || 'unlabeled', name: lab?.name || null, polygon: s.polygon, net: s.net, inside: s.inside, area: s.area, bounds: bounds(s.net), labeled: !!lab };
      rooms.push(r); list.push(r); edgesBySpace.set(r.id, s.edges);
    }
    levelSpaces.set(lv.id, list);
  }
  const byId = new Map(rooms.map(r => [r.id, r]));
  // حواف مشتركة: كل حافة مستوية تخص فراغين (جدار مشترك) أو فراغًا واحدًا (جدار خارجي)
  const edgeOwners = new Map();
  for (const r of rooms) for (const e of edgesBySpace.get(r.id)) { const k = r.level + '|' + e.edgeId; if (!edgeOwners.has(k)) edgeOwners.set(k, []); edgeOwners.get(k).push({ room: r, e }); }
  const pairs = new Map(); // "a|b" → {a,b,sharedWall:{lengthM,edgeIds,wallIds}, openings:[]}
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  for (const owners of edgeOwners.values()) {
    const rs = [...new Map(owners.map(o => [o.room.id, o])).values()];
    if (rs.length !== 2) continue;
    const [A, B] = rs, k = pairKey(A.room.id, B.room.id);
    const p = pairs.get(k) || { a: A.room.id < B.room.id ? A.room.id : B.room.id, b: A.room.id < B.room.id ? B.room.id : A.room.id, lengthM: 0, edges: [], wallIds: new Set(), openings: [] };
    const len = dist(A.e.a, A.e.b); p.lengthM += len; p.edges.push({ edgeId: A.e.edgeId, a: A.e.a, b: A.e.b, lengthM: len }); for (const w of A.e.wallIds) p.wallIds.add(w);
    pairs.set(k, p);
  }
  // الفتحات: كل باب/قوس يُنسب إلى حافة؛ الحافة المشتركة تعطي الفراغين، والمنفردة تعني مدخلًا خارجيًا
  const windows = [];
  for (const o of doc.openings) {
    if (WINDOW_KINDS.has(o.kind)) {
      // النافذة الخارجية: حافة بمالك واحد؛ العمودي على الحافة بعيدًا عن داخل الفراغ هو اتجاهها (قياس هندسي)
      const wp = openingPoint(doc, o); if (!wp) continue;
      for (const [k, owners] of edgeOwners) {
        if (!k.startsWith(o.level + '|')) continue; const e = owners[0].e; if (!e.wallIds.includes(o.wall)) continue;
        if (closestOnSegment(wp, e.a, e.b).dist > 0.06) continue;
        const rs = [...new Map(owners.map(h => [h.room.id, h.room])).values()];
        if (rs.length === 1) {
          const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, Ln = Math.hypot(dx, dy); let nx = -dy / Ln, ny = dx / Ln;
          if ((rs[0].inside.x - wp.x) * nx + (rs[0].inside.y - wp.y) * ny > 0) { nx = -nx; ny = -ny; }
          windows.push({ id: o.id, level: o.level, room: rs[0].id, widthM: o.w, heightM: o.h, sillM: o.sill, normal: { x: round(nx), y: round(ny) }, point: { x: wp.x, y: wp.y } });
        }
        break;
      }
      continue;
    }
    const p = openingPoint(doc, o); if (!p) { unattached.push(o.id); continue; }
    let host = null;
    for (const owners of [...edgeOwners.entries()].filter(([k]) => k.startsWith(o.level + '|')).map(([, v]) => v)) {
      const e = owners[0].e; if (!e.wallIds.includes(o.wall)) continue;
      if (closestOnSegment(p, e.a, e.b).dist <= 0.06) { host = owners; break; }
    }
    if (!host) { unattached.push(o.id); continue; }
    const rs = [...new Map(host.map(h => [h.room.id, h.room])).values()];
    const rec = { id: o.id, kind: o.kind, level: o.level, wall: o.wall, widthM: o.w, point: { x: p.x, y: p.y }, entry: !!o.entry, open: OPEN_KINDS.has(o.kind), rooms: rs.map(r => r.id), exterior: rs.length === 1 };
    doors.push(rec);
    if (rs.length === 2) { const pp = pairs.get(pairKey(rs[0].id, rs[1].id)); if (pp) pp.openings.push(rec); }
  }
  const model = { rooms, byId, doors, windows, pairs, unattached, levels: doc.levels || [], north: doc.north, entry: doc.entry };
  model.relations = [];
  for (const p of pairs.values()) {
    const A = byId.get(p.a), B = byId.get(p.b);
    const doorsHere = p.openings.filter(o => !o.open), arches = p.openings.filter(o => o.open);
    p.visual = arches.length ? 'open' : doorsHere.length ? 'conditional' : 'none';
    model.relations.push({ kind: 'shared_wall', a: p.a, b: p.b, lengthM: round(p.lengthM), source: { kind: 'wall', wallIds: [...p.wallIds], edgeIds: p.edges.map(e => e.edgeId) },
      explain: `جدار مشترك بين ${roomName(A)} و${roomName(B)} بطول ${round(p.lengthM)} م (الجدران ${[...p.wallIds].join('، ')}).` });
    for (const d of p.openings) model.relations.push({ kind: d.open ? 'open_connection' : 'direct_door', a: p.a, b: p.b, widthM: d.widthM, source: { kind: 'opening', openingId: d.id, wallId: d.wall },
      explain: `${d.open ? 'اتصال مفتوح (قوس)' : 'باب مباشر'} بين ${roomName(A)} و${roomName(B)} عبر الفتحة ${d.id} (عرض ${d.widthM} م) على الجدار ${d.wall}.` });
  }
  model.exteriorDoors = doors.filter(d => d.exterior);
  model.entranceDoors = model.exteriorDoors.filter(d => d.entry); // مداخل الزائرين كما وسمها المولّد
  model.serviceDoors = model.exteriorDoors.filter(d => !d.entry); // أبواب خارجية للخدمة/الحوش (لا تُعد مدخل ضيافة)
  return model;
}
const round = v => Math.round(v * 100) / 100;

/** شبكة الحركة: عقدها أبواب/أقواس داخلية ومداخل خارجية؛ الأضلاع داخل الفراغ الواحد. */
function walkGraph(model) {
  const nodes = new Map(); // id → {point, rooms}
  for (const d of model.doors) nodes.set('d:' + d.id, { point: d.point, rooms: d.rooms, door: d });
  const adj = new Map(); for (const k of nodes.keys()) adj.set(k, []);
  let inexact = 0;
  for (const r of model.rooms) {
    const here = [...nodes.entries()].filter(([, n]) => n.rooms.includes(r.id));
    for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
      const ok = segInside(here[i][1].point, here[j][1].point, r.net); if (!ok) inexact++;
      const w = dist(here[i][1].point, here[j][1].point);
      adj.get(here[i][0]).push({ to: here[j][0], w, room: r.id, exact: ok }); adj.get(here[j][0]).push({ to: here[i][0], w, room: r.id, exact: ok });
    }
  }
  return { nodes, adj, inexact };
}
function dijkstra(model, g, starts, isGoal, forbid) {
  const D = new Map(), prev = new Map(), pq = []; let best = null;
  for (const s of starts) { D.set(s.key, s.w); prev.set(s.key, { from: null, room: s.room, exact: s.exact }); pq.push([s.w, s.key]); }
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]); const [d, u] = pq.shift();
    if (best && d >= best.total) break; // لا عقدة لاحقة تُحسّن الأفضل (أوزان غير سالبة)
    if (d > (D.get(u) ?? Infinity)) continue;
    const goal = isGoal(u);
    if (goal && (!best || d + goal.w < best.total)) best = { total: d + goal.w, node: u, goalExact: goal.exact };
    for (const e of g.adj.get(u) || []) {
      if (forbid && forbid.has(e.room)) continue;
      const nd = d + e.w; if (nd < (D.get(e.to) ?? Infinity)) { D.set(e.to, nd); prev.set(e.to, { from: u, room: e.room, exact: e.exact }); pq.push([nd, e.to]); }
    }
  }
  if (!best) return null;
  const path = []; let k = best.node; while (k) { path.unshift(k); k = prev.get(k).from; }
  return { lengthM: best.total, nodes: path, exact: path.every(p => prev.get(p).exact !== false) && best.goalExact, hops: path.length };
}

/** طول المشي الفعلي بين مركزين داخليين (نقطتا inside) عبر الأبواب والأقواس. null إن لم يوجد مسار. */
export function walkPath(model, aId, bId, { forbidRooms = [] } = {}) {
  const A = model.byId.get(aId), B = model.byId.get(bId); if (!A || !B) throw Error('فراغ غير معروف');
  const g = walkGraph(model), forbid = new Set(forbidRooms.filter(x => x !== aId && x !== bId));
  if (aId === bId) return { lengthM: 0, doorIds: [], hops: 0, exact: true };
  const starts = [], goalOf = new Map();
  for (const [k, n] of g.nodes) {
    if (n.rooms.includes(aId)) starts.push({ key: k, w: dist(A.inside, n.point), room: aId, exact: segInside(A.inside, n.point, A.net) });
    if (n.rooms.includes(bId)) goalOf.set(k, { w: dist(B.inside, n.point), exact: segInside(B.inside, n.point, B.net) });
  }
  const r = dijkstra(model, g, starts, k => goalOf.get(k), forbid);
  if (!r) return null;
  return { lengthM: round(r.lengthM), doorIds: r.nodes.map(k => k.slice(2)), hops: r.nodes.length, exact: r.exact };
}

/** العلاقة الكاملة بين فراغين: هندسية (مضلعات) مقابل مسار مشي، مع المصدر والشرح. */
export function relationBetween(model, aId, bId) {
  const A = model.byId.get(aId), B = model.byId.get(bId); if (!A || !B) throw Error('فراغ غير معروف');
  const key = aId < bId ? aId + '|' + bId : bId + '|' + aId, pair = model.pairs.get(key) || null;
  const geometric = A.level === B.level ? { boundaryDistM: round(polyDistance(A.net, B.net)), centroidDistM: round(dist(A.inside, B.inside)) } : { boundaryDistM: null, centroidDistM: null, reason: 'NOT_EVALUATED: دوران مختلفان' };
  const walk = A.level === B.level || model.doors.some(d => d.rooms.includes(aId) || d.rooms.includes(bId)) ? walkPath(model, aId, bId) : null;
  const direct = pair ? pair.openings.filter(o => !o.open) : [], open = pair ? pair.openings.filter(o => o.open) : [];
  const detour = walk && geometric.centroidDistM > 0 ? round(walk.lengthM / geometric.centroidDistM) : null;
  const sepHops = walk ? walk.hops : null;
  return {
    a: aId, b: bId, geometric,
    sharedWall: pair ? { lengthM: round(pair.lengthM), wallIds: [...pair.wallIds] } : null,
    directDoors: direct.map(d => ({ openingId: d.id, widthM: d.widthM })), openConnections: open.map(d => ({ openingId: d.id, widthM: d.widthM })),
    visual: pair ? pair.visual : 'none',
    walk, detourRatio: detour,
    separation: { doorHops: sepHops, sharedWall: !!pair, directConnection: direct.length + open.length > 0,
      acoustic: { status: 'NOT_EVALUATED', reason: 'لا يوجد في المستند مواصفة مواد الجدران ولا قياس صوتي؛ يُقدَّم فقط التتابع الطوبولوجي' },
      sightlineThroughDoor: { status: 'NOT_EVALUATED', reason: 'حالة الباب (مفتوح/مغلق) وزاوية الرؤية غير معروفة؛ يُقدَّم visual فقط' } },
    explain: `${roomName(A)} ↔ ${roomName(B)}: ` + (geometric.centroidDistM !== null ? `قرب هندسي ${geometric.boundaryDistM} م بين الجدارين و${geometric.centroidDistM} م بين المركزين؛ ` : '') +
      (pair ? `جدار مشترك ${round(pair.lengthM)} م؛ ` : 'لا جدار مشترك؛ ') + (direct.length ? `باب مباشر (${direct.map(d => d.id).join('، ')})؛ ` : open.length ? `اتصال مفتوح (${open.map(d => d.id).join('، ')})؛ ` : 'لا باب مباشر؛ ') +
      (walk ? `مسار المشي ${walk.lengthM} م عبر ${walk.hops} باب${detour ? ` (نسبة الالتفاف ${detour})` : ''}.` : 'لا مسار داخلي عبر الأبواب (الخارج غير مُنمذج كممر).'),
  };
}

/** استقلال المدخل: هل يصل الداخل من الخارج إلى الفراغ دون عبور أنواع محظورة؟ المصدر: الأبواب الخارجية والحافة المعنية. */
export function entranceIndependence(model, roomId, { forbidTypes = FAMILY_PRIVATE_TYPES, includeServiceDoors = false } = {}) {
  const target = model.byId.get(roomId); if (!target) throw Error('فراغ غير معروف');
  const forbid = new Set(model.rooms.filter(r => forbidTypes.includes(r.type) && r.id !== roomId).map(r => r.id));
  const g = walkGraph(model), starts = [];
  for (const d of includeServiceDoors ? model.exteriorDoors : model.entranceDoors) {
    const rid = d.rooms[0]; if (forbid.has(rid)) continue;
    starts.push({ key: 'd:' + d.id, w: 0, room: rid, exact: true });
  }
  if (!starts.length) return { independent: false, reason: 'لا باب مدخل يدخل إلى فراغ غير محظور', entry: null };
  const goal = new Map();
  for (const [k, n] of g.nodes) if (n.rooms.includes(roomId)) goal.set(k, { w: 0, exact: true });
  const r = dijkstra(model, g, starts, k => goal.get(k), forbid);
  const entryDoor = r ? r.nodes[0].slice(2) : null;
  const intoTarget = starts.some(s => s.room === roomId);
  const crossed = r ? [...new Set(r.nodes.flatMap(k => g.nodes.get(k).rooms))].filter(x => x !== roomId) : [];
  return { independent: !!r, entry: entryDoor, entersTargetDirectly: intoTarget, passesThroughRooms: crossed, forbidTypes: [...forbidTypes],
    source: { kind: 'opening', openingIds: r ? r.nodes.map(k => k.slice(2)) : [] },
    explain: r ? `${roomName(target)} يُدخل إليه من الخارج عبر ${entryDoor} دون المرور بفراغات من نوع ${forbidTypes.join('/')} (يمر بـ ${crossed.map(c => roomName(model.byId.get(c))).join('، ') || 'لا شيء'}).` : `${roomName(target)} لا يُبلغ من الخارج إلا عبر فراغات محظورة (${forbidTypes.join('/')}).` };
}

/** علاقات رأسية بين الأدوار: مساحة التراكب (إسقاط) بين فراغ علوي وسفلي. تقدير شبكي 0.1 م. */
export function verticalOverlap(model, upperId, lowerId) {
  const U = model.byId.get(upperId), L = model.byId.get(lowerId); if (!U || !L) throw Error('فراغ غير معروف');
  if (U.level === L.level) return { status: 'NOT_EVALUATED', reason: 'الفراغان في الدور نفسه' };
  const step = 0.1, b = U.bounds; let n = 0;
  for (let x = b.x0 + step / 2; x < b.x1; x += step) for (let y = b.y0 + step / 2; y < b.y1; y += step) if (pointInPolygon({ x, y }, U.net) && pointInPolygon({ x, y }, L.net)) n++;
  return { status: 'MEASURED', overlapM2: round(n * step * step), upperAreaM2: round(U.area), source: { kind: 'polygon', levels: [U.level, L.level] } };
}
