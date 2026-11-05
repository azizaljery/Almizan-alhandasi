// ربط حزمة الأنظمة الهندسية (dist/engineering-systems، MIZAN-MEP 0.1.0) بالبديل المعماري المختار في الميزان.
// وحدة نقية بلا DOM: تقرأ مستند المرسم mizan-draw/1 للبديل وتمرّره إلى fromDrawDoc مع محلّل المخطط analyzeDoc
// ومحقق المستند validateDoc الأصليين؛ لا تعدّل المستند أبدًا (تُحسب بصمته قبل الربط وبعده)، وتحفظ مدخلات الأنظمة
// ونتيجتها كيانًا مستقلًا مربوطًا بهوية البديل وبصمة المصدر (لا يُكتب شيء داخل مستند البديل ولا داخل MIZAN-IR/1.0.0).
// قرار التوحيد: gemini-engineering-layer.mjs يعمل على النموذج المستطيل القديم (app.mjs) ويعلن صراحة أن الكهرباء والسباكة
// والتكييف «غير مقيَّمة»؛ وengineering.mjs دوال مؤشرات للمخطط. لا يُكرَّر أي منهما هنا: هذه الطبقة هي المسار الوحيد للأنظمة
// على مستندات المرسم، والعوائق الإنشائية تؤخذ من الفحص الإنشائي المبدئي الموجود (draw/structure.mjs) لا من محرك جديد.
// كل الحسابات أولية: constructionApproved=false وcodeCompliance=NOT_EVALUATED ثابتان من الحزمة ولا يغيّرهما هذا الملف.
import { analyzeDoc } from './draw/digest.mjs';
import { validateDoc } from './draw/doc.mjs';
import { computeStructure } from './draw/structure.mjs';
import {
  fromDrawDoc, createEngineeringPackage, verifyBinding, verifyResult, comparePackages, toSvg, toDxf, exportArtifacts,
  createAgentActions, hash, InputError, VERSION as KIT_VERSION
} from './engineering-systems/src/index.mjs';
import { bounds, inRoom, inside } from './engineering-systems/src/geometry.mjs';

export const SYSTEMS_SCHEMA = 'mizan-mep-systems/1';
export const STORE_KEY = 'mizan.mep.systems.v1';
export { KIT_VERSION };
export const PRELIMINARY_AR = 'تصميم أولي يحتاج مراجعة مهندس مختص — ليس مخططًا تنفيذيًا معتمدًا';
export const NO_CLASH_AR = 'عدم اكتشاف تعارض لا يعني اكتمال المراجعة: يُفحص فقط ما أُدخل من مسارات وعوائق، والنموذج الإنشائي غير مكتمل.';
export const DISCIPLINES = Object.freeze(['electrical', 'hvac', 'plumbing', 'fire', 'low_current', 'solar']);

// ما تحسبه الحزمة فعلًا وما يحتاج تطويرًا (من جدول README_AR للحزمة، دون إضافة ادعاء)
export const DISCIPLINE_INFO = Object.freeze({
  electrical: { ar: 'الكهرباء والإنارة', short: 'كهرباء', prefix: 'E',
    computes: ['عدد أولي لوحدات الإنارة بطريقة اللومن ومواقع مقترحة داخل الغرفة', 'المقابس والأحمال بمواقعها المدخلة', 'ربط اللوحات والدوائر، P وQ والتيار وهبوط الجهد', 'جداول الدوائر واللوحات وفحص Ib ≤ In ≤ Iz للقيم المدخلة فقط'],
    needs: ['الفوتومتري والتجانس والوهج', 'القصر والتأريض والفصل الانتقائي والحماية من الصعق', 'اختيار الكابلات المصححة والقواطع', 'التحقق من اشتراطات SBC 401'] },
  hvac: { ar: 'التكييف والتهوية والشفط', short: 'تكييف', prefix: 'M',
    computes: ['مكاسب حرارية ساكنة حسية وكامنة من مدخلات المناخ والغلاف', 'تدفق هواء التغذية الحسي', 'هواء التهوية بقيم مدخلة', 'الشفط من تبدلات الهواء المدخلة', 'قطر دائري مكافئ للمساحة ومسارات دكت مقترحة'],
    needs: ['محاكاة حمل التصميم وأيام التصميم', 'اختيار السعات والأجهزة (selectedCapacityW يبقى فارغًا)', 'ضغط الدكت والراجع والضوضاء والتكاثف', 'انطباق طريقة التهوية على الفلل'] },
  plumbing: { ar: 'المياه والصرف والأمطار', short: 'صحي', prefix: 'P',
    computes: ['شبكات باردة وحارة وصرف وتهوية صرف وتكاثف وأمطار بين نقاط مدخلة', 'الميل ومناسيب القاع مع منع الاتصال الوهمي بالمنهل', 'سعة خزان بالاستهلاك المدخل', 'جريان المطر وقدرة تسخين المياه', 'فواقد Darcy بمعامل احتكاك مدخل'],
    needs: ['منحنى الطلب من وحدات الأجهزة', 'شبكة ضغط كاملة واختيار المضخة', 'سعة الصرف والمصائد والتهوية ومنع الرجوع', 'الربط الخارجي واشتراطات SBC 701'] },
  fire: { ar: 'الحريق', short: 'حريق', prefix: 'F',
    computes: ['أجهزة إنذار أو إطفاء يحدد المصمم مواقعها', 'مسارات هندسية وجداول أجهزة'],
    needs: ['تغطية الكواشف والرشاشات', 'الحساب الهيدروليكي والمضخات والخزانات', 'الإخلاء والحماية السلبية', 'تصميم ومراجعة متخصصة وفق SBC 801'] },
  low_current: { ar: 'التيار الخفيف', short: 'تيار خفيف', prefix: 'T',
    computes: ['بيانات وكاميرات واتصالات وتحكم يحدد المصمم مواقعها', 'مسارات وحد طول مدخل للمشروع'],
    needs: ['أداء الشبكة والتغطية', 'الفصل والتأريض', 'حدود القناة الكاملة ونوع الكابل', 'الخصوصية ومواقع الكاميرات'] },
  solar: { ar: 'الطاقة الشمسية', short: 'شمسية', prefix: 'S',
    computes: ['عناصر يحددها المصمم ومسارات اختيارية', 'القدرة الاسمية DC = عدد الألواح × قدرة اللوح'],
    needs: ['الإنتاج السنوي والتظليل', 'اختيار الإنفرتر والحماية', 'أثر الألواح على السقف الإنشائي', 'العائد المالي'] },
});
export const COORDINATION_INFO = Object.freeze({
  computes: ['عوائق ثلاثية الأبعاد من الفحص الإنشائي المبدئي ومما يدخله المصمم', 'تعارضات محتملة بين الخدمات والعوائق والجدران', 'رايزرات صريحة بمناسيب فعلية', 'ربط الحمل الكهربائي بالاستهلاك الفعلي للجهاز'],
  needs: ['اكتمال النموذج الإنشائي واعتماده', 'فتحات البلاطات والكمرات والحماية من الحريق', 'الخلوصات المعتمدة للتنفيذ'],
});

