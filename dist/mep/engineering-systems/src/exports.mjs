import { copy, fail } from './core.mjs';
import { validateProject } from './model.mjs';
import { verifyBinding, verifyResult } from './engine.mjs';
import { bounds, interiorPoint } from './geometry.mjs';
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const color = layer => layer.startsWith('E-') ? '#ba7419' : layer.startsWith('M-') ? '#167e87' : layer.startsWith('P-') ? '#286ec4' : layer.startsWith('F-') ? '#c84b55' : layer.startsWith('S-') ? '#8259a8' : '#557346';
const chosen = (result, options) => result.disciplines.filter(d => !options.discipline || d.id === options.discipline);
const layerFilter = (x, options) => !options.layer || x.layer === options.layer;
const onLevel = (x, levelId) => x.levelId === levelId || x.levelIds?.includes(levelId);
function svg(project, result, options) {
  const levelId = options.levelId || project.architecture.levels[0].id;
  if (!project.architecture.levels.some(l => l.id === levelId)) fail('UNKNOWN_LEVEL', levelId);
  const rooms = project.architecture.rooms.filter(r => r.levelId === levelId), walls = project.architecture.walls.filter(w => w.levelId === levelId);
  const coords = [...rooms.flatMap(r => r.polygon), ...walls.flatMap(w => [w.a, w.b])];
  const ds = chosen(result, options), devices = ds.flatMap(d => d.devices).filter(d => d.levelId === levelId && layerFilter(d, options)), routes = ds.flatMap(d => d.routes).filter(r => onLevel(r, levelId) && layerFilter(r, options));
  coords.push(...devices.map(d => d.position), ...routes.flatMap(r => r.points));
  if (!coords.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220" data-input-hash="${result.inputHash}"><rect width="800" height="220" fill="#faf9f5"/><text x="760" y="70" text-anchor="start" direction="rtl" font-family="DejaVu Sans,Arial" font-size="22">لا توجد هندسة أو أجهزة موثقة لهذا الدور</text><text x="40" y="120" font-family="Arial" font-size="16">${escape(levelId)} — NO_LEVEL_GEOMETRY — PRELIMINARY</text></svg>`;
  const bb = bounds(coords), scale = 850 / Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, 1), pad = 75, top = 110;
  const width = Math.ceil((bb.maxX - bb.minX) * scale + pad * 2), planHeight = (bb.maxY - bb.minY) * scale, height = Math.ceil(planHeight + top + 180);
  const X = x => pad + (x - bb.minX) * scale, Y = y => top + (bb.maxY - y) * scale;
  const pts = a => a.map(p => `${X(p.x).toFixed(3)},${Y(p.y).toFixed(3)}`).join(' ');
  const pieces = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-input-hash="${result.inputHash}"><title>${escape(project.projectId)} ${escape(levelId)} — PRELIMINARY</title><rect width="100%" height="100%" fill="#faf9f5"/><g font-family="DejaVu Sans,Arial,sans-serif"><text x="${width - 35}" y="38" text-anchor="start" font-size="23" fill="#1c3540" direction="rtl">الميزان الهندسي — مخططات الأنظمة</text><text x="35" y="69" font-size="13" fill="#546872">${escape(project.projectId)} / ${escape(levelId)} / ${escape(options.discipline || 'combined')}</text><text x="${width - 35}" y="68" text-anchor="start" direction="rtl" font-size="13" fill="#b24a31">تصور أولي — يحتاج مراجعة هندسية</text>`];
  for (const r of rooms) {
    const rings = [r.polygon, ...r.holes], d = rings.map(poly => 'M' + poly.map(p => `${X(p.x)},${Y(p.y)}`).join(' L') + ' Z').join(' ');
    pieces.push(`<path d="${d}" fill="#ecefea" fill-rule="evenodd" stroke="#cbd3cc" stroke-width=".6"/>`);
    const p = interiorPoint(r); pieces.push(`<text x="${X(p.x)}" y="${Y(p.y) + 18}" text-anchor="middle" direction="rtl" font-size="11" fill="#68736c">${escape(r.name || r.id)}</text>`);
  }
  for (const w of walls) pieces.push(`<line x1="${X(w.a.x)}" y1="${Y(w.a.y)}" x2="${X(w.b.x)}" y2="${Y(w.b.y)}" stroke="#62706a" stroke-width="${Math.max(1.2, w.thicknessM * scale)}"/>`);
  for (const o of project.architecture.openings.filter(o => o.levelId === levelId)) {
    const w = walls.find(w => w.id === o.wallId), len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len;
    const a = { x: w.a.x + (o.atM - o.widthM / 2) * ux, y: w.a.y + (o.atM - o.widthM / 2) * uy }, b = { x: a.x + o.widthM * ux, y: a.y + o.widthM * uy };
    pieces.push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#faf9f5" stroke-width="${w.thicknessM * scale + 1}"/><line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#8aa49e" stroke-width="1"/>`);
  }
  for (const r of routes) if (r.points.length) pieces.push(`<polyline points="${pts(r.points)}" fill="none" stroke="${r.status === 'BLOCKED' ? '#dc2626' : color(r.layer)}" stroke-width="${Math.max(1.7, Math.min(6, r.widthM * scale))}" stroke-dasharray="${r.status === 'BLOCKED' ? '5 4' : 'none'}"><title>${escape(r.id)} | ${escape(r.status)} | z=${r.points.map(p => p.z.toFixed(3)).join(',')}</title></polyline>`);
  for (const d of devices) {
    const x = X(d.position.x), y = Y(d.position.y), c = color(d.layer);
    if (d.kind === 'LUMINAIRE') pieces.push(`<circle cx="${x}" cy="${y}" r="5" fill="#fff8df" stroke="${c}" stroke-width="1.4"/><path d="M${x - 3},${y - 3}l6,6m-6,0l6,-6" stroke="${c}"/>`);
    else pieces.push(`<rect x="${x - 4.5}" y="${y - 4.5}" width="9" height="9" rx="1" fill="white" stroke="${c}" stroke-width="1.7"/>`);
    pieces.push(`<text x="${x + 7}" y="${y - 6}" font-size="7.5" fill="${c}">${escape(d.id)}</text>`);
  }
  const bottom = top + planHeight + 38, layers = [...new Set([...devices, ...routes].map(x => x.layer))];
  layers.forEach((layer, i) => { const x = 35 + i % 4 * (width - 70) / 4, y = bottom + Math.floor(i / 4) * 18; pieces.push(`<line x1="${x}" y1="${y - 4}" x2="${x + 17}" y2="${y - 4}" stroke="${color(layer)}" stroke-width="3"/><text x="${x + 22}" y="${y}" font-size="10" fill="#42565a">${escape(layer)}</text>`); });
  pieces.push(`<text x="35" y="${height - 48}" font-size="10" fill="#647476">Units: m | X east / Y north | z in JSON/DXF | ${devices.length} devices / ${routes.length} routes</text><text x="35" y="${height - 29}" font-size="9" fill="#8a5550">${result.issues.filter(i => i.severity === 'error').length} errors | ${result.issues.filter(i => i.severity === 'pending').length} review/input items | code compliance: NOT_EVALUATED</text><text x="35" y="${height - 13}" font-size="7.5" fill="#88918b">Input SHA-256: ${result.inputHash}</text></g></svg>`);
  return pieces.join('\n');
}
export function csv(columns, rows) {
  const cell = v => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (typeof v === 'string' && /^[=+@\-\t\r]/.test(v)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return '\ufeff' + [columns.map(cell).join(','), ...rows.map(r => columns.map(k => cell(r[k])).join(','))].join('\r\n') + '\r\n';
}
const dxfText = value => String(value).replace(/[\r\n\x00-\x1f]/g, ' ').replace(/[^\x20-\x7e]/g, c => '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
function dxf(project, result, options) {
  const lines = [], add = (...pairs) => lines.push(...pairs.map(String));
  const ds = chosen(result, options), rooms = project.architecture.rooms.filter(r => !options.levelId || r.levelId === options.levelId), walls = project.architecture.walls.filter(w => !options.levelId || w.levelId === options.levelId);
  const devices = ds.flatMap(d => d.devices).filter(d => (!options.levelId || d.levelId === options.levelId) && layerFilter(d, options)), routes = ds.flatMap(d => d.routes).filter(r => (!options.levelId || onLevel(r, options.levelId)) && layerFilter(r, options));
  const layerNames = ['A-WALL', 'A-ROOM', 'A-TEXT', 'MEP-NOTES', ...new Set([...devices, ...routes].map(x => x.layer)), 'MEP-BLOCKED'];
  add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1027', 9, '$INSUNITS', 70, 6, 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC', 0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 5, '10', 70, layerNames.length);
  for (const name of layerNames) add(0, 'LAYER', 2, name, 70, 0, 62, name.startsWith('A-') ? 8 : name.startsWith('P-') ? 5 : name.startsWith('M-') ? 4 : name.startsWith('F-') ? 1 : 2, 6, 'CONTINUOUS');
  add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const line = (a, b, layer) => add(0, 'LINE', 8, layer, 10, a.x, 20, a.y, 30, a.z, 11, b.x, 21, b.y, 31, b.z);
  const text = (p, value, layer, h = .12) => add(0, 'TEXT', 8, layer, 10, p.x, 20, p.y, 30, p.z, 40, h, 1, dxfText(value));
  const elev = id => project.architecture.levels.find(l => l.id === id).elevationM;
  for (const w of walls) {
    const length = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), z = elev(w.levelId), on = at => ({ x: w.a.x + (w.b.x - w.a.x) * at / length, y: w.a.y + (w.b.y - w.a.y) * at / length, z });
    const ops = project.architecture.openings.filter(o => o.wallId === w.id).sort((a, b) => a.atM - b.atM); let start = 0;
    for (const o of ops) { const end = o.atM - o.widthM / 2; if (end > start) line(on(start), on(end), 'A-WALL'); start = Math.max(start, o.atM + o.widthM / 2); }
    if (start < length) line(on(start), on(length), 'A-WALL');
  }
  for (const r of rooms) { const z = elev(r.levelId); for (const ring of [r.polygon, ...r.holes]) ring.forEach((p, i) => line({ ...p, z }, { ...ring[(i + 1) % ring.length], z }, 'A-ROOM')); text({ ...interiorPoint(r), z }, `${r.id} ${r.name || ''}`, 'A-TEXT'); }
  for (const r of routes) for (let i = 1; i < r.points.length; i++) line(r.points[i - 1], r.points[i], r.status === 'BLOCKED' ? 'MEP-BLOCKED' : r.layer);
  for (const d of devices) { add(0, 'CIRCLE', 8, d.layer, 10, d.position.x, 20, d.position.y, 30, d.position.z, 40, .07); text({ ...d.position, x: d.position.x + .1 }, d.id, d.layer, .08); }
  text({ x: 0, y: -1, z: 0 }, 'MIZAN PRELIMINARY - NOT FOR CONSTRUCTION - ' + result.inputHash.slice(0, 16), 'MEP-NOTES', .2);
  add(0, 'ENDSEC', 0, 'EOF'); return lines.join('\n') + '\n';
}
async function checked(raw, result) { const p = validateProject(raw); if (!await verifyBinding(result, p)) fail('STALE_RESULT', 'result.inputHash'); if (!await verifyResult(result)) fail('RESULT_INTEGRITY', 'result.resultHash'); return p; }
export async function toSvg(raw, result, options = {}) { return svg(await checked(raw, result), result, options); }
export async function toDxf(raw, result, options = {}) { return dxf(await checked(raw, result), result, options); }
export async function exportArtifacts(raw, result) {
  const project = await checked(raw, result), artifacts = new Map();
  artifacts.set('engineering-result.json', JSON.stringify(result, null, 2));
  artifacts.set('engineering-input.json', JSON.stringify(project, null, 2));
  const names = new Set();
  for (const lv of project.architecture.levels) {
    const name = lv.id.replace(/[^A-Za-z0-9_-]/g, '_'); if (names.has(name)) fail('EXPORT_FILENAME_COLLISION', lv.id); names.add(name);
    artifacts.set(`drawings/${name}-combined.svg`, svg(project, result, { levelId: lv.id }));
    artifacts.set(`drawings/${name}-combined.dxf`, dxf(project, result, { levelId: lv.id }));
    for (const d of result.disciplines) artifacts.set(`drawings/${name}-${d.id}.svg`, svg(project, result, { levelId: lv.id, discipline: d.id }));
  }
  for (const d of result.disciplines) for (const s of d.schedules) {
    if (!/^[A-Za-z0-9_-]+$/.test(s.id)) fail('UNSAFE_SCHEDULE_FILENAME', s.id);
    artifacts.set(`schedules/${s.id}.csv`, csv(s.columns, s.rows));
  }
  artifacts.set('schedules/quantities.csv', csv(['key', 'discipline', 'kind', 'layer', 'unit', 'quantity', 'rate', 'amount'], result.quantities.rows));
  artifacts.set('issues.json', JSON.stringify(result.issues, null, 2));
  artifacts.set('drawing-register.json', JSON.stringify({ inputHash: result.inputHash, status: result.status, constructionApproved: false, drawings: [...artifacts.keys()].filter(k => k.startsWith('drawings/')), omittedDisciplines: result.omittedDisciplines }, null, 2));
  return artifacts;
}
