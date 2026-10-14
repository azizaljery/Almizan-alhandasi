import test from 'node:test';
import assert from 'node:assert/strict';
import { snapPoint, nearestWall, gridStep, snapToGrid } from '../dist/draw/editor/snap.mjs';
import { hitItem, hitNode, itemsInBox, stairBox } from '../dist/draw/editor/hit.mjs';
import { Editor } from '../dist/draw/editor/editor.mjs';
import { createDoc, applyCommand } from '../dist/draw/doc.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';

const rect = (doc = createDoc()) => applyCommand(doc, { type: 'add-rect', level: 'L1', a: { x: 0, y: 0 }, b: { x: 6, y: 4 }, t: .2 }).doc;

test('grid step grows with zoom-out and stays readable', () => {
  assert.ok(gridStep(200) <= .1); assert.ok(gridStep(40) >= .25); assert.ok(gridStep(5) >= 2);
  assert.equal(snapToGrid(1.234, .1), 1.2);
});

test('snap priority: node > intersection > midpoint > edge > alignment > angle > grid', () => {
  const d = rect(); const o = { scale: 60 };
  assert.deepEqual([snapPoint(d, 'L1', { x: .05, y: -.04 }, o).kind, snapPoint(d, 'L1', { x: .05, y: -.04 }, o).p], ['node', { x: 0, y: 0 }]);
  assert.equal(snapPoint(d, 'L1', { x: 3.03, y: .02 }, o).kind, 'mid');
  const e = snapPoint(d, 'L1', { x: 1.37, y: .04 }, o); assert.equal(e.kind, 'edge'); assert.ok(Math.abs(e.p.y) < 1e-9);
  const a = snapPoint(d, 'L1', { x: 6.04, y: 9 }, o); assert.equal(a.kind, 'align'); assert.equal(a.p.x, 6); assert.ok(a.guides.some(g => g.axis === 'x'));
  const g = snapPoint(d, 'L1', { x: 12.31, y: 9.04 }, o); assert.equal(g.kind, 'grid');
  const inter = applyCommand(d, { type: 'add-wall', level: 'L1', a: { x: 2, y: -1 }, b: { x: 2, y: 5 }, t: .1 }).doc;
  assert.equal(snapPoint(inter, 'L1', { x: 2.03, y: .03 }, o).kind, 'inter');
});

test('angle snap keeps a wall horizontal / vertical / 45 degrees from the start point', () => {
  const d = createDoc(), from = { x: 1, y: 1 }, o = { scale: 60, from };
  assert.equal(snapPoint(d, 'L1', { x: 4.2, y: 1.05 }, o).p.y, 1);
  assert.equal(snapPoint(d, 'L1', { x: 1.03, y: 5.3 }, o).p.x, 1);
  const q = snapPoint(d, 'L1', { x: 3.1, y: 3.04 }, o); assert.ok(Math.abs((q.p.x - 1) - (q.p.y - 1)) < 1e-6);
  const free = snapPoint(d, 'L1', { x: 4, y: 2.2 }, { ...o, ortho: false }); assert.notEqual(free.kind, 'ortho');
});

test('nearestWall finds the wall and the distance along it', () => {
  const d = rect(); const n = nearestWall(d, 'L1', { x: 2, y: .3 }, .6);
  assert.ok(n); assert.ok(Math.abs(n.at - 2) < .3 || Math.abs(n.at - 4) < .3); assert.equal(nearestWall(d, 'L1', { x: 3, y: 2 }, .4), null);
});

test('hit testing: openings before walls, fixtures, nodes, box selection', () => {
  let d = rect(); const w = d.walls[0];
  d = applyCommand(d, { type: 'add-opening', wall: w.id, kind: 'door', at: 2 }).doc;
  d = applyCommand(d, { type: 'add-fixture', level: 'L1', kind: 'sofa-3', x: 3, y: 2, rot: 0 }).doc;
  assert.equal(hitItem(d, 'L1', { x: 2, y: 0 }, .02).kind, 'openings');
  assert.equal(hitItem(d, 'L1', { x: 4.5, y: 0 }, .02).kind, 'walls');
  assert.equal(hitItem(d, 'L1', { x: 3, y: 2 }, .02).kind, 'fixtures');
  assert.equal(hitItem(d, 'L1', { x: 3, y: 3.2 }, .02), null);
  assert.deepEqual(hitNode(d, 'L1', { x: 6.02, y: 3.99 }, .02).p, { x: 6, y: 4 });
  const win = itemsInBox(d, 'L1', { x0: -1, y0: -1, x1: 7, y1: 5 }, false);
  assert.ok(win.length >= 6); // 4 walls + door + sofa
  const part = itemsInBox(d, 'L1', { x0: -.5, y0: -.5, x1: 3, y1: .5 }, false); assert.equal(part.filter(id => id.startsWith('w')).length, 0);
  const cross = itemsInBox(d, 'L1', { x0: -.5, y0: -.5, x1: 3, y1: .5 }, true); assert.ok(cross.filter(id => id.startsWith('w')).length >= 2);
  assert.equal(stairBox({ x: 0, y: 0, w: 1, run: 3, kind: 'straight' }).length, 4);
});

