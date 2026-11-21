// Procedural interior surface painters (marble, porcelain, wood, cement tile, wall tile, panels ...). No image files, no network.
// Every painter returns { color: canvas, height?: canvas } and is tileable (the canvas repeats every `size` metres).
// Canvases are cached per (preset, S) so switching interior theme never repaints a texture that was already painted.
import { makeCanvas } from './materials3d.mjs';

const clamp = (v, a = 0, b = 255) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mixv = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mixv(a[0], b[0], t), mixv(a[1], b[1], t), mixv(a[2], b[2], t)];

export const hexToRgb = hex => { const h = String(hex).replace('#', ''); const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h; return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0]; };
export const srgbToLinear = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
/** `#rrggbb` -> linear-light [r,g,b] in 0..1 (vertex colours are not colour-managed by three.js). */
export const hexLinear = hex => hexToRgb(hex).map(srgbToLinear);

// ---- value noise (hash based, no tables) -------------------------------------------------------------------------
const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x, y, s = 1, oct = 4) { let v = 0, a = .5, f = 1, n = 0; for (let o = 0; o < oct; o++) { v += a * vnoise(x * f, y * f, s + o * 7); n += a; a *= .5; f *= 2; } return v / n; }

const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
export const clearTextureCache = () => cache.clear();

const imageOf = S => { const c = makeCanvas(S), x = c.getContext('2d'); return { c, x, img: x.createImageData(S, S) }; };
const flush = ({ x, img }) => x.putImageData(img, 0, 0);
const put = (d, i, r, g, b) => { d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b); d[i + 3] = 255; };
const greyHeight = (S, fn) => { const c = makeCanvas(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data; for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) { const v = clamp(fn(px, py)), i = (py * S + px) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } x.putImageData(img, 0, 0); return c; };

// ---- marble / stone-look slabs --------------------------------------------------------------------------------------
/** Large polished slabs (n x n per tile) with domain-warped veins; every slab samples a different part of the noise field. */
export function marble({ S = 640, n = 2, base = [236, 228, 212], cloud = [222, 210, 190], vein = [128, 112, 92], veinAlpha = .62, veinSharp = 16, veinScale = 1.1, veinFine = .28, cloudAmp = .55, grout = [150, 140, 126], seed = 41, gold = null } = {}) {
  return cached(`marble|${S}|${n}|${base}|${cloud}|${vein}|${veinAlpha}|${veinSharp}|${veinScale}|${veinFine}|${cloudAmp}|${seed}|${gold}`, () => {
    const I = imageOf(S), d = I.img.data, ts = S / n;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const si = Math.floor(px / ts), sj = Math.floor(py / ts), lx = (px - si * ts) / ts, ly = (py - sj * ts) / ts, so = seed + si * 131 + sj * 977;
      const nx = lx * 2.4 + so * .37, ny = ly * 2.4 + so * .21, r = hash2(si, sj, seed);
      const cl = fbm(nx * 1.3, ny * 1.3, so, 4), warp = fbm(nx * 1.5 + 9.1, ny * 1.5 + 3.3, so + 5, 4) - .5, warp2 = fbm(nx * 3.1 + 2.7, ny * 3.1 + 8.1, so + 9, 3) - .5;
      const ang = .35 + r * .9, dir = Math.cos(ang) * nx + Math.sin(ang) * ny, dir2 = -Math.sin(ang) * nx + Math.cos(ang) * ny;
      // wavy near-parallel main veins (low warp keeps them from closing into contour loops) + weaker crossing hair veins
      const t1 = Math.abs(Math.sin((dir * veinScale + warp * 2.1) * 3.14159)), v1 = Math.pow(1 - t1, veinSharp) * (.35 + cl * .9);
      const t2 = Math.abs(Math.sin((dir2 * veinScale * 1.9 + warp2 * 2.6 + 1.7) * 3.14159)), v2 = Math.pow(1 - t2, veinSharp * 1.7) * veinFine * (.4 + cl);
      let col = mix3(base, cloud, sstep(.3, .75, cl) * cloudAmp);
      col = mix3(col, vein, clamp(v1 * veinAlpha + v2 * veinAlpha * .8, 0, 1));
      if (gold) col = mix3(col, gold, clamp(Math.pow(1 - Math.abs(Math.sin((dir * veinScale * .55 + warp * 2.4 + 4.1) * 3.14159)), 36) * .7 * (.3 + cl), 0, 1));
      const sp = (hash2(px, py, seed + 3) - .5) * 5; // polish speckle
      put(d, (py * S + px) * 4, col[0] + sp, col[1] + sp, col[2] + sp);
    }
    flush(I);
    const x = I.x; x.strokeStyle = `rgb(${grout[0]},${grout[1]},${grout[2]})`; x.lineWidth = Math.max(1.5, S / 420);
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * ts, 0); x.lineTo(i * ts, S); x.stroke(); x.beginPath(); x.moveTo(0, i * ts); x.lineTo(S, i * ts); x.stroke(); }
    return { color: I.c };
  });
}

