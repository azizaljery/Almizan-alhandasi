import { emptyDiscipline, calculation, issue } from '../core.mjs';
import { steadyStateHeatGain, sensibleAirflow, zoneOutdoorAir, circularDiameter, achAirflow } from '../calculations.mjs';
import { interiorPoint } from '../geometry.mjs';
import { device, makeRoute, schedule, requiredReview } from '../system-helpers.mjs';
export const hvac = { id: 'hvac', run(ctx) {
  const out = emptyDiscipline('hvac'), cfg = ctx.project.services.hvac || {}, equipment = new Map(), rows = [];
  for (const e of cfg.equipment || []) { const d = device(ctx, out, e, 'M-EQUIP', e.kind || 'AIR_EQUIPMENT'); if (d) equipment.set(e.id, d); }
  for (const z of cfg.zones || []) {
    const room = ctx.project.architecture.rooms.find(r => r.id === z.roomId), floor = room && ctx.project.architecture.levels.find(l => l.id === room.levelId);
    if (!room) { out.issues.push(issue(out.id, 'UNKNOWN_ROOM', 'غرفة المنطقة الحرارية غير موجودة.', { zoneId: z.id }, 'error')); continue; }
    const t = z.thermal || {};
    const heat = calculation('M-Q-' + z.id, 'STEADY_STATE_HEAT_GAIN_NOT_DESIGN_LOAD', t, steadyStateHeatGain, 'W', out.issues, out.id, ['ENERGYPLUS-HEAT-BALANCE']);
    const flow = calculation('M-AIR-' + z.id, 'SENSIBLE_AIRFLOW', { sensibleW: heat.value?.sensibleW ?? null, densityKgM3: t.densityKgM3, cpJkgK: t.cpJkgK, supplyDeltaK: z.supplyDeltaK }, sensibleAirflow, 'm3/s', out.issues, out.id, ['ENERGYPLUS-HEAT-BALANCE']);
    out.calculations.push(heat, flow);
    const vent = calculation('M-OA-' + z.id, 'SUPPLIED_ZONE_VENTILATION_RATES', { ...z.ventilation, areaM2: room.areaM2 }, zoneOutdoorAir, 'm3/s', out.issues, out.id, ['ASHRAE-ZONE-OA']);
    out.calculations.push(vent);
    const duct = calculation('M-D-' + z.id, 'CIRCULAR_AREA_EQUIVALENT_ONLY', { flowM3S: flow.value, velocityMS: z.ductVelocityMS }, circularDiameter, 'm', out.issues, out.id);
    out.calculations.push(duct);
    const mount = z.terminalHeightM;
    let terminal = null;
    if (typeof mount === 'number' && mount >= 0 && mount <= room.heightM) terminal = device(ctx, out, { id: 'MT-' + z.id, roomId: room.id, levelId: room.levelId, position: { ...interiorPoint(room), z: floor.elevationM + mount }, supplyM3S: flow.value, zoneId: z.id }, 'M-AIR', 'SUPPLY_TERMINAL');
    else requiredReview(out, 'أدخل منسوب مخرج الهواء للمنطقة ' + z.id, 'TERMINAL_HEIGHT_REQUIRED');
    const e = equipment.get(z.equipmentId);
    if (terminal && e && e.levelId === room.levelId && z.routing) makeRoute(ctx, out, { ...z.routing, id: 'MR-' + z.id, systemId: z.equipmentId, layer: 'M-DUCT', kind: 'SUPPLY_DUCT_PROPOSAL', levelId: room.levelId, fromId: e.id, toId: terminal.id, start: e.position, end: terminal.position });
    else requiredReview(out, 'المنطقة ' + z.id + ' تحتاج جهازًا مرتبطًا وحيز دكت في الدور نفسه؛ المسارات الرأسية تُعرّف صراحة.', 'HVAC_CONNECTION_REQUIRED');
    rows.push({ id: z.id, roomId: room.id, sensibleGainW: heat.value?.sensibleW ?? null, latentGainW: heat.value?.latentW ?? null, totalGainW: heat.value?.totalW ?? null, supplyM3S: flow.value, outdoorAirM3S: vent.value, areaEquivalentDuctM: duct.value, equipmentId: e?.id ?? null, selectedCapacityW: null });
  }
  for (const ex of cfg.exhaust || []) {
    const room = ctx.project.architecture.rooms.find(r => r.id === ex.roomId);
    if (!room) { requiredReview(out, 'مرجع غرفة الشفط غير موجود.', 'UNKNOWN_ROOM'); continue; }
    const calc = calculation('M-EX-' + ex.id, 'ACH_VOLUME_FLOW', { volumeM3: room.areaM2 * room.heightM, airChangesPerHour: ex.airChangesPerHour }, achAirflow, 'm3/s', out.issues, out.id);
    out.calculations.push(calc);
    const fan = device(ctx, out, { ...ex.fan, id: ex.id, roomId: room.id, levelId: room.levelId }, 'M-EXHAUST', 'EXHAUST_FAN');
    if (fan && ex.discharge && ex.routing) {
      const end = device(ctx, out, ex.discharge, 'M-EXHAUST', 'EXHAUST_DISCHARGE');
      if (end && end.levelId === fan.levelId) makeRoute(ctx, out, { ...ex.routing, id: 'MX-' + ex.id, systemId: ex.id, kind: 'EXHAUST_DUCT_PROPOSAL', layer: 'M-EXHAUST', levelId: room.levelId, fromId: fan.id, toId: end.id, start: fan.position, end: end.position });
    }
  }
  if (!(cfg.zones || []).length) requiredReview(out, 'عرّف المناطق وبيانات المناخ والغلاف والأشخاص والأجهزة والرطوبة.', 'THERMAL_INPUT_REQUIRED');
  out.schedules.push(schedule('hvac-zones', ['id', 'roomId', 'sensibleGainW', 'latentGainW', 'totalGainW', 'supplyM3S', 'outdoorAirM3S', 'areaEquivalentDuctM', 'equipmentId', 'selectedCapacityW'], rows));
  requiredReview(out, 'يلزم نموذج أحمال تصميم معتمد، ومراجعة انطباق طريقة التهوية على نوع المبنى، وضغط الدكت والضوضاء والتوزيع والراجع والتكاثف وكفاءة الجهاز عند ظروف التصميم.');
  out.limitations.push('Static heat gains are not an ASHRAE heat-balance or radiant-time-series simulation and are not equipment selection.', 'Outdoor-air rates and effectiveness are explicit project inputs. No ASHRAE 62.1 values are assigned to residential rooms.', 'Area-equivalent duct diameter excludes pressure loss, fittings, aspect ratio, insulation and acoustic design.', 'Equipment electrical input is not inferred from cooling watts.');
  return out;
} };
