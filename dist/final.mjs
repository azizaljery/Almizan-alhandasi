// صفحة مخرجات التصميم: تقرأ المشروع المحفوظ من المرسم وتعرض المخرجات وتولّد كتاب المشروع.
import { parseDoc } from './draw/doc.mjs';
import { STUDIO_KEY, loadSavedDNA } from './draw/handoff.mjs';
import { buildFinalData, projectBookHtml, designReasons, sheetNote, NEXT_STAGES } from './final-outputs.mjs';
import { GRADES } from './draw/quantities-doc.mjs';
import { structureCsv } from './draw/structure-sheet.mjs';
import { privacyIndex } from './intel/privacy-index.mjs';
import { climateZoning } from './intel/climate-zoning.mjs';
import { optimizeVariants } from './intel/variant-optimizer.mjs';
import { mepSummaryHtml, mepQuantityRow, applyMepRow, mepQuantitiesHtml, quantityTables, NOT_COMPUTED_AR } from './final-outputs.mjs';
import { serialize } from './draw/doc.mjs';
import { isCostUnpriced, UNPRICED_TOTAL_AR } from './field-guards.mjs';

const RATES_KEY = 'mizan.final.rates.v1', SNAP_KEY = 'mizan.studio.snap3d.v1', SESSION_KEY = 'mizan.design.session.v1';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* التخزين غير متاح */ } };
let state = { rates: {}, reservePct: '', vatPct: '' }, doc = null, dna = null, data = null, mep = null;
try { Object.assign(state, JSON.parse(get(RATES_KEY) || '{}')); } catch { /* ... */ }

function load() {
  const raw = get(STUDIO_KEY);
  if (!raw) return null;
  try { return parseDoc(raw); } catch { return null; }
}
const sec = (id, title, body) => `<section class="sec" id="${id}"><h2>${esc(title)}</h2>${body}</section>`;
const table = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