// مجموعات الأجهزة التي يحررها المستخدم (المسار داخل services) وأنواعها؛ أسماء الأنواع عقد الحزمة، والعربية للعرض فقط
export const DEVICE_GROUPS = Object.freeze({
  electrical: [
    { path: ['electrical', 'panels'], ar: 'لوحات التوزيع', kinds: [['PANEL', 'لوحة توزيع']] },
    { path: ['electrical', 'loads'], ar: 'المقابس والأحمال', kinds: [['SOCKET', 'مقبس'], ['EQUIPMENT_LOAD', 'حمل جهاز'], ['LOAD', 'حمل آخر']] },
  ],
  hvac: [{ path: ['hvac', 'equipment'], ar: 'أجهزة التكييف والتهوية', kinds: [['AIR_EQUIPMENT', 'وحدة تكييف'], ['OUTDOOR_UNIT', 'وحدة خارجية'], ['AIR_HANDLER', 'مناولة هواء']] }],
  plumbing: [
    { path: ['plumbing', 'fixtures'], ar: 'الأجهزة الصحية', kinds: [['WC', 'مرحاض'], ['BASIN', 'مغسلة'], ['SHOWER', 'دش'], ['SINK', 'حوض مطبخ'], ['FLOOR_DRAIN', 'صفاية أرضية']] },
    { path: ['plumbing', 'equipment'], ar: 'المصادر والمعدات والمناهل', kinds: [['WATER_SOURCE', 'مصدر مياه/عداد'], ['TANK', 'خزان'], ['PUMP', 'مضخة'], ['MANIFOLD', 'موزع مياه'], ['WATER_HEATER', 'سخان'], ['MANHOLE', 'منهل'], ['ROOF_DRAIN', 'مصرف سطح'], ['RISER_NODE', 'عقدة رايزر']] },
  ],
  fire: [{ path: ['fire', 'devices'], ar: 'عناصر الحريق', kinds: [['SMOKE_DETECTOR', 'كاشف دخان'], ['HEAT_DETECTOR', 'كاشف حرارة'], ['FIRE_ALARM_PANEL', 'لوحة إنذار'], ['MANUAL_CALL_POINT', 'نقطة إنذار يدوية'], ['SOUNDER', 'جرس إنذار'], ['EXTINGUISHER', 'طفاية'], ['HOSE_REEL', 'بكرة خرطوم'], ['RISER_NODE', 'عقدة رايزر']] }],
  low_current: [{ path: ['low_current', 'devices'], ar: 'عناصر التيار الخفيف', kinds: [['DATA_RACK', 'خزانة شبكة'], ['DATA_OUTLET', 'مخرج بيانات'], ['CCTV_CAMERA', 'كاميرا'], ['INTERCOM', 'اتصال داخلي'], ['TV_OUTLET', 'مخرج تلفاز'], ['ACCESS_CONTROL', 'تحكم دخول'], ['RISER_NODE', 'عقدة رايزر']] }],
  solar: [{ path: ['solar', 'devices'], ar: 'عناصر الطاقة الشمسية', kinds: [['PV_MODULE', 'لوح شمسي'], ['INVERTER', 'محوّل'], ['DC_ISOLATOR', 'فاصل DC']] }],
});
const ID_PREFIX = { PANEL: 'DB', SOCKET: 'SO', EQUIPMENT_LOAD: 'EQ', LOAD: 'LD', AIR_EQUIPMENT: 'AC', OUTDOOR_UNIT: 'ODU', AIR_HANDLER: 'AHU', WC: 'WC', BASIN: 'BS', SHOWER: 'SH', SINK: 'SK', FLOOR_DRAIN: 'FD', WATER_SOURCE: 'WS', TANK: 'TK', PUMP: 'PMP', MANIFOLD: 'MF', WATER_HEATER: 'WH', MANHOLE: 'MH', ROOF_DRAIN: 'RD', RISER_NODE: 'RN', SMOKE_DETECTOR: 'SD', HEAT_DETECTOR: 'HD', FIRE_ALARM_PANEL: 'FACP', MANUAL_CALL_POINT: 'MCP', SOUNDER: 'SND', EXTINGUISHER: 'EXT', HOSE_REEL: 'HR', DATA_RACK: 'RACK', DATA_OUTLET: 'DO', CCTV_CAMERA: 'CAM', INTERCOM: 'IC', TV_OUTLET: 'TV', ACCESS_CONTROL: 'ACX', PV_MODULE: 'PV', INVERTER: 'INV', DC_ISOLATOR: 'DCI' };

