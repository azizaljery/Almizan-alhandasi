// قسم «كميات الأنظمة الهندسية — أولية» داخل المخرجات النهائية (كتاب المشروع، صفحة المخرجات، quantities.csv، manifest.json، تبويب الكميات).
// الجزء الأعلى نقي وخفيف بلا استيراد (تستعمله حزمة التصدير دون تحميل حزمة الأنظمة)؛ الحلّ من التخزين يستورد mep-binding ديناميكيًا.
// قواعد القسم: لا كمية قديمة (نتيجة قديمة أو غير مطابقة للمخطط الحالي ⇒ لا أرقام)، لا صفر مكان الناقص، لا سعر ≠ صفر:
// الناقص «غير مسعّر»، وNOT_CALCULATED وBLOCKED تُذكر بسببها. constructionApproved=false وcodeCompliance=NOT_EVALUATED كما من الحزمة.
export const SECTION_SCHEMA = 'mizan-mep-quantities/1';
export const SECTION_TITLE_AR = 'كميات الأنظمة الهندسية — أولية';
export const CLASSIFICATION_AR = 'كميات أولية — غير معتمدة للتنفيذ';
export const UNPRICED_AR = 'غير مسعّر';
export const PRELIMINARY_AR = 'تصميم أولي يحتاج مراجعة مهندس مختص — ليس مخططًا تنفيذيًا معتمدًا';
export const BASIS_AR = 'عدّ العناصر التي أدخلها المصمم وأطوال المسارات المقترحة (خطوط مركزية)؛ لا تشمل الوصلات ولا الهدر ولا الضريبة ولا الاحتياط. المسارات المتعذرة لا تدخل الحصر وتُذكر أدناه بسببها.';
export const STATUS_AR = Object.freeze({
  NOT_CALCULATED: 'لم تُحسب الأنظمة الهندسية لهذا التصميم — لا توجد كميات أنظمة.',
  NOT_BOUND: 'تعذر ربط المخطط بالأنظمة — لا توجد كميات أنظمة.',
  STALE: 'قديمة — تغيّر المخطط المعماري أو مدخلات الأنظمة بعد آخر حساب؛ لا تُدرج كميات قديمة حتى يُعاد الحساب من صفحة الأنظمة.',
  CURRENT: 'محسوبة على المخطط ومدخلات الأنظمة الحالية.',
});
const UNIT_AR = { each: 'عدد', m: 'م' };
const BLOCK_AR = {
  ENDPOINT_OR_RISER_BLOCKED: 'طرف المسار أو الرايزر محجوب بعائق',
  NO_PATH_AT_CONFIGURED_GRID: 'لا يوجد مسار ضمن الحيز والعوائق ودقة الشبكة المعلنة',
  SLOPED_PIPE_HITS_OBSTACLE: 'الأنبوب المائل يصطدم بعائق',
  OUTFALL_INVERT_MISMATCH: 'منسوب قاع الصرف لا يصل إلى منسوب المنهل',
};
const r3 = v => Math.round(v * 1000) / 1000;
const fmtNum = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
const base = () => ({ schema: SECTION_SCHEMA, title: SECTION_TITLE_AR, classification: CLASSIFICATION_AR, reason: null, reasonAr: null, constructionApproved: false, codeCompliance: 'NOT_EVALUATED', binding: null, keptInputs: null, basisAr: BASIS_AR, disclaimerAr: PRELIMINARY_AR });

/** قسم بلا أرقام: الأنظمة غير محسوبة أو غير مربوطة أو قديمة. keptInputs: مدخلات المستخدم المحفوظة (عددها والأجهزة الخارجة عن المخطط الحالي). */
export function emptySection(status = 'NOT_CALCULATED', { reasonAr = null, reason = null, binding = null, keptInputs = null } = {}) {
  if (!STATUS_AR[status] || status === 'CURRENT') throw Error('SECTION_STATUS_INVALID');
  return { ...base(), status, statusAr: STATUS_AR[status], reason, reasonAr, binding, keptInputs, rows: [], priced: null, emptyDisciplines: [], notCalculated: [], blocked: [] };
}

/**
 * قسم نتيجة محسوبة ومطابقة (CURRENT). result: ناتج الحزمة المتحقق من حداثته قبل الاستدعاء.
 * labels: { discipline:{id:ar}, kind:{KIND:ar}, layer:{LAYER:ar} } من mep-binding. calcRows: دالة B.calcRows.
 */
