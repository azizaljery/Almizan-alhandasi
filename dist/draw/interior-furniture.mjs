// Rich procedural furniture for the interior finish system (browser-side, no network). One builder per fixture kind, each with a design per STYLE:
//   najdi (floor seating, carved timber, brass studs) · classic (turned legs, tufting, rolled arms) · contemporary (clean lines, tapered legs)
//   luxury (channel tufting, gold plinths, bolsters) · dark (deep modular seating, black metal).
// Models are ILLUSTRATIVE (what the finished room could look like): sizes follow the document fixture (w, d, h); every detail dimension is a design
// estimate («غير متحقق» كمرجع) and none of it enters quantities. Triangle cost per piece is recorded by tests (budget in tests/interior-furniture.test.mjs).
import { makeKit, turnedLeg } from './interior-kit.mjs';
import { FIXTURES } from './catalog.mjs';

export const FURNITURE_STYLES = Object.freeze(['najdi', 'classic', 'contemporary', 'luxury', 'dark']);
/** Fixture kinds this module redraws. Everything else keeps its fixtures3d model. */
export const RICH_KINDS = Object.freeze(['sofa-3', 'sofa-2', 'armchair', 'majlis-sofa', 'coffee-table', 'bed-double', 'bed-single', 'nightstand', 'dining-table', 'chair', 'rug', 'plant', 'tv-unit', 'wardrobe', 'kitchen-run', 'basin']);
export const isRichKind = k => RICH_KINDS.includes(k);

const pick = (arr, v) => arr[Math.abs(v | 0) % arr.length];

/**
 * Build one piece. `mats` = name -> material (from the room palette); `opts.style` one of FURNITURE_STYLES, `opts.variant` an integer that picks a model variant
 * inside the style (so two sofas of one house are not clones), `opts.seed` for leaves etc. Returns a THREE.Group or null for kinds it does not draw.
 */