export const LAYER_AR = Object.freeze({
  'E-LIGHT': 'وحدات إنارة مقترحة', 'E-POWER': 'لوحات وأحمال', 'E-SOCKET': 'مقابس', 'E-CABLE': 'مسارات كابلات مقترحة',
  'M-EQUIP': 'أجهزة تكييف', 'M-AIR': 'مخارج هواء', 'M-DUCT': 'دكت تغذية مقترح', 'M-EXHAUST': 'شفط',
  'P-FIXTURE': 'أجهزة ونقاط صحية', 'P-COLD': 'مياه باردة', 'P-HOT': 'مياه ساخنة', 'P-DRAIN': 'صرف', 'P-VENT': 'تهوية صرف', 'P-STORM': 'أمطار', 'P-COND': 'تكاثف', 'P-RISER': 'رايزر صحي',
  'F-DEVICE': 'عناصر حريق', 'F-PATH': 'مسارات حريق', 'T-DEVICE': 'عناصر تيار خفيف', 'T-PATH': 'مسارات تيار خفيف', 'S-DEVICE': 'عناصر شمسية', 'S-PATH': 'مسارات شمسية',
});
// لون الطبقة كما في رسم الحزمة (exports.mjs) حتى يطابق مفتاح الرموز الرسم
export const layerColor = layer => layer.startsWith('E-') ? '#ba7419' : layer.startsWith('M-') ? '#167e87' : layer.startsWith('P-') ? '#286ec4' : layer.startsWith('F-') ? '#c84b55' : layer.startsWith('S-') ? '#8259a8' : '#557346';

const clone = v => JSON.parse(JSON.stringify(v));
const r3 = v => Math.round(v * 1000) / 1000;

// رسائل الربط بالعربية؛ الرمز الأصلي يبقى ظاهرًا في details
const BIND_AR = {
  FRAME_TRANSFORM_REQUIRED: n => `زاوية الشمال في المخطط ${n}° وليست صفرًا. محرك الأنظمة يعمل بمحورين شرق/شمال، ولم يُصفَّر الرقم ولم تُدوَّر الإحداثيات تلقائيًا؛ الربط مرفوض حتى يُنفَّذ تحويل إحداثيات شامل.`,
  DRAW_SCHEMA_UNSUPPORTED: () => 'المستند ليس بصيغة المرسم mizan-draw/1.',
  UPSTREAM_INVALID_DOC: () => 'محقق المرسم الأصلي (validateDoc) وجد أخطاء في المخطط؛ صحّحها في المرسم ثم أعد الربط.',
  AMBIGUOUS_ROOM_LABELS: p => `في الدور ${p} تسمية غرفة خارج أي فراغ مغلق أو تسميتان في فراغ واحد؛ لا تُخمَّن الغرفة.`,
  UNLABELLED_SPACE: p => `يوجد فراغ مغلق بلا تسمية (${p})؛ سمِّه في المرسم قبل ربط الأنظمة.`,
  UPSTREAM_TOPOLOGY_REQUIRED: () => 'تعذر تحليل المخطط بمحلّل المرسم الأصلي.',
  UPSTREAM_MUTATED_INPUT: () => 'تغيّر المستند أثناء التحليل؛ رُفض الربط.',
};
export function bindingMessage(e, doc) {
  const code = e?.code || 'BINDING_FAILED', f = BIND_AR[code];
  return { code, path: e?.path || null, messageAr: f ? f(code === 'FRAME_TRANSFORM_REQUIRED' ? doc?.north : e?.path) : 'تعذر ربط المخطط بالأنظمة: ' + String(e?.message || code).slice(0, 160) };
}

/** مصادر البديل المعماري المتاحة في المتصفح: تصاميم الجلسة وبدائلها، والمستند المعتمد في المرسم. */
export function listSources({ session = null, studioRaw = null } = {}) {
  const out = [], tag = session?.createdAt ? String(session.createdAt) : 'nosession';
  const engine = session?.input?.engine || 'v3';
  (session?.designs || []).forEach((d, i) => {
    const v = d.version ?? i + 1;
    out.push({ id: `D${tag}-v${v}`, kind: 'design', label: `التصميم ${v}` + (session.approved === i ? ' (المعتمد)' : session.current === i ? ' (المعروض)' : ''), docText: d.doc, revision: `design-session:v${v}:${d.engine || engine}`, sessionKey: tag });
  });
  (session?.alternatives || []).forEach(a => {
    out.push({ id: `A${tag}-${a.index}`, kind: 'alternative', label: `البديل ${a.index + 1} كما عُرض`, docText: a.doc, revision: `alternative:${a.index}:${a.strategy || ''}`, sessionKey: tag });
  });
  if (studioRaw) {
    const ap = session && Number.isInteger(session.approved) ? session.designs[session.approved] : null;
    const link = ap ? `D${tag}-v${ap.version ?? session.approved + 1}` : 'unlinked';
    out.unshift({ id: `STUDIO-${link}`, kind: 'studio', label: ap ? `المخطط المعتمد في المرسم (من التصميم ${ap.version ?? session.approved + 1}، بتعديلاته)` : 'مخطط المرسم الحالي', docText: studioRaw, revision: `studio:${link}`, sessionKey: tag });
  }
  return out;
}

export const projectIdOf = alternativeId => ('MIZAN-' + String(alternativeId)).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 96);

/** مدخلات فارغة: لا أجهزة ولا أحمال ولا مناخ مفترض. كل رقم يدخله المستخدم أو يختار قيمة توضيحية معلنة. */
export function emptyInputs() {
  return { services: {}, rules: { routingByLevel: {}, rates: {}, provenance: [] }, domainByLevel: {}, structure: { usePrecheck: true }, manualObstacles: [] };
}

