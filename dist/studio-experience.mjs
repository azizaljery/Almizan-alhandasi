// Studio presentation only: every document edit still goes through Editor/history.
import { FIXTURES } from './draw/catalog.mjs';
import { drawFixture, THEME } from './draw/editor/render2d.mjs';

const $ = id => document.getElementById(id);
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const TITLES = { select: 'حدد ما تريد تعديله', wall: 'ارسم جدارًا، وحدد طوله', rect: 'ارسم حدود الغرفة', opening: 'أضف بابًا أو نافذة على جدار', fixture: 'اختر الأثاث ثم ضعه في المخطط', room: 'سمِّ الغرفة وحدد استخدامها', stair: 'ضع السلم وحدد اتجاهه', column: 'أضف عمودًا', measure: 'قس المسافة بين نقطتين', dimension: 'أضف قياسًا للمخطط', text: 'أضف ملاحظة', pan: 'حرك مساحة الرسم', erase: 'اختر العنصر الذي تريد حذفه' };
const TABS = { props: 'تفاصيل العنصر', furniture: 'مكتبة الأثاث', rooms: 'غرف المشروع', finish: 'المواد والخامات', review: 'فحص المخطط', qty: 'الكميات والتكلفة', str: 'المراجعة الإنشائية', dna: 'بصمة التصميم', ai: 'مساعد المرسم' };
const GROUPS = [
  ['all', 'الكل', () => true],
  ['living', 'المجلس والمعيشة', f => f.rooms.some(r => ['living', 'majlis'].includes(r))],
  ['bedroom', 'النوم', f => f.rooms.includes('bedroom')],
  ['dining', 'الطعام', f => f.rooms.includes('dining')],
  ['kitchen', 'المطبخ', f => f.rooms.includes('kitchen')],
  ['bath', 'دورات المياه', f => f.rooms.includes('bath')],
  ['outdoor', 'الحوش', (f, key) => f.outdoor || ['tree', 'plant', 'car'].includes(key)],
];

