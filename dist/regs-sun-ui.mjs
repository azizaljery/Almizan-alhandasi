// بطاقتا صفحة التصميم: «مطابقة الاشتراطات البلدية» و«الشمس والتوجيه». هذا الملف يقرأ ويكتب DOM فقط؛
// الأحكام من municipal-rules.mjs والأرقام من sun-analysis.mjs و sun.mjs (كلها مختبرة في node).
import { checkMunicipal, summaryText, VERDICT_AR, SOURCE } from './municipal-rules.mjs';
import { analyzeSun, shadowOffset, sunDirPlan, EXPOSURE, SUN_LIMITS } from './sun-analysis.mjs';
import { sunPosition, sunPath, solarToClock, clockText, monthDay, MONTHS_AR, DAYS } from './sun.mjs';
import { solarSite, northText, compassName } from './geo-land.mjs';
import { parseDoc } from './draw/doc.mjs';
import { analyzeDoc } from './draw/digest.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
const sv = (tag, attrs = {}, text) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; return n; };
const n1 = v => (Math.round(v * 10) / 10).toFixed(1);
const remember = (key, d) => { d.addEventListener('toggle', () => { try { sessionStorage.setItem(key, d.open ? '1' : '0'); } catch { /* لا تخزين */ } }); try { const v = sessionStorage.getItem(key); if (v !== null) d.open = v === '1'; } catch { /* لا تخزين */ } return d; };

/** موقع الشمس لهذه الجلسة: من الخريطة، وإلا المدينة، وإلا الرياض افتراضيًا (مع إعلان ذلك). */
export const siteOf = session => solarSite(session?.input?.land?.geo || null);

// ------------------------------------------------------------------------------------------ الاشتراطات
const ORDER = ['fail', 'review', 'ok', 'na'], MARK = { ok: '✓', fail: '✗', review: '؟', na: '–' };
/** بطاقة «مطابقة الاشتراطات البلدية» للتصميم المعروض؛ تُعاد مع كل تصميم/بديل. */
export function municipalCard(session, doc) {
  let res; try { res = checkMunicipal(doc, session.input.land || {}); } catch (e) { return el('section', { class: 'card regs', id: 'regsCard' }, el('h2', {}, 'مطابقة الاشتراطات البلدية'), el('p', { class: 'sub' }, 'تعذّر حساب المطابقة لهذا التصميم: ' + (e.message || 'خطأ'))); }
  const s = res.summary, row = it => el('li', { class: 'rg rg-' + it.verdict, 'data-rule': it.id, 'data-verdict': it.verdict },
    el('span', { class: 'rg-mark', 'aria-hidden': 'true' }, MARK[it.verdict]),
    el('div', {}, el('b', {}, it.title), el('span', { class: 'rg-v' }, VERDICT_AR[it.verdict]), el('p', {}, it.text),
      it.hint ? el('a', { class: 'rg-hint', href: './home.html#land' }, it.hint + ' ←') : null,
      it.ruleStatus === 'review' && it.reason ? el('p', { class: 'rg-why' }, 'لماذا «يُراجع»: ' + it.reason) : null,
      el('details', { class: 'rg-src' }, el('summary', {}, 'نص الاشتراط ومصدره'), el('p', {}, it.rule), it.quote ? el('p', { class: 'rg-q' }, 'العبارة في الوثيقة: ' + it.quote) : null,
        el('p', {}, `ص ${it.source.page}${it.source.clause ? ' — ' + it.source.clause : ''} · `, el('a', { href: it.source.url, target: '_blank', rel: 'noopener' }, 'افتح الوثيقة الرسمية')))));
  const live = res.items.filter(i => i.verdict !== 'na').sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict)), na = res.items.filter(i => i.verdict === 'na');
  const d = remember('mizan.card.regs', el('details', { class: 'fold', open: true },
    el('summary', {}, el('h2', {}, 'مطابقة الاشتراطات البلدية'),
      el('span', { class: 'rg-sum', id: 'regsSummary' }, el('span', { class: 'pill ok' }, `${s.ok} مطابق`), el('span', { class: 'pill review' }, `${s.review} يُراجع`), el('span', { class: 'pill fail' }, `${s.fail} مخالف`))),
    el('p', { class: 'sub' }, 'مقيسة من هذا المخطط نفسه على أرضك: كل بند بالمطلوب والموجود. ما لا يُعرف من المسقط أو لم يُتحقق من نصّه يظهر «يُراجع مع المكتب الهندسي» لا حكمًا.'),
    res.needsStreetWidth ? el('p', { class: 'rg-flag' }, 'لم تُدخل عرض الشارع، فحُسب الارتداد جهة الشارع بحده الأدنى. ', el('a', { href: './home.html#land' }, 'أدخل عرض الشارع للدقة ←')) : null,
    el('ul', { class: 'rglist' }, live.map(row)),
    na.length ? el('details', { class: 'rg-na' }, el('summary', {}, `بنود لا تنطبق على هذا التصميم (${na.length})`), el('ul', { class: 'rglist' }, na.map(row))) : null,
    el('p', { class: 'rg-note' }, el('b', {}, res.disclaimer)),
    el('p', { class: 'rg-note' }, res.scope + ' ', `المرجع: ${SOURCE.title}، ${SOURCE.edition}. `, el('a', { href: SOURCE.url, target: '_blank', rel: 'noopener' }, 'الوثيقة الرسمية'))));
  const card = el('section', { class: 'card regs', id: 'regsCard', 'aria-label': 'مطابقة الاشتراطات البلدية', 'data-summary': summaryText(s) }, d);
  return card;
}

