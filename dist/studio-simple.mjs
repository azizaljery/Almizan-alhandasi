// Client journey V2. Reuses the existing AI Worker, room program, Claude/Gemini/AZIZ
// generation, plan viewer and 3D scene. Never simulates a successful revision.
import { diffRoomPrograms, geometryFingerprint, composeDesignConversation } from './design-dialog.mjs';

const $ = id => document.getElementById(id);
const create = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const trim = value => String(value ?? '').trim();
const fmt = n => Number(n).toLocaleString('ar-SA', { maximumFractionDigits: 1 });

function appendMessage(role, message) {
  const root = $('studioTranscript');
  const bubble = create('div', 'studio-message ' + role);
  bubble.append(create('span', 'studio-speaker', role === 'user' ? 'طلبك' : 'الميزان الهندسي'));
  bubble.append(create('p', '', message));
  root.append(bubble);
  while (root.children.length > 12) root.firstElementChild?.remove();
  root.scrollTop = root.scrollHeight;
}
function status(message, level = '') {
  const node = $('studioStatus');
  node.textContent = message;
  node.className = 'studio-feedback ' + level;
}
function styleOnlyCommand(text) {
  const content = trim(text);
  if (content.length > 115 || /(?:غرف|غرفة|مجلس|مطبخ|مساح|متر|حمام|مدخل|ممر|صالة|حائط|باب)/.test(content)) return null;
  if (/كلاسيك|نيوكلاسيك|classic/i.test(content)) return 'classic';
  if (/مودرن|حديث|modern/i.test(content)) return 'modern';
  if (/حجازي|hijazi/i.test(content)) return 'hijazi';
  if (/منتجع|رمل|resort/i.test(content)) return 'resort';
  return null;
}
function plotValues() {
  return {
    width: Number($('studioWidth').value),
    length: Number($('studioLength').value),
    entry: $('studioEntry').value,
    maxBuiltArea: $('studioMaxArea').value.trim() || null,
  };
}
function showDiff(diff, brief) {
  const root = $('studioProposalDiff');
  root.replaceChildren();
  const add = (text, kind = '') => root.append(create('div', 'studio-diff-row ' + kind, text));
  if (diff.added.length) add('إضافة: ' + diff.added.map(r => r.name).join('، '));
  if (diff.removed.length) add('حذف مقترح: ' + diff.removed.map(r => r.name).join('، '), 'warning');
  for (const row of diff.changed.slice(0, 9)) {
    const fields = row.fields.map(f => f.name === 'area'
      ? 'المساحة ' + fmt(f.from) + ' ← ' + fmt(f.to) + ' م²'
      : f.name === 'position' ? 'الموقع ' + f.from + ' ← ' + f.to : 'الجهة ' + f.from + ' ← ' + f.to);
    add(row.room + ': ' + fields.join(' · '));
  }
  if (diff.changed.length > 9) add('وتوجد ' + fmt(diff.changed.length - 9) + ' تعديلات أخرى في البرنامج.');
  if (diff.noChange) add('لم يتغير برنامج الغرف في هذا الاقتراح.', 'warning');
  const warnings = $('studioProposalWarnings');
  warnings.replaceChildren();
  for (const message of [
    ...diff.blockers,
    ...(brief.unhandled || []).map(x => 'غير منفذ أو غير محسوم: ' + x),
    ...(brief.questions || []).map(x => 'سؤال قبل الاعتماد: ' + x),
  ].slice(0, 9)) warnings.append(create('p', '', message));
  $('studioApprove').disabled = diff.blockers.length > 0 || !brief.rooms?.length;
}
function setBusy(busy) {
  for (const id of ['studioSubmit', 'studioLocal', 'studioApprove']) $(id).disabled = busy;
  $('studioRequestForm').setAttribute('aria-busy', String(busy));
}
function markTechnical() {
  for (const id of ['reviewScore', 'insightScore', 'mizanScoreValue', 'engineeringScore']) {
    $(id)?.closest('.card')?.classList.add('studio-technical');
  }
  document.querySelector('#out > details.review-notes')?.classList.add('studio-technical');
}
export function initSimpleStudio() {
  const api = window.mizanStudioAPI;
  if (!api) throw Error('تعذّر ربط الاستوديو بمحرك الميزان الأصلي.');
  const app = $('app');
  app.classList.add('studio-simple-mode');
  markTechnical();
  const initial = api.getState().plot;
  $('studioWidth').value = initial.width;
  $('studioLength').value = initial.length;
  $('studioEntry').value = initial.entry;
  $('studioMaxArea').value = initial.maxBuiltArea ?? '';
  const conversation = { initial: '', turns: [], latest: '', diff: null, approved: false };
  const setPhase = (text, button) => {
    $('studioPhase').textContent = text;
    $('studioSubmit').firstChild.textContent = button + ' ';
  };
  const request = async local => {
    const latest = trim($('studioBrief').value);
    if (!latest) return status('اكتب وصف المنزل أو التعديل المطلوب أولًا.', 'warning');
    const current = api.getState();
    if (!local && !trim($('studioAccessCode').value)) {
      const details = $('studioAccessCode').closest('details');
      details.open = true;
      $('studioAccessCode').focus();
      return status('أدخل رمز خدمة الذكاء للمتابعة، أو اختر «فهم محلي محدود». لن نُظهر تحليلًا وهميًا.', 'warning');
    }
    const style = current.hasModel && styleOnlyCommand(latest);
    if (style) {
      const button = document.querySelector('#styles [data-v="' + style + '"]');
      if (button) {
        button.click();
        appendMessage('user', latest);
        appendMessage('assistant', 'تغيّر طابع الخامات في العرض الثلاثي فقط. توزيع الغرف والجدران لم يتغير.');
        status('تم تغيير الطابع البصري؛ يمكنك متابعة تعديلات الغرف أو التصميم.');
        $('studioBrief').value = '';
        return;
      }
    }
    setBusy(true);
    $('studioProposalPanel').hidden = true;
    status('جارٍ تحليل الطلب ومراجعته مع برنامج الغرف الحالي…');
    appendMessage('user', latest);
    try {
      api.setPlot(plotValues());
      if (!conversation.initial) conversation.initial = latest;
      const prompt = composeDesignConversation(conversation.initial, conversation.turns, latest);
      const proposal = await api.propose(prompt, { accessCode: $('studioAccessCode').value, local });
      const diff = diffRoomPrograms(current.program, proposal.brief.rooms, latest, { requireChange: current.hasModel, initial: !current.hasModel });
      conversation.latest = latest;
      conversation.diff = diff;
      conversation.approved = false;
      $('studioProposalSummary').textContent = proposal.brief.summary;
      showDiff(diff, proposal.brief);
      $('studioProposalPanel').hidden = false;
      appendMessage('assistant', 'هذا فهمي لطلبك: ' + proposal.brief.summary +
        (diff.blockers.length ? ' لكن هناك تعديلات غير مأذون بها أو لم تتغير الهندسة المطلوبة؛ أحتاج توضيحك.' : ' راجع التغييرات ثم اعتمد الرسم.'));
      status(diff.blockers.length
        ? 'لا يمكن رسم اقتراح يُسقط غرفًا أو يغيّر مساحات دون طلبك، أو يعيد برنامجًا بلا تعديل.'
        : 'راجع ملخص الغرف والتغييرات، ثم اضغط «اعتمد الفهم وارسم المخطط».',
        diff.blockers.length ? 'warning' : '');
      $('studioProposalPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      status(error.message || 'تعذّر تحليل الطلب؛ بقي آخر مخطط ناجح كما هو.', 'error');
      appendMessage('assistant', 'لم أستطع اعتماد فهم هندسي لهذا الطلب. لم يتغير مخططك السابق.');
    } finally { setBusy(false); }
  };
  $('studioRequestForm').addEventListener('submit', event => { event.preventDefault(); void request(false); });
  $('studioLocal').addEventListener('click', () => { void request(true); });
  $('studioApprove').addEventListener('click', async () => {
    if (!conversation.diff || conversation.diff.blockers.length) return;
    setBusy(true);
    status('جارٍ توليد هندسة الغرف والتحقق من صلاحيتها ومقارنة البدائل…');
    const before = api.getState().model;
    try {
      const output = await api.drawProposal();
      const after = output.model;
      const changed = !before || geometryFingerprint(before) !== geometryFingerprint(after);
      conversation.turns.push(conversation.latest);
      conversation.approved = true;
      $('studioProposalPanel').hidden = true;
      $('studioBrief').value = '';
      setPhase('02 / راجع المخطط وواصل الحوار', 'أرسل التعديل التالي');
      $('studioBrief').placeholder = 'مثال: قرّب الطعام من مجلس النساء، أبعد غرف النوم عن المطبخ، أو كبّر الصالة دون تغيير عدد غرف النوم.';
      if (!changed) {
        status('التوليد الجديد لم يغيّر هندسة المخطط السابق. لا نعتبر الطلب منفذًا؛ راجع البدائل ووضّح المطلوب.', 'warning');
        appendMessage('assistant', 'المخطط الناتج مطابق هندسيًا للسابق. لم أعتبره تعديلًا ناجحًا.');
      } else {
        status('رُسم مخطط أولي جديد من ' + fmt(after.rooms.length) + ' فراغًا. راجعه واطلب أي تعديل؛ لا يعني ذلك استيفاء جميع رغباتك.');
        appendMessage('assistant', 'ظهر المخطط الأولي بعد التحقق الهندسي. يمكنك الآن طلب تغيير جديد وسأقارن النتيجة بالسابق.');
      }
      $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      status(error.message || 'فشل التوليد. آخر مخطط ناجح محفوظ.', 'error');
      appendMessage('assistant', 'تعذّر إنتاج مخطط صالح لهذه التعديلات؛ بقي آخر تصميم ناجح محفوظًا.');
    } finally { setBusy(false); }
  });
  $('studioEdit').addEventListener('click', () => {
    $('studioProposalPanel').hidden = true;
    status('اكتب توضيحك، وسنراجع الاقتراح من جديد قبل الرسم.');
    $('studioBrief').focus();
  });
  $('studioAdvancedToggle').addEventListener('click', () => {
    const open = app.classList.toggle('studio-advanced-open');
    $('studioAdvancedToggle').setAttribute('aria-expanded', String(open));
    $('studioAdvancedToggle').textContent = open ? 'إخفاء الأدوات المتقدمة والعودة للمحادثة' : 'إظهار الأدوات الأصلية المتقدمة';
    if (!open) {
      const current = api.getState().plot;
      $('studioWidth').value = current.width;
      $('studioLength').value = current.length;
      $('studioEntry').value = current.entry;
      $('studioMaxArea').value = current.maxBuiltArea ?? '';
    }
  });
  return { request, conversation };
}

if (typeof document !== 'undefined') initSimpleStudio();
