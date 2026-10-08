export const GEOMETRY_POLICY_VERSION = 'mizan-novelty-v2';
export const TRUTH_GEOMETRY_POLICY_VERSION = 'mizan-engineering-truth-v1';

const roundMm = value => {
  if (!Number.isFinite(value)) throw new Error('Geometry contains a non-finite coordinate.');
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort(compare).map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value === undefined ? null : value);
};
const sorted = values => values.sort((a, b) => compare(stable(a), stable(b)));
const directions = ['n', 'e', 's', 'w'];
const rotateDirection = (side, turns) => directions[(directions.indexOf(side) + turns) % 4];
const reflectDirection = side => ({ n: 'n', e: 'w', s: 's', w: 'e' })[side];

function rotateBox(box, width, length, turns) {
  const { x, y, w, h } = box;
  if (turns === 0) return { ...box, x, y, w, h };
  if (turns === 1) return { ...box, x: length - (y + h), y: x, w: h, h: w };
  if (turns === 2) return { ...box, x: width - (x + w), y: length - (y + h), w, h };
  return { ...box, x: y, y: width - (x + w), w: h, h: w };
}

function transformBox(box, width, length, turns, mirrored) {
  const reflected = mirrored ? { ...box, x: width - (box.x + box.w) } : box;
  return rotateBox(reflected, width, length, turns);
}

function transformPoint(point, width, length, turns, mirrored) {
  let { x, y } = point;
  if (mirrored) x = width - x;
  if (turns === 1) return { x: length - y, y: x };
  if (turns === 2) return { x: width - x, y: length - y };
  if (turns === 3) return { x: y, y: width - x };
  return { x, y };
}

function canonicalRing(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const ring = points.map(p => [roundMm(p.x), roundMm(p.y)]);
  if (ring.length > 3 && stable(ring[0]) === stable(ring[ring.length - 1])) ring.pop();
  const candidates = [];
  for (const direction of [ring, [...ring].reverse()]) {
    for (let start = 0; start < direction.length; start++) {
      candidates.push([...direction.slice(start), ...direction.slice(0, start)]);
    }
  }
  return candidates.sort((a, b) => compare(stable(a), stable(b)))[0];
}

function makeVariant(model, turns, mirrored) {
  const plot = model.plot, width = plot.width, length = plot.length;
  const reflectedEntry = mirrored ? reflectDirection(plot.entry) : plot.entry;
  const rotatedPlot = {
    width: turns % 2 ? length : width,
    length: turns % 2 ? width : length,
    entry: rotateDirection(reflectedEntry, turns),
    streets: directions.map(side => [side, plot.streets[rotateDirection(side, (4 - turns) % 4)] === true]).sort((a, b) => compare(a[0], b[0])),
    setbacks: directions.map(side => {
      const rotatedSide = rotateDirection(side, (4 - turns) % 4);
      const sourceSide = mirrored ? reflectDirection(rotatedSide) : rotatedSide;
      return [side, roundMm(plot.streets[sourceSide] ? plot.streetSetback : plot.neighborSetback)];
    }).sort((a, b) => compare(a[0], b[0])),
  };
  if (mirrored) {
    rotatedPlot.streets = directions.map(side => {
      const rotatedSide = rotateDirection(side, (4 - turns) % 4);
      const sourceSide = reflectDirection(rotatedSide);
      return [side, plot.streets[sourceSide] === true];
    }).sort((a, b) => compare(a[0], b[0]));
  }
  const rotate = box => transformBox(box, width, length, turns, mirrored);
  const point = p => transformPoint(p, width, length, turns, mirrored);
  const buildingBox = model.building ? rotate(model.building) : { x: 0, y: 0, w: 0, h: 0 };
  const origin = { x: buildingBox.x, y: buildingBox.y };
  const roomsById = new Map((model.rooms || []).map(room => [room.id, room]));
  const typeById = new Map((model.program || []).map(room => [room.id, room.type]));
  const corridorsById = new Map((model.corridors || []).map(corridor => [corridor.id, corridor]));
  const box = (item, kind) => {
    const p = rotate(item);
    return [kind, roundMm(p.x - origin.x), roundMm(p.y - origin.y), roundMm(p.w), roundMm(p.h)];
  };
  const polygon = points => {
    if (!Array.isArray(points)) return null;
    return canonicalRing(points.map(p => {
      const q = point(p);
      return { x: q.x - origin.x, y: q.y - origin.y };
    }));
  };
  const roomRows = sorted((model.rooms || []).map(room => [typeById.get(room.id) || 'unknown', ...box(room, 'room').slice(1)]));
  const corridorRows = sorted((model.corridors || []).map(item => box(item, 'corridor')));
  const reserveRows = sorted((model.reserves || []).map(item => box(item, 'reserve')));
  const courtyardRows = sorted((model.courtyards || []).map(item => [
    ...box(item, 'courtyard').slice(1), item.roofPolicy || null, item.roofable === true,
  ]));
  const building = model.building ? box(model.building, 'building') : null;
  const buildingFootprint = polygon(model.buildingFootprint);

  const roomNode = id => {
    const room = roomsById.get(id);
    if (!room) return null;
    return [typeById.get(id) || 'unknown', ...box(room, 'room').slice(1)];
  };
  const corridorNode = id => {
    const corridor = corridorsById.get(id);
    if (!corridor) return null;
    return box(corridor, 'corridor');
  };
  const topology = [];
  for (const room of model.rooms || []) {
    if (room.corridorId && corridorNode(room.corridorId)) topology.push(['room-corridor', roomNode(room.id), corridorNode(room.corridorId)]);
  }
  for (const link of model.links || []) {
    if (!Array.isArray(link) || link.length !== 2) continue;
    const endpoints = link.map(corridorNode);
    if (endpoints.every(Boolean)) topology.push(['corridor-link', ...sorted(endpoints)]);
  }
  for (const opening of model.openings || []) {
    const wall = (model.walls || []).find(item => item.id === opening.wallId);
    if (!wall) continue;
    const at = point({ x: wall.x1 + (wall.x2 - wall.x1) * opening.pos, y: wall.y1 + (wall.y2 - wall.y1) * opening.pos });
    const connections = (opening.connects || []).map(id => roomNode(id) || corridorNode(id) || ['unknown']).sort((a, b) => compare(stable(a), stable(b)));
    topology.push(['opening', opening.type || '', roundMm(opening.w || 0), roundMm(opening.h || 0), roundMm(opening.sill || 0), roundMm(at.x - origin.x), roundMm(at.y - origin.y), connections]);
  }
  const wallRows = sorted((model.walls || []).map(wall => {
    const a = point({ x: wall.x1, y: wall.y1 }), b = point({ x: wall.x2, y: wall.y2 });
    const ends = sorted([[roundMm(a.x - origin.x), roundMm(a.y - origin.y)], [roundMm(b.x - origin.x), roundMm(b.y - origin.y)]]);
    return [wall.type || '', roundMm(wall.t || 0), roundMm(wall.h || 0), ends];
  }));
  const massingRows = sorted((model.massingParts || []).map(part => [
    part.component || '', ...box(part, 'massing').slice(1),
  ]));

  return {
    policy: GEOMETRY_POLICY_VERSION,
    // Novelty canonicalization treats the full plot and design as one dihedral orbit.
    // Exact placement and unreflected plot context remain separately hashed as engineering truth.
    plot: rotatedPlot,
    building,
    buildingFootprint,
    rooms: roomRows,
    corridors: corridorRows,
    courtyards: courtyardRows,
    reserves: reserveRows,
    walls: wallRows,
    massing: massingRows,
    topology: sorted(topology),
  };
}