/** Large-format porcelain: soft cloudy concrete / stone look with hair-line grout. */
export function porcelain({ S = 512, n = 2, base = [196, 194, 188], cloud = [176, 174, 168], speck = 7, grout = [120, 118, 112], seed = 71, mottle = .8 } = {}) {
  return cached(`porc|${S}|${n}|${base}|${cloud}|${speck}|${grout}|${seed}|${mottle}`, () => {
    const I = imageOf(S), d = I.img.data, ts = S / n;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const si = Math.floor(px / ts), sj = Math.floor(py / ts), so = seed + si * 53 + sj * 211;
      const nx = px / S * 6 + so * .19, ny = py / S * 6 + so * .13;
      const c = fbm(nx, ny, so, 4), c2 = fbm(nx * 3.3 + 4, ny * 3.3 + 1, so + 2, 3);
      let col = mix3(base, cloud, sstep(.25, .8, c) * mottle);
      const t = (c2 - .5) * 16 + (hash2(px, py, seed) - .5) * speck;
      put(d, (py * S + px) * 4, col[0] + t, col[1] + t, col[2] + t);
    }
    flush(I);
    const x = I.x; x.strokeStyle = `rgb(${grout[0]},${grout[1]},${grout[2]})`; x.lineWidth = Math.max(1.5, S / 300);
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * ts, 0); x.lineTo(i * ts, S); x.stroke(); x.beginPath(); x.moveTo(0, i * ts); x.lineTo(S, i * ts); x.stroke(); }
    const height = greyHeight(S, (px, py) => { const a = px % ts, b = py % ts, e = Math.min(a, b, ts - a, ts - b); return e < S / 300 + 1 ? 60 : 200; });
    return { color: I.c, height };
  });
}

// ---- wood planks --------------------------------------------------------------------------------------------------------
/** Plank flooring: staggered planks (rows run along x), ring + pore grain, per-plank tone, dark joints. `size` metres per tile. */
export function wood({ S = 768, size = 2.0, plank = .19, ramp = [[120, 78, 44], [168, 116, 70], [204, 152, 100]], tone = .22, ringFreq = 5.5, grainWarp = 5.5, seed = 51, gap = [46, 32, 22], pores = .55 } = {}) {
  return cached(`wood|${S}|${size}|${plank}|${ramp}|${tone}|${ringFreq}|${grainWarp}|${seed}|${gap}|${pores}`, () => {
    const I = imageOf(S), d = I.img.data, rows = Math.max(2, Math.round(size / plank)), rh = S / rows, r = hash2;
    const ppm = S / size, rowPlanks = [];
    for (let j = 0; j < rows; j++) { const cuts = [0], k = 1 + Math.floor(r(j, 3, seed) * 2.2); for (let q = 1; q <= k; q++) cuts.push(Math.round(S * (q / (k + 1) + (r(j, q + 9, seed) - .5) * .3 / (k + 1)))); cuts.push(S); rowPlanks.push(cuts); }
    const rampAt = t => t < .5 ? mix3(ramp[0], ramp[1], t * 2) : mix3(ramp[1], ramp[2], (t - .5) * 2);
    for (let py = 0; py < S; py++) {
      const j = Math.min(rows - 1, Math.floor(py / rh)), cuts = rowPlanks[j], v = (py - j * rh) / rh;
      for (let px = 0; px < S; px++) {
        let pi = 0; while (pi < cuts.length - 2 && px >= cuts[pi + 1]) pi++;
        const pid = j * 17 + pi * 5 + seed, tn = (r(pid, 1, seed) - .5) * 2 * tone, u = (px - cuts[pi]) / ppm;
        const w = fbm(u * 1.1 + pid, v * 3.2, pid, 3), ring = Math.abs(Math.sin((v * ringFreq + w * grainWarp + r(pid, 4, seed) * 6) * 3.14159));
        const fib = fbm(u * 9 + pid * 3, v * 70, pid + 11, 3), pore = hash2(Math.floor(px / 2), py, pid) > 1 - .012 * pores * 2 ? -26 : 0;
        const t = clamp(.5 + tn + (ring - .5) * .5 + (fib - .5) * .35, 0, 1);
        const c = rampAt(t), edge = Math.min(v, 1 - v) * rh, endE = Math.min(px - cuts[pi], cuts[pi + 1] - px);
        const dk = (edge < 1.3 || endE < 1.3) ? .0 : 1, f = edge < 2.5 ? .8 + .2 * (edge / 2.5) : 1;
        const g = dk ? 1 : 0;
        put(d, (py * S + px) * 4, mixv(gap[0], (c[0] + pore) * f, g), mixv(gap[1], (c[1] + pore) * f, g), mixv(gap[2], (c[2] + pore) * f, g));
      }
    }
    flush(I);
    const height = greyHeight(S, (px, py) => { const j = Math.min(rows - 1, Math.floor(py / rh)), cuts = rowPlanks[j]; let pi = 0; while (pi < cuts.length - 2 && px >= cuts[pi + 1]) pi++; const v = (py - j * rh) / rh, edge = Math.min(v, 1 - v) * rh, endE = Math.min(px - cuts[pi], cuts[pi + 1] - px); const g = fbm(px / ppm * 9 + j, py / ppm * 70, seed + 5, 2); return (edge < 1.6 || endE < 1.6) ? 40 : 190 + (g - .5) * 30; });
    return { color: I.c, height };
  });
}

