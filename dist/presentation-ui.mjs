// زر «لوحة العرض»: يفتح لوحة الصفحة الواحدة للعميل من النموذج الحالي، مع تنزيل SVG/PNG وطباعة PDF.
import { buildPresentationBoard } from './presentation-board.mjs';
import { downloadManifest } from './export-manifest.mjs';

const $ = id => document.getElementById(id);
const stamp = () => new Date().toLocaleDateString('en-CA');
let dialog;
// EX-01: بيان مرافق للتصدير (SVG/PNG)؛ الطباعة/PDF لا تحمل بيانًا (قيد متصفح مسجّل).
function saveWithManifest(blob, name, kind) { saveBlob(blob, name); void downloadManifest({ kind, fileName: name, mime: blob.type || null, payload: blob, model: window.mizanPresentation?.currentModel() }, saveBlob); }

function toast(text) {
  const t = $('toast'); if (!t) return;
  t.textContent = text; t.hidden = false; clearTimeout(toast.id); toast.id = setTimeout(() => { t.hidden = true; }, 4200);
}
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog'); dialog.id = 'mizanBoardDialog'; dialog.className = 'board-dialog';
  dialog.innerHTML = `<form method="dialog" class="board-bar"><label class="board-title-field">اسم المشروع على اللوحة<input id="boardTitle" maxlength="48" value="مشروع سكني" autocomplete="off"></label>
    <div class="board-actions"><button type="button" id="boardPrint" class="studio-primary">طباعة / حفظ PDF</button><button type="button" id="boardSvg" class="studio-secondary">تنزيل SVG</button><button type="button" id="boardPng" class="studio-secondary">تنزيل صورة PNG</button><button value="close" class="studio-secondary">إغلاق</button></div></form>
    <div class="board-stage" id="boardStage" role="img" aria-label="لوحة عرض المشروع"></div>
    <p class="board-note">اللوحة مبنية من المخطط الحالي فقط. الصورة PNG تستخدم خطوط الجهاز؛ للحصول على أفضل خط اختر الطباعة / PDF.</p>`;
  document.body.append(dialog);
  const render = () => {
    const model = window.mizanPresentation?.currentModel();
    if (!model) { toast('حدّث المخطط أولًا؛ اللوحة تُبنى من مخطط مطابق للمدخلات.'); return false; }
    $('boardStage').innerHTML = buildPresentationBoard(model, { title: $('boardTitle').value.trim() || 'مشروع سكني', date: stamp() });
    return true;
  };
  dialog.render = render;
  $('boardTitle').addEventListener('input', render);
  $('boardPrint').addEventListener('click', () => { document.body.classList.add('printing-board'); window.print(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-board'));
  $('boardSvg').addEventListener('click', () => {
    const svg = $('boardStage').querySelector('svg'); if (!svg) return;
    saveWithManifest(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }), `mizan-board-${stamp()}.svg`, 'board-svg');
  });
  $('boardPng').addEventListener('click', () => {
    const svg = $('boardStage').querySelector('svg'); if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg), img = new Image(), w = svg.viewBox.baseVal.width, h = svg.viewBox.baseVal.height;
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
      const g = c.getContext('2d'); g.scale(2, 2); g.drawImage(img, 0, 0, w, h);
      c.toBlob(b => b ? saveWithManifest(b, `mizan-board-${stamp()}.png`, 'board-png') : toast('تعذر إنشاء الصورة؛ استخدم PDF.'), 'image/png');
    };
    img.onerror = () => toast('تعذر إنشاء الصورة؛ استخدم PDF.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  });
  return dialog;
}
function open() {
  const d = ensureDialog();
  if (!d.render()) return;
  if (!d.open) d.showModal();
}
function mount() {
  const host = document.querySelector('#out .studio-actions, .studio-actions');
  if (!host || host.querySelector('[data-board-open]')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'small-button board-open'; b.dataset.boardOpen = 'true'; b.textContent = 'لوحة العرض';
  b.addEventListener('click', open); host.append(b);
}
window.addEventListener('mizan:studio-state', mount);
document.addEventListener('DOMContentLoaded', mount); mount();
