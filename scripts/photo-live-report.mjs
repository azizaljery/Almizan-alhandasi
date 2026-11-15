// تجميع نتائج الفحص الحي للصور وتقرير HTML بجانب المقارنة (قبل/بعد) ودرجة الأمانة. نقي: لا شبكة ولا ملفات (الاستدعاء يمرّر النصوص).
import { STYLE_AR, LIGHT_AR } from './photo-live-matrix.mjs';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 1000) / 1000 : null;

/** تقدير تكلفة الدفعة من صفحة تسعير Workers AI المنشورة (developers.cloudflare.com/workers-ai/platform/pricing): تقدير لا فاتورة. */
export function costEstimate(counts = {}, { w = 1536, h = 960, steps = 28 } = {}) {
  const mp = w * h / 1e6, standardEach = 0.015 + Math.max(0, mp - 1.048576) * 0.002 + mp * 0.002; // klein-9b: 0.015 لأول ميغابكسل، 0.002 لكل إضافي، 0.002 لكل ميغابكسل مدخل
  const ow = 2048, oh = Math.round(2048 * h / w), outTiles = ow * oh / 262144, inTiles = w * h / 262144;
  const premiumEach = outTiles * steps * 0.00041 + inTiles * steps * 0.00021; // dev: 0.00041 لكل بلاطة خرج 512² لكل خطوة، 0.00021 لكل بلاطة مدخل
  const r = v => Math.round(v * 1000) / 1000;
  return { standardEach: r(standardEach), premiumEach: r(premiumEach), total: r((counts.standard || 0) * standardEach + (counts.premium || 0) * premiumEach), note: 'تقدير من أسعار Workers AI المنشورة في الوثائق (دولار أمريكي)؛ ليس فاتورة، والسعر قد يتغير — غير متحقق من فاتورة الحساب.' };
}
export function aggregate(results) {
  const ok = results.filter(r => r.ok), scored = ok.filter(r => r.fidelity && Number.isFinite(r.fidelity.score));
  const group = key => { const g = {}; for (const r of scored) { const k = key(r); (g[k] ||= []).push(r); } return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { n: v.length, avg: avg(v.map(x => x.fidelity.score)), pass: v.filter(x => x.fidelity.ok).length }])); };
  return { total: results.length, generated: ok.length, failed: results.length - ok.length, scored: scored.length, pass: scored.filter(r => r.fidelity.ok).length, below: scored.filter(r => !r.fidelity.ok).length, avg: avg(scored.map(r => r.fidelity.score)), byStyle: group(r => r.style), byLighting: group(r => r.lighting), byFloors: group(r => r.floors) };
}
const table = (title, g, name) => `<h3>${esc(title)}</h3><table><tr><th>${esc(title)}</th><th>صور</th><th>متوسط الأمانة</th><th>تجتاز العتبة</th></tr>${Object.entries(g).map(([k, v]) => `<tr><td>${esc(name(k))}</td><td>${v.n}</td><td>${v.avg}</td><td>${v.pass}/${v.n}</td></tr>`).join('')}</table>`;
/** تقرير HTML مستقل: كل صف قبل/بعد ودرجته. إن لم تُحسب الأمانة في التشغيل (بلا متصفح) تُحسب عند فتح الصفحة بالدالة نفسها المضمَّنة. */
export function reportHtml({ site, at, results, status = {}, fidelitySrc = '', threshold = 0.75, cost = null } = {}) {
  const A = aggregate(results);
  const cards = results.map(r => `<figure class="c ${r.ok ? '' : 'bad'}" data-name="${esc(r.name)}"><div class="pair">${r.input ? `<img src="${esc(r.input)}" alt="المجسم" data-role="in">` : ''}${r.ok ? `<img src="${esc(r.file)}" alt="الناتج" data-role="out">` : `<div class="fail">فشل: ${esc(r.http)} ${esc(r.error || '')} ${esc(r.code || '')} ${esc(r.detail || '')}</div>`}</div>
<figcaption><b>${esc(STYLE_AR[r.style] || r.style)}</b> · ${esc(LIGHT_AR[r.lighting] || r.lighting)} · ${r.floors === 1 ? 'دور' : 'دوران'} · ${r.tier === 'premium' ? 'ممتاز' : 'قياسي'}${r.ok ? ` · ${(r.ms / 1000).toFixed(1)} ث` : ''}<br><span class="sc" data-s="${r.fidelity ? esc(r.fidelity.score) : ''}">${r.ok ? (r.fidelity ? `أمانة ${esc(r.fidelity.score)} — ${r.fidelity.ok ? 'تجتاز' : 'دون العتبة'} (رأسي ${esc(r.fidelity.vertical)}، أفقي ${esc(r.fidelity.horizontal)}، كتلة ${esc(r.fidelity.massing)})` : 'أمانة: تُحسب عند فتح الصفحة…') : 'فشل'}</span></figcaption></figure>`).join('\n');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تقرير الفحص الحي للصور</title>
<style>:root{color-scheme:light dark;--bg:#faf7f0;--ink:#17332a;--card:#fff;--line:#e6dfd0;--bad:#9b2c1d}@media(prefers-color-scheme:dark){:root{--bg:#10201b;--ink:#efe9da;--card:#17302a;--line:#2c4a41;--bad:#ff9d8a}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.7 system-ui,"Segoe UI",Tahoma,sans-serif}h1{font-size:20px;margin:0 0 4px}h3{margin:14px 0 4px;font-size:15px}table{border-collapse:collapse;margin:0 0 8px}td,th{border:1px solid var(--line);padding:4px 10px;text-align:right}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:12px}.c{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px;direction:ltr}.pair img{width:100%;height:auto;border-radius:8px;display:block}.fail{padding:20px;color:var(--bad)}figcaption{margin-top:6px;font-size:13.5px}.sc.low{color:var(--bad);font-weight:600}.mute{opacity:.75;font-size:13px}</style></head><body>
<h1>تقرير الفحص الحي للصورة المعمارية الاحترافية</h1><p class="mute">${esc(site)} · ${esc(at)} · ${A.generated}/${A.total} صورة · عتبة الأمانة ${threshold} (معايَرة على عيّنة حية واحدة سابقًا — غير متحقق لبقية الطرز) · الدرجة الآلية تقريبية: احكم بعينك بمقارنة اليمين (المجسم) باليسار (الناتج).</p>
<p>الأمانة: متوسط <b id="avg">${esc(A.avg ?? '—')}</b> · تجتاز ${A.pass} من ${A.scored} · دون العتبة ${A.below}${A.failed ? ` · فشل ${A.failed}` : ''}</p>
${cost ? `<p class="mute">التكلفة التقريبية للدفعة: ${esc(cost.total)}$ (قياسي ${esc(cost.standardEach)}$ للصورة، ممتاز ${esc(cost.premiumEach)}$) — ${esc(cost.note)}</p>` : ''}
${A.scored ? table('الطراز', A.byStyle, k => STYLE_AR[k] || k) + table('الإضاءة', A.byLighting, k => LIGHT_AR[k] || k) + table('الأدوار', A.byFloors, k => (k === '1' ? 'دور' : 'دوران')) : ''}
<div class="grid">${cards}</div>
<script>${fidelitySrc.replace(/<\/script/gi, '<\\/script')}
(async () => { if (typeof fidelityScore !== 'function') return;
  const px = img => { const c = document.createElement('canvas'); c.width = 384; c.height = 256; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 384, 256); return x.getImageData(0, 0, 384, 256); };
  const ld = i => i.complete && i.naturalWidth ? Promise.resolve(i) : new Promise(r => { i.onload = () => r(i); i.onerror = () => r(null); });
  const all = [];
  for (const f of document.querySelectorAll('figure.c:not(.bad)')) { const sc = f.querySelector('.sc'); if (sc.dataset.s) continue; const [a, b] = [f.querySelector('[data-role=in]'), f.querySelector('[data-role=out]')]; if (!a || !b) continue;
    const [ia, ib] = await Promise.all([ld(a), ld(b)]); if (!ia || !ib) { sc.textContent = 'أمانة: تعذّر قراءة الصورتين'; continue; }
    try { const r = fidelityScore(px(ia), px(ib)); all.push(r.score); sc.textContent = 'أمانة ' + r.score + ' — ' + (r.ok ? 'تجتاز' : 'دون العتبة') + ' (رأسي ' + r.vertical + '، أفقي ' + r.horizontal + '، كتلة ' + r.massing + ')'; if (!r.ok) sc.classList.add('low'); } catch (e) { sc.textContent = 'أمانة: غير محسوبة'; } }
  if (all.length) document.getElementById('avg').textContent = (all.reduce((x, y) => x + y, 0) / all.length).toFixed(3); })();
</script></body></html>`;
}
