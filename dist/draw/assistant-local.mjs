// "AI understands the drawing", part 3: a deterministic Arabic (Gulf/Saudi-friendly) interpreter that works
// with no network. It READS the drawing through the digest/model and only ever PROPOSES commands;
// it never applies anything. Every proposed command list is dry-run through applyCommand on a clone
// and replaced by an Arabic error message when it would throw.
//
// interpretAr(text, doc, { selection }) ->
//   { intent: 'edit'|'query'|'unknown', answer?, commands[], needsConfirm, ambiguities: [{question, options:[{id,label}]}], referencedIds[], issues? }
// selection: an array of element ids (rooms/labels, spaces, walls, openings, fixtures) or { ids: [...] }.
//
// Deliberately refused (answered in Arabic, no commands): deleting whole rooms/walls, "delete everything",
// moving a room as a block, resizing without side+amount (an ambiguity question is returned instead),
// resizing along a wall that is shared with other rooms' walls in a way that would open the plan,
// putting a fixture in a room the catalog says it does not belong in, and anything it does not understand.
import { analyzeDoc, digestDoc, describeDigestAr, SIDES, SIDE_AR, SIDE_NAME_AR, isWindowKind } from './digest.mjs';
import { reviewDoc, summarizeIssuesAr, fixtureRect, penetration, swingSectors, swingBlockers } from './review.mjs';
import { applyCommand, DrawError, fitOpening } from './doc.mjs';
import { ROOM_TYPES, OPENING_KINDS, FIXTURES, roomTypeName, fixtureName, isDoorKind } from './catalog.mjs';
import { analyzeWalls } from './topology.mjs';
import { sub, add, mul, norm, perp, dot, dist, pointInPolygon } from './geom.mjs';

