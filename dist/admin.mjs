// واجهة الإدارة. كل النصوص تُدرج عبر textContent (لا إدراج HTML)، ولا استدعاء لأي موقع خارجي (CSP: connect-src self).
import { planSheetSvg } from './draw/plan-sheet.mjs';
import { zipBuild } from './pack/zip-lite.mjs';

const app = document.getElementById('app');
let csrf = '';
const MIN_PW = 12;

// ---------------------------------------------------------------- أدوات
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') e.className = v; else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k in e && k !== 'list' && k !== 'form') { try { e[k] = v; } catch { e.setAttribute(k, v); } } else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const mount = (...nodes) => { app.replaceChildren(...nodes); };
const fmtDate = v => { if (!v) return '—'; const d = typeof v === 'number' ? new Date(v) : new Date(v); return Number.isNaN(+d) ? '—' : d.toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }); };
const fmtBytes = n => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const STYLE_AR = { S: 'سلماني', modern: 'معاصر', H: 'حجازي', N: 'نجدي', C: 'كلاسيكي', M: 'معاصر خفيف', J: 'معاصر حجري', auto: 'تلقائي', '': '—' };
const SIDE_AR = { n: 'شمال', s: 'جنوب', e: 'شرق', w: 'غرب' }, sides = a => (a || []).map(x => SIDE_AR[x] || x).join('، ') || '—';
const styleName = s => STYLE_AR[s] || s || '—';

async function api(path, { method = 'GET', body } = {}) {
  const headers = { accept: 'application/json' };
  if (method !== 'GET') { headers['content-type'] = 'application/json'; headers['x-admin-request'] = '1'; if (csrf) headers['x-csrf-token'] = csrf; }
  const res = await fetch('/api/admin' + path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => ({})) : res;
  if (!res.ok) { const e = new Error(data.message || 'تعذّر تنفيذ الطلب.'); e.status = res.status; e.data = data; throw e; }
  return data;
}
function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const saveText = (name, text, type = 'application/json') => saveBlob(name, new Blob([text], { type: type + ';charset=utf-8' }));

// ---------------------------------------------------------------- نموذج كلمة السر مع مقياس القوة (تقدير محلي؛ الخادم هو الحكم)
function localStrength(pw) {
  const chars = [...pw]; let score = 0, msg = '';
  if (chars.length < MIN_PW) msg = `قصيرة: ${MIN_PW} حرفًا على الأقل (الآن ${chars.length}).`;
  else if (new Set(chars).size < 6) msg = 'أحرفها متكررة كثيرًا.';
  else {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length, uniq = new Set(chars).size;
    score = 1; if (chars.length >= 14 && classes >= 2) score = 2; if (chars.length >= 16 && classes >= 3 && uniq >= 10) score = 3; if (chars.length >= 20 && classes >= 3 && uniq >= 12) score = 4;
    msg = ['', 'مقبولة', 'جيدة', 'قوية', 'قوية جدًا'][score];
  }
  return { score, msg };
}
function pwFields(prefix = '') {
  const pw = h('input', { type: 'password', autocomplete: 'new-password', id: prefix + 'pw', maxLength: 200 }), cf = h('input', { type: 'password', autocomplete: 'new-password', id: prefix + 'cf', maxLength: 200 });
  const bar = h('div', { class: 'meter', 'data-s': '0' }, h('i')), msg = h('p', { class: 'mute', 'aria-live': 'polite' });
  pw.addEventListener('input', () => { const s = localStrength(pw.value); bar.dataset.s = String(s.score); msg.textContent = pw.value ? s.msg : ''; });
  return { pw, cf, nodes: [h('label', { class: 'field' }, 'كلمة السر الجديدة (12 حرفًا فأكثر)', pw, bar, msg), h('label', { class: 'field' }, 'تأكيد كلمة السر', cf)] };
}
const errBox = () => h('p', { class: 'err', role: 'alert' });

