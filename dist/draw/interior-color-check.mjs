// Colour-harmony checker for interior palettes (pure functions, no THREE/DOM; testable in node).
// A palette is accepted only when the floor, walls and furniture it names agree in colour temperature, differ enough in lightness to read as
// separate planes, do not combine two strong chromatic colours of nearby-but-different hue, and follow the 60 / 30 / 10 split
// (dominant neutral ~60% of the visible colour area, secondary ~30%, accent ~10%).
// Colour model: OKLab (Björn Ottosson, 2020) — lightness L (0..1), a/b opponent axes; chroma C = hypot(a, b); hue h = atan2(b, a) in degrees.
// Thresholds below are DESIGN HEURISTICS chosen for this tool (see THRESHOLDS); they are not taken from a standard («غير متحقق» كمرجع منشور).
import { hexToRgb, srgbToLinear } from './interior-textures.mjs';

/** hex or [r,g,b] (0..255) -> { L, a, b, C, h } */
export function oklab(color) {
  const rgb = Array.isArray(color) ? color : hexToRgb(color), [r, g, b] = rgb.map(srgbToLinear);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  const C = Math.hypot(A, B); let h = Math.atan2(B, A) * 180 / Math.PI; if (h < 0) h += 360;
  return { L, a: A, b: B, C, h };
}
/** smallest angle between two hues (degrees) */
export const hueGap = (h1, h2) => { const d = Math.abs(h1 - h2) % 360; return d > 180 ? 360 - d : d; };

const WARM_FLOORS = new Set(['wood', 'clayTile']);
export const THRESHOLDS = Object.freeze({
  neutralC: .03,        // below this chroma a colour counts as neutral (no clear hue)
  strongC: .105,        // at/above this chroma a colour is "saturated" (e.g. brick red, terracotta, teal tile)
  tempGap: .042,        // max difference of the OKLab b axis (yellow-blue = warm-cool) between wall and floor
  tempGapWood: .085,    // timber is the warm element of a room: a neutral wall beside an oak floor may differ more
  tempOpposite: .012,   // both colours beyond ±this on b with opposite signs = warm vs cool clash
  dLwallFloor: .09,     // min lightness gap wall <-> floor
  dLfurn: .075,         // min lightness gap main upholstery <-> floor and <-> wall
  clashHue: [18, 80],   // two strong colours whose hues differ by this many degrees clash (red + orange); closer = same family, farther = deliberate contrast
  dominantC: .075,      // the 60% colour must be near-neutral
  floorC: .125,         // floors never exceed this chroma (terracotta stays under it)
  accentMinC: .035,     // an accent that is not more chromatic than the dominant is not an accent
  shares: [.6, .3, .1], // declared area shares
});

/** Representative flat colour of a floor/wall preset (the mean of what its painter draws), as [r,g,b]. */
export function presetColor(spec) {
  const a = spec?.args || {};
  const mix = (cols, w) => [0, 1, 2].map(i => Math.round(cols.reduce((s, c, k) => s + c[i] * w[k], 0)));
  switch (spec?.p) {
    case 'wood': return a.ramp ? a.ramp[1] : [168, 116, 70];
    case 'cementTile': { const p = (a.pal || []).map(hexToRgb); return p.length >= 3 ? mix(p.slice(0, 3), [.55, .3, .15]) : (p[0] || [200, 190, 170]); }
    case 'clayTile': return a.base?.[0] || [180, 100, 70];
    case 'wallPanel': case 'limewash': return [236, 232, 222];
    case 'flutedSlats': return a.ramp ? [0, 1, 2].map(i => Math.round((a.ramp[0][i] + a.ramp[1][i]) / 2)) : [100, 70, 50];
    case 'ashlar': return (a.base?.[0]) || [214, 196, 164];
    case 'wallTile': return a.base?.[0] || [236, 236, 232];
    default: return a.base || [200, 200, 200];
  }
}

/**
 * Check one palette. `p` = { wall, floor (hex), main (hex of the main upholstery), accent (hex), wood?, curtain?, rug?, shares? }.
 * @returns {{ ok: boolean, issues: string[], metrics: object }}
 */