// ------------------------------------------------------------------ normalisation
/** Normalise Arabic for matching; returns { norm, map } where map[i] is the index in the original of norm[i]. */
export function normalizeWithMap(text) {
  const src = String(text ?? '');
  let out = ''; const map = [];
  for (let i = 0; i < src.length; i++) {
    let c = src[i]; const code = c.charCodeAt(0);
    if ((code >= 0x064B && code <= 0x065F) || code === 0x0670 || code === 0x0640 || code === 0x200F || code === 0x200E || code === 0x061C || code === 0x066C) continue;
    if (code >= 0x0660 && code <= 0x0669) c = String(code - 0x0660);
    else if (code >= 0x06F0 && code <= 0x06F9) c = String(code - 0x06F0);
    else if ('أإآٱ'.includes(c)) c = 'ا';
    else if (c === 'ى' || c === 'ی') c = 'ي';
    else if (c === 'ة') c = 'ه';
    else if (c === 'ؤ') c = 'و';
    else if (c === 'ئ') c = 'ي';
    else if (c === 'ک') c = 'ك';
    else if (c === '٫') c = '.';
    else c = c.toLowerCase();
    if (/[\s،؛؟?!;:"'“”«»()[\]{}\-_/\\|,]/.test(c)) c = ' ';
    if (c === '.' && !(/\d/.test(src[i - 1] || '') && /\d/.test(src[i + 1] || ''))) c = ' ';
    if (c === ' ' && (out === '' || out.endsWith(' '))) continue;
    out += c; map.push(i);
  }
  if (out.endsWith(' ')) { out = out.slice(0, -1); map.pop(); }
  return { norm: out, map, src };
}
export const normalizeAr = text => normalizeWithMap(text).norm;

const L = '[ء-ي]';
const PRE = '(?:[وف]?(?:لل|[بلك]?(?:ال)?))';
const mk = (src, flags = 'g') => new RegExp(`(?<!${L})${PRE}(?:${src})(?!${L})`, flags);
const has = (n, src) => mk(src, '').test(n);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ vocabulary (all patterns are over NORMALISED text: ة->ه ى->ي أإآ->ا)
const VERBS = Object.assign(Object.create(null),
  ...[['add', 'اضف اضيف ضيف زود ركب حط حطو سو سوي سوو اعمل ارسم'], ['desire', 'ابي ابغي ابغا ابغاه اريد بغيت ودي نبي بغينا ابيك'],
    ['remove', 'شيل ازل ازيل احذف امسح الغ الغي ازاله ازالت احذفها نزل'], ['change', 'غير بدل حول عدل خل خلي صير سمي اسمها اسمه سميها سميه سمها'],
    ['grow', 'وسع كبر زيد وسعها وسعه كبرها كبره'], ['shrink', 'صغر ضيق قلل صغرها صغره ضيقها'], ['close', 'سكر اغلق قفل اقفل سد'],
    ['move', 'حرك انقل ازح زحزح رحل'], ['thick', 'سمك ثخن'], ['review', 'راجع افحص فحص دقق تحقق']]
    .map(([cat, words]) => Object.fromEntries(words.split(' ').map(w => [w, cat]))));
const FILLER = new Set('ممكن لو سمحت من فضلك فضلك يا تكفي تكفى الله يعافيك ياخي تقدر اقدر نبي ابي ابغي ودي اريد لازم خلاص طيب اوكي الحين الان بس ياليت ان انك انت مساعد الميزان'.split(' '));
const QWORDS = new Set('كم هل ايش وش شو ماهو ماهي ما ماذا اي ايهم كيف وين اين ليش لماذا هالمخطط'.split(' '));
const isQ = tok => QWORDS.has(tok) || (/^[وف]/.test(tok) && QWORDS.has(tok.slice(1)));
const AMBIGUOUS_VERB = new Set(['ضيف', 'سد', 'نزل']);
const COMPARATIVE = new Set(['اكبر', 'اصغر', 'اضيق', 'اوسع', 'اقل']);

/** Lemmatise a token to a known verb: handles و/ف prefixes, present-tense prefixes and pronoun suffixes. */
function verbOf(tok) {
  const tryOne = t => (VERBS[t] ? t : null);
  const cands = [tok];
  if (/^[وف]/.test(tok)) cands.push(tok.slice(1));
  for (const base of [...cands]) { if (/^[تبنيا]/.test(base)) cands.push(base.slice(1)); if (/^ب[تني]/.test(base)) cands.push(base.slice(2)); }
  for (const base of [...cands]) { const m = base.match(/^(.{2,}?)(?:لي|لنا|ها|هم|ه|لها)$/); if (m) cands.push(m[1]); }
  for (const c of cands) { const v = tryOne(c); if (v) return { lemma: v, cat: VERBS[v] }; }
  return null;
}

const ROOM_ALIASES = [
  { types: ['master'], src: 'غرفه\\s+(?:ال)?نوم\\s+(?:ال)?(?:رئيسيه|ماستر)|غرفه\\s+(?:ال)?(?:رئيسيه|ماستر)|نوم\\s+(?:ال)?(?:رئيسيه|ماستر)|(?:ال)?ماستر|غرفه\\s+(?:ال)?والدين' },
  { types: ['bedroom', 'master'], src: 'غرفه\\s+(?:ال)?نوم|غرف\\s+(?:ال)?نوم|غرفه\\s+(?:ال)?(?:اطفال|ولاد|بنات)|نوم' },
  { types: ['majlis'], src: 'مجلس|مجالس|ديوانيه|ديوان' },
  { types: ['living'], src: 'صاله\\s+(?:ال)?معيشه|صاله|صالات|معيشه|ليفنق|ليفينغ|غرفه\\s+(?:ال)?جلوس|غرفه\\s+(?:ال)?معيشه' },
  { types: ['kitchen'], src: 'مطبخ|مطابخ' },
  { types: ['dining'], src: 'غرفه\\s+(?:ال)?طعام|غرفه\\s+(?:ال)?اكل|سفره' },
  { types: ['bath'], src: 'دوره\\s+(?:ال)?مياه|دورات\\s+(?:ال)?مياه|حمام|حمامات|تواليت|بيت\\s+(?:ال)?ماء' },
  { types: ['laundry'], src: 'غرفه\\s+(?:ال)?غسيل|غسيل' },
  { types: ['storage'], src: 'مخزن|مخازن|مستودع|تخزين' },
  { types: ['service'], src: 'غرفه\\s+(?:ال)?خدمه|غرفه\\s+(?:ال)?خادمه|خدمه' },
  { types: ['office'], src: 'مكتب' },
  { types: ['corridor'], src: 'ممر|ممرات|كوريدور|رواق' },
  { types: ['entrance'], src: 'مدخل|لوبي' },
  { types: ['stairs'], src: 'سلم|درج' },
  { types: ['balcony'], src: 'شرفه|بلكونه|بلكون' },
  { types: ['courtyard'], src: 'فناء|حوش|حوشي' },
  { types: ['garage'], src: 'مواقف|كراج|جراج|مراب' },
];
const FIXTURE_ALIASES = [
  { kinds: ['bed-double'], src: 'سرير\\s+(?:مزدوج|كبير|دبل|زوجي|لشخصين)' }, { kinds: ['bed-single'], src: 'سرير\\s+(?:مفرد|صغير|فردي|سنقل)' },
  { kinds: ['bed-double', 'bed-single'], src: 'سرير|سريرين|تخت', generic: 'bed' },
  { kinds: ['nightstand'], src: 'كومودينو|كمودينو|طاوله\\s+جانبيه' }, { kinds: ['wardrobe'], src: 'دولاب|دواليب|خزانه\\s+ملابس|خزانه|ويردروب' },
  { kinds: ['desk'], src: 'مكتب\\s+(?:عمل|دراسه)|طاوله\\s+مكتب' }, { kinds: ['sofa-2'], src: 'كنبه\\s+ثنائيه|كنبتين' },
  { kinds: ['sofa-3'], src: 'كنبه\\s+(?:ثلاثيه|كبيره)' }, { kinds: ['armchair'], src: 'كرسي\\s+صاله|فوتيه|كنبه\\s+مفرده' },
  { kinds: ['sofa-3', 'sofa-2'], src: 'كنبه|كنب|كنبات|صوفا|اريكه', generic: 'sofa' },
  { kinds: ['coffee-table'], src: 'طاوله\\s+(?:ال)?(?:وسط|قهوه)|ترابيزه\\s+وسط|سنتر\\s+تيبل' }, { kinds: ['tv-unit'], src: 'وحده\\s+(?:تلفزيون|تلفاز)|تلفزيون|تلفاز|تي\\s*في|شاشه' },
  { kinds: ['majlis-sofa'], src: 'جلسه\\s+عربيه|جلسه|جلسات' }, { kinds: ['dining-table'], src: 'طاوله\\s+(?:طعام|اكل|سفره)|سفره' },
  { kinds: ['kitchen-run'], src: 'وحده\\s+مطبخ|كبنت|كاونتر|خزائن\\s+مطبخ|مطبخ\\s+سفلي' }, { kinds: ['fridge'], src: 'ثلاجه|براد|فريزر' },
  { kinds: ['stove'], src: 'موقد|فرن|طباخه|بوتاجاز' }, { kinds: ['wc'], src: 'مرحاض|ايوانكي|كرسي\\s+(?:ال)?(?:حمام|تواليت)' },
  { kinds: ['basin'], src: 'مغسله(?!\\s+(?:ال)?ملابس)|حوض\\s+(?:ال)?ايدي' }, { kinds: ['shower'], src: 'دش|شاور|رشاش' },
  { kinds: ['bathtub'], src: 'بانيو|بانيوه|حوض\\s+استحمام|جاكوزي' }, { kinds: ['washing-machine'], src: 'غساله|غسالات' },
  { kinds: ['chair'], src: 'كرسي|كراسي' }, { kinds: ['rug'], src: 'سجاده|سجاد|زولي|كاربت' }, { kinds: ['plant'], src: 'نبته|نباته|زرع' },
  { kinds: ['car'], src: 'سياره|سيارات|عربيه' }, { kinds: ['tree'], src: 'شجره' },
];
const OPENING_ALIASES = [
  { kind: 'garage', src: 'باب\\s+(?:ال)?(?:مراب|كراج|جراج|سياره)' }, { kind: 'slider', src: 'باب\\s+(?:منزلق|سحاب|سلايد|زجاجي|زجاج)|سلايدر|منزلق' },
  { kind: 'door2', src: 'باب\\s+(?:مزدوج|كبير|دبل|عريض)' }, { kind: 'window2', src: 'نافذه\\s+(?:كبيره|عريضه|بانوراما)|شباك\\s+(?:كبير|عريض|بانوراما)' },
  { kind: 'window', src: 'نافذه|نافذتين|نوافذ|شباك|شبابيك|شباكين|طاقه' }, { kind: 'arch', src: 'فتحه\\s+(?:مفتوحه|بدون\\s+باب)|فتحه|قوس|عقد|ارك|بدون\\s+باب' },
  { kind: 'door', src: 'باب|بابين|ابواب|بيبان' },
];
const SIDE_WORDS = { شمال: 'n', جنوب: 's', شرق: 'e', غرب: 'w' };
const ORD = { اولي: 1, اول: 1, ثانيه: 2, ثاني: 2, ثالثه: 3, ثالث: 3, رابعه: 4, رابع: 4, خامسه: 5, خامس: 5, سادسه: 6, سادس: 6 };
const ORD_RE = '(?:ال)?(اولي|اول|ثانيه|ثاني|ثالثه|ثالث|رابعه|رابع|خامسه|خامس|سادسه|سادس)';
const LEVEL_NAMES = ['الدور الأرضي', 'الدور الأول', 'الدور الثاني', 'الدور الثالث', 'الدور الرابع', 'الدور الخامس'];
const DEICTIC = mk('هذي|هذه|هاذي|هاذه|هاي|هذا|هاذا|دي|ديه|هادي|هادا|هالغرفه|هالمكان|هالقسم|هالحجره|هالمساحه|هالنافذه|هالباب|هالجدار|هالسرير');

// ------------------------------------------------------------------ context
function buildCtx(doc, selection) {
  const model = analyzeDoc(doc), digest = digestDoc(doc, { model });
  const order = new Map(doc.labels.map((l, i) => [l.id, i]));
  const rooms = [];
  for (const lv of model.levels) for (const r of lv.rooms) {
    rooms.push({ id: r.id, name: r.name, type: r.type, area: r.area, lv, r, order: order.has(r.id) ? order.get(r.id) : 1e6 + rooms.length, nname: normalizeAr(r.name) });
  }
  rooms.sort((a, b) => a.order - b.order);
  const ids = Array.isArray(selection) ? selection : Array.isArray(selection?.ids) ? selection.ids : typeof selection === 'string' ? [selection] : selection?.id ? [selection.id] : [];
  const sel = { rooms: [], walls: [], openings: [], fixtures: [], raw: ids.filter(x => typeof x === 'string') };
  for (const id of sel.raw) {
    const room = rooms.find(r => r.id === id || r.r.spaceId === id);
    if (room) { sel.rooms.push(room); continue; }
    if (doc.walls.some(w => w.id === id)) sel.walls.push(id);
    const op = doc.openings.find(o => o.id === id);
    if (op) { sel.openings.push(id); continue; }
    const fx = doc.fixtures.find(f => f.id === id);
    if (fx) { sel.fixtures.push(id); const lv = model.levelById.get(fx.level); const rm = lv?.roomAt({ x: fx.x, y: fx.y }); if (rm) { const c = rooms.find(r => r.id === rm.id); if (c && !sel.rooms.includes(c)) sel.rooms.push(c); } }
  }
  sel.rooms = [...new Set(sel.rooms)];
  return { doc, model, digest, rooms, sel };
}

const ambiguity = (question, options) => ({ question, options });
const roomOptions = rooms => rooms.slice(0, 14).map(r => ({ id: r.id, label: `${r.name} (${roomTypeName(r.type)}، ${r2(r.area)} م²)` }));
const unknownResult = (answer, extra = {}) => ({ intent: 'unknown', answer, commands: [], needsConfirm: false, ambiguities: [], referencedIds: [], ...extra });
const answerOnly = (intent, answer, referencedIds = []) => ({ intent, answer, commands: [], needsConfirm: false, ambiguities: [], referencedIds });
const ask = (question, options, referencedIds = []) => ({ intent: 'edit', answer: question, commands: [], needsConfirm: false, ambiguities: [ambiguity(question, options)], referencedIds });

// ------------------------------------------------------------------ mention finding
function findMentions(n, ctx) {
  const cands = [];
  const push = (start, end, prio, m) => cands.push({ start, end, prio, ...m });
  for (const re of [DEICTIC]) { re.lastIndex = 0; for (const m of n.matchAll(re)) {
    // include a following generic noun ("هذي الغرفة")
    const tail = n.slice(m.index + m[0].length).match(new RegExp(`^\\s+(?:ال)?(?:غرفه|حجره|مساحه|مكان|قسم|نافذه|باب|جدار|سرير)(?!${L})`));
    push(m.index, m.index + m[0].length + (tail ? tail[0].length : 0), 0, { kind: 'selection', text: m[0], noun: tail ? tail[0].trim() : '' });
  } }
  { const re = mk('غرفه\\s+(?:ال)?(?:محدده|مختاره|اللي\\s+اخترتها)'); for (const m of n.matchAll(re)) push(m.index, m.index + m[0].length, 0, { kind: 'selection', text: m[0] }); }
  const named = [...ctx.rooms].filter(r => r.nname).sort((a, b) => b.nname.length - a.nname.length);
  for (const r of named) {
    const parts = r.nname.split(' ').map((t, i) => esc(i === 0 ? t.replace(/^ال/, '') : t.replace(/^ال/, '')));
    if (!parts[0]) continue;
    const re = mk(parts.join('\\s+(?:ال)?'));
    for (const m of n.matchAll(re)) push(m.index, m.index + m[0].length, 1, { kind: 'name', rooms: ctx.rooms.filter(x => x.nname === r.nname) });
  }
  ROOM_ALIASES.forEach((al, i) => {
    for (const m of n.matchAll(mk(al.src))) push(m.index, m.index + m[0].length, 4 + i * 0.01, { kind: 'type', types: al.types, text: m[0] });
  });
  for (const m of n.matchAll(mk('غرفه|غرف|حجره'))) push(m.index, m.index + m[0].length, 9, { kind: 'generic', text: m[0] });
  cands.sort((a, b) => a.prio - b.prio || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const taken = [];
  for (const c of cands) if (!taken.some(t => c.start < t.end && t.start < c.end)) taken.push(c);
  taken.sort((a, b) => a.start - b.start);
  // resolve each mention to candidate rooms, absorbing a following number/ordinal
  const out = [];
  for (const m of taken) {
    let rooms, end = m.end, missing = null;
    if (m.kind === 'selection') rooms = null;
    else if (m.kind === 'name') rooms = m.rooms;
    else {
      const pool = m.kind === 'type' ? ctx.rooms.filter(r => m.types.includes(r.type)) : ctx.rooms.filter(r => ['bedroom', 'master'].includes(r.type));
      const tail = n.slice(end);
      const num = tail.match(/^\s*(\d+)(?!\d)/), ord = tail.match(new RegExp(`^\\s*${ORD_RE}(?!${L})`));
      let narrowed = pool;
      if (num) { const k = num[1]; const byNum = ctx.rooms.filter(r => r.nname.split(' ').includes(k) && (m.kind === 'generic' || pool.includes(r))); if (byNum.length) { narrowed = byNum; end += num[0].length; } else if (pool.length >= +k && m.kind === 'generic') { narrowed = [pool[+k - 1]]; end += num[0].length; } }
      else if (ord) { const k = ORD[ord[1]]; if (pool.length > 1 && pool[k - 1]) { narrowed = [pool[k - 1]]; end += ord[0].length; } else if (pool.length === 1 && k === 1) { end += ord[0].length; } }
      else if (m.kind === 'generic') { narrowed = []; }
      rooms = narrowed;
      if (m.kind === 'type' && !pool.length) missing = roomTypeName(m.types[0]);
      if ((num || ord) && narrowed === pool && pool.length !== 1 && m.kind === 'type') { missing = `${roomTypeName(m.types[0])} ${(num || ord)[0].trim()}`; narrowed = []; rooms = []; }
      if (m.kind === 'generic' && !num && !ord) continue; // a bare "غرفة" is too vague to be a mention
    }
    // "مجلس النساء" must not silently become "مجلس الرجال": an unexplained qualifier makes the mention uncertain
    let qualifier = null;
    if (m.kind === 'type' && rooms && rooms.length === 1) {
      const tok = n.slice(end).match(/^\s+(\S+)/)?.[1];
      const known = /^(?:ال)?(?:شمال|جنوب|شرق|غرب|رئيس|ماستر|اول|ثاني|ثالث|رابع|خامس|ان|حال|موجود|جديد|فقط)/;
      const mention = tok && taken.some(t => t.start === end + 1);
      const stop = /^(?:ال)?(?:جدار|حائط|حايط|واجهه|نافذه|شباك|باب|غرفه|محدد|مختار|الي|اللي|اللتي|التي|الذي)/;
      if (tok && /^ال.{3,}/.test(tok) && !known.test(tok) && !stop.test(tok) && !mention && !rooms[0].nname.split(' ').some(w => w.replace(/^ال/, '') === tok.replace(/^ال/, ''))) qualifier = tok;
    }
    out.push({ ...m, end, rooms, missing, qualifier });
  }
  return out;
}

/** Resolve a mention to exactly one room or produce a clarification / failure result. */
const qty_ = m => m[1];
const defaultRoom = ctx => (ctx.sel.rooms.length === 1 ? ctx.sel.rooms[0] : ctx.rooms.length === 1 ? ctx.rooms[0] : null);
function pickRoom(m, ctx, what = 'الغرفة') {
  if (m.qualifier && m.rooms?.length === 1) return { result: ask(`لا أجد غرفة باسم «${m.text} ${m.qualifier}» بالضبط؛ هل تقصد «${m.rooms[0].name}»؟`, roomOptions(m.rooms), m.rooms.map(r => r.id)) };
  if (m.kind === 'selection') {
    if (ctx.sel.rooms.length === 1) return { room: ctx.sel.rooms[0] };
    if (ctx.sel.rooms.length > 1) return { result: ask(`حددت أكثر من غرفة؛ أي غرفة تقصد بـ«${what}»؟`, roomOptions(ctx.sel.rooms)) };
    return { result: ask(`لم تُحدَّد غرفة في الرسم؛ أي غرفة تقصد؟`, roomOptions(ctx.rooms)) };
  }
  if (m.missing) return { result: answerOnly('edit', `لا توجد في المخطط غرفة من نوع «${m.missing}» (حسب التسميات الحالية).`) };
  if (!m.rooms.length) return { result: ask('أي غرفة تقصد؟', roomOptions(ctx.rooms)) };
  if (m.rooms.length > 1) return { result: ask(`يوجد أكثر من غرفة تنطبق على «${m.text || what}»؛ أيها تقصد؟`, roomOptions(m.rooms), m.rooms.map(r => r.id)) };
  return { room: m.rooms[0] };
}

const findSide = n => {
  const m = n.match(new RegExp(`(?<!${L})(?:ال)?(شمال|جنوب)(?:ي|يه)?(?:\\s+(?:ال)?(شرق|غرب)(?:ي|يه)?)?(?!${L})`)) || n.match(new RegExp(`(?<!${L})(?:ال)?(شرق|غرب)(?:ي|يه)?(?!${L})`));
  if (!m) return null;
  const code = (SIDE_WORDS[m[1]] || '') + (m[2] ? SIDE_WORDS[m[2]] : '');
  return SIDES.includes(code) ? { side: code, index: m.index, end: m.index + m[0].length } : null;
};
function allSides(n) {
  const out = [];
  const re = new RegExp(`(?<!${L})[وف]?(?:ال)?(شمال|جنوب)(?:ي|يه)?(?:\\s+(?:ال)?(شرق|غرب)(?:ي|يه)?)?(?!${L})|(?<!${L})[وف]?(?:ال)?(شرق|غرب)(?:ي|يه)?(?!${L})`, 'g');
  for (const m of n.matchAll(re)) { const code = m[3] ? SIDE_WORDS[m[3]] : SIDE_WORDS[m[1]] + (m[2] ? SIDE_WORDS[m[2]] : ''); if (SIDES.includes(code) && !out.includes(code)) out.push(code); }
  return out;
}
const askSides = (n, what, refs = []) => { const sides = allSides(n); return sides.length > 1 ? ask(`ذكرت أكثر من جهة؛ على أي جدار تريد ${what}؟`, sides.map(c => ({ id: c, label: sideLabel(c) })), refs) : null; };
const askRooms = (mentions, ctx, what) => {
  const list = [...new Map(mentions.filter(m => m.kind !== 'generic').flatMap(m => (m.kind === 'selection' ? ctx.sel.rooms : m.rooms || [])).map(r => [r.id, r])).values()];
  return list.length > 1 ? ask(`ذكرت أكثر من غرفة؛ في أي غرفة تريد ${what}؟`, roomOptions(list), list.map(r => r.id)) : null;
};
function findOpeningKind(n) { for (const a of OPENING_ALIASES) { const m = n.match(mk(a.src, '')); if (m) return { kind: a.kind, index: m.index, end: m.index + m[0].length }; } return null; }
function findFixture(n) { for (const a of FIXTURE_ALIASES) { const m = n.match(mk(a.src, '')); if (m) return { ...a, index: m.index, end: m.index + m[0].length }; } return null; }
const blank = (n, mentions) => { let out = n; for (const m of mentions) out = out.slice(0, m.start) + ' '.repeat(m.end - m.start) + out.slice(m.end); return out; };
function findAmount(n) {
  let m = n.match(/(\d+(?:\.\d+)?)\s*(سم|سنتي|سنتيمتر|سنتمتر|cm|ملم|مم|م|متر|امتار)(?![ء-ي\d])/) || n.match(/(\d+(?:\.\d+)?)\s*()(?![ء-ي\d])/);
  if (m) {
    const v = parseFloat(m[1]), u = m[2];
    if (u === 'سم' || u === 'سنتي' || u === 'سنتيمتر' || u === 'سنتمتر' || u === 'cm') return { meters: v / 100, explicit: true };
    if (u === 'ملم' || u === 'مم') return { meters: v / 1000, explicit: true };
    if (u) return { meters: v, explicit: true };
    return { meters: v > 3 ? v / 100 : v, explicit: false, bare: v };
  }
  if (/(?<![ء-ي])مترين(?![ء-ي])/.test(n)) return { meters: 2, explicit: true };
  if (/متر\s+و\s*(?:نص|نصف)/.test(n)) return { meters: 1.5, explicit: true };
  if (/(?:نص|نصف)\s+متر/.test(n)) return { meters: 0.5, explicit: true };
  if (/ربع\s+متر/.test(n)) return { meters: 0.25, explicit: true };
  if (/(?<![ء-ي])متر(?![ء-ي])/.test(n)) return { meters: 1, explicit: true };
  return null;
}

// ------------------------------------------------------------------ geometry for placement
const posOnWall = (wall, p) => dot(sub(p, wall.a), norm(sub(wall.b, wall.a)));
const longest = list => list.reduce((m, e) => (!m || e.length > m.length ? e : m), null);
const wallOfEdge = (ctx, edge) => ctx.doc.walls.find(w => w.id === edge.wallIds[0]);
const edgeMid = e => mul(add(e.a, e.b), 0.5);

function sectorPolygon(sec) {
  const pts = [sec.hinge];
  for (let deg = 0; deg <= 90; deg += 15) { const a = deg * Math.PI / 180; pts.push(add(sec.hinge, add(mul(sec.closed, Math.cos(a) * sec.r), mul(sec.side, Math.sin(a) * sec.r)))); }
  return pts;
}
const insideNet = (p, room) => pointInPolygon(p, room.r.net, 1e-9) && !room.r.space.holes.some(h => pointInPolygon(p, h, 1e-9));

/** Free-space search: a position and rotation for a fixture inside a room (back to a wall for wall-hugging kinds). */
export function placeFixture(ctx, room, kind) {
  const def = FIXTURES[kind], doc = ctx.doc, lv = room.lv, net = room.r.net;
  const solids = doc.fixtures.filter(f => f.level === lv.level.id && f.h >= 0.1 && f.kind !== 'rug').map(f => fixtureRect(f, 0.02));
  const zones = [];
  for (const op of lv.openings) {
    if (!op.sides.some(s => s.room.id === room.id)) continue;
    for (const sec of swingSectors(op)) zones.push(sectorPolygon(sec));
    if (op.door) { // keep a strip clear in front of every door-type opening
      const half = op.w / 2, a = add(op.p, mul(op.u, -half)), b = add(op.p, mul(op.u, half)), d = mul(op.n, 0.6);
      zones.push([sub(a, d), sub(b, d), add(b, d), add(a, d)]);
    } else if (op.window && def.h > 0.9) { // tall pieces must not stand in front of a window
      const half = op.w / 2, a = add(op.p, mul(op.u, -half)), b = add(op.p, mul(op.u, half)), d = mul(op.n, 0.5);
      zones.push([sub(a, d), sub(b, d), add(b, d), add(a, d)]);
    }
  }
  const columns = (doc.columns || []).filter(c => c.level === lv.level.id).map(c => [{ x: c.x - c.size / 2, y: c.y - c.size / 2 }, { x: c.x + c.size / 2, y: c.y - c.size / 2 }, { x: c.x + c.size / 2, y: c.y + c.size / 2 }, { x: c.x - c.size / 2, y: c.y + c.size / 2 }]);
  const doorsAt = lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === room.id)).map(op => op.p);
  const beds = doc.fixtures.filter(f => f.level === lv.level.id && f.kind.startsWith('bed'));
  const valid = f => {
    const rect = fixtureRect(f);
    if (!rect.every(p => insideNet(p, room)) || !insideNet({ x: f.x, y: f.y }, room)) return false;
    if (f.h < 0.1) return true;
    if (solids.some(s => penetration(rect, s) > 0.01)) return false;
    if (zones.some(z => penetration(rect, z) > 0.01)) return false;
    if (columns.some(c => penetration(rect, c) > 0.01)) return false;
    return true;
  };
  const HUG = !['coffee-table', 'dining-table', 'rug', 'plant', 'chair', 'tree'].includes(kind);
  const found = [];
  const make = (x, y, rot) => ({ kind, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, rot, w: def.w, d: def.d, h: def.h });
  const score = f => {
    const dd = doorsAt.length ? Math.min(...doorsAt.map(p => dist(p, f))) : 3;
    let s = 0.5 * Math.min(dd, 4);
    if (kind === 'nightstand' && beds.length) s = -Math.min(...beds.map(b => dist(b, f))) * 2;
    if (!HUG) s = -dist(f, room.r.inside) * 2;
    return s;
  };
  if (HUG) {
    const poly = net, n = poly.length;
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n], len = dist(p, q);
      const u = norm(sub(q, p)), out = { x: u.y, y: -u.x };
      if (Math.abs(out.x) > 1e-3 && Math.abs(out.y) > 1e-3) continue; // axis-aligned walls only
      if (len < def.w + 0.1) continue;
      const rot = Math.atan2(-out.x, -out.y), swap = Math.abs(Math.sin(rot)) > 0.5;
      const along = swap ? def.d : def.w, deep = swap ? def.w : def.d; // extents along the wall / away from it after rotation
      for (let t = along / 2 + 0.03; t <= len - along / 2 - 0.03 + 1e-9; t += 0.1) {
        const c = add(add(p, mul(u, t)), mul(out, -(deep / 2 + 0.02)));
        const f = make(c.x, c.y, Math.abs(rot + Math.PI) < 1e-6 ? Math.PI : Math.round(rot * 1e6) / 1e6);
        if (valid(f)) found.push({ f, s: score(f) });
      }
    }
  }
  if (!found.length) {
    const b = room.r.space.bounds;
    for (const rot of [0, Math.PI / 2]) for (let x = b.x0 + 0.2; x <= b.x1 - 0.2; x += 0.2) for (let y = b.y0 + 0.2; y <= b.y1 - 0.2; y += 0.2) {
      const f = make(x, y, rot);
      if (valid(f)) found.push({ f, s: -dist(f, room.r.inside) });
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => b.s - a.s || a.f.y - b.f.y || a.f.x - b.f.x);
  return found[0].f;
}

