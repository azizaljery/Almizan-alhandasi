// (طلب المالك 2026-11-02) خامات إجرائية للعينة: حجر جيري بفواصل مداميك وتباين طبيعي، رندر، خشب مشابه (إجرائي)، ألمنيوم وزجاج.
// لا صور ولا شبكة. الطول بالمتر: كل نسيج يتكرر على 1.5 م (حجر) أو 1.2 م (خشب) أو 2 م (رندر).
// الخامات المرسومة هنا تمثل فئاتها فقط؛ لا تدّعي مطابقة مواصفة أو لونًا تجاريًا.
import { makeCanvas } from '../draw/materials3d.mjs';
import { rng } from '../draw/fixtures3d.mjs';
import { MATERIALS } from './model.mjs';

const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));
function noiseCanvas(ctx, S, amp, r, tint = 0) {
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * amp + tint; d[i] = clamp(d[i] + n); d[i + 1] = clamp(d[i + 1] + n); d[i + 2] = clamp(d[i + 2] + n); }
  ctx.putImageData(img, 0, 0);
}
function blotch(ctx, S, n, r, rMin, rMax, colors, alpha) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, rad = rMin + r() * (rMax - rMin), c = colors[Math.floor(r() * colors.length)];
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const px = x + ox, py = y + oy; if (px + rad < 0 || px - rad > S || py + rad < 0 || py - rad > S) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, c.replace('A', String(alpha))); g.addColorStop(1, c.replace('A', '0'));
      ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
  }
}