// ---------------------------------------------------------------- الشاشات الأولية
function screenNoDb() {
  const cmd = 'npx wrangler d1 execute almizan-archive --remote --file db/admin.sql';
  mount(h('div', { class: 'center' }, h('section', { class: 'panel wide' },
    h('h1', {}, 'الإدارة: يلزم إعداد قاعدة البيانات أولًا'),
    h('p', {}, 'جداول الإدارة غير موجودة بعد في قاعدة D1، ولذلك لا تعمل الإدارة (ولن تعمل أبدًا بوضع مفتوح). شغّل الأمر التالي مرة واحدة من مجلد المشروع على جهازك، ثم أعد تحميل هذه الصفحة:'),
    h('pre', {}, cmd), h('p', { class: 'mute' }, 'بعد تشغيله أنشئ كلمة السر فورًا: أول من ينشئها يملك الإدارة.'))));
}
function screenClosed() {
  mount(h('div', { class: 'center' }, h('section', { class: 'panel' }, h('h1', {}, 'الإدارة مغلقة'), h('p', {}, 'حذف المالك كلمة السر وأُغلقت الإدارة. لإعادة تفعيلها يضع المالك المتغير ADMIN_REOPEN=1 عبر wrangler كما في worker/README.md.'))));
}
function screenSetup(reopen) {
  const f = pwFields('s'), err = errBox(), btn = h('button', { class: 'btn primary', type: 'submit' }, 'إنشاء كلمة سر الإدارة');
  const form = h('form', { autocomplete: 'off', on: { submit: async e => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try { const r = await api('/setup', { method: 'POST', body: { password: f.pw.value, confirm: f.cf.value } }); csrf = r.csrf; f.pw.value = f.cf.value = ''; await boot(); }
    catch (x) { err.textContent = x.message; btn.disabled = false; }
  } } }, ...f.nodes, err, btn);
  mount(h('div', { class: 'center' }, h('section', { class: 'panel' },
    h('h1', {}, reopen ? 'إعادة تفعيل الإدارة' : 'إنشاء كلمة سر الإدارة'),
    h('p', { class: 'warn', role: 'note' }, 'أنشئ كلمة السر الآن؛ أول من ينشئها يملك الإدارة. لا يمكن استرجاعها لاحقًا (تُخزَّن مُجزّأة فقط)، فاحفظها في مدير كلمات سر.'),
    form)));
  f.pw.focus();
}
function screenLogin() {
  const pw = h('input', { type: 'password', autocomplete: 'current-password', maxLength: 300, required: true }), err = errBox(), btn = h('button', { class: 'btn primary', type: 'submit' }, 'دخول');
  mount(h('div', { class: 'center' }, h('section', { class: 'panel' }, h('h1', {}, 'دخول الإدارة'),
    h('form', { on: { submit: async e => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try { const r = await api('/login', { method: 'POST', body: { password: pw.value } }); csrf = r.csrf; pw.value = ''; await boot(); }
      catch (x) { err.textContent = x.message; btn.disabled = false; pw.select(); }
    } } }, h('label', { class: 'field' }, 'كلمة السر', pw), err, btn))));
  pw.focus();
}

// ---------------------------------------------------------------- الإطار
const SECTIONS = [['overview', 'نظرة عامة'], ['designs', 'التصاميم السابقة'], ['controls', 'مفاتيح التحكم'], ['log', 'السجل والجلسات'], ['account', 'الحساب']];
let current = 'overview';
function shell(content) {
  const nav = SECTIONS.map(([id, label]) => h('button', { class: 'nav', type: 'button', 'aria-current': id === current ? 'page' : false, on: { click: () => go(id) } }, label));
  mount(h('div', { class: 'shell' }, h('nav', { class: 'side', 'aria-label': 'أقسام الإدارة' }, h('h1', {}, 'إدارة الميزان الهندسي'), ...nav, h('span', { class: 'sp' }),
    h('button', { class: 'nav', type: 'button', on: { click: async () => { try { await api('/logout', { method: 'POST' }); } catch { /* انتهت */ } csrf = ''; await boot(); } } }, 'تسجيل الخروج')), h('main', { class: 'main' }, content)));
}
async function go(id) {
  current = id; const holder = h('div', {}, h('p', { class: 'mute' }, 'جارٍ التحميل…')); shell(holder);
  try { holder.replaceChildren(...await VIEWS[id]()); } catch (e) { if (e.status === 401) { csrf = ''; return boot(); } holder.replaceChildren(h('p', { class: 'err', role: 'alert' }, e.message)); }
}

