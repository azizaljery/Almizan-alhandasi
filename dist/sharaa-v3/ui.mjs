// SHARAA V3 — واجهة المقابلة المعمارية (تجريبي). تُركَّب اختياريًا داخل محادثة شرعاء؛ لا تولّد بنفسها.
// الأرض تُورَّث من الخطوة السابقة ولا تُسأل ثانيةً. الإرسال إلى شرعاء الحالي عبر native-bridge فقط.
import { bank, createBrief, answer, nextQuestion, readiness, defer, reviseLand, ingest, retract, gateMatches, conflicts } from './core.mjs';
import { parseFree } from './quality.mjs';
import { toV3Land, canSend } from './native-bridge.mjs';

const STORE_KEY = 'mizan.sharaa-v3.brief';
// سبب السؤال بمستوى المجال (عام، لا يدّعي قاعدة نظامية): يشرح ما الذي قد يتغير في التصميم بحسب الجواب
const DOMAIN_WHY = {
  household: 'عدد السكان وتركيبهم يحدد عدد غرف النوم وحجم الصالة والمطبخ.',
  children: 'وجود الأطفال وأعمارهم يغيّر موقع غرف النوم والرؤية من المطبخ ومنطقة اللعب.',
  parents: 'إقامة أحد الوالدين تغيّر دور الجناح وقربه من الصالة واستقلال مدخله.',
  hospitality: 'نمط الضيافة يحدد عدد المجالس ومداخلها ومسار الطعام بين المطبخ والمجلس.',
  site: 'قيود الأرض (الزاوية، الضيق، الجيران) تؤثر في توزيع الكتلة والمداخل والمواقف.',
  privacy: 'الخصوصية تحدد فصل مسار الضيوف عن العائلة وحجب الرؤية عن الداخل.',
  daily: 'عادات اليوم تحدد المكتب والمصلى والتخزين قرب المدخل.',
  services: 'المطبخ والخدمات يحدد مساراتها ومداخلها واتصالها بالطعام.',
  sleep: 'ترتيب النوم يحدد الجناح الرئيسي وقربه أو بعده عن الصالة والدرج.',
  living: 'الصالات والطعام والحمامات الإجمالية هي أساس البرنامج المعماري.',
  environment: 'المناخ والإضاءة يؤثران في الفتحات والتظليل؛ لا تُقدَّر دون بيانات موثقة.',
  garden: 'الحديقة والفناء يحدد موضعها واتصالها بالصالة وخصوصيتها.',
  future: 'التوسع المستقبلي يحجز مواضع ولا يغيّر التصميم الحالي كثيرًا.',
  architecture: 'التفضيلات المعمارية توجّه الفكرة العامة دون أن تغيّر البرنامج.',
  budget: 'الميزانية والأولويات تحدد ما يُقدَّم عند التعارض وعدد البدائل.',
};
const PRIORITY = [['preferred', 'تفضيل'], ['mandatory', 'إلزامي'], ['flexible', 'مرن']];
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const readStore = storage => { try { const v = JSON.parse(storage?.getItem(STORE_KEY) || 'null'); return v && v.v === 1 && v.brief && v.brief.schemaVersion === 'SHARAA-BRIEF/3.0.0' ? v.brief : null; } catch { return null; } };
const writeStore = (storage, brief) => { try { storage?.setItem(STORE_KEY, JSON.stringify({ v: 1, brief })); } catch { /* التخزين غير متاح: تستمر الجلسة بلا حفظ */ } };
const sameLandV3 = (a, b) => a.widthM === b.widthM && a.depthM === b.depthM && JSON.stringify(a.entries) === JSON.stringify(b.entries) && JSON.stringify(a.streets) === JSON.stringify(b.streets) && (a.floors || 1) === (b.floors || 1);