/** عوائق إنشائية من الفحص الإنشائي المبدئي الموجود (أعمدة وكمرات مقترحة)، بمناسيب Z مطلقة. ليست نموذجًا إنشائيًا معتمدًا. */
export function structuralObstacles(doc) {
  let S; try { S = computeStructure(doc); } catch (e) { return { obstacles: [], noteAr: 'تعذر الفحص الإنشائي المبدئي لهذا المخطط؛ لا توجد عوائق إنشائية في التنسيق.', error: String(e?.message || e).slice(0, 120) }; }
  const obstacles = [];
  for (const L of S.levels) {
    const lvl = doc.levels.find(l => l.id === L.id); if (!lvl || !L.columns) continue;
    const z0 = Number(lvl.elevation) || 0, h = Number(lvl.height) || 3.2;
    for (const c of L.columns) { const s = (c.size || 0.25) / 2; obstacles.push({ id: `STR-${L.id}-${c.id}`, kind: 'column-precheck', min: { x: r3(c.x - s), y: r3(c.y - s), z: z0 }, max: { x: r3(c.x + s), y: r3(c.y + s), z: r3(z0 + h) } }); }
    for (const b of L.beams || []) {
      const w = b.width / 2, dx = Math.abs(b.b.x - b.a.x), dy = Math.abs(b.b.y - b.a.y), ex = dx >= dy ? 0 : w, ey = dx >= dy ? w : 0, diag = dx > 1e-6 && dy > 1e-6 ? w : 0;
      obstacles.push({ id: `STR-${L.id}-${b.id}`, kind: 'beam-precheck', min: { x: r3(Math.min(b.a.x, b.b.x) - ex - diag), y: r3(Math.min(b.a.y, b.b.y) - ey - diag), z: r3(z0 + h - b.depth) }, max: { x: r3(Math.max(b.a.x, b.b.x) + ex + diag), y: r3(Math.max(b.a.y, b.b.y) + ey + diag), z: r3(z0 + h) } });
    }
  }
  return { obstacles, noteAr: 'الأعمدة والكمرات من الفحص الإنشائي المبدئي (تقدير بافتراضات معلنة)، وليست نموذجًا إنشائيًا معتمدًا؛ البلاطات والفتحات والقواعد غير ممثلة.' };
}

/** حيز تمرير مقترح لكل دور: محيط المبنى من محلّل المرسم (أو حدود الأرض) ناقص الأفنية — افتراض معلن قابل للتعديل. */
export function suggestDomains(doc, analysis = analyzeDoc(doc), modes = {}) {
  const out = {}, notes = [];
  for (const lv of analysis.levels) {
    const id = lv.level.id, mode = modes[id]?.mode || 'outline', stepM = Number(modes[id]?.stepM) > 0 ? Number(modes[id].stepM) : 0.25;
    if (mode === 'none') continue;
    let polygon = null;
    if (mode === 'plot' && Array.isArray(doc.plot?.polygon) && doc.plot.polygon.length >= 3) polygon = removeSpikes(doc.plot.polygon).polygon;
    else { const o = (lv.analysis.outlines || []).slice().sort((a, b) => Math.abs(b.area ?? 0) - Math.abs(a.area ?? 0))[0]; polygon = o?.polygon ? removeSpikes(o.polygon).polygon : null; }
    if (!polygon) { notes.push({ levelId: id, messageAr: 'لا يوجد محيط مغلق لهذا الدور؛ لا حيز تمرير مقترح.' }); continue; }
    const holes = [];
    for (const r of lv.rooms) if (['courtyard', 'balcony'].includes(r.type) && r.net?.length >= 3) {
      const net = removeSpikes(r.net).polygon;
      if (net.every(p => inside(p, polygon, false))) holes.push(net);
      else notes.push({ levelId: id, messageAr: `الفراغ المفتوح ${r.name} على حافة الحيز؛ لم يُطرح منه — راجع الحيز يدويًا.` });
    }
    out[id] = { polygon, holes, stepM };
  }
  return { routingByLevel: out, notes };
}

/**
 * تطبيع هندسي معلن لناتج analyzeDoc (لا للمستند): يحذف «الشوكة» الصفرية المساحة في المضلع الصافي — رأس يعود فيه الضلع
 * على استقامته (مثال فعلي من المولّد الثاني: رواق r3 بشوكة 2.5 سم عند تغير سماكة الجدار في وصلة T)، والرؤوس المكررة.
 * المساحة لا تتغير والمعرّفات تبقى؛ كل حذف يُسجَّل في notes. لا يُصلَح أي تقاطع ذاتي حقيقي: يبقى مرفوضًا من الحزمة.
 */
export function removeSpikes(poly, eps = 1e-9) {
  let P = poly.map(p => ({ x: p.x, y: p.y })), removed = 0, changed = true;
  while (changed && P.length > 3) {
    changed = false;
    for (let i = 0; i < P.length && P.length > 3; i++) {
      const a = P[(i + P.length - 1) % P.length], p = P[i], b = P[(i + 1) % P.length];
      const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
      const dup = Math.hypot(ux, uy) < 1e-9, cross = ux * vy - uy * vx, scale = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (dup || (Math.abs(cross) <= eps * Math.max(1, scale) && ux * vx + uy * vy < 0)) { P.splice(i, 1); removed++; changed = true; break; }
    }
  }
  return { polygon: P, removed };
}
function nativeAnalysis(notes) {
  return doc => {
    const a = analyzeDoc(doc);
    for (const lv of a.levels) for (const r of lv.rooms) {
      if (!r.net) continue;
      const s = removeSpikes(r.net); if (s.removed) { r.net = s.polygon; notes.push({ levelId: lv.level.id, roomId: r.id, code: 'NET_POLYGON_SPIKE_REMOVED', messageAr: `حُذفت شوكة صفرية المساحة (${s.removed} رأس) من المضلع الصافي للفراغ ${r.name} كما أخرجه محلّل المرسم؛ المساحة والمعرّف دون تغيير، والمخطط نفسه لم يُعدَّل.` }); }
      if (r.space?.holes?.length) r.space = { ...r.space, holes: r.space.holes.map(h => removeSpikes(h).polygon) };
    }
    return a;
  };
}

/**
 * يبني مدخل الأنظمة MIZAN-MEP-INPUT/1 من مستند البديل بالمحوّل الأصلي. لا يعدّل doc (يُتحقق ببصمته).
 * @returns {Promise<{ok:boolean, project?:object, sourceHash:string|null, error?:object, notes:object[], structure:object}>}
 */
