// جداول الأنظمة بالعربية عند التنزيل (CSV): رؤوس الأعمدة وقيم التصنيف (التخصص، النوع، الوحدة، الحالة) بالعربية.
// المعرّفات (id، رقم اللوحة، رقم الدائرة) تبقى كما هي لأنها مراجع في المخططات. مخرجات المحرك نفسه لا تُمس.
export const COLUMN_AR = Object.freeze({
  id: 'المعرّف', key: 'المفتاح', panelId: 'اللوحة', loadCount: 'عدد الأحمال', connectedW: 'الحمل الموصول (واط)', demandW: 'الطلب (واط)',
  currentA: 'التيار (أمبير)', oneWayLengthM: 'طول الكابل ذهابًا (م)', voltageDropPercent: 'هبوط الجهد (٪)', cableSizeMm2: 'مقطع الكابل (مم²)',
  breakerA: 'القاطع (أمبير)', protectionCheck: 'فحص الحماية', demandVar: 'الطلب غير الفعّال (فار)', vectorApparentVA: 'القدرة الظاهرية (فولت أمبير)',
  phaseL1VA: 'الطور الأول (فولت أمبير)', phaseL2VA: 'الطور الثاني (فولت أمبير)', phaseL3VA: 'الطور الثالث (فولت أمبير)',
  roomId: 'الفراغ', roomName: 'اسم الفراغ', sensibleGainW: 'الحمل المحسوس (واط)', latentGainW: 'الحمل الكامن (واط)', totalGainW: 'الحمل الكلي (واط)',
  supplyM3S: 'هواء التغذية (م³/ث)', outdoorAirM3S: 'الهواء الخارجي (م³/ث)', areaEquivalentDuctM: 'قطر الدكت المكافئ (م)', equipmentId: 'الوحدة',
  selectedCapacityW: 'السعة المختارة (واط)', system: 'الشبكة', fromId: 'من', toId: 'إلى', flowM3S: 'التدفق (م³/ث)', equivalentDiameterM: 'القطر المكافئ (م)',
  selectedDiameterMm: 'القطر المختار (مم)', lengthM: 'الطول (م)', horizontalLengthM: 'الطول الأفقي (م)', slope: 'الميل', fallM: 'الهبوط (م)',
  endInvertM: 'منسوب القاع عند النهاية (م)', routeStatus: 'حالة المسار', kind: 'النوع', levelId: 'الدور', discipline: 'التخصص', layer: 'الطبقة',
  unit: 'الوحدة', quantity: 'الكمية', rate: 'سعر الوحدة', amount: 'المبلغ',
});
export const VALUE_AR = Object.freeze({
  discipline: { electrical: 'الكهرباء', hvac: 'التكييف والتهوية', plumbing: 'السباكة', fire: 'الحريق', low_current: 'التيار الخفيف', solar: 'الطاقة الشمسية' },
  unit: { each: 'عدد', m: 'م', m2: 'م²', m3: 'م³' },
  kind: {
    PANEL: 'لوحة توزيع', SOCKET: 'مقبس', EQUIPMENT_LOAD: 'حمل جهاز', LUMINAIRE: 'وحدة إنارة', AIR_EQUIPMENT: 'وحدة تكييف', SUPPLY_TERMINAL: 'فتحة تغذية هواء',
    EXHAUST_FAN: 'مروحة شفط', WC: 'مرحاض', BASIN: 'مغسلة', FLOOR_DRAIN: 'صفاية أرضية', SINK: 'حوض مطبخ', SHOWER: 'دش', WATER_HEATER: 'سخان مياه',
    WATER_SOURCE: 'مصدر مياه', TANK: 'خزان', PUMP: 'مضخة', SMOKE_DETECTOR: 'كاشف دخان', HEAT_DETECTOR: 'كاشف حرارة', EXTINGUISHER: 'طفاية حريق',
    FIRE_ALARM_PANEL: 'لوحة إنذار حريق', MANUAL_CALL_POINT: 'نقطة إنذار يدوية', SOUNDER: 'جرس إنذار', INTERCOM: 'إنتركم', CCTV_CAMERA: 'كاميرا مراقبة',
    DATA_OUTLET: 'مخرج بيانات', TV_OUTLET: 'مخرج تلفاز', DATA_RACK: 'خزانة شبكة', INVERTER: 'عاكس شمسي', PV_PANEL: 'لوح شمسي', PV_ARRAY: 'مصفوفة ألواح شمسية',
  },
  kindPrefix: { CONCEPT_HOME_RUN: 'مسار كابل مبدئي', SUPPLY_DUCT_PROPOSAL: 'دكت تغذية مقترح' },
  protectionCheck: { WITHIN_SUPPLIED_AMPACITY: 'ضمن سعة الكابل', EXCEEDS_SUPPLIED_AMPACITY: 'يتجاوز سعة الكابل', NOT_EVALUATED: 'لم يُقيَّم' },
  routeStatus: { ROUTED: 'مُسار', BLOCKED: 'مسدود', CONCEPT: 'مبدئي' },
  system: { COLD_WATER: 'مياه باردة', HOT_WATER: 'مياه ساخنة', DRAINAGE: 'صرف', SOIL: 'صرف صحي', VENT: 'تهوية صرف', STORM: 'أمطار' },
});
const SCHEDULE_AR = Object.freeze({
  'electrical-circuits': 'جدول الدوائر الكهربائية', 'electrical-panels': 'جدول اللوحات', 'hvac-zones': 'جدول مناطق التكييف',
  'plumbing-connections': 'جدول وصلات السباكة', 'fire-devices': 'جدول عناصر الحريق', 'low_current-devices': 'جدول عناصر التيار الخفيف',
  'solar-devices': 'جدول عناصر الطاقة الشمسية', quantities: 'جدول كميات الأنظمة',
});
export const scheduleNameAr = id => SCHEDULE_AR[id] || id;

