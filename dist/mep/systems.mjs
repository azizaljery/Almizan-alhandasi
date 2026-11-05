// صفحة الأنظمة الهندسية: تربط البديل المعماري المختار (مستند المرسم) بحزمة الأنظمة عبر mep-binding.mjs،
// وتعرض لكل تخصص ودور: الطبقات ومفتاح الرموز، محرر المدخلات والأجهزة، الجداول والكميات، الرسائل، والتصدير.
// كل تعديل (مخطط أو جهاز أو مدخل) يجعل النتيجة قديمة فورًا ويمنع تصديرها حتى يُعاد الحساب.
import { parseDoc } from './draw/doc.mjs';
import { STUDIO_KEY } from './draw/handoff.mjs';
import * as B from './mep-binding.mjs';
import { DISCIPLINE_INFO, COORDINATION_INFO, DEVICE_GROUPS, NO_CLASH_AR, PRELIMINARY_AR } from './mep-binding.mjs';

// مفتاح جلسة التصميم كما في design-session.mjs (SESSION_KEY)؛ يُقرأ مباشرة لتجنّب تحميل المولّد في هذه الصفحة
const SESSION_KEY = 'mizan.design.session.v1';
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
const get = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const toast = (t, err = false) => { const n = el('div', { class: 'toast' + (err ? ' err' : ''), role: 'status' }, t); $('toasts').append(n); setTimeout(() => n.remove(), err ? 6500 : 3500); };
const fmtN = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) < 0.01 && v !== 0 ? 6 : 3 });
const NA = (why = 'غير محسوب') => el('span', { class: 'na', title: why }, why);
const short = h => h ? h.slice(0, 12) : '—';
const TABS = [...Object.entries(DISCIPLINE_INFO).map(([id, d]) => [id, d.ar]), ['coordination', 'التنسيق والتعارضات']];
const COL_AR = { id: 'المعرف', panelId: 'اللوحة', loadCount: 'عدد الأحمال', connectedW: 'الموصول W', demandW: 'الطلب W', currentA: 'التيار A', oneWayLengthM: 'الطول م', voltageDropPercent: 'هبوط الجهد %', cableSizeMm2: 'المقطع مم²', breakerA: 'القاطع A', protectionCheck: 'فحص الحماية', demandVar: 'الطلب var', vectorApparentVA: 'الظاهرية VA', phaseL1VA: 'L1 VA', phaseL2VA: 'L2 VA', phaseL3VA: 'L3 VA', roomId: 'الغرفة', sensibleGainW: 'حسي W', latentGainW: 'كامن W', totalGainW: 'الإجمالي W', supplyM3S: 'التغذية م³/ث', outdoorAirM3S: 'هواء خارجي م³/ث', areaEquivalentDuctM: 'قطر مكافئ م', equipmentId: 'الجهاز', selectedCapacityW: 'السعة المختارة', system: 'النظام', fromId: 'من', toId: 'إلى', flowM3S: 'التدفق م³/ث', equivalentDiameterM: 'قطر مكافئ م', selectedDiameterMm: 'القطر المختار مم', lengthM: 'الطول م', horizontalLengthM: 'الأفقي م', slope: 'الميل', fallM: 'الهبوط م', endInvertM: 'قاع النهاية م', routeStatus: 'حالة المسار', kind: 'النوع', levelId: 'الدور', key: 'البند', discipline: 'التخصص', layer: 'الطبقة', unit: 'الوحدة', quantity: 'الكمية', rate: 'السعر', amount: 'المبلغ' };
const NULL_WHY = { selectedCapacityW: 'لم تُختر — خارج نطاق الحزمة', protectionCheck: 'لم تُدخل بيانات الحماية', rate: 'غير مسعّر', amount: 'غير مسعّر' };
const routing = p => [[p + 'routeHeightM', 'ارتفاع المسار عن الأرضية م', 'num'], [p + 'widthM', 'عرض الغلاف م', 'num'], [p + 'heightM', 'ارتفاع الغلاف م', 'num'], [p + 'clearanceM', 'الخلوص م', 'num']];
const SEV_AR = { error: 'خطأ/متعذر', warning: 'تحذير', pending: 'يحتاج مدخلات أو مراجعة' };

let S = {
  sources: [], source: null, doc: null, sourceHash: null, bind: null, store: null, entity: null, inputs: B.emptyInputs(), result: null, resultProject: null,
  fresh: { fresh: false, reason: 'NO_RESULT', messageAr: 'لم تُحسب الأنظمة بعد.' }, busy: false, auto: true,
  archNotice: null, withheld: null, tab: 'electrical', levelId: null, mode: 'view', group: 0, kind: null, zRel: 1.2, outside: false, selected: null, layer: '', timer: null, docText: null,
};

// ——— قراءة المصادر وربطها ———
function readSession() { try { const s = JSON.parse(get(localStorage, SESSION_KEY) || 'null'); return s && Array.isArray(s.designs) ? s : null; } catch { return null; } }
function loadSources() { S.sources = B.listSources({ session: readSession(), studioRaw: get(localStorage, STUDIO_KEY) }); }
function pickDefault() {
  const want = new URLSearchParams(location.search).get('source');
  if (want && S.sources.some(s => s.id === want)) return want;
  const sess = readSession(), studio = S.sources.find(s => s.kind === 'studio');
  if (studio && sess && Number.isInteger(sess.approved)) return studio.id;
  const cur = sess ? S.sources.find(s => s.kind === 'design' && s.label.includes('(المعروض)')) : null;
  return (cur || S.sources[0])?.id || null;
}
const ctxOf = src => ({ sessionKey: src.sessionKey, kind: src.kind });
async function selectSource(id) {
  S.source = S.sources.find(s => s.id === id) || null; S.result = null; S.resultProject = null; S.selected = null; S.archNotice = null; S.withheld = null;
  S.fresh = { fresh: false, reason: 'NO_RESULT', messageAr: 'لم تُحسب الأنظمة بعد.' };
  if (!S.source) return render();
  try { S.doc = parseDoc(S.source.docText); } catch (e) { S.doc = null; S.bind = { ok: false, error: { code: e.code || 'PARSE', messageAr: 'تعذرت قراءة مستند البديل: ' + String(e.message).slice(0, 120) } }; return render(); }
  S.docText = S.source.docText;
  // المفتاح: الجلسة + معرّف البديل (داخل المعرّف) ثم بصمة المستند عند التقييم؛ كيان من جلسة أخرى أو ببديل آخر يُرفض فلا تختلط الأنظمة
  S.store = B.loadStore(localStorage); S.entity = B.entityFor(S.store, id, ctxOf(S.source)); S.inputs = S.entity.inputs || B.emptyInputs();
  if (S.entity.restore?.rejected) S.archNotice = { kind: 'REJECTED', messageAr: 'وُجد كيان محفوظ لا يخص هذا البديل أو هذه الجلسة (' + S.entity.restore.rejected + ')؛ لم يُحمَّل.' };
  await rebind();
  const kept = B.deviceRefs(S.inputs);
  if (!S.bind?.ok) { // العمارة الحالية لا تُربط (مثلًا جدار حُرّك فانفتح فراغ): تبقى المدخلات محفوظة والنتيجة القديمة لا تُعرض
    if (S.entity.result) { S.fresh = { fresh: false, reason: 'ARCHITECTURE_CHANGED', messageAr: 'تغيّر المخطط المعماري بعد آخر حساب وتعذر ربطه؛ النتيجة السابقة لا تُستخدم.' }; S.result = null; }
    if (S.entity.result && kept.length) S.archNotice = { kind: 'UNBOUND', devices: kept.length, orphans: [], messageAr: `تغيّر المخطط المعماري وتعذر ربطه بالأنظمة. حُفظت مدخلاتك (${kept.length} جهازًا/عنصرًا) ولم تُحذف؛ صحّح المخطط في المرسم ثم أعد الحساب.` };
    return render();
  }
  if (S.entity.result) {
    const a = await B.assessEntity(S.entity, { project: S.bind.project, sourceHash: S.sourceHash });
    if (a.foreign) { // مدخلات محفوظة لا يوافقها أي دور أو غرفة في هذا المخطط: لا تُحمَّل (تبقى في الكيان تحت withheld) لئلا تُخلَط مع مخطط آخر
      S.withheld = { inputs: S.entity.inputs, sourceHash: S.entity.sourceHash, devices: a.deviceCount };
      S.entity = { ...S.entity, withheld: S.withheld }; S.inputs = B.emptyInputs(); S.result = null; await rebind();
      S.archNotice = { kind: 'FOREIGN', devices: a.deviceCount, orphans: [], messageAr: `المدخلات المحفوظة (${a.deviceCount} جهازًا/عنصرًا) لا يوافقها أي دور أو غرفة في هذا المخطط؛ يبدو أنها لمخطط آخر فلم تُحمَّل ولم تُحذف.` };
      if (S.bind?.ok && S.auto) await recompute(); else render(); return;
    }
    S.result = S.entity.result; S.fresh = { fresh: a.fresh, reason: a.reason, messageAr: a.messageAr };
    if (a.fresh) S.resultProject = S.bind.project;
    else if (a.archChanged && a.deviceCount) S.archNotice = { kind: 'ARCH_CHANGED', devices: a.deviceCount, orphans: a.orphans, messageAr: `تغيّر المخطط المعماري بعد آخر حساب. حُفظت مدخلاتك (${a.deviceCount} جهازًا/عنصرًا)؛ راجع مواقعها في المخطط الجديد` + (a.orphans.length ? ` — ${a.orphans.length} منها فقد غرفته أو دوره: ${a.orphans.map(o => o.id).join('، ')}` : '') + '.' };
    render(); if (!a.fresh && S.auto) await recompute(); return;
  }
  if (S.bind?.ok && S.auto) await recompute(); else render();
}
async function rebind() {
  S.bind = await B.bindArchitecture(S.doc, { alternativeId: S.source.id, revision: S.source.revision, inputs: S.inputs });
  S.sourceHash = S.bind.sourceHash;
  if (S.bind.ok) { const lv = S.bind.levels.filter(l => l.rooms > 0); if (!lv.some(l => l.id === S.levelId)) S.levelId = (lv[0] || S.bind.levels[0]).id; }
}
async function recompute() {
  if (!S.bind?.ok) return render();
  S.busy = true; renderStatus();
  try {
    await rebind(); if (!S.bind.ok) { S.result = null; return; }
    S.result = await B.computeSystems(S.bind.project); S.resultProject = S.bind.project;
    S.fresh = await B.freshness(S.result, S.bind.project, S.sourceHash);
    const saved = B.saveEntity(localStorage, S.store, { ...S.entity, sessionKey: S.source.sessionKey, kind: S.source.kind, revision: S.source.revision, sourceHash: S.sourceHash, inputs: S.inputs, result: S.result });
    S.store = saved.data; S.entity = B.entityFor(S.store, S.source.id, ctxOf(S.source));
    if (!saved.ok) toast('تعذر حفظ مدخلات الأنظمة في المتصفح؛ ستبقى في هذه الصفحة فقط.', true);
  } catch (e) { S.result = null; S.fresh = { fresh: false, reason: 'COMPUTE_FAILED', messageAr: 'تعذر الحساب: ' + String(e.message || e).slice(0, 160) }; }
  finally { S.busy = false; render(); }
}
/** كل تعديل: النتيجة قديمة فورًا (يُمنع التصدير)، ثم إعادة حساب مؤجلة إن كانت تلقائية. */
function changed(inputs) {
  S.inputs = inputs; S.fresh = { fresh: false, reason: 'INPUTS_CHANGED', messageAr: 'تغيّرت المدخلات بعد الحساب؛ النتيجة المعروضة قديمة ولا تُصدَّر.' };
  try { B.saveEntity(localStorage, S.store, { ...S.entity, sessionKey: S.source.sessionKey, kind: S.source.kind, inputs: S.inputs }); S.store = B.loadStore(localStorage); } catch { /* التخزين غير متاح */ }
  renderStatus(); renderPlanVeil(); renderExports(); renderTablesStale();
  clearTimeout(S.timer); if (S.auto) S.timer = setTimeout(recompute, 450);
}
/** المخطط تغيّر في المرسم أو جلسة التصميم (نافذة أخرى): يُقرأ المصدر من جديد وتُعلَّم النتيجة قديمة. */
async function checkSourceChanged() {
  if (!S.source) return false;
  loadSources(); const now = S.sources.find(s => s.id === S.source.id);
  if (!now || now.docText === S.docText) return false;
  S.source = now; try { S.doc = parseDoc(now.docText); } catch { return false; }
  S.docText = now.docText; S.fresh = { fresh: false, reason: 'ARCHITECTURE_CHANGED', messageAr: 'تغيّر المخطط المعماري؛ النتيجة السابقة لا تُستخدم مع المخطط الجديد.' };
  const kept = B.deviceRefs(S.inputs);
  if (kept.length) S.archNotice = { kind: 'ARCH_CHANGED', devices: kept.length, orphans: [], messageAr: `تغيّر المخطط المعماري بعد آخر حساب. حُفظت مدخلاتك (${kept.length} جهازًا/عنصرًا)؛ راجع مواقعها في المخطط الجديد.` };
  toast('تغيّر المخطط المعماري — النتيجة قديمة ولا تُصدَّر حتى يُعاد الحساب.'); renderStatus(); renderPlanVeil(); renderExports(); renderTablesStale();
  if (S.auto) await recompute(); else { await rebind(); if (S.bind?.ok && kept.length) { const o = B.orphanDevices(S.inputs, S.bind.project.architecture); if (o.length && S.archNotice) S.archNotice.orphans = o; } render(); }
  return true;
}
addEventListener('storage', e => { if (e.key === STUDIO_KEY || e.key === SESSION_KEY) checkSourceChanged(); });
addEventListener('focus', () => checkSourceChanged());