// ---- patterned cement tile (Najdi / Hijazi heritage floors) ---------------------------------------------------------
/** 20 cm encaustic-look tiles; `n` x `n` tiles per tile image, four geometric motifs in a 4-colour palette. */
export function cementTile({ S = 768, n = 6, pal = ['#e9dcc0', '#b8573a', '#2f2a26', '#d1a15a'], seed = 7, grout = 'rgba(70,60,50,.9)' } = {}) {
  return cached(`cement|${S}|${n}|${pal}|${seed}`, () => {
    const c = makeCanvas(S), x = c.getContext('2d'), ts = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const ox = i * ts, oy = j * ts, m = (i + j * 2 + Math.floor(hash2(i, j, seed) * 2)) % 4, h = ts / 2, cx = ox + h, cy = oy + h;
      x.fillStyle = pal[0]; x.fillRect(ox, oy, ts, ts);
      x.fillStyle = pal[1]; x.strokeStyle = pal[2]; x.lineWidth = ts * .03;
      const poly = pts => { x.beginPath(); pts.forEach((p, k) => k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); };
      if (m === 0) { // diamond in square
        poly([[cx, oy + ts * .08], [ox + ts * .92, cy], [cx, oy + ts * .92], [ox + ts * .08, cy]]); x.fill(); x.fillStyle = pal[2]; poly([[cx, oy + ts * .3], [ox + ts * .7, cy], [cx, oy + ts * .7], [ox + ts * .3, cy]]); x.fill(); x.fillStyle = pal[3]; x.beginPath(); x.arc(cx, cy, ts * .09, 0, 7); x.fill();
      } else if (m === 1) { // eight-point star
        const pts = []; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8 - Math.PI / 2, rr = k % 2 ? ts * .2 : ts * .44; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
        poly(pts); x.fill(); x.fillStyle = pal[3]; x.beginPath(); x.arc(cx, cy, ts * .11, 0, 7); x.fill();
      } else if (m === 2) { // quatrefoil
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { x.beginPath(); x.arc(cx + dx * ts * .17, cy + dy * ts * .17, ts * .2, 0, 7); x.fill(); }
        x.fillStyle = pal[3]; poly([[cx, cy - ts * .1], [cx + ts * .1, cy], [cx, cy + ts * .1], [cx - ts * .1, cy]]); x.fill();
      } else { // stepped corners
        for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { x.fillStyle = pal[1]; x.fillRect(ox + sx * ts * .62, oy + sy * ts * .62, ts * .38, ts * .38); x.fillStyle = pal[2]; x.fillRect(ox + sx * ts * .62 + ts * .09, oy + sy * ts * .62 + ts * .09, ts * .2, ts * .2); }
        x.fillStyle = pal[3]; x.beginPath(); x.arc(cx, cy, ts * .16, 0, 7); x.fill(); x.fillStyle = pal[1]; x.beginPath(); x.arc(cx, cy, ts * .07, 0, 7); x.fill();
      }
      x.strokeStyle = pal[2]; x.lineWidth = ts * .035; x.strokeRect(ox + ts * .03, oy + ts * .03, ts * .94, ts * .94);
    }
    // grout + worn speckle
    x.strokeStyle = grout; x.lineWidth = Math.max(1.5, S / 360);
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * ts, 0); x.lineTo(i * ts, S); x.stroke(); x.beginPath(); x.moveTo(0, i * ts); x.lineTo(S, i * ts); x.stroke(); }
    const img = x.getImageData(0, 0, S, S), d = img.data; for (let p = 0; p < d.length; p += 4) { const t = (hash2(p >> 2, 5, seed) - .5) * 14; d[p] = clamp(d[p] + t); d[p + 1] = clamp(d[p + 1] + t); d[p + 2] = clamp(d[p + 2] + t); } x.putImageData(img, 0, 0);
    return { color: c };
  });
}

