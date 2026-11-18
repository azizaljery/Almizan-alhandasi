import { parseDoc } from './draw/doc.mjs';
import { documentHash, deliveryFetch } from './delivery-ui.mjs';
const q = new URLSearchParams(location.search), id = q.get('id') || '', hash = q.get('hash') || '';
const state = document.getElementById('receiptState'); let verified = false;
async function verify() {
  try {
    const r = await deliveryFetch('/api/delivery/verify?id=' + encodeURIComponent(id) + '&hash=' + encodeURIComponent(hash), { cache: 'no-store' }, { timeout: 15000 });
    if (!r.ok) throw Error('السجل غير متاح الآن.'); const data = await r.json();
    verified = data.valid === true;
    state.textContent = verified ? 'إيصال صحيح — حُجزت هذه البصمة بتاريخ ' + new Date(data.deliveredAt).toLocaleString('ar-SA') + '. رقم الإيصال: ' + id : 'لم يثبت إيصال مطابق بهذه البيانات. راجع رقم الإيصال وبصمة الملف.';
  } catch { state.textContent = 'تعذر الوصول إلى سجل التسليم؛ لم يتأكد الإيصال. أعد المحاولة لاحقًا.'; }
}
document.getElementById('receiptFile').addEventListener('change', async e => {
  const f = e.target.files?.[0], out = document.getElementById('fileState'); if (!f) return;
  try {
    if (f.size > 1500000) throw Error('ملف المخطط أكبر من الحد المسموح للفحص.');
    if (!verified) throw Error('تحقق من الإيصال الخادمي أولًا؛ لا تكفي مطابقة الملف وحدها.');
    const doc = parseDoc(await f.text());
    out.textContent = await documentHash(doc) === hash ? 'الملف يطابق بصمة النسخة المسلّمة في هذا الإيصال.' : 'الملف مختلف عن النسخة المسلّمة؛ لا ينطبق عليه هذا الإيصال.';
  } catch (err) { out.textContent = err.message || 'تعذر فحص الملف.'; }
});
verify();
