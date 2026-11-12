// خريطة تحديد موقع الأرض (اختيارية): عارض بلاطات صغير بلا مكتبة خارجية + دبوس + مستطيل الأرض يُحرَّك ويُدوَّر.
// تُحمَّل هذه الوحدة عند فتح الخيار فقط، ولا تطلب أي بلاطة قبل ذلك. الهندسة كلها في geo-land.mjs (مختبرة في node).
// سياسة بلاطات OpenStreetMap: الرابط القياسي، الإسناد ظاهر دائمًا فوق الخريطة، بلاطات المشهد الحالي فقط (بعد أن يستقر السحب/التكبير)،
// والتخزين المؤقت للمتصفح كما هو. حقل واحد ذكي (geo-input.mjs): إحداثيات، روابط جوجل/آبل/OSM، رابط مختصر (يحلّه /api/geo/resolve)، Plus Code، أو اسم (يبحث عنه /api/geo/search عبر وكيل الوركر بسياسة Nominatim).
// البحث زر صريح أو Enter (لا إكمال تلقائي)، طلب واحد كل 1.5 ثانية على الأكثر، والنتائج تُحفظ في الذاكرة.
// إن لم تُحمَّل البلاطات (بلا شبكة أو حجب) تبقى الأدوات تعمل على خلفية فارغة، والإدخال اليدوي في النموذج لا يتأثر.
import {
  TILE_SOURCE, GEOCODER, DEFAULT_CENTER, parseLocationText, visibleTiles, project, toScreen, fromScreen, metersPerPixel, rectCorners, offsetMeters,
  metersBetween, normalizeRect, nearestCity, inSaudi, northText, REGIONS, cityById, normalizeGeo,
} from './geo-land.mjs';
import { parseGeoInput, resolveShortPlus, formatCoord } from './geo-input.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
const s = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const half = v => Math.round(v * 2) / 2;
const SIDE_AR = { n: 'شمال', e: 'شرق', s: 'جنوب', w: 'غرب' };
const MAX_VIEW_ZOOM = TILE_SOURCE.maxZoom + 2; // فوق أقصى مستوى للمصدر تُكبَّر بلاطاته (لا طلبات لمستويات غير موجودة)

/**
 * يركّب الخريطة داخل host.
 * getLand(): { length, width, streets[], entries[], streetWidths{}, geo } كما في النموذج الآن.
 * onDims({ width, length }) أثناء السحب؛ onStreets(streets[]) عند النقر على ضلع؛ onCity(cityId) عند اقتراح مدينة؛
 * onApply({ geo, width, length, streets, entries, streetWidths, swapped }) عند «اعتمد موقع الأرض»؛ onClear() عند المسح.
 * يعيد { refresh() } لتحديث المستطيل إذا تغيّرت حقول النموذج.
 */