export async function bindArchitecture(doc, { alternativeId, revision = 'UNSPECIFIED', inputs = emptyInputs() } = {}) {
  const notes = [];
  let before; try { before = await hash(doc); } catch (e) { return { ok: false, sourceHash: null, error: bindingMessage(e, doc), notes, structure: null }; }
  const north = Number(doc?.north);
  if (doc?.north !== 0 && !(Number.isFinite(north) && north === 0)) {
    // رفض صريح قبل أي حساب: لا يُصفَّر الرقم ولا تُدار الإحداثيات (المحوّل الأصلي يرفضه أيضًا بالرمز نفسه)
    return { ok: false, sourceHash: before, error: bindingMessage({ code: 'FRAME_TRANSFORM_REQUIRED', path: 'doc.north' }, doc), notes, structure: null };
  }
  const structure = inputs.structure?.usePrecheck === false ? { obstacles: [], noteAr: 'العوائق الإنشائية المبدئية معطلة بطلب المستخدم.' } : structuralObstacles(doc);
  const obstacles = [...structure.obstacles, ...clone(inputs.manualObstacles || []).map(o => ({ ...o, kind: o.kind || 'manual' }))];
  let analysis; try { analysis = analyzeDoc(doc); } catch (e) { return { ok: false, sourceHash: before, error: bindingMessage(e, doc), notes, structure }; }
  const domains = suggestDomains(doc, analysis, inputs.domainByLevel || {}); notes.push(...domains.notes);
  const routingByLevel = { ...domains.routingByLevel, ...clone(inputs.rules?.routingByLevel || {}) };
  const provenance = [
    { id: 'MIZAN-ROUTING-DOMAIN', classification: 'PROJECT_ASSUMPTION', authority: 'ALMIZAN_BINDING', verifiedCodeClause: null, noteAr: 'حيز التمرير محيط المبنى (أو حدود الأرض) ناقص الأفنية ودقة الشبكة 0.25 م ما لم تُعدَّل؛ افتراض قابل للتعديل وليس اشتراطًا.' },
    { id: 'MIZAN-STRUCTURAL-PRECHECK', classification: 'PROJECT_ASSUMPTION', authority: 'ALMIZAN_STRUCTURAL_PRECHECK', verifiedCodeClause: null, noteAr: structure.noteAr },
    ...clone(inputs.rules?.provenance || []),
  ];
  const rules = { ...clone(inputs.rules || {}), routingByLevel, structuralModelComplete: false, rates: clone(inputs.rules?.rates || {}), provenance };
  let project;
  try {
    project = await fromDrawDoc(doc, { analyzeDoc: nativeAnalysis(notes), validateDoc, projectId: projectIdOf(alternativeId), sourceRevision: String(revision), services: clone(inputs.services || {}), rules, obstacles });
  } catch (e) {
    if (!(e instanceof InputError) && !e?.code) throw e;
    return { ok: false, sourceHash: before, error: bindingMessage(e, doc), notes, structure };
  }
  if (await hash(doc) !== before) throw Error('MEP_BINDING_MUTATED_SOURCE');
  return { ok: true, project, sourceHash: before, notes, structure, levels: project.architecture.levels.map(l => ({ ...l, rooms: project.architecture.rooms.filter(r => r.levelId === l.id).length })) };
}

/** حساب كل التخصصات (الرايزرات تحتاج تخصصها محسوبًا، فلا يُستثنى تخصص). */
export const computeSystems = project => createEngineeringPackage(project, { disciplines: [...DISCIPLINES] });

/** حداثة النتيجة: سلامة محتواها، ومطابقتها للمخطط الحالي (بصمة المصدر) ولكل المدخلات (inputHash). */
export async function freshness(result, project, sourceHash) {
  if (!result) return { fresh: false, reason: 'NO_RESULT', messageAr: 'لم تُحسب الأنظمة بعد.' };
  if (!await verifyResult(result)) return { fresh: false, reason: 'RESULT_INTEGRITY', messageAr: 'محتوى النتيجة المحفوظة لا يطابق بصمتها؛ يلزم إعادة الحساب.' };
  if (!project) return { fresh: false, reason: 'NO_PROJECT', messageAr: 'المخطط غير مربوط.' };
  if (sourceHash && result.source?.sha256 !== sourceHash) return { fresh: false, reason: 'ARCHITECTURE_CHANGED', messageAr: 'تغيّر المخطط المعماري بعد الحساب؛ النتيجة القديمة لا تُستخدم.' };
  if (!await verifyBinding(result, project)) return { fresh: false, reason: 'INPUTS_CHANGED', messageAr: 'تغيّرت مدخلات الأنظمة أو مواقع الأجهزة بعد الحساب؛ يلزم إعادة الحساب.' };
  return { fresh: true, reason: 'FRESH', messageAr: 'النتيجة مطابقة للمخطط والمدخلات الحالية.' };
}

const FILE_SAFE = s => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
/** ملف تصدير بعد فحص الحداثة؛ النتيجة القديمة تُرفض (رمز STALE_RESULT) ولا يُنتج ملف. */
export async function buildExport(kind, { project, result, sourceHash, levelId = null, discipline = null, scheduleId = null }) {
  const f = await freshness(result, project, sourceHash);
  if (!f.fresh) { const e = Error(f.messageAr); e.code = 'STALE_RESULT'; e.reason = f.reason; throw e; }
  const base = `${FILE_SAFE(project.projectId)}-${result.inputHash.slice(0, 10)}`;
  if (kind === 'svg') return { name: `${base}-${FILE_SAFE(levelId || 'L')}-${FILE_SAFE(discipline || 'combined')}.svg`, mime: 'image/svg+xml', text: await toSvg(project, result, { levelId, ...(discipline ? { discipline } : {}) }) };
  if (kind === 'dxf') return { name: `${base}-${FILE_SAFE(levelId || 'all')}-${FILE_SAFE(discipline || 'combined')}.dxf`, mime: 'application/dxf', text: await toDxf(project, result, { ...(levelId ? { levelId } : {}), ...(discipline ? { discipline } : {}) }) };
  const art = await exportArtifacts(project, result);
  if (kind === 'csv') { const key = `schedules/${scheduleId || 'quantities'}.csv`; if (!art.has(key)) throw Object.assign(Error('جدول غير موجود: ' + scheduleId), { code: 'UNKNOWN_SCHEDULE' }); return { name: `${base}-${FILE_SAFE(scheduleId || 'quantities')}.csv`, mime: 'text/csv;charset=utf-8', text: art.get(key) }; }
  if (kind === 'json-result') return { name: `${base}-engineering-result.json`, mime: 'application/json', text: art.get('engineering-result.json') };
  if (kind === 'json-input') return { name: `${base}-engineering-input.json`, mime: 'application/json', text: art.get('engineering-input.json') };
  if (kind === 'json-issues') return { name: `${base}-issues.json`, mime: 'application/json', text: art.get('issues.json') };
  throw Object.assign(Error('صيغة غير مدعومة: ' + kind), { code: 'FORMAT_UNSUPPORTED' });
}

