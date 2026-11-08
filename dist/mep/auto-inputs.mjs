// المولّد الأولي لمدخلات الأنظمة الهندسية: يقرأ المخطط المعماري المربوط (الغرف وأنواعها والجدران الخارجية والنوافذ
// والأجهزة الصحية المرسومة) ويبني مدخلات كاملة لحزمة الأنظمة بافتراضات مشروع معلنة بالاسم والقيمة،
// فتخرج الأرقام من أول فتح: الإنارة والمقابس والدوائر واللوحات، وأحمال التبريد وسعات الوحدات، والأجهزة الصحية
// والمياه والخزان والسخانات، وعناصر الحريق والتيار الخفيف والطاقة الشمسية. كل افتراض يُسجَّل في provenance ويُعرض
// للعميل ليعدّله؛ لا شيء هنا اشتراط كود ولا اعتماد تنفيذ.
import { interiorPoint, distributePoints, inside, bounds } from './engineering-systems/src/geometry.mjs';
import { steadyStateHeatGain } from './engineering-systems/src/calculations.mjs';
import { analyzeDoc } from '../draw/digest.mjs';
import { emptyInputs } from './mep-binding.mjs';
import { envelopeFor, DEFAULT_ZONE, SBC602_SOURCE } from './sbc602-envelope.mjs';

export const AUTO_VERSION = 'mep-auto/1';
export const AUTO_NOTE_AR = 'مدخلات أولية ولّدها الميزان من المخطط بافتراضات مشروع معلنة (ليست قيم كود ولا قياسات موقع)؛ عدّلها ثم أعد الحساب.';

/** افتراضات الغلاف السابقة (قبل ربطها بالكود)؛ تُستعمل فقط لقيمة لم يتحقق مصدرها، وتُعلَّم «غير متحقق». */
export const LEGACY_ENVELOPE = Object.freeze({ wallU: .57, roofU: .4, glassU: 2.8 });
const ENV0 = envelopeFor(DEFAULT_ZONE, LEGACY_ENVELOPE);

/** الافتراضات المعلنة. كل قيمة هنا افتراض تصميمي أولي قابل للتعديل من العميل، وليست مرجعًا نظاميًا. */
export const ASSUMPTIONS = Object.freeze({
  voltageV: 230, phases: 1, powerFactor: .95, routeHeightM: 2.7, vdLimitPct: 4, // المسار تحت الكمرات المبدئية (2.85 م فأعلى)
  // الإنارة: لوكس مستهدف بحسب نوع الفراغ (قيم إرشادية شائعة للسكني)، وحدة LED 1600 لومن / 18 واط، معامل انتفاع 0.5، معامل صيانة 0.8
  lux: { majlis: 200, living: 200, dining: 200, kitchen: 300, bedroom: 150, master: 150, office: 300, bath: 150, laundry: 200, storage: 100, service: 150, corridor: 100, entrance: 150, stairs: 150, garage: 100, balcony: 75, other: 150 },
  lumensPerFixture: 1600, wattsPerFixture: 18, utilizationFactor: .5, maintenanceFactor: .8, lightMountM: 2.9,
  // المقابس: عدد بحسب النوع، و200 واط للمقبس العام بمعامل طلب 0.4؛ أحمال المطبخ المحددة بواط وطلب 0.8
  sockets: { majlis: 6, living: 6, dining: 3, kitchen: 6, bedroom: 4, master: 6, office: 4, bath: 1, laundry: 2, storage: 1, service: 2, corridor: 1, entrance: 1, stairs: 0, garage: 2, balcony: 0, courtyard: 1, other: 2 },
  socketW: 200, socketDemand: .4, socketHeightM: .4,
  kitchenLoads: [['فرن كهربائي', 3000], ['ثلاجة', 300], ['غسالة أطباق', 1800], ['ميكروويف', 1200]], laundryLoads: [['غسالة', 2000], ['نشافة', 2500]], applianceDemand: .8,
  waterHeaterW: 1500, acDemand: .9, acPowerPerKW: 330, // واط كهربائي لكل كيلوواط تبريد (COP ≈ 3)
  // التكييف: الرياض صيفًا — افتراض 46°C خارج / 24°C داخل وإشعاع 150 W/m² زجاج (افتراضان). معاملات الغلاف U من SBC 602-2018
  // للمبنى السكني المكيف في المنطقة 1 (الرياض) — المصادر والتحقق في ./sbc602-envelope.mjs؛ ما لم يتحقق يبقى افتراضًا معلَّمًا.
  outdoorC: 46, indoorC: 24, wallU: ENV0.wallU.value, glassU: ENV0.glassU.value, roofU: ENV0.roofU.value, climateZone: DEFAULT_ZONE, solarWPerM2Glass: 150, personSensibleW: 75, personLatentW: 55, equipmentWPerM2: 8,
  infiltrationACH: .5, outdoorHumidity: .012, indoorHumidity: .0093, densityKgM3: 1.15, cpJkgK: 1006, latentHeatJkg: 2450000, supplyDeltaK: 10, terminalHeightM: 2.6, ductVelocityMS: 5,
  persons: { majlis: 8, living: 5, dining: 6, kitchen: 2, bedroom: 2, master: 2, office: 2, other: 1 },
  acSizingMargin: 1.15, btuPerW: 3.412, splitSteps: [9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000],
  // اختيار السعة: الأكبر من (الحمل الساكن × 1.15) و(قاعدة عملية سعودية شائعة 600 BTU/h لكل م² أرضية) — الحمل الساكن لا يمثل ذروة التصميم
  btuPerM2Floor: 600,
  // السباكة: استهلاك 250 لتر/شخص/يوم، استقلالية الخزان يومين، سخان لكل دورة مياه، صفاية أرضية لكل فراغ رطب
  litresPerPersonDay: 250, autonomyDays: 2, fixtureFlowLs: { WC: .1, BASIN: .1, SHOWER: .15, SINK: .15, FLOOR_DRAIN: 0 }, coldVelocityMS: 1.5,
  // الحريق والتيار الخفيف والشمسية
  smokeDetectorRooms: ['bedroom', 'master', 'living', 'majlis', 'corridor', 'entrance', 'office', 'dining', 'stairs'], heatDetectorRooms: ['kitchen', 'laundry', 'service', 'garage'],
  dataOutletRooms: ['bedroom', 'master', 'living', 'majlis', 'office', 'dining'], tvRooms: ['bedroom', 'master', 'living', 'majlis'],
  pvWattsPerPanel: 550, pvPanelAreaM2: 2.6, pvRoofFraction: .15,
});

