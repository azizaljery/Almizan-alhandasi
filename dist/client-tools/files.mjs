const DB = 'mizan-client-tool-files', STORE = 'files';
let pending;
function database() {
  if (!pending) pending = new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(Error('تعذر فتح مخزن ملفات المشروع.')); });
  return pending;
}
async function transaction(mode, op) {
  const db = await database(); return new Promise((resolve, reject) => { const t = db.transaction(STORE, mode), r = op(t.objectStore(STORE)); t.oncomplete = () => resolve(r.result); t.onerror = () => reject(Error('تعذر حفظ الملف؛ قد تكون مساحة المتصفح ممتلئة.')); t.onabort = () => reject(Error('لم يكتمل حفظ الملف.')); });
}
export const putFile = (id, blob) => transaction('readwrite', s => s.put(blob, id));
export const getFile = id => transaction('readonly', s => s.get(id));
export const removeFile = id => transaction('readwrite', s => s.delete(id));
export const dataUrl = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('تعذر قراءة الملف.')); r.readAsDataURL(blob); });
export function download(name, content, type = 'application/json') {
  const a = document.createElement('a'), url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function decodedImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12_000_000) throw Error('اختر صورة PNG أو JPEG أو WebP بحجم حتى 12 ميغابايت.');
  const img = await createImageBitmap(file); if (img.width * img.height > 60_000_000) { img.close(); throw Error('أبعاد الصورة كبيرة جدًا.'); } return img;
}
export async function imageForVision(file) {
  const image = await decodedImage(file), ratio = Math.min(1, 1400 / Math.max(image.width, image.height)), canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
  return { type: 'image/jpeg', data: canvas.toDataURL('image/jpeg', .85).split(',')[1] };
}
export async function compressedImage(file) {
  const image = await imageForVision(file);
  return (await fetch('data:' + image.type + ';base64,' + image.data)).blob();
}
export async function colorsOf(file) {
  const img = await decodedImage(file), c = document.createElement('canvas'); c.width = c.height = 60; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 60, 60); img.close();
  const data = ctx.getImageData(0, 0, 60, 60).data, bins = new Map();
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 128) continue; const rgb = [0, 1, 2].map(k => Math.min(255, Math.round(data[i + k] / 32) * 32)); const key = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''); bins.set(key, (bins.get(key) || 0) + 1); }
  return [...bins].sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
}