// ——— الكيان المحفوظ: مدخلات الأنظمة ونتيجتها لكل بديل على حدة (لا تختلط أجهزة بديلين) ———
export function loadStore(store) { try { const s = JSON.parse(store.getItem(STORE_KEY) || 'null'); return s && s.schema === SYSTEMS_SCHEMA && s.entities && typeof s.entities === 'object' ? s : { schema: SYSTEMS_SCHEMA, entities: {} }; } catch { return { schema: SYSTEMS_SCHEMA, entities: {} }; } }
/**
 * كيان البديل من التخزين. المفتاح = معرّف البديل (يتضمن مفتاح الجلسة createdAt)، ويُتحقق عند القراءة من ثلاثة أمور:
 * تطابق alternativeId المخزّن، وتطابق sessionKey، وبصمة المستند تُقارَن لاحقًا بـassessEntity (لا تُعرض نتيجة لمخطط آخر).
 * ctx: { sessionKey, kind } من listSources. كيان مرفوض يُعاد فارغًا مع restore.rejected ولا يُمحى من التخزين.
 */
export function entityFor(storeData, alternativeId, ctx = {}) {
  const e = storeData.entities[alternativeId];
  const blank = extra => ({ schema: SYSTEMS_SCHEMA, alternativeId, sessionKey: ctx.sessionKey ?? null, kind: ctx.kind ?? null, sourceHash: null, inputs: emptyInputs(), result: null, updatedAt: null, ...extra });
  if (!e) return blank();
  if (e.alternativeId !== undefined && e.alternativeId !== alternativeId) return blank({ restore: { rejected: 'ALTERNATIVE_MISMATCH', stored: e.alternativeId } });
  if (ctx.sessionKey != null && e.sessionKey != null && String(e.sessionKey) !== String(ctx.sessionKey)) return blank({ restore: { rejected: 'SESSION_MISMATCH', stored: e.sessionKey } });
  return clone(e);
}
export function saveEntity(store, storeData, entity) {
  const next = { ...storeData, entities: { ...storeData.entities, [entity.alternativeId]: { ...clone(entity), schema: SYSTEMS_SCHEMA, updatedAt: Date.now() } } };
  try { store.setItem(STORE_KEY, JSON.stringify(next)); return { ok: true, data: next }; }
  catch { // نتيجة كبيرة: تُحفظ المدخلات وحدها وتُعاد النتيجة بالحساب
    next.entities[entity.alternativeId].result = null;
    try { store.setItem(STORE_KEY, JSON.stringify(next)); return { ok: true, data: next, resultDropped: true }; } catch { return { ok: false, data: storeData }; }
  }
}

// ——— تحرير الأجهزة: كل تعديل يعيد نسخة جديدة من المدخلات (لا تعديل في المكان) ———
const groupOf = (inputs, path) => { let o = inputs.services; for (const k of path.slice(0, -1)) { o[k] = o[k] || {}; o = o[k]; } const last = path.at(-1); o[last] = o[last] || []; return o[last]; };
export function allDeviceIds(inputs) {
  const ids = new Set(), S = inputs.services || {};
  for (const groups of Object.values(DEVICE_GROUPS)) for (const g of groups) { let o = S; for (const k of g.path) o = o?.[k]; for (const d of o || []) ids.add(d.id); }
  for (const ex of S.hvac?.exhaust || []) { ids.add(ex.id); if (ex.discharge?.id) ids.add(ex.discharge.id); }
  for (const c of S.electrical?.circuits || []) ids.add(c.id);
  return ids;
}
export function nextId(inputs, kind) {
  const ids = allDeviceIds(inputs), p = ID_PREFIX[kind] || 'X';
  for (let i = 1; ; i++) if (!ids.has(p + i)) return p + i;
}
/**
 * موقع نقطة على الدور: الغرفة المربوطة، أو رفض موثق إن وقعت في فناء/شرفة أو خارج الغرف.
 * @returns {{ ok:boolean, roomId?:string, code?:string, messageAr?:string }}
 */