export function currentSection(result, { labels, calcRows, binding }) {
  const order = Object.keys(labels.discipline);
  const rows = result.quantities.rows.map(q => {
    const baseKind = String(q.kind).replace(/ \(.*\)$/, '');
    const priced = typeof q.rate === 'number' && Number.isFinite(q.rate) && typeof q.amount === 'number';
    return { discipline: q.discipline, disciplineAr: labels.discipline[q.discipline] || q.discipline, kind: q.kind, kindAr: (labels.kind[baseKind] || baseKind) + (q.unit === 'm' ? ' — مسار مقترح (الطول)' : ''),
      layer: q.layer, layerAr: labels.layer[q.layer] || q.layer, unit: q.unit, unitAr: UNIT_AR[q.unit] || q.unit,
      quantity: q.unit === 'm' ? r3(q.quantity) : q.quantity, rate: priced ? q.rate : null, amount: priced ? q.amount : null, priceAr: priced ? fmtNum(q.rate) : UNPRICED_AR, amountAr: priced ? fmtNum(q.amount) : UNPRICED_AR };
  }).sort((a, b) => order.indexOf(a.discipline) - order.indexOf(b.discipline) || a.layer.localeCompare(b.layer) || a.kind.localeCompare(b.kind));
  const notCalculated = [], blocked = [];
  for (const d of result.disciplines) {
    for (const c of calcRows(result, d.id)) if (c.status === 'NOT_CALCULATED') notCalculated.push({ discipline: d.id, disciplineAr: labels.discipline[d.id] || d.id, id: c.id, method: c.method, reasonAr: c.reason || 'بيانات الحساب ناقصة' });
    for (const r of d.routes) if (r.status === 'BLOCKED') {
      const issue = d.issues.find(i => i.code === 'ROUTE_BLOCKED' && (i.details?.id === r.id || i.details?.id === r.systemId));
      blocked.push({ discipline: d.id, disciplineAr: labels.discipline[d.id] || d.id, id: r.id, kind: r.kind, levelId: (r.levelIds || [r.levelId]).join('→'), reason: r.reason || null,
        reasonAr: (BLOCK_AR[r.reason] || r.reason || 'متعذر') + (r.endInvertM !== undefined ? ` (القاع الفعلي ${fmtNum(r.endInvertM)} م)` : '') + (issue?.messageAr ? ' — ' + issue.messageAr : '') });
    }
  }
  const q = result.quantities, pricedCount = rows.filter(r => r.rate !== null).length, unpricedCount = rows.length - pricedCount;
  return { ...base(), status: 'CURRENT', statusAr: STATUS_AR.CURRENT, binding, rows, notCalculated, blocked,
    priced: { pricedCount, unpricedCount, subtotal: pricedCount ? q.pricedSubtotal : null, total: unpricedCount ? null : q.pricedSubtotal,
      totalAr: unpricedCount ? `لا إجمالي: ${unpricedCount} من ${rows.length} بندًا ${UNPRICED_AR}` : fmtNum(q.pricedSubtotal), subtotalAr: pricedCount ? fmtNum(q.pricedSubtotal) : UNPRICED_AR },
    emptyDisciplines: order.filter(id => !rows.some(r => r.discipline === id)), emptyDisciplinesAr: order.filter(id => !rows.some(r => r.discipline === id)).map(id => labels.discipline[id]), omittedDisciplines: result.omittedDisciplines || [],
    issues: { errors: result.issues.filter(i => i.severity === 'error').length, pending: result.issues.filter(i => i.severity === 'pending').length, warnings: result.issues.filter(i => i.severity === 'warning').length },
    resultStatus: result.status };
}

/** صفوف CSV (مصفوفات خلايا) تُلحق بجدول الكميات بعد سطر فارغ، بترويسة أعمدة خاصة بالقسم (سعر الوحدة والمبلغ صريحان). */
export function sectionCsvRows(s) {
  const out = [[''], [s.title], ['التصنيف', s.classification], ['الحالة', s.statusAr]];
  if (s.reasonAr) out.push(['السبب', s.reasonAr]);
  if (s.binding) out.push(['هوية البديل', s.binding.alternativeId ?? ''], ['بصمة المخطط', s.binding.sourceHash ?? ''], ['بصمة مدخل الأنظمة', s.binding.inputHash ?? ''], ['بصمة المعمارية', s.binding.architectureHash ?? ''], ['بصمة نتيجة الأنظمة', s.binding.resultHash ?? '']);
  if (s.keptInputs) out.push(['مدخلات محفوظة', `${s.keptInputs.devices} جهازًا/عنصرًا (تُراجع قبل إعادة الحساب)` + (s.keptInputs.orphans?.length ? ` — خارج المخطط الحالي: ${s.keptInputs.orphans.map(o => o.id).join(' ')}` : '')]);
  if (s.status === 'CURRENT') {
    out.push(['التخصص', 'البند', 'الطبقة', 'الكمية', 'الوحدة', 'سعر الوحدة', 'المبلغ', 'التصنيف']);
    for (const r of s.rows) out.push([r.disciplineAr, r.kindAr, r.layerAr, r.quantity, r.unitAr, r.priceAr, r.amountAr, CLASSIFICATION_AR]);
    if (!s.rows.length) out.push(['لا توجد عناصر أنظمة مُدخلة ولا مسارات مقترحة — لا كميات (وليست صفرًا محسوبًا)']);
    out.push(['إجمالي البنود المسعّرة', s.priced.subtotalAr], ['الإجمالي', s.priced.totalAr]);
    for (const n of s.notCalculated) out.push(['غير محسوب', n.disciplineAr, n.id, n.reasonAr]);
    for (const b of s.blocked) out.push(['مسار متعذر', b.disciplineAr, b.id, b.reasonAr]);
    if (s.emptyDisciplines.length) out.push(['تخصصات بلا عناصر في الحصر', (s.emptyDisciplinesAr || s.emptyDisciplines).join('، ')]);
  }
  out.push(['أساس الحصر', s.basisAr], ['تنبيه', s.disclaimerAr]);
  return out;
}