// ---- the controller, driven through its own handlers with a fake canvas
function fakeCanvas() {
  const c = { style: {}, width: 800, height: 600, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), focus() {}, setPointerCapture() {}, releasePointerCapture() {},
    getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : () => {}, set: () => true }) };
  return c;
}
function make(doc = createDoc()) {
  const events = []; const c = fakeCanvas(); const ed = new Editor(c, { doc, onEvent: e => events.push(e) });
  ed.view = { cx: 3, cy: 2, scale: 50 }; ed.W = 800; ed.H = 600;
  const ev = (x, y, extra = {}) => { const s = ed.screen({ x, y }); return { clientX: s.x, clientY: s.y, pointerId: 1, button: 0, shiftKey: false, altKey: false, ...extra }; };
  const click = (x, y, extra) => { const e = ev(x, y, extra); ed.onDown(e); ed.onUp(e); };
  return { ed, events, ev, click };
}
globalThis.performance ??= { now: () => Date.now() };

test('wall tool: chain of clicks makes connected walls and closing the loop stops drawing', () => {
  const { ed, click } = make(); ed.setTool('wall');
  click(0, 0); click(5, 0); click(5, 3); click(0, 3); click(0, 0);
  assert.equal(ed.doc.walls.length, 4); assert.equal(ed.draft, null); assert.equal(ed.lv.rooms.length, 1);
  assert.ok(Math.abs(ed.lv.rooms[0].area - (4.8 * 2.8)) < .01);
  ed.undo(); assert.equal(ed.doc.walls.length, 3);
});

test('wall tool: typed length follows the pointer direction exactly', () => {
  const { ed, ev, click } = make(); ed.setTool('wall');
  click(0, 0); const e = ev(3, .02); ed.onMove(e);
  for (const k of '4.25') ed.onKey({ key: k, preventDefault() {} });
  ed.onKey({ key: 'Enter', preventDefault() {} });
  const w = ed.doc.walls[0]; assert.ok(Math.abs(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) - 4.25) < 1e-6); assert.ok(Math.abs(w.b.y) < 1e-6);
});

test('opening tool places a door on the wall under the cursor, window on another', () => {
  const { ed, click } = make(rect()); ed.setTool('opening', { openingKind: 'window' }); click(3, .03);
  assert.equal(ed.doc.openings.length, 1); assert.equal(ed.doc.openings[0].kind, 'window'); assert.ok(Math.abs(ed.doc.openings[0].at - 3) < .2);
  ed.setTool('opening', { openingKind: 'door' }); click(3, 1.5); assert.equal(ed.doc.openings.length, 1); // nothing near a wall
});

test('room tool labels the clicked room; clicking again changes its type', () => {
  const { ed, click } = make(rect()); ed.setTool('room', { roomType: 'majlis' }); click(3, 2);
  assert.equal(ed.doc.labels.length, 1); assert.equal(ed.doc.labels[0].type, 'majlis'); assert.equal(ed.lv.rooms[0].name, 'مجلس');
  ed.setTool('room', { roomType: 'bedroom' }); click(3, 2); assert.equal(ed.doc.labels.length, 1); assert.equal(ed.doc.labels[0].type, 'bedroom');
});

test('fixture tool snaps to the wall and turns its front away from it', () => {
  const { ed, click } = make(rect()); ed.setTool('fixture', { fixtureKind: 'bed-double' }); click(3, 3.5);
  const f = ed.doc.fixtures[0]; // north wall at y=4: bed centre ~ 4 - .1 - 1.05
  assert.ok(Math.abs(f.y - 2.85) < .06, 'y=' + f.y); assert.ok(Math.abs(Math.cos(f.rot) + 1) < 1e-3);
  const b = make(rect()); b.ed.setTool('fixture', { fixtureKind: 'bed-double' }); b.click(3, .6); assert.ok(Math.abs(Math.cos(b.ed.doc.fixtures[0].rot) - 1) < 1e-3);
});

test('select + drag moves an item, undo restores it; delete key removes the selection', () => {
  let d = rect(); d = applyCommand(d, { type: 'add-fixture', level: 'L1', kind: 'sofa-3', x: 3, y: 2, rot: 0 }).doc;
  const { ed, ev } = make(d); const a = ev(3, 2); ed.onDown(a); const b = ev(3.5, 2.5); ed.onMove(b); ed.onUp(b);
  const f = ed.doc.fixtures[0]; assert.ok(Math.abs(f.x - 3.5) < .06 && Math.abs(f.y - 2.5) < .06, JSON.stringify(f));
  ed.undo(); assert.equal(ed.doc.fixtures[0].x, 3);
  ed.select([ed.doc.fixtures[0].id]); ed.onKey({ key: 'Delete', preventDefault() {} }); assert.equal(ed.doc.fixtures.length, 0);
});

test('box selection (window vs crossing) and rotate / duplicate selection', () => {
  const { ed, ev } = make(sampleVilla()); ed.view = { cx: 6, cy: 7, scale: 30 };
  ed.setTool('select');
  const a = ev(-1, -1), b = ev(13, 15); ed.onDown(a); ed.onMove(b); ed.onUp(b); assert.ok(ed.selection.size > 40);
  ed.select([ed.doc.fixtures[0].id]); const rot0 = ed.doc.fixtures[0].rot || 0; ed.rotateSelection(Math.PI / 2); assert.ok(Math.abs(ed.doc.fixtures[0].rot - rot0 - Math.PI / 2) < 1e-9);
  const n = ed.doc.fixtures.length; ed.duplicateSelection(); assert.equal(ed.doc.fixtures.length, n + 1);
});

test('close-gaps repairs a nearly closed room', () => {
  let d = createDoc(); d = applyCommand(d, { type: 'add-walls', level: 'L1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: .15 }], t: .2 }).doc;
  const { ed } = make(d); assert.equal(ed.lv.rooms.length, 0); assert.ok(ed.stats().gaps >= 1);
  assert.ok(ed.closeGaps() >= 1); assert.equal(ed.lv.rooms.length, 1);
});
