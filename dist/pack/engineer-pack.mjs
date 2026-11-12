// «حزمة تسليم للمهندس» (نقي: بلا DOM ولا تخزين ولا شبكة): يبني من مستند المرسم وبيانات المخرجات (buildFinalData) ملفات الحزمة:
//   01-DXF/   مسقط كل دور + الموقع العام (R2000، بالمتر، طبقات معيارية)        — dist/draw/dxf-pro.mjs
//   02-SVG/   اللوحات المتجهية كما تُعرض في الصفحة + اطبع-PDF.html (كل اللوحات جاهزة للطباعة A3) + كتاب المشروع
//   03-الكميات/ BOQ.xlsx (معادلات: الإجمالي = الكمية × سعر الوحدة، ومجموع SUM؛ بلا أسعار من عندنا) + BOQ.csv (UTF-8 مع BOM)
//   04-بيانات/ design.json (المستند كاملًا + الأرض + برنامج العميل + سجل تنفيذ الطلبات + إصدار الموقع) + ملف المرسم + README
//   05-صور/   الصورة المعمارية الموسومة ولقطة المجسم إن وُجدتا
// لا PDF: لا توجد في المستودع طريقة موثوقة لتوليد PDF متجهي بنص عربي مشكَّل بلا مكتبة، فلا نصنع PDF رديئًا؛ البديل ملف الطباعة.
// الأرقام كلها من data (quantities-doc) كما تعرضها الصفحة؛ لا حساب جديد هنا.
import { dxfSet, DXF_LAYERS } from '../draw/dxf-pro.mjs';
import { serialize, parseDoc } from '../draw/doc.mjs';
import { GRADES } from '../draw/quantities-doc.mjs';
import { roomTypeName } from '../draw/catalog.mjs';
import { STRUCT_IDS, SKIP_IDS, mepQuantityItems, projectBookHtml, NOT_COMPUTED_AR } from '../final-outputs.mjs';
import { xlsxBuild } from './xlsx-lite.mjs';
import { zipBuild, toBytes } from './zip-lite.mjs';

export const PACK_SCHEMA = 'mizan-engineer-pack/1';
export const PACK_DISCLAIMER_AR = 'هذه الحزمة تصميم أولي غير معتمد. الاعتماد والمخططات التنفيذية والإنشائية وحسابات الأنظمة من اختصاص مكتب هندسي مرخّص، ولا يجوز التنفيذ أو التقديم للترخيص بناءً عليها كما هي.';
export const PACK_DISCLAIMER_EN = 'This package is a PRELIMINARY, NON-APPROVED design. Approval, construction (working) drawings, structural design and MEP calculations must be produced by a licensed engineering office. Not for construction or permit submission as-is.';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = v => Math.round(v * 100) / 100;
const dayOf = now => (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);

