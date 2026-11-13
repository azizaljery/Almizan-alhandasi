// موافقة العميل على حفظ نسخة من تصميمه في أرشيف الميزان (اختيارية، غير محددة مسبقًا).
// بلا موافقة: لا يُرسل شيء أبدًا (لا طلب شبكة من هذه الوحدة قبل ضغط «احفظ نسخة» مع المربع محددًا).
// ما يُرسل: نموذج التصميم (مستند المرسم) + برنامج المتطلبات (أعداد وتفضيلات معرّفات فقط، بلا نص حر) + الأرض وأبعادها وشوارعها
// + الطراز الخارجي، والموقع مقرّبًا إلى ~1 كم. لا اسم ولا IP ولا نصوص كتبها العميل (الخادم يعيد التنقية ويسقط أي حقل غير معروف).
// رمز الحذف يولَّد هنا ويبقى في هذا المتصفح (mizan.archive.consent.v1)؛ الخادم يحفظ تجزئته فقط.
export const CONSENT_KEY = 'mizan.archive.consent.v1';
export const CONSENT_TEXT = 'أسمح بحفظ نسخة من تصميمي (دون اسمي أو بياناتي الشخصية) في أرشيف الميزان لتحسين الخدمة';
export const API = '/api/archive-consent';
const round2 = v => Math.round(v * 100) / 100;

