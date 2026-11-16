// نافذة شرعاء الجانبية: زر ثابت في كل صفحات المسار يفتح نافذة صغيرة على الجنب؛ العميل يسأل أو يطلب في أي وقت
// فتجيبه من تصميمه أو تنفّذ طلبه عليه (shara-assistant.mjs)، وتنطق الرد بصوتها إن أراد، وتسمعه بالميكروفون إن دعمه المتصفح.
// مستقلة عن الصفحة: تقرأ الجلسة من التخزين وتكتبها، وتبث الحدث «mizan:session» لتحدّث الصفحة عرضها.
import { sharaTurn, routeOf } from './shara-assistant.mjs';
import { askShara, toMessage, aiOff, fallbackNote, TAG_LABEL } from './shara-remote.mjs';
import { markReached } from './journey-nav.mjs';
import { mountSteps } from './journey-steps.mjs';
import { loadSession, saveSession } from './design-session.mjs';
import { redesignInWorker, fixInWorker, ticking, pending } from './design-client.mjs';

const CHAT_KEY = 'mizan.shara.chat.v1', VOICE_KEY = 'mizan.shara.voice', OPEN_KEY = 'mizan.shara.open';
const page = document.body.dataset.stage || 'design';
const get = (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* التخزين غير متاح: تعمل النافذة بلا حفظ */ } };
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); return n; };
const icon = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = d; return s; };
const IC = {
  chat: '<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  down: '<path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  send: '<path d="M20 4 3 11l7 2 2 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m17 9 5 6M22 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

const CSS = `
.shp-fab{position:fixed;inset-block-end:18px;inset-inline-end:18px;z-index:90;display:flex;align-items:center;gap:8px;padding:11px 18px 11px 14px;border:1px solid #b08a4a;border-radius:99px;background:linear-gradient(180deg,#5a3a2c,#3d241b);color:#f6ecd8;font:600 15px/1 'IBM Plex Sans Arabic',system-ui,sans-serif;box-shadow:0 8px 24px #0005;cursor:pointer}
.shp-fab svg,.shp-b svg{width:20px;height:20px}.shp-fab .av{width:26px;height:26px;border-radius:50%;background:#d9b877;color:#3d241b;display:grid;place-items:center;font-weight:700}
.shp-fab:hover{filter:brightness(1.1)}.shp-fab:focus-visible,.shp-b:focus-visible,.shp-in:focus-visible{outline:2px solid #d9b877;outline-offset:2px}
.shp{position:fixed;inset-block-end:18px;inset-inline-end:18px;z-index:95;width:min(390px,calc(100vw - 24px));height:min(600px,calc(100dvh - 90px));display:flex;flex-direction:column;background:#fbf7ee;color:#2c2018;border:1px solid #c9ae7a;border-radius:16px;box-shadow:0 18px 50px #0006;overflow:hidden;font:400 15px/1.7 'IBM Plex Sans Arabic',system-ui,sans-serif}
.shp[hidden],.shp-fab[hidden]{display:none}
.shp-h{display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(180deg,#5a3a2c,#3d241b);color:#f6ecd8}
.shp-h .av{width:34px;height:34px;border-radius:50%;background:#d9b877;color:#3d241b;display:grid;place-items:center;font-weight:700;font-size:17px}
.shp-h b{font-size:16px}.shp-h small{display:block;font-size:12px;opacity:.8;line-height:1.3}.shp-h .sp{margin-inline-start:auto;display:flex;gap:4px}
.shp-b{width:36px;height:36px;border-radius:10px;border:1px solid transparent;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}
.shp-b:hover{background:#ffffff22}.shp-b[aria-pressed=true]{background:#d9b877;color:#3d241b}.shp-b.rec{background:#b3402e;color:#fff}
.shp-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
.shp-m{max-width:88%;padding:9px 13px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere}
.shp-m.me{align-self:flex-start;background:#3d241b;color:#f6ecd8;border-end-start-radius:4px}
.shp-m.she{align-self:flex-end;background:#fff;border:1px solid #e3d5b8;border-end-end-radius:4px}
.shp-m.wait{opacity:.7;font-style:italic}
.shp-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.shp-acts a,.shp-acts button,.shp-sug button{font:500 13.5px/1 inherit;padding:8px 12px;border-radius:99px;border:1px solid #b08a4a;background:#f3e6c9;color:#3d241b;text-decoration:none;cursor:pointer}
.shp-seg{margin:0 0 6px}.shp-seg:last-of-type{margin-bottom:0}
.shp-tag{display:inline-block;margin-inline-end:6px;padding:1px 8px;border-radius:99px;border:1px solid currentColor;font:600 11.5px/1.5 inherit;vertical-align:1px;white-space:nowrap}
.shp-tag.design{color:#1f5b3a;background:#e4f1e8}.shp-tag.rules{color:#6b3b00;background:#f8ecd3}.shp-tag.web{color:#1b4b7a;background:#e3eefa}.shp-tag.general{color:#5a4a3a;background:#efe8da}
.shp-src{margin-top:8px;padding-top:6px;border-top:1px dashed #d9c9a6;font-size:13px}.shp-src b{display:block;font-size:12.5px;color:#6a5638}.shp-src ol{margin:2px 0 0;padding-inline-start:20px}.shp-src a{color:#1b4b7a;overflow-wrap:anywhere}
.shp-confirm{margin-top:8px;padding:8px 10px;border:1px solid #b08a4a;border-radius:10px;background:#fff7e3;font-size:13.5px}.shp-confirm p{margin:0 0 6px}
.shp-stop{margin-inline-start:8px;font:500 12.5px/1 inherit;padding:5px 10px;border-radius:99px;border:1px solid #b3402e;background:#fff;color:#b3402e;cursor:pointer}
.shp-sug{display:flex;gap:6px;padding:0 12px 8px;overflow-x:auto}.shp-sug button{white-space:nowrap;background:#fff}
.shp-f{display:flex;gap:6px;align-items:flex-end;padding:10px 12px;border-top:1px solid #e3d5b8;background:#f6efe0}
.shp-in{flex:1;resize:none;min-height:42px;max-height:120px;padding:9px 12px;border:1px solid #c9ae7a;border-radius:12px;background:#fff;color:inherit;font:inherit}
.shp-f .shp-b{color:#3d241b;border-color:#c9ae7a;background:#fff}.shp-f .shp-b.go{background:#3d241b;color:#f6ecd8}.shp-f .shp-b.rec{background:#b3402e;color:#fff}
.shp-note{font-size:12px;color:#7a6652;padding:0 12px 8px}
@media (max-width:560px){.shp{inset-inline:8px;inset-block-end:8px;width:auto;height:min(72dvh,560px)}.shp-fab span.t{display:none}.shp-fab{padding:11px}}
@media print{.shp,.shp-fab{display:none!important}}
`;

// ------------------------------------------------------------------------------------------ الصوت
const synth = globalThis.speechSynthesis || null;
const Recog = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
let voiceOn = get(VOICE_KEY) === '1';
function arVoice() { const vs = synth?.getVoices?.() || []; return vs.find(v => /^ar[-_]SA/i.test(v.lang)) || vs.find(v => /^ar/i.test(v.lang)) || null; }
/** تنطق الرد بالعربية إن كان الصوت مفعّلًا والمتصفح يدعمه. تعيد false إن لم يتوفر صوت عربي. */
function speak(text) {
  if (!voiceOn || !synth) return false;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/[«»]/g, '').replace(/×/g, ' في ').replace(/م²/g, ' متر مربع').replace(/←/g, ' ثم '));
    const v = arVoice(); if (v) u.voice = v; u.lang = v?.lang || 'ar-SA'; u.rate = 1; u.pitch = 1.05;
    synth.speak(u); return true;
  } catch { return false; }
}

