// Purpose-built drawings for the assistant tests. Everything is drawn with the same commands a user would use.
import { createDoc, applyCommand } from '../../dist/draw/doc.mjs';

export const run = (doc, ...commands) => commands.reduce((d, c) => applyCommand(d, c).doc, doc);
export const rect = (doc, x0, y0, x1, y1, t = 0.2) => run(doc, { type: 'add-rect', level: 'L1', a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, t });
export const wall = (doc, ax, ay, bx, by, t = 0.12) => run(doc, { type: 'add-wall', level: 'L1', a: { x: ax, y: ay }, b: { x: bx, y: by }, t });
export const label = (doc, x, y, name, roomType) => run(doc, { type: 'add-label', level: 'L1', name, roomType, seed: { x, y } });
export const fixture = (doc, kind, x, y, rot = 0) => run(doc, { type: 'add-fixture', level: 'L1', kind, x, y, rot });
/** Put an opening on the wall that passes through (x, y). */
export function open(doc, x, y, kind, extra = {}) {
  const w = doc.walls.find(w => Math.abs((w.b.x - w.a.x) * (y - w.a.y) - (w.b.y - w.a.y) * (x - w.a.x)) < 1e-6 && Math.min(w.a.x, w.b.x) - 1e-6 <= x && x <= Math.max(w.a.x, w.b.x) + 1e-6 && Math.min(w.a.y, w.b.y) - 1e-6 <= y && y <= Math.max(w.a.y, w.b.y) + 1e-6);
  if (!w) throw new Error(`no wall at ${x},${y}`);
  return run(doc, { type: 'add-opening', wall: w.id, kind, at: Math.hypot(x - w.a.x, y - w.a.y), ...extra });
}
const base = () => createDoc({ title: 'اختبار' });

/** A 5 x 4 room: door (entry) in the south wall, window in the north wall. */
export function oneRoom({ type = 'bedroom', name = 'غرفة', w = 5, l = 4, window = true, door = true, labelled = true } = {}) {
  let d = rect(base(), 0, 0, w, l);
  if (door) d = open(d, w / 2, 0, 'door', { entry: true });
  if (window) d = open(d, w / 2, l, 'window');
  if (labelled) d = label(d, w / 2, l / 2, name, type);
  return d;
}

/** A furnished 4 x 5 bedroom with a door and a window, good for placing more furniture. */
export function emptyBedroom() {
  let d = rect(base(), 0, 0, 4, 5);
  d = open(d, 1, 0, 'door', { entry: true });
  d = open(d, 3, 5, 'window2');
  d = label(d, 2, 2.5, 'غرفة نوم رئيسية', 'master');
  return d;
}

/** Two rooms side by side (majlis 5x4 | bedroom 4x4) sharing the wall x=5, no door between; entry door into the majlis. */
export function twoRooms({ doorBetween = false } = {}) {
  let d = rect(base(), 0, 0, 5, 4);
  d = rect(d, 5, 0, 9, 4);
  d = open(d, 2.5, 0, 'door', { entry: true });
  d = open(d, 2.5, 4, 'window');
  d = open(d, 7, 4, 'window');
  d = label(d, 2.5, 2, 'المجلس', 'majlis');
  d = label(d, 7, 2, 'غرفة نوم', 'bedroom');
  if (doorBetween) d = open(d, 5, 2, 'door');
  return d;
}

