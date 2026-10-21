// قياس المجسّم ثلاثي الأبعاد المبني فعلًا (كائن built من buildBuildingScene/DrawViewer) ومقارنته بالمستند ثنائي الأبعاد.
// بلا استيراد: تعمل كما هي في المتصفح (داخل صفحة view3d.html الحقيقية) وفي Node (مع three من dist/vendor).
//
// ما يُقاس من هندسة المشهد نفسها لا من المستند:
//   • الجدران: رؤوس مثلثات كل جدار (وسوم MeshBuilder: kind=wall, wallId) مُسقطة على محور الجدار في الرسم:
//     امتداده على طوله، وسماكته عرضيًا، وأعلى نقطة فيه (ارتفاعه).
//   • الفتحات: أشعة أفقية عمودية على الجدار عند منتصف ارتفاع الفتحة؛ حافتا الفراغ (بحث ثم تنصيف حتى 2 مم) = موضعها وعرضها،
//     وشعاع رأسي في منتصفها = أعلاها وجلستها.
//   • الأرضيات: مساحة مثلثات أرضية كل غرفة ومستطيلها ومنسوبها.
//   • الأدوار: منسوب كل دور وارتفاعه، والدرج: مستطيل كتل الدرجات وأعلى درجة.

const r3 = v => Math.round(v * 1000) / 1000;

/** @param THREE وحدة three  @param built ناتج buildBuildingScene  @param exp من expected2d(doc) */
export function measure3d(THREE, built, exp) {
  return measureInner(THREE, built, exp);
}