/** Square clay / glazed tiles with per-tile tone and mottling (terracotta, zellige-look). */
export function clayTile({ S = 512, n = 4, base = [[176, 92, 62], [162, 80, 54], [188, 104, 70]], glaze = 0, grout = [120, 96, 80], seed = 19, mottle = 1, rows = null, bevel = true } = {}) {
  return cached(`clay|${S}|${n}|${base}|${glaze}|${grout}|${seed}|${mottle}|${rows}|${bevel}`, () => {
    const nx = n, ny = rows || n, tw = S / nx, th = S / ny, I = imageOf(S), d = I.img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const i = Math.floor(px / tw), j = Math.floor(py / th), b = base[Math.floor(hash2(i, j, seed) * base.length)], tn = (hash2(i, j, seed + 9) - .5) * 14;
      const m = (fbm(px / S * 9 + i, py / S * 9 + j, seed + i + j * 7, 3) - .5) * 40 * mottle, lx = (px - i * tw) / tw, ly = (py - j * th) / th;
      const g = glaze ? (1 - Math.min(1, Math.hypot(lx - .5, ly - .5) * 1.5)) * 10 * glaze : 0;
      put(d, (py * S + px) * 4, b[0] + tn + m + g, b[1] + tn + m + g, b[2] + tn + m + g);
    }
    flush(I);
    const x = I.x; x.strokeStyle = `rgb(${grout[0]},${grout[1]},${grout[2]})`; x.lineWidth = Math.max(2, S / 200);
    for (let i = 0; i <= nx; i++) { x.beginPath(); x.moveTo(i * tw, 0); x.lineTo(i * tw, S); x.stroke(); }
    for (let j = 0; j <= ny; j++) { x.beginPath(); x.moveTo(0, j * th); x.lineTo(S, j * th); x.stroke(); }
    const height = greyHeight(S, (px, py) => { const a = px % tw, b = py % th, e = Math.min(a, b, tw - a, th - b); return e < S / 200 + 1 ? 40 : bevel ? 190 + Math.min(e, 8) * 2 : 200; });
    return { color: I.c, height };
  });
}

