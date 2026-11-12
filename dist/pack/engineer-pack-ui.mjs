// بطاقة «حزمة المهندس» في أعلى صفحة المخرجات: زر واحد ينزّل ZIP، قائمة المحتوى بأحجامها بعد التجهيز، تقدّم صادق (خطوات فعلية)،
// وأزرار فرعية (DXF فقط، Excel فقط). كل شيء يُبنى في المتصفح ويُنزَّل عبر Blob + a[download]؛ لا شيء يُرفع إلى الخادم.
// iOS Safari: التنزيل البرمجي بعد عمل غير متزامن قد يُحجب أو يُفتح في تبويب؛ لذلك يظهر دائمًا رابط «احفظ الملف» يضغطه المستخدم
// مباشرة، ويبقى عنوان Blob حيًّا حتى التجهيز التالي. المتصفحات المضمّنة داخل التطبيقات (WebView) قد لا تدعم التنزيل أصلًا.
import { buildEngineerPack, packZip, fmtSize, PACK_GROUPS, PACK_DISCLAIMER_AR } from './engineer-pack.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CONTENTS = [
  ['dxf', 'مخططات CAD بصيغة DXF', 'مسقط كل دور والموقع العام — بالمتر، طبقات معيارية، جدران بسماكتها، أبواب بقوس الفتح'],
  ['boq', 'جدول الكميات Excel', 'الكمية جاهزة، سعر الوحدة تملؤه أنت، والإجمالي بمعادلة — مع جدول المساحات وبيانات المشروع'],
  ['svg', 'اللوحات المتجهية وملف الطباعة', 'المساقط والواجهات والقطاع وجدول الفتحات والإنشائي المبدئي SVG + صفحة تطبعها PDF بمقاس A3'],
  ['data', 'بيانات التصميم', 'design.json وملف المرسم لإعادة الفتح، وملف «اقرأني» بجدول الطبقات والوحدات'],
  ['img', 'الصور', 'الصورة المعمارية الموسومة ولقطة المجسم إن وُجدتا'],
];
/** HTML البطاقة (يُدرج في أعلى #fmain). */
export function packCardHtml() {
  return `<section class="epk" id="engpack" aria-labelledby="epkTitle">
<div class="epk-head"><div class="epk-txt"><p class="epk-eye">تسليم للمكتب الهندسي</p><h2 id="epkTitle">حزمة المهندس</h2>
<p class="epk-lead">ملف واحد يستلمه مكتبك الهندسي ويفتحه في AutoCAD وRevit وExcel مباشرة، فلا يُعاد رسم المخطط من الصفر.</p></div>
<div class="epk-act"><button type="button" class="btn gold epk-go" id="epkGo">نزّل حزمة المهندس (ZIP)</button>
<div class="epk-sub"><button type="button" class="btn" id="epkDxf">DXF فقط</button><button type="button" class="btn" id="epkXlsx">Excel فقط</button></div></div></div>
<div class="epk-prog" id="epkProg" hidden><div class="epk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="تقدّم تجهيز الحزمة"><i id="epkFill"></i></div><span id="epkStep" aria-live="polite"></span></div>
<p class="epk-done" id="epkDone" hidden></p>
<ul class="epk-list" id="epkList">${CONTENTS.map(([id, t, d]) => `<li data-group="${id}"${id === 'img' ? ' hidden' : ''}><b>${esc(t)}</b><span>${esc(d)}</span><em></em></li>`).join('')}</ul>
<p class="epk-note">تُجهَّز الحزمة في متصفحك ولا يُرفع شيء إلى الخادم. ${esc(PACK_DISCLAIMER_AR)}</p>
<p class="epk-note epk-ios" id="epkIos" hidden>على iPhone وiPad: إن لم يبدأ التنزيل تلقائيًا اضغط «احفظ الملف»، وستجده في تطبيق «الملفات» ← «التنزيلات». التنزيل لا يعمل داخل متصفحات التطبيقات (واتساب، إنستغرام…)؛ افتح الصفحة في Safari.</p>
</section>`;
}
const isIOS = () => { try { const n = navigator; return /iP(?:hone|ad|od)/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1); } catch { return false; } };

/**
 * @param {HTMLElement} root عنصر البطاقة
 * @param {() => ({doc, data, session, mep, proPhoto})} ctx حالة الصفحة الحالية
 */
