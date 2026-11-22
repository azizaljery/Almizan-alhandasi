import { SCHEMA, TOOLS_KEY, TOOL_IDS, uid, money, newWorkspace, loadWorkspace, validateWorkspace, saveWorkspace, readCurrentDoc, roomsForDoc, CATEGORIES, validateProduct, productTakeoff, shoppingList, applyProduct, calibratedScale, snapTracePoint, vectorPlanToDoc, quantityReference, renovationDiff, importOfferCsv, validateBoqItem, csv, compareOffers, validateTask, addPayment, executionSummary } from './model.mjs';
import { putFile, getFile, dataUrl, download, decodedImage, imageForVision, colorsOf, compressedImage } from './files.mjs';
import { FLOOR_PRESETS } from '../draw/interior-themes.mjs';
import { parseDoc, serialize, applyCommand } from '../draw/doc.mjs';
import { archiveCurrent, clearProject, touchVisit } from '../project-lifecycle.mjs';

const $ = id => document.getElementById(id), panel = $('tool-panel');
const labels = ['لوحة الذوق', 'التشطيبات والمشتريات', 'استيراد مخطط', 'الترميم', 'عروض المقاولين', 'متابعة التنفيذ'];
const today = () => new Date().toISOString().slice(0, 10);
const fmt = v => Number(v).toLocaleString('ar-SA', { maximumFractionDigits: 2 });
const safeGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
let state, currentDoc, active = TOOL_IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'mood', viewer = null, available = false, passcode = safeGet('mizan.access') || safeGet('mizan.ai.code') || '', objectUrls = [], rendering = 0, lastSavedRaw = safeGet(TOOLS_KEY), lastDocRaw = safeGet('mizan.studio.doc.v1'), fatal = false;
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v === undefined || v === null) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = !!v; else if (k === 'value') el.value = v; else el.setAttribute(k, v); }
  for (const child of children.flat(Infinity)) if (child !== undefined && child !== null) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return el;
}
function message(text, error = false) { $('tools-message').hidden = !text; $('tools-message').className = 'notice' + (error ? ' error' : ''); $('tools-message').textContent = text; }
async function run(fn) { try { return await fn(); } catch (e) { message(e.message || 'تعذر إكمال العملية.', true); return null; } }
function save() {
  if (fatal) throw Error('تعذر قراءة ملف الأدوات الأصلي؛ نزّل نسخته قبل استبداله.');
  if (localStorage.getItem(TOOLS_KEY) !== lastSavedRaw) throw Error('تغيّر ملف الأدوات في تبويب آخر. حدّث الصفحة قبل حفظ تعديلات جديدة.');
  const checked = saveWorkspace(localStorage, state); state.updatedAt = checked.updatedAt; lastSavedRaw = localStorage.getItem(TOOLS_KEY); $('save-state').textContent = 'حُفظ الآن في هذا المتصفح';
}
const button = (label, action, kind = '') => h('button', { type: 'button', class: 'button ' + kind, onclick: async e => { const b = e.currentTarget; if (b.disabled) return; b.disabled = true; try { await run(action); } finally { b.disabled = false; } } }, label);
const card = (title, ...children) => h('section', { class: 'tool-card' }, h('h3', {}, title), children);
const actions = (...children) => h('div', { class: 'actions' }, children);
const empty = text => h('p', { class: 'empty' }, text);
function field(label, name, type = 'text', value = '', opts = {}) {
  const input = type === 'select' ? h('select', { name, id: name }, (opts.choices || []).map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) ? '' : null }, text))) : h(type === 'textarea' ? 'textarea' : 'input', { name, id: name, ...(type !== 'textarea' ? { type } : {}), value, ...opts });
  if (type === 'textarea') input.value = value;
  if (type === 'select') input.value = value || opts.choices?.[0]?.[0] || '';
  return h('label', { class: 'field' + (opts.wide ? ' wide' : ''), for: name }, label, input);
}
function form(fields, submit, text = 'حفظ') {
  return h('form', { onsubmit: async e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)), b = e.submitter; if (b) b.disabled = true; try { await run(() => submit(values)); } finally { if (b) b.disabled = false; } } }, h('div', { class: 'form-grid' }, fields), actions(h('button', { class: 'button', type: 'submit' }, text)));
}
function table(headers, rows) { return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, headers.map(s => h('th', {}, s)))), h('tbody', {}, rows.map(row => h('tr', {}, row.map(v => h('td', {}, v))))))); }
function heading(title, sub, extra = null) { return h('div', { class: 'tool-heading' }, h('div', {}, h('h2', {}, title), h('p', {}, sub)), extra); }
const stack = (...children) => h('div', { class: 'tool-stack' }, children);
const grid = (main, aside) => h('div', { class: 'tool-grid' }, main, aside);
const rooms = () => roomsForDoc(currentDoc);
const roomOptions = () => rooms().map(r => [r.key, r.name + ' · ' + fmt(r.area) + ' م²']);
function swatches(colors) { return h('div', { class: 'swatches' }, colors.map(c => h('span', { class: 'swatch', style: 'background:' + c, title: c, 'aria-label': c }))); }
async function blobUrl(id) { const file = await getFile(id); if (!file) throw Error('ملف مرفق غير موجود على هذا الجهاز. استعد نسخة احتياطية تشمل الملفات.'); const url = URL.createObjectURL(file); objectUrls.push(url); return url; }
function upload(label, accept, onFiles, multiple = false) { return h('label', { class: 'dropzone' }, h('strong', {}, label), h('span', { class: 'muted' }, multiple ? 'يمكنك اختيار عدة ملفات' : 'الملف يبقى على جهازك'), h('span', { class: 'button secondary' }, multiple ? 'اختيار الصور' : 'اختيار الملف'), h('input', { class: 'file-input', type: 'file', accept, multiple: multiple ? '' : null, onchange: async e => { const input = e.currentTarget, files = [...input.files]; input.disabled = true; try { await run(() => onFiles(files)); } finally { input.disabled = false; input.value = ''; } } })); }
function requireDoc() { if (!currentDoc) throw Error('افتح تصميمًا في المرسم أولًا، أو استخدم أداة استيراد المخططات.'); return currentDoc; }
function updateProjectStrip() { $('project-name').textContent = currentDoc?.title || state.title; $('project-detail').textContent = currentDoc ? `${currentDoc.levels.length} أدوار · ${rooms().length} فراغات مسماة` : 'يمكنك بدء لوحة الذوق أو استيراد مخطط'; }
function writeDoc(doc, replace = false) {
  if (localStorage.getItem(TOOLS_KEY) !== lastSavedRaw) throw Error('تغيّر ملف الأدوات في تبويب آخر. حدّث الصفحة قبل تطبيق التعديل.');
  validateWorkspace(state);
  if (!replace && localStorage.getItem('mizan.studio.doc.v1') !== lastDocRaw) throw Error('تغيّر المخطط في تبويب آخر. حدّث الأدوات قبل تطبيق التشطيب.');
  if (replace) { if (localStorage.getItem('mizan.studio.doc.v1') || localStorage.getItem('mizan.design.session.v1')) { if (!archiveCurrent(localStorage)) throw Error('تعذر حفظ المشروع الحالي؛ نزّل نسخة قبل استبداله.'); } clearProject(localStorage, sessionStorage); lastSavedRaw = null; }
  localStorage.setItem('mizan.studio.doc.v1', serialize(doc)); lastDocRaw = localStorage.getItem('mizan.studio.doc.v1'); localStorage.removeItem('mizan.studio.snap3d.v1'); currentDoc = doc; touchVisit(sessionStorage); save(); updateProjectStrip();
}
function authField() { const el = field('رمز خدمة الذكاء الحالية', 'tools-access', 'password', passcode, { autocomplete: 'off' }); el.querySelector('input').addEventListener('input', e => { passcode = e.target.value; }); return el; }
async function vision(mode, images, notes) {
  if (!available) { try { available = (await (await fetch('/api/client-tools/status', { cache: 'no-store' })).json()).available === true; } catch { /* حالة الخدمة غير متاحة */ } }
  if (!available) throw Error('خدمة تحليل الصور غير مهيأة حاليًا؛ الأدوات اليدوية متاحة.');
  if (!passcode) throw Error('أدخل رمز خدمة الذكاء الحالية.');
  const workspaceId = state.id;
  message('جارٍ تحليل الصور؛ سيبقى عملك الحالي محفوظًا…');
  const response = await fetch('/api/client-tools/vision', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Mizan-Access-Code': passcode }, body: JSON.stringify({ mode, images, notes }), signal: AbortSignal.timeout(65_000) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'تعذر تحليل الصور.');
  if (state.id !== workspaceId) throw Error('تغيّر المشروع أثناء التحليل؛ لم تُطبق النتيجة.'); return result.result;
}
function render() {
  rendering++; for (const u of objectUrls) URL.revokeObjectURL(u); objectUrls = [];
  viewer?.dispose?.(); viewer = null;
  for (const b of $('tools-tabs').children) b.setAttribute('aria-selected', String(b.dataset.tool === active));
  panel.setAttribute('aria-labelledby', 'tab-' + active); panel.replaceChildren();
  void run(() => ({ mood: renderMood, finishes: renderFinishes, import: renderImport, renovation: renderRenovation, tenders: () => { renderTenders(); appendTenderDetails(); }, execution: renderExecution })[active]());
}
function navigate(id) { if (!TOOL_IDS.includes(id)) return; active = id; history.replaceState(null, '', '#' + id); message(''); render(); }

async function renderMood() {
  const gallery = h('div', { class: 'image-grid' }), palette = state.mood.palette.length ? state.mood.palette : [...new Set(state.mood.items.flatMap(i => i.colors))].slice(0, 8);
  const notes = field('ما الذي تحبه؟ وما الذي لا تريده؟', 'mood-notes', 'textarea', state.mood.notes); notes.querySelector('textarea').addEventListener('change', e => { state.mood.notes = e.target.value.slice(0, 4000); void run(save); });
  const analyze = button('تحليل الصور وصياغة لوحة الذوق', async () => {
    if (!state.mood.items.length) throw Error('أضف صورة إلهام أولًا.'); analyze.disabled = true;
    try { const images = await Promise.all(state.mood.items.slice(-4).map(async i => imageForVision(await getFile(i.blobId)))); const r = await vision('mood', images, [state.mood.notes, ...state.mood.items.slice(-4).map(i => i.note)].join('\n')); state.mood.summary = r.summary + '\n\nالخامات: ' + r.materials.join('، ') + '\n\n' + r.designDirections.join('\n'); state.mood.palette = r.palette; save(); render(); message('تم إعداد لوحة الذوق. راجع التوجيهات قبل إضافتها إلى طلب التصميم.'); } finally { analyze.disabled = false; }
  });
  panel.append(heading('من الصور التي تحبها… إلى ذوق واضح', 'اجمع صور الإلهام، واكتب ما أعجبك في كل صورة. تُستخرج الألوان محليًا؛ التحليل الاختياري يصوغ الخامات والتوجيهات من آخر أربع صور.'), grid(stack(card('صور الإلهام', upload('أضف صورًا إلى لوحتك', 'image/png,image/jpeg,image/webp', async files => {
    if (state.mood.items.length + files.length > 40) throw Error('الحد الأقصى 40 صورة في اللوحة.');
    for (const file of files) { const prepared = await compressedImage(file); await ensureAttachmentBudget([prepared]); const colors = await colorsOf(prepared), blobId = uid(); await putFile(blobId, prepared); state.mood.items.push({ id: uid(), blobId, name: file.name, note: '', colors }); save(); } render(); message('أضيفت الصور واستُخرجت ألوانها على جهازك.');
  }, true), gallery)), stack(card('لوحة الألوان', palette.length ? swatches(palette) : empty('ستظهر هنا الألوان المستخرجة من صورك.'), notes), card('التوجيه التصميمي', authField(), h('p', { class: 'muted' }, available ? 'تُستخدم خدمة Claude الموجودة في الموقع.' : 'التحليل غير متاح الآن. يمكنك كتابة التوجيه يدويًا وحفظه.'), actions(analyze), form([field('التوجيه الذي تعتمده للتصميم', 'mood-summary', 'textarea', state.mood.summary, { wide: true })], v => { state.mood.summary = v['mood-summary'].slice(0, 4000); save(); message('حُفظ توجيه التصميم.'); }, 'حفظ التوجيه'), actions(button('تنزيل لوحة الذوق', () => download('mizan-moodboard.json', JSON.stringify(state.mood, null, 2))), button('نسخ توجيه التصميم', async () => { await navigator.clipboard.writeText(state.mood.summary); message('نُسخ التوجيه لإضافته إلى حديثك مع شرعاء.'); }, 'secondary'))))));
  const gen = rendering;
  for (const item of state.mood.items) {
    const note = h('textarea', { 'aria-label': 'ما أعجبك في ' + item.name, placeholder: 'مثلًا: لون الحجر، شكل المدخل، الإضاءة…', value: item.note, onchange: e => { item.note = e.target.value.slice(0, 1500); void run(save); } });
    const fig = h('figure', { class: 'mood-image' }, h('figcaption', {}, h('strong', {}, item.name), swatches(item.colors), note, actions(button('حذف الصورة', () => { state.mood.items = state.mood.items.filter(i => i.id !== item.id); save(); render(); }, 'danger')))); gallery.append(fig);
    const url = await blobUrl(item.blobId); if (gen === rendering) fig.prepend(h('img', { src: url, alt: item.name, loading: 'lazy' }));
  }
}

async function renderFinishes() {
  const productForm = form([
    field('اسم المنتج', 'product-name', 'text', '', { required: '' }), field('الفئة', 'product-category', 'select', 'floor', { choices: Object.entries(CATEGORIES) }),
    field('الماركة', 'product-brand'), field('رمز المنتج SKU', 'product-sku'), field('سعر الوحدة بالريال', 'product-price', 'number', '', { min: 0, step: '.01', required: '' }),
    field('الوحدة', 'product-unit', 'select', 'م²', { choices: ['م²', 'م', 'عدد'].map(x => [x, x]) }), field('تغطية العبوة / عدد القطع', 'product-pack', 'number', 1, { min: .001, step: '.001' }),
    field('لون المنتج للمعاينة', 'product-color', 'color', '#d8d0c4'), field('خامة المعاينة الأقرب', 'product-preset', 'select', 'porcelainWarm', { choices: Object.entries(FLOOR_PRESETS).map(([k, v]) => [k, v.ar]) }),
    field('رابط المنتج لدى المورد', 'product-source', 'url'), field('تاريخ السعر', 'product-date', 'date', today()), field('ملاحظة المقاس / التشطيب', 'product-notes'),
  ], v => { state.products.push(validateProduct({ name: v['product-name'], category: v['product-category'], brand: v['product-brand'], sku: v['product-sku'], price: v['product-price'], unit: v['product-unit'], pack: v['product-pack'], color: v['product-color'], preset: v['product-preset'], source: v['product-source'], pricedAt: v['product-date'], notes: v['product-notes'] })); save(); render(); message('أضيف المنتج بسعره ومصدره.'); }, 'إضافة إلى مكتبتي');
  const list = h('div', { class: 'product-list' }, state.products.map(p => h('div', { class: 'product-row' }, h('span', { class: 'product-dot', style: 'background:' + p.color }), h('div', {}, h('strong', {}, p.name), h('small', {}, `${p.brand} · ${fmt(p.price)} ر.س / ${p.unit}`), p.source ? h('a', { href: p.source, target: '_blank', rel: 'noopener noreferrer' }, 'صفحة المورد') : h('small', {}, 'سعر أدخله العميل')), button('حذف', () => { state.products = state.products.filter(x => x.id !== p.id); state.selections = state.selections.filter(s => s.productId !== p.id); save(); render(); }, 'danger'))));
  const choose = form([field('الغرفة', 'finish-room', 'select', '', { choices: roomOptions() }), field('المنتج', 'finish-product', 'select', '', { choices: state.products.map(p => [p.id, p.name]) }), field('الهدر ٪', 'finish-waste', 'number', 8, { min: 0, max: 50, step: '.1' }), field('الكمية للقطع أو الكسوة', 'finish-quantity', 'number', '', { min: 0, step: '.01', placeholder: 'الأرضية تُحسب من المخطط' })], v => {
    requireDoc(); const p = state.products.find(p => p.id === v['finish-product']), room = rooms().find(r => r.key === v['finish-room']); if (!p || !room) throw Error('أضف منتجًا واختر غرفة أولًا.');
    const q = productTakeoff(p, room, { quantity: v['finish-quantity'] === '' ? null : Number(v['finish-quantity']), waste: v['finish-waste'] });
    state.selections = state.selections.filter(s => !(s.roomKey === room.key && state.products.find(x => x.id === s.productId)?.category === p.category));
    state.selections.push({ id: uid(), roomKey: room.key, productId: p.id, waste: Number(v['finish-waste']), quantity: q.quantity, basis: q.basis });
    writeDoc(applyProduct(currentDoc, p, room.key)); render(); message(['floor', 'wall'].includes(p.category) ? 'حُفظ التشطيب في المخطط وقائمة المشتريات؛ يمكنك معاينته ثلاثي الأبعاد.' : 'أضيف المنتج إلى قائمة المشتريات؛ شكل المنتج الفعلي يحتاج نموذج المورد ثلاثي الأبعاد.');
  }, 'اعتماد الاختيار للغرفة');
  const shopping = shoppingList(state, currentDoc), preview = h('div', { class: 'three-preview' });
  panel.append(heading('تشطيبات تختارها… ومشتريات تعرفها', 'أضف منتجات فعلية بروابط الموردين وأسعارها. الأرضيات تُحسب من مساحة الغرفة، والعبوات والهدر يدخلان في تكلفة الشراء. خامة المجسم تمثيل تقريبي للمنتج.'), grid(stack(card('مكتبتي من المنتجات', productForm, state.products.length ? list : empty('ابدأ بمنتج من موردك المفضل؛ لا توجد أسعار سوق مفترضة.')), card('قائمة المشتريات', shopping.lines.length ? table(['الغرفة والمنتج', 'الكمية والعبوات', 'التكلفة'], shopping.lines.map(l => [l.room + ' · ' + l.name + (l.stale ? ' — يلزم تحديث الغرفة' : ''), `${fmt(l.required)} ${l.unit} · ${l.packs} عبوة`, fmt(l.total) + ' ر.س'])) : empty('ستظهر مشترياتك بعد اختيار المنتجات للغرف.'), h('p', { class: 'summary' }, 'إجمالي المنتجات: ' + fmt(shopping.total) + ' ر.س'), h('p', { class: 'muted' }, 'لا يشمل التركيب أو الشحن أو ضريبة غير مدخلة في السعر. الخامات لا تغيّر أبعاد الغرف.'), actions(button('تنزيل قائمة المشتريات CSV', () => download('mizan-shopping.csv', csv(shopping.lines.map(l => ({ room: l.room, product: l.name, sku: l.sku, quantity: l.required, unit: l.unit, packs: l.packs, total: l.total, source: l.source, date: l.pricedAt })), ['room', 'product', 'sku', 'quantity', 'unit', 'packs', 'total', 'source', 'date']), 'text/csv;charset=utf-8'))))), stack(card('اختيار تشطيب الغرفة', currentDoc ? choose : empty('افتح مخططًا أو استورده لإظهار الغرف هنا.')), card('معاينة على مجسم مشروعك', preview, actions(button('تشغيل المعاينة', async () => {
    requireDoc(); const [{ loadThreeRuntime }, { DrawViewer }] = await Promise.all([import('../three-runtime.mjs'), import('../draw/viewer-draw.mjs')]); viewer?.dispose?.(); preview.replaceChildren(); viewer = new DrawViewer(preview, { THREE: await loadThreeRuntime(), detail: 'lite', maxPixelRatio: 1.5 }); viewer.setDoc(currentDoc); viewer.setMode('dollhouse');
  })), h('p', { class: 'muted' }, 'تُطبق خامات الأرضيات وألوان الدهان المعتمدة على الغرف نفسها.')))));
}

async function renderPdf(file, page = 1) {
  const pdfjs = await import(new URL('../vendor/pdfjs/pdf.mjs', import.meta.url).href); pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href, cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true, isEvalSupported: false }).promise;
  try { if (!Number.isInteger(page) || page < 1 || page > pdf.numPages) throw Error('رقم الصفحة غير موجود.'); const p = await pdf.getPage(page), base = p.getViewport({ scale: 1 }), viewport = p.getViewport({ scale: Math.min(2, 1800 / Math.max(base.width, base.height)) }), c = document.createElement('canvas'); c.width = Math.ceil(viewport.width); c.height = Math.ceil(viewport.height); await p.render({ canvasContext: c.getContext('2d'), viewport }).promise; const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png')); return { blob, count: pdf.numPages, width: c.width, height: c.height }; } finally { await pdf.destroy(); }
}
async function renderImport() {
  const source = state.imported;
  const fileUpload = upload('صورة مخطط أو ملف PDF', '.pdf,image/png,image/jpeg,image/webp', async ([file]) => {
    if (!file) return; if (file.size > 20_000_000) throw Error('الحد الأقصى 20 ميغابايت.');
    let blob = file, count = 1, width, height;
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) ({ blob, count, width, height } = await renderPdf(file)); else { const image = await decodedImage(file); width = image.width; height = image.height; image.close(); }
    await ensureAttachmentBudget([blob, file], [state.imported?.blobId, state.imported?.sourceBlobId]);
    const blobId = uid(), sourceBlobId = uid(); await putFile(blobId, blob); await putFile(sourceBlobId, file);
    state.imported = { blobId, sourceBlobId, name: file.name, width, height, page: 1, pages: count, points: [], scale: null, plan: { walls: [], openings: [], rooms: [], notes: [] }, reviewed: false }; save(); render();
  });
  panel.append(heading('حوّل مخططًا لديك إلى بداية قابلة للتعديل', 'ارفع المخطط، وعاير بُعدًا تعرفه، ثم تتبّع الجدران يدويًا أو استخرج مسودة بالذكاء. راجع الفتحات والأبعاد قبل فتحها في المرسم.'));
  if (!source) { panel.append(grid(card('المخطط الأصلي', fileUpload), card('كيف تبدأ؟', h('p', {}, 'اختر صورة واضحة أو صفحة PDF. بعد الرفع حدّد نقطتي بُعد معلوم، مثل طول واجهة أو غرفة، ثم أدخل قياسه الحقيقي. سيُستخدم هذا القياس لتحويل الإحداثيات إلى أمتار.'), h('p', { class: 'muted' }, 'الاستيراد ينتج مسودة قابلة للمراجعة، ولا يستنتج صحة القياسات من الصورة وحدها.')))); return; }
  const canvas = h('canvas', { class: 'plan-canvas', width: 1000, height: Math.round(1000 * source.height / source.width), 'aria-label': 'المخطط الأصلي مع خطوط التتبع', tabindex: 0 }), mode = field('أداة التتبع', 'trace-mode', 'select', 'calibrate', { choices: [['calibrate', 'معايرة: نقطتا بُعد معلوم'], ['wall', 'جدار: بداية ثم نهاية'], ['room', 'تسمية غرفة: نقطة داخلها'], ['door', 'باب: نقطة على جدار'], ['window', 'نافذة: نقطة على جدار']] });
  const draw = image => {
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3; ctx.strokeStyle = '#087a65';
    for (const w of source.plan.walls) { ctx.beginPath(); ctx.moveTo(w.a.x * canvas.width, w.a.y * canvas.height); ctx.lineTo(w.b.x * canvas.width, w.b.y * canvas.height); ctx.stroke(); }
    for (const o of source.plan.openings) { const w = source.plan.walls[o.wallIndex]; if (!w) continue; const p = { x: w.a.x + (w.b.x - w.a.x) * o.position, y: w.a.y + (w.b.y - w.a.y) * o.position }; ctx.fillStyle = o.kind === 'door' ? '#bc7317' : '#2678c1'; ctx.fillRect(p.x * canvas.width - 5, p.y * canvas.height - 5, 10, 10); }
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#125340'; for (const r of source.plan.rooms) ctx.fillText(r.name, r.center.x * canvas.width, r.center.y * canvas.height);
    for (const p of source.points || []) { ctx.fillStyle = '#cf3c3c'; ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2); ctx.fill(); }
    if (source.points?.length === 2) { ctx.strokeStyle = '#cf3c3c'; ctx.beginPath(); ctx.moveTo(source.points[0].x * canvas.width, source.points[0].y * canvas.height); ctx.lineTo(source.points[1].x * canvas.width, source.points[1].y * canvas.height); ctx.stroke(); }
  };
  const counts = h('p', { class: 'canvas-note' }, `الجدران: ${source.plan.walls.length} · الفتحات: ${source.plan.openings.length} · الغرف: ${source.plan.rooms.length}`);
  const review = h('input', { type: 'checkbox', checked: source.reviewed, onchange: e => { source.reviewed = e.target.checked; void run(save); } });
  const controls = stack(card('أدوات التتبع', mode, h('div', { class: 'form-grid' }, field('اسم الغرفة', 'trace-room-name', 'text', 'غرفة'), field('نوع الغرفة', 'trace-room-type', 'select', 'bedroom', { choices: [['bedroom', 'نوم'], ['master', 'رئيسية'], ['majlis', 'مجلس'], ['living', 'صالة'], ['kitchen', 'مطبخ'], ['dining', 'طعام'], ['bath', 'حمام'], ['corridor', 'ممر'], ['other', 'أخرى']] }), field('عرض الفتحة بالمتر', 'trace-opening-width', 'number', .9, { min: .3, step: '.05' })), counts, actions(button('التراجع عن آخر جدار', () => { const index = source.plan.walls.length - 1; source.plan.walls.pop(); source.plan.openings = source.plan.openings.filter(o => o.wallIndex !== index); source.reviewed = false; save(); render(); }, 'secondary'))), card('تثبيت المقياس', form([field('البعد الحقيقي بين النقطتين / م', 'known-length', 'number', source.knownLength || '', { min: .1, step: '.01', required: '' })], v => { source.scale = calibratedScale(source.points, v['known-length'], source.width, source.height); source.knownLength = Number(v['known-length']); source.reviewed = false; save(); render(); message('ثُبّت مقياس الرسم. قارن بُعدًا آخر مستقلًا قبل اعتماده.'); }, 'اعتماد المقياس'), h('p', { class: 'muted' }, source.scale ? `المقياس: ${source.scale.toFixed(5)} متر لكل بكسل من الصورة الأصلية.` : 'استخدم أداة المعايرة وحدّد نقطتين على الصورة.')), card('استخراج مسودة من الصورة', authField(), actions(button('تتبّع بالذكاء', async () => { const r = await vision('plan', [await imageForVision(await getFile(source.blobId))], 'استخرج المخطط في الصفحة الظاهرة فقط.'); if (state.imported !== source) throw Error('تغيّر الملف أثناء التحليل.'); source.plan = r; source.reviewed = false; save(); render(); message('اكتمل التتبع الأولي. راجع كل الجدران والفتحات والتسميات.'); })), ...(source.plan.notes || []).map(s => h('p', { class: 'muted' }, s))), card('فتح المخطط', h('label', { class: 'check-row' }, review, 'راجعت الجدران والفتحات والمقياس، وأتعامل معه كمسودة.'), actions(button('فتح النسخة في المرسم', () => { if (!source.scale || !source.reviewed) throw Error('عاير الرسم وأكّد مراجعة التتبع أولًا.'); const doc = vectorPlanToDoc(source.plan, { scale: source.scale, width: source.width, height: source.height, title: source.name }); source.doc = serialize(doc); writeDoc(doc, true); location.href = './studio.html'; })), h('p', { class: 'muted' }, 'يُحفظ المشروع الحالي في مشاريعي السابقة قبل فتح المخطط المستورد.')));
  panel.append(grid(stack(card(source.name, fileUpload, source.pages > 1 ? form([field(`الصفحة (من ${source.pages})`, 'pdf-page', 'number', source.page, { min: 1, max: source.pages })], async v => { const file = await getFile(source.sourceBlobId), r = await renderPdf(file, Number(v['pdf-page'])), id = uid(); await putFile(id, r.blob); Object.assign(source, { blobId: id, page: Number(v['pdf-page']), width: r.width, height: r.height, points: [], scale: null, plan: { walls: [], rooms: [], openings: [], notes: [] }, reviewed: false }); save(); render(); }, 'عرض الصفحة') : null, h('div', { class: 'canvas-wrap' }, canvas), h('p', { class: 'canvas-note' }, 'الأخضر: الجدران المتتبعة. الأحمر: البعد الذي ستعايره. النقر يضيف نقاط الأداة المحددة.'))), controls));
  const image = await decodedImage(await getFile(source.blobId)); draw(image); let first = null;
  canvas.addEventListener('click', e => run(() => {
    const box = canvas.getBoundingClientRect(), p = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }, action = $('trace-mode').value;
    if (action === 'calibrate') { if (source.points.length === 2) source.points = []; source.points.push(p); source.scale = null; }
    else if (action === 'wall') { const end = snapTracePoint(source.plan, p, canvas.width, canvas.height); if (!first) { first = end; message('حدّد نهاية الجدار. تُلتقط الزوايا القريبة لتوصيل الجدران.'); return; } if (Math.hypot((end.x - first.x) * canvas.width, (end.y - first.y) * canvas.height) < 3) throw Error('حدّد نهاية مختلفة للجدار.'); source.plan.walls.push({ a: first, b: end }); first = null; }
    else if (action === 'room') source.plan.rooms.push({ name: $('trace-room-name').value || 'غرفة', type: $('trace-room-type').value, center: p });
    else {
      if (!source.scale) throw Error('عاير المقياس قبل إضافة فتحة بعرض معلوم.');
      const candidates = source.plan.walls.map((w, wallIndex) => { const ax = w.a.x * source.width, ay = w.a.y * source.height, dx = (w.b.x - w.a.x) * source.width, dy = (w.b.y - w.a.y) * source.height, len2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((p.x * source.width - ax) * dx + (p.y * source.height - ay) * dy) / len2)); return { wallIndex, position: t, distance: Math.hypot(p.x * source.width - ax - t * dx, p.y * source.height - ay - t * dy), length: Math.sqrt(len2) }; }).sort((a, b) => a.distance - b.distance);
      const target = candidates[0]; if (!target || target.distance > source.width * .025) throw Error('انقر بالقرب من جدار متتبع.'); source.plan.openings.push({ wallIndex: target.wallIndex, kind: action, position: target.position, widthFraction: Number($('trace-opening-width').value) / (target.length * source.scale) });
    }
    source.reviewed = false; review.checked = false; save(); draw(image); counts.textContent = `الجدران: ${source.plan.walls.length} · الفتحات: ${source.plan.openings.length} · الغرف: ${source.plan.rooms.length} · نقاط المعايرة: ${source.points.length}`;
  }));
  mode.querySelector('select').addEventListener('change', () => { first = null; message(''); });
  counts.after(h('p', { class: 'muted' }, 'السماكة الأولية للجدران 20 سم، وارتفاع الدور 3.2 م. راجع هذه القيم وعدّلها في المرسم وفق مخططك.'));
  canvas.dataset.ready = 'true';
}

