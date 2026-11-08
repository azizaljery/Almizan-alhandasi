// Procedural canvas textures + PBR materials for the 3D engine.  No image files, no network.
// Every texture is tiling and measured in metres (texture.repeat = 1 / size), so the geometry builders
// only have to hand out UVs in metres.
import { createFixtureMaterials, rng } from './fixtures3d.mjs';

export function makeCanvas(w, h = w) {
  if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));

function noise(ctx, S, H, amp, r, tint = [0, 0, 0]) {
  const img = ctx.getImageData(0, 0, S, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - .5) * amp;
    d[i] = clamp(d[i] + n + tint[0]); d[i + 1] = clamp(d[i + 1] + n + tint[1]); d[i + 2] = clamp(d[i + 2] + n + tint[2]);
  }
  ctx.putImageData(img, 0, 0);
}
function blotches(ctx, S, H, n, r, rMin, rMax, colorFn, alpha = .3) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * H, rad = rMin + r() * (rMax - rMin), c = colorFn(r);
    for (const ox of [-S, 0, S]) for (const oy of [-H, 0, H]) {
      const px = x + ox, py = y + oy;
      if (px + rad < 0 || px - rad > S || py + rad < 0 || py - rad > H) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, c.replace('ALPHA', String(alpha))); g.addColorStop(1, c.replace('ALPHA', '0'));
      ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
  }
}

// ----- height -> normal / roughness helpers ------------------------------------------------------------------
/** Tangent-space normal map from a grey height canvas (wraps at the edges, so tiling stays seamless). */
export function normalFromHeight(hc, strength = 2) {
  if (!hc) return null;
  const W = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, W, H).data;
  const out = makeCanvas(W, H), ox = out.getContext('2d'), img = ox.createImageData(W, H), d = img.data;
  const h = (x, y) => src[((((y + H) % H) * W) + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // canvas rows run down, texture v runs up (flipY): dh/dv = -(row derivative)
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = -(h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    d[i] = (-dx / l * .5 + .5) * 255; d[i + 1] = (-dy / l * .5 + .5) * 255; d[i + 2] = (1 / l * .5 + .5) * 255; d[i + 3] = 255;
  }
  ox.putImageData(img, 0, 0); return out;
}
/** Grey canvas filled with a value plus noise (roughness / height base). */
function greyCanvas(S, H, v, amp, r) { const c = makeCanvas(S, H), x = c.getContext('2d'); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, 0, S, H); if (amp) noise(x, S, H, amp, r); return { c, x }; }