export function buildRichFixture(THREE, kind, dims = {}, mats, opts = {}) {
  if (!isRichKind(kind)) return null;
  const def = FIXTURES[kind] || {}, w = dims.w ?? def.w ?? 1, d = dims.d ?? def.d ?? 1, h = dims.h ?? def.h ?? 1;
  const style = FURNITURE_STYLES.includes(opts.style) ? opts.style : 'contemporary', variant = opts.variant | 0, seed = opts.seed ?? 1;
  const K = makeKit(THREE, mats, 'fixture:' + kind, { low: !!opts.low, coarse: !!opts.coarse }); K.g.userData = { kind, dims: { w, d, h }, style, rich: true };
  const { box, rbox, cush, cyl, sph, tor, rod, lathe, tube, leaf, sub } = K;
  const has = n => !!mats[n];
  const MG = has('glow') ? 'glow' : 'lampShade';

  // ------------------------------------------------------------------------------------------------ shared small pieces
  const button = (mat, x, y, z, r = .012) => sph(mat, r, r, r * .7, x, y, z, 6, 4);
  /** brass stud row along a line (najdi carved wood, classic upholstery edge) */
  const studs = (mat, x0, y0, z0, x1, y1, z1, n, r = .007) => { for (let i = 0; i < n; i++) { const t = n === 1 ? .5 : i / (n - 1); sph(mat, r, r, r, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 5, 4); } };
  const legCtx = (x, z, hh, st) => {
    if (st === 'classic') { lathe('woodDark', turnedLeg(hh, .034), x, 0, z, 10); lathe('gold', [[.017, 0], [.02, .012], [.017, .02]], x, 0, z, 8); }
    else if (st === 'luxury') { box('gold', .035, hh, .035, x, 0, z); }
    else if (st === 'dark') { box('blackMetal', .025, hh, .025, x, 0, z); }
    else if (st === 'najdi') { rbox('woodDark', .06, hh, .06, .012, x, 0, z); }
    else { cyl('woodMid', .018, .03, hh, x, 0, z, 8); }
  };

  // ------------------------------------------------------------------------------------------------ pillows & throws
  const pillows = (list) => { for (const p of list) cush(p.mat, p.w, p.h || .12, p.d, p.x, p.y, p.z, p.ry || 0, p.rx || 0, p.rz || 0, { pinch: .42 }); };

  // ------------------------------------------------------------------------------------------------ SOFAS
  function sofa(n) {
    const seatH = .43, legH = style === 'luxury' ? .09 : style === 'najdi' ? .1 : style === 'dark' ? .14 : .15, armW = style === 'dark' ? .18 : style === 'classic' ? .17 : .14;
    const bodyW = w, innerW = bodyW - armW * 2, cw = innerW / n, deck = .12, backTop = Math.max(h, .8);
    // frame / base
    if (style === 'classic') { rbox('woodDark', bodyW, .1, d - .02, .012, 0, legH, 0); box('gold', bodyW + .004, .012, d - .016, 0, legH + .09, 0); }
    else if (style === 'luxury') { rbox('gold', bodyW - .06, legH + .02, d - .08, .01, 0, 0, 0); rbox('upholstery', bodyW, deck + .04, d, .04, 0, legH, 0); }
    else if (style === 'najdi') { rbox('woodDark', bodyW, .12, d, .015, 0, legH, 0); box('gold', bodyW + .004, .01, d + .004, 0, legH + .05, 0); }
    else rbox('upholstery', bodyW, deck, d, .035, 0, legH, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) legCtx(sx * (bodyW / 2 - .1), sz * (d / 2 - .09), legH + .01, style);
    // arms
    for (const s of [-1, 1]) {
      const ax = s * (bodyW / 2 - armW / 2);
      if (style === 'classic') { rbox('upholstery', armW, .38, d - .1, .05, ax, legH + .06, .0); cyl('upholstery', .095, .095, d - .08, ax, 0, 0, 14, Math.PI / 2).position.set(ax, legH + .5, 0); const sc = cyl('upholstery', .1, .1, .03, ax, 0, d / 2 - .04, 14, Math.PI / 2); sc.position.set(ax, legH + .5, d / 2 - .045); sph('gold', .016, .016, .016, ax, legH + .5, d / 2 - .018); }
      else if (style === 'luxury') { rbox('upholstery', armW + .04, .44, d - .06, .09, ax, legH + .06, 0); }
      else if (style === 'najdi') { rbox('woodDark', armW - .04, .34, d, .02, ax, legH + .12, 0); box('gold', armW - .03, .008, d - .02, ax, legH + .46, 0); studs('gold', ax + s * (armW / 2 - .018), legH + .3, -d / 2 + .08, ax + s * (armW / 2 - .018), legH + .3, d / 2 - .08, 8); }
      else if (style === 'dark') { rbox('upholstery', armW, .46, d, .045, ax, legH + .06, 0); }
      else { rbox('upholstery', armW, .4, d - .03, .06, ax, legH + .08, 0); }
    }
    // back
    const by = legH + deck - .02;
    if (style === 'luxury') { const nr = Math.max(8, Math.round(innerW / .13)), rw = innerW / nr; for (let i = 0; i < nr; i++) rbox('upholsteryAlt', rw - .004, backTop - by - .02, .2, .026, -innerW / 2 + rw * (i + .5), by, -d / 2 + .13); }
    else if (style === 'classic') {
      rbox('upholstery', innerW + .02, backTop - by - .02, .22, .08, 0, by, -d / 2 + .14); rbox('woodDark', innerW + .06, .035, .26, .012, 0, backTop - .06, -d / 2 + .14);
      const cols = Math.max(4, Math.round(innerW / .22)), rows = 3; for (let c = 0; c <= cols; c++) for (let r = 0; r < rows; r++) button('gold', -innerW / 2 + innerW * c / cols, by + .12 + r * ((backTop - by - .3) / (rows - 1 || 1)), -d / 2 + .255 - (r % 2) * 0, .011);
    }
    else if (style === 'najdi') { for (let i = 0; i < n; i++) { const x = -innerW / 2 + cw * (i + .5); cush(i % 2 ? 'upholsteryAlt' : 'upholstery', cw - .02, backTop - by - .1, .2, x, by + .04, -d / 2 + .16, 0, -.12); } rbox('woodDark', innerW + .02, .05, .08, .01, 0, backTop - .1, -d / 2 + .06); }
    else for (let i = 0; i < n; i++) { const x = -innerW / 2 + cw * (i + .5); cush('upholsteryAlt', cw - .02, backTop - by - .22, style === 'dark' ? .2 : .22, x, by + .1, -d / 2 + .2, 0, -.16, 0, { r: .07 }); }
    // seat cushions
    for (let i = 0; i < n; i++) { const x = -innerW / 2 + cw * (i + .5); cush(style === 'najdi' ? 'upholsteryAlt' : 'upholstery', cw - .015, style === 'dark' ? .2 : .17, d - .3, x, legH + deck - .02, .1, 0, 0, 0, { r: .06, pinch: .22, crown: .05 }); }
    // pillows + throw
    const topY = legH + deck + .13;
    const pa = n >= 2 ? 'cushionA' : 'cushionB';
    pillows([{ mat: pa, w: .4, h: .11, d: .4, x: -innerW / 2 + .26, y: topY, z: -d / 2 + .4, rx: -.55, rz: .12 }, { mat: 'cushionB', w: .36, h: .1, d: .36, x: innerW / 2 - .24, y: topY, z: -d / 2 + .38, rx: -.55, rz: -.15 }]);
    if (n >= 3) pillows([{ mat: 'cushionC', w: .45, h: .1, d: .3, x: .05, y: topY, z: -d / 2 + .38, rx: -.55 }]);
    if (variant % 2 === 0 && style !== 'najdi') rbox('throwFab', .42, .02, d - .36, .01, innerW / 2 - cw * .3, legH + deck + .15, .08, 0, 0, -.05);
  }

  function armchair() {
    const legH = .13, seatY = legH + .1;
    if (style === 'najdi' || style === 'classic') {
      rbox(style === 'najdi' ? 'woodDark' : 'upholstery', w, .16, d, .03, 0, legH, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) legCtx(sx * (w / 2 - .07), sz * (d / 2 - .07), legH + .01, style);
      rbox('upholstery', w, .56, .2, .07, 0, legH + .1, -d / 2 + .12); for (const s of [-1, 1]) rbox('upholstery', .14, .34, d - .08, .05, s * (w / 2 - .07), legH + .1, 0);
      cush('upholsteryAlt', w - .28, .15, d - .26, 0, seatY, .08, 0, 0, 0, { r: .05, pinch: .2 });
      if (style === 'classic') for (const s of [-1, 1]) { const c = cyl('upholstery', .07, .07, d - .1, 0, 0, 0, 12, Math.PI / 2); c.position.set(s * (w / 2 - .07), legH + .5, 0); }
      studs('gold', -w / 2 + .1, legH + .62, -d / 2 + .24, w / 2 - .1, legH + .62, -d / 2 + .24, 7);
    } else {
      if (style === 'luxury') { cyl('gold', w * .32, w * .36, .05, 0, 0, 0, 24); cyl('gold', .05, .05, legH, 0, .05, 0, 10); }
      else for (const sx of [-1, 1]) for (const sz of [-1, 1]) legCtx(sx * (w / 2 - .09), sz * (d / 2 - .09), legH + .02, style);
      rbox('upholstery', w, .2, d, style === 'luxury' ? .09 : .06, 0, legH, 0);
      rbox('upholsteryAlt', w, .62, .24, .09, 0, legH + .1, -d / 2 + .12, 0, -.1);
      for (const s of [-1, 1]) rbox('upholstery', .13, .3, d - .1, .055, s * (w / 2 - .065), legH + .12, .03);
      cush('upholsteryAlt', w - .3, .16, d - .3, 0, seatY + .02, .06, 0, 0, 0, { r: .06, pinch: .22 });
      pillows([{ mat: 'cushionA', w: .36, h: .1, d: .36, x: .06, y: seatY + .16, z: -d / 2 + .34, rx: -.55 }]);
    }
  }

  // ------------------------------------------------------------------------------------------------ MAJLIS (Arab seating)
  function majlis() {
    const seatY = style === 'najdi' ? .06 : .16;
    if (style === 'najdi') {
      // floor seating: low carved platform, long mattress, back bolsters against the wall, rolled arm bolsters, corner cushions
      rbox('woodDark', w, .06, d, .01, 0, 0, 0); box('gold', w + .004, .012, d + .004, 0, .05, 0);
      const mw = w - .04; cush('upholstery', mw, .12, d - .06, 0, .06, .02, 0, 0, 0, { r: .05, pinch: .16, crown: .06 });
      const nb = Math.max(2, Math.round(w / .85)), bw = (w - .1) / nb; for (let i = 0; i < nb; i++) cush(i % 2 ? 'upholsteryAlt' : 'upholstery', bw - .03, .52, .2, -w / 2 + .05 + bw * (i + .5), .14, -d / 2 + .15, 0, -.18, 0, { r: .1, pinch: .2 });
      for (const s of [-1, 1]) { cyl('cushionA', .085, .085, d - .2, s * (w / 2 - .09), 0, .04, 14, Math.PI / 2).position.set(s * (w / 2 - .09), .24, .04); sph('gold', .02, .02, .02, s * (w / 2 - .09), .24, d / 2 - .04); }
      const nc = Math.max(2, Math.round(w / .9)); for (let i = 0; i < nc; i++) cush(i % 2 ? 'cushionB' : 'cushionC', .38, .1, .38, -w / 2 + .5 + (w - 1) * (i / Math.max(1, nc - 1)), .17, -d / 2 + .4, i % 2 ? .3 : -.3, -.5, 0, { pinch: .4 });
    } else if (style === 'classic' || style === 'luxury') {
      const lux = style === 'luxury';
      rbox(lux ? 'gold' : 'woodDark', w - .04, .1, d - .04, .01, 0, 0, 0); rbox(lux ? 'upholstery' : 'woodDark', w, .1, d, .03, 0, .1, 0); if (!lux) box('gold', w + .004, .014, d + .004, 0, .17, 0);
      cush('upholsteryAlt', w - .08, .15, d - .22, 0, .2, .07, 0, 0, 0, { r: .06, pinch: .2, crown: .05 });
      rbox('upholstery', w, .56, .2, .08, 0, .2, -d / 2 + .12);
      if (lux) { const nr = Math.round(w / .16), rw = (w - .04) / nr; for (let i = 0; i < nr; i++) rbox('upholstery', rw - .006, .54, .1, .026, -w / 2 + .02 + rw * (i + .5), .2, -d / 2 + .2); }
      else { rbox('woodDark', w + .02, .04, .22, .01, 0, .76, -d / 2 + .12); const cols = Math.round(w / .28); for (let c = 0; c <= cols; c++) for (let r = 0; r < 2; r++) button('gold', -w / 2 + .08 + (w - .16) * c / cols, .38 + r * .24, -d / 2 + .225, .011); }
      for (const s of [-1, 1]) { cyl('upholstery', .1, .1, d - .24, s * (w / 2 - .12), 0, .06, 16, Math.PI / 2).position.set(s * (w / 2 - .12), .34, .06); cyl('gold', .104, .104, .02, s * (w / 2 - .12), 0, d / 2 - .1, 16, Math.PI / 2).position.set(s * (w / 2 - .12), .34, d / 2 - .1); }
      const nc = Math.max(2, Math.round(w / .9)); for (let i = 0; i < nc; i++) cush(i % 2 ? 'cushionA' : 'cushionB', .4, .11, .4, -w / 2 + .55 + (w - 1.1) * (i / Math.max(1, nc - 1)), .35, -d / 2 + .42, i % 2 ? .2 : -.2, -.55, 0, { pinch: .42 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(lux ? 'gold' : 'woodDark', .05, .02, .05, sx * (w / 2 - .06), 0, sz * (d / 2 - .06));
    } else { // contemporary / dark: low modular majlis sofa
      const dk = style === 'dark', bh = .14;
      rbox(dk ? 'blackMetal' : 'woodDark', w - .06, .05, d - .06, .01, 0, 0, 0);
      rbox('upholstery', w, bh, d, .05, 0, .05, 0);
      const nS = Math.max(2, Math.round(w / .9)), sw = (w - .24) / nS; for (let i = 0; i < nS; i++) { const x = -w / 2 + .12 + sw * (i + .5); cush('upholsteryAlt', sw - .015, .15, d - .26, x, .05 + bh - .02, .07, 0, 0, 0, { r: .06, pinch: .2, crown: .05 }); cush('upholsteryAlt', sw - .02, .44, .2, x, .05 + bh + .02, -d / 2 + .18, 0, -.16, 0, { r: .08 }); }
      for (const s of [-1, 1]) rbox('upholstery', .14, .36, d, .05, s * (w / 2 - .07), .05, 0);
      const nc = Math.max(2, Math.round(w / 1)); for (let i = 0; i < nc; i++) cush(i % 2 ? 'cushionA' : 'cushionB', .4, .1, .4, -w / 2 + .5 + (w - 1) * (i / Math.max(1, nc - 1)), .3, -d / 2 + .4, i % 2 ? .25 : -.25, -.5, 0, { pinch: .4 });
    }
  }

  // ------------------------------------------------------------------------------------------------ TABLES
  function coffeeTable() {
    const topT = .04, legH = h - topT;
    const arabic = style === 'najdi' || style === 'classic' || style === 'luxury';
    if (style === 'najdi') {
      rbox('woodMid', w, topT + .02, d, .012, 0, h - topT - .02, 0); box('gold', w - .06, .006, .012, 0, h - .004, d / 2 - .05); box('gold', w - .06, .006, .012, 0, h - .004, -d / 2 + .05); // inlay lines
      rbox('woodDark', w - .1, .06, d - .1, .01, 0, h - .12, 0);
      for (const sx of [-1, 1]) rbox('woodDark', .07, legH - .08, d - .14, .014, sx * (w / 2 - .08), 0, 0);
      box('gold', w - .26, .006, .02, 0, h - .03, d / 2 - .09);
    } else if (style === 'classic') {
      rbox('marbleTop', w, topT, d, .01, 0, h - topT, 0); rbox('woodDark', w - .04, .07, d - .04, .012, 0, h - topT - .07, 0); rbox('woodDark', w - .26, .025, d - .26, .008, 0, .1, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe('woodDark', turnedLeg(legH - .07, .034), sx * (w / 2 - .1), 0, sz * (d / 2 - .1), 10);
    } else if (style === 'luxury') {
      rbox('marbleTop', w, topT, d, .008, 0, h - topT, 0); box('gold', w - .02, .016, d - .02, 0, h - topT - .016, 0);
      for (const sx of [-1, 1]) { rbox('gold', .035, legH - .02, d - .12, .012, sx * (w / 2 - .09), 0, 0); } box('gold', w - .2, .02, .03, 0, .12, 0);
    } else if (style === 'dark') {
      rbox('granite', w, .05, d, .012, 0, h - .05, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('blackMetal', .03, h - .05, .03, sx * (w / 2 - .08), 0, sz * (d / 2 - .08));
      box('blackMetal', w - .1, .02, .03, 0, h - .08, d / 2 - .08); box('blackMetal', w - .1, .02, .03, 0, h - .08, -d / 2 + .08);
    } else { // contemporary: round-edged low oval/rect with thin tapered legs and a lower shelf
      rbox('woodLight', w, topT, d, .018, 0, h - topT, 0); rbox('woodMid', w - .24, .025, d - .22, .008, 0, .1, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = cyl('woodMid', .013, .022, legH, sx * (w / 2 - .1), 0, sz * (d / 2 - .1), 8); }
    }
    // table-top styling
    const ty = h + (style === 'dark' ? .0 : 0);
    if (arabic) {
      cyl('gold', .15, .14, .015, -w * .22, ty, 0, 22); // tray
      // dallah (Arabic coffee pot): lathe body, spout, handle, lid knob; finjan cups on the tray
      const dx = -w * .22, dy = ty + .015;
      lathe('gold', [[0, 0], [.06, 0], [.075, .03], [.05, .1], [.03, .18], [.022, .2], [.034, .215], [.012, .23], [0, .23]], dx, dy, 0, 12);
      tube('gold', [[dx + .03, dy + .12, 0], [dx + .1, dy + .15, 0], [dx + .14, dy + .2, 0]], .008, 8, 5);
      tube('gold', [[dx - .035, dy + .19, 0], [dx - .07, dy + .17, .0], [dx - .1, dy + .1, 0], [dx - .08, dy + .04, 0]], .007, 8, 5);
      for (let i = 0; i < 3; i++) { const cx = dx + .0 + (i - 1) * .06; cyl('ceramic', .016, .011, .035, cx, dy, .09, 8); }
      lathe('gold', [[0, 0], [.04, 0], [.05, .03], [.035, .05], [.03, .08], [0, .1]], w * .22, ty, d * .12, 10); // incense burner (مبخرة)
    } else {
      cyl('gold', .11, .1, .02, -w * .2, ty, 0, 18); cyl('ceramic', .03, .045, .16, -w * .2, ty + .02, 0, 12); sph('leafB', .09, .1, .09, -w * .2, ty + .27, 0, 8, 6);
      box('linen', .22, .03, .3, w * .2, ty, .02, .2); box('woodDark', .2, .025, .27, w * .2, ty + .03, .02, .2);
    }
  }

  function diningTable() {
    const th = .045, style0 = style;
    if (style0 === 'najdi') { rbox('woodMid', w, th + .02, d, .015, 0, h - th - .02, 0); box('woodDark', w - .1, .08, d - .1, 0, h - th - .1, 0); for (const sx of [-1, 1]) rbox('woodDark', .1, h - th - .02, d - .3, .02, sx * (w / 2 - .4), 0, 0); rbox('woodDark', w - .8, .05, .08, .01, 0, .25, 0); }
    else if (style0 === 'classic') { rbox('woodMid', w, th, d, .015, 0, h - th, 0); rbox('woodDark', w - .1, .09, d - .1, .012, 0, h - th - .09, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe('woodDark', turnedLeg(h - th - .09, .05), sx * (w / 2 - .15), 0, sz * (d / 2 - .15), 12); }
    else if (style0 === 'luxury') { rbox('marbleTop', w, th, d, .01, 0, h - th, 0); for (const sx of [-1, 1]) { rbox('gold', .08, h - th, d * .55, .015, sx * (w / 2 - .5), 0, 0); } box('gold', w - .9, .04, .06, 0, .3, 0); }
    else if (style0 === 'dark') { rbox('granite', w, .05, d, .01, 0, h - .05, 0); for (const sx of [-1, 1]) { box('blackMetal', .05, h - .05, d * .7, sx * (w / 2 - .4), 0, 0); } box('blackMetal', w - .8, .04, .04, 0, .25, 0); }
    else { rbox('woodLight', w, th, d, .02, 0, h - th, 0); rbox('woodMid', w - .6, .06, d - .5, .01, 0, h - th - .06, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl('woodMid', .02, .035, h - th, sx * (w / 2 - .12), 0, sz * (d / 2 - .1), 8); }
    // centre piece
    if (style0 === 'najdi' || style0 === 'classic') { lathe('gold', [[0, 0], [.07, 0], [.09, .02], [.07, .07], [.03, .12], [.0, .13]], 0, h, 0, 14); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4; cyl('gold', .006, .006, .13, Math.cos(a) * .14, h + .07, Math.sin(a) * .14, 5); sph('leafB', .03, .035, .03, Math.cos(a) * .14, h + .24, Math.sin(a) * .14, 6, 4); } }
    else { cyl('ceramic', .12, .1, .02, 0, h, 0, 18); cyl('ceramic', .035, .05, .2, 0, h + .02, 0, 12); sph('leafB', .12, .1, .12, 0, h + .3, 0, 8, 6); }
    // place settings + chairs
    for (const sx of [-1, 1]) for (const z of [-d * .32, d * .32]) cyl('ceramic', .105, .09, .014, sx * w * .25, h, z, 16);
    const cw = .46, cdp = .48, ch = .92, off = .1;
    const seats = [[-w * .25, d / 2 + cdp / 2 - off, Math.PI], [w * .25, d / 2 + cdp / 2 - off, Math.PI], [-w * .25, -d / 2 - cdp / 2 + off, 0], [w * .25, -d / 2 - cdp / 2 + off, 0], [w / 2 + cdp / 2 - off, 0, -Math.PI / 2], [-w / 2 - cdp / 2 + off, 0, Math.PI / 2]];
    for (const [x, z, ry] of seats) chairAt(sub(x, 0, z, ry), cw, cdp, ch);
  }

  // ------------------------------------------------------------------------------------------------ CHAIR (dining)
  function chairAt(S, cw, cd, ch) {
    const seatH = ch * .49, st = style;
    const bx = (mat, sx, sy, sz, x, y0, z, rx = 0) => { const m = box(mat, sx, sy, sz, x, y0, z, 0, rx); S.add(m); return m; };
    const take = fn => { const n0 = K.g.children.length; fn(); const ms = K.g.children.splice(n0); for (const m of ms) S.add(m); };
    take(() => {
      const legM = st === 'luxury' ? 'gold' : st === 'dark' ? 'blackMetal' : st === 'najdi' ? 'woodDark' : 'woodMid';
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (st === 'classic') lathe('woodDark', turnedLeg(seatH - .05, .03), sx * (cw / 2 - .035), 0, sz * (cd / 2 - .035), 8);
        else cyl(legM, .016, .012 + (st === 'dark' ? 0 : .004), seatH - .05, sx * (cw / 2 - .04), 0, sz * (cd / 2 - .04) + (sz > 0 ? .02 : -.03), 7);
      }
      rbox(st === 'najdi' || st === 'classic' ? 'woodDark' : 'upholsteryAlt', cw, .05, cd, .015, 0, seatH - .06, 0);
      cush('upholsteryAlt', cw - .04, .06, cd - .05, 0, seatH - .02, .0, 0, 0, 0, { r: .03, pinch: .15 });
      // backrest
      for (const sx of [-1, 1]) rbox(legM, .03, ch - seatH + .02, .03, .008, sx * (cw / 2 - .035), seatH - .02, -cd / 2 + .03, 0, -.06);
      if (st === 'najdi') { for (let i = 0; i < 4; i++) rbox('woodDark', .03, ch - seatH - .08, .02, .006, -cw / 2 + .1 + i * (cw - .2) / 3, seatH + .06, -cd / 2 + .045, 0, -.06); box('woodDark', cw, .05, .03, 0, ch - .06, -cd / 2 + .06); }
      else if (st === 'classic') { rbox('upholstery', cw - .1, ch - seatH - .14, .05, .02, 0, seatH + .06, -cd / 2 + .05, 0, -.06); rbox('woodDark', cw, .06, .04, .01, 0, ch - .07, -cd / 2 + .055, 0, -.06); studs('gold', -cw / 2 + .1, seatH + .08, -cd / 2 + .08, cw / 2 - .1, seatH + .08, -cd / 2 + .08, 5, .006); }
      else if (st === 'luxury') { rbox('upholstery', cw - .02, ch - seatH - .04, .07, .03, 0, seatH + .02, -cd / 2 + .05, 0, -.07); }
      else if (st === 'dark') { rbox('leather', cw - .04, .3, .05, .02, 0, seatH + .2, -cd / 2 + .05, 0, -.1); }
      else { cush('upholsteryAlt', cw - .06, .34, .06, 0, seatH + .14, -cd / 2 + .06, 0, -.1, 0, { r: .03, pinch: .2 }); }
    });
  }
  function chair() { chairAt(sub(0, 0, 0, 0), w, d, h); }

  // ------------------------------------------------------------------------------------------------ BED
  function bed(bw, bd, dbl) {
    const frameH = style === 'dark' ? .22 : .2, matH = .26, baseY = style === 'dark' ? .08 : style === 'luxury' ? .1 : .12, hbH = style === 'luxury' ? 1.4 : style === 'classic' ? 1.38 : style === 'najdi' ? 1.2 : style === 'dark' ? 1.0 : 1.12;
    // base / frame
    if (style === 'classic') { rbox('woodDark', bw + .1, .26, bd + .02, .015, 0, .1, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe('woodDark', turnedLeg(.14, .045), sx * (bw / 2 + .02), 0, sz * (bd / 2 - .03), 10); rbox('upholsteryAlt', bw + .02, .3, bd - .1, .02, 0, .0, .0); }
    else if (style === 'najdi') { rbox('woodDark', bw + .08, .24, bd + .02, .015, 0, .1, 0); box('gold', bw + .084, .01, bd + .024, 0, .22, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox('woodDark', .08, .12, .08, .015, sx * (bw / 2 + .02), 0, sz * (bd / 2 - .02)); }
    else if (style === 'luxury') { rbox('upholsteryAlt', bw + .1, .22, bd + .04, .03, 0, baseY, 0); box('gold', bw + .06, baseY, bd - .06, 0, 0, 0); }
    else if (style === 'dark') { box('blackMetal', bw - .1, baseY, bd - .12, 0, 0, 0); rbox('upholstery', bw + .06, frameH - .04, bd + .02, .02, 0, baseY, 0); }
    else { box('woodDark', bw - .12, baseY, bd - .14, 0, 0, 0); rbox('woodMid', bw + .04, frameH - .06, bd + .02, .02, 0, baseY, 0); }
    // headboard
    const hz = -bd / 2 - .02, hw = bw + (style === 'classic' ? .2 : .16);
    if (style === 'classic') {
      rbox('bedHead', hw, hbH - .16, .12, .05, 0, .16, hz); rbox('woodDark', hw + .04, .06, .15, .015, 0, hbH - .06, hz); for (const s of [-1, 1]) { lathe('woodDark', turnedLeg(hbH, .045), s * (hw / 2 + .01), 0, hz, 10); sph('gold', .035, .035, .035, s * (hw / 2 + .01), hbH + .03, hz, 8, 6); }
      const cols = Math.round(hw / .2), rows = 4; for (let c = 1; c < cols; c++) for (let r = 0; r < rows; r++) button('gold', -hw / 2 + hw * c / cols, .5 + r * .18, hz + .068, .012);
    } else if (style === 'najdi') {
      rbox('woodDark', hw, hbH - .5, .08, .015, 0, .2, hz); const arch = cyl('woodDark', hw / 2, hw / 2, .08, 0, 0, hz, 20, Math.PI / 2); arch.position.set(0, hbH - .5 + .2, hz); arch.scale.set(1, 1, .55);
      rbox('bedHead', hw - .24, hbH - .6, .04, .03, 0, .28, hz + .055); studs('gold', -hw / 2 + .06, .3, hz + .06, -hw / 2 + .06, hbH - .4, hz + .06, 6); studs('gold', hw / 2 - .06, .3, hz + .06, hw / 2 - .06, hbH - .4, hz + .06, 6);
    } else if (style === 'luxury') {
      const nr = Math.round(hw / .16), rw = hw / nr; for (let i = 0; i < nr; i++) rbox('bedHead', rw - .005, hbH - .1, .1, .026, -hw / 2 + rw * (i + .5), .1, hz);
      box('gold', hw + .04, .03, .13, 0, hbH, hz); for (const s of [-1, 1]) box('gold', .03, hbH, .13, s * (hw / 2 + .02), 0, hz);
    } else if (style === 'dark') { rbox('leather', hw + .1, hbH - .15, .1, .03, 0, .1, hz); rbox('blackMetal', hw + .14, .03, .14, .01, 0, hbH - .06, hz); }
    else { const nv = Math.round(hw / .35); for (let i = 0; i < nv; i++) rbox('bedHead', hw / nv - .015, hbH - .2, .1, .045, -hw / 2 + hw / nv * (i + .5), .14, hz); rbox('woodMid', hw + .06, .04, .13, .01, 0, hbH - .08, hz); }
    if (style !== 'najdi') box(style === 'dark' ? 'blackMetal' : 'woodDark', hw, hbH - .22, .016, 0, .12, hz - .066); // finished back of the headboard (the bed is often seen from behind)
    // mattress + bedding
    const my = baseY + frameH - .02;
    cush('linen', bw - .02, matH, bd - .08, 0, my, .02, 0, 0, 0, { r: .07, pinch: .1, crown: .02 });
    const dl = (bd - .2) * .64, dz = .02 + (bd - .08) / 2 - dl / 2, dY = my + matH - .03;
    cush('duvet', bw + .02, .1, dl, 0, dY, dz, 0, 0, 0, { r: .045, pinch: .12, crown: .05 });
    for (const s of [-1, 1]) cush('duvet', .08, matH * .9, dl * .96, s * (bw / 2 + .01), my + .02, dz, 0, 0, 0, { r: .035, pinch: 0 });
    cush('duvet', bw - .1, .09, .2, 0, dY + .09, dz - dl / 2 + .08, 0, 0, 0, { r: .04, pinch: .1 });          // folded-back cuff of the duvet
    rbox('throwFab', bw - .04, .024, .42, .01, 0, dY + .1, dz + dl * .12, 0, 0, 0);                              // runner / throw across the bed
    // pillows: two sleeping pillows against the headboard, decorative ones in front
    const np = dbl ? 2 : 1, pz = -bd / 2 + .36, py = my + matH - .04;
    for (let i = 0; i < np; i++) { const x = np === 1 ? 0 : (i ? 1 : -1) * bw * .25; cush('pillowA', Math.min(.66, bw / np - .1), .15, .42, x, py, pz, i ? .05 : -.05, -.12, 0, { pinch: .45, crown: .1 }); }
    if (dbl) { for (const s of [-1, 1]) cush(s < 0 ? 'cushionA' : 'cushionB', .42, .12, .42, s * bw * .22, py + .1, pz + .24, s * .15, -.5, 0, { pinch: .44 }); cush('cushionC', .5, .1, .2, 0, py + .12, pz + .34, 0, -.35, 0, { pinch: .4 }); }
  }

  function nightstand() {
    const legH = style === 'najdi' ? .08 : .14;
    if (style === 'classic') { rbox('woodMid', w, h - .16, d, .015, 0, .12, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe('woodDark', turnedLeg(.14, .03), sx * (w / 2 - .04), 0, sz * (d / 2 - .04), 8); for (const y of [.15, .15 + (h - .2) / 2]) rbox('woodLight', w - .06, (h - .22) / 2 - .02, .02, .006, 0, y, d / 2 + .005); studs('gold', 0, h - .22, d / 2 + .02, 0, h - .22, d / 2 + .02, 1, .014); }
    else if (style === 'luxury') { rbox('lacquer', w, h - .1, d, .012, 0, .08, 0); box('gold', w - .06, .08, d - .06, 0, 0, 0); box('gold', w - .04, .015, .01, 0, h - .1, d / 2 + .004); rbox('woodLight', w - .05, h - .2, .015, .004, 0, .12, d / 2 + .006); }
    else if (style === 'dark') { rbox('blackMetal', w, h - .14, d, .01, 0, legH, 0); rbox('woodMid', w - .06, (h - .22) / 2, .015, .004, 0, legH + .03, d / 2 + .006); rbox('woodMid', w - .06, (h - .22) / 2, .015, .004, 0, legH + .06 + (h - .22) / 2, d / 2 + .006); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('blackMetal', .02, legH, .02, sx * (w / 2 - .04), 0, sz * (d / 2 - .04)); }
    else if (style === 'najdi') { rbox('woodDark', w, h - .08, d, .015, 0, legH, 0); box('gold', w - .02, .008, d - .02, 0, h - .008, 0); rbox('woodMid', w - .08, h - .24, .02, .006, 0, legH + .06, d / 2 + .006); studs('gold', 0, legH + .12, d / 2 + .02, 0, legH + .12, d / 2 + .02, 1, .015); }
    else { rbox('woodMid', w, h - .14, d, .02, 0, legH, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl('woodMid', .012, .02, legH + .02, sx * (w / 2 - .05), 0, sz * (d / 2 - .05), 7); rbox('woodLight', w - .06, (h - .22) / 2 - .01, .02, .005, 0, legH + .02, d / 2 + .005); rbox('woodLight', w - .06, (h - .22) / 2 - .01, .02, .005, 0, legH + .04 + (h - .22) / 2, d / 2 + .005); bar2(); }
    function bar2() { rod('gold', -.05, h - .13, d / 2 + .03, .05, h - .13, d / 2 + .03, .005, 5); rod('gold', -.05, legH + .12, d / 2 + .03, .05, legH + .12, d / 2 + .03, .005, 5); }
    // lamp: base by style + fabric shade with a warm glow
    const lx = -.08, lz = -.04;
    if (style === 'najdi' || style === 'classic' || style === 'luxury') lathe('gold', [[0, 0], [.055, 0], [.06, .02], [.03, .08], [.02, .14], [.028, .2], [.0, .21]], lx, h, lz, 12); else cyl('woodMid', .01, .035, .2, lx, h, lz, 10);
    add2(new THREE.CylinderGeometry(.1, .15, .17, 18, 1, true), 'lampShade', lx, h + .3, lz);
  }
  function add2(geo, mat, x, y, z) { return K.add(geo, mat, x, y, z); }

  // ------------------------------------------------------------------------------------------------ RUG (pattern from the palette material 'rug')
  function rug() {
    const m = K.add(new THREE.BoxGeometry(w, .018, d), 'rug', 0, .009, 0); m.castShadow = false;
    // pattern UV 0..1 over the whole top face
    const geo = m.geometry, p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + .5, p.getZ(i) / d + .5);
    // fringe on the two short ends
    const fr = Math.max(w, d) === w ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [fx, fz] of fr) { const f = box('linen', fx ? .05 : w - .1, .008, fz ? .05 : d - .1, fx * (w / 2 + .022), 0, fz * (d / 2 + .022)); f.castShadow = false; }
  }

  // ------------------------------------------------------------------------------------------------ PLANTS
  function plant() {
    const R = (() => { let a = (Math.round(seed * 9973) >>> 0) || 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const kindP = variant % 3, potH = .3;
    const potMat = style === 'najdi' ? 'pot' : style === 'dark' ? 'blackMetal' : style === 'luxury' ? 'gold' : 'potStone';
    lathe(potMat, [[.0, 0], [.09, 0], [.12, .04], [.145, .3], [.15, .31], [.135, .31], [.0, .29]], 0, 0, 0, 14);
    cyl('soil', .125, .125, .02, 0, potH - .02, 0, 10);
    if (kindP === 0) { // fiddle-leaf fig: a woody stem with large broad leaves spiralling up
      cyl('trunk', .012, .02, h * .6, 0, potH, 0, 6); const n = 16;
      for (let i = 0; i < n; i++) { const t = i / (n - 1), a = i * 2.4, y = potH + h * (.22 + .66 * t), len = .2 - .05 * t + R() * .03, wd = len * .72; const r = .03 + .08 * (1 - t) ; leaf(i % 3 ? 'leafA' : 'leafB', len, wd, Math.cos(a) * .02, y, Math.sin(a) * .02, -a + Math.PI / 2, .9 + R() * .3, 0, .55, .5); }
    } else if (kindP === 1) { // snake plant: upright blades
      for (let i = 0; i < 9; i++) { const a = i * 2.4 + R(), rr = .02 + R() * .05, len = h * (.55 + R() * .35); leaf(i % 2 ? 'leafA' : 'leafB', len, .07, Math.cos(a) * rr, potH, Math.sin(a) * rr, -a + Math.PI / 2, .08 + R() * .18, 0, .12, .08); }
    } else { // areca-style palm: arching fronds with leaflets
      cyl('trunk', .01, .016, h * .28, 0, potH, 0, 6);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + R() * .3, L = h * (.5 + R() * .12), y0 = potH + h * .26;
        const path = [0, .3, .6, .85, 1].map(t => [Math.cos(a) * L * .5 * t, y0 + L * (.7 * t - .55 * t * t * t + .15 * t), Math.sin(a) * L * .5 * t]);
        tube('leafA', path, .005, 6, 4);
        for (let k = 1; k <= 7; k++) { const t = k / 8, px = Math.cos(a) * L * .5 * t, pz = Math.sin(a) * L * .5 * t, py = y0 + L * (.7 * t - .55 * t * t * t + .15 * t); for (const s of [-1, 1]) leaf('leafB', .16 * (1 - t * .5), .03, px, py, pz, -a + Math.PI / 2 + s * 1.1, .6, 0, .2, .3); }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ TV UNIT / WARDROBE / KITCHEN / BASIN
  function tvUnit() {
    const legH = style === 'dark' ? .0 : .1, hh = h - legH;
    const wood = style === 'classic' || style === 'najdi' ? 'woodDark' : style === 'dark' ? 'blackMetal' : style === 'luxury' ? 'lacquer' : 'woodMid';
    rbox(wood, w, hh, d, .012, 0, legH, 0);
    const n = Math.max(2, Math.round(w / .6)), dw = (w - .06) / n;
    for (let i = 0; i < n; i++) { const x = -w / 2 + .03 + dw * (i + .5); rbox(i % 2 && style !== 'dark' ? 'woodLight' : 'woodMid', dw - .012, hh - .1, .02, .004, x, legH + .05, d / 2 + .005); if (i % 2 === 0) box(style === 'luxury' ? 'gold' : 'blackMetal', .012, .12, .012, x + dw * .35, legH + hh * .5, d / 2 + .02); }
    for (const sx of [-1, 1]) if (legH > 0) { if (style === 'luxury') box('gold', .03, legH, .03, sx * (w / 2 - .1), 0, 0); else cyl('woodMid', .016, .022, legH + .01, sx * (w / 2 - .12), 0, 0, 8); }
    // TV with bezel, slim foot; speaker bar
    rbox('blackMetal', Math.min(1.5, w * .8) + .02, .86, .04, .01, 0, h + .09, -.08); rbox('screen', Math.min(1.5, w * .8), .82, .01, .004, 0, h + .11, -.058);
    box('blackMetal', .3, .012, .14, 0, h, -.06); box('blackMetal', .6, .05, .08, 0, h, d / 2 - .1);
    if (style !== 'dark') { lathe('ceramic', [[0, 0], [.05, 0], [.06, .1], [.03, .2], [.0, .21]], w * .38, h, 0, 10); sph('leafB', .07, .09, .07, w * .38, h + .27, 0, 6, 5); }
  }

  function wardrobe() {
    const n = Math.max(2, Math.round(w / .55)), dw = w / n, plinth = .08;
    rbox('woodDark', w, plinth, d - .04, .005, 0, 0, -.01);
    rbox(style === 'dark' ? 'blackMetal' : 'woodLight', w, h - plinth - .06, d - .02, .006, 0, plinth, -.01);
    rbox(style === 'classic' || style === 'luxury' ? 'woodDark' : 'woodLight', w + .06, .08, d + .04, .008, 0, h - .08, 0); // cornice
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + dw * (i + .5), side = i % 2 ? -1 : 1, dh = h - plinth - .12;
      const face = style === 'dark' ? 'woodMid' : style === 'luxury' ? 'lacquer' : style === 'najdi' ? 'woodMid' : 'lacquer';
      rbox(face, dw - .008, dh, .024, .004, x, plinth + .03, d / 2 - .004);
      if (style === 'classic' || style === 'najdi' || style === 'luxury') { rbox('woodLight', dw - .12, dh - .3, .008, .003, x, plinth + .15, d / 2 + .008); rbox(face, dw - .17, dh - .35, .008, .003, x, plinth + .175, d / 2 + .014); }
      else { box('woodDark', .006, dh - .1, .006, x - side * (dw * .2), plinth + .08, d / 2 + .012); box('woodDark', .006, dh - .1, .006, x, plinth + .08, d / 2 + .012); }
      if (style === 'classic' || style === 'luxury') sph('gold', .016, .016, .016, x + side * (dw / 2 - .06), plinth + dh * .5, d / 2 + .025, 6, 4); else rod(style === 'dark' ? 'blackMetal' : 'gold', x + side * (dw / 2 - .05), plinth + dh * .5 - .16, d / 2 + .03, x + side * (dw / 2 - .05), plinth + dh * .5 + .16, d / 2 + .03, .006, 6);
    }
  }

  function kitchenRun() {
    const cabH = .8, top = .04, plinth = .1, n = Math.max(2, Math.round(w / .6)), cw = w / n, carc = style === 'dark' ? 'blackMetal' : style === 'najdi' || style === 'classic' ? 'woodMid' : 'lacquerGrey';
    const dr = style === 'dark' ? 'lacquer' : style === 'najdi' ? 'woodMid' : 'lacquer';
    box('blackMetal', w - .04, plinth, d - .08, 0, 0, -.02);
    rbox(carc, w, cabH - plinth, d - .03, .004, 0, plinth, -.015);
    rbox(style === 'dark' ? 'granite' : 'quartz', w + .02, top, d + .035, .008, 0, cabH, 0);
    const sinkI = Math.min(n - 1, Math.max(0, Math.floor(n / 2))), hobI = n > 3 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + cw * (i + .5), dh = cabH - plinth - .035;
      rbox(dr, cw - .008, dh, .022, .004, x, plinth + .017, d / 2 - .006);
      if (style === 'classic' || style === 'najdi' || style === 'luxury') { rbox(dr, cw - .14, dh - .14, .01, .003, x, plinth + .08, d / 2 + .008); box(carc, cw - .16, dh - .16, .008, x, plinth + .09, d / 2 + .014); }
      if (style === 'classic' || style === 'najdi') sph('gold', .015, .015, .015, x + cw * .3, cabH - .1, d / 2 + .028, 6, 4);
      else if (style === 'dark') box('blackMetal', cw - .04, .02, .02, x, cabH - .06, d / 2 + .018);
      else rod(style === 'luxury' ? 'gold' : 'steel', x - cw * .22, cabH - .1, d / 2 + .03, x + cw * .22, cabH - .1, d / 2 + .03, .006, 6);
    }
    const sx = -w / 2 + cw * (sinkI + .5);
    box('steel', cw - .16, .008, d - .2, sx, cabH + top - .004, .02); box('screen', cw - .22, .006, d - .26, sx, cabH + top, .02);
    cyl('chrome', .012, .012, .24, sx, cabH + top, -d / 2 + .08, 8); tube('chrome', [[sx, cabH + top + .24, -d / 2 + .08], [sx, cabH + top + .33, -d / 2 + .1], [sx, cabH + top + .31, -d / 2 + .18], [sx, cabH + top + .24, -d / 2 + .2]], .01, 8, 5);
    const hx = -w / 2 + cw * (hobI + .5);
    rbox('screen', .6, .01, d - .12, .003, hx, cabH + top, 0);
    for (const [bx, bz, r] of [[-.15, -.1, .065], [.15, -.1, .05], [-.15, .1, .05], [.15, .1, .075]]) { cyl('steel', r, r, .008, hx + bx, cabH + top + .01, bz, 16); cyl('blackMetal', r * .5, r * .5, .01, hx + bx, cabH + top + .016, bz, 10); }
    const up = 1.45, uh = .72;
    for (let i = 0; i < n; i++) {
      if (i === sinkI && n > 2) continue; const x = -w / 2 + cw * (i + .5);
      if (i === hobI) { box('steel', cw - .02, .05, .5, x, up + .02, -d / 2 + .25 - .05); box('steel', .26, uh - .1, .26, x, up + .07, -d / 2 + .2 - .05); continue; }
      rbox(carc, cw - .01, uh, .34, .008, x, up, -d / 2 + .15); rbox(dr, cw - .02, uh - .04, .018, .004, x, up + .02, -d / 2 + .32);
      if (style === 'classic' || style === 'najdi') rbox(dr, cw - .06, .05, .03, .005, x, up + uh - .02, -d / 2 + .3);
    }
    box(style === 'dark' ? 'granite' : 'quartz', w, .5, .012, 0, cabH + top, -d / 2 - .006);
  }

  function basin() {
    const cab = .62;
    const frame = style === 'luxury' || style === 'classic' || style === 'najdi' ? 'gold' : style === 'dark' ? 'blackMetal' : 'woodDark';
    rbox(style === 'dark' ? 'blackMetal' : 'woodMid', w, cab, d, .012, 0, .12, 0); box('blackMetal', w - .06, .1, d - .06, 0, .02, -.01);
    rbox('lacquer', w - .06, cab - .1, .02, .004, 0, .16, d / 2); rod('steel', -.1, .12 + cab - .06, d / 2 + .02, .1, .12 + cab - .06, d / 2 + .02, .006, 6);
    rbox(style === 'dark' ? 'granite' : 'marbleTop', w + .02, .035, d + .02, .008, 0, .12 + cab, 0);
    sph('ceramic', w * .36, .075, d * .36, 0, .12 + cab + .1, .02, 18, 6);
    cyl('chrome', .014, .014, .2, 0, .12 + cab + .035, -d / 2 + .06, 8); tube('chrome', [[0, .12 + cab + .23, -d / 2 + .06], [0, .12 + cab + .27, -d / 2 + .1], [0, .12 + cab + .22, -d / 2 + .16]], .01, 8, 5);
    // framed mirror with a warm LED halo, towel and soap
    const mw = w * .9, my = 1.12;
    if (style === 'contemporary' || style === 'dark') { cyl('mirror', mw / 2, mw / 2, .01, 0, my + .1 - .005, -d / 2 + .022, 32, Math.PI / 2); tor(frame, mw / 2, .014, 0, my + .1, -d / 2 + .02, 0, 0, 0, 5, 32); }
    else { box(frame, mw + .06, .86, .02, 0, my - .35, -d / 2 + .01); box('mirror', mw, .8, .012, 0, my - .32, -d / 2 + .022); }
    box(MG, mw, .012, .01, 0, my + .52, -d / 2 + .03);
    rbox('linen', .3, .04, .18, .012, w * .45, .12 + cab + .035, .0); cyl('ceramic', .025, .025, .12, -w * .38, .12 + cab + .035, .03, 8);
  }

  const table = { 'sofa-3': () => sofa(3), 'sofa-2': () => sofa(2), armchair, 'majlis-sofa': majlis, 'coffee-table': coffeeTable, 'bed-double': () => bed(Math.min(w, 2.2), d, true), 'bed-single': () => bed(w, d, false), nightstand, 'dining-table': diningTable, chair, rug, plant, 'tv-unit': tvUnit, wardrobe, 'kitchen-run': kitchenRun, basin };
  table[kind]();
  return K.g;
}

export default { buildRichFixture, RICH_KINDS, FURNITURE_STYLES, isRichKind };