/** Wall tile in running bond (subway) or stack bond; `tw`/`th` in metres, `size` metres per image. */
export function wallTile({ S = 512, size = .6, tw = .15, th = .075, bond = 'running', base = [[240, 240, 236], [236, 238, 235]], grout = [188, 186, 178], gloss = 1, seed = 23 } = {}) {
  return cached(`wtile|${S}|${size}|${tw}|${th}|${bond}|${base}|${grout}|${seed}`, () => {
    const cols = Math.max(1, Math.round(size / tw)), rows = Math.max(1, Math.round(size / th)), cw = S / cols, ch = S / rows, I = imageOf(S), d = I.img.data;
    for (let py = 0; py < S; py++) {
      const j = Math.floor(py / ch), off = bond === 'running' && j % 2 ? cw / 2 : 0;
      for (let px = 0; px < S; px++) {
        const xx = (px + off) % S, i = Math.floor(xx / cw), b = base[Math.floor(hash2(i, j, seed) * base.length)], tn = (hash2(i, j, seed + 5) - .5) * 10;
        const lx = ((xx % cw) / cw), ly = (py % ch) / ch, sheen = (1 - Math.hypot(lx - .35, ly - .3)) * 9 * gloss;
        const e = Math.min(xx % cw, cw - (xx % cw), py % ch, ch - (py % ch));
        if (e < Math.max(1.4, S / 260)) put(d, (py * S + px) * 4, grout[0], grout[1], grout[2]);
        else put(d, (py * S + px) * 4, b[0] + tn + sheen, b[1] + tn + sheen, b[2] + tn + sheen);
      }
    }
    flush(I);
    const height = greyHeight(S, (px, py) => { const j = Math.floor(py / ch), off = bond === 'running' && j % 2 ? cw / 2 : 0, xx = (px + off) % S, e = Math.min(xx % cw, cw - (xx % cw), py % ch, ch - (py % ch)); return e < Math.max(1.4, S / 260) + 1 ? 40 : 150 + Math.min(e, 6) * 9; });
    return { color: I.c, height };
  });
}

/** Painted wall panelling (moulded rectangles). Image covers `size` metres; colour is a light grey that vertex colour tints. */
export function wallPanel({ S = 512, size = 1.2, cols = 2, rows = 1, frame = .07, railTop = .0, seed = 3 } = {}) {
  return cached(`panel|${S}|${size}|${cols}|${rows}|${frame}`, () => {
    const c = makeCanvas(S), x = c.getContext('2d'), cw = S / cols, ch = S / rows, f = frame / size * S;
    x.fillStyle = '#f2f0ec'; x.fillRect(0, 0, S, S);
    const hc = makeCanvas(S), hx = hc.getContext('2d'); hx.fillStyle = '#9a9a9a'; hx.fillRect(0, 0, S, S);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const ox = i * cw + f * .75, oy = j * ch + f * .75, w = cw - f * 1.5, h = ch - f * 1.5;
      for (const [k, col, hh] of [[0, '#cfcbc4', '#4a4a4a'], [1, '#faf9f7', '#d8d8d8']]) { const o = k * f * .22; x.strokeStyle = col; x.lineWidth = f * .16; x.strokeRect(ox + o, oy + o, w - 2 * o, h - 2 * o); hx.strokeStyle = hh; hx.lineWidth = f * .18; hx.strokeRect(ox + o, oy + o, w - 2 * o, h - 2 * o); }
      const g = x.createLinearGradient(ox, oy, ox + w, oy + h); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,.06)'); x.fillStyle = g; x.fillRect(ox + f * .3, oy + f * .3, w - f * .6, h - f * .6);
      hx.fillStyle = '#7e7e7e'; hx.fillRect(ox + f * .35, oy + f * .35, w - f * .7, h - f * .7);
    }
    return { color: c, height: hc };
  });
}

/** Vertical timber slats (fluted wall): period `slat` metres across `size`. Dark gaps between rounded battens. */
export function flutedSlats({ S = 512, size = 1.0, slat = .06, ramp = [[92, 62, 40], [132, 92, 60]], seed = 14 } = {}) {
  return cached(`fluted|${S}|${size}|${slat}|${ramp}|${seed}`, () => {
    const n = Math.round(size / slat), sw = S / n, I = imageOf(S), d = I.img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const i = Math.floor(px / sw), lx = (px % sw) / sw, rd = Math.sin(lx * Math.PI), g = fbm(px / S * 4 + i * 3, py / S * 40, seed + i, 3), t = clamp(.45 + (g - .5) * .9, 0, 1) * (.55 + rd * .5);
      const col = mix3(ramp[0], ramp[1], t);
      put(d, (py * S + px) * 4, col[0] * (.7 + rd * .3), col[1] * (.7 + rd * .3), col[2] * (.7 + rd * .3));
    }
    flush(I);
    return { color: I.c, height: greyHeight(S, px => { const lx = (px % sw) / sw; return 50 + Math.sin(lx * Math.PI) * 190; }) };
  });
}