// ------------------------------------------------------------------ handlers
const SIDE_WALL = { n: 'الشمالي', ne: 'الشمالي الشرقي', e: 'الشرقي', se: 'الجنوبي الشرقي', s: 'الجنوبي', sw: 'الجنوبي الغربي', w: 'الغربي', nw: 'الشمالي الغربي' };
const sideLabel = s => `الجدار ${SIDE_WALL[s]}`;

function queryHandler(n, ctx, mentions) {
  const { doc, digest, rooms } = ctx;
  const selRooms = m => (m.kind === 'selection' ? ctx.sel.rooms : m.rooms || []);
  const uncertain = mentions.find(m => m.qualifier && m.rooms?.length === 1);
  if (uncertain) { const q = `لا أجد غرفة باسم «${uncertain.text} ${uncertain.qualifier}» بالضبط؛ هل تقصد «${uncertain.rooms[0].name}»؟`; return { intent: 'query', answer: q, commands: [], needsConfirm: false, ambiguities: [ambiguity(q, roomOptions(uncertain.rooms))], referencedIds: [] }; }
  const mentioned = mentions.flatMap(selRooms);
  const refs = mentioned.map(r => r.id);
  const side = findSide(n);
  const roomFor = list => list.length ? list : null;
  const typeWord = mentions.find(m => m.kind === 'type');
  const levelRooms = rooms;
  const selM = mentions.find(m => m.kind === 'selection' && !/نافذه|باب|جدار|سرير/.test(m.noun || ''));
  if (selM && ctx.sel.rooms.length !== 1) {
    const q = ctx.sel.rooms.length ? 'حددت أكثر من غرفة؛ أيها تقصد؟' : 'لم تُحدَّد غرفة في الرسم؛ أي غرفة تقصد؟';
    return { intent: 'query', answer: q, commands: [], needsConfirm: false, ambiguities: [ambiguity(q, roomOptions(ctx.sel.rooms.length ? ctx.sel.rooms : ctx.rooms))], referencedIds: [] };
  }
  const noRoomMsg = () => mentions.some(m => m.missing) ? answerOnly('query', `لا توجد في المخطط غرفة من نوع «${mentions.find(m => m.missing).missing}».`) : null;

  if (has(n, 'ناقص|مشاكل|مشكله|ملاحظات|اخطاء|عيوب|غلط|راجع|افحص|فحص|دقق|تحقق') && !mentioned.length) {
    const issues = reviewDoc(doc, { model: ctx.model, digest });
    return { ...answerOnly('query', summarizeIssuesAr(issues)), issues };
  }
  if (has(n, 'لخص|وصف|اوصف|عرفني|ملخص|تقرير') || /ايش\s+(?:في|عندي)\s+(?:ال)?(?:مخطط|رسم|بيت)/.test(n)) return answerOnly('query', describeDigestAr(digest));
  if (has(n, 'اكبر|اصغر|اوسع|اضيق')) {
    const small = /(اصغر|اضيق)/.test(n);
    let pool = rooms; if (typeWord && !mentions.some(m => m.rooms?.length > 1 && false)) pool = rooms.filter(r => typeWord.types.includes(r.type));
    if (!pool.length) return noRoomMsg() || answerOnly('query', 'لا توجد غرف مطابقة في المخطط.');
    const best = [...pool].sort((a, b) => small ? a.area - b.area : b.area - a.area)[0];
    return answerOnly('query', `${small ? 'أصغر' : 'أكبر'} ${typeWord ? roomTypeName(typeWord.types[0]) : 'غرفة'} هي «${best.name}» بمساحة ${r2(best.area)} م².`, [best.id]);
  }
  if (has(n, 'نافذه|نوافذ|شباك|شبابيك')) {
    const yn = has(n, 'هل');
    if (mentioned.length) {
      const dr = id => digest.levels.flatMap(l => l.rooms).find(r => r.id === id);
      const uniq = [...new Set(mentioned)];
      if (yn) return answerOnly('query', uniq.map(r => { const c = dr(r.id).windows.count; return c ? `نعم، «${r.name}» فيها ${c} ${c === 1 ? 'نافذة' : 'نوافذ'} على الخارج (${r2(dr(r.id).windows.totalArea)} م²).` : `لا، «${r.name}» ليس لها نافذة على الخارج.`; }).join(' '), refs);
      return answerOnly('query', uniq.map(r => `عدد نوافذ «${r.name}» ${dr(r.id).windows.count}.`).join(' '), refs);
    }
    if (noRoomMsg()) return noRoomMsg();
    if (side) {
      const ids = new Set();
      for (const lv of ctx.model.levels) for (const op of lv.openings) if (op.window && op.sides.some(s => s.exterior && s.compass === side.side)) ids.add(op.id);
      return answerOnly('query', `عدد النوافذ في الواجهة ${SIDE_AR[side.side]} ${ids.size}.`, [...ids]);
    }
    return answerOnly('query', `إجمالي النوافذ في المخطط ${digest.counts.windows}.`);
  }
  if (has(n, 'باب|ابواب')) {
    if (/(?<![ء-ي])بين(?![ء-ي])/.test(n) && mentioned.length >= 2) {
      const [a, b] = mentioned;
      const conns = a.lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === a.id && s.other === b.id));
      return answerOnly('query', conns.length ? `نعم، يوجد ${conns.length} باب/فتحة بين «${a.name}» و«${b.name}».` : `لا يوجد باب مباشر بين «${a.name}» و«${b.name}».`, [a.id, b.id, ...conns.map(c => c.id)]);
    }
    if (mentioned.length) return answerOnly('query', [...new Set(mentioned)].map(r => { const d = digest.levels.flatMap(l => l.rooms).find(x => x.id === r.id).doors; return `«${r.name}» فيها ${d.length} ${d.length === 1 ? 'باب/فتحة' : 'أبواب/فتحات'}.`; }).join(' '), refs);
    return answerOnly('query', `عدد الأبواب ${digest.counts.doors}، والفتحات المفتوحة ${digest.counts.openArches}.`);
  }
  if (has(n, 'ابعاد|طول|عرض|قياس|مقاس|قياسات|مقاسات') && mentioned.length) {
    const dr = id => digest.levels.flatMap(l => l.rooms).find(r => r.id === id);
    return answerOnly('query', [...new Set(mentioned)].map(r => `أبعاد «${r.name}» نحو ${dr(r.id).size[0]} × ${dr(r.id).size[1]} م (أصغر مستطيل يحيط بها).`).join(' '), refs);
  }
  if (has(n, 'مساح[ء-ي]*|حجم') || (has(n, 'كم') && has(n, 'متر'))) {
    if (mentioned.length) return answerOnly('query', [...new Set(mentioned)].map(r => `مساحة «${r.name}» الصافية ${r2(r.area)} م².`).join(' '), refs);
    if (noRoomMsg()) return noRoomMsg();
    if (has(n, 'ارض|قطعه')) return answerOnly('query', digest.totals.plotArea ? `مساحة الأرض ${digest.totals.plotArea} م²، ونسبة البناء الحالية ${r1(digest.totals.coverageRatio * 100)}٪.` : 'لم تُحدَّد أرض في المشروع بعد.');
    const net = Object.values(digest.totals.netRoomArea).reduce((s, v) => s + v, 0);
    return answerOnly('query', `مساحة المسقط ${digest.totals.footprintArea} م² (بالجدران)، ومجموع المساحات الصافية للغرف ${r2(net)} م².`);
  }
  if (has(n, 'غرفه|غرف|حمام|حمامات|دور|ادوار|سرير|اسره|مطبخ') && has(n, 'كم')) {
    if (has(n, 'دور|ادوار')) return answerOnly('query', `عدد الأدوار ${doc.levels.length}.`);
    if (typeWord) { const c = rooms.filter(r => typeWord.types.includes(r.type)); return answerOnly('query', `عدد الغرف من نوع «${roomTypeName(typeWord.types[0])}»: ${c.length}${c.length ? ' (' + c.map(r => r.name).join('، ') + ')' : ''}.`, c.map(r => r.id)); }
    return answerOnly('query', `عدد الغرف ${levelRooms.length}.`);
  }
  if (has(n, 'مدخل|وين\\s+ادخل|بوابه') && has(n, 'وين|اين|هل')) {
    const e = digest.levels[0]?.circulation.entryRooms || [];
    return answerOnly('query', e.length ? `المدخل يؤدي إلى: ${e.map(id => rooms.find(r => r.id === id)?.name || id).join('، ')}.` : 'لا يوجد باب للخارج في المخطط بعد.', e);
  }
  if (has(n, 'كيف\\s+اوصل|طريق|مسار') && mentioned.length) {
    const r = mentioned[0], hit = r.lv.reach.get(r.id);
    return answerOnly('query', hit ? `المسار من المدخل إلى «${r.name}» يمر بـ${hit.doors} ${hit.doors === 1 ? 'باب' : 'أبواب'}: ${hit.path.map(id => rooms.find(x => x.id === id)?.name || id).join(' ← ')}.` : `لا يوجد مسار من المدخل إلى «${r.name}» عبر الأبواب.`, [r.id]);
  }
  if (side && has(n, 'غرف|غرفه|واجهه|مطل')) {
    const list = rooms.filter(r => r.r.edges.some(e => e.exterior && e.side === side.side));
    return answerOnly('query', list.length ? `الغرف ذات جدار خارجي ${SIDE_WALL[side.side]}: ${list.map(r => r.name).join('، ')}.` : `لا غرف لها جدار خارجي ${SIDE_WALL[side.side]}.`, list.map(r => r.id));
  }
  return null;
}

