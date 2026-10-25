/** Conservative 2D preliminary checks; not a vehicle swept-path, daylight, or safety certification. */
import { overlapsInterior, rect } from './geometry.mjs';
function pointInRect(p, r) {
  const a = rect(r);
  return p.x >= a.x1 && p.x <= a.x2 && p.y >= a.y1 && p.y <= a.y2;
}
function samplePath(points, step = 0.25) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const samples = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      samples.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return samples;
}
/**
 * Validate that a supplied candidate path has adequate clearance using a conservative
 * axis-aligned vehicle envelope. Caller must supply a physically drivable path.
 * Does NOT verify turning radius, steering, grades, curb crossing or swept path.
 */
export function parkingPathPrecheck({ stall, path, vehicleWidth = 2.0, vehicleLength = 4.8,
  sideMargin = 0.2, obstacles = [], driveableAreas = [], sampleStep = 0.25 }) {
  const failures = [];
  if (!stall || stall.width < vehicleWidth + 2 * sideMargin || stall.height < vehicleLength) {
    failures.push('STALL_TOO_SMALL');
  }
  if (!Array.isArray(path) || path.length < 2) failures.push('NO_APPROACH_PATH');
  const halfW = vehicleWidth / 2 + sideMargin;
  const halfL = vehicleLength / 2 + sideMargin;
  for (const p of samplePath(path, sampleStep)) {
    const envelope = {x:p.x-halfW,y:p.y-halfL,width:2*halfW,height:2*halfL};
    if (obstacles.some(o => overlapsInterior(envelope,o))) { failures.push('PATH_OBSTRUCTED'); break; }
    if (driveableAreas.length && !driveableAreas.some(a => {
      const A=rect(a), E=rect(envelope);
      return E.x1>=A.x1 && E.y1>=A.y1 && E.x2<=A.x2 && E.y2<=A.y2;
    })) { failures.push('PATH_OUTSIDE_DRIVEABLE_AREA'); break; }
  }
  if (path?.length && stall && !pointInRect(path.at(-1),stall)) failures.push('PATH_DOES_NOT_REACH_STALL');
  return { preliminaryPass: failures.length === 0, failures: [...new Set(failures)],
    requiresSweptPathSimulation: true };
}
/** A 2D privacy sightline test: segment between viewer and target window crosses a screen? */
function orientation(a,b,c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function segmentsIntersect(a,b,c,d) {
  const u=orientation(a,b,c), v=orientation(a,b,d), w=orientation(c,d,a), z=orientation(c,d,b);
  return u*v < 0 && w*z < 0;
}
export function sightlinePrecheck({ viewer, windowPoint, opaqueScreens = [] }) {
  if (![viewer?.x,viewer?.y,windowPoint?.x,windowPoint?.y].every(Number.isFinite)) {
    throw new Error('Invalid sightline');
  }
  const blocked = opaqueScreens.some(s => segmentsIntersect(viewer,windowPoint,s.a,s.b));
  return { visible: !blocked, preliminaryOnly: true,
    note: 'Requires eye height, sill height, window dimensions and 3D occlusion for final privacy review' };
}