// ---------------------------------------------------------------- نظرة عامة
async function viewOverview() {
  const o = await api('/overview'), d = o.designs;
  const card = (n, l) => h('div', { class: 'card' }, h('div', { class: 'n' }, n === null ? '—' : String(n)), h('div', { class: 'l' }, l));
  const svc = Object.values(o.services).map(s => h('div', { class: 'row' }, h('span', {}, s.label), h('span', {}, h('span', { class: 'pill ' + (s.on ? 'on' : 'off') }, s.on ? 'يعمل' : 'متوقف'), ' ', h('span', { class: 'mute' }, s.note))));
  return [h('h2', {}, 'نظرة عامة'),
    h('div', { class: 'cards' }, card(d ? d.today : null, 'تصاميم مؤرشفة اليوم'), card(d ? d.week : null, 'آخر 7 أيام'), card(d ? d.total : null, 'إجمالي الأرشيف'),
      card(o.photo.usedToday === null ? null : `${o.photo.usedToday} / ${o.photo.cap}`, 'الصور الاحترافية اليوم مقابل السقف')),
    d ? null : h('p', { class: 'warn' }, 'جدول التصاميم المؤرشفة غير موجود؛ شغّل db/admin.sql.'),
    h('p', { class: 'mute' }, 'عدّاد الصور: ' + o.photo.store), h('h3', {}, 'حالة الخدمات'), h('div', { class: 'card' }, ...svc),
    h('p', {}, 'إصدار الموقع: ', h('code', {}, o.version.commit), o.version.builtAt ? ' — بُني ' + fmtDate(o.version.builtAt) : ''),
    h('p', { class: 'mute' }, 'ما لا تستطيعه الإدارة: تعديل الكود أو نشر إصدار أو تغيير الأسرار (مفاتيح API ورمز الدخول) يتم عبر wrangler وGitHub لا من هنا. «يعمل» تعني أن الخدمة مهيأة لا أن النموذج اختُبر حيًا.')];
}