export function checkColors(p, T = THRESHOLDS) {
  const issues = [], skipF = !!p?.skipFurniture, need = skipF ? ['wall', 'floor'] : ['wall', 'floor', 'main', 'accent'];
  for (const k of need) if (!p?.[k]) return { ok: false, issues: ['لون مفقود: ' + k], metrics: {} };
  if (skipF) { // wet rooms: only the two big planes (floor and tiled wall) are judged
    const W = oklab(p.wall), F = oklab(p.floor), gap = Math.abs(W.b - F.b);
    if (gap > (WARM_FLOORS.has(p.floorKind) ? T.tempGapWood : T.tempGap)) issues.push(`حرارة لونية متنافرة بين البلاط والأرضية (فرق ${gap.toFixed(3)})`);
    if (Math.abs(W.b) > T.tempOpposite && Math.abs(F.b) > T.tempOpposite && Math.sign(W.b) !== Math.sign(F.b)) issues.push('بلاط دافئ مع أرضية باردة (أو العكس)');
    // lightness is NOT judged here: tile and floor of one family (e.g. cream on cream) is a deliberate wet-room look
    if (W.C >= T.strongC && F.C >= T.strongC && hueGap(W.h, F.h) >= T.clashHue[0] && hueGap(W.h, F.h) <= T.clashHue[1]) issues.push('بلاط وأرضية مشبعان متقاربا الصبغة');
    return { ok: issues.length === 0, issues, metrics: { gap } };
  }
  const W = oklab(p.wall), F = oklab(p.floor), S = oklab(p.main), A = oklab(p.accent), X = p.curtain ? oklab(p.curtain) : null, R = p.rug ? oklab(p.rug) : null;
  const m = { wall: W, floor: F, main: S, accent: A, dLwallFloor: Math.abs(W.L - F.L), dLmainFloor: Math.abs(S.L - F.L), dLmainWall: Math.abs(S.L - W.L), tempGap: Math.abs(W.b - F.b) };
  // 1. colour temperature agreement between the two biggest planes
  if (m.tempGap > (WARM_FLOORS.has(p.floorKind) ? T.tempGapWood : T.tempGap)) issues.push(`حرارة لونية متنافرة بين الجدار والأرضية (فرق ${m.tempGap.toFixed(3)})`);
  if (Math.abs(W.b) > T.tempOpposite && Math.abs(F.b) > T.tempOpposite && Math.sign(W.b) !== Math.sign(F.b)) issues.push('جدار دافئ مع أرضية باردة (أو العكس)');
  // 2. separation of planes by lightness
  if (m.dLwallFloor < T.dLwallFloor) issues.push(`تباين اللمعان بين الجدار والأرضية ضعيف (${m.dLwallFloor.toFixed(2)})`);
  if (m.dLmainFloor < T.dLfurn) issues.push(`الأثاث الرئيسي يذوب في الأرضية (${m.dLmainFloor.toFixed(2)})`);
  if (m.dLmainWall < T.dLfurn) issues.push(`الأثاث الرئيسي يذوب في الجدار (${m.dLmainWall.toFixed(2)})`);
  // 3. no two strong colours of near-but-different hue (red + orange); a strong floor may not meet a strong main upholstery at all
  const strong = [['الأرضية', F], ['الجدار', W], ['الأثاث الرئيسي', S], ['اللمسة', A], ...(X ? [['الستارة', X]] : []), ...(R ? [['السجادة', R]] : [])].filter(([, c]) => c.C >= T.strongC);
  for (let i = 0; i < strong.length; i++) for (let j = i + 1; j < strong.length; j++) {
    const g = hueGap(strong[i][1].h, strong[j][1].h);
    if (g >= T.clashHue[0] && g <= T.clashHue[1]) issues.push(`لونان مشبعان متقاربان ومختلفان (${strong[i][0]} + ${strong[j][0]}، فرق الصبغة ${Math.round(g)}°)`);
  }
  if (F.C >= T.strongC && S.C >= T.strongC && hueGap(F.h, S.h) < 40) issues.push('الأرضية والأثاث الرئيسي كلاهما مشبع من العائلة نفسها (يتلاشى الأثاث)');
  // 4. 60-30-10 roles
  if (W.C > T.dominantC) issues.push(`اللون المهيمن (60%) ليس محايدًا (تشبّع ${W.C.toFixed(3)})`);
  if (F.C > T.floorC) issues.push(`تشبّع الأرضية مرتفع (${F.C.toFixed(3)})`);
  if (A.C < T.accentMinC || A.C <= W.C + .01) issues.push('لون اللمسة (10%) ليس أكثر تشبّعًا من المهيمن');
  const sh = p.shares || T.shares; if (Math.abs(sh[0] + sh[1] + sh[2] - 1) > 1e-6 || !(sh[0] > sh[1] && sh[1] > sh[2])) issues.push('نسب 60/30/10 غير مرتبة');
  return { ok: issues.length === 0, issues, metrics: m };
}

/** Flat summary used by tests and by the report: 'ok' or the first issue. */
export const verdict = p => { const r = checkColors(p); return r.ok ? 'ok' : r.issues[0]; };
