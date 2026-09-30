/* الميزان الهندسي — بوابة العميل
 * طبقة واجهة فوق المحرك الحالي: لا تستبدل الرسم أو خدمة AI.
 */

const PROJECT_KEY = 'mizan_portal_project_v1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function readProject() {
  try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
  catch { return {}; }
}

function writeProject(project) {
  try { localStorage.setItem(PROJECT_KEY, JSON.stringify(project)); }
  catch { /* التخزين المحلي اختياري */ }
}

function cardAction(selector) {
  const element = document.querySelector(selector);
  if (element) element.click();
}

function openDesignPanel() {
  cardAction('#journey > div > .cards > button:nth-child(2)');
}

function scrollToElement(id) {
  const element = document.getElementById(id);
  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function focusClientIdea() {
  const idea = document.getElementById('idea');
  if (!idea) return;
  scrollToElement('idea');
  idea.focus({ preventScroll: true });
}

function mountPortal() {
  const journey = document.getElementById('journey');
  const head = journey?.querySelector('.head');
  if (!journey || !head || document.getElementById('mizanPortal')) return;

  const project = readProject();
  const name = project.name || '';

  const portal = document.createElement('section');
  portal.id = 'mizanPortal';
  portal.className = 'mizan-portal';
  portal.setAttribute('aria-label', 'بوابة الميزان الهندسي');
  portal.innerHTML = `
    <div class="portal-topline">
      <div>
        <span class="portal-kicker">MIZAN ENGINEERING PORTAL</span>
        <h2>بوابة مشروعك الهندسي</h2>
        <p>ابدأ من فكرة العميل، ثم انتقل إلى المخطط والكميات من نفس المشروع.</p>
      </div>
      <div class="portal-project-state" id="portalProjectState">
        <span class="portal-state-dot"></span>
        <span>${name ? `المشروع الحالي: ${esc(name)}` : 'لا يوجد مشروع مفتوح'}</span>
      </div>
    </div>
    <div class="portal-project-bar">
      <label for="portalProjectName">اسم المشروع
        <input id="portalProjectName" type="text" maxlength="80" placeholder="مثال: فيلا الوالدة" value="${esc(name)}">
      </label>
      <button type="button" class="portal-save" id="portalSaveProject">حفظ المشروع</button>
      <button type="button" class="portal-new" id="portalNewProject">مشروع جديد</button>
    </div>
    <div class="portal-workspaces">
      <button type="button" class="portal-workspace portal-primary" data-portal-action="brief">
        <span class="portal-icon">✦</span><span><b>فهم العميل</b><small>حوّل الرغبات والقيود إلى برنامج تصميم واضح</small></span><strong>ابدأ ←</strong>
      </button>
      <button type="button" class="portal-workspace" data-portal-action="land">
        <span class="portal-icon">⌂</span><span><b>تقييم الأرض</b><small>الأبعاد، الشوارع، المدخل، والاستغلال المبدئي</small></span><strong>فتح ←</strong>
      </button>
      <button type="button" class="portal-workspace" data-portal-action="design">
        <span class="portal-icon">▦</span><span><b>المخطط والتصميم</b><small>الغرف، البدائل، 2D، 3D، الشمس، والظل</small></span><strong>فتح ←</strong>
      </button>
      <button type="button" class="portal-workspace" data-portal-action="boq">
        <span class="portal-icon">▤</span><span><b>الكميات والتقدير</b><small>كميات مرتبطة بالمخطط وأسعار قابلة للتعديل</small></span><strong>فتح ←</strong>
      </button>
    </div>
    <div class="portal-note"><b>مسار العمل:</b> فهم المتطلبات → اعتماد البرنامج → توليد المخطط → مراجعة 2D/3D → الكميات.</div>
  `;

  head.before(portal);

  portal.querySelector('#portalSaveProject')?.addEventListener('click', () => {
    const input = portal.querySelector('#portalProjectName');
    const projectName = input?.value.trim();
    writeProject({ name: projectName, updatedAt: new Date().toISOString() });
    const state = portal.querySelector('#portalProjectState');
    if (state) state.innerHTML = `<span class="portal-state-dot"></span><span>${projectName ? `المشروع الحالي: ${esc(projectName)}` : 'لا يوجد مشروع مفتوح'}</span>`;
  });

  portal.querySelector('#portalNewProject')?.addEventListener('click', () => {
    writeProject({});
    const input = portal.querySelector('#portalProjectName');
    if (input) input.value = '';
    const state = portal.querySelector('#portalProjectState');
    if (state) state.innerHTML = '<span class="portal-state-dot"></span><span>مشروع جديد غير مسمى</span>';
    scrollToElement('journey');
  });

  portal.querySelectorAll('[data-portal-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.portalAction;
      if (action === 'brief') { openDesignPanel(); focusClientIdea(); return; }
      if (action === 'land') { cardAction('#journey > div > .cards > button:nth-child(1)'); return; }
      if (action === 'design') { openDesignPanel(); return; }
      if (action === 'boq') { cardAction('#journey > div > .cards > button:nth-child(3)'); return; }
    });
  });
}