// ---------------------------------------------------------------- التصاميم السابقة
const q = { page: 1, per: 25, order: 'desc', q: '', style: '', floors: '' };
const selected = new Set();
function qs(extra = {}) { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...q, ...extra })) if (v !== '' && v !== null) p.set(k, v); return p.toString(); }
async function viewDesigns() {
  const data = await api('/designs?' + qs());
  const pages = Math.max(1, Math.ceil(data.total / data.per)), host = h('div');
  const reload = () => go('designs');
  const search = h('input', { type: 'search', placeholder: 'بحث: رقم D-000123 أو طراز', value: q.q, on: { keydown: e => { if (e.key === 'Enter') { q.q = e.target.value.trim(); q.page = 1; reload(); } } } });
  const sel = (key, opts, label) => h('select', { 'aria-label': label, on: { change: e => { q[key] = e.target.value; q.page = 1; reload(); } } }, ...opts.map(([v, t]) => h('option', { value: v, selected: String(q[key]) === v }, t)));
  const checkAll = h('input', { type: 'checkbox', 'aria-label': 'تحديد كل ما في الصفحة', on: { change: e => { for (const r of data.rows) e.target.checked ? selected.add(r.id) : selected.delete(r.id); reload(); } } });
  checkAll.checked = data.rows.length > 0 && data.rows.every(r => selected.has(r.id));
  const rows = data.rows.map(r => h('tr', {},
    h('td', {}, h('input', { type: 'checkbox', 'aria-label': 'تحديد ' + r.number, checked: selected.has(r.id), on: { change: e => { e.target.checked ? selected.add(r.id) : selected.delete(r.id); bulk.update(); } } })),
    h('td', {}, h('b', {}, r.number)), h('td', {}, fmtDate(r.created_at)), h('td', {}, styleName(r.style)), h('td', {}, String(r.floors)),
    h('td', {}, `${r.plot_width ?? '—'} × ${r.plot_length ?? '—'} م`), h('td', {}, r.plot_area === null ? '—' : r.plot_area + ' م²'), h('td', {}, r.bedrooms ?? '—'), h('td', {}, fmtBytes(r.bytes)),
    h('td', {}, h('button', { class: 'btn', type: 'button', on: { click: () => preview(r.id) } }, 'معاينة'), ' ', h('button', { class: 'btn', type: 'button', on: { click: () => downloadOne(r.id) } }, 'JSON'), ' ',
      h('button', { class: 'btn danger', type: 'button', on: { click: async () => { if (!confirm(`حذف التصميم ${r.number} نهائيًا؟`)) return; await api('/designs/' + r.id, { method: 'DELETE' }); selected.delete(r.id); reload(); } } }, 'حذف'))));
  const bulk = (() => {
    const count = h('span', { class: 'mute' }), zipSel = h('button', { class: 'btn', type: 'button', on: { click: () => zipDesigns([...selected]) } }, 'تحميل المحدد (zip)'),
      delSel = h('button', { class: 'btn danger', type: 'button', on: { click: async () => { if (!confirm(`حذف ${selected.size} تصميم نهائيًا؟`)) return; await api('/designs/delete', { method: 'POST', body: { ids: [...selected] } }); selected.clear(); reload(); } } }, 'حذف المحدد');
    const update = () => { count.textContent = selected.size ? `محدد: ${selected.size}` : ''; zipSel.disabled = delSel.disabled = !selected.size; };
    update(); return { nodes: [count, zipSel, delSel], update };
  })();
  const status = h('span', { class: 'mute', 'aria-live': 'polite' });
  host.append(h('h2', {}, 'التصاميم السابقة'), h('p', { class: 'mute' }, 'تصاميم العملاء الذين وافقوا صراحةً على حفظ نسخة (بلا أسماء ولا بيانات شخصية، والإحداثيات مقرّبة إلى نحو كيلومتر). الترقيم تصاعدي ولا يُعاد استعمال رقم محذوف.'),
    h('div', { class: 'toolbar' }, search, h('button', { class: 'btn', type: 'button', on: { click: () => { q.q = search.value.trim(); q.page = 1; reload(); } } }, 'بحث'),
      sel('style', [['', 'كل الطرز'], ['S', 'سلماني'], ['modern', 'معاصر'], ['H', 'حجازي'], ['N', 'نجدي'], ['C', 'كلاسيكي']], 'الطراز'),
      sel('floors', [['', 'كل الأدوار'], ['1', 'دور'], ['2', 'دوران'], ['3', '3 أدوار']], 'الأدوار'),
      sel('order', [['desc', 'الأحدث أولًا'], ['asc', 'الأقدم أولًا']], 'الترتيب'), sel('per', [['25', '25'], ['50', '50'], ['100', '100']], 'عدد الصفوف')),
    h('div', { class: 'toolbar' }, ...bulk.nodes, h('button', { class: 'btn', type: 'button', on: { click: () => zipDesigns(null, status) } }, 'تحميل الكل (zip)'),
      h('button', { class: 'btn', type: 'button', on: { click: async () => { const r = await api('/designs.csv?' + qs({ page: '', per: '' })); saveBlob('mizan-designs-index.csv', await r.blob()); } } }, 'فهرس CSV'), status),
    h('div', { class: 'tablewrap' }, h('table', {}, h('caption', { class: 'mute' }, `${data.total} تصميم`), h('thead', {}, h('tr', {}, h('th', {}, checkAll), ...['الرقم', 'التاريخ', 'الطراز', 'الأدوار', 'الأرض', 'المساحة', 'غرف النوم', 'الحجم', 'إجراءات'].map(t => h('th', {}, t)))), h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colSpan: 10 }, 'لا تصاميم مطابقة.'))))),
    h('div', { class: 'pager' }, h('button', { class: 'btn', type: 'button', disabled: q.page <= 1, on: { click: () => { q.page--; reload(); } } }, 'السابقة'), h('span', {}, `صفحة ${data.page} من ${pages}`),
      h('button', { class: 'btn', type: 'button', disabled: q.page >= pages, on: { click: () => { q.page++; reload(); } } }, 'التالية')));
  return [host];
}
const envelope = r => ({ schema: 'mizan-client-design/1', number: r.number, id: r.id, createdAt: r.created_at, note: 'نسخة مؤرشفة بموافقة العميل؛ doc بصيغة المرسم (mizan-draw/1) تُفتح في المرسم.', ...r.design });
async function downloadOne(id) { const r = await api('/designs/' + id); saveText(r.number + '.json', JSON.stringify(envelope(r), null, 2)); }
async function zipDesigns(ids, status) {
  const entries = [], say = t => { if (status) status.textContent = t; };
  try {
    let after = 0;
    for (;;) {
      const page = await api('/designs/bulk?' + (ids ? 'ids=' + ids.slice(entries.length / 2, entries.length / 2 + 20).join(',') : 'after=' + after));
      if (!page.rows.length) break;
      for (const r of page.rows) { after = Math.max(after, r.id); entries.push({ name: `${r.number}/design.json`, text: JSON.stringify(envelope({ ...r, id: r.id }), null, 2) }, { name: `${r.number}/studio-doc.json`, text: JSON.stringify(r.design.doc) }); }
      say(`جُمع ${entries.length / 2} تصميم…`);
      if (ids && entries.length / 2 >= ids.length) break;
    }
    if (!entries.length) { say('لا تصاميم للتحميل.'); return; }
    entries.push({ name: 'README.txt', text: 'تصاميم عملاء الميزان الهندسي المحفوظة بموافقتهم. design.json = الغلاف الكامل، studio-doc.json = مستند المرسم (يُفتح في المرسم).\n' });
    saveBlob('mizan-designs.zip', new Blob([await zipBuild(entries)], { type: 'application/zip' })); say(`تم تجهيز ${(entries.length - 1) / 2} تصميم.`);
  } catch (e) { say('تعذّر التجهيز: ' + e.message); }
}
async function preview(id) {
  const r = await api('/designs/' + id), d = r.design, dlg = h('dialog', { 'aria-label': 'معاينة ' + r.number });
  const plans = h('div', { class: 'plans' }), urls = [];
  try {
    for (const lv of d.doc.levels) { const url = URL.createObjectURL(new Blob([planSheetSvg(d.doc, { levelId: lv.id, sheet: 'A3' })], { type: 'image/svg+xml' })); urls.push(url); plans.append(h('figure', {}, h('img', { src: url, alt: 'مسقط ' + (lv.name || lv.id) }), h('figcaption', { class: 'mute' }, lv.name || lv.id))); }
  } catch (e) { plans.append(h('p', { class: 'warn' }, 'تعذّر رسم المسقط (' + e.message + ')؛ البيانات المنظمة أدناه.')); }
  const L = d.land || {};
  dlg.append(h('h2', {}, `${r.number} — ${styleName(d.exterior?.style)}`),
    h('dl', { class: 'kv' }, h('dt', {}, 'التاريخ'), h('dd', {}, fmtDate(r.created_at)), h('dt', {}, 'الأرض'), h('dd', {}, `${L.width} × ${L.length} م — شوارع: ${sides(L.streets)} — مداخل: ${sides(L.entries)}`),
      h('dt', {}, 'الأدوار'), h('dd', {}, String(r.floors)), h('dt', {}, 'الموقع (مقرّب ~1 كم)'), h('dd', {}, L.geo ? `${L.geo.lat}, ${L.geo.lng}` : 'غير محدد')),
    plans, h('h3', {}, 'برنامج المتطلبات والطراز (بيانات منظمة)'), h('pre', {}, JSON.stringify({ program: d.program, exterior: d.exterior }, null, 2)),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', on: { click: () => saveText(r.number + '.json', JSON.stringify(envelope(r), null, 2)) } }, 'تحميل JSON'),
      h('button', { class: 'btn', type: 'button', on: { click: () => saveText(r.number + '-studio-doc.json', JSON.stringify(d.doc)) } }, 'ملف المرسم'), h('button', { class: 'btn primary', type: 'button', on: { click: () => dlg.close() } }, 'إغلاق')));
  dlg.addEventListener('close', () => { urls.forEach(u => URL.revokeObjectURL(u)); dlg.remove(); });
  document.body.append(dlg); dlg.showModal();
}

