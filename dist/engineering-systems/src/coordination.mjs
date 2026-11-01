import { issue } from './core.mjs';
import { segmentBox } from './geometry.mjs';
export function coordinate(project, disciplines) {
  const issues = [], clashes = [], routes = disciplines.flatMap(d => d.routes).filter(r => r.status === 'PROPOSED');
  const obstacles = project.architecture.obstacles;
  const segments = routes.flatMap(r => r.points.slice(1).map((p, i) => ({ r, a: r.points[i], b: p, index: i })));
  for (const s of segments) {
    const radius = Math.max(s.r.widthM, s.r.heightM) / 2 + s.r.clearanceM;
    for (const o of obstacles) if (segmentBox(s.a, s.b, o, radius)) clashes.push({ kind: 'SERVICE_OBSTACLE', routeId: s.r.id, segment: s.index, obstacleId: o.id, outcome: 'CONFLICT_WITH_SUPPLIED_BOX' });
    for (const w of project.architecture.walls) {
      const level = project.architecture.levels.find(l => l.id === w.levelId);
      const box = { min: { x: Math.min(w.a.x, w.b.x) - w.thicknessM / 2, y: Math.min(w.a.y, w.b.y) - w.thicknessM / 2, z: level.elevationM }, max: { x: Math.max(w.a.x, w.b.x) + w.thicknessM / 2, y: Math.max(w.a.y, w.b.y) + w.thicknessM / 2, z: level.elevationM + w.heightM } };
      if (segmentBox(s.a, s.b, box, radius)) clashes.push({ kind: 'PENETRATION_REVIEW', routeId: s.r.id, segment: s.index, wallId: w.id, outcome: 'POTENTIAL_INTERSECTION', note: 'Openings, fire rating, sleeves and exact wall solids require review; no permission to cut is issued.' });
    }
  }
  let comparisons = 0, complete = true;
  outer: for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j];
    if (a.r.id === b.r.id || a.r.discipline === b.r.discipline && a.r.systemId === b.r.systemId) continue;
    if (++comparisons > 1000000) { complete = false; break outer; }
    const ra = Math.max(a.r.widthM, a.r.heightM) / 2 + a.r.clearanceM;
    const rb = Math.max(b.r.widthM, b.r.heightM) / 2 + b.r.clearanceM;
    const box = { min: { x: Math.min(b.a.x, b.b.x) - rb, y: Math.min(b.a.y, b.b.y) - rb, z: Math.min(b.a.z, b.b.z) - rb }, max: { x: Math.max(b.a.x, b.b.x) + rb, y: Math.max(b.a.y, b.b.y) + rb, z: Math.max(b.a.z, b.b.z) + rb } };
    if (segmentBox(a.a, a.b, box, ra)) clashes.push({ kind: 'SERVICE_SERVICE', routeId: a.r.id, otherRouteId: b.r.id, segment: a.index, otherSegment: b.index, outcome: 'POTENTIAL_INTERSECTION' });
  }
  if (!complete) issues.push(issue('coordination', 'CLASH_SCAN_INCOMPLETE', 'تجاوز كشف التعارضات حد المقارنات؛ النتيجة غير مكتملة.', {}, 'error'));
  if (!project.rules.structuralModelComplete || !obstacles.length) issues.push(issue('coordination', 'STRUCTURAL_MODEL_INCOMPLETE', 'نموذج الأعمدة والكمرات والبلاطات والخلوصات غير مكتمل؛ غياب التعارض المكتشف لا يثبت سلامة التمديد.'));
  if (clashes.length) issues.push(issue('coordination', 'CLASHES_REQUIRE_REVIEW', 'توجد تعارضات أو اختراقات محتملة تحتاج مراجعة.', { count: clashes.length }, clashes.some(c => c.kind === 'SERVICE_OBSTACLE') ? 'error' : 'pending'));
  // Explicit cross-system electrical interface; cooling capacity is never electrical input.
  const allDevices = disciplines.flatMap(d => d.devices), electrical = allDevices.filter(d => d.discipline === 'electrical');
  const interfaces = [];
  for (const eq of allDevices.filter(d => d.discipline !== 'electrical' && typeof d.ratedInputW === 'number')) {
    const matches = electrical.filter(l => l.sourceEquipmentId === eq.id);
    const outcome = matches.length !== 1 ? 'MISSING_OR_DUPLICATE_ELECTRICAL_LOAD' : Math.abs(matches[0].powerW - eq.ratedInputW) > 1e-6 ? 'POWER_MISMATCH' : 'MATCHED_SUPPLIED_INPUT';
    interfaces.push({ equipmentId: eq.id, electricalLoadId: matches[0]?.id || null, outcome });
    if (outcome !== 'MATCHED_SUPPLIED_INPUT') issues.push(issue('coordination', outcome, 'حمل الجهاز الكهربائي يحتاج ربطًا أو تصحيحًا.', { equipmentId: eq.id }));
  }
  return { status: complete ? 'CHECKED_SUPPLIED_GEOMETRY' : 'INCOMPLETE', method: 'CONSERVATIVE_3D_ENVELOPES', checksCodeCompliance: false, clashes, interfaces, issues, limitations: ['Conservative envelopes can over-report diagonal and corner contacts.', 'Same-system pathway sharing is not checked for capacity or fittings.', 'Wall penetrations are flagged conservatively even near door/window openings.', 'Devices without ratedInputW have no electrical interface check.'] };
}
