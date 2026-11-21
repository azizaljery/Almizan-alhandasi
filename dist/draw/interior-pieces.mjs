// Interior dressing pieces that the document catalogue does not have: side tables, consoles, sideboards, bookcases, floor lamps, curtains,
// wall art / mirrors and ceiling light fittings. Same conventions as fixtures3d: model origin = middle of the footprint on the floor,
// +x = width, +y = up, FRONT faces +z. Ceiling lights are built hanging DOWN from y = dims.h (the ceiling height).
// `M(name)` resolves a material: a fixture material name ('woodMid', 'gold', 'lampShade' ...) or an 'iv:*' key of the interior material factory.
import { roundedBoxGeometry, rng } from './fixtures3d.mjs';

export const PIECE_KINDS = Object.freeze(['side-table', 'console', 'sideboard', 'bookcase', 'dresser', 'bench', 'floor-lamp', 'wall-art', 'wall-mirror', 'curtain', 'chandelier', 'lantern', 'linear', 'pendantLine', 'flush', 'downlight', 'towel-rail', 'pouf']);
/** Default footprints (w, d, h in metres) — design estimates for illustration, not code requirements («غير متحقق»). */
export const PIECE_DEFAULTS = Object.freeze({
  'side-table': { w: .5, d: .5, h: .55 }, console: { w: 1.3, d: .35, h: .82 }, sideboard: { w: 1.6, d: .45, h: .9 }, bookcase: { w: 1.0, d: .32, h: 2.0 }, dresser: { w: 1.2, d: .48, h: .85 },
  bench: { w: 1.4, d: .42, h: .45 }, 'floor-lamp': { w: .4, d: .4, h: 1.6 }, 'wall-art': { w: .9, d: .04, h: .7 }, 'wall-mirror': { w: .7, d: .04, h: 1.1 }, curtain: { w: 2.0, d: .12, h: 2.7 },
  chandelier: { w: .8, d: .8, h: 3.0 }, lantern: { w: .45, d: .45, h: 3.0 }, linear: { w: 1.4, d: .14, h: 3.0 }, pendantLine: { w: 1.3, d: .2, h: 3.0 }, flush: { w: .45, d: .45, h: 3.0 }, downlight: { w: 2, d: 2, h: 3.0 },
  'towel-rail': { w: .6, d: .1, h: 1.1 }, pouf: { w: .5, d: .5, h: .38 },
});

function metreUV(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new geo.attributes.position.constructor(uv, 2));
  return geo;
}

