// Mizan requirements-to-geometry evidence, V1.
// This is an honest, read-only audit of the actual model selected by AZIZ.
// It does not change the Claude/Gemini/AZIZ pipeline or certify code compliance.
import { quantities } from './planner.mjs';
import { circulationNetwork } from './circulation.mjs';
import { unverifiedCheck, createRegulatoryCheck, REGULATORY_STATUS, toEvidenceRow } from './regulatory-checks.mjs';

// Real, dated source for Riyadh residential construction requirements. This is a
// national ministerial decision (not a Riyadh-only code); Amanat Al-Riyadh applies
// it to building permits in Riyadh. No separate Riyadh-only building code was found
// when this was researched. Cross-checked against two independent reputable news
// reports (ajel.sa, okaz.com.sa) and the ministry's own published PDF; the exact
// ministerial decision number could not be read with full confidence from OCR, so
// only the independently-corroborated effective date is cited as the version.
const RIYADH_MOMAH_SOURCE = Object.freeze({
  document: 'اشتراطات إنشاء المباني السكنية — قرار وزير الشؤون البلدية والقروية والإسكان (اشتراط وزاري وطني تطبّقه أمانة منطقة الرياض على تصاريح البناء في الرياض؛ لم يُعثر على كود بناء منفصل خاص بالرياض وحدها)',
  version: 'ساري من ٨ محرم ١٤٤٦هـ الموافق ١٤ يوليو ٢٠٢٤م',
});
const RIYADH_JURISDICTION_ID = 'riyadh-momah-1446h';
// Fixed to the date this source was actually looked up and cross-checked, not
// today's date — a verification date should not silently roll forward on its own.
const RIYADH_MOMAH_VERIFIED_DATE = '2026-10-13';

export const REQUIREMENT_STATUS = Object.freeze({
  ENFORCED: 'ENFORCED',
  MEASURED: 'MEASURED',
  NOT_MET: 'NOT_MET',
  UNVERIFIED: 'UNVERIFIED',
  UNSUPPORTED: 'UNSUPPORTED',
});
const number = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const fmt = (value, decimals = 1) => Number(value).toLocaleString('ar-SA', { maximumFractionDigits: decimals });
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const round = n => Math.round(n * 10) / 10;
const make = (id, title, status, evidence, source = 'النموذج الهندسي', category = 'تخطيط') =>
  ({ id, title, status, evidence, source, category });