/** يركّب المقابلة في host. land = أرض شرعاء المؤكدة. onApply(text) يسلّم النص إلى شرعاء الحالي. */
export function mountAdaptive(host, landRaw, { onClose, onApply, storage = globalThis.localStorage } = {}) {
  let land = toV3Land(landRaw), b = createBrief(land), editing = null, notice = '', depth = 'standard', original = [];
  const saved = readStore(storage); if (saved) { b = sameLandV3(saved.land, land) ? saved : reviseLand(saved, land); }
  const qBy = id => bank.find(q => q.id === id);
  const persist = () => writeStore(storage, b);
  const btn = (text, fn, cls = 'chip') => { const n = el('button', text, cls); n.type = 'button'; n.addEventListener('click', () => { try { fn(); } catch (e) { notice = e.message; draw(); } }); return n; };
  const optionsOf = q => (q.options?.length ? q.options : q.type === 'b' ? [{ value: true, label: 'نعم' }, { value: false, label: 'لا' }] : q.type.includes('|') ? q.type.split('|').map(value => ({ value, label: value })) : []);
  function draw() {
    host.replaceChildren(); host.dataset.v3 = 'on';
    const head = el('div', undefined, 'v3-head'); head.append(el('h3', 'شرعاء V3 — مقابلة معمارية'), el('span', 'تجريبي', 'v3-badge')); host.append(head);
    host.append(el('p', `أرضك مؤكدة سابقًا (${land.widthM} × ${land.depthM} م) ولن أسألك عنها مجددًا. الأسئلة تتغير حسب إجاباتك، وكل ما أقوله مسجَّل وقابل للتعديل.`, 'hint'));
    if (notice) { const p = el('p', notice, 'hint'); p.setAttribute('role', 'status'); host.append(p); }
    // الحديث الحر: يستخرج عدة متطلبات ويعرضها للتأكيد قبل اعتمادها
    const free = el('textarea'); free.placeholder = 'مثال: عندي ٣ عيال وأبي تصميم واحد'; free.setAttribute('aria-label', 'صف احتياجاتك بحرية'); free.dataset.v3 = 'free';
    host.append(free, btn('افهم كلامي', () => {
      const p = parseFree(free.value); if (!free.value.trim()) throw Error('اكتب وصفًا أولًا.');
      original.push(p.originalText); const r = ingest(b, p.proposals); b = r.brief;
      notice = p.proposals.length ? `استخرجت ${p.proposals.length} معلومة من كلامك. لا أعتمدها قبل تأكيدك.` : 'لم أستخرج رقمًا صريحًا من الوصف؛ أجب عن الأسئلة أدناه.';
      if (p.ambiguous.length) notice += ' عبارات متعارضة العدد لم أستخرج منها شيئًا: ' + p.ambiguous.map(id => qBy(id).text).join('؛ ');
      if (r.rejected.length) notice += ' رُفض بعضها: ' + r.rejected.map(x => x.reason).join('؛ ');
      persist(); draw();
    }, 'chip'));
    const pending = Object.entries(b.facts).filter(([, f]) => f.verification !== 'confirmed');
    if (pending.length) {
      const box = el('section', undefined, 'v3-confirm'); box.append(el('h4', 'تأكيد ما فهمته'));
      for (const [id, f] of pending) {
        const row = el('div', undefined, 'v3-row'); row.append(el('p', `${qBy(id).text} — ${String(f.value)} (من قولك: «${f.evidence}»)`));
        row.append(btn('أؤكد', () => { b = answer(b, id, f.value, { source: 'client_confirmed', priority: 'preferred', evidence: f.evidence, revise: true }); notice = 'تم تأكيد المعلومة.'; persist(); draw(); }), btn('لا، تجاهل', () => { b = retract(b, id); notice = 'سحبتُ الاستنتاج.'; persist(); draw(); }, 'chip ghost'));
        box.append(row);
      }
      host.append(box);
    }
    const r = readiness(b), core = r.missing.length;
    host.append(el('p', `معلومات مؤكدة: ${Object.values(b.facts).filter(f => f.verification === 'confirmed').length} · أسئلة أساسية متبقية: ${core}`, 'hint'));
    const dl = el('label', undefined, 'v3-depth'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = depth === 'full'; cb.setAttribute('aria-label', 'أسئلة أكثر تفصيلًا');
    cb.addEventListener('change', () => { depth = cb.checked ? 'full' : 'standard'; draw(); }); dl.append(cb, el('span', ' أسئلة أكثر تفصيلًا (اختياري)')); host.append(dl);
    const q = editing ? qBy(editing) : nextQuestion(b, { depth });
    if (q?.kind === 'conflict') {
      host.append(el('p', 'تعارض يحتاج قرارك: ' + q.reason, 'error')); host.append(el('p', 'لن أختار عنك. عدّل أحد الجوابين:', 'hint'));
      for (const id of q.fields) host.append(btn('تعديل: ' + qBy(id).text, () => { editing = id; draw(); }));
    } else if (q) {
      const f = b.facts[q.id], card = el('section', undefined, 'v3-q'); card.dataset.q = q.id;
      card.append(el('h4', q.text));
      const why = el('details'); why.append(el('summary', 'لماذا أسأل؟'), el('p', DOMAIN_WHY[q.domain] || 'يؤثر الجواب في البرنامج المعماري.')); card.append(why);
      if (f) card.append(el('p', `الجواب المسجل: ${String(f.value)}${f.recheck ? ' — يحتاج مراجعة بعد تغيّر المعطيات' : ''}`, 'hint'));
      const pr = el('select'); pr.setAttribute('aria-label', 'أولوية الطلب'); for (const [v, t] of PRIORITY) { const o = el('option', t); o.value = v; pr.append(o); } pr.value = f?.priority || 'preferred';
      card.append(el('label', 'أهمية هذا الطلب: ', 'hint'), pr);
      const submit = v => { b = answer(b, q.id, v, { source: 'client_confirmed', priority: pr.value, revise: !!f, evidence: f?.evidence || q.text }); editing = null; notice = 'سجّلتُ قرارك.'; persist(); draw(); };
      const opts = optionsOf(q);
      if (opts.length) { const wrap = el('div', undefined, 'v3-pick'); for (const o of opts) wrap.append(btn(o.label, () => submit(o.value))); card.append(wrap); }
      else {
        const form = el('form', undefined, 'v3-free'), i = el('input'); i.type = ['n', 'decimal'].includes(q.type) ? 'number' : 'text'; i.required = true; i.min = '0'; i.step = q.type === 'decimal' ? 'any' : '1'; i.setAttribute('aria-label', q.text); if (f) i.value = f.value;
        const go = el('button', 'تأكيد', 'cta'); go.type = 'submit'; form.append(i, go);
        form.addEventListener('submit', e => { e.preventDefault(); try { submit(i.type === 'number' ? i.valueAsNumber : i.value); } catch (err) { notice = err.message; draw(); } }); card.append(form);
      }
      if (q.tier !== 1 && pr.value !== 'mandatory' && !editing) card.append(btn('لاحقًا', () => { b = defer(b, q.id); persist(); draw(); }, 'chip ghost'));
      if (editing) card.append(btn('إلغاء التعديل', () => { editing = null; draw(); }, 'chip ghost'));
      host.append(card);
    } else host.append(el('p', 'انتهت الأسئلة المتاحة وفق إجاباتك.'));
    // مراجعة وتعديل الإجابات دون إعادة المقابلة
    const rev = el('details'); rev.dataset.v3 = 'review'; rev.append(el('summary', `ملف القرارات (${Object.keys(b.facts).length})`));
    for (const [id, f] of Object.entries(b.facts)) { const row = el('div', undefined, 'v3-row'); row.append(el('p', `${qBy(id).text} — ${String(f.value)}${f.recheck ? ' (مراجعة مطلوبة)' : ''}${f.verification !== 'confirmed' ? ' (غير مؤكد)' : ''}`)); if (gateMatches(qBy(id).gate, b)) row.append(btn('تعديل', () => { editing = id; draw(); }, 'chip')); rev.append(row); }
    host.append(rev);
    // الإرسال إلى شرعاء: ما سيُنقل وما لن يُطبَّق، بصدق
    const send = canSend(b), s = send.sharaText, box = el('section', undefined, 'v3-send'); box.dataset.v3 = 'send';
    box.append(el('h4', 'ما سأرسله إلى شرعاء'));
    box.append(el('p', s.text || 'لا شيء بعد.', 'v3-text'));
    const left = s.notApplied.filter(x => x.support === 'not_applied');
    if (left.length) { const d = el('details'); d.append(el('summary', `لن يُطبَّق في التوليد الحالي (${left.length}) — مسجَّل ومعلن لا مُسقَط`)); for (const x of left) d.append(el('p', `${x.text} — ${String(x.value)}${x.mandatory ? ' [إلزامي]' : ''}`, x.mandatory ? 'error' : 'hint')); box.append(d); }
    for (const why of send.reasons) box.append(el('p', why, 'error'));
    const go = btn('أرسل إلى شرعاء وابنِ البرنامج', () => { onApply?.(s.text); }, 'cta'); go.disabled = !send.ok; go.dataset.v3 = 'apply'; box.append(go);
    host.append(box);
    host.append(btn('تصدير ملف المقابلة', () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ brief: b, originalText: original, readiness: r }, null, 2)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = 'sharaa-v3-brief.json'; a.click(); URL.revokeObjectURL(url); }, 'chip ghost'),
      btn('العودة إلى شرعاء الحالي', () => onClose?.(), 'chip ghost'));
  }
  draw();
  return { snapshot: () => structuredClone(b), changeLand: l => { land = toV3Land(l); b = reviseLand(b, land); notice = 'تغيّرت الأرض: حافظتُ على معلومات أسرتك وأعدتُ فحص ما يتأثر بها.'; persist(); draw(); }, conflicts: () => conflicts(b) };
}