export function buildPiece(THREE, kind, dims = {}, M, opts = {}) {
  const def = PIECE_DEFAULTS[kind] || { w: 1, d: 1, h: 1 };
  const w = dims.w ?? def.w, d = dims.d ?? def.d, h = dims.h ?? def.h, g = new THREE.Group(), r = rng((opts.seed ?? 1) * 2654435761 >>> 0);
  g.name = 'piece:' + kind; g.userData.kind = kind; g.userData.dims = { w, d, h };
  const mt = n => (typeof n === 'string' ? M(n) : n);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, uv = true) => {
    if (uv) metreUV(geo);
    const m = new THREE.Mesh(geo, mt(mat)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  const box = (mat, sx, sy, sz, x, y0, z, ry = 0) => add(new THREE.BoxGeometry(sx, sy, sz), mat, x, y0 + sy / 2, z, 0, ry, 0);
  const rbox = (mat, sx, sy, sz, rad, x, y0, z) => add(opts.low && rad < .06 ? new THREE.BoxGeometry(sx, sy, sz) : roundedBoxGeometry(THREE, sx, sy, sz, rad), mat, x, y0 + sy / 2, z);
  const cyl = (mat, rt, rb, hh, x, y0, z, seg = 16) => add(new THREE.CylinderGeometry(rt, rb, hh, seg), mat, x, y0 + hh / 2, z);
  const sph = (mat, rad, x, y, z, sy = 1, ws = 9, hs = 6) => { const m = add(new THREE.SphereGeometry(rad, ws, hs), mat, x, y, z); m.scale.y = sy; return m; };
  const metal = opts.metal || 'gold', wood = opts.wood || 'woodMid', top = opts.top || wood, low = !!opts.low; // low = lite detail tier (phones): fewer segments, no small decor

  const decor = (x, y, z, n = 0) => { // small objects on a surface
    if (low) return;
    if (n % 3 === 0) { cyl('ceramic', .045, .06, .2, x, y, z, 12); sph('ceramic', .06, x, y + .2, z, .9); cyl('leafA', .006, .006, .22, x + .01, y + .2, z, 5); sph('leafB', .07, x + .02, y + .42, z, .8); }
    else if (n % 3 === 1) { cyl('gold', .06, .045, .05, x, y, z, 14); sph('pot', .04, x + .02, y + .06, z, .8); }
    else { box('linen', .16, .03, .22, x, y, z); box('woodDark', .15, .025, .2, x, y + .03, z, .2); }
  };

  const builders = {
    'side-table'() {
      const rd = Math.min(w, d) / 2;
      cyl(metal, rd * .7, rd * .7, .025, 0, 0, 0, 18); cyl(metal, .03, .03, h - .06, 0, .02, 0, 8); cyl(top, rd, rd, .035, 0, h - .035, 0, 22);
      decor(rd * .2, h, 0, opts.n || 0);
    },
    console() {
      box(top, w, .04, d, 0, h - .04, 0); for (const s of [-1, 1]) box(wood, .035, h - .04, d * .92, s * (w / 2 - .03), 0, 0);
      box(wood, w - .1, .03, d * .85, 0, .16, 0); box(wood, w - .1, .1, .02, 0, h - .16, -d / 2 + .04);
      for (const s of [-1, 1]) { cyl(metal, .01, .01, .04, s * w * .22, h - .12, d / 2 - .02, 8); }
      decor(-w * .3, h, 0, 0); decor(w * .3, h, 0, 1); if (w > 1.0) decor(0, h, 0, 2);
    },
    sideboard() {
      const bh = h - .05; rbox(wood, w, bh - .09, d, .01, 0, .09, 0); box('blackMetal', w - .1, .09, d - .08, 0, 0, 0);
      box(top === wood ? 'marbleTop' : top, w + .03, .05, d + .02, 0, h - .05, 0.005);
      const n = Math.max(2, Math.round(w / .55)), pw = (w - .06) / n;
      for (let i = 0; i < n; i++) { const x = -w / 2 + .03 + pw * (i + .5); box('woodDark', pw - .012, bh - .2, .012, x, .13, d / 2 + .002); cyl(metal, .008, .008, .12, x + (i % 2 ? -1 : 1) * pw * .38, bh * .55, d / 2 + .02, 6); }
      decor(-w * .3, h, 0, 0); decor(w * .1, h, 0, 1); if (w > 1.5) decor(w * .35, h, 0, 2);
    },
    bookcase() {
      const shelves = Math.max(4, Math.round(h / .38));
      for (const s of [-1, 1]) box(wood, .03, h, d, s * (w / 2 - .015), 0, 0); box(wood, w, .03, d, 0, h - .03, 0); box(wood, w, .06, d, 0, 0, 0); box('woodDark', w - .06, h - .1, .01, 0, .06, -d / 2 + .005);
      const books = ['duvetAccent', 'pillowB', 'woodDark', 'linen', 'majlisFabric', 'fabricDark', 'gold'];
      for (let s = 0; s < shelves; s++) {
        const y = .06 + (h - .1) * (s / shelves); if (s) box(wood, w - .06, .025, d - .02, 0, y, 0);
        if (s === 0 && opts.doors !== false) { box(wood, w / 2 - .035, y + .3, .015, -w / 4, .06, d / 2 - .005); box(wood, w / 2 - .035, y + .3, .015, w / 4, .06, d / 2 - .005); continue; }
        let x = -w / 2 + .05; while (x < w / 2 - .12) { const bw = .025 + r() * .035, bh2 = .18 + r() * .13; if (!low && r() > .14) box(books[Math.floor(r() * books.length)], bw, Math.min(bh2, (h - .1) / shelves - .05), d * .7, x + bw / 2, y + .025, 0); x += bw + .004; if (r() > .92) x += .12; }
      }
    },
    dresser() {
      rbox(wood, w, h - .1, d, .01, 0, .1, 0); for (const s of [-1, 1]) box('woodDark', .04, .1, .04, s * (w / 2 - .06), 0, d / 2 - .06);
      const rows = 3; for (let i = 0; i < rows; i++) { box('woodDark', w - .08, (h - .16) / rows - .02, .012, 0, .12 + i * (h - .16) / rows, d / 2 + .003); cyl(metal, .012, .012, .12, 0, .12 + (i + .5) * (h - .16) / rows - .01, d / 2 + .02, 6).rotation.z = Math.PI / 2; }
      box('marbleTop', w + .02, .03, d + .02, 0, h - .03, 0); decor(-w * .3, h, 0, 1); decor(w * .25, h, 0, 0);
    },
    bench() {
      rbox('fabric', w, h * .55, d, .05, 0, h * .45, 0); rbox('fabricDark', w - .04, h * .12, d - .04, .02, 0, h * .33, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(wood, .022, .016, h * .36, sx * (w / 2 - .08), 0, sz * (d / 2 - .06), 8);
    },
    pouf() { rbox('fabric', w, h, d, .08, 0, 0, 0); cyl(metal, Math.min(w, d) * .28, Math.min(w, d) * .28, .012, 0, h * .96, 0, 14); },
    'floor-lamp'() {
      cyl(metal, .13, .13, .02, 0, 0, 0, 16); cyl(metal, .012, .012, h - .35, 0, .02, 0, 6);
      const sh = new THREE.CylinderGeometry(.16, .22, .3, 18, 1, true); add(sh, 'lampShade', 0, h - .2, 0).material = mt('lampShade');
      sph('lampShade', .07, 0, h - .22, 0);
    },
    'wall-art'() { // origin on the floor; the picture is centred at height opts.y (default 1.55)
      const y = opts.y ?? 1.55, fr = opts.frame || 'woodDark';
      box(fr, w, h, .03, 0, y - h / 2, 0); box('linen', w - .1, h - .1, .012, 0, y - h / 2 + .05, .01);
      const pic = new THREE.PlaneGeometry(w - .16, h - .16);
      const uv = pic.attributes.uv; const pos = pic.attributes.position; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (w - .16) + .5, pos.getY(i) / (h - .16) + .5);
      const m = new THREE.Mesh(pic, mt(opts.art || 'linen')); m.position.set(0, y, .0165); m.castShadow = false; g.add(m);
    },
    'wall-mirror'() {
      const y = opts.y ?? 1.5, fr = opts.frame || 'gold';
      box(fr, w, h, .035, 0, y - h / 2, 0); const pic = new THREE.PlaneGeometry(w - .08, h - .08); const m = new THREE.Mesh(pic, mt('mirror')); m.position.set(0, y, .019); g.add(m);
    },
    curtain() { // w = total width (opening + sides), h = drop. Two gathered drapery panels with real pleats, tie-backs, a sheer between, rod with rings and finials.
      const style = opts.style || 'contemporary', rodY = h - .04, side = Math.min(.42 * w, .85), lam = style === 'classic' || style === 'luxury' ? .15 : .12, amp = style === 'classic' || style === 'luxury' ? .055 : .042;
      const rod = cyl(metal, .013, .013, w + .16, 0, rodY - .013, .055, low ? 5 : 10); rod.rotation.z = Math.PI / 2; rod.position.set(0, rodY, .055);
      for (const s of [-1, 1]) { const fx = s * (w / 2 + .1); if (low) { cyl(metal, .03, .03, .06, fx, rodY - .03, .055, 5); continue; } sph(metal, .03, fx, rodY, .055); cyl(metal, .006, .006, .07, fx - s * .02, rodY - .035, .02, 4).rotation.x = Math.PI / 2; }
      if (style === 'classic' || style === 'luxury') { box(opts.pelmet || 'woodDark', w + .12, .16, .1, 0, rodY - .07, .06); box(metal, w + .12, .012, .105, 0, rodY - .082, .06); }
      const panel = (xc, pw, mat, dir, o = {}) => { // dir = -1 gathers towards the left end, +1 towards the right end
        const segX = low ? Math.max(6, Math.round(pw / .075)) : Math.max(10, Math.round(pw / .03)), segY = low ? 4 : 9, hh = h - .1 - (o.hem ?? 0), geo = new THREE.PlaneGeometry(pw, hh, segX, segY), p = geo.attributes.position, tb = o.tie ? Math.min(.95, hh * .38) : -9;
        for (let i = 0; i < p.count; i++) {
          const u = p.getX(i) / pw + .5, v = (p.getY(i) + hh / 2) / hh, y = v * hh;   // v: 0 at the hem, 1 at the rod
          const ph = u * (pw / lam) * Math.PI * 2, wave = Math.pow(.5 + .5 * Math.sin(ph + v * .6), 1.25), a = (o.amp ?? amp) * (.55 + .45 * (1 - v)) * (1 + (o.hem === undefined ? .35 * Math.exp(-y * 14) : 0));
          let x = p.getX(i); const g = Math.exp(-Math.pow((y - tb) / .13, 2)); const anchor = dir > 0 ? pw / 2 : -pw / 2; x = anchor + (x - anchor) * (1 - .42 * g);
          p.setX(i, x); p.setZ(i, a * wave + .05 + (o.depth ?? 0) + .03 * g * (1 - u * dir * .5));
        }
        geo.computeVertexNormals(); metreUV(geo); const m = new THREE.Mesh(geo, mt(mat)); m.position.set(xc, .0 + hh / 2 + .0, 0); m.position.y = hh / 2 + (o.hem ?? 0); m.castShadow = true; m.receiveShadow = true; g.add(m);
        const rings = low ? 0 : Math.max(4, Math.round(pw / .1)); for (let k = 0; k < rings; k++) { const t = rings === 1 ? .5 : k / (rings - 1); const r = new THREE.TorusGeometry(.02, .004, 4, 8); metreUV(r); const rm = new THREE.Mesh(r, mt(metal)); rm.position.set(xc - pw / 2 + pw * t, rodY, .055); rm.rotation.y = Math.PI / 2; g.add(rm); }
        if (o.tie && !low) { const tx = xc + dir * (pw / 2 - pw * .08); cyl(metal, .004, .004, .02, tx, tb + .0, .1, 4); box(opts.tie || metal, pw * .52, .035, .035, tx - dir * pw * .2, tb - .02, .09); }
      };
      const sheerW = w - 2 * side * .72;
      if (sheerW > .3) panel(0, sheerW, opts.sheer || 'linen', 1, { amp: .012, depth: -.03, hem: .02 });
      panel(-w / 2 + side / 2, side, opts.fabric || 'fabric', -1, { tie: true }); panel(w / 2 - side / 2, side, opts.fabric || 'fabric', 1, { tie: true });
    },
    chandelier() {
      const top = h, glow = 'iv:glow', rr = Math.min(w, d) * .5, y0 = top - .62;
      if (low) { cyl(metal, .012, .012, .5, 0, top - .5, 0, 4); const ring = new THREE.TorusGeometry(rr, .015, 4, 12); ring.rotateX(Math.PI / 2); add(ring, metal, 0, y0, 0, 0, 0, 0, false); cyl(glow, rr * .6, rr * .6, .08, 0, y0 - .06, 0, 8); return; }
      cyl(metal, .012, .012, .3, 0, top - .3, 0, 6); cyl(metal, .07, .035, .1, 0, top - .4, 0, 12); sph(metal, .05, 0, top - .44, 0);
      for (const [rad, yy] of [[rr, y0], [rr * .62, y0 - .17]]) {
        const ring = new THREE.TorusGeometry(rad, .012, 6, 28); ring.rotateX(Math.PI / 2); add(ring, metal, 0, yy, 0, 0, 0, 0, false);
        const n = rad > rr * .7 ? 8 : 6; for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
          cyl(glow, .014, .014, .09, x, yy + .02, z, 5); cyl('lampShade', .02, .02, .05, x, yy + .1, z, 5); sph(glow, .018, x, yy + .15, z, 1, 6, 4);
          for (let k = 0; k < 2; k++) cyl('mirror', .004, .004, .12 + k * .06, x * (1 + k * .02), yy - .13 - k * .06, z * (1 + k * .02), 4);
        }
      }
      cyl(metal, .012, .012, .16, 0, y0 - .2, 0, 6); sph('mirror', .035, 0, y0 - .3, 0, 1.4);
      cyl(metal, rr * .25, rr * .4, .06, 0, y0 - .08, 0, 12);
    },
    lantern() {
      const top = h, ly = top - 1.0, rad = Math.min(w, d) * .38;
      cyl(metal, .01, .01, .6, 0, top - .6, 0, 6); cyl(metal, rad * .5, rad * .9, .1, 0, ly + .5, 0, 8); cyl(metal, .01, rad * .4, .08, 0, ly + .6, 0, 8);
      cyl('iv:glow', rad * .7, rad * .7, .46, 0, ly + .03, 0, 8); cyl(metal, rad * .9, rad * .6, .05, 0, ly - .04, 0, 8);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cyl(metal, .007, .007, .52, Math.cos(a) * rad * .88, ly, Math.sin(a) * rad * .88, 4); }
      if (!low) sph(metal, .03, 0, ly - .1, 0);
    },
    linear() {
      const top = h, ly = top - .75; for (const s of [-1, 1]) cyl('blackMetal', .004, .004, .75, s * w * .4, ly, 0, 4);
      box(opts.body || 'blackMetal', w, .05, d, 0, ly - .03, 0); box('iv:glow', w - .06, .012, d - .05, 0, ly - .05, 0);
    },
    pendantLine() {
      const top = h, n = Math.max(2, Math.round(w / .45)); box('blackMetal', w, .02, .06, 0, top - .02, 0);
      for (let i = 0; i < n; i++) { const x = -w / 2 + w * (i + .5) / n, len = .9 + (i % 2) * .22; cyl('blackMetal', .003, .003, len, x, top - len - .02, 0, 4); const sh = new THREE.CylinderGeometry(.04, .13, .15, 16, 1, true); add(sh, 'blackMetal', x, top - len - .1, 0); sph('iv:glow', .045, x, top - len - .1, 0); }
    },
    flush() { cyl(opts.ring || 'linen', .24, .24, .02, 0, h - .02, 0, 24); cyl('iv:glow', .21, .21, .02, 0, h - .036, 0, 24); },
    downlight() {
      const nx = Math.max(1, Math.round(w / 1.15)), nz = Math.max(1, Math.round(d / 1.15));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = -w / 2 + w * (i + .5) / nx, z = -d / 2 + d * (j + .5) / nz; cyl('linen', .055, .055, .01, x, h - .01, z, 12); cyl('iv:glow', .042, .042, .006, x, h - .016, z, 12); }
    },
    'towel-rail'() {
      const y = opts.y ?? 1.05; for (const s of [-1, 1]) box('chrome', .02, .02, .08, s * (w / 2 - .03), y - .01, .04); cyl('chrome', .01, .01, w, 0, y - .01, .08, 8).rotation.z = Math.PI / 2; g.children.at(-1).position.set(0, y, .08);
      box('linen', w * .55, .5, .035, -w * .1, y - .5, .09); box(opts.tower || 'duvetAccent', w * .3, .42, .03, w * .28, y - .42, .095);
    },
  };
  (builders[kind] || (() => box('fallback', w, h, d, 0, 0, 0)))();
  return g;
}

export default { buildPiece, PIECE_KINDS, PIECE_DEFAULTS };