// ---------------------------------------------------------------- مفاتيح التحكم
async function viewControls() {
  const s = await api('/settings'), v = s.values, out = [h('h2', {}, 'مفاتيح التحكم')];
  if (!s.available) out.push(h('p', { class: 'warn' }, 'جدول site_settings غير موجود؛ شغّل db/admin.sql. القيم المعروضة هي الافتراضية ولن تُحفظ.'));
  const save = async (key, value, msg) => { msg.textContent = ''; try { await api('/settings', { method: 'PUT', body: { key, value } }); msg.className = 'ok'; msg.textContent = 'تم الحفظ.'; } catch (e) { msg.className = 'err'; msg.textContent = e.message; } };
  const toggle = (key, label, hint) => {
    const msg = h('span', { 'aria-live': 'polite' }), box = h('input', { type: 'checkbox', checked: key === 'archive_intake_closed' ? v[key] === '1' : v[key] !== '0' });
    box.addEventListener('change', () => save(key, box.checked ? '1' : '0', msg));
    return h('div', { class: 'row' }, h('div', {}, h('b', {}, label), h('div', { class: 'mute' }, hint)), h('label', { class: 'sw' }, box, key === 'archive_intake_closed' ? 'مغلق' : 'مفعّل', msg));
  };
  const cap = h('input', { type: 'number', min: 0, max: 500, step: 1, value: v.photo_daily_cap, placeholder: 'الافتراضي', 'aria-label': 'سقف الصور اليومي' }), capMsg = h('span', { 'aria-live': 'polite' });
  const note = h('input', { type: 'text', maxLength: 200, value: v.maintenance_message, 'aria-label': 'رسالة الصيانة' }), noteMsg = h('span', { 'aria-live': 'polite' });
  out.push(h('div', { class: 'card' },
    toggle('photo_enabled', 'خدمة الصورة الاحترافية', 'إيقافها يخفي الزر ويرفض الطلبات فورًا (يعمل أيضًا إن كان PHOTO_DAILY_CAP=0).'),
    toggle('geo_search_enabled', 'بحث الخريطة بالاسم', 'يُوقَف إن أوقفه الإعداد أو المتغير GEO_NOMINATIM_OFF أيهما.'),
    toggle('archive_intake_closed', 'إغلاق استقبال الأرشيف', 'يرفض حفظ تصاميم جديدة؛ لا يحذف الموجود.'),
    h('div', { class: 'row' }, h('div', {}, h('b', {}, 'سقف الصور اليومي'), h('div', { class: 'mute' }, 'من 0 إلى 500؛ فارغ = قيمة PHOTO_DAILY_CAP أو الافتراضي (40). يتجاوز الإعداد المتغير.')),
      h('span', { class: 'sw' }, cap, h('button', { class: 'btn', type: 'button', on: { click: () => save('photo_daily_cap', cap.value.trim(), capMsg) } }, 'حفظ'), capMsg)),
    h('div', { class: 'row' }, h('div', {}, h('b', {}, 'رسالة صيانة أعلى كل الصفحات'), h('div', { class: 'mute' }, 'نص قصير (200 حرف). اتركه فارغًا لإخفائها.')),
      h('span', { class: 'sw' }, note, h('button', { class: 'btn', type: 'button', on: { click: () => save('maintenance_message', note.value, noteMsg) } }, 'حفظ'), noteMsg))),
    h('p', { class: 'mute' }, 'تُطبَّق التغييرات خلال نحو 10 ثوانٍ (كاش قصير).'));
  return out;
}