// ——— العرض ———
// إعادة البناء تُؤجَّل إلى ما بعد حدث التغيير: إزالة الحقل المركّز داخل حدثه تطلق blur/change متداخلًا
let renderQueued = false;
function render() { if (renderQueued) return; renderQueued = true; setTimeout(() => { renderQueued = false; renderNow(); }, 0); }
function renderNow() {
  const main = $('main');
  if (!S.sources.length) { main.replaceChildren(el('div', { class: 'card' }, el('h2', {}, 'لا يوجد تصميم معماري لربط الأنظمة به'), el('p', {}, 'ابدأ من الأرض ثم شرعاء، واختر تصميمًا، ثم افتح الأنظمة من صفحة التصميم.'), el('a', { class: 'btn primary', href: './home.html' }, 'ابدأ رحلة التصميم'))); return; }
  main.replaceChildren(sourceCard(), el('div', { id: 'statusBox' }), body());
  renderStatus(); renderExports(); renderPlan();
}
function sourceCard() {
  const sel = el('select', { id: 'sourceSel', 'aria-label': 'البديل المعماري', onchange: e => selectSource(e.target.value) }, S.sources.map(s => el('option', { value: s.id, selected: s.id === S.source?.id }, s.label)));
  const p = S.bind?.project;
  return el('div', { class: 'card src' },
    el('div', {}, el('h2', {}, 'البديل المعماري المربوط'), el('label', {}, sel),
      el('div', { class: 'meta' }, el('span', {}, 'هوية البديل: ', el('code', { 'data-alt-id': '' }, S.source?.id || '—')), el('span', {}, 'بصمة المصدر: ', el('code', { 'data-source-hash': S.sourceHash || '' }, short(S.sourceHash))),
        p ? el('span', {}, `الأدوار: ${p.architecture.levels.length} · الغرف: ${p.architecture.rooms.length} · العوائق الإنشائية المبدئية: ${p.architecture.obstacles.length}`) : null,
        S.result ? el('span', {}, 'بصمة المدخل: ', el('code', {}, short(S.result.inputHash))) : null),
      el('p', { class: 'sub' }, 'الأنظمة تقرأ المخطط ولا تعدّله. تعديل المعماري يتم في المرسم؛ بعده تُعدّ النتيجة قديمة (لا تصدير ولا كميات) حتى يُعاد الحساب، وتبقى مدخلاتك محفوظة.')),
    el('div', {}, el('label', { class: 'sub' }, el('input', { type: 'checkbox', id: 'autoCalc', checked: S.auto, onchange: e => { S.auto = e.target.checked; if (S.auto && !S.fresh.fresh) recompute(); } }), ' إعادة الحساب تلقائيًا'), ' ',
      el('button', { class: 'btn primary', id: 'btnRecalc', onclick: () => recompute() }, 'أعد الحساب الآن')));
}
function renderStatus() {
  const box = $('statusBox'); if (!box) return;
  const parts = [];
  if (S.bind && !S.bind.ok) parts.push(el('div', { class: 'bad', 'data-binding-error': S.bind.error?.code || '' }, el('b', {}, 'تعذر ربط المخطط: '), S.bind.error?.messageAr || '', el('code', { dir: 'ltr' }, ' ' + (S.bind.error?.code || ''))));
  const pill = S.busy ? el('span', { class: 'pill busy', 'data-state': 'busy' }, 'يُعاد الحساب…') : S.bind && !S.bind.ok ? el('span', { class: 'pill fail', 'data-state': 'unbound' }, 'غير مربوط') : S.fresh.fresh ? el('span', { class: 'pill fresh', 'data-state': 'fresh' }, 'النتيجة محدّثة') : el('span', { class: 'pill stale', 'data-state': 'stale' }, 'النتيجة قديمة — لا تُصدَّر');
  parts.unshift(el('div', { class: 'card', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, pill, el('span', { class: 'sub', id: 'freshMsg' }, S.busy ? 'نعيد ربط المخطط وحساب كل التخصصات والتنسيق.' : S.fresh.messageAr),
    S.result ? el('span', { class: 'sub' }, `الحالة: ${S.result.status === 'BLOCKED_PRELIMINARY' ? 'أولي فيه بنود متعذرة' : 'أولي يحتاج مراجعة'} · اعتماد التنفيذ: لا · مطابقة الكود: غير مقيّمة`) : null));
  if (S.archNotice) parts.push(el('div', { class: 'note warn', role: 'alert', 'data-arch-notice': S.archNotice.kind }, el('b', {}, 'تنبيه: '), S.archNotice.messageAr, ' ', el('button', { class: 'btn small', type: 'button', onclick: () => { S.archNotice = null; renderStatus(); } }, 'إخفاء')));
  for (const n of S.bind?.notes || []) parts.push(el('div', { class: 'note' }, n.messageAr));
  box.replaceChildren(...parts);
}
function body() {
  if (!S.bind?.ok) return el('div');
  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'التخصص' }, TABS.map(([id, ar]) => el('button', { role: 'tab', 'data-tab': id, 'aria-selected': String(S.tab === id), onclick: () => { S.tab = id; S.mode = 'view'; S.group = 0; S.kind = null; S.selected = null; S.layer = ''; render(); } }, ar)));
  const lvls = S.bind.levels;
  const levels = el('div', { class: 'seg', 'aria-label': 'الدور' }, el('span', { class: 'sub' }, 'الدور:'), lvls.map(l => el('button', { 'data-level': l.id, 'aria-pressed': String(l.id === S.levelId), disabled: l.rooms ? null : true, title: l.rooms ? `منسوب ${l.elevationM} م · ارتفاع ${l.heightM} م` : 'لا توجد غرف موثقة في هذا الدور', onclick: () => { S.levelId = l.id; S.selected = null; render(); } }, `${l.id} (${l.rooms} غرفة، منسوب ${fmtN(l.elevationM)} م)`)));
  return el('div', { style: 'display:grid;gap:14px' }, el('div', { class: 'card', style: 'display:grid;gap:10px' }, tabs, levels), el('div', { class: 'layout' }, planCard(), el('div', { style: 'display:grid;gap:14px;min-width:0' }, scopeCard(), exportsCard(), issuesCard())), editorsCard(), tablesCard());
}
const disc = () => (S.tab === 'coordination' ? null : S.tab);
function planCard() {
  const d = disc(), groups = d ? DEVICE_GROUPS[d] : [];
  if (S.kind === null && groups[S.group]) S.kind = groups[S.group].kinds[0][0];
  const tb = el('div', { class: 'toolbar' },
    el('div', { class: 'seg', role: 'group', 'aria-label': 'وضع التحرير' }, [['view', 'عرض'], ['add', 'إضافة جهاز'], ['move', 'نقل جهاز'], ['delete', 'حذف جهاز']].map(([m, ar]) => el('button', { 'data-mode': m, 'aria-pressed': String(S.mode === m), disabled: !d && m !== 'view' ? true : null, onclick: () => { S.mode = m; S.selected = null; render(); } }, ar))),
    d && S.mode === 'add' ? el('label', {}, 'المجموعة', el('select', { id: 'grpSel', onchange: e => { S.group = +e.target.value; S.kind = groups[S.group].kinds[0][0]; render(); } }, groups.map((g, i) => el('option', { value: i, selected: i === S.group }, g.ar)))) : null,
    d && S.mode === 'add' ? el('label', {}, 'النوع', el('select', { id: 'kindSel', onchange: e => { S.kind = e.target.value; } }, groups[S.group].kinds.map(([k, ar]) => el('option', { value: k, selected: k === S.kind }, ar)))) : null,
    d && (S.mode === 'add' || S.mode === 'move') ? el('label', {}, 'الارتفاع عن الأرضية (م)', el('input', { type: 'number', id: 'zRel', step: '0.05', value: S.zRel, onchange: e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) S.zRel = v; } })) : null,
    d && (S.mode === 'add' || S.mode === 'move') ? el('label', { title: 'للمناهل والوحدات الخارجية: يُضاف دون ربطه بغرفة' }, el('input', { type: 'checkbox', id: 'outsideChk', checked: S.outside, onchange: e => { S.outside = e.target.checked; } }), 'خارج الغرف (صراحة)') : null,
    el('label', {}, 'الطبقة', el('select', { id: 'layerSel', onchange: e => { S.layer = e.target.value; renderPlan(); } }, el('option', { value: '' }, 'كل الطبقات'), (S.result ? B.levelLayers(S.result, S.levelId, d) : []).map(L => el('option', { value: L.layer, selected: L.layer === S.layer }, L.ar)))));
  const hint = S.mode === 'add' ? 'انقر داخل غرفة لإضافة الجهاز؛ النقر في الفناء أو خارج الغرف يُرفض ما لم تختر «خارج الغرف».' : S.mode === 'move' ? (S.selected ? `اخترت ${S.selected}: انقر الموقع الجديد.` : 'انقر جهازًا (من المدخلات) ثم انقر موقعه الجديد.') : S.mode === 'delete' ? 'انقر جهازًا لحذفه من المدخلات.' : 'اختر «إضافة جهاز» لوضع اللوحات والأجهزة والمصادر على المسقط.';
  return el('div', { class: 'card', 'data-plan-card': '' }, el('h2', {}, d ? `طبقة ${DISCIPLINE_INFO[d].ar} — ${S.levelId}` : `التنسيق: كل التخصصات — ${S.levelId}`), tb, el('p', { class: 'sub', id: 'planHint' }, hint),
    el('div', { class: 'plan' + (S.mode !== 'view' ? ' editing' : ''), id: 'plan', onclick: onPlanClick }), el('div', { class: 'legend', id: 'legend' }));
}
async function renderPlan() {
  const box = $('plan'); if (!box) return;
  if (!S.result) { box.replaceChildren(el('p', { class: 'sub', style: 'padding:30px;text-align:center' }, S.busy ? 'يُحسب…' : 'لا توجد نتيجة بعد.')); return; }
  const d = disc(), opts = { levelId: S.levelId, ...(d ? { discipline: d } : {}), ...(S.layer ? { layer: S.layer } : {}) };
  try {
    // الرسم من المدخل الذي حُسبت عليه النتيجة نفسها (حتى يبقى القديم ظاهرًا تحت الغطاء دون أن يُصدَّر)
    if (!S.resultProject) { box.replaceChildren(el('p', { class: 'sub', style: 'padding:30px;text-align:center' }, 'النتيجة المحفوظة لا تطابق المخطط أو المدخلات الحالية؛ لا تُرسم. أعد الحساب.')); renderPlanVeil(); return; }
    const svg = await B.renderSvg(S.resultProject, S.result, opts);
    box.innerHTML = svg; box.dataset.inputHash = S.result.inputHash;
  } catch (e) { box.replaceChildren(el('p', { class: 'bad' }, 'تعذر رسم الطبقة: ' + String(e.message).slice(0, 140))); }
  renderPlanVeil();
  const lg = $('legend'); if (!lg) return;
  const L = B.levelLayers(S.result, S.levelId, d);
  lg.replaceChildren(...(L.length ? L.map(x => el('span', { 'data-layer': x.layer }, el('i', { style: `background:${x.color}` }), `${x.ar} (${x.layer}) — ${x.devices} عنصر، ${x.routes} مسار${x.blocked ? `، ${x.blocked} متعذر` : ''}`)) : [el('span', { class: 'sub' }, 'لا توجد عناصر لهذا التخصص في هذا الدور بعد.')]),
    el('span', {}, el('i', { class: 'blocked' }), 'مسار متعذر (BLOCKED) — لا يدخل الحصر'), el('span', {}, el('i', { style: 'background:#62706a' }), 'جدران المخطط المعماري (خلفية للقراءة فقط)'));
}
function renderPlanVeil() {
  const box = $('plan'); if (!box) return;
  box.querySelector('.stale-veil')?.remove();
  if (S.result && !S.fresh.fresh) box.append(el('div', { class: 'stale-veil', 'data-stale-veil': '' }, S.busy ? 'يُعاد الحساب…' : 'نتيجة قديمة لا تطابق المخطط أو المدخلات الحالية — أعد الحساب'));
}
function svgPoint(evt) {
  const svg = $('plan')?.querySelector('svg'); if (!svg) return null;
  const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
  const m = svg.getScreenCTM(); if (!m) return null; const q = pt.matrixTransform(m.inverse()); return { X: q.x, Y: q.y };
}
function nearestInput(frame, P) {
  let best = null;
  for (const d of S.result.disciplines.filter(x => x.id === disc())) for (const dv of d.devices.filter(x => x.levelId === S.levelId)) {
    if (!B.findDevice(S.inputs, dv.id)) continue;
    const q = frame.toSvg(dv.position), dd = Math.hypot(q.X - P.X, q.Y - P.Y); if (dd < 14 && (!best || dd < best.dd)) best = { id: dv.id, dd };
  }
  return best?.id || null;
}
async function onPlanClick(evt) {
  if (S.mode === 'view' || !S.result || !disc()) return;
  if (!S.fresh.fresh && !S.busy) { toast('أعد الحساب أولًا: الرسم الحالي قديم.', true); return; }
  const P = svgPoint(evt); if (!P) return;
  const frame = B.svgFrame(S.resultProject, S.result, { levelId: S.levelId, discipline: disc(), layer: S.layer || null }); if (!frame) return;
  const pt = frame.toPlan(P), level = S.bind.project.architecture.levels.find(l => l.id === S.levelId), z = level.elevationM + S.zRel;
  try {
    if (S.mode === 'add' || (S.mode === 'move' && S.selected)) {
      const loc = B.locate(S.doc, S.bind.project, S.levelId, pt);
      if (!loc.ok && !S.outside) { toast(loc.messageAr, true); $('planHint').textContent = loc.messageAr; $('planHint').dataset.rejected = loc.code; return; }
      if (S.mode === 'add') { const r = B.addDevice(S.inputs, { discipline: disc(), group: S.group, kind: S.kind, levelId: S.levelId, position: { ...pt, z }, roomId: loc.ok && !S.outside ? loc.roomId : null, outside: S.outside }); toast(`أُضيف ${r.id}${loc.ok && !S.outside ? ' في ' + loc.roomName : ' خارج الغرف'}`); changed(r.inputs); }
      else { const id = S.selected; S.selected = null; changed(B.moveDevice(S.inputs, id, { ...pt, z }, loc.ok && !S.outside ? loc.roomId : null)); toast(`نُقل ${id}`); }
    } else if (S.mode === 'move') { const id = nearestInput(frame, P); if (!id) return toast('لا يوجد جهاز قابل للنقل هنا (وحدات الإنارة ومخارج الهواء محسوبة من المدخلات).', true); S.selected = id; $('planHint').textContent = `اخترت ${id}: انقر الموقع الجديد.`; }
    else if (S.mode === 'delete') { const id = nearestInput(frame, P); if (!id) return toast('لا يوجد جهاز قابل للحذف هنا.', true); changed(B.removeDevice(S.inputs, id)); toast(`حُذف ${id}`); }
  } catch (e) { toast(e.message, true); }
}
function scopeCard() {
  const d = disc(), info = d ? DISCIPLINE_INFO[d] : COORDINATION_INFO;
  return el('div', { class: 'card', 'data-scope': S.tab }, el('h2', {}, 'ما تحسبه الحزمة وما يحتاج تطويرًا'),
    el('div', { class: 'scope' }, el('div', {}, el('h3', {}, 'تحسبه الحزمة (أوليًا)'), el('ul', {}, info.computes.map(t => el('li', {}, t)))), el('div', { class: 'need' }, el('h3', {}, 'يحتاج تطويرًا'), el('ul', {}, info.needs.map(t => el('li', {}, t))))),
    el('p', { class: 'sub' }, PRELIMINARY_AR + '.'));
}
function issuesCard() {
  if (!S.result) return el('div');
  const list = B.issuesOf(S.result, S.tab);
  return el('div', { class: 'card', 'data-issues': S.tab }, el('h2', {}, `الرسائل والنواقص (${list.length})`),
    S.tab === 'coordination' ? el('p', { class: 'note', 'data-no-clash-note': '' }, NO_CLASH_AR) : null,
    el('ul', { class: 'issues' }, list.map(i => el('li', { class: i.severity, 'data-code': i.code }, el('span', { class: 'sev' }, SEV_AR[i.severity] || i.severity), i.messageAr, el('code', {}, i.code + (i.details && Object.keys(i.details).length ? ' ' + JSON.stringify(i.details).slice(0, 140) : ''))))));
}

