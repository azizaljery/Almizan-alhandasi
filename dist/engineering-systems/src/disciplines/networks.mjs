import { emptyDiscipline, issue, calculation, number, InputError } from '../core.mjs';
import { device, makeRoute, schedule, requiredReview } from '../system-helpers.mjs';
/** Explicitly positioned systems; this does not invent detector coverage or hydraulic fire design. */
export function networkDiscipline(id, layerPrefix, reviewAr) {
  return { id, run(ctx) {
    const out = emptyDiscipline(id), cfg = ctx.project.services[id] || {}, nodes = new Map();
    for (const n of cfg.devices || []) { const d = device(ctx, out, n, layerPrefix + '-DEVICE', n.kind || 'DEVICE'); if (d) nodes.set(n.id, d); }
    for (const c of cfg.connections || []) {
      const a = nodes.get(c.fromId), b = nodes.get(c.toId);
      if (!a || !b || a.id === b.id) { out.issues.push(issue(id, 'NETWORK_REFERENCE_INVALID', 'طرف التوصيل غير صالح.', { connectionId: c.id }, 'error')); continue; }
      if (a.levelId !== b.levelId) { requiredReview(out, 'يلزم تعريف رايزر رأسي للوصلة ' + c.id, 'RISER_MODEL_REQUIRED'); continue; }
      const r = makeRoute(ctx, out, { ...c.routing, id: id + '-R-' + c.id, systemId: c.systemId || id, kind: c.kind || 'PATHWAY_PROPOSAL', layer: layerPrefix + '-PATH', levelId: a.levelId, fromId: a.id, toId: b.id, start: a.position, end: b.position });
      if (r?.status === 'PROPOSED' && c.projectLengthLimitM !== undefined) {
        number(c.projectLengthLimitM, c.id + '.projectLengthLimitM', { positive: true });
        if (r.lengthM > c.projectLengthLimitM) out.issues.push(issue(id, 'PROJECT_LENGTH_LIMIT_EXCEEDED', 'المسار أطول من الحد المدخل للمشروع؛ لم تدخل الوصلات أو سماح التنفيذ ضمن الطول.', { connectionId: c.id, lengthM: r.lengthM }, 'error'));
      }
    }
    if (!nodes.size) requiredReview(out, 'أدخل عناصر النظام ومواقعها ووصلاتها قبل إنتاج طبقة ' + id, 'SYSTEM_INPUT_REQUIRED');
    out.schedules.push(schedule(id + '-devices', ['id', 'kind', 'levelId', 'roomId'], out.devices.map(d => ({ id: d.id, kind: d.kind, levelId: d.levelId, roomId: d.roomId || null }))));
    requiredReview(out, reviewAr);
    out.limitations.push('Explicit placements and geometric pathways only. Device coverage, equipment ratings, system performance and code compliance are NOT_EVALUATED.');
    return out;
  } };
}
export const fire = networkDiscipline('fire', 'F', 'مراجعة تصميم وإنذار وإطفاء وإخلاء متخصصة مطلوبة؛ التغطية ومقاومة الحريق والتدفق والضغط وسعة المضخة والخزان غير محسوبة.');
export const lowCurrent = networkDiscipline('low_current', 'T', 'يلزم تحقق نوع الكابل وحدود القناة والوصلات والفصل والتأريض وتغطية الشبكات والكاميرات ومتطلبات الخصوصية.');
const solarNetwork = networkDiscipline('solar', 'S', 'يلزم تحقق الإشعاع والتظليل والإنفرتر والحماية والأحمال الإنشائية على السقف؛ لم يُحسب الإنتاج السنوي.');
export const solar = { id: 'solar', run(ctx) {
  const out = solarNetwork.run(ctx), cfg = ctx.project.services.solar || {};
  if (cfg.capacity) out.calculations.push(calculation('S-DC', 'NAMEPLATE_DC_CAPACITY', cfg.capacity, ({ panelCount, wattsPerPanel }) => { number(panelCount, 'panelCount', { min: 0 }); number(wattsPerPanel, 'wattsPerPanel', { positive: true }); if (!Number.isInteger(panelCount)) throw new InputError('INTEGER_REQUIRED', 'panelCount'); return panelCount * wattsPerPanel; }, 'Wp', out.issues, out.id));
  return out;
} };