/** Dressed limestone ashlar (Najdi stone feature wall): courses ~22 cm, blocks 40-70 cm, per-block tone + chisel marks. */
export function ashlar({ S = 768, size = 1.6, course = .22, base = [[214, 196, 164], [200, 180, 146], [222, 206, 176]], mortar = [150, 134, 108], seed = 29 } = {}) {
  return cached(`ashlar|${S}|${size}|${course}|${base}|${mortar}|${seed}`, () => {
    const rows = Math.max(2, Math.round(size / course)), rh = S / rows, I = imageOf(S), d = I.img.data, cuts = [];
    for (let j = 0; j < rows; j++) { const c = [0], k = 2 + Math.floor(hash2(j, 2, seed) * 2); for (let q = 1; q <= k; q++) c.push(Math.round(S * (q / (k + 1) + (hash2(j, q + 4, seed) - .5) * .5 / (k + 1)))); c.push(S); cuts.push(c); }
    for (let py = 0; py < S; py++) {
      const j = Math.min(rows - 1, Math.floor(py / rh)), c = cuts[j];
      for (let px = 0; px < S; px++) {
        let pi = 0; while (pi < c.length - 2 && px >= c[pi + 1]) pi++;
        const id = j * 11 + pi + seed, b = base[Math.floor(hash2(id, 1, seed) * base.length)], tn = (hash2(id, 3, seed) - .5) * 16;
        const n1 = (fbm(px / S * 14, py / S * 14, id, 3) - .5) * 34, chisel = (hash2(px >> 1, py >> 1, id) - .5) * 14;
        const e = Math.min((py - j * rh), (j + 1) * rh - py, px - c[pi], c[pi + 1] - px);
        if (e < 2.2) put(d, (py * S + px) * 4, mortar[0], mortar[1], mortar[2]);
        else put(d, (py * S + px) * 4, b[0] + tn + n1 + chisel, b[1] + tn + n1 + chisel, b[2] + tn + n1 + chisel);
      }
    }
    flush(I);
    const height = greyHeight(S, (px, py) => { const j = Math.min(rows - 1, Math.floor(py / rh)), c = cuts[j]; let pi = 0; while (pi < c.length - 2 && px >= c[pi + 1]) pi++; const e = Math.min((py - j * rh), (j + 1) * rh - py, px - c[pi], c[pi + 1] - px); return e < 3 ? 30 : 170 + (fbm(px / S * 30, py / S * 30, 9, 2) - .5) * 70; });
    return { color: I.c, height };
  });
}

/** Mud-plaster / lime-wash: soft trowel clouds (Najdi walls). Light-grey, tinted by vertex colour. */
export function limewash({ S = 512, seed = 5 } = {}) {
  return cached(`lime|${S}|${seed}`, () => {
    const I = imageOf(S), d = I.img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const a = fbm(px / S * 4, py / S * 4, seed, 4), b = fbm(px / S * 18 + 5, py / S * 18, seed + 3, 3), v = 236 + (a - .5) * 34 + (b - .5) * 12 + (hash2(px, py, seed) - .5) * 5;
      put(d, (py * S + px) * 4, v, v - 1, v - 3);
    }
    flush(I);
    return { color: I.c, height: greyHeight(S, (px, py) => 128 + (fbm(px / S * 10, py / S * 10, seed + 1, 3) - .5) * 160) };
  });
}

/** Fine timber grain used on furniture variants (grey-ish so the variant colour tints it). */
export function woodGrain({ S = 256, seed = 61 } = {}) {
  return cached(`grain|${S}|${seed}`, () => {
    const I = imageOf(S), d = I.img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const v = py / S, w = fbm(px / S * 2, v * 3, seed, 3), ring = Math.abs(Math.sin((v * 7 + w * 5) * 3.14159)), fib = fbm(px / S * 6, v * 60, seed + 4, 2), t = 190 + (ring - .5) * 40 + (fib - .5) * 40;
      put(d, (py * S + px) * 4, t, t - 3, t - 7);
    }
    flush(I);
    return { color: I.c };
  });
}