// ——— التصدير: بعد فحص الحداثة فقط ———
const EXPORT_LIST = () => {
  const d = disc(), sch = S.result ? (d ? S.result.disciplines.find(x => x.id === d).schedules : []) : [];
  return [
    { kind: 'svg', ar: `SVG — ${d ? DISCIPLINE_INFO[d].short : 'التنسيق'} (${S.levelId})`, opts: { levelId: S.levelId, discipline: d } },
    { kind: 'dxf', ar: `DXF — الدور ${S.levelId} (كل التخصصات، بالمتر وZ حقيقي)`, opts: { levelId: S.levelId } },
    ...sch.map(s => ({ kind: 'csv', ar: `CSV — ${s.id}`, opts: { scheduleId: s.id } })),
    { kind: 'csv', ar: 'CSV — الكميات', opts: { scheduleId: 'quantities' } },
    { kind: 'json-result', ar: 'JSON — النتيجة', opts: {} }, { kind: 'json-input', ar: 'JSON — المدخلات', opts: {} }, { kind: 'json-issues', ar: 'JSON — الرسائل', opts: {} },
  ];
};
function exportsCard() {
  return el('div', { class: 'card' }, el('h2', {}, 'التصدير'), el('p', { class: 'sub' }, 'كل ملف يحمل بصمة المدخل ووسم «أولي — ليس للتنفيذ». النتيجة القديمة لا تُصدَّر.'), el('div', { class: 'exports', id: 'exports' }));
}
function renderExports() {
  const box = $('exports'); if (!box) return;
  const ok = !!S.result && S.fresh.fresh && !S.busy;
  box.replaceChildren(...(S.result ? EXPORT_LIST().map(x => el('button', { class: 'btn small', 'data-export': x.kind + (x.opts.scheduleId ? ':' + x.opts.scheduleId : ''), disabled: ok ? null : true, title: ok ? '' : S.fresh.messageAr, onclick: () => doExport(x) }, x.ar)) : [el('span', { class: 'sub' }, 'احسب الأنظمة أولًا.')]));
}
async function doExport(x) {
  await checkSourceChanged();
  try {
    if (S.busy) throw Object.assign(Error('يُعاد الحساب؛ انتظر ثم صدّر.'), { code: 'STALE_RESULT' });
    const f = await B.buildExport(x.kind, { project: S.bind.project, result: S.result, sourceHash: S.sourceHash, ...x.opts });
    const blob = new Blob([f.text], { type: f.mime }), a = el('a', { href: URL.createObjectURL(blob), download: f.name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('نُزّل ' + f.name);
  } catch (e) { toast((e.code === 'STALE_RESULT' ? 'رُفض التصدير: ' : 'تعذر التصدير: ') + e.message, true); }
}

// ——— محرر المدخلات ———
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o, p, v) { const ks = p.split('.'); let a = o; for (const k of ks.slice(0, -1)) { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; } if (v === undefined) delete a[ks.at(-1)]; else a[ks.at(-1)] = v; }
const parseVal = (type, raw) => { if (type === 'num') { if (raw === '' || raw === null) return undefined; const v = Number(raw); return Number.isFinite(v) ? v : undefined; } if (type === 'bool') return raw ? true : undefined; if (type === 'list') { const a = String(raw).split(/[,،\s]+/).filter(Boolean); return a.length ? a : undefined; } if (type === 'int') { if (raw === '') return undefined; const v = Number(raw); return Number.isFinite(v) ? v : undefined; } return raw === '' ? undefined : raw; };
function fieldInput(row, [path, ar, type, choices], onSet) {
  const v = getPath(row, path), common = { 'aria-label': ar, title: ar, 'data-field': path };
  if (type === 'sel') return el('select', { ...common, onchange: e => onSet(path, parseVal(e.target.value === '' ? 'text' : (choices.numeric ? 'int' : 'text'), e.target.value)) }, el('option', { value: '' }, '—'), (typeof choices === 'function' ? choices() : choices).map(c => { const [val, lab] = Array.isArray(c) ? c : [c, c]; return el('option', { value: val, selected: String(v) === String(val) }, lab); }));
  if (type === 'bool') return el('input', { ...common, type: 'checkbox', checked: !!v, onchange: e => onSet(path, parseVal('bool', e.target.checked)) });
  if (type === 'list') return el('input', { ...common, class: 'wide', value: Array.isArray(v) ? v.join(', ') : '', onchange: e => onSet(path, parseVal('list', e.target.value)) });
  if (type === 'surf') return el('input', { ...common, class: 'wide', dir: 'ltr', placeholder: '22:0.45; 30:0.25', value: Array.isArray(v) ? v.map(s => `${s.areaM2}:${s.uWm2K}`).join('; ') : '', onchange: e => { const a = String(e.target.value).split(/[;؛]/).map(t => t.trim()).filter(Boolean).map(t => { const [A, U] = t.split(':').map(Number); return { areaM2: A, uWm2K: U }; }).filter(x => Number.isFinite(x.areaM2) && Number.isFinite(x.uWm2K)); onSet(path, a.length ? a : undefined); } });
  if (type === 'num') return el('input', { ...common, type: 'number', step: 'any', value: v ?? '', placeholder: 'فارغ', onchange: e => onSet(path, parseVal('num', e.target.value)) });
  return el('input', { ...common, class: type === 'wide' ? 'wide' : '', value: v ?? '', onchange: e => onSet(path, parseVal('text', e.target.value)) });
}
function rowsTable(rows, fields, onSet, onRemove) {
  return el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, fields.map(f => el('th', {}, f[1])), onRemove ? el('th', {}, '') : null)),
    el('tbody', {}, rows.map((r, i) => el('tr', { 'data-row': r.id || i }, fields.map(f => el('td', {}, f[2] === 'ro' ? String(getPath(r, f[0]) ?? '—') : fieldInput(r, f, (p, v) => onSet(i, p, v)))), onRemove ? el('td', {}, el('button', { class: 'btn small', onclick: () => onRemove(i) }, 'حذف')) : null)))));
}
/** قسم قائمة داخل services: path مسار القائمة. */
function listSection(title, path, fields, { add = null, note = null, extra = null, open = false } = {}) {
  const rows = getPath(S.inputs.services, path.join('.')) || [];
  const mut = fn => { const inp = JSON.parse(JSON.stringify(S.inputs)); let list = getPath(inp.services, path.join('.')); if (!list) { setPath(inp.services, path.join('.'), []); list = getPath(inp.services, path.join('.')); } fn(list, inp); changed(inp); render(); };
  return el('details', { class: 'ed', open: open || rows.length ? true : null, 'data-section': path.join('.') }, el('summary', {}, `${title} (${rows.length})`), el('div', { class: 'body' },
    note ? el('p', { class: 'note' }, note) : null,
    rows.length ? rowsTable(rows, fields, (i, p, v) => mut(list => setPath(list[i], p, v)), i => mut(list => list.splice(i, 1))) : el('p', { class: 'sub' }, 'لا توجد عناصر.'),
    el('div', { class: 'rowbar' }, add ? el('button', { class: 'btn small', 'data-add': path.join('.'), onclick: () => mut((list, inp) => list.push(add(inp))) }, 'إضافة صف') : null, extra ? extra(mut) : null)));
}
function objSection(title, path, fields, note = null) {
  const obj = getPath(S.inputs.services, path) || null;
  const mut = fn => { const inp = JSON.parse(JSON.stringify(S.inputs)); fn(inp); changed(inp); render(); };
  return el('details', { class: 'ed', open: obj ? true : null, 'data-section': path }, el('summary', {}, title + (obj ? '' : ' (غير مُدخل)')), el('div', { class: 'body' }, note ? el('p', { class: 'note' }, note) : null,
    obj ? rowsTable([obj], fields, (_, p, v) => mut(inp => setPath(getPath(inp.services, path), p, v)), () => mut(inp => setPath(inp.services, path, undefined))) : el('button', { class: 'btn small', 'data-add': path, onclick: () => mut(inp => setPath(inp.services, path, {})) }, 'أدخل البيانات')));
}
const ids = (pred = () => true) => { const out = []; for (const groups of Object.values(DEVICE_GROUPS)) for (const g of groups) for (const d of getPath(S.inputs.services, g.path.join('.')) || []) if (pred(d, g)) out.push([d.id, d.id + ' — ' + d.kind]); return out; };
const roomChoices = () => S.bind.project.architecture.rooms.map(r => [r.id, `${r.name} (${r.id}، ${r.levelId})`]);
const devFields = extra => [['id', 'المعرف', 'ro'], ['kind', 'النوع', 'ro'], ['levelId', 'الدور', 'ro'], ['roomId', 'الغرفة', 'sel', roomChoices], ['position.x', 'X م', 'num'], ['position.y', 'Y م', 'num'], ['position.z', 'Z مطلق م', 'num'], ...extra];
// قيم المثال التوضيحية للحزمة (examples/config.mjs): تُملأ في الحقول الفارغة فقط وبطلب صريح، ويُسجَّل أصلها افتراضًا
const DEMO = {
  cable: { 'cable.sizeMm2': 2.5, 'cable.resistanceOhmPerKm': 8, 'cable.reactanceOhmPerKm': 0.08 },
  protection: { 'protection.ratedA': 16, 'protection.correctedAmpacityA': 18, 'protection.voltageDropLimitPercent': 3, 'protection.source': 'DEMO ONLY: engineer must replace with verified cable installation data and project limit' },
  route: { 'routing.routeHeightM': 2.85, 'routing.widthM': 0.03, 'routing.heightM': 0.03, 'routing.clearanceM': 0.03 },
  thermal: { 'thermal.surfaces': r => { const room = S.bind.project.architecture.rooms.find(x => x.id === r.roomId); return [{ areaM2: 22, uWm2K: 0.45 }, ...(room ? [{ areaM2: Math.round(room.areaM2 * 100) / 100, uWm2K: 0.25 }] : [])]; }, 'thermal.outdoorC': 44, 'thermal.indoorC': 24, 'thermal.solarW': 500, 'thermal.internalSensibleW': 300, 'thermal.internalLatentW': 150, 'thermal.infiltrationM3S': 0.003, 'thermal.outdoorAirM3S': 0.01, 'thermal.outdoorHumidityRatio': 0.012, 'thermal.indoorHumidityRatio': 0.009, 'thermal.densityKgM3': 1.2, 'thermal.cpJkgK': 1006, 'thermal.latentHeatJkg': 2450000, supplyDeltaK: 12, terminalHeightM: 2.8, ductVelocityMS: 4, 'routing.routeHeightM': 2.8, 'routing.widthM': 0.3, 'routing.heightM': 0.25, 'routing.clearanceM': 0.05 },
};
const DEMO_PROV = { id: 'KIT-DEMO-ASSUMPTIONS', classification: 'PROJECT_ASSUMPTION', authority: 'EXAMPLE_ONLY', verifiedCodeClause: null, noteAr: 'قيم المثال التوضيحية للحزمة (كابل، حماية، مناخ، غلاف…) أُدخلت بطلب المستخدم؛ افتراضات قابلة للتعديل وليست اشتراطات سعودية أو اختيار مصنّع.' };
function demoButton(keys, label = 'املأ الفارغ بقيم المثال التوضيحية') {
  return mut => el('button', { class: 'btn small', 'data-demo': keys.join('+'), title: 'افتراضات تعليمية من مثال الحزمة؛ تُعرض كافتراض قابل للتعديل وليست اشتراطًا', onclick: () => mut((list, inp) => {
    for (const r of list) for (const k of keys) for (const [p, v] of Object.entries(DEMO[k])) if (getPath(r, p) === undefined) setPath(r, p, typeof v === 'function' ? v(r) : v);
    inp.rules = inp.rules || {}; inp.rules.provenance = (inp.rules.provenance || []).filter(x => x.id !== DEMO_PROV.id).concat([DEMO_PROV]);
  }) }, label + ' (افتراض)');
}
function linkButtons(list) {
  return el('div', { class: 'rowbar' }, list.filter(d => typeof d.ratedInputW === 'number').map(d => el('button', { class: 'btn small', 'data-link': d.id, onclick: () => { try { const r = B.linkElectricalLoad(S.inputs, d.id); changed(r.inputs); render(); toast(`${r.updated ? 'حُدّث' : 'أُنشئ'} الحمل الكهربائي ${r.id} = ${d.ratedInputW} W (أدخل معامل القدرة والدائرة في الكهرباء)`); } catch (e) { toast(e.message, true); } } }, `اربط ${d.id} بحمل كهربائي`)));
}
const curLevelRooms = () => S.bind.project.architecture.rooms.filter(r => r.levelId === S.levelId);
function editorsCard() {
  const d = S.tab, parts = [];
  const lvlOf = id => (B.findDevice(S.inputs, id)?.device.levelId) || S.levelId;
  if (d === 'electrical') {
    parts.push(listSection('لوحات التوزيع', ['electrical', 'panels'], devFields([]), { note: 'ضع اللوحات على المسقط من «إضافة جهاز». موقع اللوحة ومعلومات التغذية من المصمم.' }));
    parts.push(listSection('المقابس والأحمال', ['electrical', 'loads'], devFields([['powerW', 'القدرة W', 'num'], ['powerFactor', 'معامل القدرة PF', 'num'], ['demandFactor', 'عامل الطلب', 'num'], ['sourceEquipmentId', 'جهاز المصدر', 'ro']]), { note: 'الحمل بلا PF أو عامل طلب يبقى غير محسوب (null) ولا يُفترض له رقم.' }));
    parts.push(listSection('الدوائر', ['electrical', 'circuits'], [['id', 'المعرف', 'text'], ['panelId', 'اللوحة', 'sel', () => ids((x, g) => g.path[1] === 'panels')], ['loadIds', 'الأحمال (معرفات مفصولة بفاصلة)', 'list'], ['voltageV', 'الجهد V', 'num'], ['phases', 'الأطوار', 'sel', Object.assign([[1, '1'], [3, '3']], { numeric: true })], ['phase', 'الطور', 'sel', ['L1', 'L2', 'L3']], ['balanced', 'ثلاثي متزن', 'bool'], ...routing('routing.'), ['cable.sizeMm2', 'المقطع مم²', 'num'], ['cable.resistanceOhmPerKm', 'R Ω/km', 'num'], ['cable.reactanceOhmPerKm', 'X Ω/km', 'num'], ['protection.ratedA', 'القاطع In A', 'num'], ['protection.correctedAmpacityA', 'سعة الكابل المصححة Iz A', 'num'], ['protection.source', 'مرجع السعة', 'wide'], ['protection.voltageDropLimitPercent', 'حد الهبوط للمشروع %', 'num']],
      { add: inp => { const used = new Set((inp.services.electrical?.circuits || []).map(c => c.id)); let n = 1; while (used.has('C' + n) || B.allDeviceIds(inp).has('C' + n)) n++; return { id: 'C' + n, loadIds: [], phases: 1 }; }, note: 'مقاس الكابل والقاطع لا يُختاران تلقائيًا: بيانات الكابل الناقصة تعني هبوط جهد غير محسوب.', extra: demoButton(['route', 'cable', 'protection'], 'املأ الفارغ بمسار/كابل/حماية المثال') }));
    parts.push(lightingSection());
  } else if (d === 'hvac') {
    const eq = getPath(S.inputs.services, 'hvac.equipment') || [];
    parts.push(listSection('أجهزة التكييف', ['hvac', 'equipment'], devFields([['ratedInputW', 'الاستهلاك الكهربائي الفعلي W', 'num']]), { note: 'أدخل الاستهلاك الكهربائي الفعلي (من بيانات المصنّع) لا قدرة التبريد، ثم اربطه بحمل كهربائي.', extra: () => linkButtons(eq) }));
    parts.push(listSection('المناطق الحرارية (المناخ والغلاف)', ['hvac', 'zones'], [['id', 'المعرف', 'text'], ['roomId', 'الغرفة', 'sel', roomChoices], ['equipmentId', 'الجهاز', 'sel', () => ids((x, g) => g.path[0] === 'hvac')], ['thermal.outdoorC', 'حرارة الخارج °C', 'num'], ['thermal.indoorC', 'حرارة الداخل °C', 'num'], ['thermal.surfaces', 'الغلاف: مساحة:U; …', 'surf'], ['thermal.solarW', 'إشعاع W', 'num'], ['thermal.internalSensibleW', 'داخلي حسي W', 'num'], ['thermal.internalLatentW', 'داخلي كامن W', 'num'], ['thermal.infiltrationM3S', 'تسرب م³/ث', 'num'], ['thermal.outdoorAirM3S', 'هواء خارجي م³/ث', 'num'], ['thermal.outdoorHumidityRatio', 'رطوبة الخارج kg/kg', 'num'], ['thermal.indoorHumidityRatio', 'رطوبة الداخل kg/kg', 'num'], ['thermal.densityKgM3', 'كثافة الهواء', 'num'], ['thermal.cpJkgK', 'cp', 'num'], ['thermal.latentHeatJkg', 'hfg', 'num'], ['ventilation.persons', 'الأشخاص', 'num'], ['ventilation.lSPerPerson', 'ل/ث لكل شخص', 'num'], ['ventilation.lSPerM2', 'ل/ث لكل م²', 'num'], ['ventilation.distributionEffectiveness', 'فعالية التوزيع', 'num'], ['supplyDeltaK', 'فرق حرارة التغذية K', 'num'], ['terminalHeightM', 'منسوب المخرج م', 'num'], ['ductVelocityMS', 'سرعة الدكت م/ث', 'num'], ...routing('routing.')],
      { add: inp => ({ id: 'Z' + ((getPath(inp.services, 'hvac.zones') || []).length + 1), roomId: curLevelRooms()[0]?.id }), note: 'المناخ والغلاف مدخلات صريحة؛ الناقص يبقى غير محسوب. الدالة مكاسب ساكنة وليست حمل تصميم، والسعة المختارة تبقى فارغة.', extra: demoButton(['thermal'], 'املأ الفارغ بمناخ وغلاف المثال') }));
    parts.push(listSection('الشفط', ['hvac', 'exhaust'], [['id', 'المعرف', 'text'], ['roomId', 'الغرفة', 'sel', roomChoices], ['airChangesPerHour', 'تبدلات/ساعة', 'num'], ['fan.position.x', 'المروحة X', 'num'], ['fan.position.y', 'المروحة Y', 'num'], ['fan.position.z', 'المروحة Z', 'num'], ['discharge.id', 'معرف المخرج', 'text'], ['discharge.levelId', 'دور المخرج', 'sel', () => S.bind.levels.map(l => l.id)], ['discharge.position.x', 'المخرج X', 'num'], ['discharge.position.y', 'المخرج Y', 'num'], ['discharge.position.z', 'المخرج Z', 'num'], ...routing('routing.')],
      { add: inp => { const r = curLevelRooms().find(x => /bath|kitchen/.test(x.type)) || curLevelRooms()[0]; return { id: 'EF' + ((getPath(inp.services, 'hvac.exhaust') || []).length + 1), roomId: r?.id }; }, note: 'تبدلات الهواء مدخل وليست اشتراطًا تلقائيًا.' }));
  } else if (d === 'plumbing') {
    const eq = getPath(S.inputs.services, 'plumbing.equipment') || [];
    parts.push(listSection('الأجهزة الصحية', ['plumbing', 'fixtures'], devFields([])));
    parts.push(listSection('المصادر والمعدات والمناهل', ['plumbing', 'equipment'], devFields([['ratedInputW', 'الاستهلاك الكهربائي W (للمضخات)', 'num']]), { note: 'مصدر المياه والخزان والمنهل مواقع يحددها المصمم. منسوب قاع المنهل يُدخل في الوصلة.', extra: () => linkButtons(eq) }));
    parts.push(listSection('الوصلات (مياه/صرف/تهوية/أمطار/تكاثف)', ['plumbing', 'connections'], [['id', 'المعرف', 'text'], ['system', 'النظام', 'sel', [['cold_water', 'مياه باردة'], ['hot_water', 'مياه ساخنة'], ['sanitary', 'صرف'], ['vent', 'تهوية صرف'], ['storm', 'أمطار'], ['condensate', 'تكاثف']]], ['fromId', 'من', 'sel', () => ids((x, g) => g.path[0] === 'plumbing')], ['toId', 'إلى', 'sel', () => ids((x, g) => g.path[0] === 'plumbing')], ['flowM3S', 'التدفق التصميمي م³/ث', 'num'], ['velocityMS', 'السرعة م/ث', 'num'], ['selectedDiameterMm', 'القطر المختار مم', 'num'], ['startInvertM', 'قاع البداية م (نسبي)', 'num'], ['endInvertM', 'قاع النهاية م (نسبي)', 'num'], ['slope', 'الميل (Δz/L)', 'num'], ...routing('routing.'), ['hydraulics.diameterM', 'قطر داخلي م', 'num'], ['hydraulics.darcyFrictionFactor', 'f Darcy', 'num'], ['hydraulics.minorLossK', 'ΣK', 'num'], ['hydraulics.elevationRiseM', 'ارتفاع م', 'num'], ['hydraulics.requiredResidualHeadM', 'ضاغط متبقٍ م', 'num'], ['hydraulics.gravityMS2', 'g', 'num']],
      { add: inp => ({ id: 'PC' + ((getPath(inp.services, 'plumbing.connections') || []).length + 1), system: 'cold_water' }), note: 'الصرف بالجاذبية يحتاج قاع البداية والنهاية والميل؛ إن لم يصل الميل والطول إلى منسوب المنهل تُحجب الوصلة (BLOCKED) ويظهر الفرق. منحنى الطلب من وحدات الأجهزة لا يُخترع.' }));
    parts.push(objSection('الخزان (سعة تشغيلية)', 'plumbing.tank', [['persons', 'الأشخاص', 'num'], ['litresPerPersonDay', 'لتر/شخص/يوم', 'num'], ['autonomyDays', 'أيام التخزين', 'num']], 'لا يشمل خزان حريق أو طوارئ.'));
    parts.push(listSection('أمطار الأسطح', ['plumbing', 'roofDrainage'], [['id', 'المعرف', 'text'], ['intensityMmH', 'الشدة مم/ساعة', 'num'], ['areaM2', 'المساحة م²', 'num'], ['runoffCoefficient', 'معامل الجريان', 'num']], { add: inp => ({ id: 'ROOF' + ((getPath(inp.services, 'plumbing.roofDrainage') || []).length + 1) }), note: 'الشدة المطرية بيانات مشروع لا قيمة نظامية مزروعة.' }));
    parts.push(objSection('تسخين المياه', 'plumbing.hotWater', [['flowM3S', 'التدفق م³/ث', 'num'], ['deltaK', 'فرق الحرارة K', 'num'], ['densityKgM3', 'الكثافة', 'num'], ['cpJkgK', 'cp', 'num'], ['efficiency', 'الكفاءة', 'num']], 'القدرة الحرارية لا تتحول تلقائيًا إلى حمل كهربائي.'));
  } else if (['fire', 'low_current', 'solar'].includes(d)) {
    parts.push(listSection(DEVICE_GROUPS[d][0].ar, [d, 'devices'], devFields([])));
    parts.push(listSection('الوصلات', [d, 'connections'], [['id', 'المعرف', 'text'], ['fromId', 'من', 'sel', () => ids((x, g) => g.path[0] === d)], ['toId', 'إلى', 'sel', () => ids((x, g) => g.path[0] === d)], ['systemId', 'النظام', 'text'], ['kind', 'نوع الوصلة', 'text'], ...routing('routing.'), ['projectLengthLimitM', 'حد الطول للمشروع م', 'num']], { add: inp => ({ id: d.slice(0, 1).toUpperCase() + 'C' + ((getPath(inp.services, d + '.connections') || []).length + 1) }) }));
    if (d === 'solar') parts.push(objSection('القدرة الاسمية', 'solar.capacity', [['panelCount', 'عدد الألواح', 'num'], ['wattsPerPanel', 'قدرة اللوح Wp', 'num']], 'قدرة اسمية فقط؛ لا إنتاج سنوي.'));
  } else if (d === 'coordination') parts.push(...coordinationEditors());
  return el('div', { class: 'card', 'data-editors': d }, el('h2', {}, 'المدخلات والتجهيزات'), el('p', { class: 'sub' }, 'الحقل الفارغ يبقى ناقصًا (غير محسوب) ولا يُعوَّض بصفر. الإحداثيات بالمتر (X شرق، Y شمال)، وZ مطلق.'), ...parts);
}
function lightingSection() {
  const L = S.inputs.services.electrical?.lightingByRoom || {}, rows = Object.entries(L).map(([roomId, v]) => ({ roomId, ...v }));
  const fields = [['roomId', 'الغرفة', 'ro'], ['targetLux', 'الشدة المستهدفة lux', 'num'], ['lumensPerFixture', 'لومن الوحدة', 'num'], ['utilizationFactor', 'UF', 'num'], ['maintenanceFactor', 'MF', 'num'], ['wattsPerFixture', 'W للوحدة', 'num'], ['powerFactor', 'PF', 'num'], ['demandFactor', 'عامل الطلب', 'num'], ['mountHeightM', 'ارتفاع التركيب م', 'num'], ['panelId', 'اللوحة', 'sel', () => ids((x, g) => g.path[1] === 'panels')], ['phase', 'الطور', 'sel', ['L1', 'L2', 'L3']], ['voltageV', 'الجهد V', 'num'], ...routing('routing.'), ['cable.resistanceOhmPerKm', 'R Ω/km', 'num'], ['cable.reactanceOhmPerKm', 'X Ω/km', 'num']];
  const mut = fn => { const inp = JSON.parse(JSON.stringify(S.inputs)); inp.services.electrical = inp.services.electrical || {}; inp.services.electrical.lightingByRoom = inp.services.electrical.lightingByRoom || {}; fn(inp.services.electrical.lightingByRoom, inp); changed(inp); render(); };
  const addSel = el('select', { id: 'lightRoom', 'aria-label': 'غرفة الإنارة' }, curLevelRooms().filter(r => !L[r.id]).map(r => el('option', { value: r.id }, `${r.name} (${r.id})`)));
  return el('details', { class: 'ed', open: rows.length ? true : null, 'data-section': 'electrical.lightingByRoom' }, el('summary', {}, `الإنارة حسب الغرفة (${rows.length})`), el('div', { class: 'body' },
    el('p', { class: 'note' }, 'عدد الوحدات يُحسب بطريقة اللومن من الشدة والمعاملات التي تدخلها؛ لا تُستنتج الشدة ولا العدد من اسم الغرفة.'),
    rows.length ? rowsTable(rows, fields, (i, p, v) => mut(LB => setPath(LB[rows[i].roomId], p, v)), i => mut(LB => { delete LB[rows[i].roomId]; })) : el('p', { class: 'sub' }, 'لم تُعرّف إنارة لأي غرفة.'),
    el('div', { class: 'rowbar' }, addSel, el('button', { class: 'btn small', 'data-add': 'lighting', onclick: () => addSel.value && mut(LB => { LB[addSel.value] = {}; }) }, 'أضف غرفة للإنارة'))));
}
function coordinationEditors() {
  const out = [];
  out.push(listSection('الرايزرات (صريحة بين دورين)', ['risers'], [['id', 'المعرف', 'text'], ['discipline', 'التخصص', 'sel', [['plumbing', 'صحي'], ['fire', 'حريق'], ['low_current', 'تيار خفيف'], ['electrical', 'كهرباء'], ['hvac', 'تكييف']]], ['fromId', 'من (عقدة)', 'sel', () => ids()], ['toId', 'إلى (عقدة)', 'sel', () => ids()], ['layer', 'الطبقة (مثل P-RISER)', 'text'], ['kind', 'النوع', 'text'], ['systemId', 'النظام', 'text'], ['widthM', 'العرض م', 'num'], ['heightM', 'العمق م', 'num'], ['clearanceM', 'الخلوص م', 'num']],
    { add: inp => ({ id: 'RS' + ((inp.services.risers || []).length + 1), discipline: 'plumbing', layer: 'P-RISER' }), note: 'طرفا الرايزر عقدتان من التخصص نفسه في دورين مختلفين وعلى XY واحد؛ لا تُسحب العقد تلقائيًا. اختراق البلاطة يبقى بحاجة اعتماد مستقل.', extra: () => riserHelper() }));
  const lv = S.bind.levels, dom = S.inputs.domainByLevel || {};
  const setDom = (id, k, v) => { const inp = JSON.parse(JSON.stringify(S.inputs)); inp.domainByLevel = inp.domainByLevel || {}; inp.domainByLevel[id] = { ...(inp.domainByLevel[id] || {}), [k]: v }; changed(inp); render(); };
  out.push(el('details', { class: 'ed', open: true, 'data-section': 'domains' }, el('summary', {}, 'حيز تمرير الخدمات لكل دور'), el('div', { class: 'body' },
    el('p', { class: 'note' }, 'افتراض معلن قابل للتعديل: محيط المبنى من محلّل المرسم ناقص الأفنية، أو حدود الأرض (للوصول إلى منهل أو وحدة خارجية). المسار خارج الحيز يُحجب.'),
    rowsTable(lv.map(l => ({ id: l.id, mode: dom[l.id]?.mode || 'outline', stepM: dom[l.id]?.stepM ?? 0.25 })), [['id', 'الدور', 'ro'], ['mode', 'الحيز', 'sel', [['outline', 'محيط المبنى'], ['plot', 'حدود الأرض'], ['none', 'بلا حيز (لا مسارات)']]], ['stepM', 'دقة الشبكة م', 'num']], (i, p, v) => setDom(lv[i].id, p, v)))));
  const mutI = fn => { const inp = JSON.parse(JSON.stringify(S.inputs)); fn(inp); changed(inp); render(); };
  const mo = S.inputs.manualObstacles || [];
  out.push(el('details', { class: 'ed', open: true, 'data-section': 'obstacles' }, el('summary', {}, `العوائق الإنشائية (${S.bind.project.architecture.obstacles.length})`), el('div', { class: 'body' },
    el('p', { class: 'note' }, S.bind.structure?.noteAr || ''),
    el('label', {}, el('input', { type: 'checkbox', id: 'usePrecheck', checked: S.inputs.structure?.usePrecheck !== false, onchange: e => mutI(inp => { inp.structure = { usePrecheck: e.target.checked }; }) }), ' استخدم أعمدة وكمرات الفحص الإنشائي المبدئي'),
    el('h3', {}, 'عوائق يدخلها المصمم (صناديق بمناسيب مطلقة)'),
    mo.length ? rowsTable(mo, [['id', 'المعرف', 'text'], ['kind', 'النوع', 'text'], ['min.x', 'min X', 'num'], ['min.y', 'min Y', 'num'], ['min.z', 'min Z', 'num'], ['max.x', 'max X', 'num'], ['max.y', 'max Y', 'num'], ['max.z', 'max Z', 'num']], (i, p, v) => mutI(inp => setPath(inp.manualObstacles[i], p, v)), i => mutI(inp => inp.manualObstacles.splice(i, 1))) : el('p', { class: 'sub' }, 'لا توجد.'),
    el('div', { class: 'rowbar' }, el('button', { class: 'btn small', 'data-add': 'obstacle', onclick: () => mutI(inp => { inp.manualObstacles = inp.manualObstacles || []; const L = S.bind.project.architecture.levels.find(l => l.id === S.levelId); inp.manualObstacles.push({ id: 'OB' + (inp.manualObstacles.length + 1), kind: 'beam', min: { x: 0, y: 0, z: L.elevationM }, max: { x: 0.3, y: 0.3, z: L.elevationM + L.heightM } }); }) }, 'أضف عائقًا')))));
  return out;
}
function riserHelper() {
  const nodes = ids((x, g) => ['plumbing', 'fire', 'low_current'].includes(g.path[0])), lv = S.bind.levels.filter(l => l.rooms > 0);
  if (lv.length < 2) return el('p', { class: 'sub' }, 'المخطط دور واحد: لا رايزرات (لا يُخترع دور ثانٍ).');
  const a = el('select', { id: 'riserFrom', 'aria-label': 'العقدة' }, nodes.map(([v, t]) => el('option', { value: v }, t))), b = el('select', { id: 'riserLevel', 'aria-label': 'الدور الآخر' }, lv.map(l => el('option', { value: l.id }, l.id)));
  return el('span', { class: 'rowbar' }, 'عقدة مقابلة على XY نفسه:', a, b, el('button', { class: 'btn small', 'data-riser-pair': '', onclick: () => {
    try {
      const f = B.findDevice(S.inputs, a.value); if (!f) throw Error('اختر عقدة'); if (f.device.levelId === b.value) throw Error('اختر دورًا آخر');
      const L = S.bind.project.architecture.levels.find(l => l.id === b.value), pt = { x: f.device.position.x, y: f.device.position.y }, loc = B.locate(S.doc, S.bind.project, b.value, pt);
      if (!loc.ok) throw Error('النقطة المقابلة في ' + b.value + ': ' + loc.messageAr);
      const kindGroup = DEVICE_GROUPS[f.discipline].findIndex(g => g.kinds.some(([k]) => k === 'RISER_NODE'));
      const r = B.addDevice(S.inputs, { discipline: f.discipline, group: kindGroup, kind: 'RISER_NODE', levelId: b.value, position: { ...pt, z: L.elevationM + (f.device.position.z - S.bind.project.architecture.levels.find(l => l.id === f.device.levelId).elevationM) }, roomId: loc.roomId });
      const inp = r.inputs; inp.services.risers = inp.services.risers || [];
      const layer = { plumbing: 'P-RISER', fire: 'F-RISER', low_current: 'T-RISER' }[f.discipline];
      inp.services.risers.push({ id: 'RS' + (inp.services.risers.length + 1), discipline: f.discipline, fromId: f.device.id, toId: r.id, layer, kind: 'VERTICAL_RISER', systemId: f.discipline + '-riser', widthM: 0.06, heightM: 0.06, clearanceM: 0.03 });
      changed(inp); render(); toast(`أُضيفت العقدة ${r.id} في ${b.value} ورايزر بينهما (أبعاد الرايزر افتراض قابل للتعديل)`);
    } catch (e) { toast(e.message, true); }
  } }, 'أضف عقدة ورايزرًا'));
}