// ------------------------------------------------------------------------------------------ درجات التوجيه للبدائل
const cache = new Map();
function analysisOf(docText, site) {
  const key = `${site.lat}|${site.north}|${docText.length}|${docText.slice(-400)}`;
  if (!cache.has(key)) { try { const d = parseDoc(docText); cache.set(key, analyzeSun(d, site, { model: analyzeDoc(d) })); } catch { cache.set(key, null); } if (cache.size > 40) cache.delete(cache.keys().next().value); }
  return cache.get(key);
}
/** درجة التوجيه لكل تصميم في الجلسة: [{ index, score, lines, best }] بترتيب الجلسة؛ best للأعلى درجة (إن وُجد أكثر من تصميم). */
export function orientationBadges(session) {
  const site = siteOf(session), out = session.designs.map((d, index) => { const a = analysisOf(d.doc, site); return { index, score: a ? a.score : null, lines: a ? a.lines : [] }; });
  const top = Math.max(-1, ...out.map(x => x.score ?? -1));
  for (const x of out) x.best = out.length > 1 && x.score !== null && x.score === top;
  return out;
}

// ------------------------------------------------------------------------------------------ الشمس
const band = s => (s >= 75 ? 'good' : s >= 55 ? 'mid' : 'low');
/**
 * بطاقة «الشمس والتوجيه»: درجة مفسَّرة، مسقط عليه البوصلة بالشمال الحقيقي ومسار الشمس صيفًا وشتاءً وظل الكتلة،
 * منزلقا الشهر والساعة، تلوين الواجهات بحسب التعرّض، توصيات، وترتيب تصاميم الجلسة بالتوجيه.
 * onShow(index): عرض تصميم آخر؛ onAsk(text): فتح ملاحظات شرعاء بنص جاهز (مسار الملاحظات القائم).
 */
