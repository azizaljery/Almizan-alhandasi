// Lazy material factory for the interior finish system. `attachInterior(THREE, lib)` adds `lib.iv` and teaches `lib.get` / `lib.reverse` /
// `lib.dispose` about keys of the form 'iv:<kind>:<arg>' so the MeshBuilder pipeline of scene3d can bucket by them like any other material.
// Textures are painted only when a room actually uses them (and cached across rebuilds by interior-textures), and are size-capped by `quality`.
import { normalFromHeight } from './materials3d.mjs';
import { PAINTERS, hexToRgb } from './interior-textures.mjs';
import { FLOOR_PRESETS, WALL_PRESETS } from './interior-themes.mjs';
import { makeCanvas } from './materials3d.mjs';

const METALS = { brass: { color: '#c9a24a', metalness: .9, roughness: .3 }, chrome: { color: '#dfe2e4', metalness: 1, roughness: .15 }, black: { color: '#1f2123', metalness: .6, roughness: .4 }, steel: { color: '#b8bcbf', metalness: .9, roughness: .35 } };

export function attachInterior(THREE, lib, { quality = 1, maxAnisotropy = 4 } = {}) {
  if (lib.iv) return lib;
  const hasCanvas = !!makeCanvas(2), lazy = new Map(), rev = new Map(), texs = [], builders = new Map();
  const baseGet = lib.get, baseReverse = lib.reverse, baseDispose = lib.dispose;
  const q = n => Math.max(128, Math.round(n * quality / 32) * 32);
  const T = (canvas, sizeM, srgb = true) => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / sizeM, 1 / sizeM);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAnisotropy; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; texs.push(t); return t;
  };
  const painted = (spec, ns) => {
    if (!hasCanvas) return {};
    const fn = PAINTERS[spec.p]; if (!fn) return {};
    const p = fn({ ...(spec.args || {}), S: q(spec.S || 512) });
    return { map: T(p.color, spec.size), normal: p.height && ns > 0 ? T(normalFromHeight(p.height, ns), spec.size, false) : null };
  };
  const std = (name, params) => { const m = new THREE.MeshStandardMaterial(params); m.name = name; return m; };
  const wrap = (m, key) => { lazy.set(key, m); rev.set(m, key); m.userData.ivKey = key; return m; };
  const hex = h => '#' + h;

  const make = key => {
    const parts = key.split(':'), [, kind, a, b] = parts;
    switch (kind) {
      case 'floor': {
        const s = FLOOR_PRESETS[a]; if (!s) return null; const t = painted(s, s.ns ?? 0);
        return std(key, { color: s.p === 'wood' ? '#e6e6e6' : '#d4d4d4', map: t.map || null, ...(t.normal ? { normalMap: t.normal, normalScale: new THREE.Vector2(.7, .7) } : {}), roughness: s.rough ?? .4, metalness: 0, envMapIntensity: (s.env ?? 1) * .8 });
      }
      case 'wall': {
        const s = WALL_PRESETS[a]; if (!s) return null; const t = painted(s, s.ns ?? 0);
        return std(key, { color: '#ffffff', map: t.map || null, ...(t.normal ? { normalMap: t.normal, normalScale: new THREE.Vector2(.9, .9) } : {}), roughness: s.rough ?? .6, vertexColors: true, envMapIntensity: .9 });
      }
      case 'paint': return std(key, { color: '#ffffff', roughness: .9, vertexColors: true });
      case 'ceil': return std(key, { color: hex(a), roughness: 1 });
      case 'ceilTint': return null;
      case 'trim': return std(key, { color: hex(a), roughness: .5 });
      case 'marbleTrim': { const s = FLOOR_PRESETS[a]; const t = s ? painted(s, 0) : {}; return std(key, { color: '#ffffff', map: t.map || null, roughness: .18 }); }
      case 'led': return std(key, { color: '#ffffff', emissive: hex(a), emissiveIntensity: 1.5, roughness: .6 });
      case 'glow': return std(key, { color: '#fff4d8', emissive: hex(a || 'ffd9a0'), emissiveIntensity: 1.8, roughness: .5 });
      case 'door': { const base = lib.m.doorLeaf.clone(); base.color.set(hex(a)); base.name = key; return base; }
      case 'doorp': return std(key, { color: hex(a), roughness: .42 });
      case 'metal': return std(key, METALS[a] || METALS.brass);
      case 'fx': case 'fxw': { // fixture material variant by colour; 'fxw' also gets a fine timber grain
        const src = lib.fixtures[a]; if (!src) return null; const m = src.clone(); m.color.set(hex(b)); m.name = key;
        if (kind === 'fxw' && hasCanvas) { const t = PAINTERS.woodGrain({ S: q(256) }); m.map = T(t.color, .8); m.needsUpdate = true; }
        return m;
      }
      case 'fxf': { // upholstery / fabric variant of a fixture material: colour + a fine woven normal map and a soft sheen
        const src = lib.fixtures[a]; if (!src) return null; const m = src.clone(); m.color.set(hex(b)); m.name = key; m.roughness = .92;
        // lite tier (phones): flat-shaded low-poly furniture rendered pure black with the weave normal map (measured), so lite keeps colour only
        if (hasCanvas && quality > .5) { const wv = PAINTERS.fabricWeave({ S: q(128), coarse: a.startsWith('cushion') || a === 'throwFab' ? 1.5 : 1 }); const nt = T(normalFromHeight(wv, 2.2), .22, false); if (nt) { m.normalMap = nt; m.normalScale = new THREE.Vector2(.5, .5); } m.needsUpdate = true; }
        return m;
      }
      case 'rug': { // rug top: [style, field, border, motif, ink] -> own pattern, UV 0..1 over the whole rug
        const r = hasCanvas ? PAINTERS.rugPattern({ style: a, field: hex(b), border: hex(parts[4]), motif: hex(parts[5]), ink: hex(parts[6]), S: q(512) }) : {};
        const tx = hasCanvas && r.color ? new THREE.CanvasTexture(r.color) : null; if (tx) { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = maxAnisotropy; texs.push(tx); }
        return std(key, { color: '#ffffff', map: tx, roughness: 1 });
      }
      case 'fab': { const m = std(key, { color: hex(a), roughness: 1, side: THREE.DoubleSide }); return m; }
      case 'sheer': return std(key, { color: hex(a), roughness: 1, transparent: true, opacity: .42, side: THREE.DoubleSide, depthWrite: false });
      default: return null;
    }
  };
  const get = key => {
    if (lazy.has(key)) return lazy.get(key);
    let m = null; const f = builders.get(key); if (f) m = f(); else m = make(key);
    return m ? wrap(m, key) : null;
  };
  /** Register an on-demand material (e.g. a painting) under its own key; returns the key. */
  const register = (key, factory) => { if (!builders.has(key)) builders.set(key, factory); return key; };
  /** Wall-art picture material for a palette; kept to 4 variants per theme by the caller. */
  const art = (kind, pal, seed = 1) => register(`iv:art:${kind}:${seed}:${pal.join('').replace(/#/g, '')}`, () => {
    const t = hasCanvas ? PAINTERS.artPicture({ kind, pal, S: q(256), seed }) : {}; const tx = t.color ? new THREE.CanvasTexture(t.color) : null; if (tx) { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = maxAnisotropy; texs.push(tx); }
    return std('art', { color: '#ffffff', map: tx, roughness: .6 });
  });

  lib.iv = { get, register, art, has: key => lazy.has(key) || builders.has(key) };
  lib.get = key => (key.startsWith('iv:') ? get(key) : baseGet(key));
  lib.reverse = m => rev.get(m) ?? baseReverse(m);
  lib.allMaterials = () => [...Object.values(lib.m), ...Object.values(lib.fixtures), ...lazy.values()];
  lib.setCeilingGlow = (on, intensity, color = '#fff6e8') => { for (const [k, m] of lazy) if (k.startsWith('iv:ceil:')) { m.emissive.set(on ? color : '#000000'); m.emissiveIntensity = on ? intensity : 0; } };
  lib.dispose = () => { for (const t of texs) t.dispose(); for (const m of lazy.values()) m.dispose(); lazy.clear(); rev.clear(); baseDispose(); };
  return lib;
}

export const hexOk = h => /^#[0-9a-f]{6}$/i.test(h);
export { hexToRgb };