export function mountEngineerPack(root, ctx) {
  if (!root) return null;
  const $ = id => root.querySelector('#' + id), go = $('epkGo'), bDxf = $('epkDxf'), bXlsx = $('epkXlsx'), prog = $('epkProg'), fill = $('epkFill'), step = $('epkStep'), done = $('epkDone'), list = $('epkList');
  let cache = null, busy = false, lastUrl = null;
  if (isIOS()) $('epkIos').hidden = false;
  const setProg = (pct, label) => { prog.hidden = false; fill.style.width = Math.round(pct) + '%'; fill.parentElement.setAttribute('aria-valuenow', String(Math.round(pct))); step.textContent = label; };
  const keyOf = c => [c.data?.fingerprint, c.mep && !c.mep.notComputed ? 'mep' : '-', c.proPhoto?.image ? c.proPhoto.image.length : 0, c.data?.snapshot3d ? c.data.snapshot3d.length : 0].join('|');
  async function extras(c) {
    const out = { version: null, ledger: null, bookCss: '', photo: null };
    await Promise.all([
      (async () => { try { const r = await fetch('./version.json', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); out.version = { commit: j.commit ?? null, builtAt: j.builtAt ?? null }; } } catch { /* غير متاح */ } })(),
      (async () => { try { out.bookCss = await (await fetch('./final.css')).text(); } catch { /* بلا تنسيق */ } })(),
      (async () => { try { if (c.session?.input) { const { ledgerFor } = await import('../design-session.mjs'); out.ledger = ledgerFor(c.session, c.doc); } } catch { /* يبقى سجل الجلسة المخزَّن */ } })(),
      // الصورة المعمارية لا تُضاف إلا موسومةً (الوسم محروق في الصورة)؛ إن تعذّر الوسم تُترك
      (async () => { try { if (c.proPhoto?.image) { const { stampedBlob } = await import('../photo-pro.mjs'); const b = await stampedBlob(c.proPhoto.image, c.proPhoto.ok === false ? 'قد تختلف عن التصميم في بعض التفاصيل' : ''); out.photo = { bytes: new Uint8Array(await b.arrayBuffer()), ext: 'jpg' }; } } catch { /* اختيارية */ } })(),
    ]);
    return out;
  }
  async function prepare() {
    const c = ctx(), key = keyOf(c);
    if (cache && cache.key === key) return cache.pack;
    setProg(4, 'قراءة التصميم…');
    const x = await extras(c);
    const pack = await buildEngineerPack({ doc: c.doc, data: c.data, session: c.session, mep: c.mep, ...x, now: new Date(), onProgress: p => setProg(8 + 62 * p.done / p.total, `${p.step} (${p.done} من ${p.total})`) });
    cache = { key, pack };
    for (const li of list.children) { const g = pack.groups.find(q => q.id === li.dataset.group); li.querySelector('em').textContent = g ? `${g.count} ${g.count === 1 ? 'ملف' : 'ملفات'} · ${fmtSize(g.size)}` : 'غير متاح لهذا التصميم'; li.classList.toggle('off', !g); if (li.dataset.group === 'img') li.hidden = !g; }
    return pack;
  }
  function save(name, bytes, mime) {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    done.hidden = false; done.innerHTML = `جاهز: <bdi class="epk-file">${esc(name)}</bdi> (${fmtSize(bytes.length)}) — <a class="epk-save" download="${esc(name)}" href="${lastUrl}">احفظ الملف</a>`;
    const a = document.createElement('a'); a.href = lastUrl; a.download = name; a.rel = 'noopener'; a.style.display = 'none'; document.body.append(a);
    try { a.click(); } catch { /* يبقى رابط «احفظ الملف» */ }
    setTimeout(() => a.remove(), 1000);
    root.dispatchEvent(new CustomEvent('epk:ready', { bubbles: true, detail: { name, size: bytes.length } }));
  }
  async function run(kind) {
    if (busy) return; busy = true; for (const b of [go, bDxf, bXlsx]) b.disabled = true; done.hidden = true;
    try {
      const pack = await prepare(), base = pack.root;
      if (kind === 'xlsx') { const f = pack.files.find(q => q.path.endsWith('BOQ.xlsx')); setProg(100, 'جدول الكميات جاهز'); save(base + '-BOQ.xlsx', f.bytes, f.mime); }
      else {
        const group = kind === 'dxf' ? 'dxf' : null, n = pack.files.filter(f => !group || f.group === group).length;
        if (!n) throw new Error('لا توجد مخططات DXF لهذا التصميم.');
        const zip = await packZip(pack, { group, onProgress: (i, t) => setProg(70 + 30 * i / t, `ضغط الملفات (${i} من ${t})`) });
        setProg(100, group ? `مخططات DXF جاهزة (${n} ملفات)` : `الحزمة جاهزة (${n} ملفًا)`);
        save(base + (group ? '-DXF' : '') + '.zip', zip, 'application/zip');
      }
      if (pack.notes.length) done.insertAdjacentHTML('beforeend', `<br><span class="epk-warn">${esc(pack.notes.join(' · '))}</span>`);
    } catch (e) { prog.hidden = true; done.hidden = false; done.innerHTML = `<span class="epk-warn">تعذّر تجهيز الحزمة: ${esc(e?.message || e)}</span>`; }
    finally { busy = false; for (const b of [go, bDxf, bXlsx]) b.disabled = false; }
  }
  go.addEventListener('click', () => run('zip')); bDxf.addEventListener('click', () => run('dxf')); bXlsx.addEventListener('click', () => run('xlsx'));
  return { run, prepare, groups: PACK_GROUPS };
}
export default { packCardHtml, mountEngineerPack };