const r3 = v => Math.round(v * 1000) / 1000;
/** كابل نحاسي PVC: مقاومة IEC 60228 عند 20°C (Ω/km) وسعة تقريبية في أنبوب (افتراض مشروع يُحقق من جدول المصنّع). */
const CABLE = { 2.5: { r: 7.41, iz: 24 }, 4: { r: 4.61, iz: 32 }, 6: { r: 3.08, iz: 41 }, 10: { r: 1.83, iz: 57 } };
const AMPACITY_SOURCE = 'افتراض مشروع: مقاومة IEC 60228 وسعة تقريبية لكابل نحاسي PVC في أنبوب — تُحقق من جدول الشركة المصنعة';
const circuit = (id, panelId, loadIds, phase, sizeMm2, ratedA, A) => ({ id, panelId, loadIds, phases: 1, phase, voltageV: A.voltageV, systemId: 'E-LV-' + panelId, routing: { routeHeightM: A.routeHeightM, widthM: .05, heightM: .05, clearanceM: .02 }, cable: { sizeMm2, resistanceOhmPerKm: CABLE[sizeMm2].r, reactanceOhmPerKm: .08 }, protection: { ratedA, correctedAmpacityA: CABLE[sizeMm2].iz, source: AMPACITY_SOURCE, voltageDropLimitPercent: A.vdLimitPct } });
const AR_KIND = { PANEL: 'لوحة توزيع', SOCKET: 'مقبس', EQUIPMENT_LOAD: 'حمل جهاز', AIR_EQUIPMENT: 'وحدة تكييف', WC: 'مرحاض', BASIN: 'مغسلة', SHOWER: 'دش', SINK: 'حوض', FLOOR_DRAIN: 'صفاية', WATER_SOURCE: 'عداد مياه', TANK: 'خزان', PUMP: 'مضخة', WATER_HEATER: 'سخان', SMOKE_DETECTOR: 'كاشف دخان', HEAT_DETECTOR: 'كاشف حرارة', EXTINGUISHER: 'طفاية', FIRE_ALARM_PANEL: 'لوحة إنذار', MANUAL_CALL_POINT: 'نقطة إنذار', SOUNDER: 'جرس', DATA_RACK: 'خزانة شبكة', DATA_OUTLET: 'مخرج بيانات', TV_OUTLET: 'مخرج تلفاز', CCTV_CAMERA: 'كاميرا', INTERCOM: 'اتصال داخلي', PV_MODULE: 'لوح شمسي', INVERTER: 'محوّل' };
export const kindAr = k => AR_KIND[k] || k;

