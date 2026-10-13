// Furniture, sanitary ware, kitchen units, cars and plants for the 3D engine.
//
// buildFixture(THREE, kind, dims, materials) -> THREE.Group
//   * every kind of catalog FIXTURES is covered (plus 'palm' and 'shrub' used for the garden);
//   * model space: origin at the middle of the footprint on the floor, +x = width, +y = up,
//     the FRONT of the object (where you sit / open the doors) faces +z, the BACK is at -z;
//   * sizes follow `dims` ({w, d, h}); decorative parts may exceed `h` a little (cushions, wall units, TVs);
//   * all geometries are shared-material meshes, so scene3d can merge the whole group by material.
import { FIXTURES } from './catalog.mjs';

/** Name -> MeshStandardMaterial parameters.  `createFixtureMaterials` instantiates them lazily. */
export const FIXTURE_MATERIAL_SPECS = Object.freeze({
  fabric:       { color: '#cdbda3', roughness: 1 },
  fabricDark:   { color: '#6b6258', roughness: 1 },
  fabricBlue:   { color: '#4a6275', roughness: 1 },
  majlisFabric: { color: '#7d2f33', roughness: .95 },
  majlisCream:  { color: '#d9c7a1', roughness: .95 },
  gold:         { color: '#c8a24a', roughness: .35, metalness: .85 },
  leather:      { color: '#6b4630', roughness: .55 },
  woodDark:     { color: '#4d3425', roughness: .6 },
  woodMid:      { color: '#8a6446', roughness: .6 },
  woodLight:    { color: '#c9a77d', roughness: .65 },
  lacquer:      { color: '#f1f0ec', roughness: .35 },
  lacquerGrey:  { color: '#8f918f', roughness: .4 },
  quartz:       { color: '#ebe9e3', roughness: .25 },
  granite:      { color: '#2e2f31', roughness: .3 },
  marbleTop:    { color: '#efece6', roughness: .18 },
  steel:        { color: '#bfc2c4', roughness: .35, metalness: .9 },
  chrome:       { color: '#e5e7e8', roughness: .12, metalness: 1 },
  blackMetal:   { color: '#232426', roughness: .45, metalness: .7 },
  ceramic:      { color: '#fbfbfa', roughness: .12 },
  linen:        { color: '#f2f0ea', roughness: .95 },
  duvet:        { color: '#d6cfc0', roughness: .95 },
  duvetAccent:  { color: '#8a6f4a', roughness: .95 },
  pillowA:      { color: '#e9e4d8', roughness: .95 },
  pillowB:      { color: '#a8885a', roughness: .95 },
  screen:       { color: '#0d0e10', roughness: .15, metalness: .3 },
  lampShade:    { color: '#f4e7c8', roughness: .9, emissive: '#d9b878', emissiveIntensity: .25 },
  leafA:        { color: '#3f7a3a', roughness: .75 },
  leafB:        { color: '#5e9447', roughness: .75 },
  frond:        { color: '#4f8a3a', roughness: .8, side: 'double' },
  trunk:        { color: '#6d553d', roughness: .95 },
  soil:         { color: '#3a2c20', roughness: 1 },
  pot:          { color: '#b86a48', roughness: .8 },
  potStone:     { color: '#9a958c', roughness: .9 },
  carBody:      { color: '#f4f4f2', roughness: .25, metalness: .6 },
  carGlass:     { color: '#16212b', roughness: .06, metalness: .4 },
  carTrim:      { color: '#1b1c1e', roughness: .6 },
  tire:         { color: '#141414', roughness: .95 },
  rim:          { color: '#c7c9cb', roughness: .25, metalness: 1 },
  headlight:    { color: '#fff8e6', roughness: .1, emissive: '#fff1c8', emissiveIntensity: .6 },
  taillight:    { color: '#b3141b', roughness: .2, emissive: '#7a0b10', emissiveIntensity: .5 },
  fglass:       { color: '#bfe0ee', roughness: .05, opacity: .26, transparent: true, depthWrite: false },
  mirror:       { color: '#d7e2ea', roughness: .03, metalness: 1 },
  water:        { color: '#e9eef0', roughness: .2 },
  fallback:     { color: '#cccccc', roughness: .8 },
});

export function createFixtureMaterials(THREE, extra = {}) {
  const out = {};
  for (const [name, spec] of Object.entries(FIXTURE_MATERIAL_SPECS)) {
    const { side, ...rest } = spec;
    const params = { ...rest };
    if (side === 'double') params.side = THREE.DoubleSide;
    out[name] = new THREE.MeshStandardMaterial(params);
    out[name].name = name;
  }
  for (const [name, material] of Object.entries(extra)) out[name] = material;
  return out;
}

