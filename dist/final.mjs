// صفحة مخرجات التصميم: تقرأ المشروع المحفوظ من المرسم وتعرض المخرجات وتولّد كتاب المشروع.
import { parseDoc } from './draw/doc.mjs';
import { STUDIO_KEY, loadSavedDNA } from './draw/handoff.mjs';
import { buildFinalData, projectBookHtml, designReasons, NEXT_STAGES } from './final-outputs.mjs';
import { GRADES } from './draw/quantities-doc.mjs';
import { structureCsv } from './draw/structure-sheet.mjs';

const RATES_KEY = 'mizan.final.rates.v1', SNAP_KEY = 'mizan.studio.snap3d.v1';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* التخزين غير متاح */ } };
let state = { rates: {}, reservePct: '', vatPct: '' }, doc = null, dna = null, data = null;
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
  $('costTotal').innerHTML = `المجموع الجزئي (${c.pricedCount} من ${c.totalCount} بندًا مسعّرًا): <b>${fmt(c.subtotal)}</b>`
    + (c.reserve !== null ? ` · احتياط ${c.reservePct}%: ${fmt(c.reserve)}` : '') + (c.vat !== null ? ` · ضريبة ${c.vatPct}%: ${fmt(c.vat)}` : '')
    + `<br>الإجمالي: <b>${fmt(c.total)}</b> ${c.complete ? '' : '<span class="muted" style="color:#e9e3d3">(جزئي: يخص البنود المسعّرة فقط)</span>'}`;
}
function render() {
  const R = designReasons(data), S = data.summary, d = data;
  const parts = [];
  parts.push(sec('summary', 'ملخص التصميم', `<p class="lead">${esc(d.title)}</p><div class="stats"><div class="stat"><b>${S.levels}</b>أدوار</div><div class="stat"><b>${S.rooms}</b>فراغات</div><div class="stat"><b>${fmt(S.builtArea)} م²</b>مساحة المسقط</div><div class="stat"><b>${fmt(S.roomsArea)} م²</b>مساحة الغرف</div><div class="stat"><b>${fmt(S.doors)}</b>أبواب</div><div class="stat"><b>${fmt(S.windows)}</b>نوافذ</div></div>`
    + (S.byType.length ? table(['الفراغ', 'العدد'], S.byType.map(t => `<tr><td>${esc(t.name)}</td><td class="num">${t.count}</td></tr>`)) : '')
    + `<p class="muted">${S.plot ? `الأرض ${S.plot.width} × ${S.plot.length} م · ` : ''}بصمة الهندسة <code>${esc(d.fingerprint)}</code> · ${esc(d.date)}</p>`));
  d.levels.forEach((l, i) => parts.push(sec('plan' + i, 'المخطط — ' + l.name, `<div class="svgbox">${l.plan}</div>`)));
  parts.push(sec('view3d', 'العرض ثلاثي الأبعاد', d.snapshot3d ? `<div class="shot"><img alt="لقطة ثلاثية الأبعاد من المرسم" src="${esc(d.snapshot3d)}"></div><p class="muted">اللقطة من المجسم المبني من المخطط نفسه. للتجوّل والشمس والجولة افتح <a href="./studio.html">المرسم</a>.</p>` : `<p>لا توجد لقطة محفوظة بعد. افتح <a href="./studio.html">المرسم</a> ثم اضغط «اعتمد وأخرج المخرجات» من العرض ثلاثي الأبعاد لتُحفظ اللقطة.</p>`));
  d.levels.forEach((l, i) => l.structure && parts.push(sec('str' + i, 'المخطط الإنشائي المبدئي — ' + l.name, `<div class="svgbox">${l.structure}</div><p class="muted">تحجيم أولي بجداول ACI 318؛ مطابقة الكود السعودي SBC 304 غير متحققة. ليس تصميمًا إنشائيًا معتمدًا ويراجعه مهندس إنشائي.</p>`)));
  parts.push(sec('qty', 'جداول الكميات والتكلفة', table(['البند', 'القيمة', 'الدرجة', 'الأساس'], d.quantities.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${r.value === null ? '—' : fmt(r.value) + ' ' + esc(r.unit)}</td><td>${esc(GRADES[r.grade])}</td><td>${esc(r.basis)}</td></tr>`)) + '<h3>التكلفة بأسعارك</h3>' + renderCost()));
  parts.push(sec('why', 'لماذا هذا التصميم', (d.score ? `<p>${esc(d.score.grade)}${d.score.score !== null ? ` — الدرجة ${d.score.score} من ١٠٠٠ (${esc(d.scoreLevel)})` : ''}</p>` : '<p>الدرجة غير متاحة لهذا المخطط.</p>')
    + (R.strengths.length ? `<h3>نقاط القوة</h3><ul>${R.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
    + (R.improvements.length ? `<h3>ما يحتاج تحسينًا</h3><ul>${R.improvements.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
    + (R.unmeasured.length ? `<p class="muted">غير مُقيَّم: ${esc(R.unmeasured.join('، '))}</p>` : '')
    + (R.notes.length ? `<h3>ملاحظات المراجعة</h3><ul>${R.notes.map(n => `<li>${esc(n.message)}</li>`).join('')}</ul>` : '<p class="muted">لا ملاحظات من المراجعة الآلية.</p>')
    + (d.dnaAxes ? '<h3>بصمتك التصميمية</h3>' + table(['المحور', 'القيمة'], d.dnaAxes.map(a => `<tr><td>${esc(a.label)}</td><td class="num">${Math.round(a.value * 100)}%</td></tr>`)) : '')));
  parts.push(sec('next', 'ما بعد التصميم', table(['المرحلة', 'الحالة', 'ملاحظة'], NEXT_STAGES.map(s => `<tr><td>${esc(s.title)}</td><td><span class="pill ${s.status === 'available' ? '' : 'plan'}">${s.status === 'available' ? 'متاح' : 'قادم'}</span></td><td>${esc(s.note)}</td></tr>`))));
  $('fmain').innerHTML = parts.join('');
  $('fnav').innerHTML = [['summary', 'الملخص'], ['plan0', 'المخطط'], ['view3d', '3D'], ['str0', 'الإنشائي'], ['qty', 'الكميات والتكلفة'], ['why', 'الأسباب'], ['next', 'التالي']].map(([id, t]) => `<a href="#${id}">${t}</a>`).join('');
  renderTotals();
  $('fmain').querySelectorAll('input[data-rate]').forEach(i => i.addEventListener('input', () => { state.rates[i.dataset.rate] = i.value; update(); }));
  $('resPct').addEventListener('input', e => { state.reservePct = e.target.value; update(); });
  $('vatPct').addEventListener('input', e => { state.vatPct = e.target.value; update(); });
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