/** Small abstract picture for wall art (palette from the theme). `kind`: field | arch | lines | geo | dune. */
export function artPicture({ kind = 'field', pal = ['#e8dfcf', '#b9825a', '#3b4a45', '#c9a24c'], S = 256, seed = 1 } = {}) {
  return cached(`art|${kind}|${pal}|${S}|${seed}`, () => {
    const c = makeCanvas(S, Math.round(S * .75)), x = c.getContext('2d'), W = S, H = Math.round(S * .75);
    x.fillStyle = pal[0]; x.fillRect(0, 0, W, H);
    if (kind === 'field') { x.fillStyle = pal[1]; x.fillRect(W * .12, H * .14, W * .76, H * .5); x.fillStyle = pal[2]; x.fillRect(W * .12, H * .64, W * .76, H * .22); x.fillStyle = pal[3]; x.beginPath(); x.arc(W * .66, H * .36, H * .12, 0, 7); x.fill(); }
    else if (kind === 'arch') { x.fillStyle = pal[2]; x.beginPath(); x.moveTo(W * .3, H * .9); x.lineTo(W * .3, H * .4); x.arc(W * .5, H * .4, W * .2, Math.PI, 0); x.lineTo(W * .7, H * .9); x.closePath(); x.fill(); x.fillStyle = pal[1]; x.beginPath(); x.moveTo(W * .38, H * .9); x.lineTo(W * .38, H * .45); x.arc(W * .5, H * .45, W * .12, Math.PI, 0); x.lineTo(W * .62, H * .9); x.closePath(); x.fill(); x.fillStyle = pal[3]; x.beginPath(); x.arc(W * .5, H * .22, H * .07, 0, 7); x.fill(); }
    else if (kind === 'lines') { for (let i = 0; i < 9; i++) { x.strokeStyle = pal[1 + (i % 3)]; x.lineWidth = 2 + (i % 3) * 3; x.beginPath(); x.moveTo(W * .1, H * (.15 + i * .08)); x.bezierCurveTo(W * .35, H * (.05 + i * .08), W * .6, H * (.3 + i * .08), W * .9, H * (.15 + i * .08)); x.stroke(); } }
    else if (kind === 'geo') { const n = 4; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const cx = W * (.2 + i * .2), cy = H * (.2 + j * .2) , k = (i + j + seed) % 3; x.fillStyle = pal[1 + k]; x.beginPath(); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + Math.PI / 4; x.lineTo(cx + Math.cos(a) * W * .085, cy + Math.sin(a) * W * .085); } x.closePath(); x.fill(); } }
    else { x.fillStyle = pal[3]; x.beginPath(); x.arc(W * .72, H * .3, H * .13, 0, 7); x.fill(); for (let i = 0; i < 3; i++) { x.fillStyle = pal[1 + (i % 2) * 1]; x.beginPath(); x.moveTo(0, H); x.bezierCurveTo(W * .2, H * (.52 + i * .1), W * .55, H * (.7 + i * .06), W, H * (.5 + i * .12)); x.lineTo(W, H); x.closePath(); x.globalAlpha = .55 + i * .2; x.fill(); x.globalAlpha = 1; } }
    return { color: c };
  });
}


/**
 * Rug top view (UV 0..1 over the whole rug): border bands, a field and a motif by style. All colours come from the room palette.
 * najdi = horizontal woven-stripe bands with diamond runs (Sadu-like; ILLUSTRATIVE, not a traced pattern) · classic = lobed medallion + corner spandrels ·
 * luxury = tonal lattice with a gold frame · contemporary = tonal geometry · dark = plain field with piping and offset rectangles.
 */