// ——— الجداول ———
function cell(col, v) {
  if (v === null || v === undefined) return el('td', {}, NA(NULL_WHY[col] || 'غير محسوب'));
  if (col === 'routeStatus' && v === 'BLOCKED') return el('td', { class: 'blk' }, 'متعذر BLOCKED');
  if (typeof v === 'number') return el('td', { class: 'num' }, fmtN(v));
  if (typeof v === 'object') return el('td', {}, JSON.stringify(v));
  return el('td', {}, String(v));
}
const tableOf = (cols, rows, attrs = {}) => el('div', { class: 'tw' }, el('table', attrs, el('thead', {}, el('tr', {}, cols.map(c => el('th', {}, COL_AR[c] || c)))), el('tbody', {}, rows.length ? rows.map(r => el('tr', {}, cols.map(c => cell(c, r[c])))) : el('tr', {}, el('td', { colspan: cols.length, class: 'sub' }, 'لا صفوف بعد.')))));
function tablesCard() {
  if (!S.result) return el('div');
  const d = disc(), out = [];
  if (d) {
    const D = S.result.disciplines.find(x => x.id === d);
    for (const s of D.schedules) out.push(el('h3', {}, 'جدول ' + s.id), tableOf(s.columns, s.rows, { 'data-schedule': s.id }));
    const calcs = B.calcRows(S.result, d);
    out.push(el('h3', {}, `سجل الحسابات (${calcs.length})`), el('div', { class: 'tw' }, el('table', { 'data-calcs': d }, el('thead', {}, el('tr', {}, ['المعرف', 'الطريقة', 'الحالة', 'القيمة', 'الوحدة', 'السبب'].map(h => el('th', {}, h)))),
      el('tbody', {}, calcs.length ? calcs.map(c => el('tr', { 'data-status': c.status }, el('td', {}, c.id), el('td', {}, c.method), el('td', { class: c.status === 'NOT_CALCULATED' ? 'na' : '' }, c.status === 'NOT_CALCULATED' ? 'غير محسوب' : 'محسوب'), c.value === null ? el('td', {}, NA()) : el('td', { class: typeof c.value === 'number' ? 'num' : '' }, typeof c.value === 'number' ? fmtN(c.value) : Object.entries(c.value).map(([k, v]) => `${k}=${typeof v === 'number' ? fmtN(v) : v}`).join('، ')), el('td', {}, c.unit), el('td', {}, c.reason || ''))) : el('tr', {}, el('td', { colspan: 6, class: 'sub' }, 'لا حسابات بعد — أضف المدخلات.'))))));
    out.push(el('h3', {}, 'المعدات والعناصر'), tableOf(['id', 'kind', 'layer', 'levelId', 'roomId'], D.devices.map(x => ({ id: x.id, kind: x.kind, layer: x.layer, levelId: x.levelId, roomId: x.roomId ?? 'خارج الغرف' })), { 'data-devices': d }));
    out.push(el('h3', {}, 'المسارات'), tableOf(['id', 'kind', 'fromId', 'toId', 'levelId', 'lengthM', 'routeStatus'], D.routes.map(r => ({ id: r.id, kind: r.kind, fromId: r.fromId, toId: r.toId, levelId: (r.levelIds || [r.levelId]).join('→'), lengthM: r.status === 'BLOCKED' ? null : r.lengthM, routeStatus: r.status === 'BLOCKED' ? 'BLOCKED' : r.status + ' ' })).map(r => r), { 'data-routes': d }));
    const blocked = D.routes.filter(r => r.status === 'BLOCKED');
    if (blocked.length) out.push(el('p', { class: 'bad' }, `${blocked.length} مسار متعذر: ` + blocked.map(r => `${r.id} (${r.reason}${r.endInvertM !== undefined ? `، القاع الفعلي ${fmtN(r.endInvertM)} م` : ''})`).join('، ')));
  } else {
    const C = S.result.coordination;
    out.push(el('p', { class: 'note', 'data-no-clash-note': '' }, NO_CLASH_AR), el('div', { class: 'kv' }, el('span', {}, el('b', {}, 'الطريقة: '), C.method), el('span', {}, el('b', {}, 'الحالة: '), C.status), el('span', {}, el('b', {}, 'التعارضات المحتملة: '), C.clashes.length), el('span', {}, el('b', {}, 'فحص الكود: '), 'غير مقيّم')));
    out.push(el('h3', {}, 'ربط أحمال الأجهزة بالكهرباء'), tableOf(['equipmentId', 'electricalLoadId', 'outcome'], C.interfaces, { 'data-interfaces': '' }));
    out.push(el('h3', {}, 'التعارضات المحتملة'), tableOf(['kind', 'routeId', 'other', 'outcome'], C.clashes.map(c => ({ kind: c.kind, routeId: c.routeId, other: c.obstacleId || c.wallId || c.otherRouteId, outcome: c.outcome })), { 'data-clashes': '' }));
    out.push(el('h3', {}, 'حدود الفحص'), el('ul', {}, C.limitations.map(t => el('li', { class: 'sub' }, t))));
  }
  const q = S.result.quantities, qrows = q.rows.filter(r => !d || r.discipline === d);
  const rateIn = r => { const v = S.inputs.rules?.rates?.[r.key]; return el('input', { type: 'number', step: 'any', min: '0', value: v ?? '', placeholder: 'غير مسعّر', 'aria-label': 'سعر ' + r.key, onchange: e => { const inp = JSON.parse(JSON.stringify(S.inputs)); inp.rules = inp.rules || {}; inp.rules.rates = inp.rules.rates || {}; const n = parseVal('num', e.target.value); if (n === undefined) delete inp.rules.rates[r.key]; else inp.rules.rates[r.key] = n; changed(inp); } }); };
  out.push(el('h3', {}, 'الكميات الأولية'), el('div', { class: 'tw' }, el('table', { 'data-quantities': '' }, el('thead', {}, el('tr', {}, ['البند', 'الطبقة', 'الوحدة', 'الكمية', 'سعر الوحدة (تدخله)', 'المبلغ'].map(h => el('th', {}, h)))),
    el('tbody', {}, qrows.length ? qrows.map(r => el('tr', {}, el('td', {}, r.kind), el('td', {}, r.layer), el('td', {}, r.unit), el('td', { class: 'num' }, fmtN(r.quantity)), el('td', {}, rateIn(r)), r.amount === null ? el('td', {}, NA('غير مسعّر')) : el('td', { class: 'num' }, fmtN(r.amount)))) : el('tr', {}, el('td', { colspan: 6, class: 'sub' }, 'لا كميات بعد.'))))),
    el('p', { class: 'sub' }, !q.rows.length ? 'لا كميات بعد؛ لا يُعرض إجمالي.' : q.total === null ? `الإجمالي غير مكتمل: ${q.unpricedCount} بند غير مسعّر (المسعّر ${fmtN(q.pricedSubtotal)}). لا هالك ولا وصلات ولا ضريبة.` : `الإجمالي المسعّر: ${fmtN(q.total)} (بلا هالك ولا وصلات ولا ضريبة).`));
  return el('div', { class: 'card', id: 'tablesBox', 'data-tables': S.tab, ...(S.fresh.fresh ? {} : { 'data-stale': '' }) }, el('h2', {}, 'الجداول والكميات'), el('p', { class: 'bad stale-note', 'data-stale-note': '' }, 'النتيجة قديمة: الجداول والكميات مخفية حتى يُعاد الحساب (لا تُعرض أرقام قديمة كأنها حالية).'), ...out);
}
/** الجداول والكميات مخفية ما دامت النتيجة قديمة؛ يُستدعى فور أي تغيير دون إعادة بناء الصفحة. */
function renderTablesStale() { const b = $('tablesBox'); if (b) b.toggleAttribute('data-stale', !S.fresh.fresh); }