/** Yaw (radians, three.js) a fixture needs on top of the document rotation: beds have their head toward +y, nightstands face -y. */
export const FIXTURE_YAW = Object.freeze({ 'bed-double': Math.PI, 'bed-single': Math.PI, nightstand: Math.PI });

/** World matrix for a document fixture: plan (x, y), floor height, document rotation (clockwise positive, front = +y at 0). */
export function fixtureMatrix(THREE, x, y, elevation = 0, rot = 0, kind = null) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI - rot + (FIXTURE_YAW[kind] || 0));
  return m.compose(new THREE.Vector3(x, elevation, -y), q, new THREE.Vector3(1, 1, 1));
}

export const FIXTURE_KINDS =Object.freeze([...Object.keys(FIXTURES), 'palm', 'shrub']);

/** Box-projected UVs in metres (so tiling textures keep a constant scale whatever the object). */
function metreUV(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE_BufferAttr(uv));
  return geo;
}
let THREE_BufferAttr = null;

/** Box with rounded edges (smooth normals), cheap: 3 segments per axis. */
export function roundedBoxGeometry(THREE, w, h, d, r = .02) {
  r = Math.max(0, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const geo = new THREE.BoxGeometry(2, 2, 2, 3, 3, 3);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const hx = w / 2, hy = h / 2, hz = d / 2, ix = hx - r, iy = hy - r, iz = hz - r;
  const map = (u, half, inner) => { const s = Math.sign(u), a = Math.abs(u); return s * (a > .5 ? half : inner); };
  const v = new THREE.Vector3(), c = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = map(pos.getX(i), hx, ix), y = map(pos.getY(i), hy, iy), z = map(pos.getZ(i), hz, iz);
    v.set(x, y, z);
    c.set(Math.max(-ix, Math.min(ix, x)), Math.max(-iy, Math.min(iy, y)), Math.max(-iz, Math.min(iz, z)));
    dir.subVectors(v, c);
    if (dir.lengthSq() > 1e-12 && r > 0) { dir.normalize(); v.copy(c).addScaledVector(dir, r); nor.setXYZ(i, dir.x, dir.y, dir.z); }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

/** Deterministic pseudo random generator. */
export const rng = seed => { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

export function buildFixture(THREE, kind, dims = {}, materials = null) {
  THREE_BufferAttr = THREE.BufferAttribute;
  const mats = materials || createFixtureMaterials(THREE);
  const def = FIXTURES[kind] || {};
  const w = dims.w ?? def.w ?? 1, d = dims.d ?? def.d ?? 1, h = dims.h ?? def.h ?? 1;
  const g = new THREE.Group();
  g.name = 'fixture:' + kind; g.userData.kind = kind; g.userData.dims = { w, d, h };
  const M = n => mats[n] || mats.fallback;
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, uvUnit = null) => {
    metreUV(geo);
    if (uvUnit) { const p = geo.attributes.position, uv = geo.attributes.uv; geo.computeBoundingBox(); const b = geo.boundingBox; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getZ(i) - b.min.z) / (b.max.z - b.min.z)); }
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? M(mat) : mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };
  // sx,sy,sz = size; x,y0,z = centre x, BOTTOM y, centre z
  const box = (mat, sx, sy, sz, x, y0, z, ry = 0, rx = 0, rz = 0) => add(new THREE.BoxGeometry(sx, sy, sz), mat, x, y0 + sy / 2, z, rx, ry, rz);
  const rbox = (mat, sx, sy, sz, r, x, y0, z, ry = 0, rx = 0, rz = 0) => add(roundedBoxGeometry(THREE, sx, sy, sz, r), mat, x, y0 + sy / 2, z, rx, ry, rz);
  const cyl = (mat, rt, rb, hh, x, y0, z, seg = 14, rx = 0, rz = 0, ry = 0) => add(new THREE.CylinderGeometry(rt, rb, hh, seg), mat, x, y0 + hh / 2, z, rx, ry, rz);
  const ell = (mat, rx_, ry_, rz_, x, y, z, ws = 10, hs = 7, rx = 0, ry = 0, rz = 0) => add(new THREE.SphereGeometry(1, ws, hs), mat, x, y, z, rx, ry, rz, rx_, ry_, rz_);
  const bar = (mat, len, th, x, y, z, axis = 'y', seg = 8) => { // thin cylinder along an axis, centred at (x,y,z)
    const m = cyl(mat, th, th, len, x, y - len / 2, z, seg); if (axis === 'x') { m.rotation.z = Math.PI / 2; m.position.set(x, y, z); } else if (axis === 'z') { m.rotation.x = Math.PI / 2; m.position.set(x, y, z); } return m;
  };

  const builders = {
    'bed-double': () => bed(Math.min(w, 2.2), d, true),
    'bed-single': () => bed(w, d, false),
    wardrobe, nightstand, desk,
    'sofa-3': () => sofa(3), 'sofa-2': () => sofa(2), armchair: () => sofa(1),
    'coffee-table': coffeeTable, 'tv-unit': tvUnit, 'majlis-sofa': majlisSofa,
    'dining-table': diningTable, chair: () => chair(0, 0, 0, w, d, h),
    'kitchen-run': kitchenRun, fridge, stove, wc, basin, shower, bathtub, 'washing-machine': washingMachine,
    plant, rug, car, tree, palm, shrub,
  };

  function bed(bw, bd, dbl) {
    const frameH = .26, matH = .24;
    box('woodDark', bw - .08, .17, bd - .1, 0, 0, 0.0);                       // recessed plinth/base
    rbox('woodMid', bw + .04, frameH - .1, bd + .02, .02, 0, .16, 0);          // frame
    // headboard (upholstered, tall) at the back (-z)
    rbox('fabricDark', bw + .08, .98, .1, .03, 0, .1, -bd / 2 - .0);
    for (let i = 0; i < (dbl ? 3 : 2); i++) { const n = dbl ? 3 : 2, pw = (bw - .1) / n; rbox('fabric', pw - .04, .52, .04, .02, -bw / 2 + .05 + pw * (i + .5), .5, -bd / 2 + .06); }
    rbox('linen', bw - .04, matH, bd - .12, .07, 0, frameH + .06, .04);        // mattress
    // duvet over the lower two thirds, falling over the sides
    const dl = (bd - .12) * .66;
    rbox('duvet', bw + .02, matH * .5, dl, .05, 0, frameH + .06 + matH * .62, .04 + (bd - .12) / 2 - dl / 2);
    rbox('duvet', .06, matH * 1.1, dl, .03, -bw / 2 - .005, frameH - .02, .04 + (bd - .12) / 2 - dl / 2);
    rbox('duvet', .06, matH * 1.1, dl, .03, bw / 2 + .005, frameH - .02, .04 + (bd - .12) / 2 - dl / 2);
    rbox('duvetAccent', bw - .06, .02, .38, .01, 0, frameH + .06 + matH * .62 + matH * .5 - .005, bd / 2 - .38); // foot throw
    const np = dbl ? 2 : 1;
    for (let i = 0; i < np; i++) { const x = np === 1 ? 0 : (i - .5) * (bw * .5); rbox('pillowA', Math.min(.62, bw / np - .1), .13, .4, .06, x, frameH + .06 + matH - .02, -bd / 2 + .38, i ? .06 : -.05); }
    if (dbl) { rbox('pillowB', .45, .12, .22, .05, .0, frameH + .06 + matH + .08, -bd / 2 + .56, .0, -.35); }
  }

  function wardrobe() {
    const n = Math.max(2, Math.round(w / .55)), dw = w / n, plinth = .08;
    box('woodDark', w, plinth, d - .04, 0, 0, -.01);
    box('woodLight', w, h - plinth - .06, d - .02, 0, plinth, -.01);                 // carcass
    box('woodLight', w + .04, .06, d + .02, 0, h - .06, 0);                           // cornice
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + dw * (i + .5);
      rbox(i % 2 ? 'lacquer' : 'lacquer', dw - .006, h - plinth - .1, .022, .004, x, plinth + .02, d / 2 - .005);
      // inset panel on every door
      rbox('woodLight', dw - .12, h - plinth - .32, .008, .002, x, plinth + .14, d / 2 + .008);
      const side = i % 2 ? -1 : 1;
      bar('gold', .32, .006, x + side * (dw / 2 - .05), plinth + (h - plinth) * .5, d / 2 + .03, 'y', 6);
    }
  }

  function nightstand() {
    rbox('woodMid', w, h - .12, d, .015, 0, .1, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl('woodDark', .016, .012, .12, sx * (w / 2 - .05), 0, sz * (d / 2 - .05), 6);
    rbox('woodLight', w - .06, (h - .16) / 2 - .01, .02, .005, 0, .14, d / 2 + .005); rbox('woodLight', w - .06, (h - .16) / 2 - .01, .02, .005, 0, .14 + (h - .16) / 2, d / 2 + .005);
    bar('gold', .1, .006, 0, .14 + (h - .16) / 4, d / 2 + .03, 'x', 6); bar('gold', .1, .006, 0, .14 + (h - .16) * .75, d / 2 + .03, 'x', 6);
    // lamp
    cyl('gold', .045, .06, .03, -.1, h - .02, -.05, 12); cyl('gold', .01, .01, .2, -.1, h + .01, -.05, 6);
    add(new THREE.CylinderGeometry(.09, .13, .16, 14, 1, true), 'lampShade', -.1, h + .28, -.05);
  }

  function desk() {
    box('woodLight', w, .04, d, 0, h - .04, 0);
    box('woodDark', .04, h - .04, d - .06, -w / 2 + .03, 0, 0); box('woodDark', .04, h - .04, d - .06, w / 2 - .03, 0, 0);
    box('woodDark', w - .1, .5, .02, 0, h - .55, -d / 2 + .06);
    rbox('woodMid', .45, .5, d - .08, .01, w / 2 - .3, h - .55, 0);
    box('gold', .1, .008, .008, w / 2 - .3, h - .38, d / 2 - .04);
    // monitor + keyboard
    box('blackMetal', .2, .01, .16, 0, h, -.12); box('blackMetal', .03, .24, .03, 0, h, -.14);
    rbox('screen', .56, .33, .02, .008, 0, h + .2, -.15); rbox('blackMetal', .4, .012, .13, .004, 0, h, .1);
  }

  function sofa(n) {
    const armW = .2, baseH = .38, legH = .11;
    const bodyW = w;
    rbox('fabric', bodyW, baseH - legH, d, .05, 0, legH, 0);                       // base
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl('woodDark', .022, .016, legH + .01, sx * (bodyW / 2 - .09), 0, sz * (d / 2 - .09), 8);
    rbox('fabric', bodyW, h - baseH + .0, .24, .07, 0, baseH - .04, -d / 2 + .12);    // back rest
    for (const s of [-1, 1]) rbox('fabric', armW, .62 - .14, d - .02, .07, s * (bodyW / 2 - armW / 2), legH + .1, 0);
    const innerW = bodyW - armW * 2 - .01, cw = innerW / n;
    for (let i = 0; i < n; i++) {
      const x = -innerW / 2 + cw * (i + .5);
      rbox('fabric', cw - .015, .17, d - .3, .07, x, baseH - .06, .1);                // seat cushion
      rbox('fabric', cw - .02, .46, .17, .07, x, baseH + .08, -d / 2 + .3, 0, -.17);    // back cushion
    }
    if (n >= 2) {
      rbox('pillowB', .4, .38, .12, .06, -innerW / 2 + .26, baseH + .13, -d / 2 + .42, .3, -.25);
      rbox('fabricBlue', .38, .38, .12, .06, innerW / 2 - .25, baseH + .13, -d / 2 + .42, -.3, -.25);
    }
  }

  function coffeeTable() {
    rbox('marbleTop', w, .045, d, .012, 0, h - .045, 0);
    box('gold', w - .12, .02, d - .12, 0, h - .075, 0);
    rbox('woodDark', w - .22, .03, d - .22, .01, 0, .09, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar('gold', h - .05, .013, sx * (w / 2 - .09), (h - .05) / 2, sz * (d / 2 - .08), 'y', 8);
    // decor: tray + vase
    cyl('gold', .11, .1, .02, -.2, h, 0, 18); cyl('ceramic', .03, .045, .16, -.2, h + .02, 0, 12); ell('leafB', .09, .1, .09, -.2, h + .26, 0, 8, 6);
  }

  function tvUnit() {
    const legH = .1;
    rbox('woodDark', w, h - legH - .0, d, .012, 0, legH, 0);
    const n = Math.max(2, Math.round(w / .6)), dw = (w - .06) / n;
    for (let i = 0; i < n; i++) { rbox(i % 2 ? 'woodMid' : 'woodLight', dw - .01, h - legH - .08, .02, .004, -w / 2 + .03 + dw * (i + .5), legH + .04, d / 2 + .005); }
    for (const sx of [-1, 1]) cyl('gold', .02, .015, legH + .01, sx * (w / 2 - .1), 0, 0, 8);
    // TV on a slim stand
    box('blackMetal', .5, .015, .22, 0, h, -.02); box('blackMetal', .05, .1, .03, 0, h + .01, -.08);
    rbox('screen', Math.min(1.5, w * .8), .84, .035, .01, 0, h + .1, -.08);
  }

  function majlisSofa() {
    // arabic floor seating: low upholstered platform, long mattress, tall back bolster and end rolls
    const baseH = .2;
    rbox('woodDark', w, .06, d, .01, 0, 0, 0);
    rbox('majlisFabric', w, baseH - .06, d, .05, 0, .06, 0);
    rbox('gold', w + .004, .018, d + .004, .006, 0, .1, 0);
    rbox('majlisCream', w - .06, .16, d - .26, .07, 0, baseH, .09);                     // seat mattress
    rbox('majlisFabric', w - .06, .5, .22, .09, 0, baseH, -d / 2 + .13, 0, -.12);        // back cushion
    rbox('gold', w - .1, .015, .02, .005, 0, baseH + .3, -d / 2 + .03);
    for (const s of [-1, 1]) {
      const r = cyl('majlisFabric', .09, .09, d - .24, s * (w / 2 - .12), baseH + .09, .06, 16, Math.PI / 2); r.position.y = baseH + .16;
      cyl('gold', .095, .095, .02, s * (w / 2 - .12), baseH + .07, d / 2 - .1, 16, Math.PI / 2);
    }
    const n = Math.max(2, Math.round(w / .8));
    for (let i = 0; i < n; i++) rbox(i % 2 ? 'majlisCream' : 'gold', .38, .38, .12, .05, -w / 2 + .45 + (w - .9) * (i / Math.max(1, n - 1)), baseH + .18, -d / 2 + .38, .15 * (i % 2 ? 1 : -1), -.3, 0);
  }

  function chair(cx, cz, ry, cw = .45, cd = .45, ch = .9) {
    const sub = new THREE.Group(); sub.position.set(cx, 0, cz); sub.rotation.y = ry;
    const start = g.children.length;
    const seatH = ch * .5;
    rbox('woodMid', cw, .05, cd, .015, 0, seatH - .05, 0);
    rbox('fabric', cw - .04, .05, cd - .04, .02, 0, seatH, .0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl('woodDark', .018, .014, seatH - .05, sx * (cw / 2 - .035), 0, sz * (cd / 2 - .035), 6);
    for (const sx of [-1, 1]) box('woodMid', .03, ch - seatH, .03, sx * (cw / 2 - .035), seatH, -cd / 2 + .03);
    rbox('fabric', cw - .06, .24, .035, .015, 0, ch - .3, -cd / 2 + .03, 0, -.08);
    box('woodMid', cw, .05, .03, 0, ch - .05, -cd / 2 + .03);
    for (let i = start; i < g.children.length; i++) { const m = g.children[i]; if (cx || cz || ry) { m.position.applyEuler(new THREE.Euler(0, ry, 0)); m.position.x += cx; m.position.z += cz; m.rotation.y += ry; } }
  }

  function diningTable() {
    const th = .045;
    rbox('woodMid', w, th, d, .015, 0, h - th, 0);
    rbox('woodDark', w - .5, .08, d - .5, .01, 0, h - th - .08, 0);
    for (const s of [-1, 1]) { rbox('woodDark', .09, h - th, d - .35, .02, s * (w / 2 - .45), 0, 0); }
    // table setting + centre piece
    cyl('ceramic', .12, .1, .02, 0, h, 0, 18); cyl('ceramic', .035, .05, .2, 0, h + .02, 0, 12); ell('leafB', .12, .1, .12, 0, h + .3, 0, 8, 6);
    // six chairs around the table, pushed in
    const cw = .45, cdp = .47, ch = .92, off = .08;
    const seats = [[-w * .25, d / 2 + cdp / 2 - off, Math.PI], [w * .25, d / 2 + cdp / 2 - off, Math.PI], [-w * .25, -d / 2 - cdp / 2 + off, 0], [w * .25, -d / 2 - cdp / 2 + off, 0], [w / 2 + cdp / 2 - off, 0, -Math.PI / 2], [-w / 2 - cdp / 2 + off, 0, Math.PI / 2]];
    for (const [x, z, ry] of seats) chair(x, z, ry, cw, cdp, ch);
  }

  function kitchenRun() {
    const cabH = .8, top = .035, plinth = .1, n = Math.max(2, Math.round(w / .6)), cw = w / n;
    box('blackMetal', w - .04, plinth, d - .06, 0, 0, -.02);
    box('lacquerGrey', w, cabH - plinth, d - .03, 0, plinth, -.015);
    rbox('quartz', w + .02, top, d + .03, .006, 0, cabH, .0);
    const sinkI = Math.min(n - 1, Math.max(0, Math.floor(n / 2))), hobI = n > 3 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + cw * (i + .5);
      rbox('lacquer', cw - .008, cabH - plinth - .03, .02, .004, x, plinth + .015, d / 2 - .005);
      bar('steel', cw * .5, .006, x, cabH - .09, d / 2 + .03, 'x', 6);
    }
    // sink with tap
    const sx = -w / 2 + cw * (sinkI + .5);
    box('steel', cw - .16, .006, d - .2, sx, cabH + top - .002, .02); box('screen', cw - .22, .004, d - .26, sx, cabH + top + .0, .02);
    cyl('chrome', .012, .012, .26, sx, cabH + top, -d / 2 + .08, 8); bar('chrome', .14, .01, sx, cabH + top + .27, -d / 2 + .14, 'z', 8);
    // hob + hood
    const hx = -w / 2 + cw * (hobI + .5);
    rbox('screen', .56, .008, d - .12, .003, hx, cabH + top, .0);
    for (const [bx, bz, r] of [[-.14, -.1, .06], [.14, -.1, .05], [-.14, .1, .05], [.14, .1, .07]]) cyl('steel', r, r, .006, hx + bx, cabH + top + .008, bz, 14);
    // wall units
    const up = 1.45, uh = .72;
    for (let i = 0; i < n; i++) {
      if (i === sinkI && n > 2) continue;
      const x = -w / 2 + cw * (i + .5);
      if (i === hobI) { box('steel', cw - .02, .06, .5, x, up + .02, -d / 2 + .25 - .05 + .0); box('steel', .26, uh - .1, .26, x, up + .1, -d / 2 + .2 - .05); continue; }
      rbox('lacquerGrey', cw - .01, uh, .34, .01, x, up, -d / 2 + .17 - .02);
      rbox('lacquer', cw - .02, uh - .04, .018, .004, x, up + .02, -d / 2 + .34 - .01);
    }
    // backsplash
    box('quartz', w, .5, .012, 0, cabH + top, -d / 2 - .006 + .0);
  }

  function fridge() {
    rbox('steel', w, h, d, .03, 0, 0, 0);
    const split = h * .34;
    box('blackMetal', w - .02, .008, .01, 0, split + .0, d / 2 + .002);
    bar('blackMetal', .6, .012, w / 2 - .07, h * .62, d / 2 + .03, 'y', 6);
    bar('blackMetal', .3, .012, w / 2 - .07, h * .17, d / 2 + .03, 'y', 6);
    box('blackMetal', w - .06, .03, d - .1, 0, 0, -.0);
  }

  function stove() {
    rbox('steel', w, h - .02, d, .012, 0, 0, 0);
    rbox('screen', w - .1, h * .5, .012, .004, 0, .1, d / 2 + .004);
    bar('steel', w - .15, .01, 0, h * .66, d / 2 + .04, 'x', 8);
    rbox('screen', w - .04, .01, d - .04, .004, 0, h - .01, 0);
    for (const [x, z, r] of [[-.14, -.13, .06], [.14, -.13, .05], [-.14, .12, .05], [.14, .12, .07]]) cyl('steel', r, r, .006, x, h, z, 14);
  }

  function wc() {
    const bowlL = d - .18;
    cyl('ceramic', .12, .12, .26, 0, 0, d / 2 - bowlL / 2 - .02, 14, 0, 0, 0).scale.set(1.25, 1, 1.2);        // pedestal
    ell('ceramic', w / 2, .22, bowlL / 2, 0, .37, d / 2 - bowlL / 2 - .05, 14, 8);                              // bowl
    const ring = add(new THREE.TorusGeometry(.5, .06, 8, 24), 'ceramic', 0, .43, d / 2 - bowlL / 2 - .05, Math.PI / 2, 0, 0, w / 2 * .98 / .5 * 1, bowlL / 2 * .98 / .5, 1);
    ring.scale.set(w / 2 / .5, bowlL / 2 / .5, w / 2 / .5 * .35);
    ell('water', w / 2 - .06, .02, bowlL / 2 - .06, 0, .42, d / 2 - bowlL / 2 - .05, 12, 3);
    rbox('ceramic', w * .95, .4, .17, .025, 0, .38, -d / 2 + .09);                                              // cistern
    rbox('ceramic', w * .95 + .01, .03, .19, .015, 0, .78, -d / 2 + .09);
    cyl('chrome', .028, .028, .012, 0, .81, -d / 2 + .09, 14);
  }

  function basin() {
    const cab = .62;
    rbox('woodMid', w, cab, d, .012, 0, .12, 0); box('blackMetal', w - .06, .1, d - .06, 0, .02, -.01);
    box('lacquer', w - .06, cab - .1, .02, 0, .16, d / 2 + .0 + .0);
    rbox('marbleTop', w + .02, .035, d + .02, .008, 0, .12 + cab, 0);
    ell('ceramic', w * .36, .075, d * .36, 0, .12 + cab + .1, .02, 16, 6);                                      // vessel bowl
    cyl('chrome', .014, .014, .2, 0, .12 + cab + .035, -d / 2 + .06, 8); bar('chrome', .1, .01, 0, .12 + cab + .22, -d / 2 + .1, 'z', 8);
    // mirror on the wall
    box('woodDark', w * .9 + .04, .84, .012, 0, 1.1, -d / 2 + .006); box('mirror', w * .9, .8, .012, 0, 1.12, -d / 2 + .013);
  }

  function shower() {
    const gl = 2.0, t = .012;
    box('ceramic', w, .06, d, 0, 0, 0); box('water', w - .05, .002, d - .05, 0, .06, 0);
    // glass on the two open sides: front (+z) and right (+x), chrome posts
    box('fglass', w - .02, gl - .06, t, 0, .06, d / 2 - .01); box('fglass', t, gl - .06, d - .02, w / 2 - .01, .06, 0);
    box('chrome', w, .03, .03, 0, gl - .03, d / 2 - .01); box('chrome', .03, .03, d, w / 2 - .01, gl - .03, 0);
    box('chrome', .03, gl, .03, w / 2 - .01, .0, d / 2 - .01); box('chrome', .03, gl - .06, .02, -w / 2 + .02, .06, d / 2 - .01);
    // rain head and handle on the back wall (-z) / left wall
    bar('chrome', .45, .01, -w / 2 + .1, gl - .3, -d / 2 + .04, 'y', 6); cyl('chrome', .1, .1, .015, -w / 2 + .1, gl - .06, -d / 2 + .25, 14);
    bar('chrome', .2, .01, -w / 2 + .1, gl - .06, -d / 2 + .15, 'z', 6);
    cyl('chrome', .03, .03, .02, 0, 1.1, -d / 2 + .02, 12, Math.PI / 2);
    cyl('chrome', .045, .045, .01, w / 4, .065, -d / 4, 12);
  }

  function bathtub() {
    const sh = .06;
    rbox('ceramic', w, h, d, .1, 0, 0, 0);
    // fake basin: slightly smaller dark inner slab sunk below the rim (rim frame made of 4 boxes)
    const rim = .07, inH = h - .08;
    box('water', w - rim * 2, .01, d - rim * 2, 0, h - .3, 0);
    box('ceramic', w, .02, rim, 0, h - .02, -d / 2 + rim / 2); box('ceramic', w, .02, rim, 0, h - .02, d / 2 - rim / 2);
    box('ceramic', rim, .02, d - rim * 2, -w / 2 + rim / 2, h - .02, 0); box('ceramic', rim, .02, d - rim * 2, w / 2 - rim / 2, h - .02, 0);
    ell('water', (w - rim * 2) / 2, .22, (d - rim * 2) / 2, 0, h - .08, 0, 16, 6);
    bar('chrome', .22, .012, 0, h + .1, -d / 2 + .05, 'y', 8); bar('chrome', .14, .012, 0, h + .2, -d / 2 + .11, 'z', 8);
  }

  function washingMachine() {
    rbox('lacquer', w, h, d, .02, 0, 0, 0);
    rbox('lacquerGrey', w - .04, .1, .012, .004, 0, h - .13, d / 2 + .003);
    add(new THREE.TorusGeometry(.19, .03, 10, 24), 'steel', 0, h * .42, d / 2 + .005);
    cyl('carGlass', .17, .17, .02, 0, h * .42 - .0, d / 2 - .02, 20, Math.PI / 2);
    for (const x of [-.18, .14]) cyl('steel', .02, .02, .02, x, h - .07, d / 2 + .012, 10, Math.PI / 2);
  }

  function plant() {
    const R = rng(7), potH = .32;
    cyl(M('pot'), .13, .1, potH, 0, 0, 0, 16); cyl('soil', .12, .12, .02, 0, potH - .01, 0, 12);
    cyl('trunk', .014, .02, h * .55, 0, potH, 0, 6);
    const n = 15;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, k = i / n, r = .05 + k * .14, y = potH + h * (.38 + k * .52);
      const leaf = ell(i % 3 ? 'leafA' : 'leafB', .1, .018, .17, Math.cos(a) * r, y, Math.sin(a) * r, 8, 6);
      leaf.rotation.set(-0.5 + R() * .3, -a + Math.PI / 2, 0, 'YXZ'); leaf.rotation.order = 'YXZ'; leaf.rotation.y = -a + Math.PI / 2; leaf.rotation.x = -.55 + R() * .25;
    }
  }

  function rug() {
    // pattern comes from the 'rug' material (own texture, UV 0..1 over the whole rug)
    const m = add(roundedBoxGeometry(THREE, w, .02, d, .008), mats.rug || M('majlisFabric'), 0, .01, 0, 0, 0, 0, 1, 1, 1, true);
    m.castShadow = false;
  }

  function car() {
    const L = d, Wd = w;
    rbox('carBody', Wd, .6, L, .12, 0, .3, 0);                                        // lower body
    rbox('carTrim', Wd - .06, .16, L - .02, .05, 0, .2, 0);                           // sills / bumpers
    rbox('carBody', Wd - .02, .12, L * .3, .05, 0, .78, L * .3 - .1);                 // bonnet
    rbox('carBody', Wd - .02, .14, L * .2, .05, 0, .76, -L * .36);                    // boot
    // cabin: dark glass body with body-coloured roof and pillars
    const cabL = L * .5, cabW = Wd - .16, cabY = .86;
    rbox('carGlass', cabW, .5, cabL, .1, 0, cabY - .02, -.12);
    rbox('carBody', cabW + .01, .05, cabL * .78, .03, 0, cabY + .46, -.14);
    for (const sx of [-1, 1]) for (const z of [-.12 + cabL / 2 - .05, -.12 - cabL / 2 + .06]) box('carBody', .06, .5, .07, sx * (cabW / 2), cabY - .02, z);
    box('carBody', .05, .46, .07, -cabW / 2, cabY, -.12); box('carBody', .05, .46, .07, cabW / 2, cabY, -.12);
    // windscreen/rear glass slopes
    box('carGlass', cabW - .06, .5, .04, 0, cabY, -.12 + cabL / 2 + .08, 0, -.55); box('carGlass', cabW - .06, .5, .04, 0, cabY, -.12 - cabL / 2 - .06, 0, .5);
    // lights, grille, plate
    for (const sx of [-1, 1]) { rbox('headlight', .3, .08, .05, .02, sx * (Wd / 2 - .24), .62, L / 2 - .01); rbox('taillight', .3, .08, .05, .02, sx * (Wd / 2 - .24), .66, -L / 2 + .01); }
    rbox('carTrim', .7, .14, .05, .03, 0, .38, L / 2 - .005); box('rim', .4, .12, .02, 0, .22, -L / 2 - .005);
    // wheels
    for (const sx of [-1, 1]) for (const z of [L * .31, -L * .3]) {
      cyl('tire', .36, .36, .25, sx * (Wd / 2 - .1), 0, z, 18, 0, Math.PI / 2).position.y = .36;
      cyl('rim', .22, .22, .26, sx * (Wd / 2 - .1), 0, z, 12, 0, Math.PI / 2).position.y = .36;
    }
  }

  function tree() {
    const R = rng(Math.round((dims.seed ?? 3) * 7919) + 11), trunkH = h * .42;
    cyl('trunk', w * .05, w * .08, trunkH, 0, 0, 0, 8);
    const blobs = 7;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + R(), r = i ? w * (.2 + R() * .12) : 0;
      const s = w * (.3 + R() * .1);
      add(new THREE.IcosahedronGeometry(1, 1), i % 2 ? 'leafA' : 'leafB', Math.cos(a) * r, trunkH + h * (.22 + R() * .2), Math.sin(a) * r, 0, R() * 3, 0, s, s * .85, s);
    }
    add(new THREE.IcosahedronGeometry(1, 1), 'leafA', 0, trunkH + h * .5, 0, 0, 0, 0, w * .32, w * .3, w * .32);
  }

  function palm() {
    const R = rng(Math.round((dims.seed ?? 5) * 6151) + 3), trunkH = h * .72, segs = 7;
    const lean = (R() - .5) * .25;
    for (let i = 0; i < segs; i++) {
      const y0 = trunkH * i / segs, hh = trunkH / segs + .02, t = i / segs;
      const m = cyl('trunk', .11 - t * .035, .125 - t * .035, hh, lean * t * t * trunkH * .3, y0, 0, 10);
      m.rotation.z = -lean * t * .3;
    }
    const topX = lean * trunkH * .3;
    ell('trunk', .17, .14, .17, topX, trunkH + .05, 0, 10, 6);
    const fronds = 13;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + R() * .3, len = (.9 + R() * .35) * Math.min(w, 2.2) * 1.35, droop = .5 + R() * .5;
      add(frondGeometry(THREE, len, droop), 'frond', topX, trunkH + .06, 0, 0, a, 0);
    }
    for (let i = 0; i < 5; i++) { const a = i * 1.3; ell('trunk', .05, .1, .05, topX + Math.cos(a) * .12, trunkH - .05, Math.sin(a) * .12, 6, 4); }
  }

  function shrub() {
    const R = rng(Math.round((dims.seed ?? 2) * 4421) + 9);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + R(), r = i ? w * .22 : 0, s = w * (.28 + R() * .1);
      add(new THREE.IcosahedronGeometry(1, 1), i % 2 ? 'leafA' : 'leafB', Math.cos(a) * r, s * .8, Math.sin(a) * r, 0, 0, 0, s, s * .8, s);
    }
  }

  const build = builders[kind];
  if (build) build(); else box('fallback', w, h, d, 0, 0, 0);
  // small decorative parts only: tidy flags
  g.traverse(o => { if (o.isMesh && o.material?.transparent) o.castShadow = false; });
  return g;
}

/** A drooping palm frond: a tapered, curved double sided ribbon with a few leaflet notches. */
function frondGeometry(THREE, len, droop) {
  const seg = 8, pos = [], idx = [], nor = [], uv = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, x = len * t, y = Math.sin(t * Math.PI * .75) * len * .22 - droop * t * t * len * .42;
    const half = Math.sin(Math.min(1, t * 1.2) * Math.PI) * .09 + .012;
    pos.push(x, y, -half, x, y + .02, half); nor.push(0, 1, 0, 0, 1, 0); uv.push(t, 0, t, 1);
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export default { buildFixture, createFixtureMaterials, FIXTURE_MATERIAL_SPECS, FIXTURE_KINDS, FIXTURE_YAW, roundedBoxGeometry, rng };