// ---------------------------------------------------------------- السجل والجلسات
async function viewLog() {
  const [a, s] = await Promise.all([api('/audit?limit=200'), api('/sessions')]);
  const msg = h('span', { 'aria-live': 'polite' });
  return [h('h2', {}, 'الجلسات'),
    h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['بدأت', 'آخر نشاط', 'تنتهي', ''].map(t => h('th', {}, t)))), h('tbody', {}, ...s.rows.map(r => h('tr', {}, h('td', {}, fmtDate(r.created_at)), h('td', {}, fmtDate(r.last_seen)), h('td', {}, fmtDate(r.expires_at)), h('td', {}, r.current ? h('span', { class: 'pill on' }, 'هذه الجلسة') : '')))))),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', on: { click: async () => { const r = await api('/sessions/revoke-others', { method: 'POST' }); msg.textContent = `أُنهيت ${r.revoked} جلسة.`; go('log'); } } }, 'إنهاء الجلسات الأخرى'),
      h('button', { class: 'btn danger', type: 'button', on: { click: async () => { if (!confirm('إنهاء كل الجلسات بما فيها هذه؟')) return; await api('/sessions/revoke-all', { method: 'POST' }); csrf = ''; boot(); } } }, 'إنهاء كل الجلسات'), msg),
    h('h2', {}, 'سجل التدقيق'), h('p', { class: 'mute' }, 'كل كتابة إدارية، بلا أسرار.'),
    h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['#', 'الوقت', 'الإجراء', 'التفاصيل'].map(t => h('th', {}, t)))), h('tbody', {}, ...a.rows.map(r => h('tr', {}, h('td', {}, String(r.id)), h('td', {}, fmtDate(r.at)), h('td', {}, r.action), h('td', {}, r.detail))))))];
}

