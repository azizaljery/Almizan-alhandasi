// Builds a complete, good looking 3D building from a `mizan-draw/1` document.
//
//   const built = buildBuildingScene(doc, THREE, options);
//   scene.add(built.group);
//
// Plan (x, y up) -> three (x, up, -y).  Everything static is merged per material and per level part, so a
// villa costs well under a hundred draw calls.  The returned object also carries the data the viewer
// needs: rooms, levels (with their own groups and wall solids for collisions), the site and statistics.
import { buildWallSolids, blockingPolygons } from './wall-geometry.mjs';
import { analyzeWalls } from './topology.mjs';
import { ROOM_TYPES, roomTypeName, FIXTURES, isDoorKind } from './catalog.mjs';
import { pointInPolygon, bounds as boundsOf, ccw, dist, sub, add, mul, dot, norm, centroid, insetPolygon } from './geom.mjs';
import { MeshBuilder, P3 } from './meshbuilder.mjs';
import { createMaterialLibrary } from './materials3d.mjs';
import { buildFixture, fixtureMatrix } from './fixtures3d.mjs';
import { stairLayout, emitStair, stairHeightAt } from './stairs3d.mjs';
import { emitOpening, archProfile } from './openings3d.mjs';
import { buildSite } from './site3d.mjs';
import { attachInterior } from './interior-materials.mjs';
import { resolveInteriorTheme, resolveInteriorPalette, roomFinish, furniturePalette, safeDesignHash, INTERIOR_THEMES, WALL_PRESETS } from './interior-themes.mjs';
import { hexLinear } from './interior-textures.mjs';
import { buildPiece } from './interior-pieces.mjs';
import { buildRichFixture, isRichKind } from './interior-furniture.mjs';
import { dressRoom } from './interior-dress.mjs';

export { stairLayout, stairHeightAt };

export const DEFAULTS = Object.freeze({
  doors: 'ajar',            // interior door leaves: 'ajar' | 'closed' | 'open'   (entry doors stay closed)
  plinth: .45,              // finished floor above the ground, metres
  slab: .2,                 // floor / roof slab thickness
  skirting: true, cornice: true, ao: true, fixtures: true, site: true, car: true,
  stoneAccent: 'entry',     // stone cladding on the façade that holds the entry door ('entry' | 'none')
  textures: true, maxAnisotropy: 4, quality: 1,
  richFurniture: null,      // procedural upholstered furniture (null = on with the interior finish system)
  furnitureStyle: null,     // najdi | classic | contemporary | luxury | dark when `interior` is off but richFurniture is on
  interior: false,          // interior finish system (themes, per-room materials, cove lighting, curtains, dressing); the viewer turns it on
  interiorTheme: null, interiorPalette: null, interiorStyle: null, interiorTaste: null, dress: true,
  materials: null,          // supply a material library to share textures between scenes
});

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const hexRgb = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const PAINT_MIX = .5;
const tintOf = type => { const rgb = hexRgb((ROOM_TYPES[type] || ROOM_TYPES.other).color); return rgb.map(v => 1 - (1 - v) * PAINT_MIX); };
const sign = v => v < 0 ? -1 : 1;

