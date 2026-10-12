// طبقة عرض فقط: رموز أثاث وتجهيزات توضيحية داخل الفراغات (مسقط معماري مهني).
// لا تؤثر في الهندسة ولا في الكميات؛ تُرسم من أبعاد الغرفة وموقع بابها فقط.
import { openingPoint } from './planner.mjs';

const n = v => Number(v.toFixed(3));
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const FILL = 'fill="#ffffff" fill-opacity=".9" stroke="#7b848c" stroke-width=".028"';
const SOFT = 'fill="#efe3c6" stroke="#a69368" stroke-width=".028"';
const DARK = 'fill="#8d949a" stroke="#6c737a" stroke-width=".02"';
const rect = (x, y, w, h, style = FILL, rx = .04) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" ${style}/>`;
const circle = (cx, cy, r, style = FILL) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${style}/>`;
const line = (x1, y1, x2, y2, extra = 'stroke="#7b848c" stroke-width=".022"') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${extra}/>`;

// الجهة التي يقع عليها باب الغرفة (بإحداثيات الرسم، المحور y مقلوب).
export function doorSide(model, r) {
  const x0 = r.x, y0 = -r.y - r.h, x1 = x0 + r.w, y1 = y0 + r.h;
  let best = null;
  for (const o of model.openings || []) {
    if (o.type !== 'door' || !(o.roomId === r.id || o.connects?.includes(r.id))) continue;
    const wall = model.walls.find(w => w.id === o.wallId);
    if (!wall) continue;
    const p = openingPoint(model, o), px = p.x, py = -p.y;
    const d = { left: Math.abs(px - x0), right: Math.abs(px - x1), top: Math.abs(py - y0), bottom: Math.abs(py - y1) };
    const side = Object.entries(d).sort((a, b) => a[1] - b[1])[0];
    if (!best || side[1] < best.distance) best = { side: side[0], distance: side[1] };
  }
  return best?.side || 'bottom';
}

// إطار محلي: الجدار «الرأسي» عند y=0 والامتداد lw × lh، ثم تدوير ليطابق الجهة الفعلية.
function frame(r, head, draw) {
  const x0 = r.x, y0 = -r.y - r.h, w = r.w, h = r.h;
  const spec = {
    top: [`translate(${n(x0)} ${n(y0)})`, w, h],
    bottom: [`translate(${n(x0 + w)} ${n(y0 + h)}) rotate(180)`, w, h],
    left: [`translate(${n(x0)} ${n(y0 + h)}) rotate(-90)`, h, w],
    right: [`translate(${n(x0 + w)} ${n(y0)}) rotate(90)`, h, w],
  }[head];
  return `<g transform="${spec[0]}">${draw(spec[1], spec[2])}</g>`;
}

const bed = (cx, y, wide = 1.8) => {
  const x = cx - wide / 2;
  return rect(x - .04, y - .02, wide + .08, .09, DARK, .02) + rect(x, y + .05, wide, 2.0, FILL, .05)
    + rect(x + .1, y + .15, wide / 2 - .16, .36, FILL, .08) + rect(x + wide / 2 + .06, y + .15, wide / 2 - .16, .36, FILL, .08)
    + `<path d="M${n(x)},${n(y + 1.0)}H${n(x + wide)} M${n(x)},${n(y + 1.0)}L${n(x + wide * .5)},${n(y + 1.35)}L${n(x + wide)},${n(y + 1.0)}" fill="none" stroke="#9aa2a8" stroke-width=".022"/>`;
};

function bedroom(r, side) {
  const head = OPPOSITE[side];
  return frame(r, head, (lw, lh) => {
    if (lw < 2.4 || lh < 2.7) return rect(lw / 2 - .45, .1, .9, 1.9);
    const wide = lw >= 3.4 ? 1.8 : 1.5, cx = lw / 2;
    let s = bed(cx, .06, wide);
    if (lw >= 3.6) s += rect(cx - wide / 2 - .5, .08, .42, .42) + rect(cx + wide / 2 + .08, .08, .42, .42);
    if (lw >= 3.2 && lh >= 3.6) {
      const len = Math.min(2.6, lh - 2.9);
      if (len >= 1.2) s += rect(lw - .62, lh - len - .06, .56, len, FILL, .02) + line(lw - .62, lh - len / 2 - .06, lw - .06, lh - len / 2 - .06);
    }
    return s;
  });
}

function majlis(r, side) {
  const head = OPPOSITE[side];
  return frame(r, head, (lw, lh) => {
    if (lw < 2.6 || lh < 2.6) return rect(.12, .12, Math.max(.6, lw - .24), .7, SOFT, .08);
    const d = .72;
    let s = rect(.1, .1, lw - .2, d, SOFT, .09) + rect(.1, .1 + d, d, Math.max(.4, lh - .1 - d - .75), SOFT, .09) + rect(lw - .1 - d, .1 + d, d, Math.max(.4, lh - .1 - d - .75), SOFT, .09);
    // فواصل الوسائد
    for (let x = .1 + .9; x < lw - .3; x += .9) s += line(x, .14, x, .1 + d - .04, 'stroke="#a69368" stroke-width=".016"');
    for (let y = .1 + d + .9; y < lh - .8; y += .9) s += line(.14, y, .1 + d - .04, y, 'stroke="#a69368" stroke-width=".016"') + line(lw - .1 - d + .04, y, lw - .14, y, 'stroke="#a69368" stroke-width=".016"');
    if (lw > 4.2 && lh > 4.2) s += rect(lw / 2 - .75, lh / 2 - .45, 1.5, .9, 'fill="none" stroke="#b6a479" stroke-width=".02" stroke-dasharray=".12 .08"', .05) + circle(lw / 2, lh / 2, .3);
    return s;
  });
}