function measureInner(THREE, built, exp) {
  const out = { levels: [], walls: {}, openings: {}, floors: {}, stairs: [] };
  const v = new THREE.Vector3();
  const wallsById = new Map(exp.walls.map(w => [w.id, w]));
  for (const L of built.levels) {
    out.levels.push({ id: L.id, elevation: r3(L.elevation), height: r3(L.height), top: r3(L.top) });
    L.group.updateMatrixWorld(true);
    const meshes = L.parts.walls.children.filter(m => m.isMesh);
    const tagged = meshes.filter(m => m.geometry.userData.tags);
    // ---- الجدران
    for (const m of tagged) {
      const g = m.geometry, pos = g.attributes.position, idx = g.index, tags = g.userData.tags;
      const triCount = (idx ? idx.count : pos.count) / 3;
      for (let t = 0; t < tags.length; t++) {
        const tag = tags[t].tag; if (!tag || tag.kind !== 'wall') continue;
        const w = wallsById.get(tag.wallId); if (!w) continue;
        const acc = out.walls[w.id] || (out.walls[w.id] = { s0: Infinity, s1: -Infinity, n0: Infinity, n1: -Infinity, y0: Infinity, y1: -Infinity, tris: 0 });
        const end = t + 1 < tags.length ? tags[t + 1].at : triCount;
        for (let f = tags[t].at; f < end; f++) {
          acc.tris++;
          for (let k = 0; k < 3; k++) {
            const vi = idx ? idx.getX(3 * f + k) : 3 * f + k;
            v.fromBufferAttribute(pos, vi).applyMatrix4(m.matrixWorld);
            const px = v.x, py = -v.z, s = (px - w.a.x) * w.u.x + (py - w.a.y) * w.u.y, n = (px - w.a.x) * w.n.x + (py - w.a.y) * w.n.y;
            if (s < acc.s0) acc.s0 = s; if (s > acc.s1) acc.s1 = s; if (n < acc.n0) acc.n0 = n; if (n > acc.n1) acc.n1 = n; if (v.y < acc.y0) acc.y0 = v.y; if (v.y > acc.y1) acc.y1 = v.y;
          }
        }
      }
    }
    // ---- الفتحات (أشعة على جدران الدور فقط)
    // مثلثات جدران الدور في إحداثيات العالم مرة واحدة؛ ولكل فتحة شبكة صغيرة من المثلثات القريبة منها (وجهان) تُرمى عليها الأشعة
    const soup = [];
    for (const m of meshes) {
      const g = m.geometry, pos = g.attributes.position, idx = g.index, n = (idx ? idx.count : pos.count) / 3;
      for (let f = 0; f < n; f++) for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(3 * f + k) : 3 * f + k).applyMatrix4(m.matrixWorld); soup.push(v.x, v.y, v.z); }
    }
    const dbl = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const localMesh = (w, s0, s1, pad) => { // مثلثات يتقاطع صندوقها مع جوار المقطع [s0,s1] من الجدار
      const keep = [];
      for (let i = 0; i < soup.length; i += 9) {
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (let k = 0; k < 9; k += 3) { const px = soup[i + k], py = -soup[i + k + 2], sa = (px - w.a.x) * w.u.x + (py - w.a.y) * w.u.y, sb = (px - w.a.x) * w.n.x + (py - w.a.y) * w.n.y; a0 = Math.min(a0, sa); a1 = Math.max(a1, sa); b0 = Math.min(b0, sb); b1 = Math.max(b1, sb); }
        if (a1 < s0 - pad || a0 > s1 + pad || b1 < -w.t / 2 - pad || b0 > w.t / 2 + pad) continue;
        for (let k = 0; k < 9; k++) keep.push(soup[i + k]);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
      const mesh = new THREE.Mesh(g, dbl); mesh.updateMatrixWorld(true); return mesh;
    };
    const ray = new THREE.Raycaster();
    let local = null;
    const hits = (o, s, z, w) => {
      const px = w.a.x + w.u.x * s, py = w.a.y + w.u.y * s, off = w.t / 2 + 0.4;
      ray.set(new THREE.Vector3(px + w.n.x * off, z, -(py + w.n.y * off)), new THREE.Vector3(-w.n.x, 0, w.n.y));
      ray.near = 0; ray.far = 2 * off;
      return ray.intersectObject(local, false).length > 0;
    };
    const vhit = (s, z0, dir, w, far) => { // شعاع رأسي داخل سماكة الجدار
      const px = w.a.x + w.u.x * s, py = w.a.y + w.u.y * s;
      ray.set(new THREE.Vector3(px, z0, -py), new THREE.Vector3(0, dir, 0)); ray.near = 0; ray.far = far;
      const h = ray.intersectObject(local, false); return h.length ? h[0].distance : null;
    };
    const edge = (o, w, z, s0, dir, maxD) => { // من s0 (فراغ) باتجاه dir حتى أول جدار، ثم تنصيف
      let lo = 0, hi = null;
      for (let d = 0.04; d <= maxD; d += 0.04) { if (hits(o, s0 + dir * d, z, w)) { hi = d; break; } lo = d; }
      if (hi === null) return null;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (hits(o, s0 + dir * mid, z, w)) hi = mid; else lo = mid; }
      return s0 + dir * (lo + hi) / 2;
    };
    for (const o of exp.openings.filter(x => x.level === L.id)) {
      const w = wallsById.get(o.wall); if (!w) continue;
      const E = L.elevation, zc = E + o.sill + Math.min(o.h, 2.0) / 2;
      local = localMesh(w, o.at - o.w / 2 - 1.3, o.at + o.w / 2 + 1.3, 0.6);
      // ابحث عن الفراغ قرب موضعه في الرسم (قد يكون المجسّم أزاحه)
      let c = null; for (const d of [0, 0.1, -0.1, 0.2, -0.2, 0.35, -0.35, 0.5, -0.5, 0.75, -0.75, 1.0, -1.0]) { const s = o.at + d; if (s > 0 && s < w.L && !hits(o, s, zc, w)) { c = s; break; } }
      if (c === null) { out.openings[o.id] = { found: false }; local.geometry.dispose(); continue; }
      const sL = edge(o, w, zc, c, -1, o.w + 1.2), sR = edge(o, w, zc, c, +1, o.w + 1.2);
      const mid = sL !== null && sR !== null ? (sL + sR) / 2 : c;
      const up = vhit(mid, zc, 1, w, L.height + 1), down = vhit(mid, zc, -1, w, zc - E + 0.01);
      out.openings[o.id] = { found: true, s0: sL === null ? null : r3(sL), s1: sR === null ? null : r3(sR), center: sL !== null && sR !== null ? r3(mid) : null, width: sL !== null && sR !== null ? r3(sR - sL) : null,
        head: up === null ? null : r3(zc + up - E), sill: down === null ? 0 : r3(zc - down - E) };
      local.geometry.dispose();
    }
    // ---- الأرضيات
    for (const m of L.parts.floors.children.filter(x => x.isMesh && x.userData?.kind === 'room')) {
      const room = built.rooms.get(m.userData.room); const key = room?.label?.id ? `${L.id}:${room.label.id}` : `${L.id}:${m.userData.spaceId}`;
      const g = m.geometry, pos = g.attributes.position, idx = g.index, n = (idx ? idx.count : pos.count) / 3;
      let area = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
      for (let f = 0; f < n; f++) {
        const ia = idx ? idx.getX(3 * f) : 3 * f, ib = idx ? idx.getX(3 * f + 1) : 3 * f + 1, ic = idx ? idx.getX(3 * f + 2) : 3 * f + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld); cc.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
        area += Math.abs((b.x - a.x) * (cc.z - a.z) - (cc.x - a.x) * (b.z - a.z)) / 2;
        for (const p of [a, b, cc]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, -p.z); y1 = Math.max(y1, -p.z); z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y); }
      }
      out.floors[key] = { name: room?.name, area: r3(area), x0: r3(x0), x1: r3(x1), y0: r3(y0), y1: r3(y1), elevation: r3(z0), flat: r3(z1 - z0) };
    }
    // ---- الدرج (كتل الدرجات)
    const treads = L.parts.stairs.children.filter(m => m.isMesh && /stairTread/.test(m.name));
    if (treads.length) {
      const box = new THREE.Box3(); for (const m of treads) box.expandByObject(m);
      out.stairs.push({ level: L.id, x0: r3(box.min.x), x1: r3(box.max.x), y0: r3(-box.max.z), y1: r3(-box.min.z), top: r3(box.max.y - L.elevation) });
    }
  }
  out.rooms = [...built.rooms.values()].map(r => ({ level: r.levelId, label: r.label?.id || null, name: r.name, void: !!r.void }));
  return out;
}

