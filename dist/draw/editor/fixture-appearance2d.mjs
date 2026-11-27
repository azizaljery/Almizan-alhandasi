// Screen-only furniture materials. Coordinates and dimensions remain the persisted fixture's.
// Engineering symbols in SVG/DXF/monochrome sheets continue to use fixtureSymbol.
export function drawFurnitureAppearance(ctx, fixture, screen, scale, selected, hover) {
  const { kind, w, d } = fixture;
  const beds = kind.startsWith('bed-'), sofa = ['sofa-3', 'sofa-2', 'armchair', 'majlis-sofa'].includes(kind);
  const wood = ['wardrobe', 'nightstand', 'coffee-table', 'desk', 'tv-unit', 'dining-table'].includes(kind);
  const appliance = ['kitchen-run', 'fridge', 'stove', 'washing-machine'].includes(kind);
  const sanitary = ['wc', 'basin', 'shower', 'bathtub'].includes(kind);
  if (!beds && !sofa && !wood && !appliance && !sanitary && !['chair', 'rug', 'plant'].includes(kind)) return false;
  const center = screen(fixture), x = -w / 2, y = -d / 2;
  ctx.save(); ctx.translate(center.x, center.y); ctx.rotate(-(fixture.rot || 0)); ctx.scale(scale, -scale);
  ctx.lineWidth = Math.max(.008, .75 / scale); ctx.strokeStyle = '#9c9f91';
  const box = (a, b, width, depth, radius, fill, border = '#aca99b', shadow = false) => {
    ctx.save(); ctx.fillStyle = fill; ctx.strokeStyle = border;
    if (shadow) { ctx.shadowColor = '#243a2524'; ctx.shadowBlur = Math.min(7, scale * .09); ctx.shadowOffsetY = 2; }
    ctx.beginPath(); ctx.roundRect(a, b, width, depth, Math.max(0, Math.min(radius, width / 2, depth / 2))); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.stroke(); ctx.restore();
  };
  const line = (a, b, c, e, color = '#aba694') => { ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, e); ctx.stroke(); };
  const ellipse = (a, b, rx, ry, fill, border = '#b0b8ac') => { ctx.fillStyle = fill; ctx.strokeStyle = border; ctx.beginPath(); ctx.ellipse(a, b, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  if (beds) {
    box(x, y, w, d, .07, '#b3a08a', '#9a8872', true);
    box(x + w * .035, y + d * .05, w * .93, d * .92, .08, '#f6f3eb', '#d6d1c4');
    box(x, y, w, d * .055, .03, '#998472', '#998472');
    box(x + w * .04, y + d * .31, w * .92, d * .64, .06, '#d9ded1', '#bec7b8');
    box(x + w * .04, y + d * .32, w * .92, d * .12, .02, '#e9ecdf', '#cbd1c2');
    const n = kind === 'bed-single' ? 1 : 2;
    for (let i = 0; i < n; i++) box(x + w * (.09 + i * .46), y + d * .1, w * (n === 1 ? .82 : .36), d * .16, .06, '#fffdf7', '#ddd9ca', true);
    line(x + w * .12, y + d * .55, x + w * .14, y + d * .86, '#c4ccbc');
  } else if (sofa) {
    const arabic = kind === 'majlis-sofa', tone = arabic ? '#a08768' : '#d3d6c7';
    box(x, y, w, d, .09, arabic ? '#8b7356' : '#acb49e', '#939c89', true);
    const n = kind === 'sofa-3' ? 3 : kind === 'armchair' ? 1 : 2, arm = Math.min(w * .13, .16), span = (w - 2 * arm) / n;
    for (let i = 0; i < n; i++) {
      box(x + arm + i * span + .02, y + d * .31, span - .04, d * .61, .07, tone, '#aeb59f');
      box(x + arm + i * span + .02, y + d * .04, span - .04, d * .24, .06, arabic ? '#c4ac86' : '#e2e3d8', '#aeb59f');
    }
    box(x + .015, y + d * .13, arm - .015, d * .77, .04, tone);
    box(w / 2 - arm, y + d * .13, arm - .015, d * .77, .04, tone);
    if (w > 1) for (const sx of [-1, 1]) box(sx * (w * .36) - .09, -d * .02, .18, d * .28, .05, arabic ? '#e2d3ae' : '#b3baa0');
  } else if (kind === 'dining-table') {
    // Chairs retain the same symbolic clearance used by the existing dining-table symbol.
    const count = Math.max(2, Math.round(w / .65)), cw = Math.min(.44, w / (count + .4)), cd = .39;
    for (let i = 0; i < count; i++) for (const sign of [-1, 1]) {
      const cx = x + (i + .5) * w / count;
      box(cx - cw / 2, sign < 0 ? y - cd * .8 : d / 2 - cd * .2, cw, cd, .08, '#d5d8c9', '#9da78e', true);
    }
    box(x, y, w, d, .11, '#c5ab88', '#aa906e', true);
    box(x + w * .08, y + d * .08, w * .84, d * .84, .08, '#d5bfa2', '#cbb292');
    ellipse(0, 0, Math.min(w, d) * .11, Math.min(w, d) * .11, '#71936c', '#6a8663');
  } else if (wood) {
    box(x, y, w, d, .035, '#c8b495', '#a68f6f', true);
    if (kind === 'wardrobe') for (let i = 1, n = Math.max(2, Math.round(w / .5)); i < n; i++) { line(x + w * i / n, y, x + w * i / n, d / 2); line(x + w * i / n - .05, -.07, x + w * i / n - .05, .07, '#756b59'); }
    else if (kind === 'tv-unit') box(-w * .35, -d * .1, w * .7, d * .18, .01, '#34413c', '#34413c');
    else if (kind === 'desk') box(-w * .22, -d * .25, w * .44, d * .4, .02, '#c4cec4', '#6f8475');
    else { line(x + w * .08, y + d * .15, w * .42, y + d * .15, '#dbc8a9'); ellipse(w * .18, 0, Math.min(w, d) * .1, Math.min(w, d) * .1, '#e4e9d7'); }
  } else if (appliance) {
    box(x, y, w, d, .025, kind === 'stove' ? '#4a514a' : '#e7e6de', '#a5aaa0', true);
    if (kind === 'kitchen-run') {
      box(-w * .32, -d * .27, w * .3, d * .54, .035, '#b9c7c1', '#879c94');
      line(-w * .17, -d * .25, -w * .17, d * .24, '#eaf2ed');
      line(-w * .17, y + .03, -w * .17, y + .12, '#678a7a');
      for (let i = 1; i < Math.round(w / .6); i++) line(x + i * .6, d * .25, x + i * .6, d * .48, '#bcbcaf');
    } else if (kind === 'stove') for (const a of [-1, 1]) for (const b of [-1, 1]) ellipse(a * w * .23, b * d * .23, w * .135, d * .135, '#242d28', '#a1ada4');
    else if (kind === 'washing-machine') { ellipse(0, 0, w * .33, d * .33, '#c7d5cd'); ellipse(0, 0, w * .22, d * .22, '#829c8e'); }
    else line(x + .06, d * .36, w / 2 - .06, d * .36, '#89978d');
  } else if (sanitary) {
    if (kind === 'wc') { box(x, y, w, d * .25, .025, '#f8faf5'); ellipse(0, d * .1, w * .45, d * .36, '#fbfdf8'); ellipse(0, d * .14, w * .28, d * .23, '#dde7df'); }
    else { box(x, y, w, d, .04, '#edf3ed', '#a1b4a5');
      if (kind === 'shower') { line(x + .04, y + .04, w / 2 - .04, d / 2 - .04, '#c6d8ca'); ellipse(0, 0, .035, .035, '#8ba18f'); }
      else { ellipse(0, 0, w * .37, d * .36, '#d8e5dd'); ellipse(0, -d * .36, .025, .025, '#7d9588'); }
    }
  } else if (kind === 'rug') {
    box(x, y, w, d, .02, '#e0d2b8', '#c5b18c');
    box(x + w * .05, y + d * .07, w * .9, d * .86, .02, '#eee4d1', '#c6b595');
    for (const s of [-1, 1]) line(x + w * .12, s * d * .31, w * .38, s * d * .31, '#d3c2a4');
  } else if (kind === 'chair') { box(x, y, w, d, .07, '#d3d8c6', '#98a78f', true); box(x, y, w, d * .2, .045, '#aebc9e'); }
  else if (kind === 'plant') { ellipse(0, 0, w * .3, d * .3, '#beae8e'); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ellipse(Math.cos(a) * w * .24, Math.sin(a) * d * .24, w * .19, d * .14, i % 2 ? '#6b936b' : '#8caf78', '#63865d'); } }
  if (selected || hover) { ctx.lineWidth = (selected ? 2 : 1.3) / scale; ctx.strokeStyle = selected ? '#176b55' : '#578b68'; ctx.beginPath(); ctx.roundRect(x, y, w, d, .04); ctx.stroke(); }
  ctx.restore(); return true;
}