/** يبني حمولة الإرسال من التخزين المحلي، أو null إن لم يوجد تصميم. لا يقرأ الفكرة الحرة (idea) ولا الحوار. */
export function buildSubmission(local) {
  const read = k => { try { return JSON.parse(local.getItem(k) || 'null'); } catch { return null; } };
  const doc = read('mizan.studio.doc.v1'), session = read('mizan.design.session.v1');
  if (!doc || doc.schema !== 'mizan-draw/1') return null;
  const landRaw = session?.input?.land || null;
  const geo = landRaw?.geo && Number.isFinite(landRaw.geo.lat) && Number.isFinite(landRaw.geo.lng) ? { lat: round2(landRaw.geo.lat), lng: round2(landRaw.geo.lng), north: landRaw.geo.north } : undefined;
  const land = landRaw ? { length: landRaw.length, width: landRaw.width, streets: landRaw.streets, entries: landRaw.entries, floors: landRaw.floors, streetWidths: landRaw.streetWidths, ...(geo ? { geo } : {}) } : null;
  if (!land) return null;
  const req = session?.input?.requirements || {};
  const { notes, ...exterior } = req.prefs?.exterior || {};
  return { doc, land, program: { counts: req.counts, prefs: { ...(req.prefs || {}), exterior: undefined }, extras: req.extras, areas: req.areas }, exterior };
}
export function loadRecord(local) { try { const r = JSON.parse(local.getItem(CONSENT_KEY) || 'null'); return r && Number.isInteger(r.id) && typeof r.token === 'string' ? r : null; } catch { return null; } }
function newToken() { const b = crypto.getRandomValues(new Uint8Array(32)); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const post = (fetchFn, url, method, body, token) => fetchFn(url, { method, headers: { 'content-type': 'application/json', ...(token ? { 'x-archive-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'omit' });

/** يرسل (أو يحدّث) النسخة. consent يجب أن يكون true وإلا يرمي ولا يطلب شيئًا. */
export async function submitCopy({ consent, local, fetchFn = fetch }) {
  if (consent !== true) throw Object.assign(new Error('لا يُرسل شيء دون موافقتك.'), { code: 'consent_required' });
  const body = buildSubmission(local); if (!body) throw Object.assign(new Error('لا يوجد تصميم محفوظ لإرساله.'), { code: 'no_design' });
  const prev = loadRecord(local), token = prev?.token || newToken();
  const res = await post(fetchFn, API + '/designs' + (prev ? '/' + prev.id : ''), prev ? 'PUT' : 'POST', { ...body, consent: true, token }, prev ? token : null);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { if (prev && res.status === 404) { try { local.removeItem(CONSENT_KEY); } catch { /* ... */ } } throw Object.assign(new Error(data.message || 'تعذّر الحفظ.'), { code: data.error, status: res.status }); }
  try { local.setItem(CONSENT_KEY, JSON.stringify({ id: data.id, number: data.number, token, at: Date.now() })); } catch { /* يبقى الحفظ في الخادم لكن بلا رمز حذف محلي */ }
  return data;
}
/** سحب الموافقة: يحذف النسخة من الخادم ثم السجل المحلي. */
export async function withdrawCopy({ local, fetchFn = fetch }) {
  const rec = loadRecord(local); if (!rec) return { ok: true, none: true };
  const res = await post(fetchFn, `${API}/designs/${rec.id}`, 'DELETE', null, rec.token);
  if (!res.ok && res.status !== 404) { const d = await res.json().catch(() => ({})); throw Object.assign(new Error(d.message || 'تعذّر الحذف.'), { status: res.status }); }
  try { local.removeItem(CONSENT_KEY); } catch { /* ... */ }
  return { ok: true };
}

/** يركّب بطاقة الموافقة داخل host. */
export function mountConsent(host, { local = localStorage, fetchFn = (...a) => fetch(...a) } = {}) {
  if (!host) return;
  const el = (t, a = {}, ...k) => { const e = document.createElement(t); for (const [n, v] of Object.entries(a)) { if (v === false || v === undefined) continue; if (n === 'class') e.className = v; else if (n === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else e.setAttribute(n, v === true ? '' : v); } e.append(...k.filter(x => x !== null && x !== undefined)); return e; };
  const status = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const box = el('input', { type: 'checkbox', id: 'archiveConsentBox' }); box.checked = false; // غير محدد مسبقًا
  const send = el('button', { class: 'btn primary', type: 'button', id: 'archiveConsentSend' }, 'احفظ نسخة'), withdraw = el('button', { class: 'btn', type: 'button', id: 'archiveConsentWithdraw' }, 'سحب الموافقة وحذف النسخة');
  const refresh = () => {
    const rec = loadRecord(local);
    send.disabled = !box.checked; send.textContent = rec ? 'حدّث النسخة المحفوظة' : 'احفظ نسخة';
    withdraw.hidden = !rec; if (rec) status.textContent = `نسخة تصميمك محفوظة برقم ${rec.number}. يمكنك سحب موافقتك وحذفها في أي وقت من هذا المتصفح.`;
  };
  box.addEventListener('change', refresh);
  send.addEventListener('click', async () => {
    send.disabled = true; status.textContent = 'جارٍ الحفظ…';
    try { const r = await submitCopy({ consent: box.checked, local, fetchFn }); status.textContent = `تم الحفظ برقم ${r.number}. شكرًا لمساهمتك.`; }
    catch (e) { status.textContent = e.message; }
    refresh();
  });
  withdraw.addEventListener('click', async () => {
    withdraw.disabled = true;
    try { await withdrawCopy({ local, fetchFn }); status.textContent = 'سُحبت موافقتك وحُذفت النسخة من الأرشيف.'; box.checked = false; } catch (e) { status.textContent = e.message; }
    withdraw.disabled = false; refresh();
  });
  host.replaceChildren(
    el('p', {}, 'ساعدنا على تحسين الميزان: يمكنك — إن أحببت — أن نحتفظ بنسخة من تصميمك في أرشيف خاص بالميزان نراجعه لتطوير جودة التصاميم.'),
    el('ul', { class: 'muted' },
      el('li', {}, 'نحفظ: مخططات تصميمك، وبرنامج الغرف الذي طلبته، ومساحة الأرض وأبعادها وشوارعها، والطراز الخارجي.'),
      el('li', {}, 'لا نحفظ: اسمك أو جوالك أو عنوان جهازك أو أي نص كتبته بنفسك. وموقع الأرض يُقرَّب إلى نحو كيلومتر فلا يُعرف مكانها بالضبط.'),
      el('li', {}, 'الموافقة اختيارية: بدونها لا يُرسل أي شيء، وتصميمك يبقى على جهازك. ويمكنك سحبها وحذف النسخة من هنا متى شئت.')),
    el('label', { class: 'consent-line' }, box, ' ' + CONSENT_TEXT), el('p', {}, send, ' ', withdraw), status);
  refresh();
  // لا نطلب شيئًا من الخادم هنا إلا لمعرفة هل الاستقبال مفتوح (بلا أي بيانات من العميل)
  fetchFn(API + '/status', { credentials: 'omit' }).then(r => r.json()).then(s => { if (s && s.open === false) { box.disabled = send.disabled = true; status.textContent = 'استقبال الأرشيف متوقف مؤقتًا.'; } }).catch(() => {});
}