function compute() {
  let snap = null; try { snap = get(SNAP_KEY); } catch { /* ... */ }
  data = buildFinalData(doc, { dna, rates: state.rates, reservePct: state.reservePct, vatPct: state.vatPct, snapshot3d: snap });
  data.mep = mep; // نتيجة الأنظمة تبقى عبر إعادة الحساب (التكلفة، وكتاب المشروع)
}
function renderCost() {
  const c = data.cost;
  const rows = c.items.map(i => `<tr><td>${esc(i.label)}</td><td class="num">${i.qty === null ? '—' : fmt(i.qty) + ' ' + esc(i.unit)}</td><td><span class="pill ${i.grade === 'measured' ? '' : 'plan'}">${esc(GRADES[i.grade])}</span></td><td><input class="rate" data-rate="${i.id}" inputmode="decimal" placeholder="سعر ${esc(i.unit)}" value="${esc(state.rates[i.id] ?? '')}" aria-label="سعر وحدة ${esc(i.label)}"></td><td class="num">${i.cost === null ? 'غير مسعّر' : fmt(i.cost)}</td></tr>`);
  return table(['البند', 'الكمية', 'الدرجة', 'سعر الوحدة (يدخله العميل)', 'التكلفة = الكمية × السعر'], rows)
    + `<p>احتياط % <input class="pct" id="resPct" inputmode="decimal" value="${esc(state.reservePct)}" placeholder="غير مُضمَّن"> &nbsp; ضريبة % <input class="pct" id="vatPct" inputmode="decimal" value="${esc(state.vatPct)}" placeholder="غير مُضمَّن"></p>`
    + `<div class="total" id="costTotal"></div><p class="muted">لا توجد أسعار سوق افتراضية: لا يُعرض رقم بلا مصدر. أسعار المقاول والأسعار المرجعية غير متاحة بعد؛ المتاح الآن أسعارك أنت. الحديد والكهرباء والسباكة والتكييف غير قابلة للحساب من الرسم الحالي فلا تدخل في الإجمالي.</p>`;
}
function renderTotals() {
  const c = data.cost;
  if (isCostUnpriced(c)) { $('costTotal').innerHTML = `<b>${UNPRICED_TOTAL_AR}</b>`; return; } // لا إجمالي صفر قبل إدخال أي سعر
  $('costTotal').innerHTML = `المجموع الجزئي (${c.pricedCount} من ${c.totalCount} بندًا مسعّرًا): <b>${fmt(c.subtotal)}</b>`
    + (c.reserve !== null ? ` · احتياط ${c.reservePct}%: ${fmt(c.reserve)}` : '') + (c.vat !== null ? ` · ضريبة ${c.vatPct}%: ${fmt(c.vat)}` : '')
    + `<br>الإجمالي: <b>${fmt(c.total)}</b> ${c.complete ? '' : '<span class="muted" style="color:#e9e3d3">(جزئي: يخص البنود المسعّرة فقط)</span>'}`;
}
// تقييم الخصوصية والمناخ والبدائل: خوارزميات dist/intel (نقية). البدائل تُحسب بعد العرض كي لا تؤخر الصفحة.
const pill = c => `<span class="pill ${c.status === 'ok' ? '' : 'plan'}">${c.status === 'ok' ? 'محقق' : c.status === 'na' ? 'غير منطبق' : 'مخالفة'}</span>`;
const scoreCell = c => (c.earned === null ? '—' : `${fmt(c.earned)} / ${c.weight}`);
function renderIntel() {
  let P, C;
  try { P = privacyIndex(doc); C = climateZoning(doc); } catch (e) { return `<p class="muted">تعذّر حساب التقييم: ${esc(e.message)}</p>`; }
  const score = v => (v === null || v === undefined ? '—' : v + ' / 100');
  const head = `<div class="stats"><div class="stat"><b>${score(P.score)}</b>مؤشر الخصوصية السعودي</div><div class="stat"><b>${score(C.score)}</b>المنطقة المناخية للفراغات</div><div class="stat"><b>${P.score === null || C.score === null ? '—' : (P.score + C.score) + ' / 200'}</b>المجموع (هدف البدائل)</div></div>`
    + `<p class="muted">${esc(P.note)} ${esc(C.note)}</p>`;
  const privacy = '<h3>مؤشر الخصوصية السعودي</h3>' + table(['المعيار', 'الدرجة', 'الحالة', 'التفاصيل'], P.criteria.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${scoreCell(c)}</td><td>${pill(c)}</td><td>${esc(c.details)}</td></tr>`))
    + (P.roles.menMajlis || P.roles.womenMajlis || P.roles.maid ? `<p class="muted">الأدوار المكتشفة من الأسماء: ${esc([P.roles.menMajlis && 'مجلس الرجال = ' + P.roles.menMajlis, P.roles.womenMajlis && 'مجلس النساء = ' + P.roles.womenMajlis, P.roles.guestWc && 'دورة مياه الضيوف = ' + P.roles.guestWc, P.roles.maid && 'الخادمة = ' + P.roles.maid, P.roles.mainEntry && 'المدخل الرئيسي = ' + P.roles.mainEntry].filter(Boolean).join('، '))}.</p>` : '')
    + '<h3>المخالفات والإصلاح المقترح</h3>' + (P.violations.length ? table(['ما المشكلة', 'أين (الفراغات)', 'الإصلاح المقترح'], P.violations.map(v => `<tr><td>${esc(v.problem)}</td><td>${esc(v.where.join(' ← '))}</td><td>${esc(v.fix)}</td></tr>`)) : '<p class="muted">لا مخالفات في المعايير المنطبقة.</p>');
  const STATUS = { ok: 'مناسب', hot: 'مكشوف للغرب', warm: 'يحتاج تظليلًا', buffer: 'حاجز حراري' };
  const climate = '<h3>المنطقة المناخية للفراغات</h3>' + table(['المعيار', 'الدرجة', 'الحالة', 'التفاصيل'], C.criteria.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${scoreCell(c)}</td><td>${pill(c)}</td><td>${esc(c.details)}</td></tr>`))
    + (C.rooms.length ? table(['الفراغ', 'النوع', 'الجهة الأشد حرارة', 'زجاج حار م²', 'نسبته إلى الأرضية', 'الحالة'], C.rooms.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.typeName)}</td><td>${esc(r.worst || 'بلا جدار خارجي')}</td><td class="num">${fmt(r.glassHot)}</td><td class="num">${Math.round(r.hotGlassRatio * 100)}%</td><td><span class="pill ${r.status === 'hot' || r.status === 'warm' ? 'plan' : ''}">${STATUS[r.status]}</span></td></tr>`)) : '')
    + (C.recommendations.length ? `<h3>توصيات مناخية</h3><ul>${C.recommendations.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : '');
  const variants = '<h3>بدائل بالتحسين (أفضل ثلاثة)</h3><div id="intelVariants"><p class="muted">جارٍ البحث عن بدائل تحسّن الخصوصية والمناخ…</p></div>';
  return head + privacy + climate + variants;
}
/** الأنظمة الأولية بالأرقام: تُحسب من مخطط المرسم المعروض في هذه الصفحة نفسه (المصدر ذاته لصفحة الأنظمة). */
function readSession() { try { const x = JSON.parse(get(SESSION_KEY) || 'null'); return x && Array.isArray(x.designs) ? x : null; } catch { return null; } }
const qtyRow = r => `<tr${r.id === 'mep' ? ' data-qty="mep"' : ''}><td>${esc(r.label)}</td><td class="num">${r.value === null ? '—' : fmt(r.value) + ' ' + esc(r.unit)}</td><td>${esc(GRADES[r.grade])}</td><td>${esc(r.basis)}</td></tr>`;
async function renderMep() {
  try {
    const { computeOutputsMep } = await import('./mep/outputs-mep.mjs');
    mep = await computeOutputsMep({ session: readSession(), studioRaw: get(STUDIO_KEY), store: { getItem: k => get(k) } });
  } catch (e) { mep = { notComputed: true, reasonAr: 'تعذّر الحساب: ' + String(e.message || e).slice(0, 160) }; }
  if (data) data.mep = mep;
  const box = $('mepQty'); if (box) box.innerHTML = mepQuantitiesHtml(mep);
}
function renderVariants() {
  const box = $('intelVariants'); if (!box) return;
  let R; try { R = optimizeVariants(doc); } catch (e) { box.innerHTML = `<p class="muted">تعذّر البحث عن بدائل: ${esc(e.message)}</p>`; return; }
  if (!R.variants.length) { box.innerHTML = `<p class="muted">${esc(R.note)}</p>`; return; }
  box.innerHTML = R.variants.map(v => `<div style="background:#f6f1e4;border-radius:10px;padding:10px 12px;margin:8px 0"><h3 style="margin:0">البديل ${v.rank}: ${fmt(v.total)} / 200 (+${fmt(v.gain)})</h3>`
    + `<p>الخصوصية ${v.before.privacy ?? '—'} ← <b>${v.privacy ?? '—'}</b> · المناخ ${v.before.climate ?? '—'} ← <b>${v.climate ?? '—'}</b> · المخالفات ${v.violationsBefore} ← ${v.violationsAfter}</p>`
    + `<ul>${v.ops.map(o => `<li>${esc(o.text)}</li>`).join('')}</ul><p class="muted">لماذا: ${esc(v.why)}</p>`
    + `<button class="btn" data-variant="${v.rank}">تنزيل البديل ${v.rank} كملف مرسم (.mizan.json)</button></div>`).join('')
    + `<p class="muted">${esc(R.note)} لا يُرسم مسقط لكل بديل هنا لأن رسمه يعيد بناء المخطط والمجسم؛ نزّل الملف وافتحه في المرسم (زر «فتح») لتراه مرسومًا.</p>`;
  box.querySelectorAll('button[data-variant]').forEach(b => b.addEventListener('click', () => { const v = R.variants[Number(b.dataset.variant) - 1]; download(`mizan-variant-${v.rank}-${data.fingerprint.slice(0, 8).replace(/[^a-z0-9]/gi, '')}.mizan.json`, serialize({ ...v.doc, title: `${doc.title || 'مشروع'} — البديل ${v.rank}` }), 'application/json'); }));
}
function render() {
  const R = designReasons(data), S = data.summary, d = data;
  const parts = [];
  parts.push(sec('summary', 'ملخص التصميم', `<p class="lead">${esc(d.title)}</p><div class="stats"><div class="stat"><b>${S.levels}</b>أدوار</div><div class="stat"><b>${S.rooms}</b>فراغات</div><div class="stat"><b>${fmt(S.builtArea)} م²</b>مساحة المسقط</div><div class="stat"><b>${fmt(S.roomsArea)} م²</b>مساحة الغرف</div><div class="stat"><b>${fmt(S.doors)}</b>أبواب</div><div class="stat"><b>${fmt(S.windows)}</b>نوافذ</div></div>`
    + (S.byType.length ? table(['الفراغ', 'العدد'], S.byType.map(t => `<tr><td>${esc(t.name)}</td><td class="num">${t.count}</td></tr>`)) : '')
    + `<p class="muted">${S.plot ? `الأرض ${S.plot.width} × ${S.plot.length} م · ` : ''}بصمة الهندسة <code>${esc(d.fingerprint)}</code> · ${esc(d.date)}</p>`));
  d.levels.forEach((l, i) => parts.push(sec('plan' + i, 'المخطط — ' + l.name, `<div class="svgbox sheet">${l.plan}</div>` + sheetNote(l))));
  parts.push(sec('view3d', 'العرض ثلاثي الأبعاد', d.snapshot3d ? `<div class="shot"><img alt="لقطة ثلاثية الأبعاد من المرسم" src="${esc(d.snapshot3d)}"></div><p class="muted">اللقطة من المجسم المبني من المخطط نفسه. للتجوّل والشمس والجولة افتح <a href="./studio.html">المرسم</a>.</p>` : `<p>لا توجد لقطة محفوظة بعد. افتح <a href="./studio.html">المرسم</a> ثم اضغط «اعتمد وأخرج المخرجات» من العرض ثلاثي الأبعاد لتُحفظ اللقطة.</p>`));
  d.levels.forEach((l, i) => l.structure && parts.push(sec('str' + i, 'المخطط الإنشائي المبدئي — ' + l.name, `<div class="svgbox">${l.structure}</div><p class="muted">تحجيم أولي بجداول ACI 318؛ مطابقة الكود السعودي SBC 304 غير متحققة. ليس تصميمًا إنشائيًا معتمدًا ويراجعه مهندس إنشائي.</p>`)));
  // الأنظمة الهندسية ضمن التصاميم: وصف ورابط المخططات فقط؛ أرقامها في «جداول الكميات» آخر الصفحة
  parts.push(sec('mep', 'الأنظمة الهندسية: الكهرباء والتكييف والسباكة والحريق', `<p>تُبنى من التصميم المعتمد نفسه بافتراضات معلنة تعدّلها في صفحة الأنظمة: مواقع الإنارة والمقابس واللوحات والدوائر، والتكييف والتهوية، والمياه والصرف، والحريق والتيار الخفيف والطاقة الشمسية، مع تصدير SVG وDXF وجداول CSV.</p><p>كمياتها بالأرقام في <a href="#qty">جداول الكميات</a> آخر الصفحة.</p><p><a class="btn primary" href="./mep/systems.html">فتح المخططات الكهربائية والميكانيكية ←</a></p><p class="muted">تصميم أولي يحتاج مراجعة مهندس مختص، وليس مخططًا تنفيذيًا معتمدًا.</p>`));

  parts.push(sec('why', 'لماذا هذا التصميم', (d.score ? `<p>${esc(d.score.grade)}${d.score.score !== null ? ` — الدرجة ${d.score.score} من ١٠٠٠ (${esc(d.scoreLevel)})` : ''}</p>` : '<p>الدرجة غير متاحة لهذا المخطط.</p>')
    + (R.strengths.length ? `<h3>نقاط القوة</h3><ul>${R.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
    + (R.improvements.length ? `<h3>ما يحتاج تحسينًا</h3><ul>${R.improvements.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
    + (R.unmeasured.length ? `<p class="muted">غير مُقيَّم: ${esc(R.unmeasured.join('، '))}</p>` : '')
    + (R.notes.length ? `<h3>ملاحظات المراجعة</h3><ul>${R.notes.map(n => `<li>${esc(n.message)}</li>`).join('')}</ul>` : '<p class="muted">لا ملاحظات من المراجعة الآلية.</p>')
    + (d.dnaAxes ? '<h3>بصمتك التصميمية</h3>' + table(['المحور', 'القيمة'], d.dnaAxes.map(a => `<tr><td>${esc(a.label)}</td><td class="num">${Math.round(a.value * 100)}%</td></tr>`)) : '')));
  parts.push(sec('intel', 'تقييم الخصوصية والمناخ والبدائل', renderIntel()));
  parts.push(sec('next', 'ما بعد التصميم', table(['المرحلة', 'الحالة', 'ملاحظة'], NEXT_STAGES.map(s => `<tr><td>${esc(s.title)}</td><td><span class="pill ${s.status === 'available' ? '' : 'plan'}">${s.status === 'available' ? 'متاح' : 'قادم'}</span></td><td>${esc(s.note)}</td></tr>`))));
  // جداول الكميات كلها مجمعة في الآخر، منفصلة عن التصاميم، بالعربية
  parts.push(sec('qty', 'جداول الكميات', quantityTables(d, { costHtml: renderCost(), mepId: 'mepQty' })));
  $('fmain').innerHTML = parts.join('');
  $('fnav').innerHTML = [['summary', 'الملخص'], ['plan0', 'المخطط'], ['view3d', 'ثلاثي الأبعاد'], ['str0', 'الإنشائي'], ['mep', 'الأنظمة'], ['why', 'الأسباب'], ['intel', 'الخصوصية والمناخ'], ['next', 'التالي'], ['qty', 'جداول الكميات']].map(([id, t]) => `<a href="#${id}">${t}</a>`).join('');
  renderTotals();
  $('fmain').querySelectorAll('input[data-rate]').forEach(i => i.addEventListener('input', () => { state.rates[i.dataset.rate] = i.value; update(); }));
  $('resPct').addEventListener('input', e => { state.reservePct = e.target.value; update(); });
  $('vatPct').addEventListener('input', e => { state.vatPct = e.target.value; update(); });
  setTimeout(renderVariants, 0);
  if (!mep) setTimeout(renderMep, 0);
}
// تحديث التكلفة دون إعادة بناء الصفحة (يحفظ مكان الكتابة)
function update() {
  set(RATES_KEY, JSON.stringify(state)); compute();
  data.cost.items.forEach(i => { const row = document.querySelector(`input[data-rate="${i.id}"]`)?.closest('tr'); if (row) row.lastElementChild.textContent = i.cost === null ? 'غير مسعّر' : fmt(i.cost); });
  renderTotals();
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
async function bookCss() { try { return await (await fetch('./final.css')).text(); } catch { return ''; } }

function init() {
  doc = load();
  if (!doc || !doc.walls.length) {
    $('fmain').innerHTML = `<div class="sec empty"><h2>لا يوجد تصميم لعرض مخرجاته</h2><p>ارسم مخططًا أو ولّده من الصفحة الرئيسية، ثم عُد إلى هنا.</p><a class="btn primary" href="./studio.html">فتح المرسم</a> <a class="btn" href="./home.html">ابدأ رحلة التصميم</a></div>`;
    $('btnBook').disabled = $('btnPrint').disabled = true; return;
  }
  dna = loadSavedDNA(localStorage);
  compute(); render();
  $('btnPrint').addEventListener('click', () => window.print());
  $('btnBook').addEventListener('click', async () => { compute(); download('mizan-project-book-' + data.fingerprint.slice(0, 8).replace(/[^a-z0-9]/gi, '') + '.html', projectBookHtml(data, { css: await bookCss() }), 'text/html;charset=utf-8'); });
}
try { init(); } catch (e) { $('fmain').innerHTML = `<div class="sec empty"><h2>تعذّر تجهيز المخرجات</h2><p>${esc(e.message)}</p><a class="btn" href="./studio.html">العودة إلى المرسم</a></div>`; }