export function evaluateRequirementEvidence({ model, program, plot: requestedPlot = null, idea = '', discovery = {}, briefContext = null, jurisdiction = null } = {}) {
  const riyadh = jurisdiction === RIYADH_JURISDICTION_ID;
  if (!model || !Array.isArray(model.rooms) || !Array.isArray(model.openings) || !Array.isArray(model.corridors)) {
    throw Error('يلزم نموذج هندسي صالح لعرض أدلة المتطلبات.');
  }
  // Only compare against the generation-time program explicitly supplied by the
  // caller. A restored project's current editor state is not proof of what the
  // selected geometry was originally asked to satisfy.
  const hasOriginalProgram = Array.isArray(program);
  const expected = hasOriginalProgram ? program : [];
  const q = quantities(model), network = circulationNetwork(model), rows = [];
  const add = (...args) => rows.push(make(...args));
  const roomsById = new Map(model.rooms.map(room => [room.id, room]));
  const requested = expected.map((room, index) => ({
    id: room.id || 'room-' + index,
    name: String(room.name || ''),
    type: room.type,
    area: number(room.area ?? room.areaM2),
    dimensions: room.dimensions ? { width: number(room.dimensions.width), length: number(room.dimensions.length) } : null,
  }));
  const mismatches = requested.flatMap(room => {
    const actual = roomsById.get(room.id);
    if (!actual) return ['لم تُرسم: ' + room.name];
    const problems = [];
    if (actual.type !== room.type) problems.push('نوع الفراغ مختلف');
    if (actual.name !== room.name) problems.push('الاسم مختلف');
    const measured = Number(actual.w) * Number(actual.h);
    if (room.area === null || !Number.isFinite(measured) || Math.abs(measured - room.area) > Math.max(.05, room.area * .001)) {
      problems.push('المساحة المطلوبة ' + (room.area === null ? 'غير متاحة' : fmt(room.area) + ' م²') + '، المرسومة ' + (Number.isFinite(measured) ? round(measured) + ' م²' : 'غير قابلة للقياس'));
    }
    if (room.dimensions) {
      const expectedW = room.dimensions.width, expectedH = room.dimensions.length;
      const actualW = Number(actual.w), actualH = Number(actual.h);
      const validExpected = expectedW !== null && expectedH !== null && expectedW > 0 && expectedH > 0;
      const tolerance = value => Math.max(.05, value * .001);
      const direct = validExpected && Number.isFinite(actualW) && Number.isFinite(actualH) &&
        Math.abs(actualW - expectedW) <= tolerance(expectedW) && Math.abs(actualH - expectedH) <= tolerance(expectedH);
      const rotated = validExpected && Number.isFinite(actualW) && Number.isFinite(actualH) &&
        Math.abs(actualW - expectedH) <= tolerance(expectedH) && Math.abs(actualH - expectedW) <= tolerance(expectedW);
      if (!direct && !rotated) problems.push(validExpected
        ? 'الأبعاد الصريحة لا تطابق المطلوب ' + fmt(expectedW, 2) + ' × ' + fmt(expectedH, 2) + ' م؛ المرسوم ' + (Number.isFinite(actualW) && Number.isFinite(actualH) ? fmt(actualW, 2) + ' × ' + fmt(actualH, 2) + ' م' : 'غير قابل للقياس')
        : 'الأبعاد الصريحة الأصلية غير صالحة للمقارنة');
    }
    return problems.length ? [problems.join('، ') + ': ' + room.name] : [];
  });
  const expectedIds = new Set(requested.map(room => room.id));
  const extras = model.rooms.filter(room => !expectedIds.has(room.id)).map(room => room.name);
  if (!hasOriginalProgram || !requested.length) {
    add('program', 'عدد الغرف ومساحاتها وهوية الفراغات', 'UNVERIFIED',
      'قاس النموذج ' + fmt(model.rooms.length, 0) + ' فراغًا بمجموع صافي ' + fmt(q.rooms) + ' م². لا تتوفر نسخة برنامج الغرف الأصلية المرتبطة بهذا التوليد للمقارنة؛ لا يمكن إثبات حفظ العدد أو المساحات أو الأسماء والأنواع.',
      'هندسة البديل فقط', 'متطلبات إلزامية');
  } else if (mismatches.length || extras.length) {
    const problems = [...mismatches, ...extras.map(name => 'فراغ إضافي: ' + name)];
    add('program', 'عدد الغرف ومساحاتها', 'NOT_MET',
      problems.slice(0, 4).join('؛ ') + (problems.length > 4 ? '؛ و' + fmt(problems.length - 4, 0) + ' فروق أخرى.' : ''),
      'برنامج الغرف', 'متطلبات إلزامية');
  } else {
    add('program', 'عدد الغرف ومساحاتها وهوية الفراغات', 'ENFORCED',
      'تطابقت ' + fmt(requested.length, 0) + ' فراغات مرتبطة بالاسم والنوع ومعرّف الغرفة والمساحة الصافية ضمن دقة القياس ±0.05 م² أو 0.1٪' +
      (requested.some(room => room.dimensions) ? '، والأبعاد الصريحة (مع السماح بتدوير الغرفة 90°).' : '') + ' الصافي المرسوم: ' + fmt(q.rooms) + ' م².',
      'برنامج الغرف', 'متطلبات إلزامية');
  }

  const requestedFloors = number(requestedPlot?.floors), drawnFloors = number(model.plot?.floors);
  const floorStatus = requestedFloors === null ? 'UNVERIFIED' : requestedFloors > 1 ? 'UNSUPPORTED' : drawnFloors !== requestedFloors ? 'NOT_MET' : 'ENFORCED';
  add('floors', 'عدد الأدوار', floorStatus,
    requestedFloors === null
      ? 'الهندسة المعروضة دور أرضي فقط، لكن عدد الأدوار المطلوب وقت التوليد غير محفوظ؛ لا يمكن إثبات المطابقة.'
      : requestedFloors > 1
        ? 'طُلب ' + fmt(requestedFloors, 0) + ' أدوار؛ توليد الأدوار الإضافية غير مدعوم ولا يُحتسب هذا النموذج تنفيذًا لها.'
        : drawnFloors === requestedFloors ? 'طابق المخطط الدور الأرضي المطلوب كما هو مسجل وقت التوليد.' : 'عدد الأدوار المرسوم لا يطابق العدد المطلوب وقت التوليد.',
    'برنامج الأرض وقت التوليد', 'متطلبات إلزامية');

  const cap = number(requestedPlot?.maxBuiltArea);
  const recordedCap = number(model.plot?.maxBuiltArea);
  if (cap !== null) {
    const capRecorded = recordedCap !== null && Math.abs(recordedCap - cap) <= .05;
    const ok = q.footprint <= cap + .05;
    const status = !capRecorded || !ok ? 'NOT_MET' : 'ENFORCED';
    add('built-area', 'سقف مساحة البناء', status,
      'سقف المساحة الأصلي ' + fmt(cap) + ' م²، والكتلة المرسومة ' + fmt(q.footprint) + ' م².' +
      (!capRecorded ? ' قيمة السقف في المرشح لا تطابق المدخل الأصلي.' : !ok ? ' الكتلة تتجاوز السقف.' : ' لم تتجاوز الكتلة السقف المسجل وقت التوليد.') +
      ' هذه مقارنة هندسية بالحد المدخل وليست مراجعة نظامية.',
      'حد مساحة الأرض المحفوظ وقت التوليد', 'متطلبات إلزامية');
  } else if (recordedCap !== null) {
    add('built-area', 'سقف مساحة البناء', 'UNVERIFIED',
      'يسجل المرشح سقفًا قدره ' + fmt(recordedCap) + ' م² والكتلة ' + fmt(q.footprint) + ' م²، لكن السقف الأصلي المرتبط بالتوليد غير متاح للمقارنة.',
      'بيانات المرشح فقط', 'متطلبات إلزامية');
  }

  // الاشتراطات النظامية (الكود/البلدية): لا يملك هذا المشروع مرجع كود بناء أو
  // بلدية محقق بذاته. القيم أدناه حقائق مقاسة من الرسم فقط (الارتداد المستخدم،
  // نسبة التغطية)، ولا تُعرض كمطابقة أو مخالفة لأي اشتراط نظامي حقيقي؛ كل فحص
  // يُعرض صراحة كـ"لم يتم التحقق" حتى يرتبط المشروع بجهة/كود فعلي.
  const regulatoryCategory = 'الاشتراطات النظامية (الكود/البلدية)';
  if (riyadh) {
    rows.push(toEvidenceRow(createRegulatoryCheck({
      rule: 'الجهة والكود النظامي المعتمد للمشروع',
      measuredLabel: 'المدينة/البلدية أو كود البناء المسجل لهذا المشروع',
      measuredValue: null,
      status: REGULATORY_STATUS.PASS,
      source: { ...RIYADH_MOMAH_SOURCE, verifiedDate: RIYADH_MOMAH_VERIFIED_DATE },
      verificationNote: 'حدد مُعِد هذا المشروع أن موقعه مدينة الرياض. هذا اشتراط وزاري وطني لا كود منفصل خاص بالرياض وحدها؛ أمانة منطقة الرياض هي من يطبّقه على تصاريح البناء فيها.',
    }), { id: 'reg-jurisdiction', category: regulatoryCategory }));
  } else {
    rows.push(toEvidenceRow(unverifiedCheck({
      rule: 'الجهة والكود النظامي المعتمد للمشروع',
      measuredLabel: 'المدينة/البلدية أو كود البناء المسجل لهذا المشروع',
      measuredValue: null,
      verificationNote: 'لا يوجد في بيانات هذا المشروع تحديد لمدينة أو بلدية أو كود بناء معتمد. دون ذلك لا يمكن تحديد الاشتراطات النظامية الفعلية للارتدادات أو نسبة البناء، ولا اعتماد أي فحص في هذا القسم كمطابقة نظامية؛ القيم المقاسة أدناه حقائق هندسية من الرسم فقط.',
    }), { id: 'reg-jurisdiction', category: regulatoryCategory }));
  }

  const streetSetback = number(model.plot?.streetSetback ?? requestedPlot?.streetSetback);
  const streetSetbackNote = 'اشتراط وزارة الشؤون البلدية والقروية والإسكان للفلل: الارتداد الأمامي عن شارع أقل من ٣٠م = خُمس عرض الشارع بحد أدنى ٣م؛ لشارع ٣٠م فأكثر = ٦م كحد أدنى. هذا المشروع لا يسجل عرض الشارع الفعلي لكل جهة، فلا يمكن التأكد آليًا من الحد الكامل المطلوب لشارعك — فقط من كونه لا يقل عن الحد الأدنى المطلق (٣م).';
  if (riyadh && streetSetback !== null && streetSetback < 3) {
    rows.push(toEvidenceRow(createRegulatoryCheck({
      rule: 'ارتداد المبنى عن جهة الشارع',
      measuredLabel: 'الارتداد المستخدم في هذا المخطط',
      measuredValue: streetSetback, unit: 'م',
      status: REGULATORY_STATUS.FAIL,
      source: { ...RIYADH_MOMAH_SOURCE, verifiedDate: RIYADH_MOMAH_VERIFIED_DATE, section: 'البند ٤-١، الفقرة (٤): الارتداد الأمامي خُمس عرض الشارع بحد أدنى ٣م' },
      verificationNote: streetSetbackNote + ' القيمة المستخدمة هنا أقل من هذا الحد الأدنى المطلق في كل الحالات.',
    }), { id: 'reg-street-setback', category: regulatoryCategory }));
  } else {
    rows.push(toEvidenceRow(unverifiedCheck({
      rule: 'ارتداد المبنى عن جهة الشارع',
      measuredLabel: 'الارتداد المستخدم في هذا المخطط',
      measuredValue: streetSetback, unit: 'م',
      verificationNote: riyadh ? streetSetbackNote : undefined,
    }), { id: 'reg-street-setback', category: regulatoryCategory }));
  }

  const neighborSetback = number(model.plot?.neighborSetback ?? requestedPlot?.neighborSetback);
  if (riyadh && neighborSetback !== null) {
    rows.push(toEvidenceRow(createRegulatoryCheck({
      rule: 'ارتداد المبنى عن حدود الجيران',
      measuredLabel: 'الارتداد المستخدم في هذا المخطط',
      measuredValue: neighborSetback, unit: 'م',
      status: neighborSetback >= 1.5 ? REGULATORY_STATUS.PASS : REGULATORY_STATUS.FAIL,
      source: { ...RIYADH_MOMAH_SOURCE, verifiedDate: RIYADH_MOMAH_VERIFIED_DATE, section: 'البند ٤-١، الفقرة (٤): الارتداد عن الجيران والممرات ١.٥م كحد أدنى' },
    }), { id: 'reg-neighbor-setback', category: regulatoryCategory }));
  } else {
    rows.push(toEvidenceRow(unverifiedCheck({
      rule: 'ارتداد المبنى عن حدود الجيران',
      measuredLabel: 'الارتداد المستخدم في هذا المخطط',
      measuredValue: neighborSetback, unit: 'م',
    }), { id: 'reg-neighbor-setback', category: regulatoryCategory }));
  }

  const plotWidth = number(model.plot?.width ?? requestedPlot?.width);
  const plotLength = number(model.plot?.length ?? requestedPlot?.length);
  const landArea = plotWidth !== null && plotLength !== null ? plotWidth * plotLength : null;
  const coverageRatio = landArea && landArea > 0 ? round(q.footprint / landArea * 100) : null;
  const assumedCoverageCap = number(model.plot?.coverage ?? requestedPlot?.coverage);
  if (riyadh && coverageRatio !== null) {
    rows.push(toEvidenceRow(createRegulatoryCheck({
      rule: 'أقصى نسبة بناء (تغطية الأرض)',
      measuredLabel: 'نسبة مساحة الكتلة المرسومة إلى مساحة الأرض',
      measuredValue: coverageRatio, unit: '%',
      status: coverageRatio <= 75 ? REGULATORY_STATUS.PASS : REGULATORY_STATUS.FAIL,
      source: { ...RIYADH_MOMAH_SOURCE, verifiedDate: RIYADH_MOMAH_VERIFIED_DATE, section: 'البند ٤-١، الفقرتان (١) و(٢): لا تتجاوز نسبة بناء الدور الأرضي والدور الأول ٧٥٪ من مساحة الأرض' },
      verificationNote: (assumedCoverageCap !== null
        ? 'استخدم التوليد افتراض نسبة بناء داخلي قدره ' + fmt(assumedCoverageCap * 100, 0) + '٪ كحد تصميمي قابل للتعديل. '
        : '') + 'هذا الفحص لدور أرضي واحد فقط، وهو كل ما يولّده هذا المحرك حاليًا؛ لا يغطي ملحق الدور العلوي (٧٠٪ من مسطح الدور الأسفل) لأنه غير مدعوم بعد.',
    }), { id: 'reg-coverage', category: regulatoryCategory }));
  } else {
    rows.push(toEvidenceRow(unverifiedCheck({
      rule: 'أقصى نسبة بناء (تغطية الأرض)',
      measuredLabel: 'نسبة مساحة الكتلة المرسومة إلى مساحة الأرض',
      measuredValue: coverageRatio, unit: '%',
      verificationNote: (assumedCoverageCap !== null
        ? 'استخدم التوليد افتراض نسبة بناء داخلي قدره ' + fmt(assumedCoverageCap * 100, 0) + '٪ كحد تصميمي قابل للتعديل، وهو ليس كودًا نظاميًا. '
        : '') + 'يتطلب تأكيد الحد النظامي الفعلي لنسبة البناء من كود البناء أو البلدية المعتمدة لموقع المشروع، بنسخته الحالية وتاريخ تحقق فعلي، أو مراجعة مهندس/جهة مرخّصة.',
    }), { id: 'reg-coverage', category: regulatoryCategory }));
  }

  const relationships = [
    ['majlis', 'dining', 'المجلس إلى الطعام'],
    ['kitchen', 'dining', 'المطبخ إلى الطعام'],
    ['kitchen', 'storage', 'المطبخ إلى المستودع'],
    ['living', 'bedroom', 'الصالة العائلية إلى النوم'],
  ];
  for (const [fromType, toType, title] of relationships) {
    const fromRooms = model.rooms.filter(room => room.type === fromType);
    const toRooms = model.rooms.filter(room => room.type === toType);
    if (!fromRooms.length || !toRooms.length) continue;
    for (const room of fromRooms) {
      const paths = toRooms.map(other => ({ other, path: network.betweenRooms(room.id, other.id) }))
        .filter(item => item.path && Number.isFinite(item.path.metres))
        .sort((a, b) => a.path.metres - b.path.metres || a.other.id.localeCompare(b.other.id));
      const best = paths[0];
      const label = room.name + ' ← ' + title.split(' إلى ')[1];
      add('route:' + fromType + ':' + toType + ':' + room.id,
        label,
        best ? 'MEASURED' : 'UNVERIFIED',
        best
          ? 'إلى ' + best.other.name + ': ' + fmt(best.path.metres) + ' م عبر محاور الممرات المتصلة. هذه مسافة مقاسة، وليست إثباتًا للتجاور المباشر أو أن المسافة مقبولة.'
          : 'لا يوجد مسار متصل قابل للقياس بين هذا الفراغ وفراغ الوجهة؛ لا تُحتسب المسافة صفرًا.',
        'مسار من الرسم الفعلي', 'علاقات الفراغات');
    }
  }

  const allRoutes = model.rooms.map(room => ({ room, path: network.toRoom(room.id) }));
  const connected = allRoutes.filter(row => row.path && Number.isFinite(row.path.metres));
  const longest = connected.length ? Math.max(...connected.map(row => row.path.metres)) : null;
  const disconnected = allRoutes.length - connected.length;
  const ratio = q.footprint > 0 ? q.circulation / q.footprint * 100 : null;
  add('corridors', 'الممرات والحركة',
    longest === null || disconnected > 0 ? 'UNVERIFIED' : 'MEASURED',
    'مساحة الممرات ' + fmt(q.circulation) + ' م²' +
      (ratio === null ? '' : ' (' + fmt(ratio) + '٪ من المساحة المبنية)') +
      (longest === null ? '؛ لا توجد مسارات متصلة يمكن قياسها.' : '؛ أطول مسار متصل من المدخل إلى باب غرفة ' + fmt(longest) + ' م.') +
      (disconnected > 0 ? '؛ ' + fmt(disconnected, 0) + ' فراغات بلا مسار موثق من المدخل.' : '') +
      ' لا يوجد حد أقصى معتمد للممرات في هذا الفحص.',
    'ممرات النموذج', 'الحركة');

  const avoids = Array.isArray(discovery?.avoids) ? discovery.avoids : [];
  const briefText = String(idea || '') + ' ' + String(briefContext?.intent || '');
  const asksSeparation = avoids.some(value => /مرور الضيوف|كشف الضيوف/.test(value)) ||
    /(?:مسار|مدخل|حركة).{0,25}(?:مستقل|منفصل)|فصل.{0,25}(?:الضيوف|المسارات)/.test(briefText);
  const guestRoutes = allRoutes.filter(row => row.room.type === 'majlis');
  const familyRoutes = allRoutes.filter(row => ['living', 'bedroom'].includes(row.room.type));
  if (guestRoutes.length && familyRoutes.length) {
    const shared = new Set();
    for (const guest of guestRoutes) for (const family of familyRoutes) {
      if (!guest.path || !family.path) continue;
      for (const corridorId of guest.path.spaces || []) {
        if ((family.path.spaces || []).includes(corridorId)) shared.add(corridorId);
      }
    }
    const measuredAll = [...guestRoutes, ...familyRoutes].every(row => !!row.path);
    const failed = asksSeparation && shared.size > 0;
    add('privacy-routes', 'استقلال حركة الضيوف والعائلة',
      failed ? 'NOT_MET' : 'UNVERIFIED',
      shared.size
        ? 'يشترك الضيوف والعائلة في ' + fmt(shared.size, 0) + ' مقطع ممر محسوب. ' +
          (asksSeparation ? 'هذا يخالف طلب الفصل الكامل للمسارات.' : 'لم يُعتمد شرط فصل المسارات صراحة.')
        : measuredAll
          ? 'لم يرصد اشتراك في مقاطع الممرات المحسوبة، لكن استقلال المداخل ومنع الانكشاف البصري لم يثبتا.'
          : 'بعض مسارات الضيوف أو العائلة غير متصلة أو غير قابلة للقياس؛ لا يمكن إثبات الفصل.',
      asksSeparation ? 'طلب خصوصية من العميل' : 'فحص خصوصية أولي', 'الخصوصية');
  }

  const occupied = model.rooms.filter(room => ['bedroom', 'living', 'majlis', 'dining'].includes(room.type));
  const windows = occupied.filter(room => model.openings.some(opening => opening.type === 'window' && opening.roomId === room.id));
  add('daylight', 'الإضاءة والتهوية',
    'UNVERIFIED',
    fmt(windows.length, 0) + ' من ' + fmt(occupied.length, 0) + ' فراغات مأهولة لها نافذة مرسومة. هذا لا يثبت كمية الإضاءة أو التهوية أو سلامة اتجاه النوافذ.',
    'فتحات النموذج', 'البيئة');

  if (avoids.some(value => /صدى الصوت/.test(value)) || /(?:عزل صوتي|صدى الصوت|acoustic)/i.test(briefText)) {
    add('acoustics', 'العزل والصدى', 'UNSUPPORTED',
      'لا توجد محاكاة صوتية أو مواصفات مواد عزل ضمن النموذج الحالي؛ لا يمكن تأكيد معالجة الصدى.',
      'رغبة العميل', 'البيئة');
  }
  if (avoids.some(value => /شمس العصر/.test(value)) || /(?:شمس الغرب|شمس العصر)/.test(briefText)) {
    add('west-sun', 'تجنب شمس العصر', 'UNVERIFIED',
      'المخطط لا يثبت معالجة اكتساب الحرارة والتظليل للواجهات الغربية. يلزم تحليل شمسي مرتبط بموقع النوافذ.',
      'رغبة العميل', 'البيئة');
  }
  if (discovery?.life?.future === 'مهمة' || /(?:توسع مستقبلي|مرونة المستقبل)/.test(briefText)) {
    add('future', 'التوسع المستقبلي', 'UNVERIFIED',
      'المخطط الأرضي لا يثبت قدرة الأساسات أو الأنظمة أو الهيكل على تحمل التوسع المستقبلي.',
      'رغبة العميل', 'المستقبل');
  }
  if (/(?:بدون|دون|لا أريد|لا نريد|لا)\s+(?:فناء|باحة)/.test(briefText)) {
    const courtCount = (model.courtyards || []).length;
    add('no-court', 'عدم إنشاء فناء',
      courtCount ? 'NOT_MET' : 'MEASURED',
      courtCount ? 'يوجد ' + fmt(courtCount, 0) + ' فناء مرسوم رغم طلب استبعاده.' : 'لا توجد مساحة فناء معرفة في هندسة هذا البديل.',
      'طلب صريح من العميل', 'شكل المبنى');
  }
  if (/(?:بدون|دون|لا أريد|لا نريد|لا)\s+مسبح/.test(briefText)) {
    add('no-pool', 'عدم إنشاء مسبح', 'UNVERIFIED',
      'المسبح الخارجي غير ممثل في مخطط الدور الأرضي الحالي؛ غيابه عن الرسم لا يثبت عدم وجوده في تصميم الموقع.',
      'طلب صريح من العميل', 'شكل المبنى');
  }

  const unproven = Array.isArray(briefContext?.constraints) ? briefContext.constraints : [];
  if (unproven.length || String(idea || '').trim()) {
    const sample = unproven.slice(0, 3).join('؛ ');
    add('free-text', 'مطابقة الوصف الحر والتفضيلات', 'UNVERIFIED',
      (unproven.length
        ? 'توجد ' + fmt(unproven.length, 0) + ' رغبات أو قيود تحتاج إثباتًا منفصلًا. ' + sample +
          (unproven.length > 3 ? '؛ وغيرها.' : '.')
        : 'الوصف النصي موجود، لكن لا تتوفر أدلة هندسية لكل عبارة فيه.') +
      ' المقاييس أعلاه تثبت فقط ما ورد فيها صراحة؛ لا يعني نجاح التوليد تنفيذ بقية النص.',
      'وصف العميل والموجز', 'متطلبات غير مثبتة');
  }
  const counts = Object.fromEntries(Object.keys(REQUIREMENT_STATUS).map(key => [key, rows.filter(row => row.status === key).length]));
  return {
    version: '1.0.0',
    modelIdentity: model.integration?.candidateId || model.candidateId || model.engineVersion || (model.shape ? 'shape:' + model.shape + (model.strategy ? ':' + model.strategy : '') : 'unidentified'),
    rows,
    counts,
    note: 'مصفوفة أدلة من النموذج الهندسي نفسه، لا اعتماد إنشائي أو نظامي. القياس لا يعني استيفاء رغبة غير محددة بعتبة. لم تُقيّم جميع تفضيلات النص الحر.',
  };
}

export function renderRequirementEvidenceHTML(evidence) {
  if (!evidence || !Array.isArray(evidence.rows)) return '';
  const labels = {
    ENFORCED: 'مطابق في الرسم',
    MEASURED: 'مقاس دون حكم',
    NOT_MET: 'غير مستوفى',
    UNVERIFIED: 'غير مثبت',
    UNSUPPORTED: 'غير مدعوم',
  };
  return evidence.rows.map(row => {
    const status = Object.hasOwn(labels, row.status) ? row.status : 'UNVERIFIED';
    return '<article class="requirement-row" data-evidence-status="' + status + '">' +
    '<div class="requirement-row-head"><div><span class="requirement-category">' + escapeHTML(row.category) + '</span><h3>' +
    escapeHTML(row.title) + '</h3></div><span class="requirement-status">' + escapeHTML(labels[status]) + '</span></div>' +
    '<p>' + escapeHTML(row.evidence) + '</p><small>المصدر: ' + escapeHTML(row.source) + '</small></article>';
  }).join('');
}