export const gapDoc = () => {
  let d = base();
  d = wall(d, 0, 0, 5, 0, 0.2); d = wall(d, 5, 0, 5, 4, 0.2); d = wall(d, 5, 4, 0, 4, 0.2); d = wall(d, 0, 4, 0, 0.2, 0.2); // last wall stops 20 cm short
  return label(d, 2.5, 2, 'غرفة', 'bedroom');
};
export const stubDoc = () => { let d = oneRoom({ type: 'living', name: 'صالة', w: 6, l: 5 }); return wall(d, 6, 2, 8, 2, 0.2); };
export const windowlessBedroom = () => oneRoom({ type: 'bedroom', name: 'غرفة نوم 1', window: false });
export const tinyBath = () => {
  let d = rect(base(), 0, 0, 1, 1.5);
  d = open(d, 0.5, 0, 'door', { entry: true });
  return label(d, 0.5, 0.75, 'حمام صغير', 'bath');
};
export const blockedSwing = () => {
  let d = oneRoom({ type: 'bedroom', name: 'غرفة', w: 4, l: 4, window: true, door: false });
  d = open(d, 2, 0, 'door', { entry: true, swing: 'in', hinge: 'left' });
  return fixture(d, 'wardrobe', 2, 0.8, 0); // 2.0 x 0.6 right in front of the door leaf
};
export const collidingDoors = () => {
  let d = oneRoom({ type: 'living', name: 'صالة', w: 4, l: 4, window: true, door: false });
  d = open(d, 0.9, 0, 'door', { entry: true, swing: 'in', hinge: 'left' });
  return open(d, 0, 0.9, 'door', { swing: 'in', hinge: 'left' });
};
export const doorIntoWall = () => { // a door whose leaf swings into the interior partition 60 cm away
  let d = rect(base(), 0, 0, 4, 4);
  d = wall(d, 0, 0.6, 4, 0.6, 0.12);
  d = open(d, 2, 0, 'door', { entry: true, swing: 'in', hinge: 'left' });
  return label(d, 2, 3, 'غرفة', 'bedroom');
};
export const overlappingFixtures = () => { let d = oneRoom({ type: 'living', name: 'صالة', w: 6, l: 5 }); d = fixture(d, 'sofa-3', 3, 3, 0); return fixture(d, 'sofa-2', 3.3, 3.1, 0); };
export const fixtureOutside = () => fixture(oneRoom({ type: 'living', name: 'صالة', w: 6, l: 5 }), 'sofa-3', 20, 20, 0);
export const narrowCorridor = () => {
  let d = rect(base(), 0, 0, 0.7, 5);
  d = open(d, 0, 2.5, 'door', { entry: true }); // the short wall is too narrow for a door leaf
  return label(d, 0.35, 2.5, 'ممر', 'corridor');
};
export const unlabelledKitchen = () => {
  let d = oneRoom({ type: 'kitchen', name: 'x', w: 3, l: 3, labelled: false });
  d = fixture(d, 'kitchen-run', 1.5, 0.5, 0);
  return fixture(d, 'fridge', 2.6, 2.6, 0);
};
export const orphanAndDuplicate = () => {
  let d = oneRoom({ type: 'bedroom', name: 'غرفة', w: 4, l: 4 });
  d = label(d, 2.2, 2.2, 'غرفة مكررة', 'bedroom'); // second label in the same room
  return label(d, 50, 50, 'تسمية ضائعة', 'office'); // inside no room
};
export const noEntry = () => oneRoom({ type: 'living', name: 'صالة', door: false });
export const unreachableRoom = () => twoRooms({ doorBetween: false });
export const thinExterior = () => {
  let d = rect(base(), 0, 0, 6, 4, 0.1);
  d = wall(d, 3, 0, 3, 4, 0.25);
  d = open(d, 1.5, 0, 'door', { entry: true });
  d = label(d, 1.5, 2, 'غرفة 1', 'bedroom'); d = label(d, 4.5, 2, 'غرفة 2', 'bedroom');
  return d;
};
export const openingNearEnd = () => { let d = oneRoom({ type: 'living', name: 'صالة', w: 6, l: 4, window: false }); return open(d, 1.0, 4, 'window'); }; // 1.4m window 0.3.. from the corner -> use explicit at below
export const stairCase = ({ w = 0.8, run = 2 } = {}) => run_(oneRoom({ type: 'entrance', name: 'مدخل', w: 5, l: 5 }), { type: 'add-stair', level: 'L1', kind: 'straight', x: 2.5, y: 2.5, rot: 0, w, run });
const run_ = (d, c) => run(d, c);
export const bathOffMajlis = () => {
  let d = rect(base(), 0, 0, 5, 4);
  d = wall(d, 3.5, 0, 3.5, 4, 0.12);
  d = open(d, 1.5, 0, 'door', { entry: true });
  d = open(d, 3.5, 2, 'door');
  d = open(d, 1.5, 4, 'window');
  d = label(d, 1.75, 2, 'مجلس', 'majlis'); d = label(d, 4.25, 2, 'حمام', 'bath');
  return d;
};
export const bedroomFacingEntry = () => {
  let d = rect(base(), 0, 0, 4, 8);
  d = wall(d, 0, 3, 4, 3, 0.12);
  d = open(d, 2, 0, 'door', { entry: true });
  d = open(d, 2, 3, 'door');
  d = open(d, 2, 8, 'window');
  d = label(d, 2, 1.5, 'مدخل', 'entrance'); d = label(d, 2, 5.5, 'غرفة نوم', 'bedroom');
  return d;
};
/** Doc with a plain room whose label was never placed in it (no labels at all) and rotated north. */
export const rotatedNorth = deg => run(oneRoom({ type: 'bedroom', name: 'غرفة', window: true }), { type: 'set-plot', north: deg });