export function buildBuildingScene(doc, THREE, options = {}) {
  const fin = doc.finish || {}, fac = fin.facade || {};
  const opt = { ...DEFAULTS, ...(fac.accent ? { stoneAccent: fac.accent } : {}), ...options };
  const ownLib = !opt.materials;
  const lib = opt.materials || createMaterialLibrary(THREE, { textures: opt.textures, maxAnisotropy: opt.maxAnisotropy, quality: opt.quality });
  const group = new THREE.Group(); group.name = 'mizan-building';
  if (ownLib) { // façade / material choices of the project
    const m = lib.m, paint = (mat, c) => { if (mat && c) mat.color.set(c); };
    paint(m.render, fac.color); paint(m.accent, fac.accentColor); paint(m.plinth, fac.plinthColor || fac.accentColor); paint(m.coping, fac.copingColor || fin.roof);
    paint(m.aluminium, fin.aluminium); paint(m.doorEntry, fin.entryDoor); paint(m.fence, fin.fence);
    if (fac.base === 'stone') { for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap']) m.render[k] = m.accent[k]; m.render.bumpScale = m.accent.bumpScale; m.render.normalScale?.copy?.(m.accent.normalScale); m.render.roughness = m.accent.roughness; m.render.needsUpdate = true; if (!fac.color) m.render.color.copy(m.accent.color); }
    if (fac.base === 'paint') { m.render.map = null; m.render.bumpMap = null; m.render.needsUpdate = true; }
  }
  const T = opt.slab, PL = opt.plinth;
  // interior finish system: theme chosen by the client (selector) > doc.finish.interior > taste > exterior style > design fingerprint
  const IV = opt.interior ? (() => {
    attachInterior(THREE, lib, { quality: opt.quality, maxAnisotropy: opt.maxAnisotropy });
    const res = resolveInteriorTheme(doc, { theme: opt.interiorTheme, style: opt.interiorStyle, taste: opt.interiorTaste || [] });
    const seed = safeDesignHash(doc), pal = opt.interiorPalettes === false ? null : resolveInteriorPalette(res.id, seed, opt.interiorPalette);
    return { ...res, seed, T: INTERIOR_THEMES[res.id], pal, rooms: new Map(), dressed: [] };
  })() : null;
  const hexKey = h => String(h).replace('#', '').toLowerCase();
  // interior light is generous (walk-mode hemisphere + fill): paint is stored a little darker so rooms keep their colour instead of washing out to white
  const IV_GAIN = .74, paintLin = hx => hexLinear(hx).map(v => v * IV_GAIN);
  const result = { group, rooms: new Map(), levels: [], site: null, stats: {}, lib, options: opt, doc, interior: IV ? { theme: IV.id, source: IV.source, reason: IV.reason, palette: IV.pal ? { id: IV.pal.id, ar: IV.pal.ar, why: IV.pal.why } : null, rooms: IV.rooms, dressed: IV.dressed } : null };
  const levelsDoc = doc.levels?.length ? doc.levels : [{ id: 'L1', name: 'الدور الأرضي', elevation: 0, height: 3.2 }];
  let acc = 0;
  const lvData = levelsDoc.map((lv, i) => {
    const E = Number.isFinite(lv.elevation) && (i === 0 || lv.elevation > 0) ? lv.elevation : acc, H = lv.height || 3.2; acc = E + H;
    const walls = doc.walls.filter(w => w.level === lv.id), openings = doc.openings.filter(o => o.level === lv.id || walls.some(w => w.id === o.wall));
    const solids = buildWallSolids(walls, openings, { levelHeight: H, defaultThickness: doc.settings?.defaultThickness });
    const analysis = analyzeWalls(walls);
    return { i, lv, id: lv.id, name: lv.name, E, H, walls, openings, solids, analysis };
  });
  const top = lvData.length - 1;

  // ---- spaces: labels, types, tints, coverage -------------------------------------------------------------------
  const inSpace = (p, s) => s.polygon && pointInPolygon(p, s.polygon, 1e-9) && !s.holes.some(h => pointInPolygon(p, h, 1e-9));
  for (const L of lvData) {
    const labels = doc.labels.filter(l => l.level === L.id);
    L.spaces = L.analysis.spaces.filter(s => s.net).map(s => {
      const label = labels.find(l => inSpace(l.seed, s)) || null;
      const type = label?.type || 'other', def = ROOM_TYPES[type] || ROOM_TYPES.other;
      const sp = Object.assign(s, { key: L.id + ':' + s.id, levelId: L.id, label, type, name: label?.name || roomTypeName(type), floorKind: def.floor, open: !!def.open, tint: tintOf(type), levelIndex: L.i });
      if (IV) { sp.fin = roomFinish(IV.id, type, sp.key, IV.seed, { area: sp.area, palette: IV.pal }); IV.rooms.set(sp.key, sp.fin); }
      return sp;
    });
    const next = lvData[L.i + 1];
    for (const s of L.spaces) s.covered = !!next && next.analysis.outlines.some(o => pointInPolygon(s.inside, o.polygon, 1e-9));
    L.locate = p => L.spaces.find(s => inSpace(p, s)) || null;
  }
  const outlineAll = lvData.flatMap(L => L.analysis.outlines.map(o => o.polygon));
  const groundOutline = lvData[0].analysis.outlines.length ? lvData[0].analysis.outlines.reduce((a, b) => b.area > a.area ? b : a).polygon : null;

  // ---- stairs (layouts first: stairwell holes are needed by floors, ceilings and roofs) -------------------------------
  for (const L of lvData) {
    const next = lvData[L.i + 1], rise = next ? next.E - L.E : L.H;
    L.stairs = doc.stairs.filter(s => s.level === L.id).map(s => ({ stair: s, layout: stairLayout(s, rise), E: L.E, toE: L.E + rise, levelIndex: L.i, toRoof: !next }));
  }
  const holesFor = (L, space) => { // holes of stairs below (floor of L) and own stairs (ceiling / roof of L) that lie fully inside `space`
    const fits = hole => hole.every(p => inSpace(p, space)) && true;
    const below = (lvData[L.i - 1]?.stairs || []).filter(s => !s.toRoof).map(s => s.layout.hole).filter(fits);
    const own = L.stairs.map(s => s.layout.hole).filter(fits);
    return { below, own };
  };

  // ---- build each level -----------------------------------------------------------------------------------------------
  const rooms = result.rooms;
  const fixtureBoxes = [];
  for (const L of lvData) {
    const lg = new THREE.Group(); lg.name = 'level:' + L.id; lg.userData = { levelId: L.id, index: L.i };
    const parts = {};
    const mk = name => { const g = new THREE.Group(); g.name = name; lg.add(g); parts[name] = g; return g; };
    for (const n of ['walls', 'floors', 'ceilings', 'roof', 'parapet', 'openings', 'fixtures', 'stairs', 'decals']) mk(n);
    const E = L.E, H = L.H, ceilZ = H - T, isTop = L.i === top, ground = L.i === 0;
    const parapetH = doc.roof?.parapet ?? .9;
    const W = new MeshBuilder(THREE);   // walls
    const O = new MeshBuilder(THREE);   // frames, leaves, glass
    const C = new MeshBuilder(THREE);   // ceilings
    const R = new MeshBuilder(THREE);   // roof
    const PA = new MeshBuilder(THREE);  // parapet + coping
    const F = new MeshBuilder(THREE);   // fixtures
    const S = new MeshBuilder(THREE);   // stairs
    const D = new MeshBuilder(THREE);   // decals
    for (const key of ['paint', 'render', 'plinth', 'accent', 'reveal']) W.bucket(key, { color: true });
    if (IV) W.bucket('iv:paint', { color: true });
    D.bucket('aoDecal', { alpha: true });

    // classify wall sides
    for (const seg of L.solids.segments) {
      const mid = add(seg.a, mul(seg.dir, seg.length / 2)), off = seg.t / 2 + .09;
      seg.sideL = L.locate(add(mid, mul(seg.left, off))); seg.sideR = L.locate(add(mid, mul(seg.left, -off)));
      const extL = !seg.sideL || seg.sideL.open, extR = !seg.sideR || seg.sideR.open;
      seg.ext = extL === extR ? 0 : (extL ? 1 : -1);
    }
    // feature wall of each room: the longest face with the fewest openings (window walls and door walls lose)
    const accentOf = new Map();
    if (IV) {
      const best = new Map();
      for (const seg of L.solids.segments) {
        if (seg.kind === 'fence' || seg.kind === 'parapet') continue;
        const doors = seg.openings.filter(o => isDoorKind(o.kind)).length, wins = seg.openings.length - doors;
        for (const side of ['L', 'R']) {
          const sp = side === 'L' ? seg.sideL : seg.sideR; if (!sp || sp.open || !sp.fin?.accent) continue;
          const score = seg.length - doors * 2.4 - wins * 1.3 - (seg.ext !== 0 ? .6 : 0), b = best.get(sp.key);
          if (!b || score > b.score) best.set(sp.key, { score, id: seg.id + '|' + side });
        }
      }
      for (const [k, v] of best) if (v.score >= 1.6) accentOf.set(k, v.id);
    }
    // stone accent on the façade that carries the entry door
    const accentSegs = new Set();
    if (opt.stoneAccent === 'entry' && ground) for (const seg of L.solids.segments) if (seg.ext !== 0 && seg.openings.some(o => o.entry)) accentSegs.add(seg.id);
    if (opt.stoneAccent === 'all' && ground) for (const seg of L.solids.segments) if (seg.ext !== 0) accentSegs.add(seg.id);

    const groundExt = ground ? PL + .08 : 0, plinthTop = .9;
    const colRows = (len, jS, jE) => ({ cols: [...(jS ? [.12, .5] : []), ...(jE ? [len - .5, len - .12] : [])] });
    const rowsInterior = [.05, .2, .5, .9, ceilZ - .55, ceilZ - .18];

    // ---- walls ------------------------------------------------------------------------------------------------------
    const faceGrid = (key, A, Bp, nrm, z0, z1, uOff, colorAt, extraCols, extraRows) => {
      const len = Math.hypot(Bp.x - A.x, Bp.y - A.y);
      if (len < 1e-5 || z1 - z0 < 1e-5) return;
      const ux = (Bp.x - A.x) / len, uy = (Bp.y - A.y) / len;
      const uniq = (arr, lo, hi) => { const a = [lo, ...arr.filter(v => v > lo + .03 && v < hi - .03).sort((p, q) => p - q), hi]; return a.filter((v, i) => !i || v - a[i - 1] > 1e-4); };
      const cols = uniq(extraCols, 0, len), rows = uniq(extraRows, z0, z1);
      const n3 = [nrm.x, 0, -nrm.y];
      const pt = (u, z) => [A.x + ux * u, E + z, -(A.y + uy * u)];
      for (let i = 0; i + 1 < cols.length; i++) for (let j = 0; j + 1 < rows.length; j++) {
        const u0 = cols[i], u1 = cols[i + 1], v0 = rows[j], v1 = rows[j + 1];
        W.quad(key, pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), n3, [[uOff + u0, v0], [uOff + u1, v0], [uOff + u1, v1], [uOff + u0, v1]], [colorAt(u0, v0), colorAt(u1, v0), colorAt(u1, v1), colorAt(u0, v1)]);
      }
    };
    const WHITE = [1, 1, 1];
    // ---- themed interior wall faces (paint, feature wall, wainscot panels, tiles) -----------------------------------------------------
    const ivTagged = new Set();
    const emitIvFace = (space, seg, side, piece, A, Bp, nrm, uOff, len, ao, jS, jE) => {
      const f = space.fin, z0 = piece.z0, z1 = piece.z1, cols = colRows(len, jS, jE).cols;
      const flat = rgb => (u, z) => { const a = ao(u, z); return [rgb[0] * a, rgb[1] * a, rgb[2] * a]; };
      const put = (key, za, zb, rgb) => {
        za = Math.max(za, z0); zb = Math.min(zb, z1); if (zb - za < 1e-4) return;
        W.bucket(key, { color: true }); const tk = key + '|' + seg.id; if (!ivTagged.has(tk)) { ivTagged.add(tk); W.mark(key, { kind: 'wall', wallId: seg.wallId, segId: seg.id, level: L.id }); }
        faceGrid(key, A, Bp, nrm, za, zb, uOff, flat(rgb), cols, rowsInterior);
      };
      const paintRgb = paintLin(f.paint), isAccent = f.accent && accentOf.get(space.key) === seg.id + '|' + side;
      if (isAccent) {
        if (f.accent.preset) put('iv:wall:' + f.accent.preset, 0, 99, WALL_PRESETS[f.accent.preset]?.tint ? paintRgb : WHITE.map(v => v * .85)); else put('iv:paint', 0, 99, paintLin(f.accent.color));
        return;
      }
      const zones = [], wallKey = p => 'iv:wall:' + p, rgbOf = p => (WALL_PRESETS[p]?.tint ? paintLin(f.trim === undefined ? f.paint : f.trim) : WHITE.map(v => v * .85));
      if (f.full) zones.push([0, f.full.h, wallKey(f.full.preset), rgbOf(f.full.preset)], [f.full.h, 99, 'iv:paint', paintRgb]);
      else if (f.band) { if (f.band.from) zones.push([0, f.band.from, 'iv:paint', paintRgb]); zones.push([f.band.from || 0, f.band.h, wallKey(f.band.preset), rgbOf(f.band.preset)], [f.band.h, 99, 'iv:paint', paintRgb]); }
      else zones.push([0, 99, 'iv:paint', paintRgb]);
      for (const [za, zb, key, rgb] of zones) put(key, za, zb, rgb);
      return;
    };
    for (const seg of L.solids.segments) {
      for (const key of ['paint', 'render', 'plinth', 'accent', 'reveal']) W.mark(key, { kind: 'wall', wallId: seg.wallId, segId: seg.id, level: L.id });
      const fence = seg.kind === 'fence' || seg.kind === 'parapet';
      for (const piece of seg.pieces) {
        const c = piece.corners, uStart = dot(sub(c.sL, seg.a), seg.dir), uStartR = dot(sub(c.sR, seg.a), seg.dir);
        for (const side of ['L', 'R']) {
          const A = side === 'L' ? c.sL : c.sR, Bp = side === 'L' ? c.eL : c.eR, nrm = side === 'L' ? seg.left : mul(seg.left, -1);
          const space = side === 'L' ? seg.sideL : seg.sideR, interior = !!space && !space.open && !fence;
          const len = dist(A, Bp), uOff = side === 'L' ? uStart : uStartR;
          const z1 = piece.z1;
          if (interior) {
            const tint = space.tint, jS = piece.startCap && seg.joint[0], jE = piece.endCap && seg.joint[1];
            const colorAt = opt.ao ? (u, z) => {
              let a = z < .9 ? .72 + .28 * smooth(z / .9) : 1;
              const zt = ceilZ - z; if (zt < .55) a *= .86 + .14 * smooth(zt / .55);
              if (jS && u < .5) a *= .8 + .2 * smooth(u / .5);
              if (jE && len - u < .5) a *= .8 + .2 * smooth((len - u) / .5);
              return [tint[0] * a, tint[1] * a, tint[2] * a];
            } : () => tint;
            if (IV && space.fin) emitIvFace(space, seg, side, piece, A, Bp, nrm, uOff, len, (u, z) => { // faked ambient occlusion for furnished rooms: darker where wall meets floor, ceiling and the vertical corners
              let a = z < 1.1 ? .6 + .4 * smooth(z / 1.1) : 1; const zt = ceilZ - z; if (zt < .7) a *= .8 + .2 * smooth(zt / .7); if (jS && u < .7) a *= .68 + .32 * smooth(u / .7); if (jE && len - u < .7) a *= .68 + .32 * smooth((len - u) / .7); return a; }, jS, jE);
            else faceGrid('paint', A, Bp, nrm, piece.z0, z1, uOff, colorAt, colRows(len, jS, jE).cols, rowsInterior);
          } else {
            const z0 = (piece.z0 <= 1e-9) ? -groundExt : piece.z0;
            const accent = accentSegs.has(seg.id) && !fence;
            const colorAt = opt.ao ? (u, z) => { const zz = z + (ground ? PL : 0); const a = zz < .5 ? .84 + .16 * smooth(zz / .5) : 1; return [a, a, a]; } : () => WHITE;
            if (accent) faceGrid('accent', A, Bp, nrm, z0, z1, uOff, colorAt, [], [0, .5, 1, 1.5, 2, 2.5, 3]);
            else if (z0 < plinthTop && !fence && fac.plinth !== false) {
              faceGrid('plinth', A, Bp, nrm, z0, Math.min(z1, plinthTop), uOff, colorAt, [], [0]);
              if (z1 > plinthTop) faceGrid('render', A, Bp, nrm, plinthTop, z1, uOff, colorAt, [], []);
            } else faceGrid('render', A, Bp, nrm, z0, z1, uOff, colorAt, [], []);
          }
        }
        // top / bottom / reveals
        const topKey = piece.z1 >= seg.h - 1e-6 ? 'cap' : 'reveal';
        W.flatPoly(topKey, piece.poly, [], E + piece.z1, 1, p => [p.x, -p.y]);
        if (piece.z0 > 1e-6) W.flatPoly('reveal', piece.poly, [], E + piece.z0, -1, p => [p.x, -p.y]);
        const endFace = (A, Bp, n, z0, z1) => faceGrid('reveal', A, Bp, n, z0, z1, 0, () => WHITE, [], []);
        if (piece.kind === 'pier') {
          if (!piece.startCap) endFace(c.sR, c.sL, mul(seg.dir, -1), piece.z0, piece.z1);
          if (!piece.endCap) endFace(c.eL, c.eR, seg.dir, piece.z0, piece.z1);
        }
        if (piece.startCap && seg.deg[0] === 1) endFace(c.sR, c.sL, mul(seg.dir, -1), piece.z0, piece.z1);
        if (piece.endCap && seg.deg[1] === 1) endFace(c.eL, c.eR, seg.dir, piece.z0, piece.z1);
        // skirting boards and ceiling cornice on room faces
        for (const side of ['L', 'R']) {
          const space = side === 'L' ? seg.sideL : seg.sideR; if (!space || space.open || fence) continue;
          const A = side === 'L' ? c.sL : c.sR, Bp = side === 'L' ? c.eL : c.eR, nrm = side === 'L' ? seg.left : mul(seg.left, -1);
          const len = dist(A, Bp); if (len < .05) continue;
          const mid = { x: (A.x + Bp.x) / 2 + nrm.x * .007, y: (A.y + Bp.y) / 2 + nrm.y * .007 }, ry = Math.atan2(Bp.y - A.y, Bp.x - A.x);
          if (IV && space.fin) { // themed skirting, cornice and cove
            const f = space.fin, onFloor = piece.z0 <= 1e-6 && (piece.kind === 'full' || piece.kind === 'pier' || piece.kind === 'sill'), atCeil = piece.z1 >= ceilZ - 1e-6 && piece.kind !== 'sill';
            const at = off => ({ x: (A.x + Bp.x) / 2 + nrm.x * off, y: (A.y + Bp.y) / 2 + nrm.y * off });
            const tiled = f.full && f.full.h >= 1.1, accentStone = f.accent?.preset && accentOf.get(space.key) === seg.id + '|' + side && /ashlar|marble/.test(f.accent.preset);
            if (opt.skirting && onFloor && !tiled) {
              const sk = f.skirt, key = sk.kind === 'marble' ? 'iv:marbleTrim:' + f.floor : 'iv:trim:' + hexKey(f.trim), t1 = sk.kind === 'flat' ? .012 : .018;
              const p1 = at(t1 / 2 + .004); W.box(key, p1.x, E + sk.h / 2, -p1.y, len, sk.h, t1, ry);
              if (sk.kind === 'stepped') { const p2 = at(.014 + .004); W.box(key, p2.x, E + sk.h - .015, -p2.y, len, .03, .028, ry); }
            }
            if (f.band?.cap && piece.z0 < f.band.h - 1e-6 && piece.z1 > f.band.h + 1e-6 && accentOf.get(space.key) !== seg.id + '|' + side) { const p = at(.02); W.box('iv:trim:' + hexKey(f.trim), p.x, E + f.band.h + .012, -p.y, len, .05, .04, ry); }
            if (opt.cornice && atCeil && f.cornice !== 'none') {
              const ck = 'iv:ceil:' + hexKey(f.ceiling);
              if (f.cornice === 'simple') { const p = at(.03); W.box(ck, p.x, E + ceilZ - .035, -p.y, len, .07, .06, ry); }
              else { const p = at(.045), p2 = at(.02); W.box(ck, p.x, E + ceilZ - .05, -p.y, len, .1, .09, ry); W.box(ck, p2.x, E + ceilZ - .13, -p2.y, len, .05, .04, ry); }
            }
            if (f.cove && atCeil && !accentStone) { // dropped gypsum soffit with a warm LED line on the ceiling just beyond its edge
              const ck = 'iv:ceil:' + hexKey(f.ceiling), p = at(.16), q = at(.31 + .04);
              W.box(ck, p.x, E + ceilZ - .06, -p.y, len, .12, .3, ry);
              W.box('iv:led:' + hexKey(f.led), q.x, E + ceilZ - .014, -q.y, len, .012, .05, ry);
            }
          } else {
          if (opt.skirting && piece.z0 <= 1e-6 && (piece.kind === 'full' || piece.kind === 'pier' || piece.kind === 'sill')) W.box('skirting', mid.x, E + .055, -mid.y, len, .11, .014, ry);
          if (opt.cornice && piece.z1 >= ceilZ - 1e-6 && piece.kind !== 'sill') { const m2 = { x: (A.x + Bp.x) / 2 + nrm.x * .02, y: (A.y + Bp.y) / 2 + nrm.y * .02 }; W.box('ceiling', m2.x, E + ceilZ - .04, -m2.y, len, .08, .04, ry); }
          }
        }
      }
      // arch spandrels
      for (const o of seg.openings) if (o.kind === 'arch') {
        const prof = archProfile(o);
        const at = (u, ln, z) => { const p = add(add(o.center, mul(seg.dir, u)), mul(seg.left, ln)); return [p.x, E + z, -p.y]; };
        for (const side of ['L', 'R']) {
          const ln = (side === 'L' ? 1 : -1) * seg.t / 2, space = side === 'L' ? seg.sideL : seg.sideR, interior = !!space && !space.open;
          const ivs = IV && interior && space.fin, key = ivs ? 'iv:paint' : interior ? 'paint' : 'render', col = ivs ? paintLin(space.fin.paint) : interior ? space.tint : WHITE, n3 = [(side === 'L' ? seg.left.x : -seg.left.x), 0, -(side === 'L' ? seg.left.y : -seg.left.y)];
          for (const poly of [prof.left, prof.right]) W.fan(key, poly.map(p => at(p.u, ln, p.z)), n3, p => [p[0], p[1]], undefined, col);
        }
        for (let i = 0; i + 1 < prof.arc.length; i++) {
          const a = prof.arc[i], b = prof.arc[i + 1], mu = (a.u + b.u) / 2, mz = (a.z + b.z) / 2 - (o.z1 - prof.R);
          const nl = Math.hypot(mu, mz) || 1, np = add(mul(seg.dir, -mu / nl), { x: 0, y: 0 });
          void np;
          W.quad('reveal', at(a.u, seg.t / 2, a.z), at(b.u, seg.t / 2, b.z), at(b.u, -seg.t / 2, b.z), at(a.u, -seg.t / 2, a.z), [-(mu / nl) * seg.dir.x, -mz / nl, (mu / nl) * seg.dir.y], null, [WHITE, WHITE, WHITE, WHITE]);
        }
      }
    }

    // ---- parapet + coping on roofs ----------------------------------------------------------------------------------
    const parapetWalls = [];
    if (parapetH > 0) for (const seg of L.solids.segments) {
      if (seg.kind === 'fence' || seg.kind === 'parapet') continue;
      const sp = seg.sideL || seg.sideR;
      if (!(!seg.sideL || !seg.sideR) || !sp || sp.open || sp.covered) continue;
      // wall between a roofed room and the outdoors
      const c = seg.corners;
      for (const [A, Bp, nrm] of [[c.aL, c.bL, seg.left], [c.aR, c.bR, mul(seg.left, -1)]]) {
        const len = dist(A, Bp), ux = (Bp.x - A.x) / len, uy = (Bp.y - A.y) / len, n3 = [nrm.x, 0, -nrm.y];
        const pt = (u, y) => [A.x + ux * u, E + y, -(A.y + uy * u)];
        PA.quad('fence', pt(0, H), pt(len, H), pt(len, H + parapetH), pt(0, H + parapetH), n3, [[0, H], [len, H], [len, H + parapetH], [0, H + parapetH]]);
      }
      parapetWalls.push({ id: seg.wallId + '#' + seg.id, level: L.id, a: seg.a, b: seg.b, t: seg.t + .1, h: .07, kind: 'wall' });
    }
    if (parapetWalls.length) {
      const cop = buildWallSolids(parapetWalls, [], { levelHeight: .07 });
      for (const s of cop.segments) PA.prism({ top: 'cap', side: 'cap', bottom: 'none' }, s.quad, E + H + parapetH, E + H + parapetH + .07);
      for (const j of cop.joints) PA.prism({ top: 'cap', side: 'cap', bottom: 'none' }, j.poly, E + H + parapetH, E + H + parapetH + .07);
    }

    // rich procedural furniture (interior-furniture): on with the interior finish system, or on request (professional photo path); falls back to fixtures3d
    const RICH = opt.richFurniture ?? !!IV, furnStyle = IV ? IV.id : (opt.furnitureStyle || 'contemporary');
    const mkFix = (kind, dims, mats, vkey) => {
      if (RICH && isRichKind(kind)) { try { const g = buildRichFixture(THREE, kind, dims, mats, { style: furnStyle, variant: Math.abs(Math.round(vkey)), seed: dims.seed, low: (opt.quality ?? 1) < .8 }); if (g) return g; } catch { /* fall back to the plain model */ } }
      return buildFixture(THREE, kind, dims, mats);
    };
    // ---- interior helpers: room furniture materials, ceiling pieces, light fittings ----------------------------------------------------
    const roomMatsCache = new Map(), WOOD_NAMES = new Set(['woodDark', 'woodMid', 'woodLight']), FABRIC_NAMES = new Set(['upholstery', 'upholsteryAlt', 'cushionA', 'cushionB', 'cushionC', 'throwFab', 'bedHead', 'majlisFabric', 'majlisCream', 'fabric', 'fabricDark']);
    const roomMats = sp => { // shared fixture materials, recoloured for this room by the theme palette
      if (!IV || !sp?.fin) return { fx: lib.fixtures, led: 'ffdca0' };
      if (roomMatsCache.has(sp.key)) return roomMatsCache.get(sp.key);
      const pal = furniturePalette(IV.id, sp.type, sp.key, IV.seed, IV.pal), fx = { ...lib.fixtures };
      for (const [name, hx] of Object.entries(pal)) { if (!lib.fixtures[name]) continue; fx[name] = lib.get((WOOD_NAMES.has(name) ? 'iv:fxw:' : FABRIC_NAMES.has(name) ? 'iv:fxf:' : 'iv:fx:') + name + ':' + hexKey(hx)) || fx[name]; }
      fx.glow = lib.get('iv:glow:' + hexKey(sp.fin.led)) || fx.lampShade;
      if (IV.pal && pal.rug) fx.rug = lib.get(['iv:rug', IV.id, hexKey(pal.rug), hexKey(IV.pal.accent), hexKey(IV.pal.accent2), hexKey(IV.pal.woodDark)].join(':')) || fx.rug;
      const rm = { fx, led: hexKey(sp.fin.led), pal }; roomMatsCache.set(sp.key, rm); return rm;
    };
    const ivM = rm => name => name === 'iv:glow' ? lib.get('iv:glow:' + (rm?.led || 'ffdca0')) : name.startsWith('iv:') ? lib.get(name) : (rm?.fx?.[name] || lib.fixtures[name] || lib.fixtures.fallback);
    const ivPiece = (kind, x, y, rot, dims, rm, po = {}) => {
      const grp = buildPiece(THREE, kind, dims, ivM(rm), { metal: 'gold', ...po });
      F.addObject(grp, mat => lib.reverse(mat), fixtureMatrix(THREE, x, y, E, rot, null));
    };
    const ivBlob = (x, y, w, d, rot) => {
      const ry = Math.PI - rot, cs = Math.cos(ry), sn = Math.sin(ry), hw = w / 2 * 1.28 + .06, hd = d / 2 * 1.28 + .06;
      const cor = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([px, pz]) => [x + px * cs + pz * sn, E + .005, -y - px * sn + pz * cs]);
      F.quad('shadowBlob', cor[0], cor[1], cor[2], cor[3], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    };
    const ivCeilingFeatures = (sp, room, holesOwn) => {
      const f = sp.fin, rm = roomMats(sp), b = boundsOf(sp.net), inHole = p => holesOwn.some(h => pointInPolygon(p, h, 1e-9));
      let c = sp.centroid && inSpace(sp.centroid, sp) ? sp.centroid : sp.inside;
      const longX = b.w >= b.h, rot = longX ? 0 : Math.PI / 2;
      // exposed timber beams (Najdi): only over plain rectangular rooms, across the short span
      if (f.beams && !holesOwn.length && sp.area >= 10 && sp.area > b.w * b.h * .96 && Math.min(b.w, b.h) > 2.4) {
        const key = 'iv:fxw:woodDark:' + hexKey(rm.pal?.woodDark || '3b2418'), long = Math.max(b.w, b.h), n = Math.max(2, Math.floor(long / .95)), span = Math.min(b.w, b.h) - .1;
        for (let i = 0; i < n; i++) { const t = (i + .5) / n, cx = longX ? b.x0 + t * b.w : (b.x0 + b.x1) / 2, cy = longX ? (b.y0 + b.y1) / 2 : b.y0 + t * b.h; C.box(key, cx, E + ceilZ - .1, -cy, longX ? .17 : span, .2, longX ? span : .17, 0); }
      }
      if (!f.center || !c || inHole(c)) return;
      const dims = { h: ceilZ };
      if (f.center === 'downlight') {
        const w = longX ? Math.min(b.w - 1.0, 4.4) : Math.min(b.w - 1.0, 3.2), d = longX ? Math.min(b.h - 1.0, 3.2) : Math.min(b.h - 1.0, 4.4);
        if (w >= .9 && d >= .9) { ivPiece('downlight', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0, { w, d, h: ceilZ }, rm, {}); return; }
        if (Math.max(b.w, b.h) > 2.2) { const len = Math.min(Math.max(b.w, b.h) - 1, 4.4); ivPiece('downlight', c.x, c.y, 0, { w: longX ? len : .1, d: longX ? .1 : len, h: ceilZ }, rm, {}); return; }
        ivPiece('flush', c.x, c.y, 0, dims, rm, {}); return;
      }
      if (f.center === 'pendantLine') { const dt = doc.fixtures.find(q => q.level === L.id && q.kind === 'dining-table' && inSpace({ x: q.x, y: q.y }, sp)); if (dt) { ivPiece('pendantLine', dt.x, dt.y, dt.rot || 0, { w: Math.min(1.5, (dt.w || 1.8) * .8), d: .2, h: ceilZ }, rm, {}); return; } }
      if (f.center === 'linear' || f.center === 'pendantLine') { ivPiece(f.center === 'linear' ? 'linear' : 'pendantLine', c.x, c.y, rot, { w: Math.min(1.6, Math.max(.9, Math.min(b.w, b.h) * .45)), d: .14, h: ceilZ }, rm, {}); return; }
      ivPiece(f.center, c.x, c.y, 0, f.center === 'chandelier' ? { w: Math.min(.95, Math.min(b.w, b.h) * .3), d: Math.min(.95, Math.min(b.w, b.h) * .3), h: ceilZ } : dims, rm, {});
    };

    // ---- rooms: floors, ceilings, roofs, slabs ----------------------------------------------------------------------
    for (const sp of L.spaces) {
      const holes = holesFor(L, sp), net = sp.net, polyHoles = sp.holes;
      const floorKey = (doc.finish?.floors || {})[sp.type] || (IV && sp.fin ? 'iv:floor:' + sp.fin.floor : ROOM_TYPES[sp.type]?.floor) || 'tile';
      const floorMat = lib.get(floorKey) || lib.get('tile');
      const fb = new MeshBuilder(THREE);
      fb.flatPoly(floorKey, net, [...polyHoles, ...holes.below], E, 1, p => [p.x, -p.y]);
      const geo = fb.toGeometries().get(floorKey);
      const mesh = new THREE.Mesh(geo, floorMat); mesh.receiveShadow = true; mesh.name = 'floor:' + sp.key;
      mesh.userData = { kind: 'room', room: sp.key, spaceId: sp.id, levelId: L.id };
      parts.floors.add(mesh);
      holes.below.forEach(h => { // slab edge around a stairwell
        for (let i = 0; i < 4; i++) { const a = h[i], b = h[(i + 1) % 4]; S.quad('slabEdge', P3(a.x, a.y, E - T), P3(b.x, b.y, E - T), P3(b.x, b.y, E), P3(a.x, a.y, E), null, [[0, 0], [dist(a, b), 0], [dist(a, b), T], [0, T]]); }
      });
      const bnds = boundsOf(net);
      const room = { key: sp.key, id: sp.key, spaceId: sp.id, levelId: L.id, levelIndex: L.i, name: sp.name, type: sp.type, label: sp.label, floorKind: floorKey, area: sp.area, polygon: net, holes: polyHoles, bounds: bnds, centroid: sp.centroid, inside: sp.inside, elevation: E, height: H, open: sp.open, floor: mesh, edges: sp.edges };
      rooms.set(sp.key, room);
      if (!sp.open) {
        C.flatPoly(IV && sp.fin ? 'iv:ceil:' + hexKey(sp.fin.ceiling) : 'ceiling', net, [...polyHoles, ...holes.own], E + ceilZ, -1, p => [p.x, p.y]);
        if (IV && sp.fin) ivCeilingFeatures(sp, room, holes.own);
        if (!sp.covered) R.flatPoly('roof', net, [...polyHoles, ...holes.own], E + H, 1, p => [p.x, -p.y]);
      }
      holes.own.forEach(h => { // the hole's edge in the slab above
        for (let i = 0; i < 4; i++) { const a = h[i], b = h[(i + 1) % 4]; S.quad('slabEdge', P3(a.x, a.y, E + ceilZ), P3(b.x, b.y, E + ceilZ), P3(b.x, b.y, E + H), P3(a.x, a.y, E + H), null, [[0, 0], [dist(a, b), 0], [dist(a, b), T], [0, T]]); }
      });
    }
    // AO strips come from the wall pieces (they already know their room face and the door gaps)
    if (opt.ao) {
      const strip = (A, Bp, nrm, wdt, a0, y, down) => {
        const q0 = [A.x, y, -A.y], q1 = [Bp.x, y, -Bp.y], q2 = [Bp.x + nrm.x * wdt, y, -(Bp.y + nrm.y * wdt)], q3 = [A.x + nrm.x * wdt, y, -(A.y + nrm.y * wdt)];
        D.quad('aoDecal', q0, q1, q2, q3, [0, down ? -1 : 1, 0], null, [[0, 0, 0, a0], [0, 0, 0, a0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      };
      for (const seg of L.solids.segments) {
        if (seg.kind === 'fence' || seg.kind === 'parapet') continue;
        for (const piece of seg.pieces) {
          const c = piece.corners;
          for (const side of ['L', 'R']) {
            const space = side === 'L' ? seg.sideL : seg.sideR; if (!space || space.open) continue;
            const A = side === 'L' ? c.sL : c.sR, Bp = side === 'L' ? c.eL : c.eR, nrm = side === 'L' ? seg.left : mul(seg.left, -1);
            if (piece.z0 <= 1e-6 && piece.kind !== 'lintel') strip(A, Bp, nrm, .5, .34, E + .006, false);
            if (piece.z1 >= ceilZ - 1e-6) strip(A, Bp, nrm, .45, .2, E + ceilZ - .004, true);
          }
        }
      }
      // outdoors: dark contact band around the ground floor walls
      if (ground) for (const seg of L.solids.segments) {
        if (seg.kind === 'fence' || seg.kind === 'parapet') continue;
        for (const piece of seg.pieces) {
          if (piece.z0 > 1e-6) continue; const c = piece.corners;
          for (const side of ['L', 'R']) {
            const space = side === 'L' ? seg.sideL : seg.sideR; if (space && !space.open) continue;
            const A = side === 'L' ? c.sL : c.sR, Bp = side === 'L' ? c.eL : c.eR, nrm = side === 'L' ? seg.left : mul(seg.left, -1);
            strip(A, Bp, nrm, .7, .3, E - PL + .012, false);
          }
        }
      }
    }

    const windowsToDress = [];
    // ---- openings (frames, doors, glass) ----------------------------------------------------------------------------
    for (const seg of L.solids.segments) for (const o of seg.openings) {
      const door = o.entry ? 'closed' : opt.doors;
      // interior doors take the theme's leaf / frame / handle; entry and façade openings keep their exterior materials
      let keys; if (IV && seg.ext === 0 && !o.entry) { const D = IV.T.door; keys = { leaf: (D.style === 'wood' ? 'iv:door:' : 'iv:doorp:') + hexKey(D.leaf), leafWhite: 'iv:doorp:' + hexKey(D.leaf), frame: 'iv:trim:' + hexKey(D.frame), handle: 'iv:metal:' + D.metal, sill: 'iv:trim:' + hexKey(D.frame) }; }
      emitOpening(O, o, { E, ext: seg.ext, door: seg.ext !== 0 ? 'closed' : door, ...(keys ? { keys } : {}) });
      if (IV && seg.ext !== 0 && (o.kind === 'window' || o.kind === 'window2' || o.kind === 'slider')) { // room-side casing (architrave + stool) and curtains
        const roomSide = -seg.ext, rs = roomSide > 0 ? seg.sideL : seg.sideR, tk = 'iv:trim:' + hexKey(rs?.fin?.trim || IV.T.trim);
        if (rs && rs.fin) {
          const ln = roomSide * (seg.t / 2 + .008), ry = Math.atan2(o.dir.y, o.dir.x), z0 = E + o.z0, tw = .07;
          const bxp = (lu, y, sx, sy, sz, l = ln) => { const p = { x: o.center.x + o.dir.x * lu + o.left.x * l, y: o.center.y + o.dir.y * lu + o.left.y * l }; O.box(tk, p.x, y, -p.y, sx, sy, sz, ry); };
          bxp(-(o.w / 2 + tw / 2), z0 + o.h / 2 + tw / 2, tw, o.h + tw, .016); bxp(o.w / 2 + tw / 2, z0 + o.h / 2 + tw / 2, tw, o.h + tw, .016); bxp(0, z0 + o.h + tw / 2, o.w + 2 * tw, tw, .016);
          if (o.kind !== 'slider' && o.z0 > .2) bxp(0, z0 - .012, o.w + .2, .03, .09, roomSide * (seg.t / 2 + .03));
          windowsToDress.push({ seg, o, space: rs, roomSide });
        }
      }
      // entry steps, landing and canopy
      if (ground && seg.ext !== 0 && ['door', 'door2', 'slider', 'arch'].includes(o.kind) && o.entry) {
        const out = mul(seg.left, seg.ext), side = { x: -out.y, y: out.x }, hw = o.w / 2 + .55, face = seg.t / 2;
        const tops = [-.02, -.02 - PL * .3, -.02 - PL * .62];
        const depth = [1.25, .32, .32];
        let d0 = face;
        tops.forEach((top, idx) => {
          const d1 = d0 + depth[idx], grow = idx * .22, a = hw + grow;
          const p0 = add(add(o.center, mul(out, d0)), mul(side, -a)), p1 = add(add(o.center, mul(out, d0)), mul(side, a)), p2 = add(add(o.center, mul(out, d1)), mul(side, a)), p3 = add(add(o.center, mul(out, d1)), mul(side, -a));
          O.prism({ top: 'stairTread', side: 'stairRiser', bottom: 'none' }, [p0, p1, p2, p3], E - PL, E + top);
          d0 = d1;
        });
        // canopy
        const proj = 1.55, cw = o.w + 1.7, cz = o.z1 + .52, ch = .16;
        const q0 = add(add(o.center, mul(out, face - .02)), mul(side, -cw / 2)), q1 = add(add(o.center, mul(out, face - .02)), mul(side, cw / 2));
        const q2 = add(q1, mul(out, proj)), q3 = add(q0, mul(out, proj));
        O.prism({ top: 'cap', side: 'trim', bottom: 'trim' }, [q0, q1, q2, q3], E + cz, E + cz + ch);
        result.entry = { levelId: L.id, point: o.center, normal: out, width: o.w, wallId: seg.wallId, opening: o.id, steps: 1.25 + .64 };
      }
    }

    // ---- stairs -----------------------------------------------------------------------------------------------------
    for (const st of L.stairs) emitStair(S, st.layout, E, { glass: 'glass' });
    // guard rail around the stairwell hole in the floor above
    const upper = lvData[L.i + 1];
    for (const st of L.stairs) {
      const lay = st.layout, holeInUse = upper ? upper.spaces.some(s => lay.hole.every(p => inSpace(p, s))) : L.spaces.some(s => lay.hole.every(p => inSpace(p, s)));
      if (!holeInUse) continue;
      const lastStep = lay.steps[lay.steps.length - 1], lc = lastStep ? centroid(lastStep.poly) : lay.hole[2];
      const yFloor = E + (st.toE - E);
      // skip the hole edge nearest to the arrival (top) step
      let skip = 0, best = Infinity;
      for (let i = 0; i < 4; i++) { const a = lay.hole[i], b = lay.hole[(i + 1) % 4], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = dist(m, lc); if (d < best) { best = d; skip = i; } }
      for (let i = 0; i < 4; i++) {
        if (i === skip) continue;
        const a = lay.hole[i], b = lay.hole[(i + 1) % 4], len = dist(a, b), n = Math.max(1, Math.ceil(len / 1.2));
        S.beam('metal', P3(a.x, a.y, yFloor + .96), P3(b.x, b.y, yFloor + .96), .05, .04);
        S.beam('metal', P3(a.x, a.y, yFloor + .5), P3(b.x, b.y, yFloor + .5), .02, .02);
        for (let k = 0; k <= n; k++) { const t = k / n, px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t; S.beam('metal', P3(px, py, yFloor), P3(px, py, yFloor + .96), .04, .04); }
      }
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------
    if (opt.fixtures) {
      const keyOf = mat => lib.reverse(mat);
      for (const fx of doc.fixtures.filter(f => f.level === L.id)) {
        const def = FIXTURES[fx.kind]; if (!def) continue;
        if (def.outdoor && fx.kind !== 'tree') continue; // مسبح/شلال/عشب/أحواض: يرسمها site3d على أرض الحوش
        const dims = { w: fx.w ?? def.w, d: fx.d ?? def.d, h: fx.h ?? def.h, seed: fx.x * 3.1 + fx.y };
        const grp = mkFix(fx.kind, dims, IV ? roomMats(L.locate({ x: fx.x, y: fx.y })).fx : lib.fixtures, fx.x * 7 + fx.y * 13);
        const m = fixtureMatrix(THREE, fx.x, fx.y, E, fx.rot || 0, fx.kind);
        F.addObject(grp, keyOf, m);
        if (opt.ao && fx.kind !== 'rug' && fx.kind !== 'car' && fx.kind !== 'tree') { // contact shadow
          const ry = Math.PI - (fx.rot || 0), cs = Math.cos(ry), sn = Math.sin(ry);
          const hw = dims.w / 2 * 1.28 + .08, hd = dims.d / 2 * 1.28 + .08;
          const cor = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [fx.x + x * cs + z * sn, E + .005, -fx.y - x * sn + z * cs]);
          F.quad('shadowBlob', cor[0], cor[1], cor[2], cor[3], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
        const rot = fx.rot || 0, ca = Math.cos(rot), sa = Math.sin(rot);
        if (fx.kind !== 'rug') fixtureBoxes.push({ level: L.id, id: fx.id, kind: fx.kind, x: fx.x, y: fx.y, hw: dims.w / 2, hd: dims.d / 2, rot, poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const lx = sx * dims.w / 2, ly = sy * dims.d / 2; return { x: fx.x + lx * ca + ly * sa, y: fx.y - lx * sa + ly * ca }; }) });
      }
    }

    // ---- illustrative interior dressing (extra pieces, curtains) — never part of the document or its quantities ------------------------------
    if (IV && opt.fixtures) {
      const keyOf = mat => lib.reverse(mat), pickN = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
      let dn = 0;
      if (opt.dress) for (const sp of L.spaces) {
        if (sp.open || !sp.fin) continue;
        const inRoom = doc.fixtures.filter(f => f.level === L.id && inSpace({ x: f.x, y: f.y }, sp)); let plan;
        try { plan = dressRoom({ space: sp, level: L, fixtures: inRoom, themeId: IV.id }); } catch { continue; }
        const rm = roomMats(sp), list = [];
        for (const it of plan.items) {
          const dm = { w: it.w, d: it.d, h: it.h, seed: it.x * 3.1 + it.y };
          if (!it.piece) { F.addObject(mkFix(it.kind, dm, rm.fx, it.x * 7 + it.y * 13), keyOf, fixtureMatrix(THREE, it.x, it.y, E, it.rot || 0, it.kind)); }
          else {
            const po = { ...(it.po || {}), seed: ++dn };
            if (it.kind === 'wall-art') { const A = IV.T.art, kd = pickN(A.kinds, ((dn * 37 + (sp.fin.seed * 1000 | 0)) % 97) / 97), apal = IV.pal ? [IV.pal.wall, IV.pal.mainAlt, IV.pal.main, IV.pal.accent] : A.pal; po.art = lib.iv.art(kd, apal, dn % 4); po.frame = IV.T.metal === 'black' ? 'blackMetal' : (sp.fin.seed > .5 ? 'woodDark' : 'gold'); }
            if (it.kind === 'wall-mirror') po.frame = IV.T.metal === 'black' ? 'blackMetal' : 'gold';
            if (it.kind === 'console' || it.kind === 'sideboard' || it.kind === 'bookcase' || it.kind === 'dresser') { po.wood = 'woodMid'; po.top = it.kind === 'console' || it.kind === 'sideboard' ? 'marbleTop' : 'woodMid'; }
            ivPiece(it.kind, it.x, it.y, it.rot || 0, dm, rm, po);
          }
          if (it.kind !== 'rug' && it.role !== 'wall') {
            ivBlob(it.x, it.y, it.w, it.d, it.rot || 0);
            const rot = it.rot || 0, ca = Math.cos(rot), sa = Math.sin(rot);
            fixtureBoxes.push({ level: L.id, id: 'dress' + (++dn), kind: it.kind, x: it.x, y: it.y, hw: it.w / 2, hd: it.d / 2, rot, poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const lx = sx * it.w / 2, ly = sy * it.d / 2; return { x: it.x + lx * ca + ly * sa, y: it.y - lx * sa + ly * ca }; }) });
          }
          list.push({ kind: it.kind, x: it.x, y: it.y, rot: it.rot || 0, w: it.w, d: it.d, h: it.h });
        }
        IV.dressed.push({ room: sp.key, type: sp.type, items: list });
      }
      for (const { seg, o, space, roomSide } of windowsToDress) { // full-height curtains on habitable-room windows
        if (!['majlis', 'living', 'bedroom', 'master', 'dining', 'office'].includes(space.type) || o.w < .8) continue;
        const nrm = mul(seg.left, roomSide), c = add(o.center, mul(nrm, seg.t / 2 + .1)), rm = roomMats(space), T = IV.T, r = space.fin.seed;
        const fab = 'iv:fab:' + hexKey(IV.pal ? IV.pal.curtain : pickN(T.curtain, r)), sheer = 'iv:sheer:' + hexKey(space.fin.paint);
        ivPiece('curtain', c.x, c.y, Math.atan2(nrm.x, nrm.y), { w: o.w + .7, d: .12, h: ceilZ - .06 }, rm, { fabric: fab, sheer, seed: 1, style: IV.id, metal: IV.T.metal === 'black' ? 'blackMetal' : 'gold', tie: IV.T.metal === 'black' ? 'blackMetal' : 'gold' });
      }
    }

    // ---- meshes from builders ---------------------------------------------------------------------------------------
    const toMeshes = (builder, part, { cast = true, receive = true, order = 0, tagged = false } = {}) => {
      for (const [key, geo] of builder.toGeometries()) {
        const mat = lib.get(key); if (!mat) continue;
        const mesh = new THREE.Mesh(geo, mat); mesh.name = L.id + ':' + part.name + ':' + key;
        mesh.castShadow = cast && !mat.transparent; mesh.receiveShadow = receive; mesh.renderOrder = order || (mat.transparent ? 3 : 0);
        if (tagged || geo.userData.tags) { mesh.userData.tags = geo.userData.tags; mesh.userData.levelId = L.id; }
        part.add(mesh);
      }
    };
    toMeshes(W, parts.walls, { tagged: true });
    toMeshes(O, parts.openings);
    toMeshes(C, parts.ceilings, { cast: false });
    toMeshes(R, parts.roof);
    toMeshes(PA, parts.parapet);
    toMeshes(F, parts.fixtures);
    toMeshes(S, parts.stairs);
    toMeshes(D, parts.decals, { cast: false, receive: false, order: 1 });
    // doc roof flag: the roof of the top level may be hidden by the viewer
    L.group = lg; L.parts = parts;
    const triangles = [W, O, C, R, PA, F, S, D].reduce((n, b) => n + b.triangleCount, 0);
    // collision data for walking
    L.colliders = blockingPolygons(L.solids);
    group.add(lg);
    const eps = .001;
    result.levels.push({ id: L.id, name: L.name, index: L.i, elevation: E, height: H, top: E + H, group: lg, parts, solids: L.solids, analysis: L.analysis, spaces: L.spaces, locate: L.locate, colliders: L.colliders, stairs: L.stairs, triangles, topLevel: isTop, eps });
  }
  result.fixtureBoxes = fixtureBoxes;

  // ---- site ---------------------------------------------------------------------------------------------------------
  let bbox = boundsOf(outlineAll.flat().length ? outlineAll.flat() : doc.walls.flatMap(w => [w.a, w.b]));
  if (opt.site) {
    const entry = result.entry;
    result.site = buildSite(THREE, doc, lib, { y: -PL, outline: groundOutline, entryPoint: entry?.point || null, entryNormal: entry?.normal || null, stepsOut: entry?.steps, skipCar: !opt.car });
    group.add(result.site.group);
    result.site.group.position.y = 0;
  }
  const plotB = doc.plot?.polygon?.length ? boundsOf(doc.plot.polygon) : null;
  const topY = lvData[top].E + lvData[top].H + (doc.roof?.parapet ?? .9) + .1;
  result.bounds = { x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1, minY: -PL, maxY: topY, w: bbox.w, h: bbox.h };
  result.plotBounds = plotB;
  result.footprint = groundOutline;
  result.groundY = -PL;

  // ---- statistics ---------------------------------------------------------------------------------------------------
  let meshes = 0, triangles = 0;
  group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  result.stats = { meshes, triangles, rooms: rooms.size, levels: lvData.length };

  /** Which room contains a plan point on a level (id or index)? */
  result.roomAt = (x, y, levelRef = 0) => {
    const lv = typeof levelRef === 'number' ? result.levels[levelRef] : result.levels.find(l => l.id === levelRef);
    const sp = lv?.locate({ x, y }); return sp ? rooms.get(sp.key) : null;
  };
  result.dispose = () => {
    const geos = new Set();
    group.traverse(o => { if (o.isMesh) geos.add(o.geometry); });
    geos.forEach(g => g.dispose());
    if (ownLib) lib.dispose();
    group.removeFromParent();
  };
  return result;
}

/** Flat dark "poché" polygons where walls are cut by a horizontal plane at `height` (metres above the datum). */
export function buildSectionCap(THREE, built, height, material) {
  const B = new MeshBuilder(THREE), g = new THREE.Group(); g.name = 'section-cap';
  for (const lv of built.levels) {
    const zr = height - lv.elevation; if (zr < 0 || zr > lv.height) continue;
    for (const seg of lv.solids.segments) for (const p of seg.pieces) if (p.z0 <= zr && p.z1 >= zr) B.flatPoly('section', p.poly, [], height + .002, 1, q => [q.x, -q.y]);
    for (const j of lv.solids.joints) B.flatPoly('section', j.poly, [], height + .002, 1);
  }
  for (const [, geo] of B.toGeometries()) { const m = new THREE.Mesh(geo, material); m.renderOrder = 2; g.add(m); }
  return g;
}

export default { buildBuildingScene, buildSectionCap, stairLayout, stairHeightAt, DEFAULTS };
