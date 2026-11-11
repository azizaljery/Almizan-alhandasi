// شريط الخطوات الموحّد في كل صفحات المسار (الرئيسية والتصميم والمجسم والمخططات):
// المرحلة الحالية مميّزة، كل مرحلة بُلغت رابط رجوع/تقدم، وما لم يُبلغ معطّل ويذكر سببه عند الضغط.
import { stageStates, readJourney, samePage } from './journey-nav.mjs';

const CSS = `
ol.steps.jst{display:flex;gap:4px;list-style:none;margin:0;padding:0;flex-wrap:wrap;align-items:center;font-size:13px;position:relative}
ol.steps.jst li{display:block!important;padding:0;border-radius:99px;white-space:nowrap}
ol.steps.jst li>a,ol.steps.jst li>span,ol.steps.jst li>button{display:block;padding:4px 11px;border-radius:99px;font:inherit;color:inherit;text-decoration:none;background:none;border:0;line-height:1.5}
ol.steps.jst li>a{cursor:pointer;text-decoration:underline;text-decoration-color:#b08a4a88;text-underline-offset:4px}
ol.steps.jst li>a:hover,ol.steps.jst li>a:focus-visible{background:#d9b87733;text-decoration-color:currentColor}
ol.steps.jst li>a:focus-visible,ol.steps.jst li>button:focus-visible{outline:2px solid #d9b877;outline-offset:1px}
ol.steps.jst li.on>span{font-weight:600}
ol.steps.jst li.off>button{opacity:.48;cursor:not-allowed}
ol.steps.jst .jst-why{position:absolute;inset-block-start:calc(100% + 6px);inset-inline-start:0;z-index:80;max-width:min(340px,86vw);white-space:normal;background:#2c2018;color:#f6ecd8;border:1px solid #b08a4a;border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.6;box-shadow:0 8px 24px #0006}
.fh ol.steps.jst li.on{background:#d9b877;color:#3d241b}.fh ol.steps.jst li.done,.fh ol.steps.jst li.off{opacity:.9}
@media (max-width:820px){ol.steps.jst{flex-wrap:nowrap;overflow-x:auto;max-width:100%;scrollbar-width:none;-webkit-overflow-scrolling:touch;flex:1 1 100%;order:5;min-width:0}ol.steps.jst::-webkit-scrollbar{display:none}ol.steps.jst .jst-why{position:fixed;inset-block-start:auto;inset-block-end:16px;inset-inline:12px;max-width:none}}
@media print{ol.steps.jst{display:none!important}}
`;
let styled = false;
function ensureStyle() { if (styled) return; styled = true; const s = document.createElement('style'); s.dataset.jst = ''; s.textContent = CSS; document.head.append(s); }

/**
 * يركّب الشريط في ‎<ol class="steps">‎. current: دالة تعيد معرّف المرحلة الحالية.
 * onLocal(stage, url): للروابط داخل الصفحة نفسها (بلا إعادة تحميل)؛ إن أعادت true فقد عولج الانتقال.
 * يعيد دالة إعادة الرسم.
 */
export function mountSteps(ol, { current, onLocal = null, store = globalThis.localStorage } = {}) {
  if (!ol) return () => {};
  ensureStyle(); ol.classList.add('jst'); ol.setAttribute('aria-label', 'مراحل التصميم — اضغط أي مرحلة بلغتها للعودة إليها');
  let why = null, timer = 0;
  const hideWhy = () => { clearTimeout(timer); why?.remove(); why = null; };
  const showWhy = text => { hideWhy(); why = document.createElement('li'); why.className = 'jst-why'; why.setAttribute('role', 'status'); why.textContent = text; ol.append(why); timer = setTimeout(hideWhy, 5200); };
  function paint() {
    hideWhy();
    let j; try { j = readJourney(store); } catch { j = { session: null, hasLand: false, studio: false, mark: null }; }
    const cur = current(), items = stageStates(j, cur).map(s => {
      const li = document.createElement('li'); li.dataset.stage = s.id;
      if (s.current) { li.className = 'on'; li.setAttribute('aria-current', 'step'); const sp = document.createElement('span'); sp.textContent = s.label; li.append(sp); }
      else if (s.reached) {
        li.className = 'done'; const a = document.createElement('a'); a.href = s.href; a.textContent = s.label; a.title = 'العودة إلى «' + s.label + '» — لا يُفقد شيء من تصميمك';
        a.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; if (onLocal && samePage(a.href, location.href) && onLocal(s, new URL(a.href, location.href))) e.preventDefault(); });
        li.append(a);
      } else {
        li.className = 'off'; const b = document.createElement('button'); b.type = 'button'; b.textContent = s.label; b.setAttribute('aria-disabled', 'true'); b.title = s.reason;
        b.addEventListener('click', () => showWhy('«' + s.label + '» غير متاحة بعد. ' + s.reason)); li.append(b);
      }
      return li;
    });
    ol.replaceChildren(...items);
    // الشريط الممرَّر (الجوال): المرحلة الحالية في وسطه — بتمرير الشريط نفسه لا الصفحة
    const on = ol.querySelector('li.on'); if (on && ol.scrollWidth > ol.clientWidth) { const a = on.getBoundingClientRect(), b = ol.getBoundingClientRect(); ol.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2); }
  }
  paint();
  // تغيّرت الجلسة في لسان آخر أو عادت الصفحة من ذاكرة الرجوع: يُعاد الرسم
  addEventListener('storage', paint); addEventListener('pageshow', e => { if (e.persisted) paint(); });
  return paint;
}
export default { mountSteps };