/** نسخة JSON للقسم لبيان التصدير (manifest.json). */
export const sectionJson = s => JSON.parse(JSON.stringify(s));

const ESC = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** HTML لجسم القسم (بلا عنوان h2). */
export function sectionBodyHtml(s, esc = ESC) {
  const table = (head, rows) => `<div class="tw" style="overflow-x:auto"><table class="pb-table" data-mep-table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const p = [`<p data-mep-class><b>${esc(s.classification)}</b></p>`, `<p data-mep-status="${esc(s.status)}">${esc(s.statusAr)}${s.reasonAr ? ' ' + esc(s.reasonAr) : ''}</p>`];
  if (s.keptInputs) p.push(`<p class="muted">مدخلات الأنظمة المحفوظة: ${esc(s.keptInputs.devices)} جهازًا/عنصرًا${s.keptInputs.orphans?.length ? ` · خارج المخطط الحالي: ${esc(s.keptInputs.orphans.map(o => o.id).join('، '))}` : ''} — راجعها ثم أعد الحساب.</p>`);
  if (s.status === 'CURRENT') {
    p.push(s.rows.length ? table(['التخصص', 'البند', 'الطبقة', 'الكمية', 'الوحدة', 'سعر الوحدة', 'المبلغ'], s.rows.map(r => [r.disciplineAr, r.kindAr, r.layerAr, r.quantity, r.unitAr, r.priceAr, r.amountAr]))
      : '<p>لا توجد عناصر أنظمة مُدخلة ولا مسارات مقترحة؛ لا كميات (وليست صفرًا محسوبًا).</p>');
    p.push(`<p>إجمالي البنود المسعّرة: <b>${esc(s.priced.subtotalAr)}</b> · الإجمالي: <b>${esc(s.priced.totalAr)}</b></p>`);
    if (s.notCalculated.length) p.push('<h3>بنود غير محسوبة (NOT_CALCULATED)</h3>' + table(['التخصص', 'المعرف', 'السبب'], s.notCalculated.map(n => [n.disciplineAr, n.id, n.reasonAr])));
    if (s.blocked.length) p.push('<h3>مسارات متعذرة (BLOCKED)</h3>' + table(['التخصص', 'المعرف', 'السبب'], s.blocked.map(b => [b.disciplineAr, b.id, b.reasonAr])));
    if (s.emptyDisciplines.length) p.push(`<p class="muted">تخصصات بلا عناصر في الحصر: ${esc((s.emptyDisciplinesAr || s.emptyDisciplines).join('، '))}</p>`);
    if (s.binding) p.push(`<p class="muted">بصمة المخطط <code>${esc(String(s.binding.sourceHash).slice(0, 16))}</code> · بصمة المدخل <code>${esc(String(s.binding.inputHash).slice(0, 16))}</code> · بصمة النتيجة <code>${esc(String(s.binding.resultHash).slice(0, 16))}</code></p>`);
  }
  p.push(`<p class="muted">${esc(s.basisAr)} ${esc(s.disclaimerAr)}</p>`);
  return p.join('');
}

/**
 * يحلّ قسم الأنظمة لمستند المرسم من التخزين (نفس كيان صفحة الأنظمة): يربط ويتحقق من الحداثة، ولا يعيد أرقامًا إلا لنتيجة مطابقة تمامًا.
 * { doc: مستند مُحلَّل، session، studioRaw (نص مستند المرسم المحفوظ)، store: واجهة getItem/setItem، sourceId?: لتحديد المصدر صراحة }
 */
export async function resolveSystemsSection({ doc, session = null, studioRaw = null, store, sourceId = null } = {}) {
  let B;
  try { B = await import('./mep-binding.mjs'); } catch (e) { return emptySection('NOT_BOUND', { reasonAr: 'تعذر تحميل حزمة الأنظمة: ' + String(e.message).slice(0, 100) }); }
  try {
    const sources = B.listSources({ session, studioRaw: studioRaw ?? '{}' });
    const src = sourceId ? sources.find(s => s.id === sourceId) : sources.find(s => s.kind === 'studio');
    if (!src) return emptySection('NOT_CALCULATED', { reasonAr: 'لا مصدر معماري مربوط بالأنظمة.' });
    const data = B.loadStore(store);
    let entity = B.entityFor(data, src.id, { sessionKey: src.sessionKey, kind: src.kind });
    const sourceHash = await B.hash(doc);
    // مرجع احتياطي لمصدر المرسم: كيان تصميم الجلسة الذي اعتُمد منه المرسم. إن طابقت بصمته المخطط الحالي تماميًا فهو حديث (لم يُعدَّل المرسم)،
    // وإن لم تطابق فالحساب موجود لكنه قديم (عُدّل المرسم بعد الحساب) فيُعلَن «قديمة» لا «لم تُحسب».
    if (!entity.result && src.kind === 'studio' && src.id.startsWith('STUDIO-') && src.id !== 'STUDIO-unlinked') {
      const parent = sources.find(s => s.id === src.id.slice(7));
      const cand = parent ? B.entityFor(data, parent.id, { sessionKey: parent.sessionKey, kind: parent.kind }) : null;
      if (cand?.result) entity = { ...cand, adoptedFrom: cand.alternativeId };
    }
    const devices = B.deviceRefs(entity.inputs);
    if (!entity.result) return devices.length
      ? emptySection('NOT_CALCULATED', { reasonAr: 'أُدخلت أجهزة أنظمة لكن لم يُحسب شيء بعد؛ افتح صفحة الأنظمة وأعد الحساب.', keptInputs: { devices: devices.length, orphans: [] } })
      : emptySection('NOT_CALCULATED');
    const altId = entity.alternativeId || src.id, archChanged = entity.result.source?.sha256 !== sourceHash;
    const b = await B.bindArchitecture(doc, { alternativeId: altId, revision: entity.adoptedFrom ? (sources.find(s => s.id === entity.adoptedFrom)?.revision ?? src.revision) : src.revision, inputs: entity.inputs });
    const binding = { alternativeId: altId, sourceHash: archChanged ? (entity.result.source?.sha256 ?? entity.sourceHash ?? null) : sourceHash, inputHash: entity.result.inputHash, architectureHash: entity.result.architectureHash, resultHash: entity.result.resultHash };
    if (!b.ok && !archChanged) return emptySection('NOT_BOUND', { reasonAr: b.error?.messageAr || null, reason: b.error?.code || null, keptInputs: { devices: devices.length, orphans: [] } });
    // تغيّرت العمارة: نتيجة قديمة بالضرورة حتى لو تعذر ربط المدخلات القديمة بالمخطط الجديد (جهاز في غرفة محذوفة مثلًا)
    if (!b.ok) return emptySection('STALE', { reason: 'ARCHITECTURE_CHANGED', reasonAr: 'تغيّر المخطط المعماري بعد الحساب، وتعذر ربط مدخلات الأنظمة المحفوظة به: ' + (b.error?.messageAr || ''), binding, keptInputs: { devices: devices.length, orphans: B.deviceRefs(entity.inputs) } });
    const a = await B.assessEntity(entity, { project: b.project, sourceHash });
    if (a.state !== 'CURRENT') return emptySection('STALE', { reason: a.reason, reasonAr: a.messageAr, binding, keptInputs: { devices: devices.length, orphans: a.orphans } });
    const labels = { discipline: Object.fromEntries(B.DISCIPLINES.map(id => [id, B.DISCIPLINE_INFO[id].short])), kind: Object.fromEntries(Object.values(B.DEVICE_GROUPS).flat().flatMap(g => g.kinds)), layer: B.LAYER_AR };
    return currentSection(entity.result, { labels, calcRows: B.calcRows, binding });
  } catch (e) { return emptySection('NOT_BOUND', { reasonAr: 'تعذر تحليل حالة الأنظمة: ' + String(e?.message || e).slice(0, 120) }); }
}
export default { SECTION_SCHEMA, SECTION_TITLE_AR, CLASSIFICATION_AR, emptySection, currentSection, sectionCsvRows, sectionJson, sectionBodyHtml, resolveSystemsSection };
