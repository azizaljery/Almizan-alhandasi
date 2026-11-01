// (طلب المالك 2026-10-31) بطاقة «واجهات التصميم» في صفحة التصميم: تبديل الطراز والكثافة والجهة بأزرار ومعاينة فورية (SVG من
// المسقط نفسه) دون إعادة توليد المسقط. الاختيار يُحفظ في session.input.facade (حقل ملف الاحتياجات نفسه بمصدره وتاريخه).
import { resolveFacade, elevationSvg, facadeGeometry, composeElevation, elevationMetrics, withFacade, clientKeyOf, SIDES, SIDE_AR, ORNAMENT_AR } from './facade-styles.mjs';
import { FACADE_CHOICES, FACADE_CHOICE_AR, facadeChoiceRecord, DEFAULT_FACADE_CHOICE, RENDERED_STYLE_OF } from './facade-choice.mjs';

const CSS = `
.facade-card .fbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 10px}
.facade-card .fseg{display:flex;flex-wrap:wrap;border:1px solid var(--mz-line,#ddd);border-radius:10px;overflow:hidden}
.facade-card .fseg button{border:0;background:#fff;padding:6px 12px;cursor:pointer;font:inherit;font-size:13.5px}
.facade-card .fseg button[aria-pressed=true]{background:var(--mz-green-deep,#1f3b33);color:#fff;font-weight:600}
.facade-card .fview{border:1px solid var(--mz-line,#ddd);border-radius:12px;background:#fbf8f2;overflow:auto;max-width:100%}
.facade-card .fview svg{display:block;width:100%;height:auto;max-height:520px;min-width:420px;margin:0 auto}
.facade-card .fnote{font-size:13px;color:#57564c;margin:8px 0 0}
.facade-card .fsw{display:inline-flex;gap:3px;vertical-align:middle;margin-inline-start:6px}
.facade-card .fsw b{width:14px;height:14px;border-radius:4px;border:1px solid #0002;display:inline-block}
`;
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); return n; };
function injectCss() { if (document.getElementById('facade-ui-css')) return; const s = document.createElement('style'); s.id = 'facade-ui-css'; s.textContent = CSS; document.head.append(s); }

/** اختيار الواجهة في الجلسة (أو الافتراضي «اختر لي» بمصدر design_default). */
export const facadeChoiceOf = (session, doc = null) => {
  if (session?.input?.facade) return session.input.facade;
  const f = doc?.finish?.facade, st = RENDERED_STYLE_OF[f?.style];
  return st ? { style: st, ornament: 'medium', source: 'client_free_text', priority: 'flexible', originalText: 'طلب سابق: واجهة ' + (f.styleAr || st), history: [] } : DEFAULT_FACADE_CHOICE;
};
/** المستند مع اختيار الواجهة للمرسم والمجسّم — البذرة من هندسة هذا التصميم ومفتاح هذا العميل. */
export const docWithFacade = (doc, session) => withFacade(doc, facadeChoiceOf(session, doc), clientKeyOf(session?.input || {}));

/**
 * يبني البطاقة. opts: { session, doc, save(session) }. يعيد عنصر DOM.
 * لا يمس session.designs ولا المسقط: يحدّث session.input.facade فقط ثم save.
 */
