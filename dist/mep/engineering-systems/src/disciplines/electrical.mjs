import { emptyDiscipline, calculation, issue, sum, number, InputError } from '../core.mjs';
import { lightingCount, powerComponents, electricalCurrent, voltageDrop } from '../calculations.mjs';
import { distributePoints } from '../geometry.mjs';
import { device, makeRoute, schedule, requiredReview } from '../system-helpers.mjs';
export const electrical = { id: 'electrical', run(ctx) {
  const out = emptyDiscipline('electrical'), cfg = ctx.project.services.electrical || {};
  const rooms = ctx.project.architecture.rooms, levels = ctx.project.architecture.levels;
  const panels = new Map(), loads = [], circuits = [...(cfg.circuits || [])];
  for (const p of cfg.panels || []) { const d = device(ctx, out, p, 'E-POWER', 'PANEL'); if (d) panels.set(d.id, d); }
  for (const l of cfg.loads || []) { const d = device(ctx, out, l, l.kind === 'SOCKET' ? 'E-SOCKET' : 'E-POWER', l.kind || 'LOAD'); if (d) loads.push(d); }
  for (const [roomId, spec] of Object.entries(cfg.lightingByRoom || {})) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) { out.issues.push(issue(out.id, 'UNKNOWN_ROOM', 'مرجع غرفة الإنارة غير موجود.', { roomId }, 'error')); continue; }
    const calc = calculation('E-LUX-' + roomId, 'LUMEN_METHOD_COUNT', { targetLux: spec.targetLux, areaM2: room.areaM2, lumensPerFixture: spec.lumensPerFixture, utilizationFactor: spec.utilizationFactor, maintenanceFactor: spec.maintenanceFactor }, lightingCount, 'fixtures', out.issues, out.id, ['LIGHTING-MANUAL']);
    out.calculations.push(calc);
    if (calc.value === null) continue;
    if (calc.value > 160) { out.issues.push(issue(out.id, 'LAYOUT_RESOURCE_LIMIT', 'عدد الوحدات يتجاوز حد الرسم المبدئي.', { roomId, requested: calc.value }, 'error')); continue; }
    let points;
    try { number(spec.mountHeightM, 'lighting.mountHeightM', { min: 0, max: room.heightM }); number(spec.wattsPerFixture, 'lighting.wattsPerFixture', { positive: true }); points = distributePoints(room, calc.value); }
    catch (e) { if (!(e instanceof InputError)) throw e; out.issues.push(issue(out.id, e.code, 'بيانات تركيب الإنارة غير مكتملة.', { roomId })); continue; }
    const ids = [], floor = levels.find(l => l.id === room.levelId);
    points.forEach((p, i) => {
      const d = device(ctx, out, { id: `EL-${roomId}-${i + 1}`, roomId, levelId: room.levelId, position: { ...p, z: floor.elevationM + spec.mountHeightM }, powerW: spec.wattsPerFixture, powerFactor: spec.powerFactor ?? null, demandFactor: spec.demandFactor ?? null, calculationId: calc.id }, 'E-LIGHT', 'LUMINAIRE');
      if (d) { loads.push(d); ids.push(d.id); }
    });
    if (spec.panelId) circuits.push({ id: 'EC-L-' + roomId, panelId: spec.panelId, loadIds: ids, phases: 1, phase: spec.phase ?? null, voltageV: spec.voltageV ?? null, routing: spec.routing || null, ...(spec.systemId ? { systemId: spec.systemId } : {}), ...(spec.cable ? { cable: spec.cable } : {}), ...(spec.protection ? { protection: spec.protection } : {}) });
  }
  const loadMap = new Map(loads.map(l => [l.id, l])), membership = new Map(), componentMap = new Map();
  for (const l of loads) {
    const c = calculation('E-P-' + l.id, 'POWER_COMPONENTS', { powerW: l.powerW, powerFactor: l.powerFactor, demandFactor: l.demandFactor }, powerComponents, 'W_VAR', out.issues, out.id, ['SCHNEIDER-POWER']);
    out.calculations.push(c); componentMap.set(l.id, c.value);
  }
  for (const c of circuits) for (const id of c.loadIds || []) { const list = membership.get(id) || []; list.push(c.id); membership.set(id, list); }
  const circuitRows = [], panelCircuits = new Map();
  for (const c of circuits) {
    const panel = panels.get(c.panelId), refs = c.loadIds;
    const refOK = panel && Array.isArray(refs) && refs.length && new Set(refs).size === refs.length && refs.every(id => loadMap.has(id) && membership.get(id).length === 1);
    if (!refOK) { out.issues.push(issue(out.id, 'CIRCUIT_REFERENCE_INVALID', 'الدائرة تحتوي مرجعًا مفقودًا أو حملًا مكررًا بين الدوائر.', { circuitId: c.id }, 'error')); continue; }
    const ds = refs.map(id => loadMap.get(id));
    if (ds.some(l => l.levelId !== panel.levelId)) { out.issues.push(issue(out.id, 'CROSS_FLOOR_CIRCUIT_REQUIRES_RISER', 'الدائرة بين أدوار مختلفة تحتاج مسار رايزر صريحًا.', { circuitId: c.id })); continue; }
    const values = refs.map(id => componentMap.get(id));
    const total = values.every(Boolean) ? { connectedW: sum(values.map(v => v.connectedW)), connectedVar: sum(values.map(v => v.connectedVar)), demandW: sum(values.map(v => v.demandW)), demandVar: sum(values.map(v => v.demandVar)) } : null;
    const pf = total ? total.connectedW === 0 ? 1 : total.connectedW / Math.hypot(total.connectedW, total.connectedVar) : null;
    const amps = calculation('E-I-' + c.id, 'I_P_OVER_V_PF', { powerW: total?.connectedW ?? null, voltageV: c.voltageV, powerFactor: pf, phases: c.phases }, electricalCurrent, 'A', out.issues, out.id, ['SCHNEIDER-POWER']);
    out.calculations.push(amps);
    const routed = [];
    for (const l of ds) {
      if (!c.routing) continue;
      const r = makeRoute(ctx, out, { ...c.routing, id: 'ER-' + c.id + '-' + l.id, systemId: c.systemId || c.id, layer: 'E-CABLE', kind: 'CONCEPT_HOME_RUN', levelId: l.levelId, fromId: panel.id, toId: l.id, start: panel.position, end: l.position });
      if (r) routed.push(r);
    }
    if (!c.routing) requiredReview(out, 'تحتاج الدائرة ' + c.id + ' بيانات حيز ومسار تمديد.', 'CABLE_ROUTE_INPUT_REQUIRED');
    const complete = routed.length === ds.length && routed.every(r => r.status === 'PROPOSED');
    const lengthM = complete ? Math.max(...routed.map(r => r.lengthM)) : null;
    const vd = calculation('E-VD-' + c.id, 'AC_VOLTAGE_DROP_FURTHEST_FULL_LOAD', { currentA: amps.value, lengthM, resistanceOhmPerKm: c.cable?.resistanceOhmPerKm ?? null, reactanceOhmPerKm: c.cable?.reactanceOhmPerKm ?? null, powerFactor: pf, phases: c.phases, voltageV: c.voltageV }, voltageDrop, 'V_PERCENT', out.issues, out.id, ['SCHNEIDER-VOLTAGE-DROP']);
    out.calculations.push(vd);
    let protectionCheck = null;
    if (c.protection && amps.value !== null) {
      try {
        const { ratedA, correctedAmpacityA, source } = c.protection;
        number(ratedA, c.id + '.ratedA', { positive: true }); number(correctedAmpacityA, c.id + '.correctedAmpacityA', { positive: true });
        if (typeof source !== 'string' || !source.trim()) throw new InputError('AMPACITY_SOURCE_REQUIRED', c.id);
        protectionCheck = amps.value <= ratedA && ratedA <= correctedAmpacityA ? 'WITHIN_SUPPLIED_AMPACITY' : 'OUTSIDE_SUPPLIED_AMPACITY';
        if (protectionCheck.startsWith('OUTSIDE')) out.issues.push(issue(out.id, 'AMPACITY_FAILED', 'لا تتحقق علاقة تيار الحمل والقاطع وسعة الكابل المعلنة.', { circuitId: c.id }, 'error'));
      } catch (e) { if (!(e instanceof InputError)) throw e; requiredReview(out, 'مرجع سعة الكابل المصححة أو بيانات الحماية غير مكتمل.', e.code); }
    }
    if (vd.value && c.protection?.voltageDropLimitPercent !== undefined) {
      number(c.protection.voltageDropLimitPercent, c.id + '.voltageDropLimitPercent', { positive: true });
      if (vd.value.percent > c.protection.voltageDropLimitPercent) out.issues.push(issue(out.id, 'VOLTAGE_DROP_EXCEEDED_PROJECT_LIMIT', 'هبوط الجهد يتجاوز الحد المدخل للمشروع.', { circuitId: c.id, percent: vd.value.percent }, 'error'));
    }
    const row = { id: c.id, panelId: panel.id, loadCount: refs.length, connectedW: total?.connectedW ?? null, demandW: total?.demandW ?? null, currentA: amps.value, oneWayLengthM: lengthM, voltageDropPercent: vd.value?.percent ?? null, cableSizeMm2: c.cable?.sizeMm2 ?? null, breakerA: c.protection?.ratedA ?? null, protectionCheck };
    circuitRows.push(row);
    const list = panelCircuits.get(panel.id) || []; list.push({ ...c, total }); panelCircuits.set(panel.id, list);
  }
  for (const l of loads) if (!membership.has(l.id)) out.issues.push(issue(out.id, 'UNASSIGNED_LOAD', 'الحمل لم يُربط بدائرة.', { loadId: l.id }));
  const panelRows = [];
  for (const p of panels.values()) {
    const cs = panelCircuits.get(p.id) || [], expected = circuits.filter(c => c.panelId === p.id);
    const valid = cs.length > 0 && cs.length === expected.length && cs.every(c => c.total);
    const P = valid ? sum(cs.map(c => c.total.demandW)) : null, Q = valid ? sum(cs.map(c => c.total.demandVar)) : null;
    const mapped = valid && cs.every(c => c.phases === 1 && ['L1', 'L2', 'L3'].includes(c.phase) || c.phases === 3 && c.balanced === true);
    const phaseVA = mapped ? ['L1', 'L2', 'L3'].map(phase => { const pc = cs.filter(c => c.phases === 3 || c.phase === phase); return Math.hypot(sum(pc.map(c => c.total.demandW / c.phases)), sum(pc.map(c => c.total.demandVar / c.phases))); }) : null;
    panelRows.push({ id: p.id, demandW: P, demandVar: Q, vectorApparentVA: P === null ? null : Math.hypot(P, Q), phaseL1VA: phaseVA?.[0] ?? null, phaseL2VA: phaseVA?.[1] ?? null, phaseL3VA: phaseVA?.[2] ?? null });
    if (!mapped) requiredReview(out, 'توزيع أطوار اللوحة ' + p.id + ' غير مكتمل؛ لا يمكن الحكم على اتزانها.', 'PHASE_BALANCE_NOT_EVALUATED');
  }
  if (!panels.size) requiredReview(out, 'أدخل اللوحات ومواقعها ومعلومات التغذية.', 'ELECTRICAL_SUPPLY_REQUIRED');
  out.schedules.push(schedule('electrical-circuits', ['id', 'panelId', 'loadCount', 'connectedW', 'demandW', 'currentA', 'oneWayLengthM', 'voltageDropPercent', 'cableSizeMm2', 'breakerA', 'protectionCheck'], circuitRows));
  out.schedules.push(schedule('electrical-panels', ['id', 'demandW', 'demandVar', 'vectorApparentVA', 'phaseL1VA', 'phaseL2VA', 'phaseL3VA'], panelRows));
  requiredReview(out, 'يلزم تحقق مستقل للتأريض والقصر والفصل الانتقائي والحماية من الصعق والمواقع الرطبة والإنارة الفعلية بملفات فوتومترية.');
  out.limitations.push('Lumen count and suggested locations do not verify uniformity, glare or point illuminance.', 'Home runs are schematic pathway proposals. Voltage drop conservatively assigns total circuit load to the longest complete path; it is not a solved branching network.', 'P and Q aggregation assumes lagging linear loads; harmonics, capacitive loads and neutral currents are not solved.');
  return out;
} };
