// Automatic walkthrough of the studio's live 3D model: one turn around the building starting
// from the entrance side, a short approach to the door, then a look-around inside each room.
// The route comes from the drawing itself (its rooms and entry side); recording of the canvas
// is local to the browser (see tour-recorder.mjs) and nothing is uploaded.
//
//   const plan = planDrawTour(viewer.built.rooms.values(), { entry: doc.entry });
//   await runDrawTour({ viewer, plan, signal, onProgress, afterFrame });
export { recordingSupported, startRecording } from '../tour-recorder.mjs';

export const TOUR = Object.freeze({ orbitMs: 9000, approachMs: 1800, roomMs: 3200, maxRooms: 10, minRoomArea: 2.5, sweepDeg: 220 });
const DEG = Math.PI / 180;
const ease = t => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || lo));

/** Camera azimuth (degrees, three.js orbit convention) that faces the entrance side of the plot. */
export const ENTRY_AZIMUTH = Object.freeze({ s: 0, e: 90, n: 180, w: 270 });

// Which rooms to show first when the plan has more than the tour can visit.
const PRIORITY = Object.freeze({ entrance: 0, majlis: 1, living: 1, dining: 2, kitchen: 2, master: 3, bedroom: 3, office: 4, service: 5, other: 5, bath: 6, laundry: 6, storage: 7, garage: 7, corridor: 8, stairs: 9 });
const priorityOf = type => PRIORITY[type] ?? 5;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Pure plan: an orbit, an approach to the door, then up to `maxRooms` room stops.
 * Rooms are the built-scene rooms ({ key, name, type, area, levelIndex, inside, centroid, open }).
 * Stops are ordered level by level, each level as a walk from the previous stop (starting at the entrance hall).
 */
export function planDrawTour(rooms, options = {}) {
  const orbitMs = clamp(options.orbitMs ?? TOUR.orbitMs, 2000, 30000), approachMs = clamp(options.approachMs ?? TOUR.approachMs, 500, 8000);
  const roomMs = clamp(options.roomMs ?? TOUR.roomMs, 1000, 10000), sweepDeg = clamp(options.sweepDeg ?? TOUR.sweepDeg, 30, 330);
  const maxRooms = Math.max(0, Math.min(24, Math.floor(Number(options.maxRooms ?? TOUR.maxRooms)) || 0));
  const minArea = Number(options.minRoomArea ?? TOUR.minRoomArea);
  const usable = [...(rooms || [])].filter(r => r && r.key && !r.open && Number.isFinite(r.area) && r.area >= minArea && r.inside && r.centroid);
  const chosen = usable.sort((p, q) => priorityOf(p.type) - priorityOf(q.type) || q.area - p.area || String(p.key).localeCompare(String(q.key))).slice(0, maxRooms);
  // route: lowest level first; inside a level, nearest neighbour starting from the entrance hall (or the best-ranked room)
  const ordered = [];
  for (const level of [...new Set(chosen.map(r => r.levelIndex ?? 0))].sort((a, b) => a - b)) {
    const pool = chosen.filter(r => (r.levelIndex ?? 0) === level);
    let cur = pool.find(r => r.type === 'entrance') || pool[0] || null;
    while (pool.length && cur) {
      pool.splice(pool.indexOf(cur), 1); ordered.push(cur);
      const from = cur.inside; cur = pool.sort((a, b) => distance(from, a.inside) - distance(from, b.inside))[0] || null;
    }
  }
  const entryAzimuthDeg = ENTRY_AZIMUTH[options.entry] ?? 0;
  const segments = [{ kind: 'orbit', ms: orbitMs }, { kind: 'approach', ms: approachMs }];
  for (const r of ordered) {
    const dx = r.centroid.x - r.inside.x, dy = r.centroid.y - r.inside.y, base = Math.hypot(dx, dy) > .3 ? Math.atan2(dx, dy) / DEG : 0;
    segments.push({ kind: 'room', key: r.key, name: r.name, ms: roomMs, heading0: base - sweepDeg / 2, sweepDeg });
  }
  return { segments, totalMs: segments.reduce((s, x) => s + x.ms, 0), entryAzimuthDeg, rooms: ordered.length };
}

/**
 * Drive a DrawViewer through the plan. Resolves true when finished, false when aborted (signal, disposed
 * viewer or lost WebGL context). Each frame is drawn synchronously so a recorder can grab it right after.
 */
export function runDrawTour({ viewer, plan, signal, onProgress, raf = globalThis.requestAnimationFrame?.bind(globalThis), now = () => globalThis.performance.now(), afterFrame }) {
  return new Promise(resolve => {
    if (!viewer?.built || !plan?.segments?.length) { resolve(false); return; }
    let index = 0, started = 0, prepared = -1, base = null;
    const startTotal = now();
    const step = () => {
      if (signal?.aborted || viewer.disposed || viewer.lost) return resolve(false);
      const t = now();
      if (prepared !== index) { prepared = index; started = t; prepare(plan.segments[index]); }
      const seg = plan.segments[index], p = Math.min(1, (t - started) / seg.ms);
      apply(seg, p);
      viewer.renderNow(); afterFrame?.();
      onProgress?.({ index, count: plan.segments.length, segment: seg, elapsedMs: t - startTotal, totalMs: plan.totalMs });
      if (p >= 1) { index++; if (index >= plan.segments.length) return resolve(true); }
      raf(step);
    };
    function prepare(seg) {
      viewer.tween = null;
      if (seg.kind === 'orbit') {
        viewer.showLevel('all'); viewer.setMode('orbit', { animate: false }); viewer.frameBuilding();
        base = { el: 24, dist: viewer.orbit.dist, target: viewer.orbit.target.clone() };
      } else if (seg.kind === 'room') {
        seg.skipped = !viewer.built.rooms.has(seg.key);
        if (!seg.skipped) viewer.walkToRoom(seg.key, seg.heading0);
      }
    }
    function apply(seg, p) {
      if (seg.kind === 'orbit') {
        viewer.orbitTo({ azimuthDeg: plan.entryAzimuthDeg + 360 * ease(p), elevationDeg: base.el + 7 * Math.sin(Math.PI * p), distance: base.dist * (1 - .05 * Math.sin(Math.PI * p)), target: [base.target.x, base.target.y, base.target.z] });
      } else if (seg.kind === 'approach') {
        const e = ease(p);
        viewer.orbitTo({ azimuthDeg: plan.entryAzimuthDeg, elevationDeg: base.el + (9 - base.el) * e, distance: base.dist * (1 - .5 * e), target: [base.target.x, base.target.y + (1.2 - base.target.y) * e, base.target.z] });
      } else if (!seg.skipped) {
        viewer.walk.yaw = (seg.heading0 + seg.sweepDeg * ease(p)) * DEG; viewer.walk.pitch = -.04;
        viewer.applyPose(viewer.walkPose());
      }
    }
    raf(step);
  });
}

export default { TOUR, ENTRY_AZIMUTH, planDrawTour, runDrawTour };
