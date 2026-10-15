// لوحة «استوديو التصدير» (واجهة صغيرة): تعرض محتويات الحزمة والبصمة قبل التنزيل، ثم تنزّلها ZIP أو ملفات منفصلة.
import { buildExportBundle, bundleZip } from './export-studio.mjs';
import { loadAppVersion } from '../export-manifest.mjs';

const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); return n; };
const kb = n => (n < 1024 ? n + ' بايت' : (n / 1024).toFixed(1) + ' ك.ب');

export async function openExportStudio({ doc, download }) {
  const dlg = el('dialog', { class: 'export-studio', 'aria-label': 'استوديو التصدير' });
  const body = el('div', {}, el('p', {}, 'جارٍ تجهيز الحزمة…'));
  dlg.append(el('b', {}, 'استوديو التصدير'), body); document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
  try {
    const bundle = await buildExportBundle(doc, { app: await loadAppVersion() });
    const stem = (doc.title || 'mizan').replace(/[\\/:*?"<>|]/g, '_');
    const t = el('table', { class: 'dna-table' }, el('tr', {}, ...['الملف', 'الحجم', 'SHA-256'].map(x => el('th', {}, x))));
    for (const f of bundle.files) t.append(el('tr', {}, el('td', {}, f.name), el('td', {}, kb(f.size)), el('td', {}, el('code', {}, f.sha256 ? f.sha256.slice(0, 16) + '…' : '— (يحوي البصمات)'))));
    const zipBtn = el('button', { class: 'btn primary', type: 'button', onclick: () => { download(stem + '-export.zip', new Blob([bundleZip(bundle)], { type: 'application/zip' })); } }, 'تنزيل ZIP');
    const sepBtn = el('button', { class: 'btn', type: 'button', onclick: () => { for (const f of bundle.files) download(f.name, new Blob([f.bytes], { type: f.mime })); } }, 'تنزيل ملفات منفصلة');
    const close = el('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'إغلاق');
    body.replaceChildren(el('div', { class: 'fp' }, el('span', { class: 'muted' }, 'بصمة الهندسة'), el('code', {}, bundle.manifest.geometryFingerprint)), t,
      el('p', { class: 'muted' }, 'الملف manifest.json يسجّل البصمة وSHA-256 لكل ملف ووقت التوليد. الكميات غير القابلة للحساب تبقى في الجدول بدرجتها.'),
      el('div', { class: 'row' }, zipBtn, sepBtn, close));
  } catch (e) { body.replaceChildren(el('p', { class: 'fpwarn' }, 'تعذّر تجهيز الحزمة: ' + e.message), el('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'إغلاق')); }
}