function drawPlan(canvas, doc, diff = null, onWall = null) {
  const ctx = canvas.getContext('2d'), all = [...doc.walls, ...(diff?.removed || [])]; if (!all.length) return;
  const xs = all.flatMap(w => [w.a.x, w.b.x]), ys = all.flatMap(w => [w.a.y, w.b.y]); const minX = Math.min(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), scale = Math.min((canvas.width - 70) / Math.max(.1, Math.max(...xs) - minX), (canvas.height - 70) / Math.max(.1, maxY - minY));
  const point = p => ({ x: 35 + (p.x - minX) * scale, y: 35 + (maxY - p.y) * scale });
  ctx.fillStyle = '#fcfdfb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const walls = [...doc.walls.map(w => ({ w, status: diff?.added.some(a => a.id === w.id) ? 'added' : 'kept' })), ...(diff?.removed || []).map(w => ({ w, status: 'removed' }))];
  for (const { w, status } of walls) { const a = point(w.a), b = point(w.b); ctx.strokeStyle = status === 'added' ? '#15825a' : status === 'removed' ? '#c85045' : '#637367'; ctx.lineWidth = Math.max(2, w.t * scale); ctx.setLineDash(status === 'removed' ? [10, 6] : []); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.setLineDash([]); ctx.fillStyle = '#214438'; ctx.font = '17px sans-serif'; ctx.textAlign = 'center'; for (const r of doc.labels) { const p = point(r.seed); ctx.fillText(r.name, p.x, p.y); }
  if (onWall) canvas.onclick = e => { const r = canvas.getBoundingClientRect(), p = { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; const nearest = doc.walls.map(w => { const a = point(w.a), b = point(w.b), dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); return { w, d: Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) }; }).sort((a, b) => a.d - b.d)[0]; if (nearest?.d < 20) onWall(nearest.w); };
}
function renderRenovation() {
  panel.append(heading('الوضع الحالي… والتغيير المقترح', 'احفظ نسخة أساس من المنزل، ثم ميّز ما سيبقى وما سيُزال وما سيُضاف. تظهر كميات الجدران من الهندسة، مع الحفاظ على النسخة الأصلية.'));
  if (!state.renovation) { panel.append(card('بدء مشروع ترميم', h('p', {}, 'افتح مخطط المنزل الحالي في المرسم أو استورده، ثم ثبّته كأساس للمقارنة.'), actions(button('استخدام المخطط الحالي كأساس', () => { const doc = serialize(requireDoc()); state.renovation = { baseline: doc, proposed: doc, structuralReviewed: false }; save(); render(); })))); return; }
  const r = state.renovation, base = parseDoc(r.baseline), proposed = parseDoc(r.proposed), diff = renovationDiff(base, proposed), canvas = h('canvas', { width: 1000, height: 680, class: 'plan-canvas', 'aria-label': 'مخطط الترميم بالألوان' }), selected = field('الجدار المطلوب إزالته', 'demo-wall', 'select', '', { choices: proposed.walls.map(w => [w.id, w.id + ' · ' + fmt(Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y)) + ' م']) });
  const confirm = h('input', { type: 'checkbox', checked: r.structuralReviewed, onchange: e => { r.structuralReviewed = e.target.checked; void run(save); } });
  panel.append(h('div', { class: 'stat-grid' }, [['المباني المقترح إزالتها / م²', diff.demolitionArea], ['المباني الجديدة / م²', diff.newWallArea], ['الجدران الباقية', diff.kept]].map(([label, value]) => h('div', { class: 'stat' }, h('strong', {}, fmt(value)), h('small', {}, label)))), grid(stack(card('مخطط المقارنة', h('div', { class: 'legend' }, [['#637367', 'باقٍ'], ['#c85045', 'إزالة'], ['#15825a', 'جديد']].map(([color, label]) => h('span', { style: '--legend:' + color }, label))), h('div', { class: 'canvas-wrap' }, canvas)), card('حفظ المقترح', actions(button('تنزيل مقارنة الترميم', () => download('mizan-renovation.json', JSON.stringify({ ...r, quantities: { demolitionArea: diff.demolitionArea, newWallArea: diff.newWallArea } }, null, 2))), button('فتح المقترح في المرسم', () => { writeDoc(proposed, true); location.href = './studio.html'; }, 'secondary')), h('p', { class: 'muted' }, 'عند العودة من المرسم استخدم «تحديث المقترح من المرسم» لإعادة المقارنة.'))), stack(card('مراجعة إزالة الجدران', h('p', { class: 'readonly-note' }, 'هذه مقارنة أعمال مقترحة. لا يستنتج الموقع الجدران الحاملة من الصورة أو السمك. يظل السلم والأعمدة خارج أداة الإزالة.'), h('label', { class: 'check-row' }, confirm, 'حددت الجدران القابلة للإزالة من بيانات ومراجعة إنشائية مناسبة.'), selected, actions(button('إزالة الجدار من المقترح', () => { if (!r.structuralReviewed) throw Error('حدّد الجدران القابلة للإزالة بعد مراجعتها إنشائيًا.'); const wall = proposed.walls.find(w => w.id === $('demo-wall').value); if (!wall) throw Error('اختر جدارًا.'); r.proposed = serialize(applyCommand(proposed, { type: 'delete', ids: [wall.id] }).doc); save(); render(); }, 'danger'), button('إعادة المقترح إلى الأساس', () => { if (!confirmDialog('سيُعاد مقترح الترميم إلى نسخة الأساس.')) return; r.proposed = r.baseline; save(); render(); }, 'secondary'))), card('إضافة جدار جديد', form([field('الدور', 'new-wall-level', 'select', proposed.levels[0].id, { choices: proposed.levels.map(l => [l.id, l.name]) }), field('السماكة / م', 'new-wall-t', 'number', .2, { min: .05, max: 1, step: '.01' }), ...['x1', 'y1', 'x2', 'y2'].map(k => field(k + ' / م', 'new-wall-' + k, 'number', '', { step: '.01', required: '' }))], v => { r.proposed = serialize(applyCommand(proposed, { type: 'add-wall', level: v['new-wall-level'], a: { x: Number(v['new-wall-x1']), y: Number(v['new-wall-y1']) }, b: { x: Number(v['new-wall-x2']), y: Number(v['new-wall-y2']) }, t: Number(v['new-wall-t']) }).doc); save(); render(); }, 'إضافة الجدار')), card('مقارنة نسخة المرسم', actions(button('تحديث المقترح من المرسم', () => { const doc = requireDoc(); if (!confirmDialog('استخدام المخطط الحالي كمقترح الترميم مع إبقاء الأساس؟')) return; r.proposed = serialize(doc); save(); render(); }, 'secondary'))))));
  const levels = [...new Map([...base.levels, ...proposed.levels].map(l => [l.id, l])).values()], visible = r.previewLevel || levels[0].id;
  const floor = field('الدور المعروض', 'renovation-level', 'select', visible, { choices: levels.map(l => [l.id, l.name]) });
  floor.querySelector('select').onchange = e => { r.previewLevel = e.target.value; void run(() => { save(); render(); }); };
  panel.querySelector('.legend').before(floor);
  drawPlan(canvas, { ...proposed, walls: proposed.walls.filter(w => w.level === visible), labels: proposed.labels.filter(l => l.level === visible) }, { ...diff, removed: diff.removed.filter(w => w.level === visible), added: diff.added.filter(w => w.level === visible) }, w => { $('demo-wall').value = w.id; message('اختير الجدار ' + w.id + '.'); });
}
function confirmDialog(text) { return window.confirm(text); }