function changeTypeHandler(n, ctx, mentions, orig) {
  const quoted = (() => { const q = orig.src.match(/[«"“]([^»"”]{1,60})[»"”]/); return q ? q[1].trim() : null; })();
  const verbRename = has(n, 'سمي|سميها|سميه|اسمها|اسمه|سمها');
  const rooms = mentions.filter(m => m.kind !== 'generic');
  const typesOf = m => (m.kind === 'type' ? m.types : m.kind === 'name' && m.rooms.length === 1 ? [m.rooms[0].type] : null);
  const typeOnly = m => !!typesOf(m);
  let targetM = null, newType = null;
  if (rooms.length >= 2) { targetM = rooms.find(m => m.kind === 'selection') || rooms[0]; const after = rooms.filter(m => m !== targetM && typeOnly(m) && m.start > targetM.start); newType = after[after.length - 1] || null; }
  else if (rooms.length === 1) {
    const m = rooms[0], before = n.slice(0, m.start);
    const asNewType = typeOnly(m) && /(?:^|\s)(?:الي|ل|صير|تصير|يصير|تكون|يكون|خل|خلي)\s*$/.test(before) && (ctx.sel.rooms.length || ctx.rooms.length === 1);
    if (asNewType) { newType = m; targetM = { kind: 'selection' }; }
    else if (typeOnly(m) && /(?:^|\s)(?:الي|صير|تصير|يصير|تكون|يكون)\s*$/.test(before)) return ask(`أي غرفة تريد تحويلها إلى ${roomTypeName(typesOf(m)[0])}؟`, roomOptions(ctx.rooms));
    else targetM = m;
  }
  if (!targetM) return ask('أي غرفة تريد تغييرها؟', roomOptions(ctx.rooms));
  if (!newType && !quoted && !verbRename) {
    return ask(`إلى أي نوع تريد تغيير ${targetM.kind === 'selection' ? 'الغرفة' : 'هذه الغرفة'}؟`, Object.entries(ROOM_TYPES).filter(([k]) => k !== 'other').map(([k, v]) => ({ id: k, label: v.ar })));
  }
  const pick = pickRoom(targetM, ctx);
  if (pick.result) return pick.result;
  const room = pick.room;
  let type = null, name = quoted;
  const renameOnly = has(n, 'اسم|تسميه');
  if (newType && renameOnly && !quoted) { // "غير اسم المجلس الى ديوانية": the user's own word is the new name
    name = orig.src.slice(orig.map[newType.start] ?? 0, (orig.map[newType.end - 1] ?? orig.src.length - 1) + 1).replace(/^(?:[وف]?(?:لل|[بلك]?(?:ال)?))/, '').trim() || null;
  } else if (newType) { type = typesOf(newType)[0]; name = name || ROOM_TYPES[type].ar; }
  if (!type && !name && verbRename) {
    // سمي هذي الغرفة غرفة الضيوف  (free text after the target)
    const rest = orig.src.slice(orig.map[Math.min(targetM.end ?? 0, orig.map.length - 1)] ?? orig.src.length).replace(/^[\s:،-]*(?:باسم|اسم|ب|إلى|الى)?\s*/, '').trim();
    if (rest) name = rest.slice(0, 60);
  }
  if (!type && !name) return ask('ما الاسم الجديد للغرفة؟', Object.entries(ROOM_TYPES).filter(([k]) => k !== 'other').map(([k, v]) => ({ id: k, label: v.ar })), [room.id]);
  if ((type || room.type) === room.type && (name || room.name) === room.name) return answerOnly('edit', `«${room.name}» هي بالفعل ${roomTypeName(room.type)}؛ لا تغيير مطلوب.`, [room.id]);
  const commands = room.r.label
    ? [{ type: 'update', id: room.r.label.id, patch: { ...(type ? { type } : {}), ...(name ? { name } : {}) } }]
    : [{ type: 'add-label', level: room.lv.level.id, name: name || ROOM_TYPES[type].ar, roomType: type || 'other', seed: room.r.inside }];
  const bits = [];
  if (type && type !== room.type) bits.push(`نوعها ${roomTypeName(type)}`);
  if (name && name !== room.name) bits.push(`اسمها «${name}»`);
  return { intent: 'edit', answer: `سأجعل «${room.name}»: ${bits.join(' و')}.`, commands, needsConfirm: false, ambiguities: [], referencedIds: [room.id] };
}

/** Which edge of `room` (and which wall) is meant by a side, or a clarification. */
function chooseEdge(room, side, { exteriorOnly = false } = {}) {
  let edges = room.r.edges.filter(e => (!side || e.side === side) && (!exteriorOnly || e.exterior));
  return edges;
}

function addOpeningHandler(n, ctx, mentions, opening, phrase) {
  const kind = opening.kind;
  const side = findSide(n);
  const ofRooms = mentions.filter(m => m.kind !== 'generic');
  const between = /(?<![ء-ي])بين(?![ء-ي])/.test(n) && ofRooms.length >= 2;
  const qty = n.match(/(\d+)\s*(?:ال)?(?:نوافذ|شبابيك|ابواب|نافذه|شباك|باب)/);
  if ((qty && +qty[1] > 1) || has(n, 'نافذتين|شباكين|بابين|ثلاث\\s+نوافذ|ثلاثه\\s+ابواب')) return answerOnly('edit', 'أقترح عنصرًا واحدًا في كل طلب؛ اطلب كل نافذة أو باب على حدة مع تحديد الجدار.');
  const sidesAmb = askSides(n, OPENING_KINDS[kind].ar); if (sidesAmb) return sidesAmb;
  if (!between) { const roomsAmb = askRooms(mentions, ctx, 'إضافة ' + OPENING_KINDS[kind].ar); if (roomsAmb) return roomsAmb; }
  const isWin = isWindowKind(kind);
  const picks = [];
  for (const m of between ? ofRooms.slice(0, 2) : ofRooms.slice(0, 1)) { const p = pickRoom(m, ctx); if (p.result) return p.result; picks.push(p.room); }
  if (!picks.length) {
    if (defaultRoom(ctx) && !between) picks.push(defaultRoom(ctx));
    else return ask(`في أي غرفة تريد إضافة ${OPENING_KINDS[kind].ar}؟`, roomOptions(isWin ? ctx.rooms.filter(r => r.r.edges.some(e => e.exterior)) : ctx.rooms));
  }
  let edge, wall, room = picks[0], refs = picks.map(r => r.id);
  if (picks.length === 2) {
    const [a, b] = picks;
    if (a.lv !== b.lv) return answerOnly('edit', 'الغرفتان في دورين مختلفين.', refs);
    const shared = a.r.edges.filter(e => e.space && e.space === b.r.spaceId);
    if (!shared.length) return answerOnly('edit', `«${a.name}» و«${b.name}» لا تتشاركان جدارًا، فلا يمكن وضع ${OPENING_KINDS[kind].ar} بينهما.`, refs);
    edge = longest(shared);
    const existing = a.lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === a.id && s.other === b.id));
    if (isDoorKind(kind) && existing.length && !has(n, 'ثاني|اخر|زياده|كمان')) return answerOnly('edit', `يوجد بالفعل ${existing.length === 1 ? 'باب/فتحة' : 'أكثر من باب'} بين «${a.name}» و«${b.name}» (${existing.map(e => e.id).join('، ')}).`, [...refs, ...existing.map(e => e.id)]);
  } else {
    let edges = chooseEdge(room, side && side.side, { exteriorOnly: isWin && !side });
    if (side && !edges.length) return answerOnly('edit', `«${room.name}» ليس لها جدار ${SIDE_WALL[side.side]}.`, refs);
    if (!edges.length) return answerOnly('edit', `«${room.name}» ليس لها جدار خارجي لتركيب ${OPENING_KINDS[kind].ar}.`, refs);
    if (!side && edges.length > 1) {
      const bySide = [...new Set(edges.map(e => e.side))];
      if (bySide.length > 1) return ask(`على أي جدار من «${room.name}» تريد ${OPENING_KINDS[kind].ar}؟`, bySide.map(s => ({ id: s, label: `${sideLabel(s)} (${r1(longest(edges.filter(e => e.side === s)).length)} م)` })), refs);
    }
    if (!isWin && !side) {
      // a door/arch without a side: only unambiguous with a single candidate wall
      const bySide = [...new Set(room.r.edges.map(e => e.side))];
      if (bySide.length > 1) return ask(`على أي جدار من «${room.name}» تريد ${OPENING_KINDS[kind].ar}، أو بينها وبين أي غرفة؟`, room.r.edges.filter(e => e.space).map(e => { const o = ctx.rooms.find(r => r.r.spaceId === e.space); return { id: o.id, label: `بين «${room.name}» و«${o.name}»` }; }).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).concat(bySide.map(s => ({ id: s, label: sideLabel(s) }))).slice(0, 12), refs);
    }
    edge = longest(edges);
  }
  wall = wallOfEdge(ctx, edge);
  if (!wall) return answerOnly('edit', 'تعذر تحديد الجدار.', refs);
  let at = Math.round(posOnWall(wall, edgeMid(edge)) * 1000) / 1000;
  try { at = Math.round(fitOpening(ctx.doc, wall, at, OPENING_KINDS[kind].w) * 1000) / 1000; } catch (e) { if (e instanceof DrawError) return answerOnly('edit', e.message, refs); throw e; }
  const cmd = { type: 'add-opening', wall: wall.id, kind, at };
  if (kind === 'door' || kind === 'door2') {
    // let the door open into the more private room (the left side of a->b is the 'in' side)
    const rank = { bath: 5, bedroom: 5, master: 5, office: 4, storage: 4, laundry: 4, service: 4, kitchen: 3, dining: 3, majlis: 2, living: 2, corridor: 1, entrance: 0 };
    const u = norm(sub(wall.b, wall.a)), left = perp(u), mid = edgeMid(edge);
    const lr = room.lv.roomAt(add(mid, mul(left, wall.t / 2 + 0.2))), rr = room.lv.roomAt(add(mid, mul(left, -(wall.t / 2 + 0.2))));
    const sc = r => (r ? (rank[r.type] ?? 1) : 6); // outside is "private" for exterior doors only when nothing else
    if (lr || rr) cmd.swing = (lr && rr) ? (sc(lr) >= sc(rr) ? 'in' : 'out') : (lr ? 'in' : 'out');
    if (!(lr && rr)) cmd.entry = false;
  }
  const refsAll = [...refs, wall.id];
  const where = picks.length === 2 ? `بين «${picks[0].name}» و«${picks[1].name}»` : `في ${side ? sideLabel(side.side) + ' ل' : ''}«${room.name}»`;
  return { intent: 'edit', answer: `سأضيف ${OPENING_KINDS[kind].ar} ${where} على الجدار ${wall.id} عند ${r2(at)} م من بدايته.`, commands: [cmd], needsConfirm: false, ambiguities: [], referencedIds: refsAll, _postOpening: true };
}

