import { copy, issue, InputError, number, identifier } from './core.mjs';
import { segmentBox, distance } from './geometry.mjs';
export function attachRisers(project, results) {
  const nodes = new Map(results.flatMap(d => d.devices).map(d => [d.id, d]));
  for (const spec of project.services.risers || []) {
    const out = results.find(d => d.id === spec.discipline);
    if (!out) throw new InputError('RISER_DISCIPLINE_NOT_SELECTED', spec.id);
    try {
      identifier(spec.id, 'riser.id');
      const a = nodes.get(spec.fromId), b = nodes.get(spec.toId);
      if (!a || !b || a.discipline !== out.id || b.discipline !== out.id || a.levelId === b.levelId) throw new InputError('RISER_ENDPOINT_INVALID', spec.id);
      if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) > 1e-6) throw new InputError('RISER_ALIGNMENT_REQUIRED', spec.id);
      for (const k of ['widthM', 'heightM']) number(spec[k], spec.id + '.' + k, { positive: true });
      number(spec.clearanceM, spec.id + '.clearanceM', { min: 0 });
      const radius = Math.max(spec.widthM, spec.heightM) / 2 + spec.clearanceM;
      const hit = project.architecture.obstacles.find(o => segmentBox(a.position, b.position, o, radius));
      out.routes.push({ ...copy(spec), kind: spec.kind || 'VERTICAL_RISER', systemId: spec.systemId || spec.id, layer: spec.layer, levelId: a.levelId, levelIds: [a.levelId, b.levelId], points: [copy(a.position), copy(b.position)], status: hit ? 'BLOCKED' : 'PROPOSED', lengthM: distance(a.position, b.position), reason: hit ? 'RISER_OBSTACLE' : 'EXPLICIT_ENDPOINTS', discipline: out.id });
      out.issues.push(issue(out.id, hit ? 'RISER_OBSTACLE' : 'SLAB_PENETRATION_REVIEW', hit ? 'الرايزر يعبر عائقًا معلنًا.' : 'الرايزر محدد هندسيًا؛ فتحات البلاطات والعزل والحماية والخلوص تحتاج اعتمادًا مستقلًا.', { id: spec.id, obstacleId: hit?.id || null }, hit ? 'error' : 'pending'));
    } catch (e) { if (!(e instanceof InputError)) throw e; out.issues.push(issue(out.id, e.code, 'تعذر تكوين الرايزر من البيانات المعلنة.', { id: spec.id, path: e.path }, 'error')); }
  }
}
