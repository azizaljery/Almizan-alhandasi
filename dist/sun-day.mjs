// Daily sun study: samples the same geometric solar calculation across one civil
// day and counts, per room, the time the sun is in front of the room's own windows.
// It is a facing test only. It does not model neighbours, trees, overhangs, glass
// transmission, heat or daylight levels, and it is not a compliance check.
import { calculateSiteSolar } from './site-solar.mjs';

const DAY_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const pad = n => String(n).padStart(2, '0');
export const MIN_ALTITUDE_DEG = 5;
export const FACING_COS = 0.2;

export function splitInstant(instant) {
  const m = DAY_RE.exec(String(instant ?? '').trim());
  if (!m) return null;
  return { date: m[1], minute: Number(m[2]) * 60 + Number(m[3]), offset: m[4] };
}
export function composeInstant(date, minute, offset) {
  const clamped = Math.max(0, Math.min(1439, Math.round(minute)));
  return `${date}T${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}:00${offset}`;
}
export const clock = minute => `${pad(Math.floor(minute / 60))}:${pad(Math.round(minute) % 60)}`;

/** Sun positions for the civil day of `instant`, every `stepMinutes`. */
export function sunDay({ latitude, longitude, northAngleDeg, instant, stepMinutes = 15 }) {
  const parts = splitInstant(instant);
  if (!parts) throw new Error('صيغة الوقت غير صالحة لدراسة اليوم.');
  if (!(stepMinutes >= 5 && stepMinutes <= 60)) throw new Error('خطوة الدراسة بين 5 و60 دقيقة.');
  const samples = [];
  for (let minute = 0; minute < 1440; minute += stepMinutes) {
    const sun = calculateSiteSolar({ latitude, longitude, northAngleDeg, instant: composeInstant(parts.date, minute, parts.offset), wallHeight: 3.2 });
    samples.push({ minute, clock: clock(minute), visible: sun.visible && sun.altitude >= MIN_ALTITUDE_DEG, above: sun.visible, altitude: sun.altitude, azimuth: sun.azimuth, plan: sun.plan });
  }
  const lit = samples.filter(s => s.above);
  return { date: parts.date, offset: parts.offset, stepMinutes, samples,
    sunrise: lit.length ? lit[0].minute : null, sunset: lit.length ? lit[lit.length - 1].minute + stepMinutes : null,
    peakAltitude: samples.reduce((m, s) => Math.max(m, s.altitude), -90) };
}

/** True compass bearing (0 = north, clockwise) of a plan-space direction. */
export function planBearing(px, py, northAngleDeg) {
  const a = northAngleDeg * Math.PI / 180;
  const north = px * Math.sin(a) + py * Math.cos(a), east = px * Math.cos(a) - py * Math.sin(a);
  return ((Math.atan2(east, north) * 180 / Math.PI) % 360 + 360) % 360;
}
const COMPASS = ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'];
export const compassName = bearing => COMPASS[Math.round(bearing / 45) % 8];

/** Outward plan normal of every window, derived from its wall and its room. */
export function windowFacings(model) {
  const walls = new Map((model.walls || []).map(w => [w.id, w])), rooms = new Map((model.rooms || []).map(r => [r.id, r]));
  const out = [];
  for (const o of model.openings || []) {
    if (o.type !== 'window') continue;
    const wall = walls.get(o.wallId), room = rooms.get(o.roomId);
    if (!wall || !room) continue;
    const horizontal = Math.abs(wall.y1 - wall.y2) < 1e-9, cx = room.x + room.w / 2, cy = room.y + room.h / 2;
    const n = horizontal ? { x: 0, y: wall.y1 >= cy ? 1 : -1 } : { x: wall.x1 >= cx ? 1 : -1, y: 0 };
    out.push({ openingId: o.id, roomId: o.roomId, wallId: wall.id, exterior: wall.type === 'ext', normal: n });
  }
  return out;
}

/** Direct-sun minutes on each room's windows for the sampled day. */
export function roomSunExposure(model, day, northAngleDeg) {
  const facings = windowFacings(model).filter(f => f.exterior);
  const byRoom = new Map();
  for (const f of facings) { if (!byRoom.has(f.roomId)) byRoom.set(f.roomId, []); byRoom.get(f.roomId).push(f); }
  const rows = [];
  for (const room of model.rooms || []) {
    const wins = byRoom.get(room.id);
    if (!wins) { rows.push({ roomId: room.id, name: room.name, type: room.type, windows: 0, minutes: 0, first: null, last: null, facings: [] }); continue; }
    let minutes = 0, first = null, last = null;
    for (const s of day.samples) {
      if (!s.visible) continue;
      const h = Math.hypot(s.plan.x, s.plan.y) || 1;
      if (wins.some(w => (w.normal.x * s.plan.x + w.normal.y * s.plan.y) / h > FACING_COS)) {
        minutes += day.stepMinutes; if (first === null) first = s.minute; last = s.minute + day.stepMinutes;
      }
    }
    const names = [...new Set(wins.map(w => compassName(planBearing(w.normal.x, w.normal.y, northAngleDeg))))];
    rows.push({ roomId: room.id, name: room.name, type: room.type, windows: wins.length, minutes, first, last, facings: names });
  }
  return rows;
}

export const SUN_DAY_LIMITS = 'عدّ اتجاهي فقط: يحسب الدقائق التي تكون فيها الشمس (ارتفاعها ' + MIN_ALTITUDE_DEG + '° فأكثر) أمام نوافذ الغرفة الخارجية. لا يشمل الجوار والأشجار والبروزات ولا نفاذية الزجاج ولا الحرارة أو مستوى الإضاءة، وليس اعتماد إنارة أو طاقة.';

export default { splitInstant, composeInstant, clock, sunDay, planBearing, compassName, windowFacings, roomSunExposure, SUN_DAY_LIMITS };