function addFixtureHandler(n, ctx, mentions, fx) {
  const ofRooms = mentions.filter(m => m.kind !== 'generic' && !(m.start >= fx.index && m.end <= fx.end + 0));
  const roomsAmb = askRooms(ofRooms, ctx, 'وضع ' + (fx.generic ? 'القطعة' : fixtureName(fx.kinds[0]))); if (roomsAmb) return roomsAmb;
  const qtyF = n.match(/(\d+)\s*(?:ال)?(?:سرير|اسره|كنب|دولاب|كراسي|كرسي)/);
  if (qtyF && +qty_(qtyF) > 1) return answerOnly('edit', 'أقترح قطعة واحدة في كل طلب؛ اطلب كل قطعة على حدة.');
  let room;
  if (ofRooms.length) { const p = pickRoom(ofRooms[ofRooms.length - 1], ctx); if (p.result) return p.result; room = p.room; }
  else if (defaultRoom(ctx)) room = defaultRoom(ctx);
  else return ask(`في أي غرفة تريد وضع ${fx.generic ? (fx.generic === 'bed' ? 'السرير' : 'الكنب') : fixtureName(fx.kinds[0])}؟`, roomOptions(ctx.rooms));
  let kind = fx.kinds[0];
  if (fx.generic === 'bed') kind = room.type === 'master' || room.area >= 12 ? 'bed-double' : 'bed-single';
  if (fx.generic === 'sofa') kind = room.area >= 12 ? 'sofa-3' : 'sofa-2';
  const def = FIXTURES[kind];
  if (def.rooms.length && !def.rooms.includes(room.type) && !(room.type === 'master' && def.rooms.includes('bedroom'))) {
    return answerOnly('edit', `${def.ar} لا يُوضع عادةً في ${roomTypeName(room.type)} حسب الكتالوج (المناسب: ${def.rooms.map(roomTypeName).join('، ')}). لم أقترح شيئًا.`, [room.id]);
  }
  const spot = placeFixture(ctx, room, kind);
  if (!spot) return answerOnly('edit', `لا توجد مساحة حرة تكفي ${def.ar} (${def.w}×${def.d} م) داخل «${room.name}» دون سدّ الأبواب أو التداخل مع غيره.`, [room.id]);
  return { intent: 'edit', answer: `سأضع ${def.ar} داخل «${room.name}» في أقرب موضع حرّ صالح (${r2(spot.x)}، ${r2(spot.y)}).${fx.generic ? ` اخترت ${def.ar} بحسب مساحة الغرفة؛ غيّر النوع إن أردت.` : ''}`, commands: [{ type: 'add-fixture', level: room.lv.level.id, kind, x: spot.x, y: spot.y, rot: spot.rot }], needsConfirm: false, ambiguities: [], referencedIds: [room.id] };
}

