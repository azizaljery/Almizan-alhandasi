/** Geometry helpers use metres, axis-aligned plan coordinates. Adapter must map actual CAD geometry. */
const EPS = 1e-7;
export function finitePositive(value, label = 'value') {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive finite`);
  return value;
}
export function clearDimension(actual, target, tolerance = 0.05) {
  finitePositive(actual, 'actual'); finitePositive(target, 'target');
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Invalid tolerance');
  return { valid: Math.abs(actual - target) <= tolerance + EPS, deviation: actual - target,
    actual, target, tolerance };
}
/** Each wall side contributes the actual inward offset, not a fixed 0.20m assumption. */
export function grossSpanFromClear(clear, startWallOffset, endWallOffset) {
  finitePositive(clear, 'clear');
  if (![startWallOffset, endWallOffset].every(x => Number.isFinite(x) && x >= 0)) throw new Error('Invalid wall offsets');
  return clear + startWallOffset + endWallOffset;
}
export function clearSpanFromGross(gross, startWallOffset, endWallOffset) {
  finitePositive(gross, 'gross');
  const net = gross - startWallOffset - endWallOffset;
  return net > 0 ? net : 0;
}
export function snapMetres(value, increment = 0.01) {
  finitePositive(increment, 'increment');
  if (!Number.isFinite(value)) throw new Error('Invalid value');
  return Math.round(value / increment) * increment;
}
/** Reserve explicit dimensions before flexible allocation; infeasibility here is LOCAL, not proof entire brief is impossible. */
export function allocateSpans(total, parts, increment = 0.01) {
  finitePositive(total, 'total');
  const assigned = parts.map(p => {
    const min = finitePositive(p.min, 'minimum span');
    const fixed = p.fixed == null ? null : finitePositive(p.fixed, 'fixed span');
    if (fixed !== null && fixed + EPS < min) throw new Error(`Fixed span below minimum: ${p.id}`);
    return { ...p, assigned: fixed ?? min, fixed };
  });
  const base = assigned.reduce((s, p) => s + p.assigned, 0);
  if (base > total + EPS) return { ok: false, reason: 'LOCAL_SPAN_OVERFLOW', required: base, available: total };
  const free = assigned.filter(p => p.fixed === null);
  let remainder = total - base;
  if (!free.length) {
    if (Math.abs(remainder) > increment / 2) return { ok: false, reason: 'UNALLOCATED_SPAN', remainder };
    return { ok: true, parts: assigned };
  }
  const weightSum = free.reduce((s, p) => s + (p.weight ?? 1), 0);
  if (weightSum <= 0) throw new Error('Invalid flexible weights');
  for (let i = 0; i < free.length; i++) {
    const part = free[i];
    const addition = i === free.length - 1 ? remainder : snapMetres(remainder * (part.weight ?? 1) /
      free.slice(i).reduce((s, x) => s + (x.weight ?? 1), 0), increment);
    part.assigned += addition;
    remainder -= addition;
  }
  return { ok: true, parts: assigned };
}
export function rect(room) {
  if (![room.x, room.y, room.width, room.height].every(Number.isFinite) || room.width <= 0 || room.height <= 0) {
    throw new Error(`Invalid rectangle ${room.id}`);
  }
  return { x1: room.x, y1: room.y, x2: room.x + room.width, y2: room.y + room.height };
}
/** Return common wall segment, not just 'touches' in a coarse grid. */
export function commonWall(a, b) {
  const A = rect(a), B = rect(b);
  const y1 = Math.max(A.y1, B.y1), y2 = Math.min(A.y2, B.y2);
  const x1 = Math.max(A.x1, B.x1), x2 = Math.min(A.x2, B.x2);
  if (Math.abs(A.x2 - B.x1) < EPS || Math.abs(B.x2 - A.x1) < EPS) {
    return y2 - y1 > EPS ? { axis: 'vertical', position: Math.abs(A.x2 - B.x1) < EPS ? A.x2 : B.x2, from: y1, to: y2, length: y2 - y1 } : null;
  }
  if (Math.abs(A.y2 - B.y1) < EPS || Math.abs(B.y2 - A.y1) < EPS) {
    return x2 - x1 > EPS ? { axis: 'horizontal', position: Math.abs(A.y2 - B.y1) < EPS ? A.y2 : B.y2, from: x1, to: x2, length: x2 - x1 } : null;
  }
  return null;
}
/** Door segment must lie on a real shared wall with side clearance. */
export function realDoorConnects(a, b, door, minDoorWidth = 0.8, endClearance = 0.1) {
  const wall = commonWall(a, b);
  if (!wall || !door || door.kind === 'exterior') return false;
  const width = door.width;
  if (!Number.isFinite(width) || width + EPS < minDoorWidth) return false;
  if (!Number.isFinite(door.offset) || door.offset < -EPS) return false;
  if (wall.length + EPS < width + 2 * endClearance) return false;
  return door.offset + EPS >= endClearance && door.offset + width <= wall.length - endClearance + EPS;
}
export function overlapsInterior(a, b) {
  const A = rect(a), B = rect(b);
  return Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1) > EPS &&
    Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1) > EPS;
}
/** Diagnostic support check only; it is NOT a structural approval. */
export function unsupportedUpperWallSegments(upperWalls, groundSupportLines, tolerance = 0.05) {
  return upperWalls.filter(w => !groundSupportLines.some(s =>
    w.axis === s.axis && Math.abs(w.position - s.position) <= tolerance &&
    s.from <= w.from + tolerance && s.to >= w.to - tolerance));
}
export function isSleepKey(key) { return /^S\d+$/.test(key); } // ST (stair) is excluded