export function canonicalGeometry(model) {
  if (!model?.plot || !Array.isArray(model.rooms) || !Array.isArray(model.program)) throw new Error('A generated model is required to archive its geometry.');
  const variants = [];
  for (const mirrored of [false, true]) for (let turns = 0; turns < 4; turns++) variants.push(makeVariant(model, turns, mirrored));
  return variants.sort((a, b) => compare(stable(a), stable(b)))[0];
}

function surveyTruth(survey) {
  if (!survey) return null;
  return {
    geometry: survey.geometry || null,
    references: survey.references || [],
    engineLink: survey.engineLink || 'none',
    binding: survey.binding || null,
  };
}

export function exactEngineeringGeometry(model, { landSurvey = null, modelLandSurvey = null } = {}) {
  return {
    policy: TRUTH_GEOMETRY_POLICY_VERSION,
    engineVersion: model.engineVersion || '',
    plot: model.plot,
    footprint: model.footprint || null,
    building: model.building || null,
    buildingFootprint: model.buildingFootprint || null,
    boundingBox: model.boundingBox || null,
    program: model.program,
    rooms: model.rooms,
    corridors: model.corridors || [],
    courtyards: model.courtyards || [],
    reserves: model.reserves || [],
    walls: model.walls || [],
    openings: model.openings || [],
    links: model.links || [],
    massingParts: model.massingParts || [],
    drawnFloors: model.drawnFloors || [],
    landSurvey: surveyTruth(landSurvey),
    modelLandSurvey: surveyTruth(modelLandSurvey),
  };
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function geometryFingerprint(model, surveyContext = {}) {
  const geometry = canonicalGeometry(model);
  const canonicalJson = stable(geometry);
  const truthJson = stable(exactEngineeringGeometry(model, surveyContext));
  const hash = await digest(`${GEOMETRY_POLICY_VERSION}\n${canonicalJson}`);
  const exactGeometryHash = await digest(`${TRUTH_GEOMETRY_POLICY_VERSION}\n${truthJson}`);
  return { geometry, canonicalJson, hash, noveltyGeometry: geometry, noveltyJson: canonicalJson, noveltyHash: hash, truthJson, exactGeometryHash };
}

export function topologyFor(model) {
  const typeById = new Map((model.program || []).map(room => [room.id, room.type]));
  const roomById = new Map((model.rooms || []).map(room => [room.id, room]));
  const corridorById = new Map((model.corridors || []).map(corridor => [corridor.id, corridor]));
  const roomKey = id => { const r = roomById.get(id); return r ? `${typeById.get(id) || 'unknown'}@${[r.x, r.y, r.w, r.h].map(roundMm).join(',')}` : null; };
  const corridorKey = id => { const c = corridorById.get(id); return c ? `corridor@${[c.x, c.y, c.w, c.h].map(roundMm).join(',')}` : null; };
  return {
    rooms: (model.rooms || []).map(room => ({ type: typeById.get(room.id) || 'unknown', corridor: room.corridorId ? corridorKey(room.corridorId) : null })).sort((a, b) => compare(stable(a), stable(b))),
    corridors: (model.links || []).map(([a, b]) => [corridorKey(a), corridorKey(b)].filter(Boolean).sort()).sort((a, b) => compare(stable(a), stable(b))),
    openings: (model.openings || []).map(opening => ({ type: opening.type, connects: (opening.connects || []).map(id => roomKey(id) || corridorKey(id) || 'unknown').sort() })).sort((a, b) => compare(stable(a), stable(b))),
  };
}