function removeHandler(n, ctx, mentions, opening, fx) {
  const all = has(n, 'كل|جميع|كامل');
  const side = findSide(n);
  if (/(?<![ء-ي])(كل\s+شي|كل\s+شيء|كله|الكل|المخطط|الرسم|كل\s+الغرف)(?![ء-ي])/.test(n) && !opening && !fx) return answerOnly('edit', 'لا أنفذ حذفًا شاملًا. حدّد عنصرًا واحدًا (نافذة أو باب أو قطعة أثاث) وسأقترح حذفه.');
  if (!opening && !fx) return answerOnly('edit', 'حذف الغرف أو الجدران لا أقترحه آليًا. حدّد نافذة أو بابًا أو قطعة أثاث لأحذفها، أو عدّل الجدران يدويًا.');
  const deictic = mentions.find(m => m.kind === 'selection');
  const ofRooms = mentions.filter(m => m.kind !== 'generic' && m.kind !== 'selection' || (m.kind === 'selection' && m.noun === 'غرفه'));
  // an explicitly selected element of the right kind
  if (deictic && !ofRooms.length) {
    const cand = opening ? ctx.sel.openings.filter(id => { const o = ctx.doc.openings.find(x => x.id === id); return opening.kind === 'window' || opening.kind === 'window2' ? isWindowKind(o.kind) : !isWindowKind(o.kind); }) : ctx.sel.fixtures.filter(id => fx.kinds.includes(ctx.doc.fixtures.find(f => f.id === id).kind));
    if (cand.length) return { intent: 'edit', answer: `سأحذف ${cand.length === 1 ? 'العنصر المحدد' : 'العناصر المحددة'} (${cand.join('، ')}).`, commands: [{ type: 'delete', ids: cand }], needsConfirm: true, ambiguities: [], referencedIds: cand };
  }
  const roomsIn = [];
  for (const m of mentions.filter(x => x.kind !== 'generic')) { const p = pickRoom(m, ctx); if (p.result) return p.result; roomsIn.push(p.room); }
  if (!roomsIn.length && defaultRoom(ctx)) roomsIn.push(defaultRoom(ctx));
  if (!roomsIn.length) return ask(`من أي غرفة تريد حذف ${opening ? OPENING_KINDS[opening.kind].ar : fixtureName(fx.kinds[0])}؟`, roomOptions(ctx.rooms));
  const room = roomsIn[0], other = roomsIn[1];
  let found = [];
  if (opening) {
    const group = isWindowKind(opening.kind) ? isWindowKind : (k => !isWindowKind(k));
    found = room.lv.openings.filter(op => group(op.kind) && (opening.kind === 'arch' ? op.kind === 'arch' : opening.kind === 'door' || opening.kind === 'window' ? true : op.kind === opening.kind) && op.sides.some(s => s.room.id === room.id) && (!other || op.sides.some(s => s.room.id === other.id)) && (!side || op.sides.some(s => s.room.id === room.id && s.compass === side.side)));
    if (opening.kind === 'door') found = found.filter(op => op.kind !== 'arch');
  } else {
    found = ctx.doc.fixtures.filter(f => f.level === room.lv.level.id && fx.kinds.includes(f.kind) && room.lv.roomAt({ x: f.x, y: f.y })?.id === room.id).map(f => ({ id: f.id, kind: f.kind, f }));
  }
  const nameOf = o => opening ? `${OPENING_KINDS[o.kind].ar} ${o.id}${o.sides?.find(s => s.room.id === room.id) ? ' على الجدار ' + SIDE_WALL[o.sides.find(s => s.room.id === room.id).compass] : ''} (عرض ${r2(o.w)} م)` : `${fixtureName(o.kind)} ${o.id}`;
  const what = opening ? OPENING_KINDS[opening.kind].ar : fixtureName(fx.kinds[0]);
  if (!found.length) return answerOnly('edit', `لا يوجد ${what} في «${room.name}"${other ? ' وبينها وبين «' + other.name + '»' : ''}.`.replace('"', '»'), [room.id]);
  if (found.length > 1 && !all) return ask(`في «${room.name}» أكثر من ${what}؛ أيها تريد حذفه؟`, found.slice(0, 12).map(o => ({ id: o.id, label: nameOf(o) })), [room.id, ...found.map(o => o.id)]);
  return { intent: 'edit', answer: `سأحذف ${found.map(nameOf).join('، ')} من «${room.name}».`, commands: [{ type: 'delete', ids: found.map(o => o.id) }], needsConfirm: true, ambiguities: [], referencedIds: [room.id, ...found.map(o => o.id)] };
}

function thicknessHandler(n, ctx, mentions) {
  const amount = findAmount(blank(n, mentions));
  const side = findSide(n);
  const doc = ctx.doc;
  let walls = null, desc = '', refs = [];
  const exteriorIds = new Set(ctx.model.levels.flatMap(lv => [...lv.analysis.exteriorEdges].flatMap(id => lv.analysis.edges.find(e => e.id === id).wallIds)));
  const ofRooms = mentions.filter(m => m.kind !== 'generic');
  { const a = askRooms(mentions, ctx, 'تغيير سماكة الجدران') || (allSides(n).length > 1 ? askSides(n, 'تغيير السماكة') : null); if (a) return a; }
  if (has(n, 'خارجي|خارجيه') && !ofRooms.length) { walls = doc.walls.filter(w => exteriorIds.has(w.id)); desc = 'الجدران الخارجية'; }
  else if (has(n, 'داخلي|داخليه') && !ofRooms.length) { walls = doc.walls.filter(w => !exteriorIds.has(w.id)); desc = 'الجدران الداخلية'; }
  else if (/(?<![ء-ي])(كل|جميع)\s+(?:ال)?جدران/.test(n) || has(n, 'جدران\\s+(?:ال)?(?:كل|جميع)')) { walls = [...doc.walls]; desc = 'كل الجدران'; }
  else if (ofRooms.length) {
    const p = pickRoom(ofRooms[0], ctx); if (p.result) return p.result;
    const room = p.room; refs = [room.id];
    if (!side) return ask(`أي جدار من «${room.name}» تريد تغيير سماكته؟`, [...new Set(room.r.edges.map(e => e.side))].map(s => ({ id: s, label: sideLabel(s) })).concat([{ id: 'all', label: 'كل جدران الغرفة' }]), refs);
    const edges = room.r.edges.filter(e => e.side === side.side);
    if (!edges.length) return answerOnly('edit', `«${room.name}» ليس لها جدار ${SIDE_WALL[side.side]}.`, refs);
    const ids = [...new Set(edges.flatMap(e => e.wallIds))];
    walls = doc.walls.filter(w => ids.includes(w.id)); desc = `${sideLabel(side.side)} ل«${room.name}»`;
  } else if (ctx.sel.walls.length) { walls = doc.walls.filter(w => ctx.sel.walls.includes(w.id)); desc = 'الجدران المحددة'; }
  else return ask('أي جدران تريد تغيير سماكتها؟', [{ id: 'exterior', label: 'الجدران الخارجية' }, { id: 'interior', label: 'الجدران الداخلية' }, ...roomOptions(ctx.rooms).slice(0, 6)]);
  if (!amount) return ask(`ما السماكة الجديدة لـ${desc}؟`, [12, 20, 25, 30].map(cm => ({ id: String(cm / 100), label: `${cm} سم` })), refs);
  const t = Math.round(amount.meters * 1000) / 1000;
  if (!walls.length) return answerOnly('edit', 'لا توجد جدران مطابقة.', refs);
  if (walls.length > 80) return answerOnly('edit', 'عدد الجدران كبير؛ حدّد مجموعة أصغر.', refs);
  const commands = walls.filter(w => Math.abs(w.t - t) > 1e-6).map(w => ({ type: 'update', id: w.id, patch: { t } }));
  if (!commands.length) return answerOnly('edit', `سماكة ${desc} هي ${r1(t * 100)} سم بالفعل.`, refs);
  return { intent: 'edit', answer: `سأجعل سماكة ${desc} ${r1(t * 100)} سم (${commands.length} ${commands.length === 1 ? 'جدار' : 'جدارًا'}).`, commands, needsConfirm: commands.length > 3, ambiguities: [], referencedIds: [...refs, ...walls.map(w => w.id)] };
}

function addLevelHandler(n, ctx) {
  const doc = ctx.doc;
  const ord = n.match(new RegExp(`(?<!${L})(?:ال)?(اول|اولي|ثاني|ثانيه|ثالث|ثالثه|رابع|رابعه)(?!${L})`));
  const idx = ord ? ORD[ord[1]] : doc.levels.length;
  if (has(n, 'ارضي') && !ord) return answerOnly('edit', 'الدور الأرضي موجود؛ اطلب «دور أول» أو «دور ثاني».');
  if (doc.levels.length >= 6) return answerOnly('edit', 'وصل المشروع إلى الحد الذي أقترح عنده إضافة الأدوار آليًا.');
  const name = LEVEL_NAMES[idx] || `الدور ${idx}`;
  if (doc.levels.some(l => l.name === name)) return answerOnly('edit', `«${name}» موجود بالفعل في المشروع.`);
  const empty = has(n, 'فاضي|فارغ|بدون\\s+نسخ|من\\s+الصفر');
  const fromGround = /(?<![ء-ي])(من\s+(?:ال)?ارضي|نسخ\w*\s+(?:من\s+)?(?:ال)?ارضي)/.test(n);
  const from = fromGround ? doc.levels[0] : doc.levels[doc.levels.length - 1];
  const commands = [{ type: 'add-level', name, ...(empty ? {} : { copyFrom: from.id }) }];
  if (!empty) {
    // carry over the room labels too: the copy gets the same names and types in the new level
    try {
      const r = applyCommand(doc, commands[0]); const newId = r.ids[0];
      for (const l of doc.labels.filter(x => x.level === from.id)) commands.push({ type: 'add-label', level: newId, name: l.name, roomType: l.type, seed: { ...l.seed } });
    } catch { /* reported by the dry run */ }
  }
  return { intent: 'edit', answer: `سأضيف «${name}»${empty ? ' فارغًا' : ` كنسخة من «${from.name}» (الجدران والفتحات والتسميات)`}. الأثاث والدرج لا يُنسخان.`, commands, needsConfirm: commands.length > 3, ambiguities: [], referencedIds: [] };
}

function closeGapsHandler(ctx) {
  const commands = [];
  for (const lv of ctx.model.levels) for (const g of lv.analysis.gaps) commands.push({ type: 'close-gap', level: lv.level.id, from: g.at, to: g.point });
  if (!commands.length) return answerOnly('edit', 'لا توجد ثغرات في الجدران لسدّها.');
  return { intent: 'edit', answer: `سأسدّ ${commands.length} ${commands.length === 1 ? 'ثغرة' : 'ثغرات'} بمدّ الجدار الحرّ إلى أقرب جدار أو طرف.`, commands, needsConfirm: commands.length > 3, ambiguities: [], referencedIds: [] };
}