/** اسم ملف آمن على Windows/macOS/Linux يحفظ الحروف العربية: يستبدل المحارف الممنوعة والمسافات بشرطة. */
export const slugName = s => String(s ?? '').normalize('NFC').replace(/[ً-ٰٟـ]/g, '').replace(/[\\/:*?"<>|\u0000-\u001f‎‏‪-‮⁦-⁩]+/g, ' ').trim().replace(/[\s.]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'مشروع';
export const packName = (title, now = new Date()) => `almizan-${slugName(title)}-${dayOf(now)}`;
/** كتابة لاتينية تقريبية لعنوان المشروع (لخانة PROJECT في لوحة عنوان DXF)؛ إن لم يكن فيه حروف لاتينية تُترك فارغة. */
const latinOf = s => String(s ?? '').replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------------------------------------ الكميات
/** صفوف جدول الكميات بأقسامه، من الأرقام نفسها التي تعرضها الصفحة. كل صف: { section, label, basis, unit, value|null, grade }. */
export function boqRows(data, mep = data?.mep) {
  const rows = data.quantities?.rows || [], out = [];
  const push = (section, r) => out.push({ section, id: r.id, label: r.label, basis: r.basis || '', unit: r.unit || '', value: r.value === null || r.value === undefined ? null : Number(r.value), grade: GRADES[r.grade] || '' });
  for (const r of rows) if (!STRUCT_IDS.has(r.id) && !SKIP_IDS.has(r.id)) push('الكميات المعمارية', r);
  for (const r of rows) if (STRUCT_IDS.has(r.id)) push('الكميات الإنشائية (تحجيم أولي غير معتمد)', r);
  const S3 = 'كميات الأنظمة الهندسية (أولية بافتراضات معلنة)', items = mepQuantityItems(mep);
  if (items.length) for (const [label, value, unit, basis] of items) out.push({ section: S3, id: 'mep:' + label, label, basis: basis || '', unit: unit || '', value: value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value), grade: GRADES.estimated });
  else out.push({ section: S3, id: 'mep', label: 'الكهرباء والسباكة والتكييف', basis: NOT_COMPUTED_AR + (mep?.reasonAr ? ' — ' + mep.reasonAr : ''), unit: '', value: null, grade: GRADES.unavailable });
  return out;
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/** BOQ.csv: UTF-8 مع BOM وفواصل CRLF؛ عمودا السعر والإجمالي فارغان (لا أسعار من عندنا). */
export function boqCsv(data, mep) {
  const rows = [['القسم', 'البند', 'الوصف / أساس الحساب', 'الوحدة', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'درجة الدقة']];
  for (const r of boqRows(data, mep)) rows.push([r.section, r.label, r.basis, r.unit, r.value === null ? '' : r.value, '', '', r.grade]);
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
/** أوراق BOQ.xlsx الثلاث: جدول الكميات (بمعادلات)، جدول المساحات، بيانات المشروع. */
export function boqSheets(data, { mep = data?.mep, version = null, now = new Date() } = {}) {
  const items = boqRows(data, mep), q = [], HEAD = 3;
  q.push([{ v: 'جدول الكميات — ' + data.title, s: 'title' }]);
  q.push([{ v: 'أدخل سعر الوحدة في العمود الأصفر؛ الإجمالي = الكمية × سعر الوحدة، والمجموع في آخر الجدول. لا توجد أسعار افتراضية. ' + PACK_DISCLAIMER_AR, s: 'note' }]);
  q.push(['م', 'البند', 'الوصف / أساس الحساب', 'الوحدة', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'درجة الدقة'].map(v => ({ v, s: 'head' })));
  let section = null, n = 0; const itemRows = [];
  for (const r of items) {
    if (r.section !== section) { section = r.section; q.push([{ v: '', s: 'key' }, { v: section, s: 'key' }, ...Array(6).fill({ v: '', s: 'key' })]); }
    const row = q.length + 1; itemRows.push(row);
    q.push([{ v: ++n, s: 'int' }, { v: r.label, s: 'text' }, { v: r.basis, s: 'text' }, { v: r.unit, s: 'text' },
      r.value === null ? { v: '', s: 'text' } : { v: r.value, s: Number.isInteger(r.value) && /عدد|قطعة|وحدة|مقبس|دائرة|جهاز|سخان|عنصر|لوح/.test(r.unit) ? 'int' : 'num' },
      { v: '', s: 'input' }, { f: `IF(OR(E${row}="",F${row}=""),"",E${row}*F${row})`, s: 'num' }, { v: r.grade, s: 'text' }]);
  }
  const first = itemRows[0] || HEAD + 1, last = q.length, totalRow = last + 1;
  q.push([{ v: '', s: 'totalText' }, { v: 'المجموع (البنود المسعّرة فقط)', s: 'totalText' }, { v: '', s: 'totalText' }, { v: '', s: 'totalText' }, { v: '', s: 'totalText' }, { v: '', s: 'totalText' }, { f: `SUM(G${first}:G${last})`, s: 'total' }, { v: '', s: 'totalText' }]);
  const rooms = data.rooms || [], a = [];
  a.push(['م', 'الدور', 'الفراغ', 'النوع', 'الطول (م)', 'العرض (م)', 'الأبعاد (م)', 'المساحة الصافية (م²)'].map(v => ({ v, s: 'head' })));
  rooms.forEach((r, i) => { const ok = Number.isFinite(r.w) && Number.isFinite(r.h), l = ok ? Math.max(r.w, r.h) : null, w = ok ? Math.min(r.w, r.h) : null;
    a.push([{ v: i + 1, s: 'int' }, { v: r.level, s: 'text' }, { v: r.name, s: 'text' }, { v: roomTypeName(r.type) || r.type || '', s: 'text' }, ok ? { v: l, s: 'num' } : { v: '', s: 'text' }, ok ? { v: w, s: 'num' } : { v: '', s: 'text' }, { v: ok ? `${l.toFixed(2)} × ${w.toFixed(2)}` : '—', s: 'text' }, Number.isFinite(r.area) ? { v: r.area, s: 'num' } : { v: '', s: 'text' }]); });
  if (rooms.length) a.push([{ v: '', s: 'totalText' }, { v: '', s: 'totalText' }, { v: `إجمالي المساحات الصافية (${rooms.length} فراغًا)`, s: 'totalText' }, ...Array(4).fill({ v: '', s: 'totalText' }), { f: `SUM(H2:H${rooms.length + 1})`, s: 'total' }]);
  a.push([{ v: 'المساحات صافية داخل الجدران، والأبعاد أبعاد المستطيل المحيط بالفراغ؛ الإجمالي لا يشمل سماكات الجدران.', s: 'note' }]);
  const S = data.summary || {}, plot = data.doc?.plot, sb = plot?.setbacks, SIDE = { n: 'شمال', s: 'جنوب', e: 'شرق', w: 'غرب' };
  const kv = (k, v, s) => [{ v: k, s: 'key' }, typeof v === 'number' ? { v, s: s || 'num' } : { v: v ?? '—', s: 'text' }];
  const p = [[{ v: 'بيانات المشروع', s: 'title' }], ['البيان', 'القيمة'].map(v => ({ v, s: 'head' })),
    kv('اسم المشروع', data.title), kv('تاريخ التوليد', dayOf(now)), kv('بصمة الهندسة', data.fingerprint || '—'),
    kv('عدد الأدوار', S.levels ?? null, 'int'), kv('عدد الفراغات', S.rooms ?? null, 'int'),
    kv('مساحة المسقط (م²)', S.builtArea ?? null), kv('مساحة الغرف الصافية (م²)', S.roomsArea ?? null),
    kv('عدد الأبواب', S.doors ?? null, 'int'), kv('عدد النوافذ', S.windows ?? null, 'int'),
    kv('عرض الأرض (م)', S.plot?.width ?? null), kv('طول الأرض (م)', S.plot?.length ?? null),
    kv('الارتدادات المُدخلة (م)', sb ? Object.entries(sb).map(([k, v]) => `${SIDE[k] || k} ${v}`).join(' · ') : 'غير مُدخلة'),
    kv('جهات الشوارع', (data.doc?.streets || []).map(k => SIDE[k] || k).join('، ') || 'غير محددة'),
    kv('جهة المدخل', (data.doc?.entries || (data.doc?.entry ? [data.doc.entry] : [])).map(k => SIDE[k] || k).join('، ') || 'غير محددة'),
    kv('الوحدات', 'المتر والمتر المربع والمتر المكعب'), kv('إصدار الموقع', version?.commit ? String(version.commit).slice(0, 12) : 'غير متاح'),
    kv('تنبيه', PACK_DISCLAIMER_AR)];
  return [
    { name: 'جدول الكميات', rtl: true, cols: [6, 34, 58, 10, 14, 14, 16, 20], freezeRows: HEAD, rows: q, merges: ['A1:H1', 'A2:H2'], heights: { 1: 48 }, itemRows, totalRow },
    { name: 'جدول المساحات', rtl: true, cols: [6, 18, 30, 20, 11, 11, 16, 20], freezeRows: 1, rows: a, merges: rooms.length ? [`A${rooms.length + 3}:H${rooms.length + 3}`] : [] },
    { name: 'بيانات المشروع', rtl: true, cols: [30, 70], freezeRows: 2, rows: p, merges: ['A1:B1'] },
  ];
}

// ------------------------------------------------------------------------------------------------ اللوحات المتجهية
/** اللوحات كما هي في الصفحة: لكل لوحة ملف SVG مستقل (بإعلان XML). */
export function svgSheets(data) {
  const out = [], add = (no, id, title, svg) => { if (typeof svg === 'string' && svg.includes('<svg')) out.push({ name: `${no}-${id}.svg`, no, title, svg }); };
  for (const x of data.drawings?.sheets || []) if (x.id === 'site') add(x.no, x.id, x.title, x.svg);
  (data.levels || []).forEach((l, i) => add('A-' + String(i + 1).padStart(2, '0'), 'plan-' + (l.id || i + 1), 'المخطط — ' + l.name, l.plan));
  for (const x of data.drawings?.sheets || []) if (x.id !== 'site') add(x.no, x.id, x.title, x.svg);
  (data.levels || []).forEach((l, i) => add('S-' + String(i + 1).padStart(2, '0'), 'structure-' + (l.id || i + 1), 'المخطط الإنشائي المبدئي — ' + l.name, l.structure));
  return out;
}
const svgFile = svg => (svg.startsWith('<?xml') ? svg : '<?xml version="1.0" encoding="UTF-8"?>\n' + svg);
/** صفحة طباعة مستقلة: كل لوحة في صفحة A3 أفقية؛ «طباعة» ثم «حفظ بصيغة PDF» من المتصفح تعطي PDF متجهيًا. */
export function printHtml(sheets, { title = '', date = '' } = {}) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اللوحات للطباعة — ${esc(title)}</title><style>
@page{size:A3 landscape;margin:0}
*{box-sizing:border-box}body{margin:0;background:#e9e4d8;font-family:"IBM Plex Sans Arabic",Tahoma,"Noto Sans Arabic",Arial,sans-serif;color:#17332a}
.bar{position:sticky;top:0;z-index:2;background:#0f3d33;color:#fff;padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.bar b{font-size:16px}.bar span{opacity:.85;font-size:13px;flex:1;min-width:200px}
.bar button{font:inherit;font-weight:700;background:#c6a15b;color:#1c1608;border:0;border-radius:10px;padding:10px 18px;cursor:pointer}
.sheet{width:min(420mm,100vw - 24px);aspect-ratio:420/297;margin:14px auto;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;overflow:hidden}
.sheet svg{width:100%;height:100%;display:block}
.warn{max-width:420mm;margin:10px auto;padding:0 12px;font-size:13px}
@media print{body{background:#fff}.bar,.warn{display:none}.sheet{width:420mm;height:297mm;margin:0;box-shadow:none;page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto;break-after:auto}}
</style></head><body><div class="bar"><b>${esc(title)}</b><span>${sheets.length} لوحة · ${esc(date)} · اختر في نافذة الطباعة: الورق A3، الاتجاه أفقي، الهوامش «بلا»، ثم «حفظ بصيغة PDF».</span><button type="button" onclick="window.print()">اطبع / احفظ PDF</button></div>
<p class="warn">${esc(PACK_DISCLAIMER_AR)}</p>
${sheets.map(s => `<section class="sheet" data-sheet="${esc(s.no)}" aria-label="${esc(s.no + ' ' + s.title)}">${s.svg.replace(/^<\?xml[^>]*\?>\s*/, '')}</section>`).join('\n')}
</body></html>`;
}

// ------------------------------------------------------------------------------------------------ البيانات
/** الأرض من الجلسة إن وُجدت، وإلا مما في المستند نفسه. */
const landOf = (doc, session) => session?.input?.land || (doc.plot ? { polygon: doc.plot.polygon || null, setbacks: doc.plot.setbacks || null, streets: doc.streets || [], entries: doc.entries || (doc.entry ? [doc.entry] : []), north: doc.north ?? 0, source: 'doc' } : null);
/**
 * design.json: المستند كما هو + الأرض + برنامج العميل + سجل تنفيذ الطلبات + إصدار الموقع + جلسة مختصرة تُعاد بها الرحلة.
 * الجلسة المختصرة تحمل التصميم المُسلَّم وحده (لا بدائل ولا سجل ما عُرض) حتى يبقى الملف صغيرًا.
 */
export function designJson({ doc, session = null, data = null, ledger = null, version = null, now = new Date() }) {
  const text = serialize(doc), cur = session?.designs?.[session.current ?? 0] || null;
  const slim = session && session.v === 1 && session.input ? {
    v: 1, input: session.input, current: 0, approved: 0, createdAt: session.createdAt ?? null, dna: session.dna ?? null, seen: [], alternatives: [],
    designs: [{ doc: text, pat: cur?.pat ?? null, summary: cur?.summary || '', notes: cur?.notes || [], floors: cur?.floors || doc.levels.length, feedback: cur?.feedback ?? null, engine: cur?.engine || '', ledger: cur?.ledger ?? null, mirror: cur?.mirror ?? null, fit: cur?.fit ?? null }],
  } : null;
  return {
    schema: PACK_SCHEMA, generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    site: { name: 'الميزان الهندسي', nameEn: 'Al-Mizan Al-Handasi', version: { commit: version?.commit ?? null, builtAt: version?.builtAt ?? null } },
    title: doc.title || '', geometryFingerprint: data?.fingerprint ?? null, units: { length: 'm', area: 'm2', volume: 'm3' },
    disclaimer: { ar: PACK_DISCLAIMER_AR, en: PACK_DISCLAIMER_EN },
    doc: JSON.parse(text),
    land: landOf(doc, session),
    program: session?.input ? { requirements: session.input.requirements ?? null, idea: session.input.idea ?? '', discovery: session.input.discovery ?? null } : null,
    ledger: Array.isArray(ledger) ? ledger : (cur?.ledger ?? null),
    summary: data?.summary ?? null,
    session: slim,
  };
}
/**
 * إعادة فتح design.json: يتحقق من المخطط ويعيد { studioRaw, session, title } — studioRaw يُكتب في مفتاح المرسم،
 * وsession (إن وُجدت) في مفتاح الجلسة؛ يرمي خطأً عربيًا إن كان الملف غير صالح.
 */
export function restoreDesignJson(input) {
  let j; try { j = typeof input === 'string' ? JSON.parse(input.replace(/^﻿/, '')) : input; } catch { throw new Error('ملف design.json غير صالح (ليس JSON).'); }
  if (!j || j.schema !== PACK_SCHEMA || !j.doc) throw new Error('ملف design.json ليس من حزمة المهندس أو بإصدار غير مدعوم.');
  const doc = parseDoc(JSON.stringify(j.doc)), studioRaw = serialize(doc);
  let session = null;
  if (j.session && j.session.v === 1 && Array.isArray(j.session.designs) && j.session.designs.length && j.session.input) {
    session = structuredClone(j.session); session.current = Math.min(Math.max(0, session.current | 0), session.designs.length - 1);
    for (const d of session.designs) parseDoc(d.doc);
  }
  return { studioRaw, session, title: doc.title || '' };
}

/** README بالعربية ثم الإنجليزية: المحتوى، الوحدات، جدول الطبقات، حدود النص العربي والأبعاد، والتنبيه. */
export function readmeText({ title, date, files = [], version = null, fingerprint = null, dxfFiles = [], hasPhoto = false }) {
  const list = files.map(f => '  ' + f).join('\r\n'), pad = (s, n) => String(s).padEnd(n);
  const layers = DXF_LAYERS.map(l => `  ${pad(l.name, 13)} ${pad(l.color, 3)} ${pad((l.lw / 100).toFixed(2), 5)} ${pad(l.lt, 11)} ${l.ar}`).join('\r\n');
  const layersEn = DXF_LAYERS.map(l => `  ${pad(l.name, 13)} ${pad(l.color, 3)} ${pad((l.lw / 100).toFixed(2), 5)} ${pad(l.lt, 11)} ${l.en}`).join('\r\n');
  const ver = version?.commit ? String(version.commit).slice(0, 12) : 'غير متاح / n/a';
  return ['﻿حزمة المهندس — الميزان الهندسي', '================================', `المشروع: ${title}`, `تاريخ التوليد: ${date}`, `بصمة الهندسة: ${fingerprint || '—'}`, `إصدار الموقع: ${ver}`, '',
    '!! تنبيه', PACK_DISCLAIMER_AR, '',
    'محتوى الحزمة', '-------------', list, '',
    '01-DXF  — مخططات CAD', `  ${dxfFiles.join('، ') || '—'}`,
    '  · الصيغة: DXF نصي R2000 (AC1015)، يُفتح في AutoCAD 2000 فما بعد وBricsCAD وDraftSight وLibreCAD/QCAD، ويُستورد في Revit وArchiCAD.',
    '  · الوحدة: المتر. 1 وحدة رسم = 1 م ($INSUNITS=6، $MEASUREMENT=1). الأصل (0,0) عند ركن الأرض (الجنوبي الغربي في الرسم)، والمحور Y نحو أعلى اللوحة.',
    '  · الجدران مضلعات مغلقة (LWPOLYLINE) بسماكتها الحقيقية، مقطوعة عند الفتحات. الأبواب: ضلفة + قوس فتح. النوافذ: إطار + خطا زجاج. لكل فتحة وسم (D01، W01).',
    '  · حدود الفراغات الصافية مضلعات مغلقة على الطبقة A-AREA (تصلح لأمر AREA)، وأسماؤها ومساحاتها على A-AREA-IDEN.',
    '  · الأبعاد خطوط وشرطات ونصوص على A-ANNO-DIMS، وليست كيانات DIMENSION (فهي غير مرتبطة بالهندسة؛ أعد توليدها بنمط أبعادك عند الحاجة).',
    '  · النص العربي: الملف ASCII وكل حرف عربي مكتوب بصيغة \\U+XXXX مع $DWGCODEPAGE=ANSI_1256 ونمط نص ARABIC بخط arial.ttf. في AutoCAD يُعرض',
    '    مشكَّلًا من اليمين لليسار بخط TrueType. بعض البرامج التي ترسم بخطوطها الداخلية (مثل LibreCAD) قد تُظهر الحروف منفصلة أو معكوسة؛',
    '    لذلك كُتب بجانب كل اسم فراغ اسم لاتيني مختصر (MAJLIS، BED-1، WC-2...) والمساحة بالأرقام.',
    '  · الواجهات والقطاع غير متوفرة بصيغة DXF في هذا الإصدار؛ تجدها متجهةً في 02-SVG.',
    '  · إطار كل ملف بمقاس A3 أفقي بالمقياس المكتوب في لوحة العنوان.', '',
    '  جدول الطبقات (الاسم، لون ACI، وزن الخط مم، نوع الخط، المحتوى):', layers, '',
    '02-SVG  — اللوحات المتجهية كما تظهر في الموقع (مساقط، موقع عام، واجهات، قطاع، جدول الفتحات، الإنشائي المبدئي).',
    '  · «اطبع-PDF.html»: افتحه في المتصفح ثم اطبع ← حفظ بصيغة PDF (ورق A3 أفقي، بلا هوامش) لتحصل على PDF متجهي. لا يوجد PDF جاهز في الحزمة.',
    '  · «كتاب-المشروع.html»: التقرير الكامل للقراءة والطباعة.', '',
    '03-الكميات', '  · BOQ.xlsx: ورقة «جدول الكميات» (عمود سعر الوحدة فارغ تملؤه أنت، والإجمالي = الكمية × السعر، ومجموع SUM)، ورقة «جدول المساحات»، ورقة «بيانات المشروع».',
    '  · BOQ.csv: الجدول نفسه نصًّا (UTF-8 مع BOM). لا توجد أسعار من عندنا في أي ملف. الكميات تحمل درجة دقتها: مقيس / تقدير بافتراض معلن / غير قابل للحساب.', '',
    '04-بيانات', '  · design.json: مستند التصميم كاملًا + الأرض + برنامج العميل + سجل تنفيذ الطلبات + إصدار الموقع (لإعادة الفتح أو المعالجة الآلية).',
    '  · ملف «.mizan.json»: يُفتح مباشرة من زر «فتح» في مرسم الموقع.', '',
    ...(hasPhoto ? ['05-صور', '  · صور للتصوّر فقط. الصورة المعمارية محسّنة بالذكاء الاصطناعي وموسومة بذلك؛ المرجع دائمًا هو المخططات.', ''] : []),
    'كل شيء وُلّد في متصفحك؛ لم يُرفع شيء إلى أي خادم.', '', '',
    'ENGINEER HANDOVER PACKAGE — AL-MIZAN AL-HANDASI', '================================================', `Project: ${title}`, `Generated: ${date}`, `Geometry fingerprint: ${fingerprint || '-'}`, `Site version: ${ver}`, '',
    '!! NOTICE', PACK_DISCLAIMER_EN, '',
    'CONTENTS', '--------', list, '',
    '01-DXF  — CAD drawings (one file per floor + site plan)',
    '  - Format: ASCII DXF R2000 (AC1015). Opens in AutoCAD 2000+, BricsCAD, DraftSight, LibreCAD/QCAD; importable into Revit / ArchiCAD.',
    '  - Units: metres. 1 drawing unit = 1 m ($INSUNITS=6, $MEASUREMENT=1). Origin (0,0) at the plot corner (south-west of the drawing), Y up.',
    '  - Walls are closed LWPOLYLINEs with true thickness, cut at openings. Doors: leaf LINE + swing ARC. Windows: frame + two glass lines. Every opening has a tag (D01, W01).',
    '  - Net room boundaries are closed polylines on A-AREA; names and areas on A-AREA-IDEN (Arabic name + Latin code such as MAJLIS, BED-1).',
    '  - Dimensions are plain lines, ticks and text on A-ANNO-DIMS, not associative DIMENSION entities.',
    '  - Arabic text: the file is pure ASCII; Arabic is written as \\U+XXXX escapes with $DWGCODEPAGE=ANSI_1256 and a TrueType text style (ARABIC, arial.ttf).',
    '    AutoCAD shapes it right-to-left. Viewers using built-in stroke fonts (e.g. LibreCAD) may show isolated or reversed letters; use the Latin codes.',
    '  - Elevations and sections are not provided as DXF in this version; see 02-SVG.', '',
    '  Layer table (name, ACI colour, lineweight mm, linetype, content):', layersEn, '',
    '02-SVG  — vector sheets as shown on the website. Open the print HTML file in a browser and print to PDF (A3 landscape, no margins) for a vector PDF.',
    '03 — BOQ.xlsx (unit price column is empty for you to fill; Total = Qty x Unit price; SUM at the bottom), BOQ.csv (UTF-8 with BOM). No prices are supplied by us.',
    '04 — design.json (full design document, plot, client programme, request ledger, site version) and a .mizan.json file that opens in the website studio.', '',
    'Everything was generated in your browser; nothing was uploaded to any server.', ''].join('\r\n');
}

// ------------------------------------------------------------------------------------------------ الحزمة
const dataUrlBytes = url => { const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url || ''); if (!m) return null; const bin = atob(m[3]), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return { bytes: b, ext: m[2] === 'jpeg' ? 'jpg' : m[2] }; };
export const PACK_GROUPS = Object.freeze([
  { id: 'dxf', dir: '01-DXF', label: 'مخططات CAD (DXF)' },
  { id: 'svg', dir: '02-SVG', label: 'اللوحات المتجهية وملف الطباعة PDF' },
  { id: 'boq', dir: '03-الكميات', label: 'جدول الكميات (Excel وCSV)' },
  { id: 'data', dir: '04-بيانات', label: 'بيانات التصميم واقرأني' },
  { id: 'img', dir: '05-صور', label: 'الصور' },
]);
/**
 * يبني ملفات الحزمة (بلا ضغط بعد).
 * @param {{ doc, data, session?, mep?, ledger?, version?, now?, bookCss?: string,
 *           photo?: {bytes:Uint8Array, ext:string}|null  // الصورة المعمارية «الموسومة» جاهزةً؛ لا تُضاف صورة غير موسومة
 *           onProgress?: (p:{step:string, done:number, total:number})=>void }} o
 * @returns {Promise<{ name, root, files: {path, group, bytes, size, mime}[], groups, dxf, notes: string[] }>}
 */
export async function buildEngineerPack({ doc, data, session = null, mep = data?.mep ?? null, ledger = null, version = null, now = new Date(), bookCss = '', photo = null, onProgress = null } = {}) {
  if (!doc || !data) throw new Error('حزمة المهندس: لا يوجد تصميم.');
  const date = dayOf(now), root = packName(data.title || doc.title, now), files = [], notes = [], STEPS = 6; let step = 0;
  const tick = async label => { if (onProgress) onProgress({ step: label, done: ++step, total: STEPS }); await new Promise(r => setTimeout(r, 0)); };
  const add = (group, name, content, mime) => { const bytes = toBytes(content), dir = PACK_GROUPS.find(g => g.id === group).dir; files.push({ path: `${dir}/${name}`, group, bytes, size: bytes.length, mime }); };
  // 1) DXF
  let dxf = [];
  try { dxf = dxfSet(doc, { structure: data.structure, date, fingerprint: data.fingerprint, projectLatin: latinOf(data.title) }); for (const f of dxf) add('dxf', f.name, f.text, 'application/dxf'); }
  catch (e) { notes.push('تعذّر توليد DXF: ' + (e?.message || e)); }
  await tick('مخططات DXF');
  // 2) SVG + ملف الطباعة + كتاب المشروع
  const sheets = svgSheets(data);
  for (const s of sheets) add('svg', s.name, svgFile(s.svg), 'image/svg+xml');
  if (sheets.length) add('svg', 'اطبع-PDF.html', printHtml(sheets, { title: data.title, date }), 'text/html;charset=utf-8');
  for (const e of data.drawings?.errors || []) notes.push('لوحة غير متاحة: ' + e);
  await tick('اللوحات المتجهية');
  try { add('svg', 'كتاب-المشروع.html', projectBookHtml({ ...data, mep }, { css: bookCss }), 'text/html;charset=utf-8'); } catch (e) { notes.push('تعذّر كتاب المشروع: ' + (e?.message || e)); }
  await tick('كتاب المشروع');
  // 3) الكميات
  add('boq', 'BOQ.xlsx', await xlsxBuild(boqSheets(data, { mep, version, now }), { title: 'جدول الكميات — ' + data.title, created: now }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  add('boq', 'BOQ.csv', boqCsv(data, mep), 'text/csv;charset=utf-8');
  await tick('جدول الكميات');
  // 4) البيانات
  add('data', 'design.json', JSON.stringify(designJson({ doc, session, data, ledger, version, now }), null, 1), 'application/json');
  add('data', slugName(data.title || doc.title) + '.mizan.json', serialize(doc), 'application/json');
  // 5) الصور
  if (photo?.bytes?.length) add('img', 'صورة-معمارية-محسّنة-بالذكاء-الاصطناعي.' + (photo.ext || 'jpg'), photo.bytes, 'image/' + (photo.ext === 'jpg' ? 'jpeg' : photo.ext || 'jpeg'));
  const snap = dataUrlBytes(data.snapshot3d); if (snap) add('img', 'لقطة-المجسم.' + snap.ext, snap.bytes, 'image/' + (snap.ext === 'jpg' ? 'jpeg' : snap.ext));
  await tick('البيانات والصور');
  const readme = readmeText({ title: data.title, date, version, fingerprint: data.fingerprint, dxfFiles: dxf.map(f => f.name), hasPhoto: files.some(f => f.group === 'img'), files: [...files.map(f => f.path), '04-بيانات/README-اقرأني.txt'] });
  add('data', 'README-اقرأني.txt', readme, 'text/plain;charset=utf-8');
  await tick('اقرأني');
  const groups = PACK_GROUPS.map(g => { const list = files.filter(f => f.group === g.id); return { ...g, count: list.length, size: list.reduce((a, f) => a + f.size, 0) }; }).filter(g => g.count);
  return { name: root + '.zip', root, files, groups, dxf: dxf.map(f => ({ name: f.name, titleAr: f.titleAr, meta: f.meta })), notes, size: files.reduce((a, f) => a + f.size, 0) };
}
/** ZIP واحد للحزمة كلها أو لمجموعة واحدة (group: dxf|svg|boq|data|img). الملفات داخل مجلد جذر باسم الحزمة. */
export async function packZip(pack, { group = null, now = new Date(), onProgress = null } = {}) {
  const list = pack.files.filter(f => !group || f.group === group);
  if (!list.length) throw new Error('لا ملفات في هذه المجموعة.');
  return zipBuild(list.map(f => ({ name: pack.root + '/' + f.path, bytes: f.bytes })), { date: now instanceof Date ? now : new Date(now), onProgress });
}
export const fmtSize = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' م.ب' : n >= 1024 ? Math.round(n / 1024) + ' ك.ب' : n + ' بايت');
export default { PACK_SCHEMA, PACK_GROUPS, PACK_DISCLAIMER_AR, PACK_DISCLAIMER_EN, buildEngineerPack, packZip, boqRows, boqSheets, boqCsv, svgSheets, printHtml, designJson, restoreDesignJson, readmeText, packName, slugName, fmtSize };