// ---------------------------------------------------------------- الحساب
async function viewAccount() {
  const cur = h('input', { type: 'password', autocomplete: 'current-password', maxLength: 300 }), f = pwFields('a'), err = errBox(), ok = h('p', { class: 'ok', 'aria-live': 'polite' });
  const change = h('form', { on: { submit: async e => {
    e.preventDefault(); err.textContent = ok.textContent = '';
    try { const r = await api('/password/change', { method: 'POST', body: { current: cur.value, password: f.pw.value, confirm: f.cf.value } }); csrf = r.csrf; cur.value = f.pw.value = f.cf.value = ''; ok.textContent = 'تم تغيير كلمة السر وأُبطلت كل الجلسات الأخرى.'; }
    catch (x) { err.textContent = x.message; }
  } } }, h('label', { class: 'field' }, 'كلمة السر الحالية', cur), ...f.nodes, err, ok, h('button', { class: 'btn primary', type: 'submit' }, 'تغيير كلمة السر'));
  const dpw = h('input', { type: 'password', autocomplete: 'current-password', maxLength: 300 }), dtx = h('input', { type: 'text', autocomplete: 'off', placeholder: 'احذف' }), derr = errBox();
  const disable = h('form', { on: { submit: async e => {
    e.preventDefault(); derr.textContent = '';
    if (!confirm('ستُغلق الإدارة كليًا ولن يستطيع أحد دخولها حتى تعيد تفعيلها عبر wrangler. متابعة؟')) return;
    try { await api('/password/disable', { method: 'POST', body: { password: dpw.value, confirmText: dtx.value.trim() } }); csrf = ''; await boot(); } catch (x) { derr.textContent = x.message; }
  } } }, h('p', { class: 'warn' }, 'حذف كلمة السر يغلق الإدارة كليًا (503) ولا يفتح الإعداد الأول لأي زائر، منعًا لاختطافها. إعادة التفعيل: ADMIN_REOPEN=1 عبر wrangler (انظر worker/README.md).'),
    h('label', { class: 'field' }, 'كلمة السر', dpw), h('label', { class: 'field' }, 'اكتب «احذف» للتأكيد', dtx), derr, h('button', { class: 'btn danger', type: 'submit' }, 'حذف كلمة السر وإغلاق الإدارة'));
  return [h('h2', {}, 'الحساب'), h('div', { class: 'card' }, h('h3', {}, 'تغيير كلمة السر'), change),
    h('div', { class: 'card' }, h('h3', {}, 'تصدير بيانات الإدارة'), h('p', { class: 'mute' }, 'الإعدادات وسجل التدقيق وفهرس التصاميم والجلسات (بلا كلمة السر أو تجزئتها أو رموز الجلسات).'),
      h('button', { class: 'btn', type: 'button', on: { click: async () => { const r = await api('/export'); saveBlob('mizan-admin-export.json', await r.blob()); } } }, 'تصدير JSON')),
    h('div', { class: 'card' }, h('h3', {}, 'تعطيل الإدارة'), disable)];
}
const VIEWS = { overview: viewOverview, designs: viewDesigns, controls: viewControls, log: viewLog, account: viewAccount };

// ---------------------------------------------------------------- الإقلاع
async function boot() {
  try {
    const s = await api('/state');
    if (s.state === 'no_db') return screenNoDb();
    if (s.state === 'setup') return screenSetup(!!s.reopen);
    if (s.state === 'login') return screenLogin();
    if (s.state === 'authed') {
      if (!csrf) csrf = (await api('/session')).csrf; // جلسة قائمة بعد إعادة تحميل: الرمز مشتق من الجلسة ولا يقرؤه موقع آخر
      return go(current);
    }
    mount(h('p', { class: 'boot' }, 'حالة غير معروفة.'));
  } catch (e) {
    if (e.status === 503 && e.data?.state === 'closed') return screenClosed();
    mount(h('div', { class: 'center' }, h('section', { class: 'panel' }, h('p', { class: 'err', role: 'alert' }, e.message))));
  }
}
boot();