// ——— أفعال الوكيل: مربوطة ببصمة المخطط، بلا مزود ولا شبكة ———
globalThis.mizanSystemsAgent = B.createSystemsAgent(async () => { await checkSourceChanged(); const b = await B.bindArchitecture(S.doc, { alternativeId: S.source.id, revision: S.source.revision, inputs: S.inputs }); return b.ok ? b.project : null; });

async function boot() {
  loadSources(); const id = pickDefault();
  if (!id) return render();
  await selectSource(id);
}
boot();
// مقبض قراءة للفحص الآلي في المتصفح (لا يغيّر شيئًا بنفسه): تحويل متر المسقط إلى نقطة الشاشة، ونقاط داخل الغرف
globalThis.__mizanSystems = {
  get state() { return { source: S.source?.id, sourceHash: S.sourceHash, fresh: S.fresh, busy: S.busy, tab: S.tab, levelId: S.levelId, inputs: S.inputs, inputHash: S.result?.inputHash ?? null, status: S.result?.status ?? null }; },
  screenPoint(x, y) {
    const svg = $('plan')?.querySelector('svg'); if (!svg || !S.resultProject) return null;
    const f = B.svgFrame(S.resultProject, S.result, { levelId: S.levelId, discipline: disc(), layer: S.layer || null }); const q = f.toSvg({ x, y });
    const p = svg.createSVGPoint(); p.x = q.X; p.y = q.Y; const s = p.matrixTransform(svg.getScreenCTM()); return { x: s.x, y: s.y };
  },
  bbox(levelId = S.levelId) { const P = S.bind?.project?.architecture.rooms.filter(r => r.levelId === levelId).flatMap(r => r.polygon) || []; return P.length ? { minX: Math.min(...P.map(p => p.x)), maxX: Math.max(...P.map(p => p.x)), minY: Math.min(...P.map(p => p.y)), maxY: Math.max(...P.map(p => p.y)) } : null; },
  rooms(levelId = S.levelId) { return S.bind?.project ? S.bind.project.architecture.rooms.filter(r => r.levelId === levelId).map(r => ({ id: r.id, type: r.type, name: r.name, c: B.interiorOf(r) })) : []; },
};
