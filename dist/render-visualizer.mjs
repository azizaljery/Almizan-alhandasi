/* الميزان الهندسي — العرض البصري المعماري
 * الواجهة لا تحمل مفتاح OpenAI. الطلب يمر عبر Worker مستقل محمي.
 */

import { buildPlanSVG } from './plan-view.mjs';

const IMAGE_WORKER_URL = globalThis.MIZAN_IMAGE_WORKER_URL || 'https://mizan-images.aljeryabod.workers.dev';
const MAX_GALLERY_ITEMS = 20;
const GALLERY_STORAGE_KEY = 'mizan_gallery_v1';
const ACCESS_CODE_KEY = 'mizan_image_access_code';

const STYLE_DESCRIPTORS = {
  resort: ['resort-style Saudi Arabian villa', 'terracotta and limestone, shaded verandas, native palms and a calm garden', 'warm, hospitable and serene'],
  modern: ['contemporary minimalist Saudi Arabian villa', 'clean white volumes, controlled glazing, stone accents and precise geometric massing', 'calm, elegant and architectural'],
  classic: ['neoclassical Saudi Arabian luxury villa', 'balanced stone facade, restrained cornices, arched openings and a dignified entrance', 'stately, luxurious and timeless'],
  hijazi: ['traditional Hejazi Saudi Arabian villa', 'coral-toned stone, timber rawashin screens, carved doors and shaded openings', 'heritage, warm and authentic'],
};
const STRUCTURES = { L: 'an L-shaped footprint around a private garden', U: 'a U-shaped footprint embracing a central courtyard', block: 'a compact rectangular massing', split: 'two pavilions linked by a shaded walkway' };
const LIGHTS = { golden: 'golden-hour light with warm long shadows', morning: 'soft morning light and a clear sky', midday: 'bright midday light with crisp shadows', dusk: 'blue-hour dusk with warm interior lights', night: 'a night scene with warm interior and garden lighting' };
const VIEWS = { hero: 'a dramatic three-quarter street-level view', aerial: 'a 45-degree aerial view', entry: 'an eye-level frontal view of the main entrance', courtyard: 'a view from inside the courtyard looking outward', corner: 'a corner view showing two facades' };

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readGallery = () => { try { const value = JSON.parse(localStorage.getItem(GALLERY_STORAGE_KEY) || '[]'); return Array.isArray(value) ? value.slice(-MAX_GALLERY_ITEMS) : []; } catch { return []; } };
const writeGallery = value => { try { localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(value.slice(-MAX_GALLERY_ITEMS))); } catch { /* local storage is optional */ } };

