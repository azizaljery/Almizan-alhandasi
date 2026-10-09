// Mizan requirements-to-geometry evidence, V1.
// This is an honest, read-only audit of the actual model selected by AZIZ.
// It does not change the Claude/Gemini/AZIZ pipeline or certify code compliance.
import { quantities } from './planner.mjs';
import { circulationNetwork } from './circulation.mjs';

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

export function evaluateRequirementEvidence({ model, program, idea = '', discovery = {}, briefContext = null } = {}) {
  if (!model || !Array.isArray(model.rooms) || !Array.isArray(model.openings) || !Array.isArray(model.corridors)) {
    throw Error('يلزم نموذج هندسي صالح لعرض أدلة المتطلبات.');
  }
  const expected = Array.isArray(program) ? program : (model.program || []);
  const q = quantities(model), network = circulationNetwork(model), rows = [];
  const add = (...args) => rows.push(make(...args));
  const roomsById = new Map(model.rooms.map(room => [room.id, room]));
  const requested = expected.map((room, index) => ({
    id: room.id || 'room-' + index,
    name: String(room.name || ''),
    type: room.type,
    area: number(room.area ?? room.areaM2),
  }));
  const mismatches = requested.flatMap(room => {
    const actual = roomsById.get(room.id);
    if (!actual) return ['لم تُرسم: ' + room.name];
    if (actual.type !== room.type) return ['نوع الفراغ مختلف: ' + room.name];
    if (actual.name !== room.name) return ['اسم الفراغ مختلف: ' + room.name];
    const measured = actual.w * actual.h;
    if (room.area === null || !Number.isFinite(measured) || Math.abs(measured - room.area) > Math.max(.05, room.area * .001)) {
      return ['مساحة ' + room.name + ': مطلوب ' + room.area + ' م²، مرسوم ' + round(measured) + ' م²'];
    }
    return [];
  });
  const expectedIds = new Set(requested.map(room => room.id));
  const extras = model.rooms.filter(room => !expectedIds.has(room.id)).map(room => room.name);
  if (!requested.length) {
    add('program', 'برنامج الغرف', 'UNVERIFIED', 'لم تتوفر قائمة الغرف الأصلية للمقارنة؛ لا يمكن إثبات حفظ العدد والمساحات.', 'جدول الغرف', 'متطلبات إلزامية');
  } else if (mismatches.length || extras.length) {
    const problems = [...mismatches, ...extras.map(name => 'فراغ إضافي: ' + name)];
    add('program', 'عدد الغرف ومساحاتها', 'NOT_MET',
      problems.slice(0, 4).join('؛ ') + (problems.length > 4 ? '؛ و' + fmt(problems.length - 4, 0) + ' فروق أخرى.' : ''),
      'برنامج الغرف', 'متطلبات إلزامية');
  } else {
    add('program', 'عدد الغرف ومساحاتها', 'ENFORCED',
      'تطابق ' + fmt(requested.length, 0) + ' فراغًا بالاسم والنوع والمساحة الصافية ضمن دقة القياس ±0.05 م² أو 0.1٪. الصافي المرسوم: ' + fmt(q.rooms) + ' م².',
      'برنامج الغرف', 'متطلبات إلزامية');
  }

  const floors = number(model.plot?.floors);
  add('floors', 'عدد الأدوار',
    floors === 1 ? 'ENFORCED' : 'UNSUPPORTED',
    floors === 1 ? 'المخطط يمثل دورًا أرضيًا واحدًا فقط.' : 'توليد الأدوار الإضافية غير مدعوم؛ لا يُحتسب هذا النموذج إثباتًا لتنفيذها.',
    'حدود المحرك', 'متطلبات إلزامية');

  const cap = number(model.plot?.maxBuiltArea);
  if (cap !== null) {
    const ok = q.footprint <= cap + .05;
    add('built-area', 'سقف مساحة البناء', ok ? 'ENFORCED' : 'NOT_MET',
      'سقفك ' + fmt(cap) + ' م²، والكتلة المرسومة ' + fmt(q.footprint) + ' م². هذه مقارنة بالسقف المدخل وليست مراجعة نظامية.',
      'حد مساحة العميل', 'متطلبات إلزامية');
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
  const ratio = q.footprint > 0 ? q.circulation / q.footprint * 100 : null;
  add('corridors', 'الممرات والحركة',
    longest === null ? 'UNVERIFIED' : 'MEASURED',
    'مساحة الممرات ' + fmt(q.circulation) + ' م²' +
      (ratio === null ? '' : ' (' + fmt(ratio) + '٪ من المساحة المبنية)') +
      (longest === null ? '؛ لا توجد مسارات متصلة يمكن قياسها.' : '؛ أطول مسار متصل من مدخل إلى باب غرفة ' + fmt(longest) + ' م.') +
      ' لا يوجد حد أقصى معتمد للممرات في هذا الفحص.',
    'ممرات النموذج', 'الحركة');

  const avoids = Array.isArray(discovery?.avoids) ? discovery.avoids : [];
  const briefText = String(idea || '') + ' ' + String(briefContext?.intent || '');
  const asksSeparation = avoids.some(value => /مرور الضيوف|كشف الضيوف/.test(value)) ||
    /(?:مسار|مدخل|حركة).{0,25}(?:مستقل|منفصل)|فصل.{0,25}الضيوف|خصوصية/.test(briefText);
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
    modelIdentity: model.integration?.candidateId || model.engineVersion || 'unidentified',
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
  return evidence.rows.map(row => '<article class="requirement-row" data-evidence-status="' + row.status + '">' +
    '<div class="requirement-row-head"><div><span class="requirement-category">' + escapeHTML(row.category) + '</span><h3>' +
    escapeHTML(row.title) + '</h3></div><span class="requirement-status">' + escapeHTML(labels[row.status] || 'غير محدد') + '</span></div>' +
    '<p>' + escapeHTML(row.evidence) + '</p><small>المصدر: ' + escapeHTML(row.source) + '</small></article>').join('');
}