function renderTenders() {
  const comparisons = compareOffers(state.boq, state.offers);
  panel.append(heading('قارن العروض على نطاق واحد', 'وحّد رموز البنود والوحدات والكميات أولًا. تظهر قيمة كل عرض كما وردت، ثم قيمته على كمياتك المرجعية، مع البنود الناقصة والفروقات.'), grid(stack(card('جدول الكميات المرجعي', actions(button('جلب الكميات من المخطط', () => { const rows = quantityReference(requireDoc()); if (!rows.length) throw Error('لم تُستخرج كميات من المخطط.'); if (state.boq.length && !confirmDialog('استبدال المرجع الحالي بكميات المخطط؟')) return; state.boq = rows; save(); render(); }), button('تنزيل قالب CSV', () => { const rows = state.boq.length ? state.boq : [{ code: 'WALL-01', name: 'مبانٍ حسب نطاقك', unit: 'م²', quantity: '', rate: '' }]; download('mizan-tender-template.csv', csv(rows), 'text/csv;charset=utf-8'); }, 'secondary')), state.boq.length ? table(['الرمز والبند', 'الكمية', 'الوحدة', ''], state.boq.map(i => [i.code + ' · ' + i.name, fmt(i.quantity), i.unit, h('div', { class: 'actions' }, button('تعديل', () => editReferenceItem(i), 'secondary'), button('حذف', () => { state.boq = state.boq.filter(x => x.id !== i.id); save(); render(); }, 'danger'))])) : empty('أضف بنود نطاقك أو اجلب الكميات المتاحة من المخطط.'), form([field('رمز البند', 'boq-code', 'text', '', { required: '' }), field('الوصف', 'boq-name', 'text', '', { required: '' }), field('الوحدة', 'boq-unit', 'text', 'م²', { required: '' }), field('الكمية', 'boq-qty', 'number', '', { min: 0, step: '.001', required: '' })], v => { const i = validateBoqItem({ code: v['boq-code'], name: v['boq-name'], unit: v['boq-unit'], quantity: v['boq-qty'] }); if (state.boq.some(x => x.code === i.code)) throw Error('رمز البند مستخدم بالفعل.'); state.boq.push(i); save(); render(); }, 'إضافة بند')), card('العروض المقارنة', comparisons.length ? table(['المقاول', 'إجمالي العرض', 'على كميات المرجع', 'التغطية'], comparisons.map(c => [c.name, fmt(c.total) + ' ر.س', fmt(c.comparableTotal) + ' ر.س', h('span', { class: 'pill' + (c.complete ? '' : ' warn') }, c.complete ? 'بنود المرجع مسعّرة' : 'عرض غير مكتمل')])) : empty('ارفع عرضين أو أكثر للمقارنة.'), ...comparisons.map(c => h('div', { class: 'offer-detail' }, h('strong', {}, c.name), h('p', {}, 'بنود ناقصة أو غير مسعرة: ' + (c.missing.join('، ') || 'لا يوجد')), ...c.mismatches.map(m => h('p', {}, `${m.code}: ${m.kind === 'unit' ? 'اختلاف وحدة' : 'اختلاف كمية'} — ${m.detail}`)), h('p', {}, 'بنود خارج المرجع: ' + (c.extras.map(i => i.code).join('، ') || 'لا يوجد')), actions(button('حذف العرض', () => { state.offers = state.offers.filter(o => o.id !== c.id); save(); render(); }, 'danger')))), h('p', { class: 'muted' }, 'الأسعار كما أدخلها أصحاب العروض؛ وحّد الضريبة والتركيب والشحن والاستثناءات قبل الحكم. إجمالي المقارنة الناقص ليس سعرًا كاملًا للمشروع.'))), stack(card('إضافة عرض مقاول', field('اسم المقاول / العرض', 'offer-name'), field('الاستثناءات والضريبة والتركيب وصلاحية العرض', 'offer-notes', 'textarea'), upload('ارفع ملف عرض CSV', '.csv,text/csv', async ([file]) => { if (!file || file.size > 2_000_000) throw Error('اختر ملف CSV حتى 2 ميغابايت.'); const name = $('offer-name').value.trim(); if (!name) throw Error('أدخل اسم المقاول أولًا.'); const items = importOfferCsv(await file.text()); if (!items.length) throw Error('العرض لا يحتوي بنودًا.'); state.offers.push({ id: uid(), name, notes: $('offer-notes').value.slice(0, 2000), items }); save(); render(); message('حُفظ العرض وأعيدت المقارنة.'); }), h('p', { class: 'muted' }, 'الأعمدة: code,name,unit,quantity,rate. استخدم القالب ليطابق كل مقاول البنود نفسها.')), card('حفظ تقرير المقارنة', actions(button('تنزيل التقرير', () => download('mizan-tender-comparison.json', JSON.stringify({ reference: state.boq, offers: state.offers, comparison: comparisons }, null, 2))), button('طباعة المقارنة', () => print(), 'secondary'))))));
}