// ----- painters: each returns {color, bump?} canvases -------------------------------------------------------
const painters = {
  plaster(S = 512) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(11);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, 70, r, 20, 90, () => r() > .5 ? 'rgba(220,208,186,ALPHA)' : 'rgba(255,252,244,ALPHA)', .13); // soft: strong tan spots read as dirt stains under warm evening light
    noise(x, S, S, 14, r);
    const b = makeCanvas(S), bx = b.getContext('2d'); bx.fillStyle = '#808080'; bx.fillRect(0, 0, S, S);
    // trowel marks: broad soft swells + fine sand grain (micro roughness)
    blotches(bx, S, S, 60, rng(6), 30, 110, rr => rr() > .5 ? 'rgba(170,170,170,ALPHA)' : 'rgba(90,90,90,ALPHA)', .35);
    noise(bx, S, S, 70, rng(5));
    return { color: c, bump: b };
  },
  /** interior emulsion over gypsum: a faint roller "orange peel" (height only; the colour comes from the room tint). */
  paintMicro(S = 256) {
    const r = rng(13), { c, x } = greyCanvas(S, S, 128, 0, r);
    blotches(x, S, S, 160, r, 3, 10, rr => rr() > .5 ? 'rgba(160,160,160,ALPHA)' : 'rgba(100,100,100,ALPHA)', .5);
    noise(x, S, S, 26, r);
    return { height: c };
  },
  concrete(S = 512) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(21);
    x.fillStyle = '#b7b5b0'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, 90, r, 18, 80, () => r() > .5 ? 'rgba(120,118,112,ALPHA)' : 'rgba(225,223,216,ALPHA)');
    noise(x, S, S, 30, r);
    const { c: hc, x: hx } = greyCanvas(S, S, 150, 40, rng(22));
    for (let i = 0; i < 160; i++) { const px = r() * S, py = r() * S, rad = .6 + r() * 1.4; x.fillStyle = `rgba(70,68,64,${.15 + r() * .25})`; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill(); hx.fillStyle = '#404040'; hx.beginPath(); hx.arc(px, py, rad, 0, 7); hx.fill(); }
    return { color: c, height: hc };
  },
  tile({ S = 512, size = 1.2, tile = .6, base = [[232, 229, 221]], grout = 'rgba(150,145,135,0.95)', groutPx = 3, vein = false, seed = 31 } = {}) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(seed), n = Math.round(size / tile), ts = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const b = base[Math.floor(r() * base.length)], v = (r() - .5) * 8;
      const g = x.createLinearGradient(i * ts, j * ts, (i + 1) * ts, (j + 1) * ts);
      g.addColorStop(0, `rgb(${clamp(b[0] + v + 5)},${clamp(b[1] + v + 5)},${clamp(b[2] + v + 5)})`); g.addColorStop(1, `rgb(${clamp(b[0] + v - 5)},${clamp(b[1] + v - 5)},${clamp(b[2] + v - 5)})`);
      x.fillStyle = g; x.fillRect(i * ts, j * ts, ts, ts);
    }
    noise(x, S, S, 8, r);
    x.strokeStyle = grout; x.lineWidth = groutPx;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * ts, 0); x.lineTo(i * ts, S); x.stroke(); x.beginPath(); x.moveTo(0, i * ts); x.lineTo(S, i * ts); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) x.strokeRect(i * ts + groutPx, j * ts + groutPx, ts - groutPx * 2, ts - groutPx * 2);
    // height: flat glazed faces, recessed grout; roughness: glaze ~0.25, grout ~0.85
    const { c: hc, x: hx } = greyCanvas(S, S, 200, 3, rng(seed + 1)), { c: rc, x: rx } = greyCanvas(S, S, 64, 10, rng(seed + 2));
    hx.strokeStyle = '#3c3c3c'; hx.lineWidth = groutPx + 1; rx.strokeStyle = '#d8d8d8'; rx.lineWidth = groutPx + 1;
    for (let i = 0; i <= n; i++) for (const g of [hx, rx]) { g.beginPath(); g.moveTo(i * ts, 0); g.lineTo(i * ts, S); g.stroke(); g.beginPath(); g.moveTo(0, i * ts); g.lineTo(S, i * ts); g.stroke(); }
    return { color: c, height: hc, rough: rc };
  },
  marble({ S = 1024, size = 1.6, slab = .8, palette = [[236, 228, 212], [230, 220, 202], [240, 234, 222], [226, 215, 196]], seed = 41 } = {}) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(seed), n = Math.round(size / slab), ts = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const b = palette[Math.floor(r() * palette.length)], ox = i * ts, oy = j * ts;
      x.save(); x.beginPath(); x.rect(ox, oy, ts, ts); x.clip();
      x.fillStyle = `rgb(${b[0]},${b[1]},${b[2]})`; x.fillRect(ox, oy, ts, ts);
      for (let k = 0; k < 18; k++) { const px = ox + r() * ts, py = oy + r() * ts, rad = ts * (.15 + r() * .35), gg = x.createRadialGradient(px, py, 0, px, py, rad); const dark = r() > .55; gg.addColorStop(0, dark ? 'rgba(168,150,120,0.22)' : 'rgba(255,252,246,0.35)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gg; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
      const veins = 3 + Math.floor(r() * 3);
      for (let k = 0; k < veins; k++) {
        let px = ox + r() * ts, py = oy + (r() > .5 ? 0 : ts), ang = r() * Math.PI * 2;
        for (const [lw, col] of [[2.2, 'rgba(150,130,100,0.16)'], [.9, 'rgba(112,92,66,0.5)']]) {
          x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); let qx = px, qy = py, a = ang; x.moveTo(qx, qy);
          const rr = rng(seed + k * 17 + i * 3 + j * 5);
          for (let s = 0; s < 40; s++) { a += (rr() - .5) * .9; qx += Math.cos(a) * ts / 22; qy += Math.sin(a) * ts / 22; x.lineTo(qx, qy); }
          x.stroke();
        }
      }
      x.restore();
    }
    noise(x, S, S, 5, r);
    x.strokeStyle = 'rgba(196,186,166,0.9)'; x.lineWidth = 2;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * ts, 0); x.lineTo(i * ts, S); x.stroke(); x.beginPath(); x.moveTo(0, i * ts); x.lineTo(S, i * ts); x.stroke(); }
    // polished slabs: roughness 0.08-0.16 with faint wipe marks; hair-line joints are matte and recessed
    const { c: rc, x: rx } = greyCanvas(S, S, 26, 6, rng(seed + 2)), { c: hc, x: hx } = greyCanvas(S, S, 200, 0, rng(seed + 3));
    blotches(rx, S, S, 40, rng(seed + 4), 40, 160, () => 'rgba(52,52,52,ALPHA)', .5);
    rx.strokeStyle = '#a0a0a0'; rx.lineWidth = 3; hx.strokeStyle = '#606060'; hx.lineWidth = 3;
    for (let i = 0; i <= n; i++) for (const g of [rx, hx]) { g.beginPath(); g.moveTo(i * ts, 0); g.lineTo(i * ts, S); g.stroke(); g.beginPath(); g.moveTo(0, i * ts); g.lineTo(S, i * ts); g.stroke(); }
    return { color: c, rough: rc, height: hc };
  },
  /** cement terrazzo: marble chips of three sizes in a warm grey matrix, 60 cm slabs with brass-coloured strips. */
  terrazzo({ S = 1024, size = 1.2, slab = .6, seed = 45 } = {}) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(seed), n = Math.round(size / slab), ts = S / n;
    x.fillStyle = '#d9d3c7'; x.fillRect(0, 0, S, S); noise(x, S, S, 10, r);
    const chips = [[238, 234, 226], [196, 186, 170], [150, 140, 128], [222, 206, 182], [120, 112, 104], [244, 240, 232]];
    for (let k = 0; k < 9000; k++) { const p = chips[Math.floor(r() * chips.length)], rad = r() < .8 ? .8 + r() * 2.2 : 2.5 + r() * 5, px = r() * S, py = r() * S, v = (r() - .5) * 16;
      x.fillStyle = `rgb(${clamp(p[0] + v)},${clamp(p[1] + v)},${clamp(p[2] + v)})`; x.beginPath();
      const sides = 5 + Math.floor(r() * 3), a0 = r() * 6.3; for (let i = 0; i < sides; i++) { const a = a0 + i / sides * 6.283, rr = rad * (.7 + r() * .5); i ? x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr) : x.moveTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); } x.closePath(); x.fill(); }
    x.strokeStyle = 'rgba(176,146,92,0.95)'; x.lineWidth = 2.5;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * ts, 0); x.lineTo(i * ts, S); x.stroke(); x.beginPath(); x.moveTo(0, i * ts); x.lineTo(S, i * ts); x.stroke(); }
    const { c: rc } = greyCanvas(S, S, 70, 14, rng(seed + 1));
    return { color: c, rough: rc };
  },
  wood({ S = 1024, size = 1.4, plank = .14, seed = 51 } = {}) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(seed), rows = Math.round(size / plank), rh = S / rows;
    x.fillStyle = '#7a5434'; x.fillRect(0, 0, S, S);
    for (let j = 0; j < rows; j++) {
      let px = -r() * S * .6;
      while (px < S) {
        const len = S * (.4 + r() * .55), hue = 28 + r() * 7, sat = 38 + r() * 14, lig = 44 + r() * 14;
        for (const off of [-S, 0, S]) {
          const X = px + off; if (X + len < 0 || X > S) continue;
          x.fillStyle = hsl(hue, sat, lig); x.fillRect(X, j * rh, len, rh);
          for (let k = 0; k < 14; k++) { const gy = j * rh + r() * rh; x.strokeStyle = `rgba(60,34,16,${.05 + r() * .12})`; x.lineWidth = .6 + r() * 1.1; x.beginPath(); x.moveTo(X, gy); x.bezierCurveTo(X + len * .3, gy + (r() - .5) * 5, X + len * .6, gy + (r() - .5) * 5, X + len, gy + (r() - .5) * 3); x.stroke(); }
          if (r() > .88) { x.fillStyle = 'rgba(70,40,20,0.45)'; x.beginPath(); x.ellipse(X + len * r(), j * rh + rh / 2, 4 + r() * 3, 2 + r() * 2, 0, 0, 7); x.fill(); }
          x.fillStyle = 'rgba(30,16,6,0.55)'; x.fillRect(X, j * rh, 1.6, rh);
        }
        px += len;
      }
      x.fillStyle = 'rgba(30,16,6,0.5)'; x.fillRect(0, j * rh, S, 1.4);
    }
    noise(x, S, S, 8, r);
    // height and roughness follow the painted grain: darker grain lines sit lower and are a little rougher (open pores)
    const src = x.getImageData(0, 0, S, S).data, hc = makeCanvas(S), hx = hc.getContext('2d'), hi = hx.createImageData(S, S), rc = makeCanvas(S), rx = rc.getContext('2d'), ri = rx.createImageData(S, S);
    for (let i = 0; i < src.length; i += 4) { const lum = (src[i] * .3 + src[i + 1] * .59 + src[i + 2] * .11) / 255, hv = clamp(70 + lum * 300), rv = clamp(150 - lum * 120);
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = hv; hi.data[i + 3] = 255; ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = rv; ri.data[i + 3] = 255; }
    hx.putImageData(hi, 0, 0); rx.putImageData(ri, 0, 0);
    return { color: c, height: hc, rough: rc };
  },
  stone({ S = 1024, size = 2, course = .25, seed = 61, palette = [[214, 196, 164], [204, 184, 150], [222, 206, 176], [196, 176, 142], [210, 190, 158]] } = {}) {
    // ashlar limestone: courses of `course` metres, blocks 0.35-0.8 m long, 10 mm mortar joints (recessed), a small
    // arris bevel on every block, per-block tone and hue drift, chisel streaks and sparse fossil specks.
    const c = makeCanvas(S), x = c.getContext('2d'), b = makeCanvas(S), bx = b.getContext('2d'), r = rng(seed), rows = Math.round(size / course), rh = S / rows;
    const pxm = S / size, joint = Math.max(2, Math.round(.011 * pxm)), bev = Math.max(1, Math.round(.006 * pxm));
    const { c: rc, x: rx } = greyCanvas(S, S, 200, 0, r);
    x.fillStyle = '#9c917e'; x.fillRect(0, 0, S, S); noise(x, S, S, 18, r);             // mortar
    bx.fillStyle = '#262626'; bx.fillRect(0, 0, S, S);
    for (let j = 0; j < rows; j++) {
      let px = -r() * S * .4;
      while (px < S) {
        const len = pxm * (.35 + r() * .45), col = palette[Math.floor(r() * palette.length)], v = (r() - .5) * 18, hue = (r() - .5) * 8;
        for (const off of [-S, 0, S]) {
          const X = px + off; if (X + len < 0 || X > S) continue;
          const x0 = X + joint / 2, y0 = j * rh + joint / 2, w = len - joint, h = rh - joint;
          const g = x.createLinearGradient(x0, y0, x0 + w, y0 + h);
          g.addColorStop(0, `rgb(${clamp(col[0] + v + hue)},${clamp(col[1] + v)},${clamp(col[2] + v - hue)})`);
          g.addColorStop(1, `rgb(${clamp(col[0] + v + hue - 9)},${clamp(col[1] + v - 9)},${clamp(col[2] + v - hue - 8)})`);
          x.fillStyle = g; x.fillRect(x0, y0, w, h);
          for (let k = 0; k < 10; k++) { const gy = y0 + 3 + r() * (h - 6); x.fillStyle = `rgba(110,88,60,${.06 + r() * .12})`; x.fillRect(x0 + 3 + r() * w * .5, gy, 10 + r() * w * .45, 1 + r() * 1.6); }
          for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(${r() > .5 ? '250,244,230' : '120,100,76'},${.25 + r() * .3})`; x.beginPath(); x.arc(x0 + r() * w, y0 + r() * h, .6 + r() * 1.6, 0, 7); x.fill(); }
          // height: bevel ring then the face, with a gentle per-block tilt so neighbours catch light differently
          bx.fillStyle = '#9a9a9a'; bx.fillRect(x0, y0, w, h);
          const t = 205 + Math.round(r() * 30), hg = bx.createLinearGradient(x0, y0, x0 + w * (r() - .5), y0 + h);
          hg.addColorStop(0, `rgb(${t},${t},${t})`); hg.addColorStop(1, `rgb(${t - 18},${t - 18},${t - 18})`);
          bx.fillStyle = hg; bx.fillRect(x0 + bev, y0 + bev, w - 2 * bev, h - 2 * bev);
          for (let k = 0; k < 14; k++) { bx.fillStyle = `rgba(${r() > .5 ? '255,255,255' : '0,0,0'},${.05 + r() * .08})`; bx.fillRect(x0 + bev + r() * (w - 2 * bev - 14), y0 + bev + r() * (h - 2 * bev - 3), 6 + r() * 26, 1 + r() * 2); }
          const rv = 175 + Math.round(r() * 50); rx.fillStyle = `rgb(${rv},${rv},${rv})`; rx.fillRect(x0, y0, w, h);
        }
        px += len;
      }
    }
    noise(x, S, S, 10, r); noise(bx, S, S, 16, rng(seed + 9)); noise(rx, S, S, 12, rng(seed + 8));
    return { color: c, bump: b, height: b, rough: rc };
  },
  paving({ S = 512, size = 1.2, seed = 71 } = {}) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(seed), cols = 6, rows = 12, cw = S / cols, rh = S / rows;
    x.fillStyle = '#6e6a63'; x.fillRect(0, 0, S, S);
    const pal = [[196, 182, 160], [178, 166, 146], [208, 196, 174], [168, 152, 136], [188, 170, 146]];
    for (let j = 0; j < rows; j++) for (let i = -1; i < cols; i++) {
      const o = (j % 2) * cw / 2, p = pal[Math.floor(r() * pal.length)], v = (r() - .5) * 14;
      for (const off of [0, S]) { x.fillStyle = `rgb(${clamp(p[0] + v)},${clamp(p[1] + v)},${clamp(p[2] + v)})`; x.fillRect(i * cw + o + 1.5 + (off ? 0 : 0), j * rh + 1.5, cw - 3, rh - 3); }
    }
    noise(x, S, S, 14, r);
    const { c: hc, x: hx } = greyCanvas(S, S, 50, 0, r); hx.fillStyle = '#d0d0d0';
    for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) { const o = (j % 2) * cw / 2; hx.fillRect(i * cw + o + 2, j * rh + 2, cw - 4, rh - 4); }
    noise(hx, S, S, 24, rng(seed + 1));
    return { color: c, height: hc };
  },
  grass(S = 512) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(81);
    x.fillStyle = '#5b8a38'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, 120, r, 20, 70, () => r() > .5 ? 'rgba(112,158,64,ALPHA)' : 'rgba(46,92,34,ALPHA)');
    for (let i = 0; i < 5200; i++) { const px = r() * S, py = r() * S, l = 3 + r() * 5, a = -Math.PI / 2 + (r() - .5) * 1.1; x.strokeStyle = r() > .5 ? `rgba(122,172,70,${.3 + r() * .4})` : `rgba(38,82,30,${.3 + r() * .4})`; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    noise(x, S, S, 12, r);
    return { color: c };
  },
  door(S = 512) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(91);
    x.fillStyle = '#7a5538'; x.fillRect(0, 0, S, S);
    const { c: hc, x: hx } = greyCanvas(S, S, 150, 0, r);
    for (let i = 0; i < 90; i++) { const px = r() * S, dark = r() > .5, a = .08 + r() * .14, lw = .8 + r() * 2, k = [(r() - .5) * 18, (r() - .5) * 18, (r() - .5) * 8];
      for (const [g, col] of [[x, `rgba(${dark ? '40,22,10' : '150,104,66'},${a})`], [hx, `rgba(${dark ? '0,0,0' : '255,255,255'},${a * 1.6})`]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(px, 0); g.bezierCurveTo(px + k[0], S * .33, px + k[1], S * .66, px + k[2], S); g.stroke(); } }
    noise(x, S, S, 8, r);
    return { color: c, height: hc };
  },
  rug(W = 512, H = 362) {
    const c = makeCanvas(W, H), x = c.getContext('2d'), r = rng(101);
    const fill = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    fill('#f1e6cf', 0, 0, W, H); fill('#1f2b4a', 14, 14, W - 28, H - 28); fill('#f1e6cf', 30, 30, W - 60, H - 60); fill('#7b2430', 44, 44, W - 88, H - 88);
    x.strokeStyle = '#c9a24c'; x.lineWidth = 3; x.strokeRect(54, 54, W - 108, H - 108);
    x.fillStyle = '#d9b968';
    for (let i = 0; i < 18; i++) { const px = 44 + (i + .5) * (W - 88) / 18; for (const py of [37, H - 37]) { x.beginPath(); x.moveTo(px, py - 5); x.lineTo(px + 5, py); x.lineTo(px, py + 5); x.lineTo(px - 5, py); x.closePath(); x.fill(); } }
    const cx = W / 2, cy = H / 2;
    for (const [rad, col] of [[118, '#1f2b4a'], [96, '#e9d9b0'], [78, '#7b2430'], [52, '#c9a24c'], [34, '#1f2b4a'], [16, '#e9d9b0']]) { x.fillStyle = col; x.beginPath(); x.moveTo(cx, cy - rad * .85); x.lineTo(cx + rad * 1.5, cy); x.lineTo(cx, cy + rad * .85); x.lineTo(cx - rad * 1.5, cy); x.closePath(); x.fill(); }
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (let k = 0; k < 6; k++) { x.fillStyle = k % 2 ? '#c9a24c' : '#e9d9b0'; x.beginPath(); x.arc(cx + sx * (150 + k * 14), cy + sy * (40 + k * 12), 5, 0, 7); x.fill(); }
    noise(x, W, H, 14, r);
    return { color: c };
  },
  blob(S = 128) {
    const c = makeCanvas(S), x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(.55, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S); return { color: c };
  },
};

/**
 * Create every material the 3D engine uses.  `lib.m` is the name -> material map, `lib.fixtures` the furniture subset.
 * Pass { textures: false } (tests, no canvas) to get plain coloured materials.
 */
export function createMaterialLibrary(THREE, { textures = true, maxAnisotropy = 4, quality = 1 } = {}) {
  const tex = [], hasCanvas = textures && !!makeCanvas(2);
  const T = (canvas, sizeM, { srgb = true, repeatCover = false } = {}) => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (!repeatCover) t.repeat.set(1 / sizeM, 1 / sizeM);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAnisotropy; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    tex.push(t); return t;
  };
  const S = n => Math.round(n * quality);
  const made = {};
  // each painted set: colour map (sRGB), optional bump, tangent-space normal map from its height (strength `ns`) and roughness map (linear)
  const paint = (name, painter, sizeM, opts = {}) => {
    if (!hasCanvas) return {};
    if (!made[name]) {
      const p = painter(), lin = { srgb: false };
      made[name] = { map: p.color ? T(p.color, sizeM, opts) : null, bump: p.bump ? T(p.bump, sizeM, lin) : null, normal: p.height && opts.ns !== 0 ? T(normalFromHeight(p.height, opts.ns ?? 3), sizeM, lin) : null, rough: p.rough ? T(p.rough, sizeM, lin) : null };
    }
    return made[name];
  };

  const plaster = paint('plaster', () => { const p = painters.plaster(S(512)); return { ...p, height: p.bump }; }, 2, { ns: 1.6 }), concrete = paint('concrete', () => painters.concrete(S(512)), 2, { ns: 2 });
  const stone = paint('stone', () => painters.stone({ S: S(1024) }), 2, { ns: 5 });
  const terrazzoT = paint('terrazzo', () => painters.terrazzo({ S: S(1024) }), 1.2);
  const tileT = paint('tile', () => painters.tile({ S: S(512) }), 1.2, { ns: 4 });
  const wetT = paint('wet', () => painters.tile({ S: S(512), size: .9, tile: .3, base: [[170, 186, 190], [162, 180, 186], [176, 190, 193]], grout: 'rgba(110,126,130,0.95)', groutPx: 2, seed: 33 }), .9, { ns: 4 });
  const marbleT = paint('marble', () => painters.marble({ S: S(1024) }), 1.6, { ns: 3 });
  const woodT = paint('wood', () => painters.wood({ S: S(1024) }), 1.4, { ns: 1.5 });
  const grassT = paint('grass', () => painters.grass(S(512)), 3), pavingT = paint('paving', () => painters.paving({ S: S(512) }), 1.2, { ns: 3 });
  const roofT = paint('roof', () => painters.tile({ S: S(512), size: 1.2, tile: .4, base: [[190, 187, 180], [184, 181, 174], [196, 193, 186]], grout: 'rgba(120,118,112,0.9)', groutPx: 3, seed: 37 }), 1.2, { ns: 3 });
  const doorT = paint('door', () => painters.door(S(512)), 1, { ns: 1.2 });
  const rugT = hasCanvas ? (made.rug ||= { map: T(painters.rug().color, 1, { repeatCover: true }) }) : {};
  const blob = hasCanvas ? (made.blob ||= { map: T(painters.blob().color, 1, { repeatCover: true }) }) : {};
  if (rugT.map) { rugT.map.wrapS = rugT.map.wrapT = THREE.ClampToEdgeWrapping; }
  if (blob.map) { blob.map.wrapS = blob.map.wrapT = THREE.ClampToEdgeWrapping; }

  const std = (name, p) => { const m = new THREE.MeshStandardMaterial(p); m.name = name; return m; };
  const N = (set, k = 1) => (set?.normal ? { normalMap: set.normal, normalScale: new THREE.Vector2(k, k) } : {});
  const RM = (set, fallback) => (set?.rough ? { roughnessMap: set.rough, roughness: 1 } : { roughness: fallback });
  const m = {};
  // interior paint stays map-free: it covers most of the screen indoors, so it is kept to the cheapest shader path
  m.paint = std('paint', { color: '#f6f1e7', roughness: .9, vertexColors: true });
  m.render = std('render', { color: '#ece0c8', roughness: .95, map: plaster.map || null, ...N(plaster, .7), vertexColors: true });
  m.plinth = std('plinth', { color: '#d9c7a4', map: stone.map || null, ...N(stone, 1.1), ...RM(stone, .88), vertexColors: true });
  m.accent = std('accent', { color: '#e6d4ae', map: stone.map || null, ...N(stone, 1.1), ...RM(stone, .86), vertexColors: true });
  m.reveal = std('reveal', { color: '#f1ebdf', roughness: .95, vertexColors: true });
  m.slabEdge = std('slabEdge', { color: '#cfcac0', roughness: .95, map: concrete.map || null, ...N(concrete, .8) });
  m.ceiling = std('ceiling', { color: '#fbf8f2', roughness: 1 });
  m.skirting = std('skirting', { color: '#f6f2ea', roughness: .55 });
  // performance budget (software rasterisers count every texture fetch): floors get one detail map each — a normal map
  // where relief reads (grout, plank grain, stone joints), a roughness map where reflections read (polished marble)
  m.tile = std('tile', { color: '#ffffff', metalness: 0, roughness: .28, map: tileT.map || null, ...N(tileT, .9), envMapIntensity: .9 });
  m.marble = std('marble', { color: '#ffffff', map: marbleT.map || null, ...RM(marbleT, .16), envMapIntensity: 1.2 });
  m.terrazzo = std('terrazzo', { color: '#ffffff', map: terrazzoT.map || null, ...RM(terrazzoT, .3), envMapIntensity: 1 });
  m.wood = std('wood', { color: '#ffffff', roughness: .5, map: woodT.map || null, ...N(woodT, .8) });
  m.wet = std('wet', { color: '#ffffff', roughness: .3, map: wetT.map || null, ...N(wetT, .9) });
  const PO = (f, u) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: u });
  m.concrete = std('concrete', { color: '#ffffff', roughness: .95, map: concrete.map || null, ...N(concrete, .8), ...PO(-2, -2) });
  m.grass = std('grass', { color: '#ffffff', roughness: 1, map: grassT.map || null, ...PO(-1, -1) });
  m.paving = std('paving', { color: '#ffffff', roughness: .92, map: pavingT.map || null, ...N(pavingT, 1), ...PO(-3, -3) });
  m.roof = std('roof', { color: '#ffffff', roughness: .9, map: roofT.map || null, ...N(roofT, .8) });
  m.coping = std('coping', { color: '#e5e0d6', roughness: .9 });
  m.aluminium = std('aluminium', { color: '#3b3836', roughness: .38, metalness: .75 });
  // glass: near-clear with a faint green-grey body, mirror-like environment reflection (PMREM sky) and a little more opacity at grazing angles comes from the BRDF
  m.glass = std('glass', { color: '#9fb9c2', roughness: .02, metalness: .12, transparent: true, opacity: .26, envMapIntensity: 2.4, depthWrite: false });
  m.doorLeaf = std('doorLeaf', { color: '#ffffff', roughness: .55, map: doorT.map || null, ...N(doorT, .5) });
  m.doorWhite = std('doorWhite', { color: '#f1eee8', roughness: .5 });
  m.doorEntry = std('doorEntry', { color: '#3a2a22', roughness: .45, map: doorT.map || null, ...N(doorT, .6) });
  m.doorFrame = std('doorFrame', { color: '#f4f1ea', roughness: .5 });
  m.handle = std('handle', { color: '#c9ccce', roughness: .28, metalness: 1 });
  m.metal = std('metal', { color: '#2b2c2e', roughness: .5, metalness: .8 });
  m.garageDoor = std('garageDoor', { color: '#d8d6d0', roughness: .5, metalness: .3 });
  m.sillStone = std('sillStone', { color: '#e8e1d2', roughness: .6 });
  m.stairTread = std('stairTread', { color: '#ffffff', map: marbleT.map || null, ...RM(marbleT, .3) });
  m.stairRiser = std('stairRiser', { color: '#e9e3d6', roughness: .8 });
  m.shadowBlob = new THREE.MeshBasicMaterial({ map: blob.map || null, color: '#000000', transparent: true, depthWrite: false, opacity: .8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.shadowBlob.name = 'shadowBlob';
  m.aoDecal = new THREE.MeshBasicMaterial({ color: '#000000', vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.aoDecal.name = 'aoDecal';
  m.section = std('section', { color: '#d6cdbd', roughness: 1 });
  m.trim = std('trim', { color: '#f6f1e6', roughness: .85 });
  m.terrain = std('terrain', { color: '#bfae8a', roughness: 1 });
  m.asphalt = std('asphalt', { color: '#3b3d40', roughness: .95, ...PO(-2, -2) });
  m.laneLine = std('laneLine', { color: '#e9e6dc', roughness: .8, ...PO(-4, -4) });
  m.sidewalk = std('sidewalk', { color: '#ffffff', roughness: .9, map: pavingT.map || null, ...PO(-3, -3) });
  m.hedge = std('hedge', { color: '#3f7a3a', roughness: .9 });
  m.cap = std('cap', { color: '#d8d2c4', roughness: .9 });
  m.fence = std('fence', { color: '#ece0c8', roughness: .96, map: plaster.map || null, ...N(plaster, .7) });
  m.fenceStone = std('fenceStone', { color: '#d9c7a4', map: stone.map || null, ...N(stone, 1.1), ...RM(stone, .88) });

  const fixtureExtra = {};
  if (rugT.map) fixtureExtra.rug = std('rug', { color: '#ffffff', roughness: 1, map: rugT.map });
  const fixtures = createFixtureMaterials(THREE, fixtureExtra);
  fixtures.fglass = m.glass;

  const all = new Map();
  for (const [k, v] of Object.entries(m)) all.set(v, k);
  for (const [k, v] of Object.entries(fixtures)) if (!all.has(v)) all.set(v, 'f:' + k);
  const reverse = material => all.get(material);

  return {
    m, fixtures, reverse, textures: tex,
    get: key => (key.startsWith('f:') ? fixtures[key.slice(2)] : m[key]),
    setAnisotropy(n) { for (const t of tex) t.anisotropy = n; },
    dispose() { for (const t of tex) t.dispose(); for (const v of all.keys()) v.dispose(); },
  };
}

export default { createMaterialLibrary, makeCanvas, normalFromHeight };
