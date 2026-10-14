// Mizan requirements-to-geometry evidence, V1.
// This is an honest, read-only audit of the actual model selected by AZIZ.
// It does not change the Claude/Gemini/AZIZ pipeline or certify code compliance.
import { quantities } from './planner.mjs';
import { circulationNetwork } from './circulation.mjs';
import { unverifiedCheck, createRegulatoryCheck, REGULATORY_STATUS, toEvidenceRow } from './regulatory-checks.mjs';
import { DESIGN_CHOICES } from './design-selection.mjs';
import {
  TIER, TIER_ORDER, TIER_LABELS, TIER_RULES, OUTCOME_LABELS, OUTCOME_ORDER, OUTCOME_RULES,
  normalizeArabic, AS_MANDATORY_LABEL, AS_MANDATORY_RULE, clip, outcomeOfStatus, splitClauses, isConditionClause, classifyClause, tierForTopic, summarizeTiers,
} from './requirement-tiers.mjs';

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

// Real, dated source for the Wadi Hanifah Urban Code's detached-villa urban
// section (T4.1). This is NOT a city-wide Riyadh code: it applies only inside the
// Wadi Hanifah valley corridor and its tributaries, under the Royal Commission for
// Riyadh City (not the national ministry). Its figures genuinely differ from the
// national ministerial decision above (e.g. front setback is a 0–2m band for most
// of the facade, not a khumus-of-street-width minimum; side/rear setback is 2m, not
// 1.5m) — so the two jurisdictions are kept mutually exclusive in the UI rather
// than merged. Cross-checked against the applied-guide PDF published by Amanah
// Al-Riyadh's e-services portal; the exact developer/plot-type breakdown (an
// apartment vs. a detached villa) is in the same document but only the detached-
// villa figures are cited here, since that is the only building type this engine
// generates.
const WADI_HANIFAH_T41_SOURCE = Object.freeze({
  document: 'الكود العمراني لمنطقة وادي حنيفة — الدليل التطبيقي، القسم الحضري T4.1 (فلل منفصلة)، صادر عن الهيئة الملكية لمدينة الرياض (ينطبق فقط داخل ممر وادي حنيفة وروافده، لا على مدينة الرياض كاملة)',
  version: 'الدليل التطبيقي، الإصدار ١.٠ (٢٠٢٠م)',
});
const WADI_HANIFAH_JURISDICTION_ID = 'wadi-hanifah-t4-1';
const WADI_HANIFAH_VERIFIED_DATE = '2026-10-13';

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
  const wadiHanifah = jurisdiction === WADI_HANIFAH_JURISDICTION_ID;
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
  if (wadiHanifah) {
    rows.push(toEvidenceRow(createRegulatoryCheck({
      rule: 'الجهة والكود النظامي المعتمد للمشروع',
      measuredLabel: 'المدينة/البلدية أو كود البناء المسجل لهذا المشروع',
      measuredValue: null,
      status: REGULATORY_STATUS.PASS,
      source: { ...WADI_HANIFAH_T41_SOURCE, verifiedDate: WADI_HANIFAH_VERIFIED_DATE },
      verificationNote: 'حدد مُعِد هذا المشروع أن موقعه داخل ممر وادي حنيفة وروافده، فيُطبَّق القسم الحضري T4.1 من كود وادي حنيفة العمراني (الصادر عن الهيئة الملكية لمدينة الرياض) بدل الاشتراط الوزاري العام — لأن أرقام هذا الكود (الارتدادات ونسبة البناء) تختلف فعليًا عن الاشتراط العام ولا تنطبق إلا داخل هذا الممر الجغرافي الضيق.',
    }), { id: 'reg-jurisdiction', category: regulatoryCategory }));
  } else if (riyadh) {
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
  // T4.1's front-setback rule is a BAND (the building line must sit within 0–2m of
  // the street boundary for at least 60% of the main facade width, not a minimum
  // distance), and this engine only stores one scalar setback value for the whole
  // facade rather than a per-segment facade breakdown. There is no honest
  // PASS/FAIL to compute from a single number against a percentage-of-facade rule,
  // so this stays UNVERIFIED for Wadi Hanifah too — but still cites the real figures.
  const wadiHanifahStreetSetbackNote = 'اشتراط القسم الحضري T4.1 لكود وادي حنيفة (فلل منفصلة): خط البناء الأمامي يجب أن يقع ضمن نطاق ٠-٢م من حد الشارع لما لا يقل عن ٦٠٪ من عرض الواجهة الرئيسية، والباقي غير مقيّد. هذا شرط على نسبة من عرض الواجهة لا على قيمة ارتداد واحدة، والنموذج الحالي يسجل ارتدادًا واحدًا للواجهة كاملة دون تفصيل نسبي، فلا يمكن الحكم بمطابقة أو مخالفة آليًا من هذه القيمة وحدها.';
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
      verificationNote: wadiHanifah ? wadiHanifahStreetSetbackNote : riyadh ? streetSetbackNote : undefined,
    }), { id: 'reg-street-setback', category: regulatoryCategory }));
  }

  const neighborSetback = number(model.plot?.neighborSetback ?? requestedPlot?.neighborSetback);
  if (wadiHanifah && neighborSetback !== null) {
    // T4.1's side AND rear setbacks for detached villas are both 2m, so this one
    // model value (which doesn't distinguish side from rear) can be checked
    // against both without approximation.
    rows.push(toEvidenceRow(createRegulatoryCheck({
      rule: 'ارتداد المبنى عن حدود الجيران (الجانبي والخلفي)',
      measuredLabel: 'الارتداد المستخدم في هذا المخطط',
      measuredValue: neighborSetback, unit: 'م',
      status: neighborSetback >= 2 ? REGULATORY_STATUS.PASS : REGULATORY_STATUS.FAIL,
      source: { ...WADI_HANIFAH_T41_SOURCE, verifiedDate: WADI_HANIFAH_VERIFIED_DATE, section: 'القسم الحضري T4.1، الارتداد الجانبي والخلفي للفلل المنفصلة: ٢م كحد أدنى' },
      verificationNote: 'النموذج يسجل قيمة ارتداد واحدة للجيران دون تمييز الجانبي عن الخلفي؛ كود T4.1 يضع ٢م كحد أدنى لكليهما، فهذا الفحص صحيح لكلا الجهتين بهذه القيمة.',
    }), { id: 'reg-neighbor-setback', category: regulatoryCategory }));
  } else if (riyadh && neighborSetback !== null) {
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
  if (wadiHanifah && coverageRatio !== null) {
    rows.push(toEvidenceRow(createRegulatoryCheck({
      rule: 'أقصى نسبة بناء (تغطية الأرض)',
      measuredLabel: 'نسبة مساحة الكتلة المرسومة إلى مساحة الأرض',
      measuredValue: coverageRatio, unit: '%',
      status: coverageRatio <= 75 ? REGULATORY_STATUS.PASS : REGULATORY_STATUS.FAIL,
      source: { ...WADI_HANIFAH_T41_SOURCE, verifiedDate: WADI_HANIFAH_VERIFIED_DATE, section: 'القسم الحضري T4.1، الفلل المنفصلة: نسبة بناء ٧٥٪ كحد أقصى (أو ٧٠٪ إن وُجد فناء/باحة مفتوحة داخل القطعة)' },
      verificationNote: (assumedCoverageCap !== null
        ? 'استخدم التوليد افتراض نسبة بناء داخلي قدره ' + fmt(assumedCoverageCap * 100, 0) + '٪ كحد تصميمي قابل للتعديل. '
        : '') + 'الحد الأقصى هنا ٧٥٪، أو ٧٠٪ إن تضمن المخطط فناءً أو باحة مفتوحة؛ هذا النموذج لا يسجل وجود فناء كشرط منفصل في هذا الفحص، فاعتُمد الحد الأعلى (٧٥٪) فقط.',
    }), { id: 'reg-coverage', category: regulatoryCategory }));
  } else if (riyadh && coverageRatio !== null) {
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

  // ───────────────────────────────────────────────────────────────────────────
  // التصنيف الثلاثي لشروط العميل: إلزامي / تفضيل مهم / خيار شكلي.
  // التصنيف يبيّن «أهمية الشرط» فقط بقاعدة معلنة (requirement-tiers.mjs) تُعرض بجانب
  // كل صف، أما «الحالة» (مستوفى / غير مستوفى / غير قابل للإثبات) فتُشتق حصرًا من حالة
  // الدليل الهندسي أعلاه ولا تُرفع إلى «مستوفى» بالتخمين. الصفوف بلا تصنيف فحوص هندسية
  // أو نظامية عامة تجريها الأداة وليست من شروط العميل.
  // ───────────────────────────────────────────────────────────────────────────
  const clientClauses = splitClauses(idea);
  const DEFAULT_BASIS = 'رغبة مسجلة في طلبك بلا صيغة إلزام صريحة.';
  const CHOICE_BASIS = 'اخترته من قائمة «ما أتجنّبه» بلا صيغة إلزام.';
  const LIFE_BASIS = 'اخترته في أسئلة أسلوب الحياة بلا صيغة إلزام.';
  const tag = (id, info) => {
    const row = rows.find(item => item.id === id);
    if (row && info) { row.tier = info.tier; row.tierBasis = info.basis; if (info.asMandatory) row.asMandatory = true; }
    return row;
  };
  const addTiered = (info, ...args) => {
    const row = make(...args);
    row.tier = info.tier; row.tierBasis = info.basis;
    if (info.asMandatory) row.asMandatory = true;
    rows.push(row);
    return row;
  };
  const topicInfo = (topic, choice = null) =>
    tierForTopic({ clauses: clientClauses, topic, choice, fallbackBasis: DEFAULT_BASIS }) || { tier: TIER.IMPORTANT, basis: DEFAULT_BASIS };
  const norm = normalizeArabic;
  const avoidChoice = test => avoids.find(label => test(norm(label)));

  // 1) مدخلات صلبة: ما أدخله العميل في النموذج إلزامي بطبيعته.
  tag('program', { tier: TIER.MANDATORY, basis: 'مدخل صلب: برنامج الغرف الذي أدخلته (الأسماء والأنواع والمساحات والأبعاد الصريحة).' });
  tag('floors', { tier: TIER.MANDATORY, basis: 'مدخل صلب: عدد الأدوار المحدد في بيانات الأرض.' });
  tag('built-area', { tier: TIER.MANDATORY, basis: 'مدخل صلب: سقف مساحة البناء المحدد في بيانات الأرض.' });

  // 2) صفوف موجودة أصلًا لا تُنشأ إلا بطلب العميل: تُصنَّف من كلامه أو اختياره.
  // A topic matches a clause only when every part matches, so a loose word pair
  // (e.g. "غرف نوم ومجلسين" in a room list) is never mistaken for a privacy request.
  const all = (...parts) => ({ test: text => parts.every(part => part.test(text)) });
  const TOPICS = {
    privacy: all(/(?:مرور|كشف|خصوص|فصل|مسار|منفصل|مستقل|مدخل)/, /(?:ضيوف|ضيافه|مجلس)/, /(?:عائل|نوم|نساء|حريم|اسره)/),
    program: all(/(?:\d|[٠-٩]|(?:^|[^ء-ي])(?:واحد|واحده|اثنين|اثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|سته|ست|سبع|سبعه|ثمان|ثماني|ثمانيه|تسع|تسعه|عشر|عشره|مجلسين|حمامين|غرفتين|صالتين)(?![ء-ي]))/,
      /(?:غرف|مجلس|حمام|صاله|مطبخ|مياه)/),
    acoustics: /صدي|صدى|عزل صوتي|acoustic/,
    westSun: /شمس.{0,15}(?:غرب|عصر)|غرب.{0,15}شمس|شمس العصر/,
    future: /توسع.{0,15}مستقبل|مستقبل.{0,15}توسع|مرونه المستقبل/,
    court: /فناء|باحه/,
    pool: /مسبح/,
    corridors: /ممر.{0,20}(?:طويل|مظلم)|(?:طويل|مظلم).{0,20}ممر/,
    kitchen: /مطبخ.{0,30}(?:بعيد|ابعد)|(?:بعيد|ابعد).{0,30}مطبخ/,
    bedrooms: /نوم.{0,30}(?:مكشوف|ضيافه|ضيوف|مجلس)|(?:مكشوف|ضيافه|ضيوف|مجلس).{0,30}نوم/,
  };
  // Gate the TIER on an actual privacy mention (a clause matching TOPICS.privacy, or an
  // avoid-list choice) — not on asksSeparation, which uses its own narrower legacy
  // pattern (kept separate for the row's pass/fail threshold below) and would otherwise
  // leave a real client request such as "لا أريد مرور الضيوف على غرف النوم" untagged and
  // mislabeled as a generic engine check, even though this row only exists at all
  // because it answers that exact request.
  const privacyChoice = avoids.some(value => /مرور الضيوف|كشف الضيوف/.test(value)) ? { basis: CHOICE_BASIS } : null;
  const privacyMatch = tierForTopic({ clauses: clientClauses, topic: TOPICS.privacy, choice: privacyChoice, fallbackBasis: DEFAULT_BASIS });
  if (privacyMatch) tag('privacy-routes', privacyMatch);
  tag('acoustics', topicInfo(TOPICS.acoustics, avoids.some(value => /صدى الصوت/.test(value)) ? { basis: CHOICE_BASIS } : null));
  tag('west-sun', topicInfo(TOPICS.westSun, avoids.some(value => /شمس العصر/.test(value)) ? { basis: CHOICE_BASIS } : null));
  tag('future', topicInfo(TOPICS.future, discovery?.life?.future === 'مهمة' ? { basis: 'اخترت أن المرونة المستقبلية «مهمة» في أسئلة أسلوب الحياة.' } : null));
  tag('no-court', topicInfo(TOPICS.court));
  tag('no-pool', topicInfo(TOPICS.pool));

  // 3) اختيارات «ما أتجنّبه» التي لا صف لها أعلاه: قياس صريح بلا ادعاء استيفاء.
  const longCorridorChoice = avoidChoice(n => /ممر/.test(n) && /(?:طويل|مظلم)/.test(n));
  if (longCorridorChoice) {
    addTiered(topicInfo(TOPICS.corridors, { basis: CHOICE_BASIS }), 'avoid-long-corridors', 'تجنّب الممرات الطويلة والمظلمة', 'UNVERIFIED',
      'المقاس من الرسم: ' + (longest === null ? 'لا توجد مسارات متصلة قابلة للقياس' : 'أطول مسار متصل من المدخل إلى باب غرفة ' + fmt(longest) + ' م') +
        '، ومساحة الممرات ' + fmt(q.circulation) + ' م². لا توجد عتبة طول معتمدة ولا بيانات إنارة للممرات؛ لا يمكن الحكم باستيفاء الطلب.',
      'ممرات النموذج', 'الحركة');
  }
  const farKitchenChoice = avoidChoice(n => /مطبخ/.test(n) && /بعيد/.test(n));
  if (farKitchenChoice) {
    const parts = [];
    for (const kitchen of model.rooms.filter(room => room.type === 'kitchen')) {
      for (const [type, label] of [['dining', 'الطعام'], ['storage', 'المستودع']]) {
        const metres = model.rooms.filter(room => room.type === type)
          .map(other => network.betweenRooms(kitchen.id, other.id))
          .filter(path => path && Number.isFinite(path.metres)).map(path => path.metres);
        if (metres.length) parts.push(kitchen.name + ' ← ' + label + ': ' + fmt(Math.min(...metres)) + ' م');
      }
    }
    addTiered(topicInfo(TOPICS.kitchen, { basis: CHOICE_BASIS }), 'avoid-far-kitchen', 'تجنّب بُعد المطبخ عن الطعام والخدمات', parts.length ? 'MEASURED' : 'UNVERIFIED',
      parts.length
        ? 'المسافات المقاسة عبر الممرات: ' + parts.join('؛ ') + '. لا توجد عتبة معتمدة لكلمة «بعيد»؛ القياس لا يثبت استيفاء الطلب.'
        : 'لا يوجد مطبخ مع غرفة طعام أو مستودع بمسار متصل قابل للقياس في هذا المخطط.',
      'مسار من الرسم الفعلي', 'علاقات الفراغات');
  }
  const exposedBedroomChoice = avoidChoice(n => /نوم/.test(n) && /(?:مكشوف|ضيافه|قريب)/.test(n));
  if (exposedBedroomChoice) {
    const bedrooms = model.rooms.filter(room => ['bedroom', 'master-bedroom'].includes(room.type));
    const majlis = model.rooms.filter(room => room.type === 'majlis');
    const gaps = bedrooms.length && majlis.length ? bedrooms.map(bedroom => ({
      name: bedroom.name,
      gap: Math.min(...majlis.map(guest => Math.hypot(
        Math.max(0, guest.x - (bedroom.x + bedroom.w), bedroom.x - (guest.x + guest.w)),
        Math.max(0, guest.y - (bedroom.y + bedroom.h), bedroom.y - (guest.y + guest.h))))),
    })).filter(item => Number.isFinite(item.gap)) : [];
    addTiered(topicInfo(TOPICS.bedrooms, { basis: CHOICE_BASIS }), 'avoid-exposed-bedrooms', 'تجنّب غرف نوم مكشوفة أو قريبة من الضيافة', gaps.length ? 'MEASURED' : 'UNVERIFIED',
      gaps.length
        ? 'أقرب مسافة بين حدود كل غرفة نوم وأقرب مجلس: ' + gaps.map(item => item.name + ' ' + fmt(item.gap) + ' م').join('؛ ') +
          '. قياس قرب مستطيلات فقط؛ لا يثبت حجب الرؤية ولا عدم الانكشاف.'
        : 'يلزم وجود غرفة نوم ومجلس بحدود قابلة للقياس؛ لا يمكن فحص هذا الطلب في هذا المخطط.',
      'هندسة الفراغات', 'الخصوصية');
  }

  // 4) شكل الكتلة: خيار شكلي بحكم نوعه. الحالة من شكل البديل المرسوم فعلًا.
  const SHAPE_LABELS = { rect: 'كتلة مستطيلة', ...Object.fromEntries(Object.values(DESIGN_CHOICES).filter(item => item.shape).map(item => [item.shape, item.label])) };
  const drawnShape = model.shape || null;
  const drawnShapeLabel = drawnShape ? (SHAPE_LABELS[drawnShape] || drawnShape) : null;
  const shapeBasis = 'اختيار شكل الكتلة من قائمة الأشكال: ذوق بصري لا شرط وظيفي.';
  for (const key of Array.isArray(discovery?.likes) ? discovery.likes : []) {
    const choice = DESIGN_CHOICES[key];
    if (!choice) continue;
    const unsupported = choice.shape === null;
    addTiered({ tier: TIER.COSMETIC, basis: shapeBasis }, 'shape-like:' + key, 'الشكل المفضّل: ' + choice.label,
      unsupported ? 'UNSUPPORTED' : !drawnShape ? 'UNVERIFIED' : drawnShape === choice.shape ? 'ENFORCED' : 'NOT_MET',
      unsupported
        ? 'هذا الشكل يحتاج فناءً مغلقًا من أربع جهات والمحرك لا يولّده؛ لم يُستبدل بشكل آخر.'
        : drawnShape ? 'الشكل المفضّل ' + choice.label + '، والشكل المرسوم في هذا البديل: ' + drawnShapeLabel + '.' : 'شكل البديل المرسوم غير مسجل؛ لا يمكن المقارنة.',
      'اختيار العميل وشكل البديل', 'شكل المبنى');
  }
  for (const key of Array.isArray(discovery?.rejects) ? discovery.rejects : []) {
    const choice = DESIGN_CHOICES[key];
    if (!choice) continue;
    const unsupported = choice.shape === null;
    addTiered({ tier: TIER.COSMETIC, basis: shapeBasis }, 'shape-reject:' + key, 'الشكل المستبعد: ' + choice.label,
      unsupported ? 'ENFORCED' : !drawnShape ? 'UNVERIFIED' : drawnShape === choice.shape ? 'NOT_MET' : 'ENFORCED',
      unsupported
        ? 'المحرك لا يولّد هذا الشكل أصلًا، فلم يظهر في هذا البديل.'
        : drawnShape ? 'الشكل المستبعد ' + choice.label + '، والشكل المرسوم في هذا البديل: ' + drawnShapeLabel + '.' : 'شكل البديل المرسوم غير مسجل؛ لا يمكن المقارنة.',
      'اختيار العميل وشكل البديل', 'شكل المبنى');
  }

  // 5) أسلوب الحياة: يُعرض صراحة ما لا يقيسه النموذج بدل تجاهله.
  const children = String(discovery?.life?.children || '').trim();
  if (children) {
    addTiered({ tier: TIER.IMPORTANT, basis: LIFE_BASIS }, 'life-children', 'الأطفال: ' + children, 'UNVERIFIED',
      'لا توجد في النموذج غرفة مُعرّفة للأطفال، ولن نفترض أن غرفة نوم بعينها تخصهم؛ لا يمكن إثبات هذا الطلب قبل تحديد الغرف.',
      'اختيار العميل', 'أسلوب الحياة');
  }
  if (String(discovery?.life?.seniors || '').trim() === 'موجودون') {
    addTiered({ tier: TIER.IMPORTANT, basis: LIFE_BASIS }, 'life-seniors', 'وجود كبار السن', 'UNVERIFIED',
      'لا تتوفر في النموذج قياسات إمكانية الوصول لكبار السن؛ لا يمكن إثبات ملاءمة المخطط لهم من البيانات الحالية.',
      'اختيار العميل', 'أسلوب الحياة');
  }

  // 6) باقي الشروط الحرة: لكل عبارة صفها وتصنيفها بدل فقرة واحدة غير مصنّفة. ما لا يربطه
  // المحرك بقياس هندسي محدد يبقى «غير قابل للإثبات» صراحة، ولا يُعد مستوفى لمجرد نجاح التوليد.
  // A clause that states room counts is the very request the room program was built
  // from, and the mandatory "program" row already checks the drawn rooms against it.
  const dedicated = [
    ['program', TOPICS.program], ['privacy-routes', TOPICS.privacy], ['acoustics', TOPICS.acoustics], ['west-sun', TOPICS.westSun], ['future', TOPICS.future],
    ['no-court', TOPICS.court], ['no-pool', TOPICS.pool], ['avoid-long-corridors', TOPICS.corridors],
    ['avoid-far-kitchen', TOPICS.kitchen], ['avoid-exposed-bedrooms', TOPICS.bedrooms],
  ];
  const covered = text => dedicated.some(([id, topic]) => topic.test(norm(text)) && rows.some(row => row.id === id));
  const seen = new Set();
  const itemize = (id, text, info, source, category) => {
    const key = norm(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    addTiered(info, id, clip(text, 90), 'UNVERIFIED',
      'لا يربط المحرك هذه العبارة بقياس هندسي محدد، فلا يمكن إثبات استيفائها أو نفيها من النموذج الحالي. قد يغطي بند آخر أعلاه جزءًا منها (مثل برنامج الغرف)، لكن ذلك لا يثبتها.',
      source, category);
  };
  const unproven = Array.isArray(briefContext?.constraints) ? briefContext.constraints : [];
  unproven.forEach((value, index) => {
    const raw = String(value ?? '').trim();
    const body = raw.replace(/^(?:تجنب|متطلب يحتاج معالجة هندسية)\s*[:：]\s*/, '');
    if (!body || covered(body)) return;
    itemize('cond:brief:' + index, body, classifyClause(body, { fallbackBasis: 'رغبة مسجلة في ملخص طلبك بلا صيغة إلزام صريحة.' }), 'ملخص طلب العميل', 'شروط من طلبك');
  });
  const conditionClauses = clientClauses.filter(clause => isConditionClause(clause) && !covered(clause));
  conditionClauses.slice(0, 12).forEach((clause, index) => {
    itemize('cond:idea:' + index, clause, classifyClause(clause), 'وصف العميل', 'شروط من طلبك');
  });
  const droppedClauses = Math.max(0, conditionClauses.length - 12);

  const counts = Object.fromEntries(Object.keys(REQUIREMENT_STATUS).map(key => [key, rows.filter(row => row.status === key).length]));
  for (const row of rows) { if (row.tier) row.outcome = outcomeOfStatus(row.status); }
  const tierSummary = summarizeTiers(rows);
  return {
    version: '1.1.0',
    modelIdentity: model.integration?.candidateId || model.candidateId || model.engineVersion || (model.shape ? 'shape:' + model.shape + (model.strategy ? ':' + model.strategy : '') : 'unidentified'),
    rows,
    counts,
    tiers: tierSummary.tiers,
    outcomes: tierSummary.outcomes,
    otherChecks: tierSummary.other,
    tierRules: TIER_RULES,
    note: 'مصفوفة أدلة من النموذج الهندسي نفسه، لا اعتماد إنشائي أو نظامي. القياس لا يعني استيفاء رغبة غير محددة بعتبة. ' +
      'كل شرط من شروطك مصنّف بقاعدة معلنة إلى إلزامي أو تفضيل مهم أو خيار شكلي، وحالته مستوفى أو غير مستوفى أو غير قابل للإثبات.' +
      (droppedClauses ? ' عُرضت أول ١٢ عبارة من وصفك، ولم تُعرض ' + fmt(droppedClauses, 0) + ' عبارات إضافية.' : ''),
  };
}

const STATUS_LABELS = Object.freeze({
  ENFORCED: 'مطابق في الرسم',
  MEASURED: 'مقاس دون حكم',
  NOT_MET: 'غير مستوفى',
  UNVERIFIED: 'غير مثبت',
  UNSUPPORTED: 'غير مدعوم',
});
const isTieredRow = row => Object.hasOwn(TIER_LABELS, row?.tier);
const OUTCOME_PRIORITY = Object.freeze({ NOT_MET: 0, UNPROVABLE: 1, MET: 2 });

function requirementRowHTML(row) {
  const status = Object.hasOwn(STATUS_LABELS, row.status) ? row.status : 'UNVERIFIED';
  if (!isTieredRow(row)) {
    return '<article class="requirement-row" data-evidence-status="' + status + '">' +
      '<div class="requirement-row-head"><div><span class="requirement-category">' + escapeHTML(row.category) + '</span><h3>' +
      escapeHTML(row.title) + '</h3></div><span class="requirement-status">' + escapeHTML(STATUS_LABELS[status]) + '</span></div>' +
      '<p>' + escapeHTML(row.evidence) + '</p><small>المصدر: ' + escapeHTML(row.source) + '</small></article>';
  }
  const outcome = Object.hasOwn(OUTCOME_LABELS, row.outcome) ? row.outcome : outcomeOfStatus(status);
  return '<article class="requirement-row" data-evidence-status="' + status + '" data-tier="' + row.tier + '" data-outcome="' + outcome + '">' +
    '<div class="requirement-row-head"><div><span class="requirement-category">' + escapeHTML(row.category) + '</span><h3>' +
    escapeHTML(row.title) + '</h3></div><div class="requirement-pills">' + (row.asMandatory ? '<span class="requirement-as-mandatory">' + escapeHTML(AS_MANDATORY_LABEL) + '</span>' : '') + '<span class="requirement-outcome">' + escapeHTML(OUTCOME_LABELS[outcome]) +
    '</span><span class="requirement-status">' + escapeHTML(STATUS_LABELS[status]) + '</span></div></div>' +
    '<p>' + escapeHTML(row.evidence) + '</p>' +
    (row.tierBasis ? '<p class="requirement-basis"><b>سبب التصنيف «' + escapeHTML(TIER_LABELS[row.tier]) + '»:</b> ' + escapeHTML(row.tierBasis) + '</p>' : '') +
    '<small>المصدر: ' + escapeHTML(row.source) + '</small></article>';
}

export function renderRequirementEvidenceHTML(evidence) {
  if (!evidence || !Array.isArray(evidence.rows)) return '';
  // Rows without a tier (e.g. the regulatory panel) keep the original flat layout.
  if (!evidence.rows.some(isTieredRow)) return evidence.rows.map(requirementRowHTML).join('');
  const { tiers } = summarizeTiers(evidence.rows);
  const board = '<section class="tier-board" dir="rtl" aria-label="ملخص تصنيف شروطك">' +
    '<table class="tier-summary"><caption>شروطك حسب الأهمية والحالة</caption><thead><tr><th scope="col">التصنيف</th>' +
    OUTCOME_ORDER.map(outcome => '<th scope="col">' + escapeHTML(OUTCOME_LABELS[outcome]) + '</th>').join('') +
    '<th scope="col">المجموع</th></tr></thead><tbody>' +
    TIER_ORDER.map(tier => '<tr data-tier="' + tier + '"><th scope="row">' + escapeHTML(TIER_LABELS[tier]) + '</th>' +
      OUTCOME_ORDER.map(outcome => '<td data-outcome="' + outcome + '">' + fmt(tiers[tier][outcome], 0) + '</td>').join('') +
      '<td>' + fmt(tiers[tier].total, 0) + '</td></tr>').join('') +
    '</tbody></table>' +
    '<details class="tier-rules"><summary>كيف صُنّفت شروطك؟</summary><dl>' +
    TIER_ORDER.map(tier => '<dt>' + escapeHTML(TIER_LABELS[tier]) + '</dt><dd>' + escapeHTML(TIER_RULES[tier]) + '</dd>').join('') +
    '<dt>' + escapeHTML(AS_MANDATORY_LABEL) + '</dt><dd>' + escapeHTML(AS_MANDATORY_RULE) + '</dd><dt>الحالة</dt><dd>' + escapeHTML(OUTCOME_RULES) + '</dd></dl></details></section>';
  const byOutcome = rows => [...rows].sort((a, b) =>
    (OUTCOME_PRIORITY[a.outcome || outcomeOfStatus(a.status)] ?? 1) - (OUTCOME_PRIORITY[b.outcome || outcomeOfStatus(b.status)] ?? 1));
  const groups = TIER_ORDER.map(tier => {
    const rows = evidence.rows.filter(row => row.tier === tier);
    return rows.length
      ? '<section class="tier-group" data-tier="' + tier + '"><h3 class="tier-group-title">' + escapeHTML(TIER_LABELS[tier]) +
        ' <small>(' + fmt(rows.length, 0) + ')</small></h3><div class="tier-group-rows">' + byOutcome(rows).map(requirementRowHTML).join('') + '</div></section>'
      : '';
  });
  const other = evidence.rows.filter(row => !isTieredRow(row));
  const otherGroup = other.length
    ? '<section class="tier-group" data-tier="OTHER"><h3 class="tier-group-title">فحوص هندسية ونظامية عامة <small>(' + fmt(other.length, 0) + ')</small></h3>' +
      '<p class="tier-group-note">فحوص تجريها الأداة على أي مخطط، وليست من شروطك ولا تُصنَّف.</p><div class="tier-group-rows">' +
      other.map(requirementRowHTML).join('') + '</div></section>'
    : '';
  return board + groups.join('') + otherGroup;
}