function appendTenderDetails() {
  if (!state.offers.length || !state.boq.length) return;
  const headers = ['البند وكمية المرجع', ...state.offers.map(o => o.name)];
  const rows = state.boq.map(item => {
    const prices = state.offers.map(offer => {
      const line = offer.items.find(i => i.code === item.code);
      if (!line) return h('span', { class: 'pill warn' }, 'غير وارد');
      if (line.unit !== item.unit) return h('span', { class: 'pill warn' }, 'وحدة مختلفة: ' + line.unit);
      if (line.rate === null) return h('span', { class: 'pill warn' }, 'غير مسعّر');
      return h('div', {}, h('strong', {}, fmt(line.rate) + ' ر.س / ' + line.unit), h('small', { class: 'muted' }, 'الكمية المعروضة: ' + fmt(line.quantity)));
    });
    return [item.name + ' · ' + fmt(item.quantity) + ' ' + item.unit, ...prices];
  });
  const notes = state.offers.filter(o => o.notes).map(o => h('p', { class: 'offer-detail' }, h('strong', {}, o.name + ' — استثناءات وشروط: '), o.notes));
  panel.append(card('مقارنة سعر كل بند', table(headers, rows), ...notes));
}
function editReferenceItem(item) {
  const dialog = h('dialog', { class: 'tool-card' }, h('h3', {}, 'تعديل البند المرجعي'), form([field('رمز البند', 'edit-boq-code', 'text', item.code, { readonly: '' }), field('الوصف', 'edit-boq-name', 'text', item.name, { required: '' }), field('الوحدة', 'edit-boq-unit', 'text', item.unit, { required: '' }), field('الكمية', 'edit-boq-qty', 'number', item.quantity, { min: 0, step: '.001', required: '' })], values => { const next = validateBoqItem({ ...item, name: values['edit-boq-name'], unit: values['edit-boq-unit'], quantity: values['edit-boq-qty'] }); Object.assign(item, next); save(); dialog.close(); dialog.remove(); render(); }, 'حفظ البند'), actions(button('إغلاق', () => { dialog.close(); dialog.remove(); }, 'secondary')));
  document.body.append(dialog); dialog.showModal();
}
async function renderExecution() {
  const stats = executionSummary(state), statusNames = { planned: 'لم يبدأ', active: 'جارٍ التنفيذ', submitted: 'جاهز للفحص', accepted: 'مستلم', blocked: 'متوقف' }, taskList = h('div');
  const taskForm = form([field('العمل / المرحلة', 'task-title', 'text', '', { required: '' }), field('المسؤول', 'task-owner'), field('الموقع', 'task-room', 'select', '', { choices: [['', 'المشروع كاملًا'], ...roomOptions()] }), field('قيمة الأعمال / ر.س', 'task-budget', 'number', 0, { min: 0, step: '.01' }), field('البداية', 'task-start', 'date'), field('النهاية المخططة', 'task-end', 'date')], v => { state.tasks.push(validateTask({ title: v['task-title'], owner: v['task-owner'], roomKey: v['task-room'], budget: v['task-budget'], start: v['task-start'], end: v['task-end'], status: 'planned' })); save(); render(); }, 'إضافة العمل');
  panel.append(heading('من الأعمال المخططة إلى الاستلام', 'اربط كل عمل بموقعه ومسؤوله وصوره، ثم سجّل الفحص والاستلام والدفعات. نسبة الإنجاز محسوبة من الأعمال المستلمة، وليست تقديرًا تلقائيًا من الصور.'), h('div', { class: 'stat-grid' }, [['نسبة الاستلام', stats.progress + '٪'], ['ميزانية الأعمال', fmt(stats.budget) + ' ر.س'], ['الدفعات المسجلة', fmt(stats.paid) + ' ر.س']].map(([label, value]) => h('div', { class: 'stat' }, h('strong', {}, value), h('small', {}, label)))), h('div', { class: 'progress-track' }, h('span', { style: `width:${stats.progress}%` })), h('p', { class: 'muted' }, stats.basis), grid(stack(card('الأعمال وملاحظات الاستلام', state.tasks.length ? taskList : empty('أضف أول عمل لتبدأ المتابعة.')), card('سجل الدفعات', state.payments.length ? table(['العمل', 'المبلغ', 'التاريخ', 'ملاحظة'], state.payments.map(p => [state.tasks.find(t => t.id === p.taskId)?.title || 'عمل محذوف', fmt(p.amount) + ' ر.س', p.date, p.note])) : empty('لا توجد دفعات مسجلة.'))), stack(card('عمل جديد', taskForm), card('تسجيل دفعة على عمل مستلم', form([field('العمل المستلم', 'payment-task', 'select', '', { choices: state.tasks.filter(t => t.status === 'accepted').map(t => [t.id, t.title]) }), field('المبلغ / ر.س', 'payment-amount', 'number', '', { min: .01, step: '.01', required: '' }), field('التاريخ', 'payment-date', 'date', today()), field('ملاحظة / رقم السند', 'payment-note')], v => { state.payments.push(addPayment(state, { taskId: v['payment-task'], amount: v['payment-amount'], date: v['payment-date'], note: v['payment-note'] })); save(); render(); }, 'تسجيل الدفعة'), h('p', { class: 'muted' }, 'تسجيل محاسبي داخل المشروع؛ لا تُحوَّل أموال عبر الموقع.')), card('تقرير المتابعة', actions(button('تنزيل التقرير', () => download('mizan-execution.json', JSON.stringify({ summary: stats, tasks: state.tasks, payments: state.payments }, null, 2))))))));
  const generation = rendering;
  for (const task of state.tasks) {
    const photos = h('div', { class: 'photo-strip' }), taskCard = h('article', { class: 'task-card' }, h('header', {}, h('div', {}, h('h3', {}, task.title), h('small', { class: 'muted' }, [task.owner, rooms().find(r => r.key === task.roomKey)?.name, task.end ? 'الموعد: ' + task.end : ''].filter(Boolean).join(' · '))), h('span', { class: 'pill' }, statusNames[task.status])), form([field('المسؤول', 'owner-' + task.id, 'text', task.owner), field('ميزانية العمل / ر.س', 'budget-' + task.id, 'number', task.budget, { min: 0, step: '.01' }), field('البداية', 'start-' + task.id, 'date', task.start), field('النهاية', 'end-' + task.id, 'date', task.end), field('الحالة', 'status-' + task.id, 'select', task.status, { choices: Object.entries(statusNames) }), field('ملاحظة الفحص / الاستلام', 'note-' + task.id, 'textarea', task.acceptanceNote || task.notes, { wide: true })], v => { const status = v['status-' + task.id], note = v['note-' + task.id]; if (task.status === 'accepted' && state.payments.some(p => p.taskId === task.id) && status !== 'accepted') throw Error('يوجد سجل دفعات لهذا الاستلام؛ احتفظ بالاستلام وسجّل الملاحظة بدل إلغائه.'); if (Number(v['budget-' + task.id]) < state.payments.filter(p => p.taskId === task.id).reduce((sum, p) => sum + p.amount, 0)) throw Error('ميزانية العمل أقل من دفعاته المسجلة.'); Object.assign(task, validateTask({ ...task, owner: v['owner-' + task.id], budget: v['budget-' + task.id], start: v['start-' + task.id], end: v['end-' + task.id], status, notes: note, acceptanceNote: status === 'accepted' ? note : '', acceptedAt: status === 'accepted' ? today() : '' })); save(); render(); }, 'حفظ الحالة والفحص'), photos, upload('إضافة صور للعمل', 'image/png,image/jpeg,image/webp', async files => { if (task.photos.length + files.length > 20) throw Error('الحد الأقصى 20 صورة لكل عمل.'); for (const file of files) { const prepared = await compressedImage(file); await ensureAttachmentBudget([prepared]); const blobId = uid(); await putFile(blobId, prepared); task.photos.push({ blobId, name: file.name }); save(); } render(); }, true)); taskList.append(taskCard);
    for (const p of task.photos) { const url = await blobUrl(p.blobId); if (generation === rendering) photos.append(h('div', {}, h('a', { href: url, target: '_blank', rel: 'noopener' }, h('img', { src: url, alt: p.name, loading: 'lazy' })), button('حذف الصورة', () => { task.photos = task.photos.filter(photo => photo.blobId !== p.blobId); save(); render(); }, 'secondary'))); }
  }
}