export function locate(doc, project, levelId, pt) {
  const room = project.architecture.rooms.find(r => r.levelId === levelId && inRoom(pt, r));
  if (room) return { ok: true, roomId: room.id, roomName: room.name };
  const lv = analyzeDoc(doc).levels.find(l => l.level.id === levelId);
  const open = lv?.rooms.find(r => ['courtyard', 'balcony'].includes(r.type) && r.net && inside(pt, r.net));
  if (open) return { ok: false, code: 'DEVICE_IN_OPEN_SPACE', openRoomId: open.id, messageAr: `الموقع داخل ${open.name} (فراغ مفتوح غير مكيّف)؛ لم يُربط الجهاز بغرفة. اختر «خارج الغرف» صراحة إن كان الجهاز خارجيًا.` };
  return { ok: false, code: 'DEVICE_OUTSIDE_ROOMS', messageAr: 'الموقع خارج غرف هذا الدور؛ لم يُربط الجهاز بغرفة. اختر «خارج الغرف» صراحة إن كان الجهاز خارجيًا (منهل، وحدة خارجية…).' };
}
/** يضيف جهازًا. spec: { discipline, group (فهرس), kind, levelId, position:{x,y,z}, roomId|null, outside:boolean, id? } */
export function addDevice(inputs0, spec) {
  const inputs = clone(inputs0), g = DEVICE_GROUPS[spec.discipline]?.[spec.group ?? 0];
  if (!g) throw Object.assign(Error('تخصص أو مجموعة غير معروفة'), { code: 'UNKNOWN_GROUP' });
  if (!g.kinds.some(([k]) => k === spec.kind)) throw Object.assign(Error('نوع جهاز غير معروف لهذه المجموعة'), { code: 'UNKNOWN_KIND' });
  if (!spec.roomId && !spec.outside) throw Object.assign(Error('الجهاز بلا غرفة: حدّد غرفة أو اختر «خارج الغرف» صراحة'), { code: 'ROOM_OR_OUTSIDE_REQUIRED' });
  const id = spec.id || nextId(inputs, spec.kind);
  if (allDeviceIds(inputs).has(id)) throw Object.assign(Error('المعرف مستخدم: ' + id), { code: 'DUPLICATE_ID' });
  const d = { id, kind: spec.kind, levelId: spec.levelId, position: { x: r3(spec.position.x), y: r3(spec.position.y), z: r3(spec.position.z) }, ...(spec.roomId ? { roomId: spec.roomId } : {}), ...(spec.extra || {}) };
  groupOf(inputs, g.path).push(d);
  return { inputs, id };
}
export function findDevice(inputs, id) {
  for (const [disc, groups] of Object.entries(DEVICE_GROUPS)) for (const [gi, g] of groups.entries()) { let o = inputs.services; for (const k of g.path) o = o?.[k]; const i = (o || []).findIndex(d => d.id === id); if (i >= 0) return { discipline: disc, group: gi, list: o, index: i, device: o[i] }; }
  return null;
}
export function moveDevice(inputs0, id, position, roomId = undefined) {
  const inputs = clone(inputs0), f = findDevice(inputs, id);
  if (!f) throw Object.assign(Error('الجهاز غير موجود في المدخلات (قد يكون مقترحًا من الحساب)'), { code: 'NOT_EDITABLE' });
  f.device.position = { x: r3(position.x), y: r3(position.y), z: r3(position.z ?? f.device.position.z) };
  if (roomId === null) delete f.device.roomId; else if (roomId !== undefined) f.device.roomId = roomId;
  return inputs;
}
export function removeDevice(inputs0, id) {
  const inputs = clone(inputs0), f = findDevice(inputs, id);
  if (!f) throw Object.assign(Error('الجهاز غير موجود في المدخلات'), { code: 'NOT_EDITABLE' });
  f.list.splice(f.index, 1);
  return inputs;
}
export function updateDevice(inputs0, id, patch) {
  const inputs = clone(inputs0), f = findDevice(inputs, id); if (!f) throw Object.assign(Error('الجهاز غير موجود'), { code: 'NOT_EDITABLE' });
  for (const [k, v] of Object.entries(patch)) if (v === undefined || v === null || v === '') delete f.device[k]; else f.device[k] = v;
  return inputs;
}
/**
 * يربط جهاز التكييف أو المضخة بحمل كهربائي: powerW = الاستهلاك الكهربائي الفعلي المدخل (ratedInputW) لا قدرة التبريد.
 * معامل القدرة وعامل الطلب يبقيان فارغين حتى يُدخلا (فلا يُحسب التيار بقيمة مخترعة).
 */
export function linkElectricalLoad(inputs0, equipmentId) {
  const inputs = clone(inputs0), f = findDevice(inputs, equipmentId);
  if (!f || f.discipline === 'electrical') throw Object.assign(Error('الجهاز غير موجود في التكييف أو الصحي'), { code: 'EQUIPMENT_NOT_FOUND' });
  const W = f.device.ratedInputW;
  if (typeof W !== 'number' || !Number.isFinite(W) || W <= 0) throw Object.assign(Error('أدخل الاستهلاك الكهربائي الفعلي للجهاز (ratedInputW بالواط) أولًا؛ قدرة التبريد ليست حملًا كهربائيًا.'), { code: 'RATED_INPUT_REQUIRED' });
  const loads = groupOf(inputs, ['electrical', 'loads']);
  const existing = loads.find(l => l.sourceEquipmentId === equipmentId);
  if (existing) { existing.powerW = W; return { inputs, id: existing.id, updated: true }; }
  let id = equipmentId + '-LOAD'; if (allDeviceIds(inputs).has(id)) id = nextId(inputs, 'EQUIPMENT_LOAD');
  loads.push({ id, kind: 'EQUIPMENT_LOAD', levelId: f.device.levelId, ...(f.device.roomId ? { roomId: f.device.roomId } : {}), position: clone(f.device.position), powerW: W, sourceEquipmentId: equipmentId });
  return { inputs, id, updated: false };
}


// ——— الإبطال بعد تعديل العمارة: حالة الكيان المحفوظ مقابل المخطط الحالي ———
/** كل أجهزة المدخلات بمراجعها (دور وغرفة) لمعرفة ما يفقد مرجعه بعد تعديل المخطط. */
export function deviceRefs(inputs) {
  const out = [], S = inputs?.services || {};
  for (const [discipline, groups] of Object.entries(DEVICE_GROUPS)) for (const g of groups) { let o = S; for (const k of g.path) o = o?.[k]; for (const d of o || []) out.push({ id: d.id, discipline, kind: d.kind, levelId: d.levelId ?? null, roomId: d.roomId ?? null }); }
  return out;
}
/** أجهزة فقدت دورها أو غرفتها في العمارة الحالية (تُحفظ ولا تُحذف، وتُعرض للمراجعة). */
export function orphanDevices(inputs, architecture) {
  const levels = new Set(architecture.levels.map(l => l.id)), rooms = new Set(architecture.rooms.map(r => r.levelId + '\u0000' + r.id));
  return deviceRefs(inputs).filter(d => !levels.has(d.levelId) || (d.roomId && !rooms.has(d.levelId + '\u0000' + d.roomId)));
}
/**
 * حالة الكيان المحفوظ مقابل المخطط الحالي (project من bindArchitecture بمدخلات الكيان، وsourceHash بصمة المستند الحالي).
 * state: NONE (لا نتيجة ولا أجهزة) | INPUTS_ONLY (أجهزة بلا نتيجة) | CURRENT | STALE.
 * foreign: كل أجهزة المدخلات بلا مرجع في المخطط الحالي بعد تغيّره، فالأرجح أنه مستند آخر (لا تُحمَّل المدخلات تلقائيًا).
 */
