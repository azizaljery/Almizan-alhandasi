const str = { type: 'string' }, point = { type: 'object', additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] };
export const MOOD_SCHEMA = { type: 'object', additionalProperties: false, properties: { summary: str, palette: { type: 'array', items: str }, materials: { type: 'array', items: str }, designDirections: { type: 'array', items: str } }, required: ['summary', 'palette', 'materials', 'designDirections'] };
export const PLAN_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  walls: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { a: point, b: point }, required: ['a', 'b'] } },
  openings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { wallIndex: { type: 'integer' }, kind: { type: 'string', enum: ['door', 'window'] }, position: { type: 'number' }, widthFraction: { type: 'number' } }, required: ['wallIndex', 'kind', 'position', 'widthFraction'] } },
  rooms: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: str, type: { type: 'string', enum: ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'bath', 'corridor', 'storage', 'other'] }, center: point }, required: ['name', 'type', 'center'] } },
  notes: { type: 'array', items: str },
}, required: ['walls', 'openings', 'rooms', 'notes'] };
const texts = (x, n = 12) => { if (!Array.isArray(x) || x.length > n || x.some(v => typeof v !== 'string' || v.length > 1000)) throw Error('invalid_vision_result'); return x; };
const fraction = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
export function validateVisionResult(mode, r, { allowEmpty = false } = {}) {
  if (!r || typeof r !== 'object') throw Error('invalid_vision_result');
  if (mode === 'mood') {
    if (typeof r.summary !== 'string' || !r.summary.trim() || r.summary.length > 4000 || !Array.isArray(r.palette) || !r.palette.length || r.palette.length > 12 || r.palette.some(c => !/^#[0-9a-f]{6}$/i.test(c))) throw Error('invalid_vision_result');
    return { summary: r.summary, palette: r.palette, materials: texts(r.materials), designDirections: texts(r.designDirections) };
  }
  if (!Array.isArray(r.walls) || (!allowEmpty && !r.walls.length) || r.walls.length > 500 || r.walls.some(w => ![w.a, w.b].every(p => p && fraction(p.x) && fraction(p.y)) || Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y) < .001)) throw Error('invalid_vision_result');
  if (!Array.isArray(r.openings) || r.openings.length > 500 || r.openings.some(o => !Number.isInteger(o.wallIndex) || o.wallIndex < 0 || o.wallIndex >= r.walls.length || !['door', 'window'].includes(o.kind) || !fraction(o.position) || !fraction(o.widthFraction) || o.widthFraction <= 0)) throw Error('invalid_vision_result');
  if (!Array.isArray(r.rooms) || r.rooms.length > 100 || r.rooms.some(p => !p.center || !fraction(p.center.x) || !fraction(p.center.y) || typeof p.name !== 'string' || p.name.length > 100 || !PLAN_SCHEMA.properties.rooms.items.properties.type.enum.includes(p.type))) throw Error('invalid_vision_result');
  return { walls: r.walls.map(w => ({ a: { x: w.a.x, y: w.a.y }, b: { x: w.b.x, y: w.b.y } })), openings: r.openings.map(o => ({ wallIndex: o.wallIndex, kind: o.kind, position: o.position, widthFraction: o.widthFraction })), rooms: r.rooms.map(p => ({ name: p.name, type: p.type, center: { x: p.center.x, y: p.center.y } })), notes: texts(r.notes, 20) };
}