function valueAr(col, v) {
  if (typeof v !== 'string') return v;
  const map = VALUE_AR[col]; if (map && map[v]) return map[v];
  if (col === 'kind') { for (const [k, ar] of Object.entries(VALUE_AR.kindPrefix)) if (v.startsWith(k)) return ar + v.slice(k.length); }
  return v;
}
/** CSV بالعربية (BOM لفتحه صحيحًا في إكسل): رؤوس عربية وقيم تصنيف عربية، ومنع حقن الصيغ. */
export function csvAr(columns, rows, { roomNames = {} } = {}) {
  const cols = columns.includes('roomId') && Object.keys(roomNames).length ? [...columns.slice(0, columns.indexOf('roomId') + 1), 'roomName', ...columns.slice(columns.indexOf('roomId') + 1)] : columns;
  const cell = v => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (typeof v === 'string' && /^[=+@\-\t\r]/.test(v)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const get = (r, c) => (c === 'roomName' ? roomNames[r.roomId] ?? '' : valueAr(c, r[c]));
  return '﻿' + [cols.map(c => cell(COLUMN_AR[c] || c)).join(','), ...rows.map(r => cols.map(c => cell(get(r, c))).join(','))].join('\r\n') + '\r\n';
}
/** جدول من نتيجة الأنظمة بالعربية: scheduleId أو 'quantities'. */
export function scheduleCsvAr(result, scheduleId, project = null) {
  const roomNames = Object.fromEntries((project?.architecture?.rooms || []).map(r => [r.id, r.name || '']));
  if (!scheduleId || scheduleId === 'quantities') return csvAr(['discipline', 'kind', 'layer', 'unit', 'quantity', 'rate', 'amount'], result.quantities.rows, { roomNames });
  for (const d of result.disciplines) { const s = d.schedules.find(x => x.id === scheduleId); if (s) return csvAr(s.columns, s.rows, { roomNames }); }
  return null;
}
