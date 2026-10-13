// Windows, doors, sliders, garage doors and arch reveals built into a MeshBuilder.
// Pure (no THREE): everything goes through the builder.  Plan frame of an opening: `dir` along the wall,
// `left` across it; ln > 0 is the LEFT side of the wall.
import { P3 } from './meshbuilder.mjs';

const WINDOW = { frame: .055, depth: .07 };

/** Which side of the wall (+1 left, -1 right) a door leaf swings to; `ext` = side that is outdoors (+1/-1/0). */
export function swingSide(o, ext) {
  const inside = ext === 0 ? 1 : -ext;
  return (o.swing === 'out') ? -inside : inside;
}
/** True when the hinge is at the +dir end of the opening. Hinge is seen from the side the door swings to. */
export const hingeAtPlus = (hinge, swingSign) => (hinge === 'left') === (swingSign === 1);

/**
 * @param {MeshBuilder} B
 * @param {object} o  opening from wall-geometry (center, dir, left, w, h, sill, t, kind, hinge, swing, entry)
 * @param {{E:number, ext:number, door:'closed'|'ajar'|'open', keys?:object}} ctx
 */
export function emitOpening(B, o, ctx) {
  const k = { alu: 'aluminium', glass: 'glass', leaf: 'doorLeaf', leafWhite: 'doorWhite', entry: 'doorEntry', frame: 'doorFrame', handle: 'handle', sill: 'sillStone', garage: 'garageDoor', trim: 'trim', ...(ctx.keys || {}) };
  const { E } = ctx, ext = ctx.ext || 0, d = o.dir, l = o.left, ry = Math.atan2(d.y, d.x);
  const pos = (lu, ln) => ({ x: o.center.x + d.x * lu + l.x * ln, y: o.center.y + d.y * lu + l.y * ln });
  const bx = (key, lu, y, ln, su, sy, sn) => { const p = pos(lu, ln); B.box(key, p.x, y, -p.y, su, sy, sn, ry); };
  const w = o.w, h = o.h, t = o.t, z0 = E + o.z0, shift = ext ? ext * Math.max(0, t / 2 - .085) : 0;
  const trimW = .09;

  const trim = () => { // plaster surround on the outdoor face
    if (!ext) return;
    const ln = ext * (t / 2 + .006);
    bx(k.trim, -(w / 2 + trimW / 2), z0 + h / 2 + trimW / 2, ln, trimW, h + trimW, .014);
    bx(k.trim, w / 2 + trimW / 2, z0 + h / 2 + trimW / 2, ln, trimW, h + trimW, .014);
    bx(k.trim, 0, z0 + h + trimW / 2, ln, w, trimW, .014);
  };

  if (o.kind === 'window' || o.kind === 'window2') {
    const f = WINDOW.frame, dp = WINDOW.depth;
    bx(k.alu, -(w / 2 - f / 2), z0 + h / 2, shift, f, h, dp); bx(k.alu, w / 2 - f / 2, z0 + h / 2, shift, f, h, dp);
    bx(k.alu, 0, z0 + h - f / 2, shift, w - 2 * f, f, dp); bx(k.alu, 0, z0 + f / 2, shift, w - 2 * f, f, dp);
    const panes = w > 1.9 ? 3 : w > 1.0 ? 2 : 1, inner = w - 2 * f, pw = inner / panes;
    for (let i = 1; i < panes; i++) bx(k.alu, -inner / 2 + pw * i, z0 + h / 2, shift, .05, h - 2 * f, dp - .01);
    const transom = h > 1.35;
    if (transom) bx(k.alu, 0, z0 + h - f - .34, shift, w - 2 * f, .04, dp - .01);
    bx(k.glass, 0, z0 + h / 2, shift, inner + .01, h - 2 * f + .01, .012);
    // sash frames on the room side of every pane (thin bars) give the casement rhythm
    const sy0 = z0 + f, sy1 = transom ? z0 + h - f - .34 : z0 + h - f, sh = sy1 - sy0, inShift = shift - (ext ? ext : 1) * .02;
    for (let i = 0; i < panes; i++) {
      const cx = -inner / 2 + pw * (i + .5), sw = pw - .03;
      bx(k.alu, cx - sw / 2, sy0 + sh / 2, inShift, .032, sh - .03, .04); bx(k.alu, cx + sw / 2, sy0 + sh / 2, inShift, .032, sh - .03, .04);
      bx(k.alu, cx, sy0 + .015, inShift, sw, .032, .04); bx(k.alu, cx, sy1 - .015, inShift, sw, .032, .04);
    }
    if (panes > 1) bx(k.handle, -inner / 2 + pw, z0 + h * .45, inShift - (ext || 1) * .03, .02, .11, .02);
    // sill: outdoor drip stone + room side stool, sitting on the cut sill piece
    bx(k.sill, 0, z0 + .015, shift ? ext * .01 : 0, w + .16, .03, t + (ext ? .08 : .04));
    trim();
    return;
  }

  if (o.kind === 'slider') {
    const f = .055, dp = .075;
    bx(k.alu, -(w / 2 - f / 2), z0 + h / 2, shift, f, h, dp); bx(k.alu, w / 2 - f / 2, z0 + h / 2, shift, f, h, dp);
    bx(k.alu, 0, z0 + h - f / 2, shift, w - 2 * f, f, dp); bx(k.alu, 0, z0 + f / 2 + .02, shift, w - 2 * f, f, dp);
    const inner = w - 2 * f, pw = inner / 2 + .03;
    for (const [i, s] of [[0, -1], [1, 1]]) {
      const cx = (i ? 1 : -1) * (inner / 2 - pw / 2 + .0), off = s * .022;
      bx(k.alu, cx - pw / 2 + .02, z0 + h / 2, shift + off, .045, h - 2 * f - .04, .035); bx(k.alu, cx + pw / 2 - .02, z0 + h / 2, shift + off, .045, h - 2 * f - .04, .035);
      bx(k.alu, cx, z0 + h - f - .02, shift + off, pw, .045, .035); bx(k.alu, cx, z0 + f + .05, shift + off, pw, .045, .035);
      bx(k.glass, cx, z0 + h / 2, shift + off, pw - .04, h - 2 * f - .1, .01);
    }
    bx(k.handle, .03, z0 + 1.05, shift - .04, .025, .22, .02);
    bx(k.sill, 0, z0 + .005, 0, w, .01, t);
    trim();
    return;
  }

  if (o.kind === 'garage') {
    const rows = Math.max(3, Math.round(h / .6)), ph = (h - .06) / rows;
    bx(k.alu, -(w / 2 - .04), z0 + h / 2, shift, .08, h, .1); bx(k.alu, w / 2 - .04, z0 + h / 2, shift, .08, h, .1); bx(k.alu, 0, z0 + h - .04, shift, w, .08, .1);
    for (let i = 0; i < rows; i++) {
      bx(k.garage, 0, z0 + .01 + ph * (i + .5), shift, w - .16, ph - .012, .045);
      if (i === rows - 1) for (let j = 0; j < 4; j++) bx(k.glass, -w / 2 + .5 + j * ((w - 1) / 3), z0 + .01 + ph * (i + .5), shift + (ext || 1) * .026, (w - 1) / 3 - .1, ph * .5, .01);
    }
    bx(k.handle, 0, z0 + 1.0, shift + (ext || 1) * .03, .3, .03, .015);
    bx(k.sill, 0, z0 + .004, 0, w, .008, t);
    trim();
    return;
  }

  if (o.kind === 'arch') { // open arch: only a thin reveal liner; the spandrels are cut in by the wall builder
    bx(k.frame, -(w / 2 - .01), z0 + h * .3, 0, .02, h * .6, t + .004); bx(k.frame, w / 2 - .01, z0 + h * .3, 0, .02, h * .6, t + .004);
    return;
  }

  // door / door2 (anything else behaves like a single door)
  const dbl = o.kind === 'door2', entry = !!o.entry || ext !== 0;
  const swing = swingSide(o, ext), plusHinge = hingeAtPlus(o.hinge, swing);
  const fw = .07, lining = .022;
  // door lining inside the reveal + architrave on both faces
  bx(k.frame, -(w / 2 - lining / 2), z0 + h / 2, 0, lining, h, t + .004); bx(k.frame, w / 2 - lining / 2, z0 + h / 2, 0, lining, h, t + .004);
  bx(k.frame, 0, z0 + h - lining / 2, 0, w, lining, t + .004);
  for (const sd of [-1, 1]) {
    const ln = sd * (t / 2 + .007);
    if (ext && sd === ext) { trim(); continue; }
    bx(k.frame, -(w / 2 + fw / 2), z0 + h / 2 + fw / 2, ln, fw, h + fw, .014); bx(k.frame, w / 2 + fw / 2, z0 + h / 2 + fw / 2, ln, fw, h + fw, .014); bx(k.frame, 0, z0 + h + fw / 2, ln, w, fw, .014);
  }
  bx(k.sill, 0, z0 + .005, 0, w, .01, t);
  const leafKey = entry ? k.entry : k.leaf, thick = entry ? .05 : .042, closed = ctx.door === 'closed' || (entry && ctx.door !== 'open');
  const angle = closed ? 0 : (ctx.door === 'open' ? 1.35 : .56);
  const leafH = h - .035;
  const leaf = (hingeU, towardU, len) => { // hinge at lu = hingeU, leaf extends toward towardU (+1/-1)
    const hp = pos(hingeU, 0);
    const vx = d.x * towardU * Math.cos(angle) + l.x * swing * Math.sin(angle), vy = d.y * towardU * Math.cos(angle) + l.y * swing * Math.sin(angle);
    const lr = Math.atan2(vy, vx), cx = hp.x + vx * len / 2, cy = hp.y + vy * len / 2;
    B.box(leafKey, cx, z0 + .02 + leafH / 2, -cy, len, leafH, thick, lr);
    const px = -vy, py = vx; // perpendicular (left of the leaf direction)
    if (entry) { // raised panels + long pull
      for (const sd of [-1, 1]) {
        for (const [yy, hh] of [[.25, leafH * .35], [.25 + leafH * .4, leafH * .5]]) B.box(leafKey, cx + px * sd * (thick / 2 + .004), z0 + .02 + yy + hh / 2, -(cy + py * sd * (thick / 2 + .004)), len - .2, hh, .008, lr);
      }
    }
    for (const sd of [-1, 1]) {
      const along = len - .08;
      const hx = hp.x + vx * along + px * sd * (thick / 2 + .022), hy = hp.y + vy * along + py * sd * (thick / 2 + .022);
      if (entry) B.box(k.handle, hx, z0 + 1.05, -hy, .03, .9, .03, lr);
      else {
        B.box(k.handle, hx - vx * .045, z0 + 1.0, -(hy - vy * .045), .12, .022, .022, lr);
        B.box(k.handle, hp.x + vx * along + px * sd * (thick / 2 + .006), z0 + 1.0, -(hp.y + vy * along + py * sd * (thick / 2 + .006)), .05, .05, .012, lr);
      }
    }
  };
  if (dbl) { const half = (w - .03) / 2 - .003; leaf(-w / 2 + .015, 1, half); leaf(w / 2 - .015, -1, half); }
  else if (plusHinge) leaf(w / 2 - .012, -1, w - .03); else leaf(-w / 2 + .012, 1, w - .03);
}

/** Arch spandrels: the two top corners of an arched opening, as polygons in (u, z) wall-face coordinates. */
export function archProfile(o, steps = 14) {
  const w = o.w, rise = Math.min(w / 2 * .92, .6), c = w / 2, R = (c * c + rise * rise) / (2 * rise), cz = o.z1 - R, zs = o.z1 - rise;
  const arc = [];
  for (let i = 0; i <= steps; i++) { const u = -c + (2 * c * i) / steps; arc.push({ u, z: cz + Math.sqrt(Math.max(0, R * R - u * u)) }); }
  arc[0].z = zs; arc[arc.length - 1].z = zs;
  return { rise, R, zs, arc, left: [{ u: -c, z: o.z1 }, ...arc.filter(p => p.u <= 1e-9), ].map(p => p), right: [{ u: c, z: o.z1 }, ...arc.filter(p => p.u >= -1e-9).reverse()] };
}

export default { emitOpening, swingSide, hingeAtPlus, archProfile };
