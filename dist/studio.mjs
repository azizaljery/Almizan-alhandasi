// مرسم الميزان: واجهة الاستوديو (أدوات، خصائص، أدوار، عرض ثلاثي الأبعاد حيّ، مراجعة، مساعد).
import { createDoc, parseDoc, serialize, getById, SCHEMA } from './draw/doc.mjs';
import { ROOM_TYPES, OPENING_KINDS, FIXTURES, STAIR_KINDS, WALL_KINDS, PLOT_ENTRIES, roomTypeName } from './draw/catalog.mjs';
import { sampleVilla } from './draw/samples.mjs';
import { consumeHandoff, loadSavedDNA, STUDIO_KEY } from './draw/handoff.mjs';
import { geometryFingerprint } from './design-dna.mjs';
import { computeDocQuantities, GRADES } from './draw/quantities-doc.mjs';
import { Editor } from './draw/editor/editor.mjs';
import { docBounds } from './draw/editor/render2d.mjs';
import { reviewDoc } from './draw/review.mjs';
import { digestDoc, describeDigestAr } from './draw/digest.mjs';
import { askDrawingAssistant } from './draw/assistant-client.mjs';
import { wallRect, fixtureRect } from './draw/review.mjs';
import { downloadManifest } from './export-manifest.mjs';
import { toDxf } from './draw/dxf.mjs';
import { openExportStudio } from './draw/export-studio-ui.mjs';

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); return n; };
const KEY = 'mizan.studio.doc.v1';
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }, sget(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, sset(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } } };

// ------------------------------------------------------------------------------------------------ start
let initial = null, homeHandoff = null;
// تسليم من الصفحة الرئيسية: يُستهلك مرة واحدة، والمشروع المحفوظ سابقًا يُنسخ احتياطيًا ولا يضيع.
try { homeHandoff = consumeHandoff(sessionStorage, localStorage); if (homeHandoff) initial = homeHandoff.doc; } catch { homeHandoff = null; }
try { if (!initial) { const saved = store.get(KEY); if (saved) initial = parseDoc(saved); } } catch { initial = null; }
const startedEmpty = !initial;
const editor = new Editor($('planCanvas'), { doc: initial || createDoc({ title: 'مشروع جديد' }), onEvent: onEditorEvent });
globalThis.__mizanStudio = editor; // للاختبارات الحية
$('docTitle').value = editor.doc.title;

// ------------------------------------------------------------------------------------------------ helpers
let toastTimer = 0;
function toast(msg, err = false) { const t = $('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 4200 : 2400); }
function download(name, blob) { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
// EX-01: كل تصدير (غير ملف المشروع نفسه) يرافقه بيان .manifest.json يربط البايتات بالمستند وبناء التطبيق؛ لا يمسّ محتوى التصدير.
function exportWithManifest(name, blob, kind) { download(name, blob); void downloadManifest({ kind, fileName: name, mime: blob.type || null, payload: blob, studioDocument: serialize(editor.doc) }, (b, n) => download(n, b)); }
const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const num = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString();
function ask(title, fields) { // small modal: fields [{key,label,type,value,options}]
  return new Promise(resolve => {
    const dlg = el('dialog'); const form = el('form', { method: 'dialog' }, el('b', {}, title));
    const inputs = {};
    for (const f of fields) {
      const input = f.type === 'select' ? el('select', {}, ...f.options.map(([v, l]) => el('option', { value: v, selected: v === f.value }, l))) : el('input', { type: f.type || 'text', value: f.value ?? '', maxlength: 80 });
      inputs[f.key] = input; form.append(el('label', {}, f.label, input));
    }
    const ok = el('button', { class: 'btn primary', value: 'ok' }, 'تأكيد'), cancel = el('button', { class: 'btn', value: 'cancel', type: 'button', onclick: () => dlg.close() }, 'إلغاء');
    form.append(el('div', { class: 'row' }, ok, cancel)); dlg.append(form); document.body.append(dlg);
    dlg.addEventListener('close', () => { const out = dlg.returnValue === 'ok' ? Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])) : null; dlg.remove(); resolve(out); });
    dlg.showModal(); (Object.values(inputs)[0])?.focus();
  });
}