export function rugPattern({ style = 'contemporary', field = '#c9c0ae', border = '#8a7a62', motif = '#e4dccb', ink = '#3a3028', S = 512, seed = 1 } = {}) {
  return cached(`rug|${style}|${field}|${border}|${motif}|${ink}|${S}|${seed}`, () => {
    const W = S, H = Math.round(S * .72), c = makeCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = field; x.fillRect(0, 0, W, H);
    // weave grain
    for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},.035)`; x.fillRect(hash2(i, 1, seed) * W, hash2(i, 2, seed) * H, 2 + hash2(i, 3, seed) * 6, 1); }
    const bw = Math.round(W * .055);
    const frame = (inset, lw, col) => { x.strokeStyle = col; x.lineWidth = lw; x.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset); };
    if (style === 'najdi') {
      const bands = [['#00000000', .0], [border, .1], [motif, .02], [ink, .06], [motif, .02], [border, .12], [motif, .02], [ink, .05], [motif, .02], [border, .1]];
      let y = H * .08; x.fillStyle = border; x.fillRect(0, 0, W, H * .06); x.fillRect(0, H * .94, W, H * .06);
      for (let b = 0; b < 7; b++) { // woven bands with diamond runs
        const bh = H * (b % 2 ? .06 : .09), yy = H * (.1 + b * .115);
        x.fillStyle = b % 2 ? ink : border; x.fillRect(0, yy, W, bh);
        const n = 22, dw = W / n; for (let i = 0; i < n; i++) { x.fillStyle = b % 2 ? motif : field; const cx = i * dw + dw / 2, cy = yy + bh / 2, r = bh * .32; x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath(); x.fill(); }
        x.fillStyle = motif; x.fillRect(0, yy - 3, W, 2); x.fillRect(0, yy + bh + 1, W, 2);
      }
    } else if (style === 'classic' || style === 'luxury') {
      x.fillStyle = border; x.fillRect(0, 0, W, bw); x.fillRect(0, H - bw, W, bw); x.fillRect(0, 0, bw, H); x.fillRect(W - bw, 0, bw, H);
      frame(bw, 3, motif); frame(bw * .4, 2, motif);
      x.save(); x.translate(W / 2, H / 2);
      for (let k = 0; k < 4; k++) { x.fillStyle = k % 2 ? motif : border; x.beginPath(); x.ellipse(0, 0, W * (.3 - k * .06), H * (.34 - k * .07), 0, 0, 7); x.fill(); }
      x.fillStyle = field; x.beginPath(); x.ellipse(0, 0, W * .1, H * .12, 0, 0, 7); x.fill();
      for (let k = 0; k < 8; k++) { x.save(); x.rotate(k * Math.PI / 4); x.fillStyle = ink; x.beginPath(); x.ellipse(W * .17, 0, W * .025, W * .012, 0, 0, 7); x.fill(); x.restore(); }
      x.restore();
      for (const [cx, cy] of [[bw, bw], [W - bw, bw], [bw, H - bw], [W - bw, H - bw]]) { x.fillStyle = border; x.beginPath(); x.arc(cx, cy, W * .13, 0, 7); x.fill(); x.fillStyle = motif; x.beginPath(); x.arc(cx, cy, W * .09, 0, 7); x.fill(); }
      if (style === 'luxury') { x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1; for (let i = -H; i < W; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); x.beginPath(); x.moveTo(i + H, 0); x.lineTo(i, H); x.stroke(); } }
    } else if (style === 'dark') {
      x.fillStyle = border; x.fillRect(0, 0, W, bw * .5); x.fillRect(0, H - bw * .5, W, bw * .5); x.fillRect(0, 0, bw * .5, H); x.fillRect(W - bw * .5, 0, bw * .5, H);
      x.fillStyle = motif; x.globalAlpha = .55; x.fillRect(W * .18, H * .2, W * .42, H * .5); x.fillStyle = border; x.fillRect(W * .34, H * .32, W * .46, H * .46); x.globalAlpha = 1;
    } else {
      x.fillStyle = border; x.fillRect(0, 0, W, bw * .8); x.fillRect(0, H - bw * .8, W, bw * .8); x.fillRect(0, 0, bw * .8, H); x.fillRect(W - bw * .8, 0, bw * .8, H);
      x.strokeStyle = motif; x.lineWidth = 3; for (let i = 0; i < 5; i++) { x.strokeRect(W * (.14 + i * .04), H * (.2 + i * .05), W * (.72 - i * .08), H * (.6 - i * .1)); }
      x.fillStyle = motif; x.globalAlpha = .5; x.beginPath(); x.ellipse(W / 2, H / 2, W * .12, H * .14, 0, 0, 7); x.fill(); x.globalAlpha = 1;
    }
    return { color: c };
  });
}

/** Tileable fabric weave as a height map (normal map source): crossed threads. */
export function fabricWeave({ S = 128, coarse = 1 } = {}) {
  return cached(`weave|${S}|${coarse}`, () => greyHeight(S, (px, py) => { const t = S / (16 / coarse), a = Math.sin(px / S * Math.PI * 2 * (16 / coarse)), b = Math.sin(py / S * Math.PI * 2 * (16 / coarse)), o = ((Math.floor(px / t) + Math.floor(py / t)) & 1); return 128 + 60 * (o ? a : b) + 20 * (a * b); }));
}

export const PAINTERS = Object.freeze({ rugPattern, fabricWeave, marble, porcelain, wood, cementTile, clayTile, wallTile, wallPanel, flutedSlats, ashlar, limewash, woodGrain, artPicture });