function resizeHandler(n, ctx, mentions, grow) {
  const ofRooms = mentions.filter(m => m.kind !== 'generic');
  { const a = askRooms(mentions, ctx, grow ? 'التوسيع' : 'التصغير') || askSides(n, grow ? 'التوسيع' : 'التصغير'); if (a) return a; }
  if (!ofRooms.length && !defaultRoom(ctx)) return ask('أي غرفة تريد ' + (grow ? 'توسيعها' : 'تصغيرها') + '؟', roomOptions(ctx.rooms));
  const p = ofRooms[0] ? pickRoom(ofRooms[0], ctx) : { room: defaultRoom(ctx) }; if (p.result) return p.result;
  const room = p.room, side = findSide(n), amount = findAmount(blank(n, mentions)), refs = [room.id];
  const sides = [...new Set(room.r.edges.map(e => e.side))];
  if (!side) return ask(`من أي جهة تريد ${grow ? 'توسيع' : 'تصغير'} «${room.name}»${amount ? ` بمقدار ${r2(amount.meters * 100)} سم` : ' وبكم'}؟`, sides.map(s => ({ id: s, label: `${sideLabel(s)}${room.r.edges.some(e => e.side === s && e.exterior) ? ' (خارجي)' : ' (مشترك مع غرفة مجاورة)'}` })), refs);
  if (!amount) return ask(`بكم تريد ${grow ? 'توسيع' : 'تصغير'} «${room.name}» من ${SIDE_NAME_AR[side.side]}؟`, [0.25, 0.5, 1].map(m => ({ id: String(m), label: `${m * 100} سم` })), refs);
  const edges = room.r.edges.filter(e => e.side === side.side);
  if (edges.length !== 1) return answerOnly('edit', edges.length ? `جهة ${SIDE_NAME_AR[side.side]} من «${room.name}» مكوّنة من ${edges.length} أجزاء؛ لا أحرّكها آليًا.` : `«${room.name}» ليس لها جدار جهة ${SIDE_NAME_AR[side.side]}.`, refs);
  const edge = edges[0], wall = wallOfEdge(ctx, edge);
  if (edge.wallIds.length !== 1 || !wall || Math.abs(dist(wall.a, wall.b) - edge.length) > 0.02) return answerOnly('edit', `هذا الجدار يمتد خارج حدود «${room.name}» أو يتداخل مع جدران أخرى؛ لا أحرّكه آليًا حتى لا ينفتح المخطط.`, refs);
  const d = mul(edge.out, (grow ? 1 : -1) * amount.meters);
  const cmd = { type: 'translate', ids: [wall.id], dx: Math.round(d.x * 1000) / 1000, dy: Math.round(d.y * 1000) / 1000, keepJoints: true };
  // verify that the plan stays closed and report who else changes
  let after;
  try { after = applyCommand(ctx.doc, cmd).doc; } catch (e) { return answerOnly('edit', e instanceof DrawError ? 'تعذر التحريك: ' + e.message : 'تعذر التحريك.', refs); }
  const am = analyzeDoc(after);
  const lvA = am.levels.find(l => l.level.id === room.lv.level.id);
  if (lvA.rooms.length !== room.lv.rooms.length || lvA.analysis.gaps.length > room.lv.analysis.gaps.length || lvA.orphanLabels.length > room.lv.orphanLabels.length || lvA.analysis.stubs.length > room.lv.analysis.stubs.length) return answerOnly('edit', `تحريك هذا الجدار يفتح المخطط أو يغيّر عدد الغرف (الجدران الملاصقة لا تتبعه كاملًا)؛ لم أقترح تغييرًا.`, refs);
  const changed = lvA.rooms.map(r => ({ r, before: room.lv.roomsById.get(r.id) })).filter(x => x.before && Math.abs(x.r.area - x.before.area) > 0.01);
  const mine = changed.find(x => x.r.id === room.id);
  if (!mine) return answerOnly('edit', `بعد هذا التحريك تخرج نقطة تسمية «${room.name}» من حدود الغرفة أو تنتقل إلى غرفة مجاورة؛ حرّك التسمية أولًا أو اختر مقدارًا أصغر.`, refs);
  if (grow ? mine.r.area <= mine.before.area : mine.r.area >= mine.before.area) return answerOnly('edit', `لم أتمكن من ${grow ? 'توسيع' : 'تصغير'} «${room.name}» بهذا الجدار دون أثر غير متوقع.`, refs);
  const others = changed.filter(x => x.r.id !== room.id);
  return { intent: 'edit', answer: `سأحرّك الجدار ${wall.id} (${SIDE_NAME_AR[side.side]}) بمقدار ${r2(amount.meters * 100)} سم ${grow ? 'للخارج' : 'للداخل'}: مساحة «${room.name}» من ${r2(mine.before.area)} إلى ${r2(mine.r.area)} م².${others.length ? ' ويتأثر أيضًا: ' + others.map(x => `«${x.r.name}» (${r2(x.before.area)} ← ${r2(x.r.area)} م²)`).join('، ') + '.' : ''}`, commands: [cmd], needsConfirm: others.length > 0, ambiguities: [], referencedIds: [...refs, wall.id, ...others.map(x => x.r.id)] };
}

// ------------------------------------------------------------------ clause dispatcher
function interpretClause(clause, ctx, orig) {
  const n = clause.norm;
  const tokens = n.split(' ');
  if (!n) return unknownResult('اكتب طلبك، مثل: «كم نافذة في المجلس» أو «أضف نافذة في الجدار الشمالي للمطبخ».');
  let mentions = findMentions(n, ctx);
  // verb: the first known verb among the first six tokens
  let verb = null;
  if (!isQ(tokens[0])) {
    for (let i = 0; i < Math.min(tokens.length, 6); i++) {
      if (COMPARATIVE.has(tokens[i]) && !(i > 0 && verbOf(tokens[i - 1])?.cat === 'desire')) continue;
      const v = verbOf(tokens[i]);
      if (!v) continue;
      if (v.lemma === 'desire' || v.cat === 'desire') { verb = verb || { ...v, i, soft: true }; continue; }
      if (AMBIGUOUS_VERB.has(v.lemma) && !tokens.slice(0, i).every(t => FILLER.has(t) || verbOf(t)?.cat === 'desire')) continue;
      if (v.lemma === 'سد' && !/(?<![ء-ي])(فتحه|فتحات|ثغره|ثغرات|فجوه|فجوات)(?![ء-ي])/.test(n)) continue;
      verb = { ...v, i }; break;
    }
  }
  const opening = findOpeningKind(n), fixture0 = findFixture(n);
  const gapWord = has(n, 'فتحات|ثغره|ثغرات|فجوه|فجوات|فراغات|نهايات\\s+(?:ال)?جدران') && !has(n, 'نافذه|شباك|باب|نوافذ');
  const levelWord = has(n, 'دور|طابق') && !has(n, 'سماكه|سمك');

  // negation: "لا تضيف نافذة", "ما ابي نافذة" must never become an edit
  if (/(?<![ء-ي])(لا|ما|مو|مب|لن|ماني|ماهو|بدون)\s+(?:ابي|ابغي|ابغا|اريد|ودي|تضيف|تحط|تشيل|تغير|تسوي|تحذف|توسع|تكبر|اضف|حط|شيل|غير|احذف|ضيف|سو|سوي)(?![ء-ي])/.test(n)) return unknownResult('فهمت أنك لا تريد هذا الإجراء، فلم أقترح شيئًا.');
  const edit = verb && verb.cat !== 'review' && !verb.soft ? verb.cat : null;
  const soft = verb && verb.soft ? true : false;

  // fixture vs room-type conflicts (e.g. "مكتب", "سفرة", "مطبخ" inside "وحدة مطبخ"): the fixture wins when another room is named
  let fixture = fixture0;
  if (fixture && (edit === 'add' || edit === 'remove' || soft || edit === 'grow')) {
    const overlapping = mentions.filter(m => m.start < fixture.end && fixture.index < m.end);
    const rest = mentions.filter(m => !overlapping.includes(m));
    if (overlapping.length && !rest.length && !ctx.sel.rooms.length && /^(?:مكتب|سفره|مطبخ)$/.test(n.slice(fixture.index, fixture.end).replace(/^.*\s/, '')) && overlapping.every(m => m.kind === 'type')) fixture = null;
    else mentions = rest;
  } else if (fixture && edit === 'change') fixture = null;

  const finish = r => r;
  // ---- structural / level / gap requests first
  if (edit === 'close' || (gapWord && (edit === 'close' || /(?<![ء-ي])(سكر|اغلق|اقفل|قفل|سد|اصلح|رقع)/.test(n)))) return gapWord ? closeGapsHandler(ctx) : unknownResult('ما الذي تريد إغلاقه؟ يمكنني سدّ الثغرات بين الجدران: اكتب «سكّر الثغرات».');
  if ((edit === 'add' || soft || edit === 'grow') && levelWord && !opening && !fixture) return addLevelHandler(n, ctx);
  if (edit === 'thick' || (has(n, 'سماكه|سمك|ثخانه') && (edit === 'change' || edit === 'grow' || soft))) return thicknessHandler(n, ctx, mentions);
  if (edit === 'move') return ask('تحريك غرفة كاملة غير آمن آليًا. أي جدار تريد تحريكه ومن أي جهة وبكم؟ (مثال: «وسّع المجلس 50 سم من الجهة الشرقية»)', roomOptions(ctx.rooms));
  if (edit === 'remove') return removeHandler(n, ctx, mentions, opening, fixture);
  if (edit === 'grow' && !opening && !fixture) return resizeHandler(n, ctx, mentions, true);
  if (edit === 'shrink') return resizeHandler(n, ctx, mentions, false);
  if (edit === 'add' || (soft && (opening || fixture))) {
    if (opening && (!fixture || opening.index <= fixture.index)) return addOpeningHandler(n, ctx, mentions, opening);
    if (fixture) return addFixtureHandler(n, ctx, mentions, fixture);
    return ask('ماذا تريد أن تضيف وأين؟', [{ id: 'window', label: 'نافذة' }, { id: 'door', label: 'باب' }, { id: 'fixture', label: 'أثاث أو تجهيز' }, { id: 'level', label: 'دور' }]);
  }
  if (edit === 'change' && has(n, 'اكبر|اوسع|اطول|اعرض')) return resizeHandler(n, ctx, mentions, true);
  if (edit === 'change' && has(n, 'اصغر|اضيق|اقصر')) return resizeHandler(n, ctx, mentions, false);
  if (edit === 'change' && (opening || fixture)) return answerOnly('edit', 'لتعديل نافذة أو باب أو قطعة موجودة اطلب حذفها ثم إضافة البديل، أو عدّلها من الرسم مباشرة.');
  if (edit === 'change') return changeTypeHandler(n, ctx, mentions, orig);
  // ---- queries
  if (isQ(tokens[0]) || verb?.cat === 'review' || tokens.some(isQ) || has(n, 'ناقص|مشاكل|مشكله|ملاحظات|اخطاء|عيوب|لخص|وصف|عرفني|ملخص|مساح[ء-ي]*|ابعاد|مقاس[ء-ي]*')) {
    const q = queryHandler(n, ctx, mentions);
    if (q) return q;
    const miss = mentions.find(m => m.missing);
    if (miss) return answerOnly('query', `لا توجد في المخطط غرفة من نوع «${miss.missing}».`);
    return unknownResult('فهمت أنه سؤال لكنني لا أستطيع الإجابة عنه محليًا بدقة.');
  }
  if (soft) return unknownResult('ماذا تريد بالتحديد؟ مثلًا: «أبي نافذة في المطبخ» أو «أبي أكبّر المجلس».');
  return unknownResult('لم أفهم الطلب. أمثلة: «كم مساحة المجلس؟»، «راجع المخطط»، «أضف نافذة في الجدار الشمالي للمطبخ»، «حط سرير مزدوج في غرفة النوم الرئيسية».');
}