export function buildDallePrompt(model, options = {}) {
  const style = STYLE_DESCRIPTORS[options.style || 'resort'] || STYLE_DESCRIPTORS.resort;
  const structure = STRUCTURES[options.structure || 'block'] || STRUCTURES.block;
  const lighting = LIGHTS[options.timeLighting || 'golden'] || LIGHTS.golden;
  const view = VIEWS[options.viewAngle || 'hero'] || VIEWS.hero;
  const plot = model?.plot;
  const building = model?.building;
  const plotText = plot?.width && plot?.length ? `on a ${Math.round(plot.width)} by ${Math.round(plot.length)} metre plot` : 'on a Saudi residential plot';
  const footprintText = building?.w && building?.h ? `The generated building footprint is approximately ${Math.round(building.w * building.h)} square metres.` : '';
  const rooms = Array.isArray(model?.program) ? model.program.slice(0, 30).map(room => room.name).filter(Boolean) : [];
  const roomText = rooms.length ? `The brief includes exactly these spaces: ${rooms.join(', ')}; express privacy and clear guest, family and service circulation without adding text.` : '';
  const geometryRooms = Array.isArray(model?.rooms)
    ? model.rooms.slice(0, 30).map((room, index) => {
      const name = String(room.name || `room-${index + 1}`).replace(/[<>]/g, '');
      const x = Number(room.x || 0).toFixed(1);
      const y = Number(room.y || 0).toFixed(1);
      const w = Number(room.w || 0).toFixed(1);
      const h = Number(room.h || 0).toFixed(1);
      return `${name}[x=${x},y=${y},w=${w},h=${h}]`;
    }).join('; ')
    : '';
  const geometryText = geometryRooms
    ? `AUTHORITATIVE PLAN GEOMETRY (metres): ${geometryRooms}. Preserve this relative arrangement and proportions exactly. Do not add, remove, merge, rotate, mirror, or relocate rooms.`
    : '';
  return [
    `Professional architectural visualization of the EXISTING Mizan engineering plan, not a new design, of ${style[0]} ${plotText}.`,
    `${structure}.`, `Materials and features: ${style[1]}.`, footprintText, roomText, geometryText,
    'The supplied plan image is authoritative. Keep the same footprint, room count, room adjacency, entrance side, openings, and circulation. This is a visual interpretation of the supplied plan, not a new floor plan; never substitute a generic villa or random facade.',
    `Mood: ${style[2]}. Lighting: ${lighting}. Camera: ${view}, 35mm lens, f/8, ultra detailed.`,
    'Saudi Arabian arid climate, native planting, realistic proportions, photorealistic architectural photography, no people, no text, no logos, no watermark.'
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function planReferenceImage(model) {
  if (!model) return null;
  const svg = buildPlanSVG(model);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(Error('تعذّر تجهيز صورة المخطط المرجعية.'));
      element.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (!context) throw Error('تعذّر تجهيز لوحة صورة المخطط.');
    context.fillStyle = '#f8f7f1';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min((canvas.width - 96) / image.width, (canvas.height - 96) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function requestImage(prompt, accessCode, options = {}) {
  if (IMAGE_WORKER_URL.includes('YOUR-SUBDOMAIN')) throw Error('خدمة الصور لم تُربط بعد. أضف رابط Worker الصور في إعدادات المشروع.');
  if (!accessCode || accessCode.length < 4) throw Error('أدخل رمز دخول الصور أولاً.');
  const allowedSizes = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
  const requestedSize = allowedSizes.includes(options.size) ? options.size : '1536x1024';
  const requestedQuality = options.quality === 'standard' ? 'standard' : 'hd';
  const body = { prompt, quality: requestedQuality, size: requestedSize, style: options.apiStyle || 'natural' };
  if (options.referenceImage) body.reference_image = options.referenceImage;
  const response = await fetch(IMAGE_WORKER_URL, {
    method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Mizan-Access-Code': accessCode },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  let data = null; try { data = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw Error(data?.error || 'فشل توليد الصورة المعمارية.');
  if (!data?.url || typeof data.url !== 'string') throw Error('لم تُعد خدمة الصور رابطًا صالحًا.');
  return data;
}

const labels = { resort: 'منتجع', modern: 'مودرن', classic: 'كلاسيكي', hijazi: 'حجازي', golden: 'ذهبي', morning: 'صباح', midday: 'ظهيرة', dusk: 'غروب', night: 'ليل', hero: 'زاوية 3/4', aerial: 'جوي', entry: 'واجهة', courtyard: 'فناء', corner: 'زاوية' };
const styleLabel = options => [options.style, options.timeLighting, options.viewAngle].map(key => labels[key] || '').filter(Boolean).join(' · ');

function renderGallery() {
  const root = document.getElementById('renderGallery'); if (!root) return;
  const items = [...vizState.gallery].reverse();
  if (!items.length) { root.innerHTML = '<div class="render-empty"><div aria-hidden="true">▧</div><p>لم تُولّد صورة بعد</p><small>ولّد المخطط أولاً ثم اختر الطراز والإضاءة وزاوية الكاميرا.</small></div>'; return; }
  root.innerHTML = items.map((item, index) => `<article class="render-item ${index === 0 ? 'render-latest' : ''}"><div class="render-image-wrap"><img class="render-image" loading="lazy" src="${esc(item.url)}" alt="${esc(item.styleLabel || 'تصور معماري')}"/><span class="render-badge">${index === 0 ? 'الأحدث' : 'تصور'}</span><div class="render-actions"><button class="render-action" data-action="view" data-url="${esc(item.url)}" type="button">عرض</button><button class="render-action" data-action="download" data-url="${esc(item.url)}" type="button">تنزيل</button><button class="render-action render-delete" data-action="delete" data-id="${esc(item.id)}" type="button">حذف</button></div></div><div class="render-meta"><span class="render-style">${esc(item.styleLabel)}</span><time class="render-date">${esc(new Date(item.generated_at).toLocaleString('ar-SA'))}</time></div></article>`).join('');
  root.querySelectorAll('.render-action').forEach(button => button.addEventListener('click', handleGalleryAction));
}

function openViewer(url) {
  let viewer = document.getElementById('renderViewer');
  if (!viewer) { viewer = document.createElement('div'); viewer.id = 'renderViewer'; viewer.className = 'render-viewer'; viewer.innerHTML = '<button type="button" class="render-viewer-close" aria-label="إغلاق">×</button><img alt="تصور معماري"/>'; document.body.appendChild(viewer); viewer.addEventListener('click', event => { if (event.target === viewer || event.target.closest('.render-viewer-close')) viewer.classList.remove('show'); }); }
  viewer.querySelector('img').src = url; viewer.classList.add('show');
}
async function downloadImage(url) { try { const response = await fetch(url); const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `mizan-render-${Date.now()}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); } catch { window.open(url, '_blank', 'noopener'); } }
function handleGalleryAction(event) { const button = event.currentTarget; if (button.dataset.action === 'view') openViewer(button.dataset.url); if (button.dataset.action === 'download') void downloadImage(button.dataset.url); if (button.dataset.action === 'delete') { vizState.gallery = vizState.gallery.filter(item => item.id !== button.dataset.id); writeGallery(vizState.gallery); renderGallery(); } }

export const vizState = { gallery: readGallery(), generating: false, options: { style: 'resort', structure: 'block', timeLighting: 'golden', viewAngle: 'hero', quality: 'hd', size: '1536x1024', apiStyle: 'natural' } };

function ensureVisualizerMarkup() {
  if (document.getElementById('generateVisual')) return;
  const anchor = document.querySelector('.immersive-card');
  if (!anchor) return;
  anchor.insertAdjacentHTML('afterend', `<article class="card visualizer-card" aria-label="العرض البصري المعماري"><header class="ch"><b class="num">✨</b><div><h2>العرض البصري المعماري</h2><p>تصوير للمخطط الموجود مع الالتزام بكتلته وعلاقاته، وليس اقتراح مخطط جديد.</p></div><span class="pill" id="visualBadge">GPT Image</span></header><div class="cb"><div class="visual-controls"><div class="visual-group"><label class="visual-label">الطراز البصري</label><div class="visual-options" role="group" aria-label="الطراز البصري"><button type="button" class="visual-opt" data-visual-style="resort">🏝️ <b>منتجع</b><small>حجر وفناء أخضر</small></button><button type="button" class="visual-opt" data-visual-style="modern">▢ <b>مودرن</b><small>كتل بيضاء وزجاج</small></button><button type="button" class="visual-opt" data-visual-style="classic">🏛️ <b>كلاسيكي</b><small>هيبة وتناسق</small></button><button type="button" class="visual-opt" data-visual-style="hijazi">🕌 <b>حجازي</b><small>حجر ورواشين</small></button></div></div><div class="visual-group"><label class="visual-label">الإضاءة</label><div class="visual-options" role="group" aria-label="إضاءة الصورة"><button type="button" class="visual-opt" data-visual-light="golden">🌅 <b>ذهبية</b></button><button type="button" class="visual-opt" data-visual-light="morning">🌤️ <b>صباح</b></button><button type="button" class="visual-opt" data-visual-light="midday">☀️ <b>ظهيرة</b></button><button type="button" class="visual-opt" data-visual-light="dusk">🌇 <b>غروب</b></button><button type="button" class="visual-opt" data-visual-light="night">🌙 <b>ليل</b></button></div></div><div class="visual-group"><label class="visual-label">زاوية الكاميرا</label><div class="visual-options" role="group" aria-label="زاوية الكاميرا"><button type="button" class="visual-opt" data-visual-view="hero">📐 <b>درامية</b></button><button type="button" class="visual-opt" data-visual-view="aerial">🚁 <b>جوية</b></button><button type="button" class="visual-opt" data-visual-view="entry">🚪 <b>الواجهة</b></button><button type="button" class="visual-opt" data-visual-view="courtyard">🌿 <b>الفناء</b></button><button type="button" class="visual-opt" data-visual-view="corner">◪ <b>ركنية</b></button></div></div></div><button class="primary visual-generate" id="generateVisual" type="button">✨ توليد تصور مستند إلى المخطط</button><div class="visual-status" id="visualStatus" hidden><span class="visual-spinner" aria-hidden="true"></span> جارٍ توليد الصورة…</div><div class="visual-gallery-header"><h3 class="subhead">معرض التصورات</h3><button class="small-button" id="clearGallery" type="button">حذف الكل</button></div><div class="render-gallery" id="renderGallery"></div><p class="help">تُرسل صورة المخطط ومواصفاته إلى Worker الصور لتوجيه التصور البصري. الاعتماد الدقيق للمساحات والمداخل يبقى من مخطط 2D/3D، ومفتاح OpenAI لا يصل إلى المتصفح.</p></div></article>`);
}

export async function generateVisual(model, overrides = {}) {
  if (vizState.generating) return null;
  if (!model) throw Error('ولّد المخطط أولاً ثم اطلب الصورة المعمارية.');
  vizState.generating = true; updateVisualizerUI();
  const options = { ...vizState.options, ...overrides }; const prompt = buildDallePrompt(model, options);
  try {
    const accessCode = localStorage.getItem(ACCESS_CODE_KEY) || '';
    const referenceImage = await planReferenceImage(model);
    const data = await requestImage(prompt, accessCode, { ...options, referenceImage });
    const item = { id: `render_${Date.now()}`, url: data.url, revised_prompt: data.revised_prompt || null, prompt, generated_at: data.generated_at || new Date().toISOString(), styleLabel: styleLabel(options), size: data.size, quality: data.quality };
    vizState.gallery = [...vizState.gallery, item].slice(-MAX_GALLERY_ITEMS); writeGallery(vizState.gallery); renderGallery(); return item;
  } finally { vizState.generating = false; updateVisualizerUI(); }
}

function updateVisualizerUI() {
  const button = document.getElementById('generateVisual'); if (button) { button.disabled = vizState.generating; button.textContent = vizState.generating ? 'جارٍ توليد الصورة…' : '✨ توليد تصور مستند إلى المخطط'; }
  const status = document.getElementById('visualStatus'); if (status) status.hidden = !vizState.generating;
  document.querySelectorAll('[data-visual-style]').forEach(el => el.classList.toggle('on', el.dataset.visualStyle === vizState.options.style));
  document.querySelectorAll('[data-visual-light]').forEach(el => el.classList.toggle('on', el.dataset.visualLight === vizState.options.timeLighting));
  document.querySelectorAll('[data-visual-view]').forEach(el => el.classList.toggle('on', el.dataset.visualView === vizState.options.viewAngle));
}

export function visualFailureMessage(error) {
  const detail = String(error?.message || error || '');
  if (/رصيد|الحد المسموح|quota|billing|insufficient|credit|429|402/i.test(detail))
    return 'خدمة الصور الخارجية غير متاحة الآن بسبب الرصيد أو حد الاستخدام. الرسم الهندسي 2D والعرض 3D والكميات لا تتأثر.';
  if (/رمز|401|403|unauthorized|forbidden/i.test(detail))
    return 'تعذر التحقق من صلاحية خدمة الصور. راجع رمز الدخول؛ يمكنك متابعة المخطط الهندسي دون توليد صورة.';
  if (/timeout|انتهت المهلة|network|fetch|الاتصال/i.test(detail))
    return 'تعذر الاتصال بخدمة الصور في الوقت الحالي. يمكنك متابعة المخطط الهندسي وعرض 3D دون انتظار الصورة.';
  return 'لم تكتمل الصورة المعمارية. الرسم الهندسي متاح كما هو، ولا تتغير الغرف أو الكميات عند فشل الصورة.';
}

function showVisualNotice(error, model) {
  const status = document.getElementById('visualStatus');
  if (!status) return;
  let notice = document.getElementById('visualNotice');
  if (!notice) {
    notice = document.createElement('section');
    notice.id = 'visualNotice';
    notice.className = 'visual-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    status.insertAdjacentElement('afterend', notice);
  }
  notice.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = visualFailureMessage(error);
  notice.append(title);
  if (model) {
    const panel = document.createElement('div');
    panel.className = 'visual-fallback';
    const img = document.createElement('img');
    img.alt = 'المسقط الهندسي الحقيقي من نموذج الميزان، بديل عن الصورة الخارجية غير المتاحة';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildPlanSVG(model));
    const copy = document.createElement('div');
    const heading = document.createElement('b');
    heading.textContent = 'مسقطك الهندسي متاح دون تكلفة توليد الصور';
    const desc = document.createElement('p');
    desc.textContent = 'هذا رسم 2D من بيانات الغرف والجدران والفتحات، وليس صورة فوتوغرافية ولا تصميمًا بديلًا.';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'small-button';
    go.textContent = 'افتح المخطط الكامل 2D';
    go.addEventListener('click', () => document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    copy.append(heading, desc, go);
    panel.append(img, copy);
    notice.append(panel);
  }
  notice.hidden = false;
}

export function initVisualizer(getModel) {
  ensureVisualizerMarkup();
  document.querySelectorAll('[data-visual-style]').forEach(el => el.addEventListener('click', () => { vizState.options.style = el.dataset.visualStyle; updateVisualizerUI(); }));
  document.querySelectorAll('[data-visual-light]').forEach(el => el.addEventListener('click', () => { vizState.options.timeLighting = el.dataset.visualLight; updateVisualizerUI(); }));
  document.querySelectorAll('[data-visual-view]').forEach(el => el.addEventListener('click', () => { vizState.options.viewAngle = el.dataset.visualView; updateVisualizerUI(); }));
  const button = document.getElementById('generateVisual');
  button?.addEventListener('click', async () => {
    const model = getModel?.();
    if (!model) { showVisualNotice('ولّد المخطط أولاً قبل طلب الصورة.', null); return; }
    let code = localStorage.getItem(ACCESS_CODE_KEY) || '';
    if (!code) { code = window.prompt('أدخل رمز دخول الصور الذي أعددته في Worker:')?.trim() || ''; if (!code) { showVisualNotice('رمز الدخول مطلوب.', model); return; } localStorage.setItem(ACCESS_CODE_KEY, code); }
    try {
      await generateVisual(model);
      const notice = document.getElementById('visualNotice'); if (notice) notice.hidden = true;
    } catch (error) { showVisualNotice(error, model); }
  });
  document.getElementById('clearGallery')?.addEventListener('click', () => { if (vizState.gallery.length && confirm('حذف كل الصور المحفوظة من هذا الجهاز؟')) { vizState.gallery = []; writeGallery([]); renderGallery(); } });
  renderGallery(); updateVisualizerUI();
}

export default { initVisualizer, generateVisual, buildDallePrompt, vizState };