export function facadeCard({ session, doc, save }) {
  injectCss();
  const geom = facadeGeometry(doc), clientKey = clientKeyOf(session.input || {});
  const front = doc.entry && geom.sides[doc.entry]?.pieces.length ? doc.entry : SIDES.find(s => geom.sides[s].pieces.length) || 's';
  let side = front;
  const card = el('section', { class: 'card facade-card', id: 'facadeCard', 'aria-label': 'واجهات التصميم' });
  const render = () => {
    const ch = facadeChoiceOf(session, doc), d = withFacade(doc, ch, clientKey), spec = resolveFacade(d);
    const E = composeElevation(d, side, spec, geom), M = elevationMetrics(E);
    const who = ch.source === 'design_default' ? 'لم تختر طرازًا بعد — اختار الميزان هذا مبدئيًا' : ch.style === 'auto' ? 'اخترت «اختر لي» — اختار الميزان' : 'اختيارك';
    const P = spec.palette;
    const styleBtns = el('div', { class: 'fseg', role: 'group', 'aria-label': 'طراز الواجهة' }, FACADE_CHOICES.map(id => el('button', { type: 'button', 'data-style': id, 'aria-pressed': String(ch.style === id && ch.source !== 'design_default'), onclick: () => pick({ style: id }) }, FACADE_CHOICE_AR[id])));
    const ornBtns = el('div', { class: 'fseg', role: 'group', 'aria-label': 'كثافة الزخرفة' }, Object.entries(ORNAMENT_AR).map(([k, v]) => el('button', { type: 'button', 'data-ornament': k, 'aria-pressed': String((ch.ornament || 'medium') === k), onclick: () => pick({ ornament: k }) }, v)));
    const sideBtns = el('div', { class: 'fseg', role: 'tablist', 'aria-label': 'الجهة' }, SIDES.filter(s => geom.sides[s].pieces.length).map(s => el('button', { type: 'button', role: 'tab', 'data-side': s, 'aria-pressed': String(s === side), onclick: () => { side = s; render(); } }, SIDE_AR[s] + (s === doc.entry ? ' (المدخل)' : geom.streets.has(s) ? ' (شارع)' : ''))));
    const view = el('div', { class: 'fview', 'data-facade-view': side }); view.innerHTML = elevationSvg(d, side, spec, { geom });
    const exterior = geom.sides[side].openings, parapet = geom.parapet;
    card.replaceChildren(
      el('h2', {}, 'واجهات التصميم'),
      el('p', { class: 'sub', 'data-facade-summary': '' }, `الطراز: ${spec.styleAr} (${who}) — اللوحة: ${spec.paletteName}`, el('span', { class: 'fsw', 'aria-hidden': 'true' }, [P.wall, P.accent, P.trim, P.frame].map(c => el('b', { style: `background:${c}` })))),
      el('div', { class: 'fbar' }, styleBtns), el('div', { class: 'fbar' }, el('span', { class: 'sub' }, 'الزخرفة:'), ornBtns, sideBtns),
      view,
      el('p', { class: 'fnote' }, `النوافذ والأبواب في مواضعها من المسقط نفسه (${exterior} ${exterior === 1 ? 'فتحة' : 'فتحات'} خارجية على هذه الجهة، لا فتحات مضافة)؛ الدروة/الساتر ${parapet.toFixed(2)} م كما في التصميم. تبديل الطراز لا يغيّر توزيع الغرف. الواجهة مقترح مبدئي يحتاج اعتماد مكتب هندسي مرخّص، لا رسمًا تنفيذيًا.`),
      el('p', { class: 'fnote', 'data-facade-metrics': JSON.stringify({ style: spec.style, seed: spec.seed, ornament: M.ornament, openings: M.openings.length }) }, 'يظهر الطراز نفسه في المجسّم ثلاثي الأبعاد بعد الاعتماد وفي المرسم.'));
  };
  const pick = patch => {
    const cur = facadeChoiceOf(session, doc);
    const style = patch.style ?? (cur.source === 'design_default' ? cur.style : cur.style);
    const rec = facadeChoiceRecord(style, { source: patch.style ? 'client_confirmed' : cur.source === 'design_default' ? 'design_default' : cur.source, ornament: patch.ornament || cur.ornament, originalText: patch.style ? 'اختيار العميل من صفحة التصميم: ' + FACADE_CHOICE_AR[style] : cur.originalText }, cur === DEFAULT_FACADE_CHOICE ? null : cur);
    session.input.facade = rec; save?.(session); render();
  };
  render();
  return card;
}

export default { facadeCard, docWithFacade, facadeChoiceOf };