export function mountLandLocator(host, { getLand, onDims = () => {}, onStreets = () => {}, onCity = () => {}, onApply = () => {}, onClear = () => {}, fetchImpl = globalThis.fetch?.bind(globalThis), apiBase = '' } = {}) {
  const land0 = getLand() || {}, g0 = normalizeGeo(land0.geo), start = g0?.source === 'map' ? { lat: g0.lat, lng: g0.lng, zoom: 19 } : g0 ? { lat: g0.lat, lng: g0.lng, zoom: 12 } : { ...DEFAULT_CENTER };
  const view = { lat: start.lat, lng: start.lng, zoom: start.zoom };
  let pin = g0?.source === 'map' ? { lat: g0.lat, lng: g0.lng } : null;
  let rect = g0?.source === 'map' ? { bearing: g0.north } : null; // مركزه الدبوس؛ أبعاده من النموذج
  let cityName = g0?.cityName || '', failed = 0, loaded = 0;

  // ---- الهيكل
  const msg = h('p', { class: 'lm-msg', role: 'status', 'aria-live': 'polite' });
  const warn = h('p', { class: 'lm-warn', id: 'lmWarn', role: 'alert', hidden: true }, 'تعذّر تحميل صور الخريطة الآن. تستطيع لصق الإحداثيات ورسم حدود الأرض بلا صور، أو إكمال الإدخال يدويًا كما هو.');
  const say = (t, bad = false) => { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); };
  const smartIn = h('input', { type: 'text', class: 'lm-in', id: 'lmSmart', dir: 'auto', placeholder: 'الصق رابط الموقع أو الإحداثيات أو رمز Plus Code أو اسم الحي', 'aria-label': 'رابط الموقع أو الإحداثيات أو العنوان الوطني المختصر أو اسم الحي', autocomplete: 'off', spellcheck: 'false' });
  const worldBox = h('input', { type: 'checkbox', id: 'lmWorld' });
  const understood = h('p', { class: 'lm-understood', id: 'lmUnderstood', role: 'status', 'aria-live': 'polite', hidden: true });
  const coordsOut = h('p', { class: 'lm-coords', id: 'lmCoords', dir: 'ltr', hidden: true });
  const privacy = h('p', { class: 'lm-privacy', id: 'lmPrivacy' });
  const results = h('ul', { class: 'lm-results', id: 'lmResults', hidden: true });
  const tiles = h('div', { class: 'lm-tiles', 'aria-hidden': 'true' });
  const over = s('svg', { class: 'lm-over', 'aria-hidden': 'true' });
  const map = h('div', { class: 'lm-map', id: 'lmMap', tabindex: '0', role: 'application', 'aria-label': 'خريطة لتحديد موقع الأرض: اسحب للتحريك، والأسهم للتحريك، و+ و− للتكبير، و Enter لوضع الدبوس في المنتصف' },
    tiles, over,
    h('div', { class: 'lm-cross', 'aria-hidden': 'true' }),
    h('div', { class: 'lm-zoom' }, h('button', { type: 'button', 'aria-label': 'تكبير الخريطة', id: 'lmZoomIn', onclick: () => zoomBy(1) }, '+'), h('button', { type: 'button', 'aria-label': 'تصغير الخريطة', id: 'lmZoomOut', onclick: () => zoomBy(-1) }, '−')),
    h('a', { class: 'lm-attr', href: TILE_SOURCE.attributionHref, target: '_blank', rel: 'noopener' }, TILE_SOURCE.attribution));
  const rot = h('input', { type: 'range', id: 'lmRot', min: '-180', max: '180', step: '1', value: '0', 'aria-label': 'تدوير حدود الأرض بالدرجات' });
  const rotTxt = h('output', { class: 'lm-rot-txt', for: 'lmRot' }, '0°');
  const drawBtn = h('button', { type: 'button', class: 'chip', id: 'lmDraw', onclick: () => startRect() }, 'ارسم حدود أرضي على الدبوس');
  const rectTools = h('div', { class: 'lm-rect', id: 'lmRectTools', hidden: true },
    h('p', { class: 'hint' }, 'اسحب المستطيل ليطابق قطعتك، ودوّره من المقبض الدائري أو من الشريط، واسحب منتصف أي ضلع لتغيير بعده. اضغط ضلعًا لتعليمه «شارع» أو «جار» — أنت من يحدد الشوارع؛ الخريطة لا تستنتجها.'),
    h('div', { class: 'lm-rotline' }, h('button', { type: 'button', class: 'pm', 'aria-label': 'دوّر درجة عكس عقارب الساعة', onclick: () => rotateBy(-1) }, '↺'), rot, h('button', { type: 'button', class: 'pm', 'aria-label': 'دوّر درجة مع عقارب الساعة', onclick: () => rotateBy(1) }, '↻'), rotTxt),
    h('p', { class: 'lm-north', id: 'lmNorth' }));
  const applyBtn = h('button', { type: 'button', class: 'cta', id: 'lmApply', disabled: true, onclick: apply }, 'اعتمد موقع الأرض');
  const clearBtn = h('button', { type: 'button', class: 'chip ghost', id: 'lmClear', onclick: clear }, 'امسح الموقع');
  host.replaceChildren(h('div', { class: 'lm' },
    h('div', { class: 'lm-tools' },
      // ليست نماذج: الخريطة داخل نموذج الأرض، والنماذج المتداخلة ترسل نموذج الأرض نفسه
      h('div', { class: 'lm-line', id: 'lmSmartForm', role: 'search', 'aria-label': 'حدّد موقع الأرض' }, smartIn, h('button', { type: 'button', class: 'chip', id: 'lmSmartGo', onclick: () => smart() }, 'ابحث / اذهب')),
      h('div', { class: 'lm-line lm-btns' },
        h('button', { type: 'button', class: 'chip', id: 'lmHere', onclick: locate }, 'موقعي الحالي'),
        h('button', { type: 'button', class: 'chip', id: 'lmPick', onclick: pick }, 'حدّد على الخريطة'),
        h('label', { class: 'lm-world' }, worldBox, ' ابحث في كل العالم (الافتراضي: المملكة)'))),
    understood, msg, warn, results, map, coordsOut,
    h('div', { class: 'lm-actions' }, drawBtn, applyBtn, clearBtn),
    rectTools,
    privacy));
  const PRIVACY_BASE = 'إحداثيات أرضك تبقى في متصفحك ولا تُرسل إلى خادم الميزان ولا تُحفظ إلا فيه. صور الخريطة تُجلب من OpenStreetMap. ';
  const setPrivacy = to => { privacy.textContent = PRIVACY_BASE + `البحث بالاسم يمر نصّه فقط عبر خادم الميزان إلى ${to}، والرابط المختصر يُفتح من خادم الميزان ليُستخرج منه الموقع فقط.`; };
  setPrivacy('خدمة Nominatim التابعة لـ OpenStreetMap');
  try { Promise.resolve(fetchImpl?.(`${apiBase}/api/geo/providers`, { headers: { Accept: 'application/json' } })).then(r => r?.ok ? r.json() : null).then(j => { const p = j?.providers?.[0]; if (p?.sendsTo) setPrivacy(p.sendsTo); }).catch(() => {}); } catch { /* لا يهم */ }

  smartIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); smart(); } });
  // ---- العرض
  const size = () => { const r = map.getBoundingClientRect(); return { W: Math.max(50, r.width), H: Math.max(50, r.height), L: r.left, T: r.top }; };
  const dims = () => { const l = getLand() || {}; return { width: Number(l.width) > 0 ? Number(l.width) : 20, length: Number(l.length) > 0 ? Number(l.length) : 30, streets: l.streets || [], entries: l.entries || [], streetWidths: l.streetWidths || {} }; };
  const live = new Map(); let tileTimer = 0;
  function placeTiles() {
    const { W, H } = size();
    for (const [, t] of live) { const sc = 2 ** (view.zoom - t.z), c = project(view.lat, view.lng, t.z), sz = TILE_SOURCE.size * sc; t.img.style.cssText = `left:${((t.x * TILE_SOURCE.size - c.x) * sc + W / 2).toFixed(1)}px;top:${((t.y * TILE_SOURCE.size - c.y) * sc + H / 2).toFixed(1)}px;width:${(sz + .6).toFixed(1)}px;height:${(sz + .6).toFixed(1)}px`; }
  }
  /** يطلب بلاطات المشهد الحالي فقط، بعد أن يستقر (لا طلبات لكل إطار أثناء السحب أو التكبير). */
  function loadTiles() {
    const { W, H } = size(), want = visibleTiles(view, W, H), keys = new Set(want.map(t => `${t.z}/${t.x}/${t.y}`));
    for (const [k, t] of live) if (!keys.has(k)) { t.img.remove(); live.delete(k); }
    for (const t of want) {
      const k = `${t.z}/${t.x}/${t.y}`; if (live.has(k)) continue;
      const img = new Image(); img.alt = ''; img.draggable = false; img.decoding = 'async';
      img.addEventListener('load', () => { loaded++; map.classList.remove('lm-offline'); warn.hidden = true; });
      img.addEventListener('error', () => { failed++; img.style.visibility = 'hidden'; if (!loaded && failed >= 3) { map.classList.add('lm-offline'); warn.hidden = false; } });
      img.src = t.url; tiles.append(img); live.set(k, { ...t, img });
    }
    placeTiles();
  }
  function render({ settle = true } = {}) {
    placeTiles(); drawOverlay();
    clearTimeout(tileTimer); tileTimer = setTimeout(loadTiles, settle ? 140 : 0);
  }
  const P = (lat, lng) => { const { W, H } = size(); return toScreen(view, W, H, lat, lng); };
  function drawOverlay() {
    const { W, H } = size(); over.setAttribute('viewBox', `0 0 ${W} ${H}`); over.replaceChildren();
    if (rect && pin) {
      const d = dims(), cs = rectCorners({ lat: pin.lat, lng: pin.lng, width: d.width, length: d.length, bearing: rect.bearing }).map(c => P(c.lat, c.lng)); // SW, SE, NE, NW
      over.append(s('polygon', { class: 'lm-poly', 'data-role': 'body', points: cs.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') }));
      const edges = { s: [cs[0], cs[1]], e: [cs[1], cs[2]], n: [cs[2], cs[3]], w: [cs[3], cs[0]] }, c = P(pin.lat, pin.lng);
      for (const [side, [a, b]] of Object.entries(edges)) {
        const street = d.streets.includes(side), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ox = mx - c.x, oy = my - c.y, ol = Math.hypot(ox, oy) || 1;
        over.append(s('line', { class: 'lm-edge' + (street ? ' street' : ''), 'data-role': 'edge', 'data-side': side, x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1) }));
        over.append(s('line', { class: 'lm-edge-hit', 'data-role': 'edge', 'data-side': side, x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1) }));
        const t = s('text', { class: 'lm-side' + (street ? ' street' : ''), x: (mx + ox / ol * (side === 'n' ? 62 : 24)).toFixed(1), y: (my + oy / ol * (side === 'n' ? 62 : 24) + 4).toFixed(1), 'text-anchor': 'middle' }); t.textContent = SIDE_AR[side] + (street ? ' · شارع' : ''); over.append(t);
        over.append(s('rect', { class: 'lm-grip', 'data-role': 'edge', 'data-side': side, x: (mx - 6).toFixed(1), y: (my - 6).toFixed(1), width: 12, height: 12, rx: 2 }));
      }
      const [na, nb] = edges.n, nx = (na.x + nb.x) / 2, ny = (na.y + nb.y) / 2, vx = nx - c.x, vy = ny - c.y, vl = Math.hypot(vx, vy) || 1, hx = nx + vx / vl * 38, hy = ny + vy / vl * 38;
      over.append(s('line', { class: 'lm-stem', x1: nx.toFixed(1), y1: ny.toFixed(1), x2: hx.toFixed(1), y2: hy.toFixed(1) }), s('circle', { class: 'lm-rotgrip', 'data-role': 'rotate', cx: hx.toFixed(1), cy: hy.toFixed(1), r: 11 }));
    }
    if (pin) { const p = P(pin.lat, pin.lng); const g = s('g', { class: 'lm-pin', transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` }); g.append(s('circle', { class: 'lm-pin-hit', 'data-role': 'pin', cx: 0, cy: -18, r: 22 }), s('path', { 'data-role': 'pin', d: 'M0 0 C-9 -12 -11 -17 -11 -22 A11 11 0 1 1 11 -22 C11 -17 9 -12 0 0 Z' }), s('circle', { 'data-role': 'pin', cx: 0, cy: -22, r: 4 })); over.append(g); }
    coordsOut.hidden = !pin; if (pin) coordsOut.textContent = `${formatCoord(pin.lat)}, ${formatCoord(pin.lng)}`;
    const d = dims(); rotTxt.textContent = rect ? `${Math.round(rect.bearing)}°` : '0°'; if (rect) rot.value = String(Math.round(((rect.bearing + 180) % 360 + 360) % 360 - 180));
    rectTools.hidden = !rect; drawBtn.hidden = !!rect || !pin; applyBtn.disabled = !pin; clearBtn.hidden = !pin;
    const nn = host.querySelector('#lmNorth'); if (nn && rect) { const n = normalizeRect({ width: d.width, length: d.length, bearing: rect.bearing }); nn.textContent = `الأرض ${d.width} × ${d.length} م. ${northText(n.north)}${n.swapped ? ' (عند الاعتماد يتبادل الطول والعرض لأن المستطيل دار ربع دورة.)' : ''}`; }
  }

  // ---- الأفعال
  function setView(lat, lng, zoom = view.zoom) { view.lat = clamp(lat, -84, 84); view.lng = lng; view.zoom = clamp(zoom, TILE_SOURCE.minZoom, MAX_VIEW_ZOOM); render(); }
  function zoomBy(dz, at = null) {
    const { W, H } = size(), z = clamp(Math.round((view.zoom + dz) * 4) / 4, TILE_SOURCE.minZoom, MAX_VIEW_ZOOM); if (z === view.zoom) return;
    const ax = at ? at.x : W / 2, ay = at ? at.y : H / 2, anchor = fromScreen(view, W, H, ax, ay);
    view.zoom = z; const now = toScreen(view, W, H, anchor.lat, anchor.lng), c = fromScreen(view, W, H, W / 2 + (now.x - ax), H / 2 + (now.y - ay));
    view.lat = c.lat; view.lng = c.lng; render();
  }
  function setPin(lat, lng, { zoom = null, note = '' } = {}) {
    pin = { lat, lng };
    const near = nearestCity(lat, lng);
    if (near && near.km <= 120) { cityName = near.city.ar; onCity(near.city.id); }
    setView(lat, lng, zoom ?? Math.max(view.zoom, 18));
    say((note ? note + ' ' : '') + (inSaudi(lat, lng) ? '' : 'تنبيه: هذا الموضع خارج المملكة. ') + 'وُضع الدبوس. الآن اضغط «ارسم حدود أرضي على الدبوس» ثم طابق المستطيل مع قطعتك' + (near && near.km <= 120 ? ` (أقرب مدينة رئيسية: ${near.city.ar} — غيّرها من قائمة المدينة إن لزم).` : '.'), !inSaudi(lat, lng));
  }
  function startRect() { if (!pin) return; rect = { bearing: 0 }; setView(pin.lat, pin.lng, Math.max(view.zoom, 19)); say('ظهر مستطيل بأبعاد أرضك. حرّكه ودوّره حتى يطابق القطعة، ثم علّم أضلاع الشوارع، ثم اضغط «اعتمد موقع الأرض».'); }
  function rotateBy(d) { if (!rect) return; rect.bearing = ((rect.bearing + d) % 360 + 360) % 360; render({ settle: false }); }
  rot.addEventListener('input', () => { if (!rect) return; rect.bearing = ((Number(rot.value)) % 360 + 360) % 360; drawOverlay(); });
  function locate() {
    if (!navigator.geolocation) return say('متصفحك لا يدعم تحديد الموقع. الصق الإحداثيات أو اضغط على الخريطة.', true);
    if (globalThis.isSecureContext === false) return say('تحديد الموقع يعمل فقط على اتصال آمن (https).', true);
    showUnderstood(''); say('أطلب إذنك لمعرفة موقعك الحالي…');
    navigator.geolocation.getCurrentPosition(p => setPin(p.coords.latitude, p.coords.longitude, { note: `موقعك الحالي بدقة نحو ${Math.round(p.coords.accuracy)} م.` }),
      e => say(e.code === 1 ? 'لم يُؤذَن للموقع بمعرفة موقعك. فعّل إذن الموقع من إعدادات المتصفح، أو الصق الرابط/الإحداثيات أو اضغط على الخريطة.' : e.code === 3 ? 'استغرق تحديد موقعك وقتًا طويلًا. تأكد من تشغيل خدمة الموقع في جهازك ثم أعد المحاولة.' : 'تعذّر تحديد موقعك الآن (قد تكون خدمة الموقع مغلقة). الصق الرابط/الإحداثيات أو اضغط على الخريطة.', true), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }
  // ---- الحقل الذكي: يفهم المدخل ثم يضع الدبوس، وكل ما يحتاج شبكة يمر عبر الوركر
  const showUnderstood = (text, kind = '') => { understood.hidden = !text; understood.textContent = text || ''; understood.dataset.kind = kind; };
  function accept(r) {
    const notes = [];
    if (r.approx) notes.push('هذا مركز عرض الخريطة في الرابط لا دبوسًا دقيقًا؛ حرّك الدبوس إلى أرضك.');
    if (r.kind === 'plus-code' && r.precisionM) notes.push(`دقة الرمز نحو ${r.precisionM} م.`);
    showUnderstood(r.understood + '.', r.kind);
    setPin(r.lat, r.lng, { note: notes.join(' ') });
  }
  async function getJson(path) {
    if (!fetchImpl) throw Object.assign(new Error('nofetch'), { arabic: 'هذه الخدمة غير متاحة في هذا المتصفح.' });
    const res = await fetchImpl(apiBase + path, { headers: { Accept: 'application/json' } });
    let body = null; try { body = await res.json(); } catch { /* لا جسم */ }
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { arabic: body?.error || 'تعذّر إتمام الطلب الآن.', status: res.status });
    return body;
  }
  let busy = false;
  async function smart() {
    if (busy) return;
    const r = parseGeoInput(smartIn.value, { ref: { lat: view.lat, lng: view.lng } });
    results.hidden = true;
    if (r.ok) return accept(r);
    if (!r.needs) { showUnderstood(''); return say(r.message, true); }
    showUnderstood(r.understood, r.kind);
    if (r.needs === 'national-address') return say(r.message, true);
    busy = true;
    try {
      if (r.needs === 'resolve') {
        say('أفتح الرابط المختصر لأستخرج الموقع…');
        const j = await getJson(`/api/geo/resolve?u=${encodeURIComponent(r.url)}`);
        return accept({ lat: j.lat, lng: j.lng, kind: 'google-short', approx: !!j.approx, understood: 'فهمت رابط خرائط مختصرًا' + (j.approx ? ' (مركز عرض الخريطة)' : '') + ': ' + formatCoord(j.lat) + ', ' + formatCoord(j.lng) });
      }
      if (r.needs === 'locality') {
        const list = await runSearch(r.locality, { quiet: true });
        if (!list.length) return say(`لم أجد المنطقة «${r.locality}» لأكمل رمز فتح الموقع. اكتب اسم المدينة أو الصق رابط الموقع.`, true);
        const p = resolveShortPlus(r.code, { lat: list[0].lat, lng: list[0].lng, label: r.locality });
        return p.ok ? accept(p) : say(p.message, true);
      }
      await runSearch(r.query);
    } catch (e) { say(e.arabic || 'تعذّر إتمام الطلب الآن. الصق الإحداثيات أو حرّك الخريطة يدويًا.', true); }
    finally { busy = false; }
  }
  function pick() { map.focus(); map.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); say('اضغط على موضع أرضك في الخريطة لوضع الدبوس، ثم اسحبه لضبطه. كبّر الخريطة (+) لدقة أعلى.'); }
  const cache = new Map(); let lastSearch = 0;
  async function runSearch(qRaw, { quiet = false } = {}) {
    const q = String(qRaw).trim().slice(0, 120); if (q.length < 2) { say('اكتب اسم الحي أو المدينة ثم اضغط «ابحث / اذهب».', true); return []; }
    const scope = worldBox.checked ? 'world' : 'sa', key = scope + '|' + q;
    const show = (list, credit) => {
      if (quiet) return;
      results.hidden = false;
      results.replaceChildren(...(list.length ? list.map(x => h('li', {}, h('button', { type: 'button', class: 'lm-hit', onclick: () => { results.hidden = true; cityName = x.city || cityName; pin = null; rect = null; setView(x.lat, x.lng, 16); showUnderstood(`اخترت «${x.name}»: ${formatCoord(x.lat)}, ${formatCoord(x.lng)}.`, 'search'); say(`انتقلت إلى «${x.name}». اضغط على موضع أرضك في الخريطة لوضع الدبوس.`); const near = nearestCity(x.lat, x.lng); if (near && near.km <= 120) onCity(near.city.id); } }, x.name))) : [h('li', { class: 'hint' }, scope === 'sa' ? 'لا نتائج داخل المملكة. جرّب اسم المدينة مع الحي، أو فعّل «كل العالم»، أو الصق الإحداثيات.' : 'لا نتائج. جرّب اسم المدينة مع الحي، أو الصق الإحداثيات.')]),
        h('li', { class: 'lm-credit' }, credit));
    };
    if (cache.has(key)) { const c = cache.get(key); say(''); show(c.list, c.credit); return c.list; }
    const wait = lastSearch + GEOCODER.minIntervalMs - Date.now(); if (wait > 0) { say('انتظر لحظة ثم أعد البحث (طلب واحد كل ثانية ونصف على الأكثر).', true); return []; }
    lastSearch = Date.now(); say('أبحث…');
    const j = await getJson(`/api/geo/search?q=${encodeURIComponent(q)}&scope=${scope}`);
    const list = (j.results || []).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng)).map(x => ({ lat: x.lat, lng: x.lng, name: String(x.name).slice(0, 140), city: String(x.city || '').slice(0, 60) }));
    const credit = j.attribution || GEOCODER.attribution;
    cache.set(key, { list, credit }); say(''); show(list, credit); return list;
  }
  function apply() {
    if (!pin) return;
    const d = dims(), n = rect ? normalizeRect({ width: d.width, length: d.length, bearing: rect.bearing, streets: d.streets, entries: d.entries, streetWidths: d.streetWidths }) : { width: d.width, length: d.length, north: 0, streets: d.streets, entries: d.entries, streetWidths: d.streetWidths, swapped: false };
    const near = nearestCity(pin.lat, pin.lng), city = near && near.km <= 120 ? near.city : null;
    const geo = normalizeGeo({ lat: pin.lat, lng: pin.lng, north: n.north, city: (getLand()?.geo?.city && cityById(getLand().geo.city)) ? getLand().geo.city : city?.id, cityName: cityName || city?.ar || '' });
    if (rect) rect.bearing = ((n.north % 360) + 360) % 360;
    onApply({ geo, width: n.width, length: n.length, streets: n.streets, entries: n.entries, streetWidths: n.streetWidths, swapped: n.swapped, hasRect: !!rect });
    render({ settle: false });
    say(rect ? `اعتُمد الموقع وحدود الأرض. ${northText(n.north)}${n.swapped ? ' تبادل الطول والعرض وانتقلت الشوارع مع أضلاعها.' : ''}` : 'اعتُمد موقع الأرض (بلا رسم حدودها: الشمال كما أدخلته في النموذج).');
  }
  function clear() { pin = null; rect = null; showUnderstood(''); say('مُسح الموقع. التصميم يعمل بلا موقع: تُحسب الشمس لمدينة تختارها أو للرياض افتراضيًا.'); render({ settle: false }); onClear(); }

  // ---- المؤشر: سحب الخريطة، وضع الدبوس، تحريك/تدوير/تمديد المستطيل، القرص للتكبير
  const pts = new Map(); let drag = null, pinch = null;
  map.addEventListener('pointerdown', e => {
    if (e.target.closest('.lm-zoom, .lm-attr')) return;
    map.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.zoom }; drag = null; return; }
    const role = e.target.getAttribute?.('data-role') || 'map', { L, T } = size();
    drag = { role, side: e.target.getAttribute?.('data-side') || null, x0: e.clientX, y0: e.clientY, moved: false, px: e.clientX - L, py: e.clientY - T };
  });
  map.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    const { W, H, L, T } = size();
    if (pts.size >= 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), z = clamp(Math.round((pinch.z + Math.log2(d / Math.max(1, pinch.d))) * 4) / 4, TILE_SOURCE.minZoom, MAX_VIEW_ZOOM); if (z !== view.zoom) zoomBy(z - view.zoom, { x: (a.x + b.x) / 2 - L, y: (a.y + b.y) / 2 - T }); return; }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return; drag.moved = true;
    const mpp = metersPerPixel(view.lat, view.zoom);
    if (drag.role === 'map') { const c = fromScreen(view, W, H, W / 2 - dx, H / 2 - dy); view.lat = c.lat; view.lng = c.lng; render(); }
    else if (drag.role === 'pin' && pin) { const here = fromScreen(view, W, H, e.clientX - L, e.clientY - T); pin = { lat: here.lat, lng: here.lng }; drawOverlay(); }
    else if (drag.role === 'body' && pin) { pin = offsetMeters(pin.lat, pin.lng, dx * mpp, -dy * mpp); drawOverlay(); }
    else if (drag.role === 'rotate' && pin && rect) { const c = P(pin.lat, pin.lng); rect.bearing = ((Math.atan2(e.clientX - L - c.x, -(e.clientY - T - c.y)) * 180 / Math.PI) % 360 + 360) % 360; drawOverlay(); }
    else if (drag.role === 'edge' && pin && rect) {
      // سحب منتصف ضلع: يتغيّر البعد العمودي عليه (متماثلًا حول المركز)، بتقريب نصف متر، ويُحدَّث حقلا الطول والعرض
      const here = fromScreen(view, W, H, e.clientX - L, e.clientY - T), m = metersBetween(pin, here), b = rect.bearing * Math.PI / 180;
      const x = m.east * Math.cos(b) - m.north * Math.sin(b), y = m.east * Math.sin(b) + m.north * Math.cos(b), d = dims();
      const next = ['n', 's'].includes(drag.side) ? { width: d.width, length: clamp(half(Math.abs(y) * 2), 8, 100) } : { width: clamp(half(Math.abs(x) * 2), 8, 100), length: d.length };
      if (next.width !== d.width || next.length !== d.length) { onDims(next); drawOverlay(); }
    }
  });
  const up = e => {
    const had = pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!had || !drag || pts.size) return;
    const d = drag; drag = null;
    if (!d.moved) {
      if (d.role === 'edge' && d.side) { const cur = new Set(dims().streets); cur.has(d.side) ? cur.delete(d.side) : cur.add(d.side); onStreets([...cur]); drawOverlay(); say(`الضلع ${SIDE_AR[d.side]}: ${cur.has(d.side) ? 'شارع' : 'جار'}.`); }
      else if (d.role === 'map' && !rect) { const { W, H } = size(), c = fromScreen(view, W, H, d.px, d.py); setPin(c.lat, c.lng, { zoom: view.zoom < 17 ? Math.min(view.zoom + 2, 18) : view.zoom }); }
    } else if (d.role === 'rotate' && rect) { rect.bearing = Math.round(rect.bearing); drawOverlay(); }
    else if (d.role === 'pin' && pin) { const near = nearestCity(pin.lat, pin.lng); if (near && near.km <= 120) { cityName = near.city.ar; onCity(near.city.id); } showUnderstood(`ضبطت الدبوس يدويًا: ${formatCoord(pin.lat)}, ${formatCoord(pin.lng)}.`, 'manual'); say(inSaudi(pin.lat, pin.lng) ? 'تم ضبط الدبوس. اعتمد الموقع حين يطابق أرضك.' : 'تنبيه: هذا الموضع خارج المملكة.', !inSaudi(pin.lat, pin.lng)); }
    render();
  };
  map.addEventListener('pointerup', up); map.addEventListener('pointercancel', up);
  map.addEventListener('wheel', e => { e.preventDefault(); const { L, T } = size(); zoomBy(e.deltaY < 0 ? (e.ctrlKey ? .25 : .5) : (e.ctrlKey ? -.25 : -.5), { x: e.clientX - L, y: e.clientY - T }); }, { passive: false });
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) map.addEventListener(g, e => e.preventDefault());
  map.addEventListener('keydown', e => {
    const { W, H } = size(), step = 60, move = (dx, dy) => { const c = fromScreen(view, W, H, W / 2 + dx, H / 2 + dy); view.lat = c.lat; view.lng = c.lng; render(); };
    if (e.key === 'ArrowUp') move(0, -step); else if (e.key === 'ArrowDown') move(0, step); else if (e.key === 'ArrowLeft') move(-step, 0); else if (e.key === 'ArrowRight') move(step, 0);
    else if (e.key === '+' || e.key === '=') zoomBy(1); else if (e.key === '-' || e.key === '_') zoomBy(-1);
    else if (e.key === 'Enter' && !rect) setPin(view.lat, view.lng); else return;
    e.preventDefault();
  });
  new ResizeObserver(() => render()).observe(map);
  render({ settle: false });
  if (g0?.source === 'map') say('هذا موقع أرضك المحفوظ. عدّله ثم اضغط «اعتمد موقع الأرض»، أو امسحه.'); else say('الصق رابط الموقع أو الإحداثيات في الحقل أعلاه، أو استعمل موقعك الحالي، أو حرّك الخريطة إلى حيّك واضغط على موضع أرضك.');
  return { refresh: () => drawOverlay(), get state() { return { view: { ...view }, pin: pin ? { ...pin } : null, rect: rect ? { ...rect } : null, tiles: live.size, loaded, failed }; } };
}

/** خيارات قائمة المدينة (13 منطقة) لعنصر select. */
export function fillCitySelect(select, value = '') {
  select.replaceChildren(h('option', { value: '' }, 'غير محددة'));
  for (const r of REGIONS) select.append(h('optgroup', { label: r.ar }, r.cities.map(c => h('option', { value: c.id }, c.ar))));
  select.value = cityById(value) ? value : '';
}

export default { mountLandLocator, fillCitySelect };