export function mountStudioExperience({ editor, openTab, renderOptions }) {
  const app = $('app'), media = matchMedia('(max-width:860px)');
  let previousTool = editor.tool, activeTab = 'props', returnFocus = null, query = '', category = 'all';
  const accordionState = new Map();
  function panel(open, trigger = null) {
    app.dataset.panelOpen = String(open);
    $('studioPanelToggle').setAttribute('aria-expanded', String(open));
    if (trigger) returnFocus = trigger;
    requestAnimationFrame(() => { editor.resize(); globalThis.__mizanViewer?.resize(); });
  }
  function tab(name, { focus = false } = {}) {
    activeTab = name;
    panel(true, document.activeElement);
    $('studioInspectorTitle').textContent = TABS[name] || 'أدوات المشروع';
    document.querySelectorAll('.tabs [data-tab]').forEach(button => {
      const selected = button.dataset.tab === name;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(selected));
      button.setAttribute('aria-controls', 'tab-' + button.dataset.tab);
      button.id = 'studio-tab-' + button.dataset.tab;
      button.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('.tabpane').forEach(pane => {
      pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', 'studio-tab-' + pane.id.slice(4));
    });
    if (name === 'furniture') renderGallery();
    if (focus) requestAnimationFrame(() => document.querySelector(`.tabs [data-tab="${name}"]`)?.focus());
  }
  function open(name, focus = false) { openTab(name); if (focus) document.querySelector(`.tabs [data-tab="${name}"]`)?.focus(); }
  $('studioPanelToggle').addEventListener('click', event => {
    if (app.dataset.panelOpen === 'true') panel(false);
    else { open(activeTab, true); returnFocus = event.currentTarget; }
  });
  $('studioPanelClose').addEventListener('click', () => { panel(false); (returnFocus?.isConnected ? returnFocus : $('studioPanelToggle')).focus(); });
  $('studioRoomsShortcut').addEventListener('click', () => open('rooms', true));
  $('studioReviewShortcut').addEventListener('click', () => open('review', true));
  $('rail').addEventListener('click', event => {
    const button = event.target.closest('[data-tool]');
    if (!button) return;
    $('studioMoreTools').open = false;
    if (button.dataset.tool === 'fixture') open('furniture');
    else if (media.matches) panel(false);
  });
  $('side').addEventListener('keydown', event => {
    if (event.key === 'Escape' && media.matches) { event.stopPropagation(); panel(false); $('studioPanelToggle').focus(); }
    const current = event.target.closest('[data-tab]');
    if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const tabs = [...document.querySelectorAll('.tabs [data-tab]')], index = tabs.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
    open(tabs[next].dataset.tab, true);
  });
  // Keep exports open until an export kind is selected; other file actions close the menu.
  $('studioProjectMenu').addEventListener('click', event => {
    if (event.target.closest('#btnOpen,#btnExample,#btnNew,[data-export]')) $('studioProjectMenu').open = false;
  });
  document.addEventListener('click', event => {
    for (const id of ['studioProjectMenu', 'studioMoreTools']) if (!$(id).contains(event.target)) $(id).open = false;
  });
  function showHelp(trigger) {
    const dialog = make('dialog'), heading = make('h2', 'كيف تعدّل تصميمك؟'), list = make('ol', null, 'studio-help-list');
    heading.id = 'studioHelpHeading'; dialog.setAttribute('aria-labelledby', heading.id);
    for (const line of [
      'ابدأ بمثال جاهز من قائمة المشروع، أو اختر «غرفة» وحدد زاويتين لإنشاء أربعة جدران.',
      'اختر «تعديل» ثم حدد جدارًا أو قطعة أثاث. ستظهر الأبعاد والدوران في لوحة التفاصيل، وكل القياسات بالمتر.',
      'أضف الباب أو النافذة بالنقر على الجدار. اختر الأثاث من المكتبة المصوّرة، ثم انقر داخل الغرفة لوضعه.',
      'اسحب العنصر لنقله، واستخدم «تدوير» أو «تكرار» من شريط التعديل. التراجع يعيد آخر تغيير.',
      'الشبكة والأبعاد مخفية في البداية. أظهرها عند الحاجة من زري الشبكة والأبعاد بجانب المخطط.',
      'الحفظ التلقائي في هذا المتصفح. نزّل ملف المشروع من «حفظ نسخة» أو من قائمة التصدير للاحتفاظ بنسخة قابلة للتعديل.',
    ]) list.append(make('li', line));
    const close = make('button', 'فهمت، لنبدأ', 'studio-help-close');
    close.type = 'button'; close.addEventListener('click', () => dialog.close());
    dialog.append(heading, list, close); document.body.append(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); });
    dialog.showModal(); close.focus();
  }
  $('studioHelp').addEventListener('click', event => showHelp(event.currentTarget));
  $('studioHelpMenu').addEventListener('click', () => { $('studioProjectMenu').open = false; showHelp($('studioProjectMenu').querySelector('summary')); });
  function toolChanged() {
    $('studioToolTitle').textContent = TITLES[editor.tool] || 'مساحة التصميم';
    document.querySelectorAll('#rail [data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === editor.tool)));
    if (editor.tool === 'fixture' && previousTool !== 'fixture') open('furniture');
    previousTool = editor.tool;
  }
  function selectionChanged() {
    // A sheet opening on pointerdown would interrupt a phone drag. Inspect by
    // double tap or the explicit details button on small screens.
    if (editor.tool === 'select' && editor.selection.size) {
      if (!media.matches) open('props');
      else { activeTab = 'props'; $('studioPanelToggle').textContent = 'تعديل العنصر المحدد'; }
    } else $('studioPanelToggle').textContent = 'التفاصيل والأدوات';
  }
  function decorateProperties() {
    const root = $('tab-props');
    if (editor.selection.size || root.querySelector('.studio-instruction')) return;
    const instruction = make('div', null, 'studio-instruction');
    instruction.append(make('strong', 'عدّل ما تراه مباشرة'), make('span', 'حدد جدارًا أو أثاثًا في المخطط لتغيير أبعاده، أو اختر أداة من الشريط للبدء.'));
    root.prepend(instruction);
    // Keep detailed project settings available without showing every field at once.
    const sections = [...root.querySelectorAll(':scope > .sec')];
    sections.sort((a, b) => Number(b.querySelector('h4')?.textContent === 'ملخص الدور') - Number(a.querySelector('h4')?.textContent === 'ملخص الدور'));
    for (const section of sections) {
      const title = section.querySelector('h4'), key = title?.textContent || 'إعدادات';
      const fold = make('details', null, 'studio-fold'), summary = make('summary', key);
      fold.open = accordionState.has(key) ? accordionState.get(key) : key === 'ملخص الدور';
      fold.addEventListener('toggle', () => accordionState.set(key, fold.open));
      title?.remove(); fold.append(summary, section); root.append(fold);
    }
  }
  function renderGallery() {
    const root = $('tab-furniture');
    const search = make('input'); search.type = 'search'; search.placeholder = 'ابحث عن سرير، كنبة، طاولة…'; search.value = query; search.id = 'studioFurnitureSearch';
    const label = make('label', 'ابحث عن قطعة', 'studio-furniture-search'); label.htmlFor = search.id; label.append(search);
    const filters = make('div', null, 'studio-furniture-filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'تصفية حسب الاستخدام');
    const grid = make('div', null, 'studio-furniture-grid'); grid.setAttribute('aria-label', 'قطع الأثاث');
    const status = make('p', null, 'studio-furniture-empty'); status.setAttribute('role', 'status');
    for (const [key, title] of GROUPS) {
      const button = make('button', title); button.type = 'button'; button.dataset.category = key;
      button.addEventListener('click', () => { category = key; paintCards(); }); filters.append(button);
    }
    search.addEventListener('input', () => { query = search.value; paintCards(); });
    root.replaceChildren(label, filters, grid, status);
    function paintCards() {
      grid.replaceChildren();
      filters.querySelectorAll('button').forEach(button => { const on = button.dataset.category === category; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); });
      const accepts = GROUPS.find(([key]) => key === category)[2];
      const entries = Object.entries(FIXTURES).filter(([kind, fixture]) => accepts(fixture, kind) && (!query.trim() || fixture.ar.includes(query.trim()) || kind.includes(query.trim())));
      status.textContent = entries.length ? `${entries.length} قطعة · اختر قطعة ثم انقر في المخطط لوضعها. المقاسات الافتراضية قابلة للتعديل.` : 'لا توجد قطع مطابقة. جرّب كلمة أخرى أو اختر «الكل».';
      for (const [kind, fixture] of entries) {
        const button = make('button', null, 'studio-furniture-card'); button.type = 'button'; button.dataset.fixture = kind;
        button.classList.toggle('on', editor.opts.fixtureKind === kind); button.setAttribute('aria-pressed', String(editor.opts.fixtureKind === kind));
        button.setAttribute('aria-label', `${fixture.ar}، ${fixture.w} × ${fixture.d} متر`);
        const canvas = make('canvas'); canvas.width = 260; canvas.height = 164; canvas.setAttribute('aria-hidden', 'true');
        const context = canvas.getContext('2d'), scale = Math.min(180 / (fixture.w + .9), 125 / (fixture.d + .9));
        drawFixture(context, { ...fixture, kind, x: 0, y: 0, rot: 0 }, p => ({ x: 130 + p.x * scale, y: 82 - p.y * scale }), scale, false, false, THEME);
        button.append(canvas, make('strong', fixture.ar), make('small', `${fixture.w} × ${fixture.d} م`));
        button.addEventListener('click', () => {
          editor.setOpts({ fixtureKind: kind, fixtureRot: 0, autoRot: true }); editor.setTool('fixture'); renderOptions();
          grid.querySelectorAll('[data-fixture]').forEach(card => { const on = card.dataset.fixture === kind; card.classList.toggle('on', on); card.setAttribute('aria-pressed', String(on)); });
          if (media.matches) { panel(false); editor.canvas.focus({ preventScroll: true }); }
        }); grid.append(button);
      }
    }
    paintCards();
  }
  function saveState(state) {
    const node = $('studioSaveState'); node.dataset.state = state;
    node.textContent = state === 'saving' ? 'جارٍ الحفظ محليًا…' : state === 'error' ? 'تعذّر الحفظ المحلي؛ نزّل نسخة' : 'محفوظ في هذا المتصفح';
  }
  function responsive() { panel(!media.matches); requestAnimationFrame(() => { editor.resize(); editor.fit(); }); }
  media.addEventListener('change', responsive);
  tab('props'); responsive(); toolChanged(); decorateProperties();
  return { tab, panel, toolChanged, selectionChanged, decorateProperties, saveState };
}