function injectPortalStyles() {
  if (document.getElementById('mizanPortalStyles')) return;
  const style = document.createElement('style');
  style.id = 'mizanPortalStyles';
  style.textContent = `
    .mizan-portal{margin:0 0 34px;padding:24px;border:1px solid rgba(198,161,91,.3);border-radius:24px;background:linear-gradient(135deg,rgba(198,161,91,.12),rgba(10,10,10,.18) 52%,rgba(79,216,208,.07));box-shadow:0 18px 50px rgba(0,0,0,.16)}
    .portal-topline{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:20px}
    .portal-kicker{display:block;color:var(--g,#c6a15b);font-size:.68rem;letter-spacing:3px;font-weight:800}
    .portal-topline h2{margin:6px 0 4px;color:var(--i,#f6f1e7);font-size:clamp(1.5rem,3vw,2.1rem)}
    .portal-topline p{color:var(--m,#9aa8bd);font-size:.9rem}
    .portal-project-state{display:flex;align-items:center;gap:8px;color:var(--m,#9aa8bd);font-size:.78rem;white-space:nowrap}
    .portal-state-dot{width:9px;height:9px;border-radius:50%;background:#5ee6a8;box-shadow:0 0 12px #5ee6a8;display:inline-block}
    .portal-project-bar{display:flex;align-items:flex-end;gap:10px;margin-bottom:18px}
    .portal-project-bar label{flex:1;color:var(--m,#9aa8bd);font-size:.78rem}
    .portal-project-bar input{margin-top:6px;width:100%;min-height:44px;background:rgba(6,12,22,.72);border-color:rgba(198,161,91,.28)}
    .portal-save,.portal-new{min-height:44px;padding:10px 16px;border-radius:10px;font-weight:800;white-space:nowrap}
    .portal-save{border:0;background:var(--g,#c6a15b);color:#111}.portal-new{border:1px solid rgba(198,161,91,.35);background:transparent;color:var(--i,#f6f1e7)}
    .portal-workspaces{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .portal-workspace{min-height:132px;padding:16px;text-align:right;border:1px solid rgba(198,161,91,.2);border-radius:15px;background:rgba(8,15,27,.68);color:var(--i,#f6f1e7);display:flex;flex-direction:column;justify-content:space-between;gap:10px;transition:.2s}
    .portal-workspace:hover,.portal-workspace:focus-visible{transform:translateY(-3px);border-color:var(--g,#c6a15b);box-shadow:0 12px 25px rgba(0,0,0,.2)}
    .portal-workspace.portal-primary{background:linear-gradient(145deg,rgba(198,161,91,.28),rgba(8,15,27,.82));border-color:rgba(198,161,91,.5)}
    .portal-workspace>span:nth-child(2){display:flex;flex-direction:column;gap:5px}.portal-workspace b{font-size:.96rem}.portal-workspace small{color:var(--m,#9aa8bd);font-size:.73rem;line-height:1.55}.portal-workspace strong{color:var(--g,#c6a15b);font-size:.76rem}
    .portal-icon{font-size:1.45rem;color:var(--g,#c6a15b)}
    .portal-note{margin-top:16px;padding-top:14px;border-top:1px solid rgba(198,161,91,.16);color:var(--m,#9aa8bd);font-size:.78rem}.portal-note b{color:var(--i,#f6f1e7)}
    @media(max-width:820px){.portal-topline{flex-direction:column}.portal-project-state{white-space:normal}.portal-workspaces{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:520px){.mizan-portal{padding:18px;border-radius:18px}.portal-project-bar{flex-wrap:wrap}.portal-project-bar label{flex-basis:100%}.portal-save,.portal-new{flex:1}.portal-workspaces{grid-template-columns:1fr}.portal-workspace{min-height:110px}}
  `;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
  injectPortalStyles();
  mountPortal();
});

// بوابة الإدارة المستقلة
import('./mizan-portal.mjs').then(({ initMizanPortal }) => {
  initMizanPortal();
}).catch(error => console.warn('Mizan portal unavailable:', error));

export { mountPortal };