/** حجر جيري: مداميك بارتفاع 22 إلى 38 سم، كتل بعرض 35 إلى 90 سم بإزاحة لكل مدماك، فواصل 1.2 سم، تباين لوني طفيف لكل كتلة. */
/** joints=false: سطح الخامة وحده (ملمس وتبقّع دون رسم فواصل)، لأن الفواصل صارت هندسة منفصلة في scene.mjs. */
export function limestone(tone = 'white', S = 1024, { joints = true } = {}) {
  const TILE = 1.5, px = S / TILE, r = rng(tone === 'white' ? 71 : 73);
  const base = tone === 'white' ? [236, 230, 216] : [214, 192, 152];
  const c = makeCanvas(S), x = c.getContext('2d'), b = makeCanvas(S), bx = b.getContext('2d');
  x.fillStyle = joints ? `rgb(${base.map(v => v * .8 | 0)})` : `rgb(${base.join(',')})`; x.fillRect(0, 0, S, S); // لون الفواصل (أو سطح الخامة)
  bx.fillStyle = joints ? '#2a2a2a' : '#7a7a7a'; bx.fillRect(0, 0, S, S);
  const J = .012;
  // مداميك بارتفاعات متفاوتة (0.22 إلى 0.38 م) تُكمل الارتفاع 1.5 م بالضبط ليتكرر النسيج دون فواصل أفقية منتظمة
  const rows = []; for (let acc = 0; acc < TILE - .01;) { let h = .22 + r() * .16; if (TILE - acc - h < .2) h = TILE - acc; rows.push({ y0: acc, h }); acc += h; }
  for (const { y0, h: COURSE } of joints ? rows : []) {
    const shift = r() * TILE; const widths = []; let acc = 0;
    while (acc < TILE - .01) { let w = .35 + r() * .55; if (TILE - acc - w < .3) w = TILE - acc; widths.push(w); acc += w; }
    let xm = 0;
    for (const w of widths) {
      const tint = 1 + (r() - .5) * .08, warm = (r() - .5) * 8;
      for (const off of [0, -TILE, TILE]) {
        const bx0 = (xm + shift + off) * px, bw = w * px;
        if (bx0 + bw < 0 || bx0 > S) continue;
        const g = x.createLinearGradient(bx0, y0 * px, bx0, (y0 + COURSE) * px);
        g.addColorStop(0, `rgb(${clamp(base[0] * tint + warm)},${clamp(base[1] * tint + warm)},${clamp(base[2] * tint)})`);
        g.addColorStop(1, `rgb(${clamp(base[0] * tint * .97 + warm)},${clamp(base[1] * tint * .97 + warm)},${clamp(base[2] * tint * .95)})`);
        x.fillStyle = g; x.fillRect(bx0 + J * px / 2, y0 * px + J * px / 2, bw - J * px, COURSE * px - J * px);
        bx.fillStyle = '#c8c8c8'; bx.fillRect(bx0 + J * px / 2, y0 * px + J * px / 2, bw - J * px, COURSE * px - J * px);
      }
      xm += w;
    }
  }
  blotch(x, S, joints ? 60 : 120, r, joints ? 14 : 30, joints ? 60 : 150, ['rgba(160,140,110,A)', 'rgba(255,252,244,A)'], .08);
  noiseCanvas(x, S, 12, r);
  noiseCanvas(bx, S, joints ? 40 : 30, r, 128 - (joints ? 40 : 30));
  return { color: c, bump: b };
}
/** رندر (بياض ملون): نسيج ناعم بتبقّعات خفيفة. */
export function render(S = 512) {
  const c = makeCanvas(S), x = c.getContext('2d'), r = rng(11);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
  blotch(x, S, 60, r, 20, 90, ['rgba(220,208,186,A)', 'rgba(255,252,244,A)'], .12);
  noiseCanvas(x, S, 14, r);
  const b = makeCanvas(S), bx = b.getContext('2d'); bx.fillStyle = '#808080'; bx.fillRect(0, 0, S, S); noiseCanvas(bx, S, 70, rng(5));
  return { color: c, bump: b };
}
/** خشب مشابه (إجرائي): ألواح عرض 15 سم بفواصل داكنة وعروق طولية. ليس خشبًا معالجًا. */
export function timberLook(S = 512) {
  const TILE = 1.2, px = S / TILE, r = rng(91), c = makeCanvas(S), x = c.getContext('2d');
  const boards = Math.round(TILE / .15);
  for (let k = 0; k < boards; k++) {
    const x0 = k * .15 * px, tone = 0.9 + r() * .2, col = [150 * tone, 106 * tone, 66 * tone];
    x.fillStyle = `rgb(${col.map(v => v | 0).join(',')})`; x.fillRect(x0 + 1, 0, .15 * px - 2, S);
    for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(${r() > .5 ? '70,44,24' : '200,160,110'},${.10 + r() * .12})`; x.lineWidth = .6 + r() * 1.4; x.beginPath(); const gx = x0 + r() * .15 * px; x.moveTo(gx, 0); x.bezierCurveTo(gx + (r() - .5) * 8, S * .33, gx + (r() - .5) * 8, S * .66, gx + (r() - .5) * 4, S); x.stroke(); }
  }
  noiseCanvas(x, S, 10, r);
  const b = makeCanvas(S), bx = b.getContext('2d'); bx.fillStyle = '#9a9a9a'; bx.fillRect(0, 0, S, S);
  for (let k = 0; k < boards; k++) { bx.fillStyle = '#303030'; bx.fillRect(k * .15 * px - 1, 0, 3, S); }
  return { color: c, bump: b };
}
export const PAINT_KEYS = Object.freeze({ limestoneWhite: () => limestone('white'), limestoneBeige: () => limestone('beige'), limestoneWhiteFace: () => limestone('white', 1024, { joints: false }), limestoneBeigeFace: () => limestone('beige', 1024, { joints: false }), render: () => render(), timberLook: () => timberLook() });
export const TILE_M = Object.freeze({ limestoneWhite: 1.5, limestoneBeige: 1.5, limestoneWhiteFace: 1.5, limestoneBeigeFace: 1.5, render: 2, timberLook: 1.2 });

/** مكتبة الخامات للمشهد: نسيج لكل خامة مرسومة، ولون مسطح للألمنيوم والزجاج. */
export function createRealismMaterials(THREE, { maxAnisotropy = 4 } = {}) {
  const tex = {}, mats = {};
  const T = (canvas, tile, srgb = true) => { const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / tile, 1 / tile); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAnisotropy; return t; };
  for (const [k, make] of Object.entries(PAINT_KEYS)) { const p = make(); tex[k] = { map: T(p.color, TILE_M[k]), bump: T(p.bump, TILE_M[k], false) }; }
  const std = (name, o) => { const m = new THREE.MeshStandardMaterial(o); m.name = name; return m; };
  mats.limestoneWhite = std('limestoneWhite', { map: tex.limestoneWhite.map, bumpMap: tex.limestoneWhite.bump, bumpScale: 1.4, roughness: .86, color: '#ffffff' });
  mats.limestoneBeige = std('limestoneBeige', { map: tex.limestoneBeige.map, bumpMap: tex.limestoneBeige.bump, bumpScale: 1.4, roughness: .86, color: '#ffffff' });
  // (v3) سطح الكسوة بلا فواصل مرسومة: وجه البلاطة (Face) وعمق الفاصل الخلفي (Joint) بالخريطة نفسها وظل أغمق.
  for (const t of ['limestoneWhite', 'limestoneBeige']) {
    const f = tex[t + 'Face'];
    mats[t + 'Face'] = std(t + 'Face', { map: f.map, bumpMap: f.bump, bumpScale: 1, roughness: .86, color: '#ffffff' });
    mats[t + 'Joint'] = std(t + 'Joint', { map: f.map, bumpMap: f.bump, bumpScale: 1, roughness: .92, color: '#d2ccbf' });
  }
  mats.render = std('render', { map: tex.render.map, bumpMap: tex.render.bump, bumpScale: .4, roughness: .95, color: '#f1e9da' });
  mats.timberLook = std('timberLook', { map: tex.timberLook.map, bumpMap: tex.timberLook.bump, bumpScale: .5, roughness: .7, color: '#ffffff' });
  mats.aluminium = std('aluminium', { color: '#3a3d41', metalness: .65, roughness: .38 });
  // زجاج معتم بانعكاس فعلي: الشفافية 0.42 كانت تُخفّف الانعكاس مع الخلفية، فصار الزجاج مادة معتمة بمعامل انكسار 1.5 (Fresnel) وخشونة منخفضة.
  mats.glass = new THREE.MeshPhysicalMaterial({ color: '#23323a', metalness: 0, roughness: .05, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.6 });
  mats.glass.name = 'glass';
  mats.interior = std('interior', { color: '#2b2e31', roughness: 1 });
  mats.ground = std('ground', { color: '#cdbf9f', roughness: 1 });
  for (const k of Object.keys(MATERIALS)) if (!mats[k]) throw new Error('خامة بلا مادة مشهد: ' + k);
  return { get: key => mats[key], mats, dispose() { for (const t of Object.values(tex)) { t.map.dispose(); t.bump.dispose(); } for (const m of Object.values(mats)) m.dispose(); } };
}
export default { limestone, render, timberLook, createRealismMaterials };