// ------------------------------------------------------------------------------------------------ editor events
function onEditorEvent(ev) {
  switch (ev.type) {
    case 'error': toast(ev.message, true); break;
    case 'hint': toast(ev.message); break;
    case 'doc': onDocChanged(); break;
    case 'selection': renderProps(); updateOptbarActions(); break;
    case 'tool': syncTool(); break;
    case 'level': renderLevels(); renderRooms(); renderProps(); sync3DLevel(); scheduleReview(); updateStats(); break;
    case 'cursor': $('stCoord').textContent = `x ${ev.p.x.toFixed(2)}  y ${ev.p.y.toFixed(2)}`; $('stSnap').textContent = { node: 'نقطة', inter: 'تقاطع', mid: 'منتصف', edge: 'على الجدار', align: 'محاذاة', ortho: 'زاوية', grid: 'شبكة', free: '' }[editor.snap?.kind] || ''; break;
    case 'typed': $('stHint').textContent = ev.text ? `الطول المكتوب: ${ev.text} م — اضغط Enter للتثبيت` : HINTS.wall; break;
    case 'moving': $('stHint').textContent = `إزاحة ${ev.dx.toFixed(2)} ، ${ev.dy.toFixed(2)} م`; break;
    case 'rename': { const l = editor.doc.labels.find(x => x.id === ev.id); if (l) roomDialog(l); break; }
    case 'rename-room': roomDialog(null, ev.room); break;
    case 'inspect': setTab('props'); break;
    case 'ask-text': ask('نص على المخطط', [{ key: 'text', label: 'النص', value: '' }]).then(r => { if (r?.text?.trim()) editor.exec({ type: 'add-text', level: editor.levelId, at: ev.at, text: r.text.trim() }, 'نص'); }); break;
    case 'draft': break;
    case 'view': break;
  }
}
async function roomDialog(label, room = null) {
  const cur = label || room?.label;
  const r = await ask('اسم الغرفة ونوعها', [{ key: 'name', label: 'الاسم', value: cur?.name || '' }, { key: 'type', label: 'النوع', type: 'select', value: cur?.type || room?.type || 'other', options: Object.entries(ROOM_TYPES).map(([k, v]) => [k, v.ar]) }]);
  if (!r) return;
  const name = r.name.trim() || roomTypeName(r.type);
  if (cur) editor.exec({ type: 'update', id: cur.id, patch: { name, type: r.type } }, 'اسم الغرفة');
  else if (room) editor.exec({ type: 'add-label', level: editor.levelId, name, roomType: r.type, seed: { x: Math.round((room.space.inside?.x ?? room.centroid.x) * 1000) / 1000, y: Math.round((room.space.inside?.y ?? room.centroid.y) * 1000) / 1000 } }, 'اسم الغرفة');
}
function onDocChanged() {
  $('undo').disabled = !editor.history.canUndo; $('redo').disabled = !editor.history.canRedo;
  if (document.activeElement !== $('docTitle')) $('docTitle').value = editor.doc.title;
  renderLevels(); renderRooms(); if ($('tab-finish').classList.contains('on') && !($('tab-finish').contains(document.activeElement) && /INPUT/.test(document.activeElement.tagName))) renderFinish(); updateStats(); autosave(); schedule3D(); scheduleReview(); updateWelcome(); if ($('tab-dna').classList.contains('on')) renderDna(); if ($('tab-qty').classList.contains('on')) scheduleQty();
  if (!(document.activeElement && $('side').contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) renderProps();
}
const autosave = debounce(() => store.set(KEY, serialize(editor.doc)), 500);
function updateWelcome() { const empty = !editor.doc.walls.length && !editor.doc.fixtures.length; $('welcome').hidden = !(empty && !editor.draft && editor.tool !== 'wall' && editor.tool !== 'rect'); }
function updateStats() {
  const s = editor.stats();
  $('stStats').textContent = s.walls ? `${s.rooms} غرفة · المساحة الصافية ${num(s.area, 1)} م²${s.unlabelled ? ` · ${s.unlabelled} بلا اسم` : ''}` : '';
  const gap = $('fixGaps'); gap.hidden = !s.gaps; gap.textContent = s.gaps ? `إغلاق ${s.gaps} فجوة` : '';
}
$('fixGaps').addEventListener('click', () => { const n = editor.closeGaps(); toast(n ? `أُغلقت ${n} فجوة` : 'تعذّر إغلاق الفجوات تلقائيًا'); });

// ------------------------------------------------------------------------------------------------ toolbar + option bar
const HINTS = {
  select: 'انقر لتحديد · اسحب لتحديد منطقة (من اليمين لليسار = لمس) · اسحب أي عنصر لنقله · اسحب طرف جدار محدد لتحريكه · Delete للحذف',
  pan: 'اسحب لتحريك الشاشة · العجلة للتقريب والتبعيد',
  wall: 'انقر لبدء الجدار ثم انقر عند كل ركن · اكتب الطول ثم Enter · انقر نقطة البداية أو انقر مرتين للإنهاء · Shift = 45° · Alt = بلا التقاط · Esc إلغاء',
  rect: 'انقر الزاوية الأولى ثم المقابلة (أو اسحب) — تُنشأ أربعة جدران مغلقة',
  opening: 'مرّر على جدار ثم انقر لوضع الفتحة · جهة المؤشر تحدد جهة فتح الباب · العرض من الشريط أعلاه',
  room: 'انقر داخل غرفة مغلقة لتسميتها بالنوع المختار',
  fixture: 'مرّر قرب جدار فيلتصق الأثاث ويدور تلقائيًا · انقر للوضع · R للتدوير',
  stair: 'انقر لوضع بداية السلم · R للتدوير',
  column: 'انقر لوضع عمود', dimension: 'انقر نقطتين ثم حرّك المؤشر لجهة القياس', measure: 'انقر نقطتين لقياس المسافة (لا يُحفظ)', text: 'انقر لوضع نص', erase: 'انقر على أي عنصر لحذفه',
};
function syncTool() {
  document.querySelectorAll('#rail [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === editor.tool));
  $('stHint').textContent = HINTS[editor.tool] || ''; renderOptbar(); updateWelcome();
}
document.querySelectorAll('#rail [data-tool]').forEach(b => b.addEventListener('click', () => editor.setTool(b.dataset.tool)));
function renderOptbar() {
  const bar = $('optbar'), t = editor.tool, o = editor.opts; bar.replaceChildren();
  const chip = (label, on, fn, title = '') => el('button', { class: 'chip' + (on ? ' on' : ''), title, onclick: fn }, label);
  if (t === 'wall' || t === 'rect') {
    bar.append(el('label', {}, 'السماكة'), ...[.1, .12, .15, .2, .25, .3].map(v => chip(Math.round(v * 100) + ' سم', Math.abs(o.thickness - v) < 1e-6, () => { editor.setOpts({ thickness: v }); renderOptbar(); })));
    if (t === 'wall') bar.append(el('label', {}, 'النوع', el('select', { onchange: e => editor.setOpts({ wallKind: e.target.value }) }, ...Object.entries(WALL_KINDS).map(([k, v]) => el('option', { value: k, selected: k === o.wallKind }, v)))));
    bar.append(el('span', { class: 'sp' }), el('span', { class: 'hint' }, 'الخارجي عادةً 25 سم والقاطع 12 سم'));
  } else if (t === 'opening') {
    bar.append(...Object.entries(OPENING_KINDS).map(([k, v]) => chip(v.ar, o.openingKind === k, () => { editor.setOpts({ openingKind: k, openingW: null }); renderOptbar(); })));
    bar.append(el('label', {}, 'العرض م', el('input', { type: 'number', step: '.05', min: '.4', max: '8', placeholder: String(OPENING_KINDS[o.openingKind].w), value: o.openingW || '', onchange: e => editor.setOpts({ openingW: parseFloat(e.target.value) || null }) })));
  } else if (t === 'room') {
    bar.append(el('label', {}, 'نوع الغرفة', el('select', { onchange: e => editor.setOpts({ roomType: e.target.value }) }, ...Object.entries(ROOM_TYPES).map(([k, v]) => el('option', { value: k, selected: k === o.roomType }, v.ar)))), el('span', { class: 'hint' }, 'انقر داخل الغرفة؛ انقر مرتين على اسمها لتغييره'));
  } else if (t === 'fixture') {
    const pal = el('div', { class: 'palette' }, ...Object.entries(FIXTURES).map(([k, v]) => chip(v.ar, o.fixtureKind === k, () => { editor.setOpts({ fixtureKind: k, fixtureRot: 0, autoRot: true }); renderOptbar(); }, `${v.w}×${v.d} م`)));
    bar.append(pal, el('label', {}, el('input', { type: 'checkbox', checked: o.autoRot !== false, onchange: e => editor.setOpts({ autoRot: e.target.checked }) }), 'التصاق بالجدار'));
  } else if (t === 'stair') {
    bar.append(...Object.entries(STAIR_KINDS).map(([k, v]) => chip(v, o.stairKind === k, () => { editor.setOpts({ stairKind: k }); renderOptbar(); })), el('span', { class: 'hint' }, 'اتجاه الصعود حسب السهم · R للتدوير'));
  } else if (t === 'select') {
    bar.append(el('span', { class: 'hint', id: 'selHint' }, 'حدّد عنصرًا لتظهر أدواته هنا'), el('span', { class: 'sp' }), ...selectActions());
  } else bar.append(el('span', { class: 'hint' }, HINTS[t] || ''));
}
function selectActions() {
  const acts = [];
  if (editor.selection.size) acts.push(el('button', { class: 'chip', onclick: () => editor.duplicateSelection() }, 'تكرار'), el('button', { class: 'chip', onclick: () => editor.rotateSelection(Math.PI / 2) }, 'تدوير 90°'), el('button', { class: 'chip', onclick: () => editor.deleteSelection(), style: 'color:#c0392b' }, 'حذف'));
  return acts;
}
function updateOptbarActions() { if (editor.tool === 'select') renderOptbar(); }
$('tgSnap').addEventListener('click', e => { editor.setOpts({ snap: !editor.opts.snap }); e.currentTarget.classList.toggle('on', editor.opts.snap); });
$('tgGrid').addEventListener('click', e => { editor.setOpts({ grid: !editor.opts.grid }); e.currentTarget.classList.toggle('on', editor.opts.grid); });
$('tgDims').addEventListener('click', e => { editor.setOpts({ dims: !editor.opts.dims }); e.currentTarget.classList.toggle('on', editor.opts.dims); });
$('zoomIn').addEventListener('click', () => editor.zoomAt(1.3, editor.W / 2, editor.H / 2));
$('zoomOut').addEventListener('click', () => editor.zoomAt(.77, editor.W / 2, editor.H / 2));
$('zoomFit').addEventListener('click', () => editor.fit());
$('undo').addEventListener('click', () => editor.undo()); $('redo').addEventListener('click', () => editor.redo());
document.addEventListener('keydown', e => { if (e.target === document.body && (e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) { e.preventDefault(); /^z$/i.test(e.key) && !e.shiftKey ? editor.undo() : editor.redo(); } });
$('docTitle').addEventListener('change', e => editor.exec({ type: 'set-meta', title: e.target.value.trim() || 'مشروع بلا اسم' }, 'اسم المشروع'));
document.querySelectorAll('#welcome [data-start]').forEach(b => b.addEventListener('click', () => { const s = b.dataset.start; if (s === 'example') loadExample(); else if (s === 'import') $('fileInput').click(); else editor.setTool(s); }));

// ------------------------------------------------------------------------------------------------ levels
function renderLevels() {
  const box = $('levels'); box.replaceChildren();
  for (const l of editor.doc.levels) box.append(el('button', { class: l.id === editor.levelId ? 'on' : '', role: 'tab', onclick: () => editor.setLevel(l.id), ondblclick: async () => { const r = await ask('اسم الدور', [{ key: 'name', label: 'الاسم', value: l.name }]); if (r?.name.trim()) editor.exec({ type: 'update', id: l.id, patch: { name: r.name.trim() } }, 'اسم الدور'); } }, l.name));
  box.append(el('button', { class: 'add', title: 'دور جديد', onclick: addLevel }, '＋'));
}
async function addLevel() {
  const hasWalls = editor.doc.walls.some(w => w.level === editor.levelId);
  const r = await ask('دور جديد', [{ key: 'name', label: 'الاسم', value: editor.doc.levels.length === 1 ? 'الدور الأول' : 'الدور ' + (editor.doc.levels.length + 1) }, ...(hasWalls ? [{ key: 'copy', label: 'البداية', type: 'select', value: 'copy', options: [['copy', 'نسخة من الدور الحالي (الجدران والفتحات)'], ['blank', 'دور فارغ']] }] : [])]);
  if (!r) return;
  const res = editor.exec({ type: 'add-level', name: r.name.trim() || undefined, ...(r.copy === 'copy' ? { copyFrom: editor.levelId } : {}) }, 'دور جديد');
  if (res?.ids?.[0]) editor.setLevel(res.ids[0]);
}

// ------------------------------------------------------------------------------------------------ properties
function field(label, type, value, onChange, { step = '.01', min, max, unit = '', options = [], width } = {}) {
  let input;
  if (type === 'select') input = el('select', { onchange: e => onChange(e.target.value) }, ...options.map(([v, l]) => el('option', { value: v, selected: v === value }, l)));
  else if (type === 'check') input = el('input', { type: 'checkbox', checked: !!value, onchange: e => onChange(e.target.checked) });
  else input = el('input', { type, value: value ?? '', step: type === 'number' ? step : null, min, max, onchange: e => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value) });
  return el('label', { class: 'f' }, el('span', {}, label), el('span', {}, input, unit ? el('span', { class: 'unit' }, unit) : null));
}
const upd = (id, patch, label = 'تعديل') => editor.exec({ type: 'update', id, patch }, label, { key: 'p:' + id + Object.keys(patch).join() });
const deg = r => Math.round(((r || 0) * 180 / Math.PI % 360 + 360) % 360 * 10) / 10;
function renderProps() {
  const box = $('tab-props'); box.replaceChildren();
  const items = editor.selectedItems();
  const doc = editor.doc;
  if (!items.length) {
    const lvl = editor.level();
    box.append(el('div', { class: 'sec' }, el('h4', {}, 'الدور'), field('الاسم', 'text', lvl.name, v => upd(lvl.id, { name: v })), field('ارتفاع الدور', 'number', lvl.height, v => upd(lvl.id, { height: v }), { step: '.05', unit: 'م', min: 2, max: 8 })));
    const b = docBounds(doc, editor.levelId), s = editor.stats();
    box.append(el('div', { class: 'sec' }, el('h4', {}, 'ملخص الدور'), el('div', { class: 'kv' }, 'الجدران', el('b', {}, s.walls), 'الغرف المغلقة', el('b', {}, s.rooms), 'المساحة الصافية', el('b', {}, num(s.area, 1) + ' م²'), 'أبعاد البناء', el('b', {}, s.walls ? `${num(b.x1 - b.x0, 2)} × ${num(b.y1 - b.y0, 2)} م` : '—'))));
    const plot = doc.plot?.polygon, pb = plot ? { w: Math.max(...plot.map(p => p.x)) - Math.min(...plot.map(p => p.x)), l: Math.max(...plot.map(p => p.y)) - Math.min(...plot.map(p => p.y)) } : { w: 20, l: 25 };
    let pw = pb.w, pl = pb.l;
    box.append(el('div', { class: 'sec' }, el('h4', {}, 'الأرض والاتجاه'),
      field('عرض الأرض', 'number', pw, v => { pw = v; }, { step: '.5', unit: 'م', min: 4 }), field('طول الأرض', 'number', pl, v => { pl = v; }, { step: '.5', unit: 'م', min: 4 }),
      el('div', { class: 'acts' }, el('button', { onclick: () => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; editor.exec({ type: 'set-plot', polygon: [{ x: cx - pw / 2, y: cy - pl / 2 }, { x: cx + pw / 2, y: cy - pl / 2 }, { x: cx + pw / 2, y: cy + pl / 2 }, { x: cx - pw / 2, y: cy + pl / 2 }] }, 'حدود الأرض'); } }, 'رسم الأرض حول البناء'), plot ? el('button', { onclick: () => editor.exec({ type: 'set-plot', polygon: null }, 'حذف الأرض') }, 'إزالة') : null),
      el('div', { style: 'height:8px' }), field('اتجاه الشمال', 'number', doc.north || 0, v => editor.exec({ type: 'set-plot', north: v }, 'الشمال'), { step: '1', unit: '°', min: 0, max: 359 }),
      field('جهة المدخل', 'select', doc.entry || '', v => editor.exec({ type: 'set-plot', entry: v || null }, 'جهة المدخل'), { options: [['', '—'], ...Object.entries(PLOT_ENTRIES)] })));
    box.append(el('p', { class: 'muted' }, 'اضغط على أي عنصر في الرسم لتظهر خصائصه هنا. اضغط مرتين على اسم الغرفة لتغييره.'));
    return;
  }
  if (items.length > 1) {
    const counts = {}; for (const i of items) counts[i.collection] = (counts[i.collection] || 0) + 1;
    const names = { walls: 'جدار', openings: 'فتحة', fixtures: 'قطعة أثاث', labels: 'اسم غرفة', stairs: 'سلم', columns: 'عمود', texts: 'نص', dimensions: 'قياس', zones: 'منطقة' };
    box.append(el('div', { class: 'sec' }, el('h4', {}, `تحديد متعدد (${items.length})`), el('p', { class: 'muted' }, Object.entries(counts).map(([k, n]) => `${n} ${names[k] || k}`).join(' · '))),
      el('div', { class: 'acts' }, el('button', { onclick: () => editor.duplicateSelection() }, 'تكرار'), el('button', { onclick: () => editor.rotateSelection(Math.PI / 2) }, 'تدوير 90°'), el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف')),
      el('p', { class: 'muted' }, 'الأسهم تزيح التحديد 5 سم، ومع Shift نصف متر.'));
    return;
  }
  const { collection, item: it } = items[0];
  const sec = el('div', { class: 'sec' }); box.append(sec);
  if (collection === 'walls') {
    const L = Math.hypot(it.b.x - it.a.x, it.b.y - it.a.y);
    sec.append(el('h4', {}, 'جدار'),
      field('الطول', 'number', num(L, 3), v => { if (v > .05) { const k = v / L; upd(it.id, { b: { x: it.a.x + (it.b.x - it.a.x) * k, y: it.a.y + (it.b.y - it.a.y) * k } }, 'طول الجدار'); } }, { step: '.05', unit: 'م' }),
      field('السماكة', 'number', Math.round(it.t * 100), v => upd(it.id, { t: v / 100 }), { step: '1', unit: 'سم', min: 5, max: 100 }),
      field('النوع', 'select', it.kind || 'wall', v => upd(it.id, { kind: v }), { options: Object.entries(WALL_KINDS) }),
      field('الارتفاع (فارغ = ارتفاع الدور)', 'number', it.h ?? '', v => upd(it.id, { h: Number.isFinite(v) ? v : undefined }), { step: '.05', unit: 'م' }));
    sec.append(el('div', { class: 'acts' }, el('button', { onclick: () => editor.exec({ type: 'split-wall', id: it.id, at: { x: (it.a.x + it.b.x) / 2, y: (it.a.y + it.b.y) / 2 } }, 'تقسيم جدار') }, 'تقسيم عند المنتصف'), el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف')));
    const ops = doc.openings.filter(o => o.wall === it.id); if (ops.length) sec.append(el('p', { class: 'muted' }, `عليه ${ops.length} فتحة.`));
  } else if (collection === 'openings') {
    sec.append(el('h4', {}, OPENING_KINDS[it.kind]?.ar || 'فتحة'),
      field('النوع', 'select', it.kind, v => upd(it.id, { kind: v }), { options: Object.entries(OPENING_KINDS).map(([k, v]) => [k, v.ar]) }),
      field('العرض', 'number', it.w, v => upd(it.id, { w: v }), { step: '.05', unit: 'م' }), field('الارتفاع', 'number', it.h, v => upd(it.id, { h: v }), { step: '.05', unit: 'م' }),
      field('ارتفاع الحافة', 'number', it.sill, v => upd(it.id, { sill: v }), { step: '.05', unit: 'م' }), field('الموضع على الجدار', 'number', it.at, v => upd(it.id, { at: v }), { step: '.05', unit: 'م' }),
      field('مدخل رئيسي', 'check', it.entry, v => upd(it.id, { entry: v })));
    if (['door', 'door2'].includes(it.kind)) sec.append(el('div', { class: 'acts' }, el('button', { onclick: () => editor.exec({ type: 'flip-opening', id: it.id, what: 'swing' }, 'قلب الفتح') }, 'قلب جهة الفتح'), el('button', { onclick: () => editor.exec({ type: 'flip-opening', id: it.id, what: 'hinge' }, 'قلب المفصلة') }, 'قلب المفصلة')));
    sec.append(el('div', { class: 'acts' }, el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف')));
  } else if (collection === 'fixtures') {
    sec.append(el('h4', {}, 'أثاث / تجهيز'), field('النوع', 'select', it.kind, v => upd(it.id, { kind: v, w: FIXTURES[v].w, d: FIXTURES[v].d, h: FIXTURES[v].h }), { options: Object.entries(FIXTURES).map(([k, v]) => [k, v.ar]) }),
      field('الدوران', 'number', deg(it.rot), v => upd(it.id, { rot: v * Math.PI / 180 }), { step: '5', unit: '°' }), field('العرض', 'number', it.w, v => upd(it.id, { w: v }), { step: '.05', unit: 'م' }), field('العمق', 'number', it.d, v => upd(it.id, { d: v }), { step: '.05', unit: 'م' }), field('الارتفاع', 'number', it.h, v => upd(it.id, { h: v }), { step: '.05', unit: 'م' }),
      field('س', 'number', it.x, v => upd(it.id, { x: v }), { step: '.05', unit: 'م' }), field('ص', 'number', it.y, v => upd(it.id, { y: v }), { step: '.05', unit: 'م' }),
      el('div', { class: 'acts' }, el('button', { onclick: () => editor.rotateSelection(Math.PI / 2) }, 'تدوير 90°'), el('button', { onclick: () => editor.duplicateSelection() }, 'تكرار'), el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف')));
  } else if (collection === 'stairs') {
    sec.append(el('h4', {}, 'سلم'), field('الشكل', 'select', it.kind, v => upd(it.id, { kind: v }), { options: Object.entries(STAIR_KINDS) }), field('العرض', 'number', it.w, v => upd(it.id, { w: v }), { step: '.05', unit: 'م' }), field('الطول', 'number', it.run, v => upd(it.id, { run: v }), { step: '.1', unit: 'م' }), field('الدوران', 'number', deg(it.rot), v => upd(it.id, { rot: v * Math.PI / 180 }), { step: '90', unit: '°' }), field('عكس الاتجاه', 'check', it.flip, v => upd(it.id, { flip: v })),
      el('div', { class: 'acts' }, el('button', { onclick: () => editor.rotateSelection(Math.PI / 2) }, 'تدوير 90°'), el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف')));
  } else if (collection === 'labels') {
    const room = [...(editor.lv?.rooms || [])].find(r => r.label?.id === it.id);
    sec.append(el('h4', {}, 'غرفة'), field('الاسم', 'text', it.name, v => upd(it.id, { name: v || roomTypeName(it.type) }, 'اسم الغرفة')), field('النوع', 'select', it.type, v => upd(it.id, { type: v, ...(it.name === roomTypeName(it.type) ? { name: roomTypeName(v) } : {}) }, 'نوع الغرفة'), { options: Object.entries(ROOM_TYPES).map(([k, v]) => [k, v.ar]) }));
    if (room) sec.append(el('div', { class: 'kv' }, 'المساحة الصافية', el('b', {}, num(room.area, 2) + ' م²'), 'الأبعاد', el('b', {}, `${num(room.rect.w, 2)} × ${num(room.rect.l, 2)} م`), 'المحيط', el('b', {}, num(room.perimeter, 2) + ' م')));
    else sec.append(el('p', { class: 'muted' }, 'هذا الاسم خارج أي غرفة مغلقة — حرّكه إلى داخل غرفة.'));
    sec.append(el('div', { class: 'acts' }, el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف الاسم')));
  } else if (collection === 'columns') {
    sec.append(el('h4', {}, 'عمود'), field('المقاس', 'number', it.size, v => upd(it.id, { size: v }), { step: '.05', unit: 'م' }), field('دائري', 'check', it.round, v => upd(it.id, { round: v })), el('div', { class: 'acts' }, el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف')));
  } else if (collection === 'texts') {
    sec.append(el('h4', {}, 'نص'), field('النص', 'text', it.text, v => upd(it.id, { text: v })), field('الحجم', 'number', it.size, v => upd(it.id, { size: v }), { step: '.05', unit: 'م' }), el('div', { class: 'acts' }, el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف')));
  } else if (collection === 'dimensions') {
    sec.append(el('h4', {}, 'قياس'), field('بُعد الخط', 'number', it.offset ?? .6, v => upd(it.id, { offset: v }), { step: '.1', unit: 'م' }), el('div', { class: 'acts' }, el('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'حذف')));
  }
}

// ------------------------------------------------------------------------------------------------ rooms list
function renderRooms() {
  const box = $('tab-rooms'); box.replaceChildren();
  const rooms = editor.lv?.rooms || [];
  if (!rooms.length) { box.append(el('p', { class: 'muted' }, 'لا توجد غرف مغلقة بعد. ارسم جدرانًا تُغلق على نفسها فتظهر الغرفة وتُحسب مساحتها تلقائيًا.')); return; }
  for (const r of rooms) {
    const t = ROOM_TYPES[r.type] || ROOM_TYPES.other;
    box.append(el('div', { class: 'room' + (r.unlabelled ? ' warn' : ''), onclick: () => { if (r.label) editor.select([r.label.id]); focusPoint(r.centroid); }, ondblclick: () => roomDialog(null, r) }, el('i', { class: 'sw', style: `background:${r.unlabelled ? '#ddd' : t.color}` }), el('b', {}, r.name), el('small', {}, num(r.area, 2) + ' م²'), r.unlabelled ? el('small', {}, 'بلا اسم') : null));
  }
  const total = rooms.reduce((s, r) => s + r.area, 0);
  box.append(el('div', { class: 'kv', style: 'margin-top:10px' }, 'إجمالي المساحة الصافية', el('b', {}, num(total, 2) + ' م²')), el('p', { class: 'muted' }, 'المساحات صافية داخل الجدران، وتتحدث فورًا عند تعديل أي جدار.'));
}
function focusPoint(p) { editor.view.cx = p.x; editor.view.cy = p.y; editor.markDirty(); }

// ------------------------------------------------------------------------------------------------ tabs
// ------------------------------------------------------------------------------------------------ facades and materials
const FACADE_COLORS = ['#f1ead9', '#ece0c8', '#d9c7a4', '#c8b28a', '#b9a58a', '#e6e2da', '#bfc3c6', '#8b7d6b', '#a65f3c', '#f4f4f1'];
const DARK_COLORS = ['#2b2c2e', '#3b3836', '#5b4a3a', '#7a2f2a', '#1f3a4d', '#d8d6d0', '#8a8f94', '#4d3425'];
const FLOOR_NAMES = { marble: 'رخام', tile: 'بلاط', wood: 'باركيه', wet: 'بلاط حمامات', concrete: 'خرسانة' };
const PRESETS = [
  { name: 'خليجي: لياسة رملية وحجر', colors: ['#ece0c8', '#d9c7a4', '#3b3836'], finish: { facade: { base: 'render', color: '#ece0c8', accent: 'entry', accentColor: '#d9c7a4', plinth: true }, aluminium: '#3b3836', entryDoor: '#3a2a22' } },
  { name: 'حديث أبيض', colors: ['#f4f4f1', '#bfc3c6', '#2b2c2e'], finish: { facade: { base: 'paint', color: '#f4f4f1', accent: 'none', plinth: false }, aluminium: '#2b2c2e', entryDoor: '#2b2c2e' } },
  { name: 'حجر كامل', colors: ['#c8b28a', '#c8b28a', '#5b4a3a'], finish: { facade: { base: 'stone', color: '#c8b28a', accent: 'all', accentColor: '#c8b28a', plinth: true }, aluminium: '#5b4a3a', entryDoor: '#4d3425' } },
  { name: 'ترابي دافئ', colors: ['#b9a58a', '#8b7d6b', '#4d3425'], finish: { facade: { base: 'render', color: '#b9a58a', accent: 'entry', accentColor: '#8b7d6b', plinth: true }, aluminium: '#4d3425', entryDoor: '#4d3425' } },
];
function swatches(list, cur, onPick) {
  const row = el('div', { class: 'sw-row' });
  for (const c of list) row.append(el('button', { class: 'swatch' + (cur && cur.toLowerCase() === c ? ' on' : ''), style: `background:${c}`, title: c, onclick: () => onPick(c) }));
  row.append(el('span', { class: 'swatch custom', title: 'لون آخر' }, el('input', { type: 'color', value: cur || '#cccccc', onchange: e => onPick(e.target.value) })));
  return row;
}
const setFinish = (patch, label = 'المواد') => editor.exec({ type: 'set-meta', finish: patch }, label, { key: 'finish' });
function look(az, label) { return el('button', { onclick: async () => { if (!threeVisible()) { $('app').dataset.view = 'split'; document.querySelectorAll('.seg [data-view]').forEach(x => x.classList.toggle('on', x.dataset.view === 'split')); editor.resize(); } await rebuild3D(); if (!viewer?.built) return; viewer.setMode('orbit', { animate: false }); viewer.orbitTo({ azimuthDeg: az, elevationDeg: 9, distance: viewer.radius() * 2.6, animate: true }); } }, label); }
function renderFinish() {
  const box = $('tab-finish'); box.replaceChildren();
  const f = editor.doc.finish || {}, fa = f.facade || {};
  box.append(el('div', { class: 'sec' }, el('h4', {}, 'أنماط جاهزة'), ...PRESETS.map(p => el('button', { class: 'preset', onclick: () => setFinish(p.finish, 'نمط ' + p.name) }, el('i', {}, ...p.colors.map(c => el('b', { style: `background:${c}` }))), p.name))));
  box.append(el('div', { class: 'sec' }, el('h4', {}, 'عرض الواجهات في المجسم'), el('div', { class: 'facades' }, look(0, 'الواجهة الجنوبية'), look(180, 'الواجهة الشمالية'), look(90, 'الواجهة الشرقية'), look(270, 'الواجهة الغربية'))));
  const seg = (items, cur, fn) => el('div', { class: 'seg3' }, ...items.map(([v, l]) => el('button', { class: cur === v ? 'on' : '', onclick: () => fn(v) }, l)));
  box.append(el('div', { class: 'sec' }, el('h4', {}, 'تشطيب الواجهة'), seg([['render', 'لياسة'], ['paint', 'دهان أملس'], ['stone', 'حجر']], fa.base || 'render', v => setFinish({ facade: { base: v } })), el('h4', {}, 'لون الواجهة'), swatches(FACADE_COLORS, fa.color, c => setFinish({ facade: { color: c } })),
    el('h4', {}, 'كسوة الحجر'), seg([['entry', 'واجهة المدخل'], ['all', 'كل الواجهات'], ['none', 'بدون']], fa.accent || 'entry', v => setFinish({ facade: { accent: v } })), swatches(FACADE_COLORS.slice(0, 6), fa.accentColor, c => setFinish({ facade: { accentColor: c } })),
    field('قاعدة حجرية أسفل الجدار', 'check', fa.plinth !== false, v => setFinish({ facade: { plinth: v } }))));
  box.append(el('div', { class: 'sec' }, el('h4', {}, 'النوافذ والأبواب'), el('div', { class: 'muted' }, 'لون الألمنيوم'), swatches(DARK_COLORS, f.aluminium, c => setFinish({ aluminium: c })), el('div', { class: 'muted' }, 'لون باب المدخل'), swatches(DARK_COLORS, f.entryDoor, c => setFinish({ entryDoor: c }))));
  box.append(el('div', { class: 'sec' }, el('h4', {}, 'السور والسطح'), el('div', { class: 'muted' }, 'لون السور'), swatches(FACADE_COLORS, f.fence, c => setFinish({ fence: c })), el('div', { class: 'muted' }, 'لون حافة السطح'), swatches(FACADE_COLORS, fa.copingColor, c => setFinish({ facade: { copingColor: c } }))));
  const used = [...new Set(editor.doc.labels.map(l => l.type))];
  const floors = el('div', { class: 'sec' }, el('h4', {}, 'الأرضيات حسب نوع الغرفة'));
  if (!used.length) floors.append(el('p', { class: 'muted' }, 'سمِّ الغرف أولًا لتختار أرضية كل نوع.'));
  for (const t of used) floors.append(field(roomTypeName(t), 'select', (f.floors || {})[t] || ROOM_TYPES[t].floor, v => setFinish({ floors: { [t]: v } }), { options: Object.entries(FLOOR_NAMES) }));
  box.append(floors, el('div', { class: 'acts' }, el('button', { onclick: () => { editor.exec({ type: 'set-meta', finish: { facade: { base: 'render', accent: 'entry', plinth: true, color: null, accentColor: null, plinthColor: null, copingColor: null }, aluminium: null, entryDoor: null, fence: null, roof: null, floors: Object.fromEntries(used.map(t => [t, null])) } }, 'إعادة المواد'); } }, 'إعادة الافتراضي')), el('p', { class: 'muted' }, 'التغيير يظهر فورًا في المجسم ثلاثي الأبعاد ويُحفظ مع المشروع.'));
}
function setTab(name) { document.querySelectorAll('.tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name)); document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('on', p.id === 'tab-' + name)); if (name === 'ai') refreshAiSees(); if (name === 'finish') renderFinish(); if (name === 'dna') renderDna(); if (name === 'qty') renderQty(); }
document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => { setTab(b.dataset.tab); if (b.dataset.tab === 'review') runReview(); }));

// ------------------------------------------------------------------------------------------------ review
let issues = [];
const scheduleReview = debounce(runReview, 450);
function locate(id) {
  const hit = getById(editor.doc, id), d = editor.doc;
  if (hit) { const it = hit.item;
    if (hit.collection === 'walls') return { p: { x: (it.a.x + it.b.x) / 2, y: (it.a.y + it.b.y) / 2 }, level: it.level };
    if (hit.collection === 'openings') { const w = d.walls.find(x => x.id === it.wall); if (w) { const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1; return { p: { x: w.a.x + (w.b.x - w.a.x) * it.at / L, y: w.a.y + (w.b.y - w.a.y) * it.at / L }, level: it.level }; } }
    if (it.seed) return { p: it.seed, level: it.level }; if (it.at && !it.wall) return { p: it.at, level: it.level }; if (Number.isFinite(it.x)) return { p: { x: it.x, y: it.y }, level: it.level };
  }
  const r = editor.model?.roomIndex.get(id); if (r) return { p: r.room.label?.seed || r.room.centroid, level: r.level.level.id };
  return null;
}
function runReview() {
  try { issues = reviewDoc(editor.doc); } catch (e) { issues = []; }
  const box = $('tab-review'); box.replaceChildren();
  const rank = { error: 0, warning: 1, info: 2 }, serious = issues.filter(i => i.severity !== 'info').length;
  const badge = $('reviewCount'); badge.hidden = !serious; badge.textContent = serious; badge.className = issues.some(i => i.severity === 'error') ? 'err' : '';
  if (!issues.length) box.append(el('p', { class: 'muted' }, editor.doc.walls.length ? 'لا ملاحظات على المخطط الحالي. المراجعة إرشادية من كتالوج التطبيق وليست اشتراطات نظامية.' : 'ارسم شيئًا ليبدأ فحص المخطط.'));
  else box.append(el('p', { class: 'muted' }, 'ملاحظات إرشادية من كتالوج التطبيق — وليست اشتراطات نظامية.'));
  for (const i of [...issues].sort((a, b) => rank[a.severity] - rank[b.severity])) {
    const where = i.targetIds.map(locate).find(Boolean);
    box.append(el('div', { class: 'issue ' + i.severity }, i.message, el('div', { class: 'acts' },
      where ? el('button', { onclick: () => { if (where.level && where.level !== editor.levelId) editor.setLevel(where.level); const ids = i.targetIds.filter(id => getById(editor.doc, id)); editor.select(ids); focusPoint(where.p); } }, 'اعرض في الرسم') : null,
      i.fix ? el('button', { onclick: () => { editor.exec({ type: 'batch', commands: i.fix.commands }, i.fix.label); toast('طُبّق: ' + i.fix.label); } }, i.fix.label) : null)));
  }
  const markers = []; for (const i of issues) { if (i.severity === 'info' || markers.length > 30) continue; const w = i.targetIds.map(locate).find(x => x && x.level === editor.levelId); if (w) markers.push({ at: w.p, severity: i.severity }); }
  editor.setMarkers(markers);
}

// ------------------------------------------------------------------------------------------------ assistant
function refreshAiSees() {
  const box = $('aiSees'); let text = '';
  try { text = editor.doc.walls.length ? describeDigestAr(digestDoc(editor.doc, { compact: true })) : 'لا يوجد رسم بعد. ارسم جدرانًا فيراها المساعد.'; } catch { text = 'تعذّر تلخيص الرسم.'; }
  box.replaceChildren(el('b', {}, 'ما يراه المساعد في رسمك الآن'), text.slice(0, 900));
}
const refreshAiSeesSoon = debounce(() => { if ($('tab-ai').classList.contains('on')) refreshAiSees(); }, 600);
$('aiCode').value = store.sget('mizan.access') || '';
$('aiCode').addEventListener('change', e => store.sset('mizan.access', e.target.value));
const SUGGEST = ['كم مساحة كل غرفة؟', 'أي الغرف بلا نافذة؟', 'ما الذي ينقص المخطط؟', 'أضف باب في غرفة النوم'];
function renderChips(list) { const c = $('aiChips'); c.replaceChildren(...list.slice(0, 5).map(s => el('button', { type: 'button', onclick: () => { $('askText').value = s; $('askText').focus(); } }, s))); }
renderChips(SUGGEST);
function addMsg(cls, ...kids) { const m = el('div', { class: 'msg ' + cls }, ...kids); $('chat').append(m); $('chat').scrollTop = 1e9; return m; }
let busy = false;
$('askForm').addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return; const q = $('askText').value.trim(); if (!q) return;
  busy = true; $('askBtn').disabled = true; addMsg('me', q); $('askText').value = ''; const wait = addMsg('bot', 'أفحص الرسم…');
  try {
    const sel = [...editor.selection];
    const res = await askDrawingAssistant(editor.doc, q, { accessCode: $('aiCode').value, selection: sel, signal: AbortSignal.timeout(60000) });
    wait.remove();
    const m = addMsg('bot', res.answer || '—');
    if (res.limitations?.length) m.append(el('small', {}, res.limitations.join(' · ')));
    m.append(el('small', {}, res.source === 'claude' ? 'جواب من Claude بعد قراءة ملخص مخططك' : 'جواب محلي من فهم المخطط'));
    for (const p of res.proposals || []) {
      const box = el('div', { class: 'prop' }, el('p', {}, p.preview?.summary || p.label));
      box.append(el('div', { class: 'acts' }, el('button', { class: 'btn primary', onclick: ev => { const r = editor.exec({ type: 'batch', commands: p.commands }, p.label); if (r) { ev.target.disabled = true; ev.target.textContent = 'طُبّق ✓'; toast('طُبّق الاقتراح'); const t = editor.levelId; void t; } } }, 'تطبيق على المخطط'), el('button', { class: 'btn', onclick: ev => box.remove() }, 'تجاهل')));
      m.append(box);
    }
    if (res.referencedIds?.length) editor.select(res.referencedIds.filter(id => getById(editor.doc, id)));
    if (res.suggestions?.length) renderChips(res.suggestions);
  } catch (err) { wait.textContent = err?.name === 'TimeoutError' ? 'انتهت المهلة دون رد.' : 'تعذّر الجواب: ' + (err?.message || 'خطأ غير متوقع'); }
  busy = false; $('askBtn').disabled = false;
});
$('askText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('askForm').requestSubmit(); } });

// ------------------------------------------------------------------------------------------------ 3D
let viewer = null, viewerLoading = null, built3D = false, userOrbited = false;
function threeVisible() { const v = $('app').dataset.view; return v === 'split' || v === '3d'; }
async function ensureViewer() {
  if (viewer) return viewer; if (viewerLoading) return viewerLoading;
  viewerLoading = (async () => {
    try {
      const [{ loadThreeRuntime }, { DrawViewer }] = await Promise.all([import('./three-runtime.mjs'), import('./draw/viewer-draw.mjs')]);
      const THREE = await loadThreeRuntime();
      viewer = new DrawViewer($('threeHost'), { THREE, shadowSize: 1024, maxPixelRatio: 1.5, onState: ev => { if (ev.type === 'mode') syncModeSeg(); } });
      globalThis.__mizanViewer = viewer; $('threeHost').addEventListener('pointerdown', () => { userOrbited = true; }); return viewer;
    } catch (e) { $('threeMsg').hidden = false; $('threeMsg').textContent = 'تعذّر تشغيل العرض ثلاثي الأبعاد على هذا الجهاز (WebGL غير متاح). المخطط ثنائي الأبعاد يعمل كاملًا.'; viewerLoading = null; return null; }
  })();
  return viewerLoading;
}
async function rebuild3D() {
  if (touring) { rebuildAfterTour = true; return; }
  if (!threeVisible()) { built3D = false; return; }
  const v = await ensureViewer(); if (!v) return;
  const msg = $('threeMsg');
  if (!editor.doc.walls.length) { msg.hidden = false; msg.textContent = 'ارسم جدرانًا في المخطط لتظهر هنا ثلاثية الأبعاد فورًا.'; built3D = false; return; }
  msg.hidden = true;
  try { const before = built3D ? v.radius() : 0; v.setDoc(editor.doc, { keepCamera: built3D }); if (before && (v.radius() / before > 1.35 || v.radius() / before < .72) && !userOrbited) v.frameBuilding(); built3D = true; v.resize(); sync3DLevel(); } catch (e) { msg.hidden = false; msg.textContent = 'تعذّر بناء المجسم: ' + (e.message || 'خطأ'); }
}
const schedule3D = debounce(rebuild3D, 380);
function sync3DLevel() { if (!viewer?.built) return; if ($('isoLevel').checked) viewer.isolateLevel(editor.levelId); else viewer.showLevel('all'); }
function syncModeSeg() { document.querySelectorAll('#modeSeg [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === viewer?.mode)); $('secWrap').hidden = viewer?.mode !== 'section'; }
document.querySelectorAll('#modeSeg [data-mode]').forEach(b => b.addEventListener('click', async () => { const v = await ensureViewer(); if (!v?.built) return; v.setMode(b.dataset.mode); if (b.dataset.mode === 'section') v.setSectionHeight(parseFloat($('secH').value)); if (b.dataset.mode === 'walk') toast('تجوّل: أسهم لوحة المفاتيح أو WASD، واسحب للالتفات'); syncModeSeg(); }));
document.querySelectorAll('#styleSeg [data-style]').forEach(b => b.addEventListener('click', () => { viewer?.setStyle(b.dataset.style); document.querySelectorAll('#styleSeg [data-style]').forEach(x => x.classList.toggle('on', x === b)); }));
$('sunAz').addEventListener('input', e => viewer?.setSun({ azimuthDeg: +e.target.value })); $('sunAlt').addEventListener('input', e => viewer?.setSun({ altitudeDeg: +e.target.value }));
$('secH').addEventListener('input', e => viewer?.setSectionHeight(+e.target.value)); $('isoLevel').addEventListener('change', sync3DLevel);
$('shot3d').addEventListener('click', async () => { if (!viewer?.built) return toast('لا يوجد مجسم بعد'); try { exportWithManifest((editor.doc.title || 'mizan') + '-3d.png', await viewer.capturePNG(2), 'studio-3d-png'); } catch { toast('تعذّر التقاط الصورة', true); } });
// automatic walkthrough (orbit, approach, rooms) with optional local WebM recording
let touring = false, rebuildAfterTour = false;
let viewBeforeTour = null;
function setView(view) { $('app').dataset.view = view; document.querySelectorAll('.seg [data-view]').forEach(x => x.classList.toggle('on', x.dataset.view === view)); editor.resize(); viewer?.resize(); }
async function ensureTourViewer({ record = false } = {}) {
  if (!editor.doc.walls.length) return null;
  // a video takes the shape of the pane: record in the full-width 3D view, not in the narrow half of the split view
  if (record && $('app').dataset.view !== '3d') { viewBeforeTour = $('app').dataset.view; setView('3d'); await new Promise(r => requestAnimationFrame(r)); }
  else if (!threeVisible()) setView('split');
  const was = touring; touring = false; // the model must be current before the camera starts moving
  try { built3D = false; await rebuild3D(); } finally { touring = was; }
  viewer?.resize();
  return viewer?.built ? viewer : null;
}
import('./draw/tour-ui.mjs').then(({ initDrawTourUI }) => {
  globalThis.__mizanTour = initDrawTourUI({ root: $('threePane'), ensureViewer: ensureTourViewer, getEntry: () => editor.doc.entry, planOptions: () => globalThis.__mizanTourOptions || {},
    onBusy: on => { touring = on; $('threePane').classList.toggle('touring', on); },
    onDone: () => { if (viewBeforeTour) { setView(viewBeforeTour); viewBeforeTour = null; } sync3DLevel(); syncModeSeg(); if (rebuildAfterTour) { rebuildAfterTour = false; rebuild3D(); } } });
});
document.querySelectorAll('.seg [data-view]').forEach(b => b.addEventListener('click', () => { $('app').dataset.view = b.dataset.view; document.querySelectorAll('.seg [data-view]').forEach(x => x.classList.toggle('on', x === b)); requestAnimationFrame(() => { editor.resize(); viewer?.resize(); if (threeVisible()) rebuild3D(); }); }));
window.addEventListener('resize', () => { editor.resize(); viewer?.resize(); });

// ------------------------------------------------------------------------------------------------ files and export
function loadDoc(doc, msg) { userOrbited = false; editor.load(doc); $('docTitle').value = doc.title; built3D = false; renderLevels(); renderProps(); renderRooms(); syncTool(); if (msg) toast(msg); }
function loadExample() { loadDoc(sampleVilla(), 'فُتح المثال: عدّل عليه كما تشاء'); }
$('btnExample').addEventListener('click', loadExample);
$('btnNew').addEventListener('click', () => { if (editor.doc.walls.length && !confirm('سيُغلق المشروع الحالي. احفظه أولًا إن أردت. هل تبدأ مشروعًا جديدًا؟')) return; loadDoc(createDoc({ title: 'مشروع جديد' })); editor.setTool('wall'); });
$('btnOpen').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await openFile(f); });
// A studio project opens as it is; a saved project or model of the previous planner is converted (draw/import-legacy.mjs).
async function openFile(file) {
  let raw; try { raw = JSON.parse(await file.text()); } catch { return toast('الملف ليس JSON صالحًا', true); }
  try { if (raw?.schema === SCHEMA) loadDoc(parseDoc(raw), 'فُتح الملف'); else await importLegacy(raw); } catch (err) { toast(err.message || 'تعذّر فتح الملف', true); }
}
function chooseLegacy(candidates) {
  return new Promise(resolve => {
    let picked = null;
    const dlg = el('dialog', { dir: 'rtl' }, el('h3', {}, 'اختر المخطط المراد استيراده'), el('p', { class: 'muted' }, 'يحتوي الملف أكثر من مخطط؛ يُستورد واحد في كل مرة.'),
      el('div', { class: 'pick' }, candidates.map(c => el('button', { class: 'btn', onclick: () => { picked = c; dlg.close(); } }, c.label, el('small', {}, `${c.summary.rooms} غرفة · ${c.summary.walls} جدار${c.summary.width ? ` · أرض ${c.summary.width}×${c.summary.length} م` : ''}`)))),
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => dlg.close() }, 'إلغاء')));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(picked); });
    document.body.append(dlg); dlg.showModal();
  });
}
async function importLegacy(raw) {
  const { findLegacyModels, legacyToDoc, LEGACY_PROJECT_SCHEMA } = await import('./draw/import-legacy.mjs');
  // a saved design that kept only its recipe is regenerated by the previous planner
  let generate = null;
  if (raw?.schema === LEGACY_PROJECT_SCHEMA) { const pl = await import('./planner.mjs').catch(() => null); if (pl) generate = r => pl.generateModel(pl.validatePlot(r.plot), pl.normalizeRooms(r.rooms), { strategy: r.strategy }); }
  const { candidates, skipped } = findLegacyModels(raw, { generate });
  if (!candidates.length) return toast(skipped[0] || 'الملف ليس مشروع رسم من الميزان ولا مخططًا من النظام القديم.', true);
  const pick = candidates.length === 1 ? candidates[0] : await chooseLegacy(candidates);
  if (!pick) return;
  const { doc, report } = legacyToDoc(pick.model);
  loadDoc(doc, `استُورد المخطط: ${report.rooms} غرفة · ${report.walls} جدار · ${report.openings} فتحة` + (report.skipped.length + report.unmatched.length ? ` · تعذّر ${report.skipped.length + report.unmatched.length} عنصر` : ''));
  globalThis.__mizanImportReport = report; // للاختبارات الحية
}
const saveJson = () => download((editor.doc.title || 'mizan').replace(/[\\/:*?"<>|]/g, '_') + '.mizan.json', new Blob([serialize(editor.doc)], { type: 'application/json' }));
$('btnSave').addEventListener('click', () => { saveJson(); toast('حُفظ الملف على جهازك'); });
$('btnExport').addEventListener('click', e => { e.stopPropagation(); $('exportMenu').hidden = !$('exportMenu').hidden; });
document.addEventListener('click', () => { $('exportMenu').hidden = true; });
$('exportMenu').addEventListener('click', async e => {
  const kind = e.target.dataset.export; if (!kind) return;
  if (kind === 'json') saveJson();
  else if (kind === 'png') { editor.canvas.toBlob(b => b && exportWithManifest((editor.doc.title || 'mizan') + '-plan.png', b, 'studio-plan-png')); }
  else if (kind === 'png3d') { const v = await ensureViewer(); if (!v?.built) await rebuild3D(); try { exportWithManifest((editor.doc.title || 'mizan') + '-3d.png', await viewer.capturePNG(2), 'studio-3d-png'); } catch { toast('اعرض المجسم أولًا ثم أعد المحاولة', true); } }
  else if (kind === 'bundle') openExportStudio({ doc: editor.doc, download });
  else if (kind === 'dxf') exportWithManifest((editor.doc.title || 'mizan') + '.dxf', new Blob([toDxf(editor.doc)], { type: 'application/dxf' }), 'studio-dxf');
});

// ------------------------------------------------------------------------------------------------ الكميات والتحقق (AR-02)
let qtyTimer = null;
function scheduleQty() { clearTimeout(qtyTimer); qtyTimer = setTimeout(renderQty, 250); }
function renderQty() {
  const box = $('tab-qty'); box.replaceChildren();
  let res; try { res = computeDocQuantities(editor.doc); } catch (e) { box.append(el('div', { class: 'sec' }, el('p', { class: 'fpwarn' }, 'تعذّر حساب الكميات: ' + e.message))); return; }
  if (!res.levels.some(l => l.q)) { box.append(el('div', { class: 'sec' }, el('h4', {}, 'الكميات'), el('p', { class: 'muted' }, 'ارسم جدرانًا مغلقة وسمِّ الغرف لتظهر الكميات.'), ...res.levels.filter(l => l.error).map(l => el('p', { class: 'fpwarn' }, l.name + ': ' + l.error)))); return; }
  const t = el('table', { class: 'dna-table' }, el('tr', {}, ...['البند', 'القيمة', 'الدرجة'].map(x => el('th', {}, x))));
  for (const r of res.rows) t.append(el('tr', {}, el('td', {}, r.label, el('small', { class: 'tag' }, r.basis)), el('td', {}, r.value === null ? '—' : r.value.toLocaleString('ar-SA') + ' ' + r.unit), el('td', {}, el('span', { class: 'grade ' + r.grade }, GRADES[r.grade]))));
  box.append(el('div', { class: 'sec' }, el('h4', {}, 'الكميات من الرسم الحالي'), t, el('p', { class: 'muted' }, 'تُحسب من الجدران والفتحات المرسومة الآن، وتتحدث مع كل تعديل. لا يُذكر رقم بلا مصدر: ما لا يقيسه الرسم يُكتب «غير قابل للحساب».')));
  const rt = el('table', { class: 'dna-table' }, el('tr', {}, ...['الدور', 'الغرفة', 'الأبعاد', 'المساحة'].map(x => el('th', {}, x))));
  for (const r of res.perRoom) rt.append(el('tr', {}, el('td', {}, r.level), el('td', {}, r.name), el('td', {}, r.w + '×' + r.h), el('td', {}, r.area + ' م²')));
  box.append(el('div', { class: 'sec' }, el('h4', {}, 'الغرف'), rt));
  const chk = el('div', { class: 'sec' }, el('h4', {}, 'تحقق المحرك على الرسم'));
  for (const l of res.levels) {
    if (l.error) { chk.append(el('p', { class: 'fpwarn' }, l.name + ': ' + l.error)); continue; }
    if (l.empty) { chk.append(el('p', { class: 'muted' }, l.name + ': لا جدران.')); continue; }
    const v = l.report.validation;
    chk.append(el('p', { class: v.length ? 'fpwarn' : 'muted' }, l.name + ': ' + (v.length ? v.length + ' ملاحظة' : 'اجتاز كل فحوص المحرك')));
    if (v.length) chk.append(el('ul', {}, ...[...new Set(v)].map(x => el('li', {}, x))));
    for (const w of [...l.report.warnings, ...l.report.skipped]) chk.append(el('p', { class: 'muted' }, '• ' + w));
    if (l.report.unnamed.length) chk.append(el('p', { class: 'muted' }, '• ' + l.report.unnamed.length + ' فراغ مغلق بلا اسم لم يدخل الحساب.'));
    if (l.score) chk.append(el('p', { class: 'muted' }, 'درجة الميزان: ' + (l.score.score ?? 'غير مُقيَّمة') + ' — ' + l.score.grade));
  }
  box.append(chk);
}

// ------------------------------------------------------------------------------------------------ بصمة التصميم
const STRATEGY_NAMES = { 'claude-rect': 'مخطط مستطيل', compact: 'الرواق المحوري', balanced: 'الجناحان المتوازنان', frontage: 'الواجهة العريضة', courtyard: 'بيت الفناء', 'u-court': 'بيت الباحة U', pavilions: 'أجنحة مرتبطة برواق', staggered: 'جناحان متدرجان' };
let dnaState = null;
try { dnaState = homeHandoff?.dna ? { dna: homeHandoff.dna, alternatives: homeHandoff.alternatives || [] } : loadSavedDNA(localStorage); } catch { dnaState = null; }
function renderDna() {
  const box = $('tab-dna'); box.replaceChildren();
  if (!dnaState?.dna) { box.append(el('div', { class: 'sec' }, el('h4', {}, 'بصمة التصميم'), el('p', { class: 'muted' }, 'تظهر البصمة عندما يُولَّد التصميم من الصفحة الرئيسية بعد أسئلة شرعاء. هذا المشروع لا يحمل بصمة.'))); return; }
  const { dna, alternatives } = dnaState, cur = geometryFingerprint(editor.doc), orig = dna.geometryFingerprint;
  const same = orig && cur === orig;
  box.append(el('div', { class: 'sec' }, el('h4', {}, 'البصمتان'),
    el('div', { class: 'fp' }, el('span', { class: 'muted' }, 'بصمة ميزانك'), el('code', {}, dna.fingerprint || '—')),
    el('div', { class: 'fp' }, el('span', { class: 'muted' }, 'بصمة الهندسة الحالية'), el('code', {}, cur)),
    el('p', { class: same ? 'muted' : 'fpwarn' }, orig ? (same ? 'الهندسة كما ولّدها المحرك دون تعديل.' : 'عُدّلت الهندسة بعد التوليد (بصمتها الأصلية ' + orig + ').') : 'لا توجد بصمة أصلية للمقارنة.')));
  const axes = el('div', { class: 'sec' }, el('h4', {}, 'محاور ميزانك'));
  for (const a of dna.dna.axes) axes.append(el('div', { class: 'axis' }, el('div', { class: 'axis-h' }, el('b', {}, a.label), el('span', {}, Math.round(a.value * 100) + '%')), el('div', { class: 'bar' }, el('i', { style: `width:${Math.round(a.value * 100)}%` })), el('small', { class: 'muted' }, a.sources.join('، ') + (a.measured ? '' : ' — لا يقيسه المحرك بعد، فلا يغيّر الدرجة'))));
  box.append(axes);
  const alt = el('div', { class: 'sec' }, el('h4', {}, 'البدائل بميزانك'));
  const table = el('table', { class: 'dna-table' }, el('tr', {}, ...['البديل', 'بميزانك', 'محايد', ''].map(t => el('th', {}, t))));
  for (const row of dna.rows) {
    const doc = alternatives.find(x => x.index === row.index)?.doc, isAziz = row.index === dna.selectedIndex, isBest = row.index === dna.bestIndex;
    const tags = [isAziz ? 'اختيار AZIZ' : '', isBest ? 'الأنسب لبصمتك' : ''].filter(Boolean).join(' · ');
    const open = doc && !isAziz ? el('button', { class: 'btn', onclick: () => openAlternative(doc, row) }, 'افتحه') : '';
    table.append(el('tr', {}, el('td', {}, (STRATEGY_NAMES[row.strategy] || row.strategy) + ' #' + (row.index + 1), tags ? el('small', { class: 'tag' }, tags) : ''), el('td', {}, row.score ?? '—'), el('td', {}, row.neutralScore ?? '—'), el('td', {}, open)));
  }
  alt.append(table, el('p', { class: 'muted' }, 'الدرجات تقديرية من مقاييس يقيسها المحرك فعلًا (الخصوصية والحركة والإضاءة والكفاءة والهدر). المعتمد في التوليد هو اختيار AZIZ؛ هذا الترتيب يعرض ما تفضّله بصمتك ولا يغيّر شيئًا إلا إذا فتحت بديلًا بنفسك.'));
  box.append(alt);
}
function openAlternative(doc, row) {
  if (!confirm('سيُفتح هذا البديل مكان المخطط الحالي. يُحفظ المخطط الحالي نسخةً احتياطية في المتصفح. هل تتابع؟')) return;
  try { localStorage.setItem('mizan.studio.doc.v1.before-dna', serialize(editor.doc)); } catch { /* التخزين غير متاح */ }
  if (dnaState?.dna) dnaState.dna.geometryFingerprint = geometryFingerprint(doc);
  try { localStorage.setItem('mizan.studio.dna.v1', JSON.stringify({ dna: dnaState.dna, alternatives: dnaState.alternatives })); } catch { /* ignore */ }
  loadDoc(doc, 'فُتح البديل ' + (STRATEGY_NAMES[row.strategy] || row.strategy) + ' ' + (row.index + 1));
  renderDna();
}

// ------------------------------------------------------------------------------------------------ boot
editor.setTool('select'); renderLevels(); renderProps(); renderRooms(); updateStats(); runReview(); updateWelcome(); syncTool();
editor.on = undefined;
const _origAfter = editor.afterChange.bind(editor); editor.afterChange = () => { _origAfter(); refreshAiSeesSoon(); };
if (threeVisible()) rebuild3D();
if (startedEmpty) $('welcome').hidden = false;
if (homeHandoff) toast('فُتح تصميمك الأولي من شرعاء. عدّل عليه كما تشاء.' + (homeHandoff.backedUp ? ' نُسخ مشروعك السابق احتياطيًا.' : '') + (homeHandoff.meta?.note ? ' ' + homeHandoff.meta.note : ''));
