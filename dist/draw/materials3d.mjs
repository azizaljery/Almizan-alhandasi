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

// ----- painters: each returns {color, bump?} canvases -------------------------------------------------------
const painters = {
  plaster(S = 512) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(11);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, 70, r, 20, 90, () => r() > .5 ? 'rgba(220,208,186,ALPHA)' : 'rgba(255,252,244,ALPHA)', .13); // soft: strong tan spots read as dirt stains under warm evening light
    noise(x, S, S, 14, r);
    const b = makeCanvas(S), bx = b.getContext('2d'); bx.fillStyle = '#808080'; bx.fillRect(0, 0, S, S); noise(bx, S, S, 90, rng(5));
    return { color: c, bump: b };
  },
  concrete(S = 512) {
    const c = makeCanvas(S), x = c.getContext('2d'), r = rng(21);
    x.fillStyle = '#b7b5b0'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, 90, r, 18, 80, () => r() > .5 ? 'rgba(120,118,112,ALPHA)' : 'rgba(225,223,216,ALPHA)');
    noise(x, S, S, 30, r);
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(70,68,64,${.15 + r() * .25})`; x.beginPath(); x.arc(r() * S, r() * S, .6 + r() * 1.4, 0, 7); x.fill(); }
    return { color: c };
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
    return { color: c };
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
    return { color: c };
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
    return { color: c };
  },
  stone({ S = 1024, size = 2, course = .25, seed = 61, palette = [[214, 196, 164], [204, 184, 150], [222, 206, 176], [196, 176, 142]] } = {}) {
    const c = makeCanvas(S), x = c.getContext('2d'), b = makeCanvas(S), bx = b.getContext('2d'), r = rng(seed), rows = Math.round(size / course), rh = S / rows;
    x.fillStyle = '#6f6554'; x.fillRect(0, 0, S, S); bx.fillStyle = '#202020'; bx.fillRect(0, 0, S, S);
    for (let j = 0; j < rows; j++) {
      let px = -r() * S * .4;
      while (px < S) {
        const len = S * (.17 + r() * .22), col = palette[Math.floor(r() * palette.length)], v = (r() - .5) * 14;
        for (const off of [-S, 0, S]) {
          const X = px + off; if (X + len < 0 || X > S) continue;
          x.fillStyle = `rgb(${clamp(col[0] + v)},${clamp(col[1] + v)},${clamp(col[2] + v)})`; x.fillRect(X + 2, j * rh + 2, len - 4, rh - 4);
          bx.fillStyle = `rgb(${190 + Math.round(r() * 40)},${190},${190})`; bx.fillRect(X + 2, j * rh + 2, len - 4, rh - 4);
          for (let k = 0; k < 9; k++) { const gy = j * rh + 4 + r() * (rh - 8); x.fillStyle = `rgba(90,70,45,${.1 + r() * .15})`; x.fillRect(X + 4 + r() * len * .5, gy, 12 + r() * len * .4, 1.5 + r() * 1.5); }
        }
        px += len;
      }
    }
    noise(x, S, S, 14, r);
    return { color: c, bump: b };
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
    return { color: c };
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
    for (let i = 0; i < 90; i++) { const px = r() * S; x.strokeStyle = `rgba(${r() > .5 ? '40,22,10' : '150,104,66'},${.08 + r() * .14})`; x.lineWidth = .8 + r() * 2; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + (r() - .5) * 18, S * .33, px + (r() - .5) * 18, S * .66, px + (r() - .5) * 8, S); x.stroke(); }
    noise(x, S, S, 8, r);
    return { color: c };
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
  const paint = (name, painter, sizeM, opts) => { if (!hasCanvas) return {}; if (!made[name]) { const p = painter(); made[name] = { map: T(p.color, sizeM, opts), bump: p.bump ? T(p.bump, sizeM, { srgb: false }) : null }; } return made[name]; };

  const plaster = paint('plaster', () => painters.plaster(S(512)), 2), concrete = paint('concrete', () => painters.concrete(S(512)), 2);
  const stone = paint('stone', () => painters.stone({ S: S(1024) }), 2);
  const tileT = paint('tile', () => painters.tile({ S: S(512) }), 1.2);
  const wetT = paint('wet', () => painters.tile({ S: S(512), size: .9, tile: .3, base: [[170, 186, 190], [162, 180, 186], [176, 190, 193]], grout: 'rgba(110,126,130,0.95)', groutPx: 2, seed: 33 }), .9);
  const marbleT = paint('marble', () => painters.marble({ S: S(1024) }), 1.6);
  const woodT = paint('wood', () => painters.wood({ S: S(1024) }), 1.4);
  const grassT = paint('grass', () => painters.grass(S(512)), 3), pavingT = paint('paving', () => painters.paving({ S: S(512) }), 1.2);
  const roofT = paint('roof', () => painters.tile({ S: S(512), size: 1.2, tile: .4, base: [[190, 187, 180], [184, 181, 174], [196, 193, 186]], grout: 'rgba(120,118,112,0.9)', groutPx: 3, seed: 37 }), 1.2);
  const doorT = paint('door', () => painters.door(S(512)), 1);
  const rugT = hasCanvas ? (made.rug ||= { map: T(painters.rug().color, 1, { repeatCover: true }) }) : {};
  const blob = hasCanvas ? (made.blob ||= { map: T(painters.blob().color, 1, { repeatCover: true }) }) : {};
  if (rugT.map) { rugT.map.wrapS = rugT.map.wrapT = THREE.ClampToEdgeWrapping; }
  if (blob.map) { blob.map.wrapS = blob.map.wrapT = THREE.ClampToEdgeWrapping; }

  const std = (name, p) => { const m = new THREE.MeshStandardMaterial(p); m.name = name; return m; };
  const m = {};
  m.paint = std('paint', { color: '#f4efe6', roughness: .93, vertexColors: true });
  m.render = std('render', { color: '#ece0c8', roughness: .96, map: plaster.map || null, bumpMap: plaster.bump || null, bumpScale: .5, vertexColors: true });
  m.plinth = std('plinth', { color: '#d9c7a4', roughness: .88, map: stone.map || null, bumpMap: stone.bump || null, bumpScale: 2.2, vertexColors: true });
  m.accent = std('accent', { color: '#e6d4ae', roughness: .86, map: stone.map || null, bumpMap: stone.bump || null, bumpScale: 2.2, vertexColors: true });
  m.reveal = std('reveal', { color: '#f1ebdf', roughness: .95, vertexColors: true });
  m.slabEdge = std('slabEdge', { color: '#cfcac0', roughness: .95, map: concrete.map || null });
  m.ceiling = std('ceiling', { color: '#f8f5ef', roughness: 1 });
  m.skirting = std('skirting', { color: '#f6f2ea', roughness: .55 });
  m.tile = std('tile', { color: '#ffffff', roughness: .28, metalness: 0, map: tileT.map || null, envMapIntensity: .9 });
  m.marble = std('marble', { color: '#ffffff', roughness: .16, map: marbleT.map || null, envMapIntensity: 1.2 });
  m.wood = std('wood', { color: '#ffffff', roughness: .5, map: woodT.map || null });
  m.wet = std('wet', { color: '#ffffff', roughness: .3, map: wetT.map || null });
  const PO = (f, u) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: u });
  m.concrete = std('concrete', { color: '#ffffff', roughness: .95, map: concrete.map || null, ...PO(-2, -2) });
  m.grass = std('grass', { color: '#ffffff', roughness: 1, map: grassT.map || null, ...PO(-1, -1) });
  m.paving = std('paving', { color: '#ffffff', roughness: .92, map: pavingT.map || null, ...PO(-3, -3) });
  m.roof = std('roof', { color: '#ffffff', roughness: .9, map: roofT.map || null });
  m.coping = std('coping', { color: '#e5e0d6', roughness: .9 });
  m.aluminium = std('aluminium', { color: '#3b3836', roughness: .42, metalness: .7 });
  m.glass = std('glass', { color: '#a7c3d2', roughness: .04, metalness: .05, transparent: true, opacity: .3, envMapIntensity: 1.9, depthWrite: false });
  m.doorLeaf = std('doorLeaf', { color: '#ffffff', roughness: .55, map: doorT.map || null });
  m.doorWhite = std('doorWhite', { color: '#f1eee8', roughness: .5 });
  m.doorEntry = std('doorEntry', { color: '#3a2a22', roughness: .45, map: doorT.map || null });
  m.doorFrame = std('doorFrame', { color: '#f4f1ea', roughness: .5 });
  m.handle = std('handle', { color: '#c9ccce', roughness: .28, metalness: 1 });
  m.metal = std('metal', { color: '#2b2c2e', roughness: .5, metalness: .8 });
  m.garageDoor = std('garageDoor', { color: '#d8d6d0', roughness: .5, metalness: .3 });
  m.sillStone = std('sillStone', { color: '#e8e1d2', roughness: .6 });
  m.stairTread = std('stairTread', { color: '#ffffff', roughness: .3, map: marbleT.map || null });
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
  m.fence = std('fence', { color: '#ece0c8', roughness: .96, map: plaster.map || null, bumpMap: plaster.bump || null, bumpScale: .5 });
  m.fenceStone = std('fenceStone', { color: '#d9c7a4', roughness: .88, map: stone.map || null, bumpMap: stone.bump || null, bumpScale: 2.2 });

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

export default { createMaterialLibrary, makeCanvas };