export async function assessEntity(entity, { project, sourceHash }) {
  const refs = deviceRefs(entity.inputs), orphans = project ? orphanDevices(entity.inputs, project.architecture) : [];
  if (!entity.result) return { state: refs.length ? 'INPUTS_ONLY' : 'NONE', reason: 'NO_RESULT', messageAr: 'لم تُحسب الأنظمة بعد.', fresh: false, archChanged: false, deviceCount: refs.length, orphans, foreign: false };
  const f = await freshness(entity.result, project, sourceHash);
  const archChanged = entity.result.source?.sha256 !== sourceHash || (!!entity.sourceHash && entity.sourceHash !== sourceHash);
  const foreign = archChanged && refs.length > 0 && orphans.length === refs.length;
  return { state: f.fresh ? 'CURRENT' : 'STALE', reason: f.reason, messageAr: f.messageAr, fresh: f.fresh, archChanged, deviceCount: refs.length, orphans, foreign };
}

// ——— قراءة النتيجة للعرض ———
/** قيمة الحساب للعرض: الناقص يبقى null مع سببه من رسائل التخصص (لا يُعرض صفر مكان الناقص). */
export function calcRows(result, discipline) {
  const d = result.disciplines.find(x => x.id === discipline); if (!d) return [];
  return d.calculations.map(c => {
    const why = c.status === 'NOT_CALCULATED' ? d.issues.find(i => i.details?.id === c.id) : null;
    return { id: c.id, method: c.method, status: c.status, unit: c.unit, value: c.value, reason: why ? `${why.messageAr} (${why.details.path || ''} ${why.details.error || ''})`.trim() : null, sourceRefs: c.sourceRefs };
  });
}
export function issuesOf(result, discipline = null) {
  const all = discipline === 'coordination' ? result.coordination.issues : discipline ? (result.disciplines.find(d => d.id === discipline)?.issues || []) : result.issues;
  const order = { error: 0, warning: 1, pending: 2 };
  return [...all].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
}
export function levelLayers(result, levelId, discipline = null) {
  const ds = result.disciplines.filter(d => !discipline || d.id === discipline);
  const on = x => x.levelId === levelId || x.levelIds?.includes(levelId);
  const layers = new Map();
  for (const d of ds) {
    for (const x of d.devices.filter(on)) { const L = layers.get(x.layer) || { layer: x.layer, devices: 0, routes: 0, blocked: 0 }; L.devices++; layers.set(x.layer, L); }
    for (const r of d.routes.filter(on)) { const L = layers.get(r.layer) || { layer: r.layer, devices: 0, routes: 0, blocked: 0 }; L.routes++; if (r.status === 'BLOCKED') L.blocked++; layers.set(r.layer, L); }
  }
  return [...layers.values()].map(L => ({ ...L, ar: LAYER_AR[L.layer] || L.layer, color: layerColor(L.layer) }));
}
/** إطار رسم SVG للحزمة (نفس حساب exports.mjs) لتحويل نقرة المستخدم إلى إحداثيات المخطط بالمتر. */
export function svgFrame(project, result, { levelId, discipline = null, layer = null } = {}) {
  const rooms = project.architecture.rooms.filter(r => r.levelId === levelId), walls = project.architecture.walls.filter(w => w.levelId === levelId);
  const coords = [...rooms.flatMap(r => r.polygon), ...walls.flatMap(w => [w.a, w.b])];
  const ds = result.disciplines.filter(d => !discipline || d.id === discipline);
  const on = x => x.levelId === levelId || x.levelIds?.includes(levelId), lay = x => !layer || x.layer === layer;
  coords.push(...ds.flatMap(d => d.devices).filter(d => d.levelId === levelId && lay(d)).map(d => d.position), ...ds.flatMap(d => d.routes).filter(r => on(r) && lay(r)).flatMap(r => r.points));
  if (!coords.length) return null;
  const bb = bounds(coords), scale = 850 / Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, 1), pad = 75, top = 110;
  return { bb, scale, pad, top, toSvg: p => ({ X: pad + (p.x - bb.minX) * scale, Y: top + (bb.maxY - p.y) * scale }), toPlan: ({ X, Y }) => ({ x: (X - pad) / scale + bb.minX, y: bb.maxY - (Y - top) / scale }) };
}

/** رسم SVG لنتيجة على المدخل الذي حُسبت عليه هي نفسها (الحزمة ترفض أي مدخل آخر). للعرض فقط؛ التصدير عبر buildExport. */
export const renderSvg = (project, result, opts = {}) => toSvg(project, result, opts);

/** أفعال الوكيل (شرعاء أو غيره) المحدودة والمربوطة ببصمة المخطط؛ بلا مزود ذكاء ولا شبكة ولا حفظ تلقائي. */
export function createSystemsAgent(readProject) {
  return createAgentActions({ getProject: async () => { const p = await readProject(); if (!p) throw Object.assign(Error('لا يوجد مخطط مربوط'), { code: 'NO_PROJECT' }); return p; } });
}
export { comparePackages, hash };
export default { SYSTEMS_SCHEMA, STORE_KEY, DISCIPLINES, DISCIPLINE_INFO, DEVICE_GROUPS, listSources, bindArchitecture, computeSystems, freshness, buildExport, loadStore, entityFor, saveEntity, addDevice, moveDevice, removeDevice, updateDevice, linkElectricalLoad, locate, deviceRefs, orphanDevices, assessEntity, calcRows, issuesOf, levelLayers, svgFrame, structuralObstacles, suggestDomains, createSystemsAgent, PRELIMINARY_AR, NO_CLASH_AR };
/** نقطة داخلية فعلية في الغرفة (تعمل للمضلعات المقعرة والثقوب). */
export { interiorPoint as interiorOf } from './engineering-systems/src/geometry.mjs';