function assetIds(workspace) { return [...new Set([...workspace.mood.items.map(i => i.blobId), ...workspace.tasks.flatMap(t => t.photos.map(p => p.blobId)), workspace.imported?.blobId, workspace.imported?.sourceBlobId].filter(Boolean))]; }
async function ensureAttachmentBudget(blobs, exclude = []) {
  let bytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
  for (const id of assetIds(state).filter(id => !exclude.includes(id))) bytes += (await getFile(id))?.size || 0;
  if (bytes > 45_000_000) throw Error('بلغت مرفقات المشروع حد 45 ميغابايت. نزّل نسخة احتياطية واحذف المرفقات غير المطلوبة قبل الإضافة.');
}
$('export-backup').onclick = () => run(async () => {
  if (fatal) { download('mizan-tools-recovery.json', lastSavedRaw || '{}'); return; }
  const assets = []; for (const id of assetIds(state)) { const file = await getFile(id); if (!file) throw Error('يوجد ملف مرفق مفقود؛ لا يمكن إنشاء نسخة كاملة.'); assets.push({ id, data: await dataUrl(file) }); }
  download('mizan-tools-backup.json', JSON.stringify({ schema: 'mizan-tools-backup/1', workspace: state, document: currentDoc ? serialize(currentDoc) : null, assets })); message('نُزّلت نسخة تشمل بيانات الأدوات والملفات والمخطط المفتوح.');
});
$('import-backup').onchange = e => run(async () => {
  const file = e.target.files[0]; if (!file || file.size > 80_000_000) throw Error('اختر نسخة احتياطية حتى 80 ميغابايت.');
  const raw = JSON.parse(await file.text()); if (raw.schema !== 'mizan-tools-backup/1' || !Array.isArray(raw.assets) || raw.assets.length > 500) throw Error('ملف النسخة الاحتياطية غير معروف.');
  const workspace = validateWorkspace(raw.workspace), doc = raw.document ? parseDoc(raw.document) : null;
  const assets = new Map(); for (const item of raw.assets) { if (!item || typeof item.id !== 'string' || typeof item.data !== 'string' || item.data.length > 30_000_000 || !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/]+=*$/.test(item.data)) throw Error('مرفق غير صالح في النسخة الاحتياطية.'); assets.set(item.id, await (await fetch(item.data)).blob()); }
  if (assetIds(workspace).some(id => !assets.has(id))) throw Error('النسخة لا تشمل كل المرفقات.');
  if (!confirmDialog('استعادة ملف الأدوات والمخطط المرفق؟ يُحفظ المشروع الحالي في مشاريعي السابقة أولًا.')) return;
  const before = state; if (currentDoc && !archiveCurrent(localStorage)) throw Error('تعذر حفظ المشروع الحالي.');
  const ids = new Map(); for (const [id, blob] of assets) { const next = uid(); await putFile(next, blob); ids.set(id, next); }
  let text = JSON.stringify(workspace); for (const [a, b] of ids) text = text.replaceAll(a, b); state = validateWorkspace(JSON.parse(text)); state.id = uid();
  try { if (doc) writeDoc(doc, true); else save(); } catch (e) { state = before; throw e; }
  updateProjectStrip(); render(); message('استُعيدت الأدوات ومرفقاتها.');
});
$('print-workspace').onclick = () => print();
for (const [i, id] of TOOL_IDS.entries()) $('tools-tabs').append(h('button', { id: 'tab-' + id, type: 'button', role: 'tab', 'aria-controls': 'tool-panel', 'data-tool': id, onclick: () => navigate(id) }, labels[i]));
$('tools-tabs').onkeydown = e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const i = TOOL_IDS.indexOf(active), next = e.key === 'Home' ? 0 : e.key === 'End' ? 5 : (i + (e.key === 'ArrowLeft' ? 1 : -1) + 6) % 6; navigate(TOOL_IDS[next]); $('tab-' + active).focus(); };
window.addEventListener('hashchange', () => { if (TOOL_IDS.includes(location.hash.slice(1))) navigate(location.hash.slice(1)); });
window.addEventListener('storage', e => { if (e.key === TOOLS_KEY) message('تغيّر ملف الأدوات في تبويب آخر. حدّث الصفحة قبل المتابعة لتجنب استبدال تعديلاتك.', true); });
try { state = loadWorkspace(localStorage); currentDoc = readCurrentDoc(localStorage); touchVisit(sessionStorage); save(); updateProjectStrip(); render(); } catch (e) { fatal = true; state = newWorkspace(); currentDoc = null; for (const b of $('tools-tabs').children) b.disabled = true; message('تعذر قراءة بيانات المشروع. نزّل النسخة المحفوظة قبل إجراء تعديلات: ' + e.message, true); panel.append(empty('تعذر فتح بيانات الأدوات.')); }
void fetch('/api/client-tools/status', { cache: 'no-store' }).then(r => r.json()).then(r => { available = r.available === true; if (available && active === 'mood') { const hint = [...panel.querySelectorAll('p')].find(p => p.textContent.includes('التحليل غير متاح الآن')); if (hint) hint.textContent = 'تُستخدم خدمة Claude الموجودة في الموقع.'; } }).catch(() => {});