/** نقاط داخل الغرفة: الأولى مركزية ثم موزعة؛ عند التعذر تُستخدم نقطة داخلية واحدة مزاحة قليلًا. */
function pointsIn(room, n) {
  if (n <= 0) return [];
  try { return distributePoints(room, n); } catch { const c = interiorPoint(room); return Array.from({ length: n }, (_, i) => ({ x: r3(c.x + (i % 2 ? .15 : -.15) * ((i >> 1) + 1) * .5), y: c.y })).map(p => (inside(p, room.polygon) ? p : c)); }
}
const splitBtu = (w, areaM2 = 0) => { const need = Math.max(w * ASSUMPTIONS.btuPerW * ASSUMPTIONS.acSizingMargin, areaM2 * ASSUMPTIONS.btuPerM2Floor); return ASSUMPTIONS.splitSteps.find(s => s >= need) || Math.ceil(need / 12000) * 12000; };

/**
 * يولّد المدخلات من المستند والمشروع المربوط.
 * @param doc مستند المرسم (لا يُعدَّل)
 * @param project ناتج bindArchitecture().project (الغرف والأدوار بالإحداثيات نفسها)
 * @returns { inputs, summary, assumptions, notes }
 */
export function autoInputs(doc, project, { persons = null, climateZone = DEFAULT_ZONE } = {}) {
  const env = envelopeFor(climateZone, LEGACY_ENVELOPE);
  const A = { ...ASSUMPTIONS, wallU: env.wallU.value, roofU: env.roofU.value, glassU: env.glassU.value, climateZone: env.zone }, inputs = emptyInputs(), notes = [];
  const levels = project.architecture.levels, rooms = project.architecture.rooms;
  const an = analyzeDoc(doc);
  const digestRoom = (r) => { for (const lv of an.levels) { const d = lv.rooms.find(x => x.id === r.id || x.labelIds?.includes(r.id)); if (d) return { lv, d }; } return null; };
  const E = { panels: [], loads: [], lightingByRoom: {}, circuits: [] }, H = { equipment: [], zones: [], exhaust: [] }, P = { fixtures: [], equipment: [], connections: [] };
  const F = { devices: [] }, T = { devices: [] }, S = { devices: [] };
  const phases = ['L1', 'L2', 'L3']; let ph = 0; const nextPhase = () => phases[ph++ % 3];
  const summary = { lights: 0, sockets: 0, circuits: 0, panels: 0, ac: [], acTotalW: 0, fixtures: {}, tankL: null, heaters: 0, fire: 0, lowCurrent: 0, pv: null, connectedW: 0, demandW: 0 };
  const byLevel = new Map(levels.map(l => [l.id, rooms.filter(r => r.levelId === l.id)])), acPlan = [];
  const topLevel = levels.reduce((b, l) => (l.elevationM > b.elevationM ? l : b), levels[0]);
  const bathCount = rooms.filter(r => r.type === 'bath').length;
  const bedrooms = rooms.filter(r => ['bedroom', 'master'].includes(r.type)).length;
  const people = persons || Math.max(4, bedrooms * 2);

  for (const lv of levels) {
    const lrooms = byLevel.get(lv.id) || [];
    if (!lrooms.length) continue;
    // لوحة التوزيع: في غرفة خدمة أو مخزن أو ممر أو مدخل، وإلا أكبر فراغ غير رطب
    const host = ['service', 'storage', 'laundry', 'corridor', 'entrance', 'stairs', 'kitchen'].map(t => lrooms.find(r => r.type === t)).find(Boolean) || lrooms.filter(r => r.type !== 'bath' && r.type !== 'courtyard').sort((a, b) => b.areaM2 - a.areaM2)[0];
    const panelId = 'DB-' + lv.id, pc = interiorPoint(host);
    E.panels.push({ id: panelId, kind: 'PANEL', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x), y: r3(pc.y), z: r3(lv.elevationM + 1.6) }, feed: { voltageV: A.voltageV, phases: 3 } });
    summary.panels++;
    const socketIds = []; let socketW = 0; const flush = (force = false) => {
      // دائرة مقابس لكل ~6 مقابس
      if (!socketIds.length || (!force && socketIds.length < 6)) return;
      const id = `EC-S-${lv.id}-${E.circuits.length + 1}`;
      E.circuits.push(circuit(id, panelId, socketIds.splice(0), nextPhase(), 4, 20, A));
      summary.circuits++;
    };
    for (const room of lrooms) {
      if (room.type === 'courtyard' || room.type === 'balcony') continue;
      const type = room.type in A.lux ? room.type : 'other';
      // الإنارة بطريقة اللومن (الحزمة تحسب العدد وتوزع المواقع)
      { const c = circuit('x', panelId, [], nextPhase(), 2.5, 10, A); E.lightingByRoom[room.id] = { targetLux: A.lux[type], lumensPerFixture: A.lumensPerFixture, utilizationFactor: A.utilizationFactor, maintenanceFactor: A.maintenanceFactor, mountHeightM: Math.min(A.lightMountM, room.heightM - .1), wattsPerFixture: A.wattsPerFixture, powerFactor: A.powerFactor, demandFactor: 1, panelId, phase: c.phase, voltageV: A.voltageV, systemId: c.systemId, routing: c.routing, cable: c.cable, protection: c.protection }; }
      summary.circuits++;
      // المقابس
      const n = A.sockets[type] ?? 2, pts = pointsIn(room, n);
      pts.forEach((p, i) => { const id = `SO-${room.id}-${i + 1}`; E.loads.push({ id, kind: 'SOCKET', levelId: lv.id, roomId: room.id, position: { x: r3(p.x), y: r3(p.y), z: r3(lv.elevationM + A.socketHeightM) }, powerW: A.socketW, powerFactor: A.powerFactor, demandFactor: A.socketDemand, labelAr: 'مقبس عام' }); socketIds.push(id); summary.sockets++; flush(); });
      // أحمال الأجهزة المحددة: المطبخ والغسيل والسخانات والتكييف (دائرة مستقلة لكل حمل)
      const apps = room.type === 'kitchen' ? A.kitchenLoads : room.type === 'laundry' ? A.laundryLoads : [];
      const ap = pointsIn(room, apps.length);
      apps.forEach(([ar, w], i) => { const id = `EQ-${room.id}-${i + 1}`; E.loads.push({ id, kind: 'EQUIPMENT_LOAD', levelId: lv.id, roomId: room.id, position: { x: r3(ap[i].x), y: r3(ap[i].y), z: r3(lv.elevationM + .9) }, powerW: w, powerFactor: A.powerFactor, demandFactor: A.applianceDemand, labelAr: ar }); E.circuits.push(circuit('EC-' + id, panelId, [id], nextPhase(), w > 2000 ? 6 : 4, w > 2000 ? 32 : 20, A)); summary.circuits++; });
      // التكييف: منطقة حرارية لكل فراغ مأهول بغلافه الخارجي الحقيقي من المخطط
      if (['majlis', 'living', 'dining', 'kitchen', 'bedroom', 'master', 'office', 'service', 'entrance', 'other'].includes(room.type) && room.areaM2 >= 6) {
        const dr = digestRoom(room);
        const surfaces = [];
        let glass = 0;
        if (dr) {
          const extLen = dr.d.edges.filter(e => e.exterior).reduce((s, e) => s + e.length, 0);
          const wins = dr.lv.openings.filter(o => o.window && o.sides.some(s => s.room?.id === dr.d.id && s.exterior));
          glass = wins.reduce((s, o) => s + o.area, 0);
          const wallA = Math.max(0, extLen * room.heightM - glass);
          if (wallA > 0) surfaces.push({ id: 'wall', areaM2: r3(wallA), uWm2K: A.wallU });
          if (glass > 0) surfaces.push({ id: 'glass', areaM2: r3(glass), uWm2K: A.glassU });
        }
        if (lv.id === topLevel.id) surfaces.push({ id: 'roof', areaM2: r3(room.areaM2), uWm2K: A.roofU });
        if (!surfaces.length) surfaces.push({ id: 'none', areaM2: 0, uWm2K: 0 });
        const pp = A.persons[room.type] ?? A.persons.other, vol = room.areaM2 * room.heightM;
        const zoneId = 'Z-' + room.id, acId = 'AC-' + room.id, c = interiorPoint(room);
        const thermal = { outdoorC: A.outdoorC, indoorC: A.indoorC, surfaces, solarW: r3(glass * A.solarWPerM2Glass), internalSensibleW: r3(pp * A.personSensibleW + room.areaM2 * A.equipmentWPerM2), internalLatentW: r3(pp * A.personLatentW), infiltrationM3S: vol * A.infiltrationACH / 3600, outdoorAirM3S: 0, outdoorHumidityRatio: A.outdoorHumidity, indoorHumidityRatio: A.indoorHumidity, densityKgM3: A.densityKgM3, cpJkgK: A.cpJkgK, latentHeatJkg: A.latentHeatJkg };
        let gainW = room.areaM2 * 120; try { gainW = steadyStateHeatGain(thermal).totalW; } catch { /* يبقى التقدير بالمساحة */ }
        const btu = splitBtu(gainW, room.areaM2), ratedInputW = Math.round(btu / A.btuPerW / 1000 * A.acPowerPerKW);
        // الوحدة الداخلية قرب جدار (مزاحة عن المركز نحو أبعد حافة) والمخرج في المركز؛ دكت قصير بينهما
        const bb = bounds(room.polygon), dx = (bb.maxX - bb.minX), dy = (bb.maxY - bb.minY);
        let ep = dx >= dy ? { x: c.x + dx * .3, y: c.y } : { x: c.x, y: c.y + dy * .3 }; if (!inside(ep, room.polygon)) ep = c;
        H.equipment.push({ id: acId, kind: 'AIR_EQUIPMENT', levelId: lv.id, roomId: room.id, position: { x: r3(ep.x), y: r3(ep.y), z: r3(lv.elevationM + 2.4) }, labelAr: 'وحدة سبليت مقترحة', ratedInputW, selectedBtuPerH: btu, estimatedGainW: Math.round(gainW) });
        H.zones.push({ id: zoneId, roomId: room.id, equipmentId: acId, thermal, ventilation: { persons: pp, lSPerPerson: 2.5, lSPerM2: .3, distributionEffectiveness: 1 }, supplyDeltaK: A.supplyDeltaK, terminalHeightM: Math.min(A.terminalHeightM, room.heightM - .2), ductVelocityMS: A.ductVelocityMS, routing: { routeHeightM: 2.6, widthM: .25, heightM: .25, clearanceM: .05 } });
        acPlan.push({ room, lv, acId, ratedInputW });
      }
      // الشفط: دورات المياه والمطابخ
      if (room.type === 'bath' || room.type === 'kitchen' || room.type === 'laundry') {
        const c = interiorPoint(room);
        H.exhaust.push({ id: 'EX-' + room.id, roomId: room.id, airChangesPerHour: room.type === 'kitchen' ? 15 : 10, fan: { position: { x: r3(c.x), y: r3(c.y), z: r3(lv.elevationM + room.heightM - .3) } } });
      }
      // الأجهزة الصحية من المرسوم فعلًا في المرسم (مرحاض/مغسلة/دش/حوض مطبخ) ثم صفاية لكل فراغ رطب
      const fx = doc.fixtures.filter(f => f.level === lv.id && inside({ x: f.x, y: f.y }, room.polygon));
      const MAP = { wc: 'WC', basin: 'BASIN', shower: 'SHOWER', bathtub: 'SHOWER', 'kitchen-run': 'SINK', 'kitchen-island': null };
      let k = 0;
      for (const f of fx) { const kind = MAP[f.kind]; if (!kind) continue; k++; const id = `${kind}-${room.id}-${k}`; P.fixtures.push({ id, kind, levelId: lv.id, roomId: room.id, position: { x: r3(f.x), y: r3(f.y), z: r3(lv.elevationM) }, flowLs: A.fixtureFlowLs[kind] }); summary.fixtures[kind] = (summary.fixtures[kind] || 0) + 1; }
      if (room.type === 'bath' || room.type === 'kitchen' || room.type === 'laundry') { const c = interiorPoint(room); const id = `FD-${room.id}`; P.fixtures.push({ id, kind: 'FLOOR_DRAIN', levelId: lv.id, roomId: room.id, position: { x: r3(c.x), y: r3(c.y), z: r3(lv.elevationM) } }); summary.fixtures.FLOOR_DRAIN = (summary.fixtures.FLOOR_DRAIN || 0) + 1; }
      if (room.type === 'bath') { const c = interiorPoint(room); const id = `WH-${room.id}`; P.equipment.push({ id, kind: 'WATER_HEATER', levelId: lv.id, roomId: room.id, position: { x: r3(c.x), y: r3(c.y), z: r3(lv.elevationM + 2.2) }, ratedInputW: A.waterHeaterW }); summary.heaters++;
        const lid = 'EQ-' + id; E.loads.push({ id: lid, kind: 'EQUIPMENT_LOAD', levelId: lv.id, roomId: room.id, position: { x: r3(c.x), y: r3(c.y), z: r3(lv.elevationM + 2.2) }, powerW: A.waterHeaterW, powerFactor: 1, demandFactor: .6, sourceEquipmentId: id, labelAr: 'سخان مياه' }); E.circuits.push(circuit('EC-' + lid, panelId, [lid], nextPhase(), 4, 20, A)); summary.circuits++; }
      // الحريق والتيار الخفيف
      const c0 = interiorPoint(room), zc = r3(lv.elevationM + room.heightM - .05);
      if (A.smokeDetectorRooms.includes(room.type)) { F.devices.push({ id: 'SD-' + room.id, kind: 'SMOKE_DETECTOR', levelId: lv.id, roomId: room.id, position: { x: r3(c0.x), y: r3(c0.y), z: zc } }); summary.fire++; }
      if (A.heatDetectorRooms.includes(room.type)) { F.devices.push({ id: 'HD-' + room.id, kind: 'HEAT_DETECTOR', levelId: lv.id, roomId: room.id, position: { x: r3(c0.x), y: r3(c0.y), z: zc } }); summary.fire++; }
      if (room.type === 'kitchen') { F.devices.push({ id: 'FE-' + room.id, kind: 'EXTINGUISHER', levelId: lv.id, roomId: room.id, position: { x: r3(c0.x), y: r3(c0.y), z: r3(lv.elevationM + 1) } }); summary.fire++; }
      if (A.dataOutletRooms.includes(room.type)) { T.devices.push({ id: 'DO-' + room.id, kind: 'DATA_OUTLET', levelId: lv.id, roomId: room.id, position: { x: r3(c0.x), y: r3(c0.y), z: r3(lv.elevationM + .4) } }); summary.lowCurrent++; }
      if (A.tvRooms.includes(room.type)) { T.devices.push({ id: 'TV-' + room.id, kind: 'TV_OUTLET', levelId: lv.id, roomId: room.id, position: { x: r3(c0.x + .3), y: r3(c0.y), z: r3(lv.elevationM + 1.2) } }); summary.lowCurrent++; }
      if (room.type === 'entrance') { T.devices.push({ id: 'IC-' + room.id, kind: 'INTERCOM', levelId: lv.id, roomId: room.id, position: { x: r3(c0.x), y: r3(c0.y), z: r3(lv.elevationM + 1.4) } }, { id: 'CAM-' + room.id, kind: 'CCTV_CAMERA', levelId: lv.id, roomId: room.id, position: { x: r3(c0.x), y: r3(c0.y), z: r3(lv.elevationM + 2.6) } }); summary.lowCurrent += 2; }
    }
    flush(true);
    // لوحة الإنذار وخزانة الشبكة ونقطة الإنذار مع لوحة التوزيع
    if (lv.id === levels[0].id) {
      F.devices.push({ id: 'FAP-1', kind: 'FIRE_ALARM_PANEL', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x + .2), y: r3(pc.y), z: r3(lv.elevationM + 1.5) } }, { id: 'MCP-1', kind: 'MANUAL_CALL_POINT', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x - .2), y: r3(pc.y), z: r3(lv.elevationM + 1.2) } }, { id: 'SND-1', kind: 'SOUNDER', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x), y: r3(pc.y + .2), z: r3(lv.elevationM + 2.4) } });
      T.devices.push({ id: 'RACK-1', kind: 'DATA_RACK', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x), y: r3(pc.y - .2), z: r3(lv.elevationM + 1.2) } });
      summary.fire += 3; summary.lowCurrent++;
      // مصدر المياه والخزان والمضخة في فراغ خدمة الدور الأرضي
      P.equipment.push({ id: 'WS-1', kind: 'WATER_SOURCE', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x + .4), y: r3(pc.y), z: r3(lv.elevationM) } }, { id: 'TK-1', kind: 'TANK', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x - .4), y: r3(pc.y), z: r3(lv.elevationM) }, volume: { persons: people, litresPerPersonDay: A.litresPerPersonDay, autonomyDays: A.autonomyDays } }, { id: 'PMP-1', kind: 'PUMP', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x), y: r3(pc.y + .4), z: r3(lv.elevationM) }, ratedInputW: 750 });
      P.tank = { persons: people, litresPerPersonDay: A.litresPerPersonDay, autonomyDays: A.autonomyDays };
      P.hotWater = { flowM3S: A.fixtureFlowLs.SHOWER * 2 / 1000, deltaK: 35, densityKgM3: 1000, cpJkgK: 4186, efficiency: .95 };
      summary.tankL = people * A.litresPerPersonDay * A.autonomyDays;
      const pid = 'EQ-PMP-1'; E.loads.push({ id: pid, kind: 'EQUIPMENT_LOAD', levelId: lv.id, roomId: host.id, position: { x: r3(pc.x), y: r3(pc.y + .4), z: r3(lv.elevationM + .5) }, powerW: 750, powerFactor: .85, demandFactor: .5, sourceEquipmentId: 'PMP-1', labelAr: 'مضخة مياه' }); E.circuits.push(circuit('EC-' + pid, panelId, [pid], nextPhase(), 2.5, 16, A)); summary.circuits++;
    }
  }
  // أحمال التكييف الكهربائية من سعة الوحدة المختارة (COP ≈ 3)، مربوطة بالجهاز لفحص الواجهة الكهربائية
  for (const { room, lv, acId, ratedInputW } of acPlan) {
    const eq = H.equipment.find(e => e.id === acId), id = 'EQ-' + acId;
    E.loads.push({ id, kind: 'EQUIPMENT_LOAD', levelId: lv.id, roomId: room.id, position: { ...eq.position }, powerW: ratedInputW, powerFactor: .9, demandFactor: A.acDemand, sourceEquipmentId: acId, labelAr: 'وحدة تكييف' });
    E.circuits.push(circuit('EC-' + id, 'DB-' + lv.id, [id], nextPhase(), ratedInputW > 2500 ? 6 : 4, ratedInputW > 2500 ? 32 : 20, A)); summary.circuits++;
  }
  // الطاقة الشمسية: ألواح على سطح الدور الأعلى بنسبة 15٪ من مسطحه (نظام سكني صغير)
  { const roofA = (byLevel.get(topLevel.id) || []).reduce((s, r) => s + (r.type === 'courtyard' ? 0 : r.areaM2), 0);
    const n = Math.max(0, Math.floor(roofA * A.pvRoofFraction / A.pvPanelAreaM2));
    if (n > 0) { const host = (byLevel.get(topLevel.id) || []).filter(r => r.type !== 'courtyard').sort((a, b) => b.areaM2 - a.areaM2)[0]; const c = interiorPoint(host);
      S.devices.push({ id: 'INV-1', kind: 'INVERTER', levelId: topLevel.id, roomId: host.id, position: { x: r3(c.x), y: r3(c.y), z: r3(topLevel.elevationM + 1.5) } });
      S.capacity = { panelCount: n, wattsPerPanel: A.pvWattsPerPanel }; summary.pv = { panels: n, kWp: r3(n * A.pvWattsPerPanel / 1000), roofM2: r3(roofA) }; }
  }
  inputs.services = { electrical: E, hvac: H, plumbing: P, fire: F, low_current: T, solar: S };
  inputs.rules.provenance = [
    { id: 'SBC602-ENVELOPE-U', classification: env.wallU.status === 'verified' && env.roofU.status === 'verified' && env.glassU.status === 'verified' ? 'CODE_VALUE_SECONDARY_SOURCE' : 'PARTLY_UNVERIFIED', authority: SBC602_SOURCE.code, verifiedCodeClause: null,
      noteAr: `معاملات الغلاف (${SBC602_SOURCE.path}، ${env.zoneAr}): جدار U=${A.wallU} [${env.wallU.status === 'verified' ? 'من الكود' : 'غير متحقق'}]، سقف U=${A.roofU} [${env.roofU.status === 'verified' ? 'من الكود' : 'غير متحقق'}]، نافذة U=${A.glassU} [${env.glassU.status === 'verified' ? 'من الكود' : 'غير متحقق'}]. المراجع: ${SBC602_SOURCE.refs.join('؛ ')}. تُراجع مع النسخة الرسمية.`, envelope: env },
    { id: 'MIZAN-AUTO-INPUTS', classification: 'PROJECT_ASSUMPTION', authority: 'ALMIZAN_AUTO_MEP', verifiedCodeClause: null, noteAr: AUTO_NOTE_AR + ' الإنارة: ' + JSON.stringify(A.lux) + ' لوكس بوحدة ' + A.lumensPerFixture + ' لومن/' + A.wattsPerFixture + ' واط؛ المقابس ' + A.socketW + ' واط بطلب ' + A.socketDemand + '؛ التكييف: خارج ' + A.outdoorC + '°C داخل ' + A.indoorC + '°C، U جدار ' + A.wallU + ' زجاج ' + A.glassU + ' سقف ' + A.roofU + '، إشعاع ' + A.solarWPerM2Glass + ' W/m² زجاج؛ المياه ' + A.litresPerPersonDay + ' ل/شخص/يوم × ' + A.autonomyDays + ' يوم لـ' + people + ' أشخاص.' },
  ];
  inputs.auto = { version: AUTO_VERSION, persons: people };
  summary.persons = people;
  summary.lightsRooms = Object.keys(E.lightingByRoom).length;
  summary.zones = H.zones.length;
  notes.push(AUTO_NOTE_AR);
  return { inputs, summary, assumptions: A, notes };
}

