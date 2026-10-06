// Furniture provides scale and atmosphere; the planner's wall/opening geometry remains authoritative.
export function furnishRoom(viewer, room, palette) {
  const { x, y, w, h, type } = room;
  if (w < 1.6 || h < 1.6) return;
  const cx = x + w / 2, cz = -y - h / 2;
  const wood = palette === 'hijazi' ? '#71513b' : '#9b795a';
  const fabric = palette === 'classic' ? '#bea889' : palette === 'resort' ? '#c9c0ad' : '#b4c2b6';
  const box = (px, py, pz, bw, bh, bd, color, texture, extra = {}) => viewer.mesh(px, py, pz, bw, bh, bd, color, 0, 1, { rounded: true, texture, ...extra });
  const legs = (px, pz, bw, bd, height, color = '#383c36') => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(px + sx * (bw / 2 - .09), .11 + height / 2, pz + sz * (bd / 2 - .09), .045, height, .045, color, null, { metalness: .35 });
  };
  const rug = (bw, bd, color = '#d7d0bd') => box(cx, .123, cz, Math.min(bw, w - .32), .015, Math.min(bd, h - .32), color, 'fabric', { castShadow: false, roughness: 1 });
  if (type === 'bedroom' && w >= 2.5 && h >= 2.7) {
    const bx = x + Math.min(1.18, w / 2), bz = -y - h + 1.4;
    rug(2.6, 3.1, '#d4cfbf');
    box(bx, .25, bz, 1.65, .26, 2.12, wood, 'wood');
    box(bx, .44, bz, 1.57, .24, 2.02, '#f4f0e6', 'fabric');
    box(bx, .58, bz + .28, 1.6, .1, 1.48, fabric, 'fabric');
    box(bx, .64, bz + .78, 1.62, .05, .38, '#5e756a', 'fabric');
    box(bx, .76, bz - 1.03, 1.76, 1.18, .1, wood, 'wood');
    for (const side of [-1, 1]) {
      box(bx + side * .4, .63, bz - .69, .66, .12, .43, '#faf8f0', 'fabric');
      const nx = bx + side * 1.12;
      if (nx - .23 > x + .12 && nx + .23 < x + w - .12) {
        box(nx, .33, bz - .72, .44, .44, .43, wood, 'wood');
        viewer.sphere(nx, .7, bz - .72, .13, '#e8c48c', { scale: [1, .8, 1], metalness: .25 });
      }
    }
    box(x + w - .36, 1.16, cz, .45, 2.1, Math.min(1.8, h - .8), '#c3b5a2', 'wood');
  } else if (type === 'living' || type === 'majlis') {
    const sw = Math.min(w - .65, 3.2), sz = -y - .6;
    rug(Math.min(w - .45, 3.8), Math.min(h - .45, 3.4));
    box(cx, .31, sz, sw, .33, .84, fabric, 'fabric');
    box(cx, .67, sz + .34, sw, .62, .17, fabric, 'fabric');
    for (const side of [-1, 1]) box(cx + side * (sw / 2 - .08), .52, sz, .17, .56, .9, fabric, 'fabric');
    const seats = Math.max(2, Math.floor(sw / .65));
    for (let i = 0; i < seats; i++) {
      const px = cx - sw / 2 + .2 + (i + .5) * (sw - .4) / seats;
      box(px, .53, sz - .06, (sw - .43) / seats, .12, .67, fabric, 'fabric');
      box(px, .77, sz + .19, (sw - .48) / seats, .38, .16, '#d8d1bd', 'fabric');
    }
    legs(cx, sz, sw - .2, .65, .13);
    const tx = cx, tz = cz - .12, tw = Math.min(1.3, w * .3), td = Math.min(.75, h * .22);
    box(tx, .42, tz, tw, .065, td, wood, 'wood'); legs(tx, tz, tw, td, .28);
    box(tx + .17, .472, tz, .3, .03, .21, '#e0d2b5');
    viewer.sphere(tx - .22, .54, tz, .08, '#586e54', { scale: [1, 1.4, 1] });
    if (h > 3.6) {
      box(x + .52, .4, cz, .66, .55, .8, '#7c9280', 'fabric');
      box(x + .52, .76, cz + .32, .67, .6, .13, '#7c9280', 'fabric');
    }
    box(cx, .37, -y - h + .27, Math.min(sw, 2.3), .45, .38, wood, 'wood');
    box(cx, 1.22, -y - h + .09, Math.min(1.48, w - .7), .84, .035, '#2c3635', null, { roughness: .24 });
  } else if (type === 'dining') {
    const tw = Math.min(2.15, w - 1.3), td = Math.min(1, h - 1.3);
    if (tw < .6 || td < .5) return;
    rug(tw + 1.4, td + 1.35);
    box(cx, .85, cz, tw, .08, td, wood, 'wood'); legs(cx, cz, tw, td, .68);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = cx + sx * tw * .28, pz = cz + sz * (td / 2 + .32);
      box(px, .53, pz, .43, .08, .44, '#c7c3b2', 'fabric');
      box(px, .82, pz + sz * .2, .43, .6, .07, '#c7c3b2', 'fabric');
      legs(px, pz, .4, .42, .38, wood);
    }
    viewer.sphere(cx, 1.01, cz, .13, '#e5e0d0', { scale: [1.2, .6, 1.2] });
  } else if (type === 'kitchen') {
    const kw = Math.max(.6, w - .35), kz = -y - h + .35;
    box(cx, .53, kz, kw, .84, .6, '#7d9181', 'wood');
    box(cx, .976, kz, kw + .04, .055, .64, '#efede3', 'stone');
    const count = Math.max(1, Math.floor(kw / .6));
    for (let i = 0; i < count; i++) {
      const px = cx - kw / 2 + (i + .5) * kw / count;
      box(px, .56, kz + .31, kw / count - .025, .74, .018, '#91a18f', 'wood');
      box(px, .85, kz + .33, .18, .025, .025, '#cbb78a', null, { metalness: .6 });
    }
    box(cx, 1.84, kz + .07, Math.min(kw, 2.4), .63, .34, '#ded8c9', 'wood');
    box(cx - kw * .2, 1.01, kz, .45, .015, .38, '#66726d', null, { metalness: .6 });
    if (w > 3.5 && h > 3.4) {
      box(cx, .57, cz, 1.7, .86, .78, wood, 'wood');
      box(cx, 1.03, cz, 1.76, .06, .84, '#eee8db', 'stone');
    }
  } else if (type === 'bath') {
    box(x + .45, .39, -y - h + .53, .46, .54, .67, '#f6f5ec');
    viewer.sphere(x + .45, .66, -y - h + .47, .22, '#fcfcf5', { scale: [1, .27, 1.25] });
    box(x + w - .48, .7, -y - .37, .7, .4, .48, wood, 'wood');
    box(x + w - .48, .94, -y - .37, .73, .08, .5, '#efeee8', 'stone');
    box(x + w - .48, 1.5, -y - .1, .62, .75, .025, '#a2b8b2', null, { metalness: .8, roughness: .12 });
  } else if (type === 'storage' || type === 'service') {
    for (const level of [.28, .82, 1.36, 1.9]) box(cx, level, -y - .32, Math.max(.4, w - .4), .06, .4, wood, 'wood');
    for (const side of [-1, 1]) box(cx + side * (w / 2 - .23), 1.09, -y - .32, .05, 1.95, .4, '#555f53');
  }
}