// ------------------------------------------------------------------ public API
function dryRun(doc, commands) {
  let d = doc;
  for (const c of commands) d = applyCommand(d, c).doc;
  return d;
}

/** Split a compound request ("أضف نافذة وحط باب ...") on a conjunction that is followed by a verb. */
function splitClauses(orig) {
  const { norm: n, map } = orig;
  const parts = []; let start = 0;
  const re = /\s(?:و|ف|ثم)(?=[ء-ي]{2,})/g;
  let m;
  while ((m = re.exec(n))) {
    const after = n.slice(m.index + 1 + m[0].trim().length).split(' ')[0];
    const v = verbOf(after);
    if (v && v.cat !== 'desire' && !AMBIGUOUS_VERB.has(v.lemma) && m.index > start) { parts.push({ norm: n.slice(start, m.index), s: start, e: m.index }); start = m.index + 1 + m[0].trim().length; }
  }
  parts.push({ norm: n.slice(start), s: start, e: n.length });
  return parts;
}

const COLOR_WORDS = [['ابيض', '#f4f4f1', 'أبيض'], ['كريمي', '#f1ead9', 'كريمي'], ['رملي', '#ece0c8', 'رملي'], ['رمل', '#ece0c8', 'رملي'], ['بيج', '#d9c7a4', 'بيج'], ['ترابي', '#b9a58a', 'ترابي'], ['بني', '#8b7d6b', 'بني'], ['رمادي', '#bfc3c6', 'رمادي'], ['اسود', '#2b2c2e', 'أسود'], ['ازرق', '#1f3a4d', 'أزرق داكن'], ['احمر', '#7a2f2a', 'أحمر داكن'], ['طوبي', '#a65f3c', 'طوبي']];
const FLOOR_WORDS = [['رخام', 'marble', 'رخام'], ['باركيه', 'wood', 'باركيه'], ['خشب', 'wood', 'باركيه'], ['بلاط', 'tile', 'بلاط'], ['سيراميك', 'tile', 'بلاط'], ['خرسانه', 'concrete', 'خرسانة']];
/** Façade / material requests ("اجعل الواجهة حجر", "لون الألمنيوم أسود", "أرضية المجلس باركيه"). null when the text is not about materials. */
export function interpretFinish(norm, doc) {
  const color = COLOR_WORDS.find(([w]) => has(norm, w));
  const finish = {}; const said = [];
  const wantsChange = /(?<![ء-ي])(?:اجعل|خل|خلي|غير|بدل|حول|ابي|ابغي|اريد|لون|اضف|حط|سو|سوي)(?![ء-ي])/.test(norm) || /(?<![ء-ي])(?:لون|لونها|لونه)/.test(norm);
  if (!wantsChange) return null;
  const floorMat = FLOOR_WORDS.find(([w]) => has(norm, w));
  if (has(norm, 'ارضيه|ارضيات|ارضية')) {
    if (!floorMat) return null;
    const types = Object.entries(ROOM_TYPES).filter(([k, v]) => k !== 'other' && norm.includes(normalizeAr(v.ar).replace(/^غرفه /, ''))).map(([k]) => k);
    const named = doc.labels.filter(l => norm.includes(normalizeAr(l.name)) || norm.includes(normalizeAr(roomTypeName(l.type)).replace(/^غرفه /, ''))).map(l => l.type);
    const pick = [...new Set([...types, ...named])];
    if (!pick.length) return { intent: 'query', answer: 'أي غرف تقصد بالأرضية؟ اذكر اسم الغرفة، مثل «أرضية المجلس باركيه».', commands: [], needsConfirm: false, ambiguities: [], referencedIds: [] };
    finish.floors = Object.fromEntries(pick.map(t => [t, floorMat[1]])); said.push(`أرضية ${pick.map(roomTypeName).join(' و')} ${floorMat[2]}`);
  } else if (has(norm, 'الالمنيوم|المنيوم|اطار النوافذ|اطارات')) {
    if (!color) return null; finish.aluminium = color[1]; said.push(`لون الألمنيوم ${color[2]}`);
  } else if (has(norm, 'باب المدخل|الباب الرئيسي|باب الدخول')) {
    if (!color) return null; finish.entryDoor = color[1]; said.push(`لون باب المدخل ${color[2]}`);
  } else if (has(norm, 'سور|الاسوار')) {
    if (!color) return null; finish.fence = color[1]; said.push(`لون السور ${color[2]}`);
  } else if (has(norm, 'واجه|واجهه|واجهات|الجدران الخارجي|الخارجي|الحجر|حجر')) {
    const facade = {};
    if (has(norm, 'حجر') && !/لون/.test(norm)) { facade.base = 'stone'; facade.accent = 'all'; said.push('تشطيب الواجهة حجر'); }
    else if (has(norm, 'لياسه|لياسة')) { facade.base = 'render'; said.push('تشطيب الواجهة لياسة'); }
    else if (has(norm, 'دهان|بوي|بويه|املس')) { facade.base = 'paint'; said.push('تشطيب الواجهة دهان أملس'); }
    if (color) { facade.color = color[1]; said.push(`لون الواجهة ${color[2]}`); }
    if (!Object.keys(facade).length) return null; finish.facade = facade;
  } else return null;
  return { intent: 'edit', answer: `سأغيّر المواد: ${said.join('، ')}. اضغط تطبيق لتراه في المجسم.`, commands: [{ type: 'set-meta', finish }], needsConfirm: true, ambiguities: [], referencedIds: [] };
}

export function interpretAr(text, doc, { selection = null } = {}) {
  const orig = normalizeWithMap(text);
  if (!orig.norm) return { ...unknownResult('اكتب طلبك أولًا.'), referencedIds: [] };
  { let fin = null; try { fin = interpretFinish(orig.norm, doc); } catch { fin = null; } if (fin) return finalize(fin, doc); }
  if (String(text).length > 800) return unknownResult('الطلب طويل جدًا؛ اختصره في جملة أو جملتين.');
  let ctx;
  try { ctx = buildCtx(doc, selection); } catch { return unknownResult('تعذر تحليل المخطط الحالي.'); }
  if (!ctx.rooms.length && !/(?<![ء-ي])(?:ال)?(دور|طابق|ثغره|ثغرات|فتحات|فجوه|فجوات)/.test(orig.norm)) {
    return { ...answerOnly('query', 'لا توجد غرف مغلقة في المخطط بعد؛ ارسم جدرانًا مغلقة ثم سمِّ الغرف.'), intent: /(?<![ء-ي])(كم|هل|ايش|وش|راجع)/.test(orig.norm) ? 'query' : 'unknown' };
  }
  const clauses = splitClauses(orig);
  const results = clauses.map(c => {
    const sub = { norm: c.norm, map: orig.map.slice(c.s, c.e), src: orig.src };
    // mentions' offsets are relative to the clause; use a clause-local original map
    try { return interpretClause({ norm: c.norm }, ctx, { ...sub, map: orig.map.slice(c.s, c.e) }); } catch (e) { return unknownResult('تعذر فهم الطلب.'); }
  });
  let res;
  if (results.length === 1) res = results[0];
  else {
    const bad = results.find(r => r.intent === 'unknown');
    if (bad) res = bad;
    else {
      const amb = results.flatMap(r => r.ambiguities);
      res = { intent: results.some(r => r.intent === 'edit') ? 'edit' : 'query', answer: results.map(r => r.answer).filter(Boolean).join(' '), commands: amb.length ? [] : results.flatMap(r => r.commands), needsConfirm: results.some(r => r.needsConfirm), ambiguities: amb, referencedIds: [...new Set(results.flatMap(r => r.referencedIds))] };
    }
  }
  return finalize(res, doc);
}

function finalize(res, doc) {
  const out = { intent: res.intent, answer: res.answer, commands: res.commands || [], needsConfirm: !!res.needsConfirm, ambiguities: res.ambiguities || [], referencedIds: res.referencedIds || [] };
  if (res.issues) out.issues = res.issues;
  if (out.commands.length) {
    let d = doc;
    try {
      for (const c of out.commands) d = applyCommand(d, c).doc;
      // doors: choose a swing that does not collide (flip when the default is blocked)
      const flips = [];
      if (res._postOpening) {
        const am = analyzeDoc(d);
        for (const lv of am.levels) for (const op of lv.openings) {
          if (!out.commands.some(c => c.type === 'add-opening') || !op.door) continue;
          if (doc.openings.some(o => o.id === op.id)) continue;
          if (swingBlockers(am, lv, op).length) {
            for (const [ov, cmds] of [[{ swing: op.o.swing === 'out' ? 'in' : 'out' }, [{ type: 'flip-opening', id: op.id, what: 'swing' }]], [{ hinge: op.o.hinge === 'right' ? 'left' : 'right' }, [{ type: 'flip-opening', id: op.id, what: 'hinge' }]], [{ swing: op.o.swing === 'out' ? 'in' : 'out', hinge: op.o.hinge === 'right' ? 'left' : 'right' }, [{ type: 'flip-opening', id: op.id, what: 'swing' }, { type: 'flip-opening', id: op.id, what: 'hinge' }]]]) {
              if (!swingBlockers(am, lv, op, ov).length) { flips.push(...cmds); break; }
            }
          }
        }
      }
      if (flips.length) { for (const c of flips) d = applyCommand(d, c).doc; out.commands = [...out.commands, ...flips]; out.answer += ' ضبطتُ اتجاه فتح الباب حتى لا يصطدم بشيء.'; }
    } catch (e) {
      const msg = e instanceof DrawError ? e.message : 'خطأ غير متوقع أثناء التحقق من الأوامر.';
      return { intent: 'edit', answer: `تعذر تنفيذ الطلب: ${msg}`, commands: [], needsConfirm: false, ambiguities: [], referencedIds: out.referencedIds, error: e instanceof DrawError ? e.code : 'UNEXPECTED' };
    }
  }
  if (out.commands.some(c => c.type === 'delete')) out.needsConfirm = true;
  if (out.commands.length > 3) out.needsConfirm = true;
  return out;
}

export default { interpretAr, normalizeAr, normalizeWithMap, placeFixture };