export function sunCard(session, doc, { onShow = () => {}, onAsk = () => {} } = {}) {
  const site = siteOf(session), model = analyzeDoc(doc);
  let A; try { A = analyzeSun(doc, site, { model }); } catch (e) { return el('section', { class: 'card sun', id: 'sunCard' }, el('h2', {}, 'الشمس والتوجيه'), el('p', { class: 'sub' }, 'تعذّر تحليل الشمس لهذا التصميم: ' + (e.message || 'خطأ'))); }
  const badges = orientationBadges(session), cur = session.current;
  // ---- الرسم
  const plot = doc.plot?.polygon?.length >= 3 ? doc.plot.polygon : null, pts = [...(plot || []), ...A.masses.flatMap(m => m.outlines.flat())];
  const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2.5, pad = 5.5, V = R + pad;
  const X = x => x - cx, Y = y => -(y - cy), pt = p => `${n1(X(p.x))},${n1(Y(p.y))}`;
  const svg = sv('svg', { viewBox: `${-V} ${-V} ${2 * V} ${2 * V}`, role: 'img', 'aria-label': 'مسقط التصميم مع البوصلة ومسار الشمس وظل المبنى', class: 'sun-fig' });
  const gStatic = sv('g'), gShadow = sv('g', { class: 'sf-shadow' }), gBuild = sv('g'), gSun = sv('g');
  svg.append(gStatic, gShadow, gBuild, gSun);
  if (plot) gStatic.append(sv('polygon', { class: 'sf-plot', points: plot.map(pt).join(' ') }));
  gStatic.append(sv('circle', { class: 'sf-ring', cx: 0, cy: 0, r: n1(R) }));
  // البوصلة بالشمال الحقيقي: ش ق ج غ على الحلقة
  for (const [bearing, t] of [[0, 'ش'], [90, 'ق'], [180, 'ج'], [270, 'غ']]) {
    const d = sunDirPlan(bearing, site.north), tx = d.x * (R + 2.6), ty = -d.y * (R + 2.6);
    gStatic.append(sv('line', { class: 'sf-tick' + (bearing === 0 ? ' n' : ''), x1: n1(d.x * (R - .8)), y1: n1(-d.y * (R - .8)), x2: n1(d.x * (R + .9)), y2: n1(-d.y * (R + .9)) }), sv('text', { class: 'sf-card' + (bearing === 0 ? ' n' : ''), x: n1(tx), y: n1(ty + 1), 'text-anchor': 'middle' }, t));
  }
  // مسار الشمس: الأفق على الحلقة والسمت (فوق الرأس) في المركز
  const skyPt = s => { const d = sunDirPlan(s.azimuthDeg, site.north), r = R * (1 - Math.max(0, s.altitudeDeg) / 90); return { x: d.x * r, y: -d.y * r }; };
  const pathOf = day => sunPath(site.lat, day, 0.25).map(skyPt).map(p => `${n1(p.x)},${n1(p.y)}`).join(' ');
  gStatic.append(sv('polyline', { class: 'sf-path summer', points: pathOf(DAYS.juneSolstice) }), sv('polyline', { class: 'sf-path winter', points: pathOf(DAYS.decemberSolstice) }));
  const pathNow = sv('polyline', { class: 'sf-path now' }); gStatic.append(pathNow);
  let levelId = A.masses[0]?.level || doc.levels[0].id;
  function drawBuilding() {
    gBuild.replaceChildren();
    for (const m of A.masses.filter(m => m.level === levelId)) for (const o of m.outlines) gBuild.append(sv('polygon', { class: 'sf-mass', points: o.map(pt).join(' ') }));
    for (const w of doc.walls.filter(w => w.level === levelId && (w.kind || 'wall') === 'wall')) gBuild.append(sv('line', { class: 'sf-wall', x1: n1(X(w.a.x)), y1: n1(Y(w.a.y)), x2: n1(X(w.b.x)), y2: n1(Y(w.b.y)) }));
    for (const r of A.rooms.filter(r => r.levelId === levelId)) for (const F of r.facades) for (const g of F.segments) {
      const a = { x: g.p.x - g.u.x * g.w / 2, y: g.p.y - g.u.y * g.w / 2 }, b = { x: g.p.x + g.u.x * g.w / 2, y: g.p.y + g.u.y * g.w / 2 };
      const ln = sv('line', { class: 'sf-win', stroke: EXPOSURE[F.exposure].color, x1: n1(X(a.x)), y1: n1(Y(a.y)), x2: n1(X(b.x)), y2: n1(Y(b.y)) }); ln.append(sv('title', {}, `${r.name} — نافذة ${F.adj}: ${EXPOSURE[F.exposure].ar} (صيفًا ${F.summer.total} س، شتاءً ${F.winter.total} س)`)); gBuild.append(ln);
    }
    for (const o of A.outdoor) { const c = sv('circle', { class: 'sf-out ' + o.kind, cx: n1(X(o.at.x)), cy: n1(Y(o.at.y)), r: 1.1 }); c.append(sv('title', {}, `${o.name}: ${o.summer} س شمس صيفًا، ${o.winter} س شتاءً`)); gBuild.append(c); }
  }
  // ---- المنزلقان
  const month = el('input', { type: 'range', id: 'sunMonth', min: '1', max: '12', step: '1', value: '6', 'aria-label': 'الشهر' });
  const hour = el('input', { type: 'range', id: 'sunHour', min: '5', max: '19', step: '0.25', value: '15', 'aria-label': 'الساعة بالتوقيت الشمسي' });
  const mTxt = el('output', { for: 'sunMonth' }), hTxt = el('output', { for: 'sunHour' }), now = el('p', { class: 'sun-now', id: 'sunNow', 'aria-live': 'polite' });
  function update() {
    const day = monthDay(Number(month.value)), t = Number(hour.value), s = sunPosition({ latitudeDeg: site.lat, dayOfYear: day, solarHour: t });
    mTxt.textContent = MONTHS_AR[Number(month.value) - 1]; hTxt.textContent = clockText(t);
    pathNow.setAttribute('points', pathOf(day));
    gShadow.replaceChildren(); gSun.replaceChildren();
    const up = s.altitudeDeg > 0.5;
    if (up) {
      for (const m of A.masses) { const off = shadowOffset(m.height, s.azimuthDeg, s.altitudeDeg, site.north); if (!off) continue;
        for (const o of m.outlines) { const sh = o.map(p => ({ x: p.x + off.dx, y: p.y + off.dy })); gShadow.append(sv('polygon', { points: sh.map(pt).join(' ') }));
          for (let i = 0; i < o.length; i++) { const j = (i + 1) % o.length; gShadow.append(sv('polygon', { points: [o[i], o[j], sh[j], sh[i]].map(pt).join(' ') })); } } }
      const p = skyPt(s), d = sunDirPlan(s.azimuthDeg, site.north);
      gSun.append(sv('line', { class: 'sf-ray', x1: 0, y1: 0, x2: n1(d.x * R), y2: n1(-d.y * R) }), sv('circle', { class: 'sf-sun', cx: n1(p.x), cy: n1(p.y), r: 1.5 }));
    }
    const top = A.masses.length ? Math.max(...A.masses.map(m => m.height)) : 0, off = up ? shadowOffset(top, s.azimuthDeg, s.altitudeDeg, site.north) : null;
    const clock = site.lng !== null && site.lng !== undefined ? ` (نحو ${clockText(solarToClock(t, site.lng, day))} بتوقيت المملكة)` : '';
    now.textContent = up ? `منتصف ${MONTHS_AR[Number(month.value) - 1]}، الساعة ${clockText(t)} شمسيًا${clock}: الشمس من جهة ${compassName(s.azimuthDeg)} على ارتفاع ${Math.round(s.altitudeDeg)}°، وظل المبنى (ارتفاعه ${n1(top)} م) يمتد نحو ${n1(off.length)} م${off.length >= 60 ? ' أو أكثر' : ''} إلى جهة ${compassName(s.azimuthDeg + 180)}.` : `منتصف ${MONTHS_AR[Number(month.value) - 1]}، الساعة ${clockText(t)} شمسيًا${clock}: الشمس تحت الأفق.`;
  }
  month.addEventListener('input', update); hour.addEventListener('input', update);
  const levelSeg = A.masses.length > 1 ? el('div', { class: 'seg sun-lv', role: 'group', 'aria-label': 'دور الرسم' }, A.masses.map(m => el('button', { type: 'button', class: m.level === levelId ? 'on' : '', 'data-sun-level': m.level, onclick: e => { levelId = m.level; e.currentTarget.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.sunLevel === levelId)); drawBuilding(); } }, doc.levels.find(l => l.id === m.level)?.name || m.level))) : null;
  drawBuilding(); update();

  const legend = el('div', { class: 'sun-legend' }, Object.entries(EXPOSURE).map(([, v]) => el('span', {}, el('i', { style: `background:${v.color}` }), v.ar)), el('span', {}, el('i', { class: 'lg-summer' }), 'مسار الشمس 21 يونيو'), el('span', {}, el('i', { class: 'lg-winter' }), 'مسار الشمس 21 ديسمبر'), el('span', { class: 'lg-note' }, 'الدائرة قبة السماء فوق بيتك: حافتها الأفق ومركزها فوق الرأس؛ القرص الأصفر موضع الشمس الآن، والرمادي ظل المبنى.'));
  const partsList = el('ul', { class: 'sun-parts' }, A.parts.map(p => el('li', {}, el('div', { class: 'sp-head' }, el('b', {}, p.label), el('span', {}, `${n1(p.points)} من ${p.max}`)), el('div', { class: 'sp-bar', role: 'presentation' }, el('i', { style: `width:${Math.round(p.points / p.max * 100)}%` })), el('small', {}, p.detail))));
  const rankRows = badges.length > 1 ? [...badges].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.index - b.index) : [];
  const rank = rankRows.length ? el('div', { class: 'sun-rank', id: 'sunRank' }, el('h3', {}, 'تصاميمك مرتبة بالتوجيه'),
    el('ol', {}, rankRows.map(b => el('li', { class: (b.index === cur ? 'cur ' : '') + (b.best ? 'best' : '') },
      el('button', { type: 'button', class: 'btn', 'data-rank': String(b.index), disabled: b.index === cur, onclick: () => onShow(b.index) }, `التصميم ${b.index + 1}`),
      el('span', { class: 'sc ' + band(b.score ?? 0) }, b.score === null ? '—' : `${b.score}/100`), b.best ? el('span', { class: 'tag' }, 'الأفضل توجيهًا') : null, b.index === cur ? el('span', { class: 'tag cur' }, 'المعروض') : null,
      el('small', {}, b.lines.join(' ')))))) : null;
  const asks = ['غرف النوم في جهة الشرق', 'المجلس في جهة الشمال', 'الصالة في جهة الشمال'];
  const askBox = el('div', { class: 'sun-asks' }, el('h3', {}, 'اطلب توجيهًا أفضل بكلامك'),
    el('p', { class: 'sub' }, 'هذه طلبات يفهمها المولّد وتمرّ عبر «اطلب تصميمًا آخر»؛ الجهات هنا أضلاع أرضك كما سمّيتها (شمال/شرق…).'),
    el('div', { class: 'chips' }, asks.map(t => el('button', { type: 'button', class: 'chip', 'data-sun-ask': t, onclick: () => onAsk(t) }, t))),
    el('p', { class: 'sub hint' }, 'طلب «بلا زجاج على الغرب» لا يدعمه المولّد بعد: النوافذ توضع على الجدار الخارجي لكل غرفة. ما يقلل الزجاج الغربي الآن هو نقل الغرف عن الجهة الغربية بالطلبات أعلاه، أو تصغير النوافذ في المرسم.'));
  const d = remember('mizan.card.sun', el('details', { class: 'fold', open: true },
    el('summary', {}, el('h2', {}, 'الشمس والتوجيه'), el('span', { class: 'sun-score ' + band(A.score), id: 'sunScore', title: 'درجة التوجيه لمناخ حار: الزجاج الغربي عيب، والشمال والجنوب المظلل ميزة' }, `التوجيه: ${A.score}/100`)),
    el('p', { class: 'sun-lines', id: 'sunLines' }, A.lines.join(' ')),
    el('p', { class: 'sub', id: 'sunSite' }, `الحساب لـ${site.label} (خط العرض ${n1(site.lat)}°). ${site.source === 'map' ? northText(site.north) : 'الشمال كما رسمته في خطوة الأرض (أعلى المسقط).'}${site.source === 'default' ? ' ' : ''}`, site.source !== 'map' ? el('a', { href: './home.html#land' }, 'حدّد موقع أرضك على الخريطة ←') : null),
    el('div', { class: 'sun-grid' },
      el('figure', { class: 'sun-figwrap' }, levelSeg, svg, legend),
      el('div', { class: 'sun-side' },
        el('div', { class: 'sun-ctl' }, el('label', {}, el('span', {}, 'الشهر ', mTxt), month), el('label', {}, el('span', {}, 'الساعة (توقيت شمسي) ', hTxt), hour)), now,
        el('h3', {}, 'كيف حُسبت الدرجة'), partsList,
        A.ups.length ? el('div', {}, el('h3', {}, 'ما رفعها'), el('ul', { class: 'tick' }, A.ups.map(t => el('li', { class: 'good' }, t)))) : null,
        A.downs.length ? el('div', {}, el('h3', {}, 'ما خفضها'), el('ul', { class: 'tick' }, A.downs.map(t => el('li', { class: 'bad' }, t)))) : null)),
    el('div', { class: 'sun-recs' }, el('h3', {}, 'توصيات عملية'), el('ul', { class: 'notes' }, A.recs.map(t => el('li', {}, t)))),
    el('details', { class: 'sun-table' }, el('summary', {}, `ساعات الشمس على نوافذ كل فراغ (${A.rooms.length})`),
      el('div', { class: 'tscroll' }, el('table', { class: 'rooms' }, el('thead', {}, el('tr', {}, el('th', {}, 'الفراغ'), el('th', {}, 'الواجهة'), el('th', {}, 'طول الزجاج (م)'), el('th', {}, 'صيفًا 21 يونيو (س)'), el('th', {}, 'منها بعد 1 ظهرًا'), el('th', {}, 'شتاءً 21 ديسمبر (س)'), el('th', {}, 'التعرّض'))),
        el('tbody', {}, A.rooms.flatMap(r => r.facades.map(F => el('tr', {}, el('td', {}, r.name + (doc.levels.length > 1 ? ` (${r.level})` : '')), el('td', {}, F.adj), el('td', { class: 'num' }, n1(F.width)), el('td', { class: 'num' }, n1(F.summer.total)), el('td', { class: 'num' }, n1(F.summer.hot)), el('td', { class: 'num' }, n1(F.winter.total)), el('td', {}, el('span', { class: 'z', style: `background:${EXPOSURE[F.exposure].color}` }), EXPOSURE[F.exposure].ar)))))))),
    rank, askBox,
    el('p', { class: 'rg-note' }, SUN_LIMITS + ' الظل المرسوم ظل كتلة المبنى نفسه من ارتفاعه، تقريبي.')));
  return el('section', { class: 'card sun', id: 'sunCard', 'aria-label': 'الشمس والتوجيه', 'data-score': String(A.score) }, d);
}

export default { municipalCard, sunCard, orientationBadges, siteOf };