// ------------------------------------------------------------------------------------------ النافذة
const style = el('style', {}, CSS); document.head.append(style);
const log = el('div', { class: 'shp-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'المحادثة مع شرعاء' });
const input = el('textarea', { class: 'shp-in', rows: '1', placeholder: 'اسأل عن تصميمك أو اطلب تعديلًا…', 'aria-label': 'رسالتك إلى شرعاء' });
const btnVoice = el('button', { class: 'shp-b', type: 'button', title: 'رد شرعاء بالصوت', 'aria-label': 'رد شرعاء بالصوت', 'aria-pressed': String(voiceOn), onclick: toggleVoice });
const btnMic = Recog ? el('button', { class: 'shp-b', type: 'button', title: 'تحدّث بدل الكتابة', 'aria-label': 'تحدّث بدل الكتابة', onclick: listen }, icon(IC.mic)) : null;
const btnSend = el('button', { class: 'shp-b go', type: 'button', title: 'إرسال', 'aria-label': 'إرسال', onclick: () => send() }, icon(IC.send));
const note = el('p', { class: 'shp-note', hidden: true });
const SUGGEST = { design: ['هل نفّذتِ طلبي؟', 'كم مساحة المجلس؟', 'ابي تصميم مختلف', 'وش الخطوة الجاية؟'], view3d: ['وين المطبخ؟', 'كم مساحة البيت؟', 'الواجهة نجدية', 'افتحي المخططات'], final: ['كم مساحة البيت؟', 'وش الغرف اللي فيه؟', 'بكم يكلف؟', 'ارجعي للتصميم'] };
const sug = el('div', { class: 'shp-sug', 'aria-label': 'اقتراحات' }, (SUGGEST[page] || SUGGEST.design).map(t => el('button', { type: 'button', onclick: () => send(t) }, t)));
const panel = el('section', { class: 'shp', id: 'sharaPanel', hidden: true, role: 'dialog', 'aria-label': 'شرعاء' },
  el('header', { class: 'shp-h' }, el('div', { class: 'av' }, 'ش'), el('div', {}, el('b', {}, 'شرعاء'), el('small', {}, 'تجيب من تصميمك والاشتراطات والويب، وتنفّذ طلبك بعد تأكيدك')),
    el('div', { class: 'sp' }, btnVoice, el('button', { class: 'shp-b', type: 'button', title: 'إخفاء في الأسفل', 'aria-label': 'إخفاء نافذة شرعاء في الأسفل', onclick: () => open(false) }, icon(IC.down)))),
  log, sug, note,
  el('div', { class: 'shp-f' }, input, btnMic, btnSend));
const fab = el('button', { class: 'shp-fab', id: 'sharaFab', type: 'button', 'aria-controls': 'sharaPanel', 'aria-expanded': 'false', onclick: () => open(true) }, el('span', { class: 'av' }, 'ش'), el('span', { class: 't' }, 'اسأل شرعاء'));
document.body.append(fab, panel);
paintVoice();

let chat = []; try { chat = JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]'); } catch { chat = []; }
const keep = () => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-40))); } catch { /* بلا حفظ */ } };
function bubble(m) {
  const b = el('div', { class: 'shp-m ' + (m.who === 'me' ? 'me' : 'she') });
  if (m.segments?.length) for (const g of m.segments) b.append(el('p', { class: 'shp-seg' }, el('span', { class: 'shp-tag ' + g.tag }, TAG_LABEL[g.tag] || 'عام'), g.text));
  else b.append(m.text);
  if (m.sources?.length) b.append(el('div', { class: 'shp-src' }, el('b', {}, m.sources.every(x => x.cited) ? 'المصادر' : 'نتائج البحث (لم يُستشهد بها صراحة)'), el('ol', {}, m.sources.map(x => el('li', {}, el('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title))))));
  if (m.actions?.length) { const row = el('div', { class: 'shp-acts' }); b.append(row); m.actions.forEach(a => row.append(actionNode(a, b))); }
  log.append(b); log.scrollTop = log.scrollHeight; return b;
}
/** أمر مقترح من الذكاء يحتاج تأكيدًا صريحًا قبل أن تنفّذه شيفرة الموقع المحلية (لا شيء يُنفَّذ من الخادم). */
function actionNode(a, bubbleNode) {
  if (a.href) return el('a', { href: a.href }, a.label + ' ←');
  if (!a.confirm) return el('button', { type: 'button', onclick: () => send(a.say || a.label) }, a.label);
  const btn = el('button', { type: 'button', 'aria-haspopup': 'true', onclick: () => {
    btn.hidden = true;
    const box = el('div', { class: 'shp-confirm', role: 'group', 'aria-label': 'تأكيد التنفيذ' }, el('p', {}, 'هل تريد أن أنفّذ على تصميمك: «' + a.say + '»؟ سأقيس النتيجة وأخبرك بما تحقق.'),
      el('div', { class: 'shp-acts' }, el('button', { type: 'button', onclick: () => { box.remove(); send(a.say, { forceLocal: true }); } }, 'نعم، نفّذ'), el('button', { type: 'button', onclick: () => { box.remove(); btn.hidden = false; btn.focus(); } }, 'لا')));
    bubbleNode.append(box); box.querySelector('button')?.focus();
  } }, 'نفّذ: ' + a.label);
  return btn;
}
function say(text, actions = [], extra = {}) { const m = { who: 'she', text, actions, ...extra }; chat.push(m); keep(); bubble(m); speak(text); }
function open(on) {
  panel.hidden = !on; fab.hidden = on; if (!on && chat.length > 1) fab.querySelector('.t').textContent = 'شرعاء — أكمل المحادثة'; fab.setAttribute('aria-expanded', String(on)); put(OPEN_KEY, on ? '1' : '');
  if (on) {
    if (!log.childElementCount) { if (!chat.length) chat.push({ who: 'she', text: 'أهلًا، أنا شرعاء. اسألني عن تصميمك أو اطلب أي تعديل بكلامك، وأنا معك في كل صفحة.' }); chat.forEach(bubble); }
    setTimeout(() => input.focus(), 50);
  } else synth?.cancel?.();
}
function paintVoice() { btnVoice.replaceChildren(icon(voiceOn ? IC.sound : IC.mute)); btnVoice.setAttribute('aria-pressed', String(voiceOn)); }
function toggleVoice() {
  voiceOn = !voiceOn; put(VOICE_KEY, voiceOn ? '1' : ''); paintVoice(); note.hidden = true;
  if (!voiceOn) { synth?.cancel?.(); return; }
  if (!synth) { voiceOn = false; put(VOICE_KEY, ''); paintVoice(); note.textContent = 'متصفحك لا يدعم النطق؛ أبقى معك بالكتابة.'; note.hidden = false; return; }
  const ok = speak('تم تفعيل صوتي. سأقرأ عليك ردودي.');
  if (ok && !arVoice()) { note.textContent = 'لم أجد صوتًا عربيًا في جهازك؛ قد يُقرأ الرد بصوت غير عربي. أضف صوتًا عربيًا من إعدادات الجهاز.'; note.hidden = false; }
}
let rec = null;
function listen() {
  if (!Recog) return;
  if (rec) { rec.stop(); return; }
  try {
    rec = new Recog(); rec.lang = 'ar-SA'; rec.interimResults = true; rec.maxAlternatives = 1; synth?.cancel?.();
    btnMic.classList.add('rec'); btnMic.setAttribute('aria-label', 'إيقاف الاستماع');
    let final = '';
    rec.onresult = e => { let t = ''; for (const r of e.results) t += r[0].transcript; input.value = t; if (e.results[e.results.length - 1].isFinal) final = t; };
    rec.onerror = e => { note.textContent = e.error === 'not-allowed' ? 'لم يُسمح باستخدام الميكروفون؛ اسمح به من إعدادات المتصفح أو اكتب رسالتك.' : 'تعذّر الاستماع؛ اكتب رسالتك.'; note.hidden = false; };
    rec.onend = () => { btnMic.classList.remove('rec'); btnMic.setAttribute('aria-label', 'تحدّث بدل الكتابة'); rec = null; if (final.trim()) send(final.trim()); };
    rec.start();
  } catch { rec = null; btnMic.classList.remove('rec'); note.textContent = 'تعذّر تشغيل الميكروفون؛ اكتب رسالتك.'; note.hidden = false; }
}

let busy = false;
async function send(preset, { forceLocal = false } = {}) {
  const text = (preset ?? input.value).trim(); if (!text || busy) return;
  if (pending()) { note.textContent = 'ما زلت أنفّذ طلبك السابق في الصفحة؛ انتظر حتى ينتهي ثم أرسل.'; note.hidden = false; return; }
  busy = true; input.value = ''; note.hidden = true; btnSend.disabled = true; btnSend.setAttribute('aria-busy', 'true');
  const priorChat = chat.slice(); // التاريخ قبل هذه الرسالة
  const me = { who: 'me', text }; chat.push(me); keep(); bubble(me);
  // «شرعاء تكتب…» يظهر فورًا؛ التعديلات تُنفَّذ في عامل خارج الخيط الرئيسي فتبقى الصفحة والنافذة حيّتين، والمؤشر يعدّ الثواني الفعلية
  const wait = el('div', { class: 'shp-m she wait', role: 'status' }, 'شرعاء تكتب…'); log.append(wait); log.scrollTop = log.scrollHeight;
  let stopTick = ticking(wait, 'شرعاء تكتب…');
  const abort = new AbortController();
  const think = () => { stopTick(); const sp = el('span'); wait.replaceChildren(sp, el('button', { class: 'shp-stop', type: 'button', onclick: () => abort.abort() }, 'أوقف')); stopTick = ticking(sp, 'شرعاء تفكّر…'); };
  await new Promise(r => setTimeout(r, 30));
  let out, remoteMsg = null;
  try {
    const session = loadSession(localStorage);
    // ترتيب القرار: أمر/سؤال محدد يفهمه المحرك المحلي ← وإلا (سؤال مفتوح، أو لم يُفهم محليًا) ← عقل شرعاء الذكي ← وعند الفشل رسالة صادقة ثم المحرك المحلي
    const route = forceLocal ? 'local' : routeOf(session, text, { page });
    const remote = async () => { think(); const r = await askShara({ text, chat: priorChat, session, page, signal: abort.signal }); if (r.ok) remoteMsg = toMessage(r.data); return r; };
    let r = null, localOut = null;
    if (route === 'remote' && !aiOff()) { r = await remote(); if (r.aborted) { out = { text: r.note }; } }
    if (!out && !remoteMsg) {
      let exterior = null; try { exterior = (await import('./exterior-brief.mjs')).applyExteriorText || null; } catch { exterior = null; }
      localOut = await sharaTurn(session, text, { page, exterior, redesign: redesignInWorker, fix: fixInWorker });
      if (route === 'local' && !forceLocal && localOut.kind === 'unclear' && session && !aiOff()) { r = await remote(); if (r.aborted) { out = { text: r.note }; localOut = null; } }
      if (localOut && !remoteMsg) {
        out = localOut;
        if (r && !r.ok) out = { ...localOut, text: r.note + ' ' + localOut.text };
        else if (route === 'remote' && aiOff() && !forceLocal) out = { ...localOut, text: fallbackNote('no_key') + ' ' + localOut.text };
      }
    }
    if (out?.session && out.exteriorOnly) { try { const x = await import('./exterior-brief.mjs'); saveSession(localStorage, out.session); x.storeExterior(localStorage, x.readExterior(out.session)); globalThis.dispatchEvent(new CustomEvent(x.EXTERIOR_EVENT || 'mizan:exterior')); } catch { /* يُلتقط من التخزين عند فتح العرض */ } }
    if (out?.session) { saveSession(localStorage, out.session); globalThis.dispatchEvent(new CustomEvent('mizan:session', { detail: { session: out.session, changed: !!out.changed, exteriorOnly: !!out.exteriorOnly } })); }
  } catch (e) { out = { text: 'تعذّر الرد: ' + (e.message || 'خطأ غير معروف') + ' لم أغيّر شيئًا.' }; }
  stopTick(); wait.remove(); busy = false; btnSend.disabled = false; btnSend.removeAttribute('aria-busy');
  if (remoteMsg) { chat.push(remoteMsg); keep(); bubble(remoteMsg); speak(remoteMsg.text); } else say(out.text, out.actions || []);
}
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) open(false); });
if (get(OPEN_KEY) === '1' && page !== 'design') open(true);

// شريط المراحل الموحّد (journey-steps.mjs): يعلّم موضع الصفحة، وكل مرحلة بُلغت رابط رجوع أو تقدم، وما لم يُبلغ معطّل بسببه.
// حوار الشكل الخارجي (داخل صفحة التصميم) مرحلة قائمة بذاتها، وجدول الكميات قسم من صفحة المخططات.
const ORDER = { design: 'design', view3d: 'view3d', final: 'sheets' };
const currentStage = () => {
  if (page === 'design') { const ext = document.getElementById('extShara'); return ext && !ext.hidden ? 'exterior' : 'design'; }
  if (page === 'final') { const q = document.getElementById('qty'); return q && q.getBoundingClientRect().top < innerHeight * .5 ? 'boq' : 'sheets'; }
  return ORDER[page] || 'design';
};
if (ORDER[page]) {
  markReached(localStorage, page === 'final' ? 'boq' : ORDER[page]);
  // روابط الصفحة نفسها بلا إعادة تحميل: الصفحة تسمع hashchange/popstate وتفتح أو تغلق ما يلزم
  const onLocal = (s, url) => { if (url.hash === location.hash) return true; if (url.hash) return false; history.pushState(null, '', location.pathname + url.search); dispatchEvent(new PopStateEvent('popstate')); return true; }; // المسار الحالي كما هو (في الإنتاج بلا ‎.html‎)
  const paintSteps = mountSteps(document.querySelector('ol.steps'), { current: currentStage, onLocal });
  const ext = document.getElementById('extShara');
  if (ext && globalThis.MutationObserver) new MutationObserver(() => { if (!ext.hidden) markReached(localStorage, 'exterior'); paintSteps(); }).observe(ext, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('mizan:session', paintSteps);
  if (page === 'final') { let last = '', t = 0; const check = () => { t = 0; const c = currentStage(); if (c !== last) { last = c; paintSteps(); } }; addEventListener('scroll', () => { if (!t) t = setTimeout(check, 160); }, { passive: true }); addEventListener('hashchange', () => setTimeout(check, 60)); new MutationObserver(check).observe(document.getElementById('fmain') || document.body, { childList: true }); }
}
globalThis.__sharaPanel = { open, send, get chat() { return chat; } }; // للاختبارات الحية