/** مقارنة: يعيد قائمة فروق (لا شيء = متطابق ضمن التسامحات). */
export function compare2d3d(exp, mea, tol = {}) {
  const T = { pos: 0.02, minor: 0.05, bounds: 0.03, thick: 0.02, height: 0.02, extent: 0.16, area: 0.01, areaAbs: 0.05, elev: 0.01, stair: 0.03, ...tol };
  // major: فرق يغيّر ما يراه العميل (فتحة مفقودة/منزاحة/جدار مختلف)؛ minor: إزاحة ≤ 5 سم يحدثها المجسّم ليبعد الفتحة عن تقاطع
  const out = [], add = (code, id, msg, data = {}) => out.push({ code, id, severity: data.severity || 'major', message: msg, ...data });
  const f = v => (v === null || v === undefined) ? '—' : (Math.round(v * 1000) / 1000).toFixed(3);
  // الأدوار
  for (const l of exp.levels) {
    const m = mea.levels.find(x => x.id === l.id);
    if (!m) { add('LEVEL_MISSING', l.id, `الدور ${l.id} غير موجود في المجسّم`); continue; }
    if (Math.abs(m.elevation - l.elevation) > T.elev) add('LEVEL_ELEVATION', l.id, `منسوب ${l.id}: الرسم ${f(l.elevation)} والمجسّم ${f(m.elevation)}`, { expected: l.elevation, measured: m.elevation });
    if (Math.abs(m.height - l.height) > T.elev) add('LEVEL_HEIGHT', l.id, `ارتفاع ${l.id}: الرسم ${f(l.height)} والمجسّم ${f(m.height)}`, { expected: l.height, measured: m.height });
  }
  // الجدران
  for (const w of exp.walls) {
    const m = mea.walls[w.id];
    if (!m || !m.tris) { if (!w.coveredBy) add('WALL_MISSING', w.id, `الجدار ${w.id} لا هندسة له في المجسّم`); continue; }
    const thick = m.n1 - m.n0, mid = (m.n1 + m.n0) / 2, lev = exp.levels.find(l => l.id === w.level), top = (lev?.elevation ?? 0) + (w.h ?? lev?.height ?? 3.2);
    if (Math.abs(thick - w.t) > T.thick) add('WALL_THICKNESS', w.id, `سماكة ${w.id}: الرسم ${f(w.t)} والمجسّم ${f(thick)}`, { expected: w.t, measured: r3(thick) });
    if (Math.abs(mid) > T.pos) add('WALL_OFFSET', w.id, `محور ${w.id} مُزاح ${f(mid)} م عرضيًا في المجسّم`, { measured: r3(mid) });
    if (Math.abs(m.s0) > T.extent || Math.abs(m.s1 - w.L) > T.extent) add('WALL_EXTENT', w.id, `امتداد ${w.id}: الرسم 0…${f(w.L)} والمجسّم ${f(m.s0)}…${f(m.s1)}`, { expected: [0, w.L], measured: [r3(m.s0), r3(m.s1)] });
    if (Math.abs(m.y1 - top) > T.height) add('WALL_HEIGHT', w.id, `أعلى ${w.id}: الرسم ${f(top)} والمجسّم ${f(m.y1)}`, { expected: top, measured: r3(m.y1) });
  }
  // الفتحات
  for (const o of exp.openings) {
    const m = mea.openings[o.id];
    if (!m || !m.found) { add('OPENING_MISSING', o.id, `الفتحة ${o.id} (${o.kind}) في ${o.wall} لا فراغ لها في جدار المجسّم`); continue; }
    if (m.width === null) { add('OPENING_EDGE', o.id, `تعذّر قياس حافتي الفتحة ${o.id}`); continue; }
    if (Math.abs(m.center - o.at) > T.pos) add('OPENING_POSITION', o.id, `موضع ${o.id} على ${o.wall}: الرسم ${f(o.at)} والمجسّم ${f(m.center)} (فرق ${f(m.center - o.at)} م)`, { expected: o.at, measured: m.center, severity: Math.abs(m.center - o.at) <= T.minor && Math.abs(m.width - o.w) <= T.pos ? 'minor' : 'major' });
    if (Math.abs(m.width - o.w) > T.pos) add('OPENING_WIDTH', o.id, `عرض ${o.id}: الرسم ${f(o.w)} والمجسّم ${f(m.width)}`, { expected: o.w, measured: m.width });
    const head = o.sill + o.h;
    if (m.head !== null && Math.abs(m.head - head) > T.pos) add('OPENING_HEAD', o.id, `أعلى ${o.id}: الرسم ${f(head)} والمجسّم ${f(m.head)}`, { expected: head, measured: m.head });
    if (Math.abs(m.sill - o.sill) > T.pos) add('OPENING_SILL', o.id, `جلسة ${o.id}: الرسم ${f(o.sill)} والمجسّم ${f(m.sill)}`, { expected: o.sill, measured: m.sill });
  }
  // الغرف والأرضيات
  for (const r of exp.rooms) {
    const key = `${r.level}:${r.id}`, m = mea.floors[key];
    if (r.void) continue;
    if (!m) { add('FLOOR_MISSING', key, `«${r.name}» بلا أرضية في المجسّم`); continue; }
    const expArea = r.area - r.holeArea;
    if (Math.abs(m.area - expArea) > Math.max(T.areaAbs, T.area * expArea)) add('FLOOR_AREA', key, `مساحة أرضية «${r.name}»: الرسم ${f(expArea)} م² والمجسّم ${f(m.area)} م²`, { expected: r3(expArea), measured: m.area });
    for (const k of ['x0', 'x1', 'y0', 'y1']) if (Math.abs(m[k] - r.bbox[k]) > T.bounds) { add('FLOOR_BOUNDS', key, `حدود أرضية «${r.name}» (${k}): الرسم ${f(r.bbox[k])} والمجسّم ${f(m[k])}`, { expected: r.bbox[k], measured: m[k] }); break; }
    const lev = exp.levels.find(l => l.id === r.level);
    if (Math.abs(m.elevation - lev.elevation) > T.elev || m.flat > T.elev) add('FLOOR_LEVEL', key, `منسوب أرضية «${r.name}»: الرسم ${f(lev.elevation)} والمجسّم ${f(m.elevation)}`);
    if (m.name !== r.name) add('ROOM_NAME', key, `اسم الغرفة: الرسم «${r.name}» والمجسّم «${m.name}»`);
  }
  const expKeys = new Set(exp.rooms.filter(r => !r.void).map(r => `${r.level}:${r.id}`));
  for (const k of Object.keys(mea.floors)) if (!expKeys.has(k)) add('FLOOR_EXTRA', k, `أرضية في المجسّم لا غرفة لها في الرسم (${mea.floors[k].name || k})`);
  // الدرج
  for (const s of exp.stairs) {
    const m = mea.stairs.find(x => x.level === s.level);
    if (!m) { add('STAIR_MISSING', s.id, `الدرج ${s.id} غير موجود في المجسّم`); continue; }
    for (const k of ['x0', 'x1', 'y0', 'y1']) if (Math.abs(m[k] - s.bbox[k]) > T.stair) { add('STAIR_BOUNDS', s.id, `حدود الدرج ${s.id} (${k}): الرسم ${f(s.bbox[k])} والمجسّم ${f(m[k])}`); break; }
    if (Math.abs(m.top - s.top) > T.stair) add('STAIR_TOP', s.id, `أعلى درجة ${s.id}: الرسم ${f(s.top)} والمجسّم ${f(m.top)}`);
  }
  return out;
}
