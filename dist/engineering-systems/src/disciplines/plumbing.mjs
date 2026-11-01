import { emptyDiscipline, calculation, issue, number, InputError, sum } from '../core.mjs';
import { circularDiameter, drainageFall, tankVolume, rainfallFlow, waterHeatingPower, hydraulicHead } from '../calculations.mjs';
import { distance, segmentBox, routeLength } from '../geometry.mjs';
import { device, makeRoute, schedule, requiredReview } from '../system-helpers.mjs';
const SYSTEMS = ['cold_water', 'hot_water', 'sanitary', 'vent', 'storm', 'condensate'];
const gravitySystems = ['sanitary', 'storm', 'condensate'];
const layers = { cold_water: 'P-COLD', hot_water: 'P-HOT', sanitary: 'P-DRAIN', vent: 'P-VENT', storm: 'P-STORM', condensate: 'P-COND' };
export const plumbing = { id: 'plumbing', run(ctx) {
  const out = emptyDiscipline('plumbing'), cfg = ctx.project.services.plumbing || {}, nodes = new Map(), rows = [];
  for (const f of [...(cfg.fixtures || []), ...(cfg.equipment || [])]) { const d = device(ctx, out, f, 'P-FIXTURE', f.kind || 'PLUMBING_NODE'); if (d) nodes.set(d.id, d); }
  for (const c of cfg.connections || []) {
    const a = nodes.get(c.fromId), b = nodes.get(c.toId);
    if (!a || !b || a.id === b.id || !SYSTEMS.includes(c.system)) { out.issues.push(issue(out.id, 'PIPE_REFERENCE_INVALID', 'مرجع توصيل صحي أو نوع النظام غير صالح.', { id: c.id }, 'error')); continue; }
    if (a.levelId !== b.levelId) { requiredReview(out, 'الوصلة ' + c.id + ' بين دورين؛ عرّف الرايزر ومساره صراحة.', 'RISER_MODEL_REQUIRED'); continue; }
    const diam = calculation('P-D-' + c.id, 'CIRCULAR_AREA_EQUIVALENT_ONLY', { flowM3S: c.flowM3S, velocityMS: c.velocityMS }, circularDiameter, 'm', out.issues, out.id);
    out.calculations.push(diam);
    const level = ctx.project.architecture.levels.find(l => l.id === a.levelId), gravity = gravitySystems.includes(c.system);
    let start = a.position, end = b.position;
    if (gravity) {
      try { number(c.startInvertM, c.id + '.startInvertM'); number(c.endInvertM, c.id + '.endInvertM'); number(c.slope, c.id + '.slope', { positive: true, max: 1 }); }
      catch (e) { if (!(e instanceof InputError)) throw e; requiredReview(out, 'أدخل مناسيب قاع الأنبوب والميل للوصلة ' + c.id, e.code); continue; }
      start = { ...a.position, z: level.elevationM + c.startInvertM }; end = { ...b.position, z: start.z };
    }
    const routing = c.routing || {};
    const r = makeRoute(ctx, out, { ...routing, ...(gravity ? { routeHeightM: c.startInvertM } : {}), id: 'PR-' + c.id, systemId: c.systemId || c.system, kind: c.system, layer: layers[c.system], levelId: a.levelId, fromId: a.id, toId: b.id, start, end });
    let horizontalLengthM = null, fallM = null, endInvertM = null;
    if (r?.status === 'PROPOSED' && gravity) {
      horizontalLengthM = sum(r.points.slice(1).map((p, i) => Math.hypot(p.x - r.points[i].x, p.y - r.points[i].y)));
      const f = calculation('P-FALL-' + c.id, 'DRAINAGE_FALL', { horizontalLengthM, slope: c.slope }, drainageFall, 'm', out.issues, out.id);
      out.calculations.push(f); fallM = f.value; endInvertM = c.startInvertM - fallM;
      let accumulated = 0;
      r.points = r.points.map((p, i, all) => { if (i) accumulated += Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y); return { ...p, z: level.elevationM + c.startInvertM - accumulated * c.slope }; });
      r.lengthM = routeLength(r.points); r.horizontalLengthM = horizontalLengthM; r.fallM = fallM; r.endInvertM = endInvertM;
      const hit = ctx.project.architecture.obstacles.find(o => r.points.slice(1).some((p, i) => segmentBox(r.points[i], p, o, Math.max(r.widthM, r.heightM) / 2 + r.clearanceM)));
      if (Math.abs(endInvertM - c.endInvertM) > 1e-6 || hit) {
        r.status = 'BLOCKED'; r.reason = hit ? 'SLOPED_PIPE_HITS_OBSTACLE' : 'OUTFALL_INVERT_MISMATCH';
        out.issues.push(issue(out.id, r.reason, hit ? 'المسار بعد تطبيق الميل يتعارض مع عائق.' : 'الميل والطول لا يصلان إلى منسوب القاع المطلوب؛ لم يُفترض اتصال رأسي لإخفاء الفرق.', { id: c.id, actualEndInvertM: endInvertM, requestedEndInvertM: c.endInvertM, obstacleId: hit?.id ?? null }, 'error'));
      }
    }
    if (c.hydraulics && r?.status === 'PROPOSED') out.calculations.push(calculation('P-H-' + c.id, 'DARCY_WEISBACH_SUPPLIED_FRICTION', { ...c.hydraulics, flowM3S: c.flowM3S, lengthM: r.lengthM }, hydraulicHead, 'm_HEAD', out.issues, out.id));
    rows.push({ id: c.id, system: c.system, fromId: a.id, toId: b.id, flowM3S: c.flowM3S ?? null, equivalentDiameterM: diam.value, selectedDiameterMm: c.selectedDiameterMm ?? null, lengthM: r?.lengthM ?? null, horizontalLengthM, slope: c.slope ?? null, fallM, endInvertM, routeStatus: r?.status ?? 'NOT_ROUTED' });
  }
  if (cfg.tank) out.calculations.push(calculation('P-TANK', 'PROJECT_AUTONOMY_VOLUME', cfg.tank, tankVolume, 'L', out.issues, out.id));
  for (const roof of cfg.roofDrainage || []) out.calculations.push(calculation('P-RAIN-' + roof.id, 'RATIONAL_RUNOFF_FLOW', { intensityMmH: roof.intensityMmH, areaM2: roof.areaM2, runoffCoefficient: roof.runoffCoefficient }, rainfallFlow, 'm3/s', out.issues, out.id));
  if (cfg.hotWater) out.calculations.push(calculation('P-HEAT', 'INSTANTANEOUS_WATER_HEATING', cfg.hotWater, waterHeatingPower, 'W', out.issues, out.id));
  out.schedules.push(schedule('plumbing-connections', ['id', 'system', 'fromId', 'toId', 'flowM3S', 'equivalentDiameterM', 'selectedDiameterMm', 'lengthM', 'horizontalLengthM', 'slope', 'fallM', 'endInvertM', 'routeStatus'], rows));
  if (!nodes.size) requiredReview(out, 'حدد الأجهزة الصحية ومصادر المياه ومخارج الصرف ومناسيبها.', 'PLUMBING_INPUT_REQUIRED');
  requiredReview(out, 'يلزم تحديد التدفق التصميمي من جدول وحدات الأجهزة المعتمد، ثم تحقق الضغط والأقطار والتهوية والمصائد والتنظيف ومنع الرجوع والمطر والربط الخارجي.');
  out.limitations.push('Flow and friction factors are supplied project inputs; no fixture-unit demand curve is fabricated.', 'Velocity-area diameter is not sanitary drainage capacity, a commercial nominal pipe size or a complete pressure-network solution.', 'Drain invert elevations are relative to the stated level. Sloped pipes are rechecked at their actual 3D elevations.');
  return out;
} };