function living(r, side) {
  const head = OPPOSITE[side];
  return frame(r, head, (lw, lh) => {
    if (lw < 2.8 || lh < 2.8) return rect(.15, .15, Math.min(2.2, lw - .3), .85, FILL, .08);
    const cx = lw / 2, sofaY = Math.min(lh - 1.1, Math.max(1.9, lh * .55));
    return rect(cx - .9, .08, 1.8, .38, DARK, .03) + rect(cx - 1.3, sofaY, 2.6, .85, FILL, .08) + rect(cx - 1.3, sofaY + .6, 2.6, .25, SOFT, .06)
      + rect(cx - 1.3, sofaY, .22, .85, SOFT, .06) + rect(cx + 1.08, sofaY, .22, .85, SOFT, .06) + rect(cx - .55, sofaY - .85, 1.1, .5, FILL, .06)
      + (lw > 4.4 ? rect(.2, sofaY - .15, .85, 1.5, FILL, .08) : '');
  });
}

function dining(r) {
  const horizontal = r.w >= r.h, cx = r.x + r.w / 2, cy = -r.y - r.h / 2;
  const long = r.w * r.h >= 22 ? 2.2 : 1.8, short = .95;
  const R = (dx, dy, w, h, style = FILL, rx = .04) => horizontal ? rect(cx + dx, cy + dy, w, h, style, rx) : rect(cx + dy, cy + dx, h, w, style, rx);
  let s = R(-long / 2, -short / 2, long, short, FILL, .06);
  const count = long > 2 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const x = -long / 2 + (i + .5) * (long / count) - .21;
    s += R(x, -short / 2 - .5, .42, .42, FILL, .08) + R(x, short / 2 + .08, .42, .42, FILL, .08);
  }
  return s + R(-long / 2 - .5, -.21, .42, .42, FILL, .08) + R(long / 2 + .08, -.21, .42, .42, FILL, .08);
}

function kitchen(r, side) {
  const head = OPPOSITE[side];
  return frame(r, head, (lw, lh) => {
    if (lw < 2 || lh < 2) return rect(.05, .05, lw - .1, .6);
    let s = rect(.04, .04, lw - .08, .62, FILL, .02) + rect(.04, .66, .62, Math.max(.4, Math.min(lh * .6, 2.6)), FILL, .02);
    // مغسلة + موقد + ثلاجة
    s += rect(lw * .28, .12, .85, .46, FILL, .05) + circle(lw * .28 + .42, .35, .1, 'fill="none" stroke="#7b848c" stroke-width=".02"');
    const hx = lw * .6;
    s += rect(hx, .1, .62, .48, FILL, .03) + circle(hx + .17, .26, .08) + circle(hx + .45, .26, .08) + circle(hx + .17, .44, .08) + circle(hx + .45, .44, .08);
    s += rect(lw - .78, .06, .7, .7, FILL, .03) + line(lw - .78, .4, lw - .08, .4);
    return s;
  });
}

function bath(r, side) {
  const wide = r.w >= r.h;
  const candidates = wide ? ['top', 'bottom'] : ['left', 'right'];
  const head = candidates.includes(OPPOSITE[side]) ? OPPOSITE[side] : candidates[0];
  return frame(r, head, (lw, lh) => {
    let x = .06, s = '';
    if (lw >= 2.1 && lh >= 1.2) { s += rect(x, .06, .92, .92, FILL, .03) + line(x, .06, x + .92, .98) + line(x + .92, .06, x, .98) + circle(x + .46, .52, .06); x += 1.0; }
    s += rect(x + .04, .06, .42, .22, FILL, .03) + `<ellipse cx="${n(x + .25)}" cy="${n(.55)}" rx=".19" ry=".27" ${FILL}/>`; x += .55;
    if (lw - x >= .55) s += rect(x + .05, .06, .5, .4, FILL, .06) + circle(x + .3, .26, .1, 'fill="none" stroke="#7b848c" stroke-width=".02"');
    return s;
  });
}

function service(r, side) {
  const head = OPPOSITE[side];
  return frame(r, head, (lw, lh) => lw < 1.8 || lh < 2.2 ? '' : bed(lw * .35, .06, .95) + (lw > 2.6 ? rect(lw - .6, lh - Math.min(1.6, lh - 1.6) - .06, .55, Math.min(1.6, lh - 1.6), FILL, .02) : ''));
}

function office(r, side) {
  const head = OPPOSITE[side];
  return frame(r, head, (lw, lh) => lw < 2 || lh < 2 ? '' : rect(.2, .06, Math.min(1.6, lw - .6), .65, FILL, .03) + circle(.2 + Math.min(1.6, lw - .6) / 2, 1.05, .22) + rect(lw - .4, .5, .34, Math.max(.6, lh - 1), FILL, .02));
}

export function planFurniture(model, r) {
  try {
    const side = doorSide(model, r);
    switch (r.type) {
      case 'bedroom': return bedroom(r, side);
      case 'majlis': return majlis(r, side);
      case 'living': return living(r, side);
      case 'dining': return dining(r);
      case 'kitchen': return kitchen(r, side);
      case 'bath': return bath(r, side);
      case 'service': return service(r, side);
      case 'office': return office(r, side);
      default: return '';
    }
  } catch { return ''; }
}
