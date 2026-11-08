// مجموعة اللوحات المعمارية الإضافية من مستند واحد: الموقع العام، الواجهات الأربع (لوحتان)، القطاع، وجدول الأبواب
// والنوافذ (لوحة + جداول بيانات + HTML). كل لوحة تُبنى مستقلة: إن تعذّرت واحدة أُعلن سببها ولم تُسقط الباقي.
// نقي: لا DOM. تُستدعى من صفحة المخرجات (buildFinalData) أو مباشرة للتصدير بصيغة SVG.
import { buildingModel } from './building-model.mjs';
import { elevationSheets } from './elevation-sheet.mjs';
import { sectionSheet } from './section-sheet.mjs';
import { scheduleSheet, scheduleTables, scheduleHtml } from './schedules.mjs';
import { siteSheet } from './site-sheet.mjs';

const safe = fn => { try { return fn(); } catch (e) { return { error: e?.message || String(e) }; } };

/**
 * @param {object} doc مستند المرسم
 * @param {{ sheet?, date?, fingerprint?, owner?, office? }} [opts]
 * @returns {{ site, elevations: object[]|{error}, section, schedule, sheets: {id, no, title, svg}[], errors: string[] }}
 */
export function buildDrawingSet(doc, opts = {}) {
  const base = { sheet: opts.sheet, date: opts.date, fingerprint: opts.fingerprint, owner: opts.owner, office: opts.office };
  const model = safe(() => buildingModel(doc));
  if (model.error) return { site: model, elevations: model, section: model, schedule: model, sheets: [], errors: [model.error] };
  const site = safe(() => siteSheet(doc, { ...base, model, sheetNo: 'A-00' }));
  const elevations = safe(() => elevationSheets(doc, { ...base, model }));
  const section = safe(() => sectionSheet(doc, { ...base, model, sheetNo: 'A-S1' }));
  const schedule = safe(() => { const s = scheduleSheet(doc, { ...base, sheetNo: 'A-D1' }); return { ...s, tables: scheduleTables(s.schedule), html: scheduleHtml(s.schedule) }; });
  const sheets = [];
  if (!site.error) sheets.push({ id: 'site', no: 'A-00', title: 'مخطط الموقع العام', svg: site.svg });
  if (Array.isArray(elevations)) elevations.forEach((e, i) => sheets.push({ id: 'elevations-' + (i + 1), no: 'A-E' + (i + 1), title: i ? 'الواجهتان اليمنى واليسرى' : 'الواجهتان الأمامية والخلفية', svg: e.svg }));
  if (!section.error) sheets.push({ id: 'section', no: 'A-S1', title: 'القطاع أ-أ', svg: section.svg });
  if (!schedule.error) sheets.push({ id: 'schedule', no: 'A-D1', title: 'جدول الأبواب والنوافذ', svg: schedule.svg });
  const errors = [site, elevations, section, schedule].filter(x => x && x.error).map(x => x.error);
  return { site, elevations, section, schedule, sheets, errors };
}

/** ملفات SVG للتنزيل: اسم ملف لاتيني ثابت + المحتوى. */
export function drawingSetFiles(set, prefix = 'mizan') {
  return set.sheets.map(s => ({ name: `${prefix}-${s.no}-${s.id}.svg`, mime: 'image/svg+xml', title: s.title, content: s.svg }));
}

export default { buildDrawingSet, drawingSetFiles };