/** ملخص بالأرقام من نتيجة الحساب (بعد computeSystems): للعرض في صفحة الأنظمة وكتاب المشروع. */
export function autoSummary(result, inputs, project) {
  const S = { ...((inputs.auto && { persons: inputs.auto.persons }) || {}) };
  const disc = id => (result.disciplines || []).find(d => d.id === id) || result[id] || null;
  const el = disc('electrical'), hv = disc('hvac'), pl = disc('plumbing');
  const sched = (d, id) => d?.schedules?.find(s => s.id === id)?.rows || [];
  S.lights = (el?.devices || []).filter(d => d.id.startsWith('EL-')).length;
  S.sockets = (el?.devices || []).filter(d => d.kind === 'SOCKET').length;
  const circuits = sched(el, 'electrical-circuits');
  S.circuits = circuits.length; S.connectedW = Math.round(circuits.reduce((s, r) => s + (r.connectedW || 0), 0)); S.demandW = Math.round(circuits.reduce((s, r) => s + (r.demandW || 0), 0));
  S.maxCurrentA = Math.max(0, ...circuits.map(r => r.currentA || 0));
  S.panels = sched(el, 'electrical-panels').map(r => ({ id: r.id, demandW: r.demandW === null ? null : Math.round(r.demandW), kVA: r.vectorApparentVA === null ? null : Math.round(r.vectorApparentVA / 100) / 10 }));
  const zones = sched(hv, 'hvac-zones');
  const rooms = project?.architecture?.rooms || [];
  const eqs = hv?.devices || [];
  S.ac = zones.map(z => { const room = rooms.find(r => r.id === z.roomId), eq = eqs.find(e => e.id === z.equipmentId); const w = z.totalGainW; return { room: room?.name || z.roomId, areaM2: room ? Math.round(room.areaM2 * 10) / 10 : null, gainW: w === null ? null : Math.round(w), btu: eq?.selectedBtuPerH ?? (w === null ? null : splitBtu(w, room?.areaM2 || 0)), inputW: eq?.ratedInputW ?? null, supplyLs: z.supplyM3S === null ? null : Math.round(z.supplyM3S * 1000) }; });
  S.acTotalW = Math.round(S.ac.reduce((s, z) => s + (z.gainW || 0), 0)); S.acTotalTR = Math.round(S.acTotalW / 3517 * 10) / 10;
  S.acSelectedBtu = S.ac.reduce((s, z) => s + (z.btu || 0), 0); S.acSelectedTR = Math.round(S.acSelectedBtu / 12000 * 10) / 10;
  S.fixtures = {}; for (const d of pl?.devices || []) if (['WC', 'BASIN', 'SHOWER', 'SINK', 'FLOOR_DRAIN', 'WATER_HEATER'].includes(d.kind)) S.fixtures[d.kind] = (S.fixtures[d.kind] || 0) + 1;
  const tank = (pl?.calculations || []).find(c => c.id === 'P-TANK'), heat = (pl?.calculations || []).find(c => c.id === 'P-HEAT');
  S.tankL = tank && typeof tank.value === 'number' ? Math.round(tank.value) : null;
  S.hotWaterW = heat && typeof heat.value === 'number' ? Math.round(heat.value) : null;
  S.fire = (disc('fire')?.devices || []).length; S.lowCurrent = (disc('low_current')?.devices || []).length;
  const pv = (disc('solar')?.calculations || []).find(c => c.id === 'S-DC');
  S.pv = inputs.services?.solar?.capacity ? { panels: inputs.services.solar.capacity.panelCount, kWp: Math.round(inputs.services.solar.capacity.panelCount * inputs.services.solar.capacity.wattsPerPanel / 100) / 10, dcW: pv?.value ?? null } : null;
  S.issues = { errors: 0, reviews: 0 }; for (const d of result.disciplines || []) for (const i of d.issues || []) (i.severity === 'error' ? S.issues.errors++ : S.issues.reviews++);
  return S;
}
export default { AUTO_VERSION, ASSUMPTIONS, autoInputs, autoSummary, kindAr };
