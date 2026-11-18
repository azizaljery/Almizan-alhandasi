import { serialize } from './draw/doc.mjs';

export async function documentHash(doc) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialize(doc)));
  return [...new Uint8Array(b)].map(n => n.toString(16).padStart(2, '0')).join('');
}
const randomKey = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
export const createDesignSeed = () => randomKey().slice(0, 16);
export async function deliveryFetch(url, options = {}, { fetcher = fetch, timeout = 25000 } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetcher(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
export function deliveryClientKey(storage, project) {
  try {
    const scope = storage.getItem('mizan.delivery.active.' + String(project)) || String(project);
    const name = 'mizan.delivery.client.' + scope;
    let key = storage.getItem(name);
    if (!/^[a-f0-9]{64}$/.test(key || '')) { key = randomKey(); storage.setItem(name, key); if (storage.getItem(name) !== key) throw Error(); }
    return key;
  } catch { throw Error('تعذر حفظ مفتاح العميل في المتصفح. اسمح بالتخزين المحلي أو استعد مفتاح حجزك الخاص قبل التسليم.'); }
}
export async function deliveryRequest(doc, key, { claim = false, fetcher = fetch } = {}) {
  try {
    const r = await deliveryFetch('/api/delivery/' + (claim ? 'claim' : 'check'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-delivery-key': key }, body: JSON.stringify({ doc: serialize(doc) }) }, { fetcher });
    const body = await r.json();
    if (!r.ok) throw Object.assign(Error(body.message || 'تعذر الاتصال بسجل التسليم.'), { code: body.error });
    return body;
  } catch (e) {
    if (typeof e.code === 'string') throw e;
    throw Error(e.name === 'AbortError' ? 'تأخر سجل التسليم؛ لم يتأكد الحجز. أعد المحاولة، وسيبقى مشروعك كما هو.' : 'تعذر الاتصال بسجل التسليم؛ لم يتأكد الحجز. أعد المحاولة عند عودة الاتصال.');
  }
}
export function mountDelivery(root, { doc, project, storage = localStorage } = {}) {
  let valid = false, record = null, claiming = false;
  root.innerHTML = '<h2>اعتماد التسليم وحجز بصمة التصميم</h2><p>عند التسليم نفحص توزيع الفراغات مقابل التصاميم المسلّمة لجميع العملاء. تغيير الاسم أو الألوان أو عكس المخطط لا يجعله تصميمًا جديدًا. الحجز داخل المنصة، والمعاينة متاحة قبل التسليم.</p><button class="btn gold" type="button" id="deliveryClaim">اعتماد التصميم وحجزه للتسليم</button> <button class="btn" type="button" id="deliveryRecovery" hidden>نزّل مفتاح استعادة الحجز (خاص)</button> <label class="btn" style="display:inline-block">استعادة حجز عميل<input type="file" id="deliveryImport" accept="application/json,.json" hidden></label><p id="deliveryStatus" role="status" aria-live="polite">لم يُؤكَّد التسليم بعد. احجز البصمة قبل تنزيل حزمة التسليم.</p>';
  const status = root.querySelector('#deliveryStatus'), button = root.querySelector('#deliveryClaim'), backup = root.querySelector('#deliveryRecovery');
  const activeKey = 'mizan.delivery.active.' + String(project);
  const keyStorageName = () => 'mizan.delivery.client.' + (storage.getItem(activeKey) || String(project));
  const newClient = document.createElement('button'), originalClient = document.createElement('button');
  newClient.type = originalClient.type = 'button'; newClient.className = originalClient.className = 'btn';
  newClient.id = 'deliveryNewClient'; originalClient.id = 'deliveryOriginalClient';
  newClient.textContent = 'هذه نسخة لعميل جديد'; originalClient.textContent = 'العودة لعميل المشروع الأصلي';
  originalClient.hidden = !storage.getItem(activeKey); root.insertBefore(newClient, status); root.insertBefore(originalClient, status);
  const switchClient = next => {
    if (claiming) return;
    try {
      if (next) storage.setItem(activeKey, String(project) + '.new.' + createDesignSeed()); else storage.removeItem(activeKey);
      deliveryClientKey(storage, project); // Persist the new credential before permitting any claim.
      valid = false; record = null; backup.hidden = true; originalClient.hidden = !next;
      status.textContent = next ? 'أعددت تسليمًا لعميل جديد. حجز العميل الأصلي لا ينتقل إليه؛ غيّر توزيع المخطط ثم افحص الحجز. مفتاح العميل الأصلي باقٍ في هذا المتصفح.' : 'عدت إلى عميل المشروع الأصلي؛ أعد التحقق من حجزه قبل تنزيل التسليم.';
    } catch (e) { valid = false; status.textContent = e.message; }
  };
  newClient.addEventListener('click', () => switchClient(true)); originalClient.addEventListener('click', () => switchClient(false));
  const claim = async candidateKey => {
    if (claiming) return;
    claiming = true;
    button.disabled = true; status.textContent = 'أفحص البصمة وأوثّق حجز هذا التصميم…'; valid = false;
    try {
      const key = typeof candidateKey === 'string' ? candidateKey : deliveryClientKey(storage, project), out = await deliveryRequest(doc, key, { claim: true });
      if (!out.receipt?.id || out.receipt.documentHash !== await documentHash(doc)) throw Error('لم يطابق إيصال التسليم المشروع الحالي؛ أعد المحاولة.');
      const verification = new URL('./delivery.html', location.href); verification.searchParams.set('id', out.receipt.id); verification.searchParams.set('hash', out.receipt.documentHash);
      record = { clientKey: key, receipt: { ...out.receipt, verificationUrl: verification.href } }; valid = true; backup.hidden = false;
      let persisted = true; try { storage.setItem(keyStorageName(), key); } catch { persisted = false; }
      status.textContent = 'تم حجز بصمة التصميم لهذا العميل. رقم التسليم: ' + out.receipt.id + ' — احتفظ بمفتاح الاستعادة الخاص لتطوير نسخه لاحقًا. أي تعديل هندسي يحتاج تحققًا جديدًا.';
      const link = document.createElement('a'); link.href = verification.href; link.textContent = ' تحقق من الإيصال'; link.target = '_blank'; link.rel = 'noopener'; status.append(link);
      if (!persisted) status.append(document.createTextNode(' تعذر الاحتفاظ بالمفتاح في المتصفح؛ نزّل مفتاح الاستعادة الخاص الآن.'));
      button.textContent = 'إعادة التحقق من حجز التسليم';
    } catch (e) { backup.hidden = true; status.textContent = e.message || 'لم يتأكد التسليم؛ أعد المحاولة.'; }
    finally { button.disabled = false; claiming = false; }
  };
  button.addEventListener('click', claim);
  backup.addEventListener('click', () => {
    if (!record || !valid) return;
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'mizan-delivery-recovery/1', ...record }, null, 2)], { type: 'application/json' }));
    a.href = url; a.download = 'mizan-private-delivery-recovery.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  root.querySelector('#deliveryImport').addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      if (f.size > 32000) throw Error('ملف الاستعادة أكبر من المسموح.');
      const r = JSON.parse(await f.text());
      if (r.format !== 'mizan-delivery-recovery/1' || !/^[a-f0-9]{64}$/.test(r.clientKey || '')) throw Error('ملف استعادة غير صالح.');
      await claim(r.clientKey);
    } catch (err) { valid = false; status.textContent = err.message; }
    e.target.value = '';
  });
  return { canExport: () => valid, receipt: () => valid ? record.receipt : null, explain() { status.textContent = 'قبل تنزيل المخرجات أو طباعتها، اضغط «اعتماد التصميم وحجزه للتسليم». إن تعارض مع تصميم مسلّم لعميل آخر فاختر توزيعًا مختلفًا.'; root.scrollIntoView({ behavior: 'smooth', block: 'center' }); button.focus({ preventScroll: true }); } };
}
