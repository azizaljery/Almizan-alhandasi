// وحدات المساقط المرجعية: برنامج العميل (من buildProgram) → وحدات فراغية ببدائل مقاسات مطلقة بالأمتار.
// كل وحدة شجرة صغيرة (غرفة + ملحقاتها) وروابط أبواب مطلوبة؛ لا إحداثيات هنا: المكيّف (villa-ref-core) يحلّها داخل الغلاف.
// حدود المقاسات افتراضات تصميمية من الميزان (ليست اشتراطات نظامية)؛ غير متحقق من مصدر خارجي إلا ما ورد في docs/villa-reference-research.md.
import { X, Y, L } from './villa-ref-core.mjs';

/** حدود الأدوار (م على محاور الجدران): ms أقل ضلع، ar أقصى نسبة، cap أقصى مضاعف للمساحة المستهدفة، abs أقصى مساحة مطلقة. */
export const ROLE = Object.freeze({
  majlis: { ms: 4.95, ar: 1.7, cap: 1.35, abs: 46, type: 'majlis' },
  bedroom: { ms: 3.45, ar: 1.45, cap: 1.3, abs: 26, type: 'bedroom' },
  master: { ms: 4.0, ar: 1.4, cap: 1.3, abs: 36, type: 'master' },
  dining: { ms: 3.1, ar: 1.7, cap: 1.35, abs: 28, type: 'dining' },
  kitchen: { ms: 2.7, ar: 1.8, cap: 1.35, abs: 22, type: 'kitchen' },
  family: { ms: 3.7, ar: 1.6, cap: 1.3, abs: 36, type: 'living' },
  maid: { ms: 2.8, ar: 1.5, cap: 1.3, abs: 17, type: 'service' },
  driver: { ms: 2.7, ar: 1.5, cap: 1.3, abs: 15, type: 'service' },
  office: { ms: 2.9, ar: 1.6, cap: 1.3, abs: 22, type: 'office' },
  prayer: { ms: 2.4, ar: 1.6, cap: 1.5, abs: 14, type: 'other' },
});
/** سقوف المساحة الصافية التقريبية (م²) التي يفحصها فاحص ما بعد التكييف: تضخم الغرفة عن مقاسها المهني يُرفض. */
export const AREA_CAP = Object.freeze({ majlis: 46, bedroom: 27, master: 37, dining: 30, kitchen: 24, family: 38, maid: 22, driver: 20, office: 22, prayer: 15, hall: 34, foyer: 14 });

/** فترة بُعد غرفة من مساحتها المستهدفة: [أدنى، مفضّل، أقصى] لكل محور (الاتجاه تقرّره البنية لا الفترة). */
export function span(role, area, { scale = 1, fixed = false } = {}) {
  const R = ROLE[role], a = Math.max(area * scale, R.ms * R.ms * .9), s = Math.max(R.ms, Math.sqrt(a));
  const capA = Math.min(R.abs, a * (fixed ? 1.12 : R.cap)), mx = Math.max(s + .3, Math.min(Math.sqrt(capA * R.ar), capA / R.ms));
  const wide = ['maid', 'driver', 'office', 'prayer'].includes(role) ? 5.3 : 0;
  return [R.ms, Math.min(s * 1.04, Math.max(mx, wide)), Math.max(mx, wide)];
}
const room = (id, role, area, props = {}, o = {}) => { const sp = span(role, area, o); return L(id, sp, sp, { type: ROLE[role].type, kind: props.kind || role, ...props }); };

// ------------------------------------------------------------------------------------------ تهيئة البرنامج
/** يستخرج من برنامج المولّد (buildProgram) ما تحتاجه الوحدات. */
export function adapt(program, { upperFamily = null } = {}) {
  const T = { master: 19, bedroom: 14, stripD: 1.7, masterStripD: 2.2 };
  const blocks = program.blocks, of = k => blocks.filter(b => b.kind === k);
  const net = b => b.kind === 'majlis' ? b.area - (b.guestWc ? 7 : 0) : b.kind === 'suite' && b.bath ? b.area - (b.master ? T.masterStripD * 5.2 : T.stripD * 4.4) : b.area;
  const majs = of('majlis'), beds = of('suite');
  return {
    men: majs.find(b => b.men) || null, women: majs.find(b => b.women) || null, majlisExtra: majs.filter(b => !b.men && !b.women),
    dining: of('dining'), kitchens: of('kitchen'), family: of('family'),
    maid: of('maid')[0] || null, driver: of('driver')[0] || null, office: of('office')[0] || null, prayer: of('prayer')[0] || null,
    beds, hall: !!program.hall, hallArea: program.hallArea, hallFixed: !!program.hallFixed,
    laundry: (program.kitchenStrip || []).includes('laundry'), storage: (program.kitchenStrip || []).includes('storage'),
    prefs: program.prefs || {}, rules: program.rules || [], upperFamily, net, program,
  };
}

// ------------------------------------------------------------------------------------------ الوحدات
const bathSpan = master => master ? { w: [2.0, 2.6, 3.4], h: [2.5, 3.1, 3.9] } : { w: [1.75, 2.25, 2.9], h: [2.2, 2.65, 3.4] };
const dressSpan = master => master ? { w: [1.7, 2.2, 3.2], h: [1.7, 2.2, 3.2] } : { w: [1.2, 1.6, 2.4], h: [1.2, 1.6, 2.4] };
const bedNet = (b, P) => { const n = P.net(b), fixed = !!b.fixedArea; return fixed ? n : Math.max(n, b.master ? 22 : 16); };

/**
 * غرفة نوم بحمامها وخزانتها. along: محور الوحدة في منطقتها: 'y' (وحدات متراصّة رأسيًا في عمود: الحمام خلف الغرفة)
 * أو 'x' (وحدات جنبًا إلى جنب في صف: الحمام بجانبها). flip يبدّل ترتيب الغرفة والملحقات (يغيّر جهة الحمام عن الممر).
 */
export function suiteUnit(b, P, { along = 'y', flip = false, dress = true } = {}) {
  const role = b.master ? 'master' : 'bedroom', bedId = b.id;
  const bed = room(bedId, role, bedNet(b, P), { name: b.name, kind: 'suite', master: !!b.master, zone: 'family' }, { fixed: !!b.fixedArea });
  const links = [], ids = [bedId];
  if (!b.bath) return { node: bed, access: [{ id: bedId, prefer: ['hall', 'corr', 'foyer'], avoid: ['foyer', 'men'] }], links, ids, kind: 'bed', b };
  const bs = bathSpan(b.master), ds = dressSpan(b.master);
  const bath = L(b.id + '-bath', bs.w, bs.h, { type: 'bath', kind: 'bath', name: b.bathShared ? 'دورة مياه مشتركة' : b.master ? 'حمام الرئيسية' : 'حمام ' + b.name });
  const dr = dress ? L(b.id + '-dress', ds.w, ds.h, { type: 'storage', kind: 'dress', name: b.master ? 'غرفة ملابس' : 'خزانة ملابس', sink: !!b.master }) : null;
  links.push({ a: bath.id, b: bedId, kind: 'door', w: .8 });
  if (dr) links.push({ a: dr.id, b: bedId, kind: 'arch', w: 1.1 });
  ids.push(bath.id, ...(dr ? [dr.id] : []));
  const strip = along === 'y' ? X(flip ? [dr, bath] : [bath, dr]) : Y(flip ? [dr, bath] : [bath, dr]);
  const node = along === 'y' ? Y(flip ? [strip, bed] : [bed, strip]) : X(flip ? [strip, bed] : [bed, strip]);
  return { node, access: [{ id: bedId, prefer: ['hall', 'corr', 'foyer'], avoid: ['foyer', 'men'] }, ...(b.bathShared ? [{ id: bath.id, prefer: ['corr', 'hall'], avoid: ['foyer', 'men'], extra: true }] : [])], links, ids, kind: b.master ? 'master' : 'bed', b };
}

/** مجلس الرجال: لا باب داخلي إلى العائلة؛ مدخله من مدخل مستقل (lobby) على واجهة المبنى ودورة مياه الضيوف بجواره. */
export function menUnit(b, P, { lobbyFirst = true, flip = false, along = 'x' } = {}) {
  const maj = room(b.id, 'majlis', P.net(b), { name: b.name, kind: 'majlis', zone: 'men', men: true }, { fixed: !!b.fixedArea });
  const lobby = L(b.id + '-lobby', [1.7, 2.3, 4.2], [1.9, 2.4, 3.4], { type: 'corridor', kind: 'lobby', name: 'مدخل الرجال', zone: 'men', circ: true, ckind: 'men' });
  const wc = b.guestWc ? L(b.id + '-wc', [1.7, 2.0, 3.6], [1.8, 2.15, 2.9], { type: 'bath', kind: 'wc', name: 'دورة مياه الرجال', zone: 'men' })
    : L(b.id + '-store', [1.7, 2.0, 3.6], [1.8, 2.4, 4.5], { type: 'storage', kind: 'store', name: 'مخزن الضيافة', zone: 'men', sink: true });
  const col = Y(lobbyFirst ? [lobby, wc] : [wc, lobby]);
  const node = along === 'y' ? Y(X(flip ? [wc, lobby] : [lobby, wc]), maj) : X(flip ? [maj, col] : [col, maj]);
  const links = [{ a: b.id, b: lobby.id, kind: 'arch', w: 1.4 }, { a: wc.id, b: lobby.id, kind: 'door', w: .75 }, { a: lobby.id, entry: true, kind: 'door', w: 1.1, flags: { men: true } }];
  return { node, access: [], links, ids: [b.id, lobby.id, wc.id], kind: 'men', b, lobbyId: lobby.id, entryRoom: lobby.id };
}

/** مجلس النساء: يُدخل إليه من فراغ حركة العائلة (الصالة/المدخل) بممر ضيوف ودورة مياه؛ ومدخل جانبي اختياري. */
export function womenUnit(b, P, { flip = false, lobby = true, along = 'x' } = {}) {
  const maj = room(b.id, 'majlis', P.net(b), { name: b.name, kind: 'majlis', zone: 'women', women: true }, { fixed: !!b.fixedArea });
  const wc = b.guestWc ? L(b.id + '-wc', [1.7, 2.0, 3.6], [1.8, 2.15, 2.9], { type: 'bath', kind: 'wc', name: 'دورة مياه النساء', zone: 'women' }) : null;
  const lob = lobby ? L(b.id + '-lobby', [1.5, 2.1, 4.0], [1.7, 2.1, 3.2], { type: 'corridor', kind: 'lobby', name: 'ممر النساء', zone: 'women', circ: true, ckind: 'women' }) : null;
  const strip = [lob, wc].filter(Boolean), col = strip.length > 1 ? Y(flip ? [...strip].reverse() : strip) : strip[0] || null;
  const links = [], ids = [b.id];
  if (lob) links.push({ a: b.id, b: lob.id, kind: 'arch', w: 1.5 });
  if (wc) { links.push({ a: wc.id, b: (lob || maj).id, kind: 'door', w: .75 }); ids.push(wc.id); }
  if (lob) ids.push(lob.id);
  const rowS = strip.length > 1 ? X(flip ? [...strip].reverse() : strip) : strip[0] || null;
  const node = !col ? maj : along === 'y' ? Y(maj, rowS) : X(flip ? [maj, col] : [col, maj]);
  if (P.prefs.familyEntrance) links.push({ a: (lob || maj).id, entry: true, sides: ['x0', 'x1'], kind: 'door', w: 1.0, optional: true, flags: { family: true } });
  return { node, access: [{ id: (lob || maj).id, alt: lob ? [maj.id] : [], prefer: ['hall', 'foyer', 'corr'], avoid: ['men'], w: lob ? 1.2 : 1.6, kind: lob ? 'door2' : 'arch' }], links, ids, kind: 'women', b, familyDoor: P.prefs.familyEntrance ? (lob || maj).id : null };
}

/** الطعام والمطبخ (وملحق غسيل/مخزن إن طُلب): المطبخ يلاصق الطعام بباب مباشر؛ وللمطبخ باب خدمة خارجي متى لامس الجدار الخلفي أو الجانبي. */
export function dineUnit(dining, kitchen, P, { flip = false, along = 'x' } = {}) {
  const parts = [], links = [], ids = [], acc = [];
  const din = dining ? room(dining.id, 'dining', dining.area, { name: dining.name, kind: 'dining' }, { fixed: !!dining.fixedArea }) : null;
  const kit = kitchen ? room(kitchen.id, 'kitchen', Math.max(kitchen.area - (P.laundry ? 3 : 0) - (P.storage ? 2.5 : 0), 9), { name: kitchen.name, kind: 'kitchen' }) : null;
  const extras = [];
  if (kit && P.laundry) extras.push(L(kit.id + '-laundry', [1.6, 2.0, 2.8], [1.7, 2.1, 3.0], { type: 'laundry', kind: 'laundry', name: 'غرفة الغسيل' }));
  if (kit && P.storage) extras.push(L(kit.id + '-store', [1.5, 1.9, 2.8], [1.6, 2.0, 3.2], { type: 'storage', kind: 'store', name: 'مخزن المطبخ', sink: true }));
  if (din) ids.push(din.id); if (kit) ids.push(kit.id);
  for (const e of extras) { ids.push(e.id); links.push({ a: e.id, b: kit.id, kind: 'door', w: .8 }); }
  const kcol = kit ? (extras.length ? (along === 'x' ? Y(kit, ...extras) : X(kit, ...extras)) : kit) : null;
  let node;
  if (din && kcol) { node = along === 'x' ? X(flip ? [kcol, din] : [din, kcol]) : Y(flip ? [kcol, din] : [din, kcol]); links.push({ a: kit.id, b: din.id, kind: P.prefs.openKitchen ? 'arch' : 'door', w: P.prefs.openKitchen ? 1.8 : .95 }); }
  else node = din || kcol;
  if (din) acc.push({ id: din.id, alt: kit ? [kit.id] : [], prefer: ['hall', 'foyer', 'corr'], avoid: ['men'], kind: 'arch', w: 1.8 });
  if (kit) links.push({ a: kit.id, entry: true, sides: ['y1', 'x1', 'x0'], kind: 'door', w: .9, optional: true, flags: { service: true } });
  if (kit) acc.push({ id: kit.id, prefer: ['corr', 'hall'], avoid: ['men', 'foyer'], optional: !!din, kind: 'door', w: .95 });
  return { node, access: acc, links, ids, kind: 'dine', service: kit ? kit.id : null };
}

/** غرفة خدمة (خادمة/سائق) بحمامها: باب خارجي مستقل متى طُلب (ext) وإلا من فراغ الحركة أو المطبخ. */
export function serviceUnit(b, role, P, { along = 'y', ext = null } = {}) {
  const r = room(b.id, role, b.area - (b.bath ? 4 : 0), { name: b.name, kind: role, ext: !!b.ext });
  const ids = [b.id], links = [];
  let node = r;
  if (b.bath) {
    const bath = L(b.id + '-bath', [1.7, 2.1, 3.0], [2.0, 2.4, 3.2], { type: 'bath', kind: 'bath', name: 'حمام ' + b.name.replace('غرفة ', '') });
    const pad = L(b.id + '-store', [1.2, 1.6, 3.0], [1.2, 1.8, 3.2], { type: 'storage', kind: 'store', name: 'مخزن', sink: true });
    links.push({ a: bath.id, b: b.id, kind: 'door', w: .8 }, { a: pad.id, b: b.id, kind: 'door', w: .8 }); ids.push(bath.id, pad.id);
    node = along === 'y' ? Y(r, X(bath, pad)) : X(r, Y(bath, pad));
  }
  if (b.ext || ext) links.push({ a: b.id, entry: true, sides: ['x0', 'x1', 'y1'], kind: 'door', w: .9, optional: true, flags: { service: true } });
  return { node, access: [{ id: b.id, prefer: ['corr', 'hall', 'foyer'], avoid: ['men', 'foyer'], viaKitchen: true, optional: !!(b.ext || ext) }], links, ids, kind: role, b, ext: !!b.ext };
}

export function simpleUnit(b, role, P) {
  const r = room(b.id, role, b.area, { name: b.name, kind: role });
  return { node: r, access: [{ id: b.id, prefer: ['hall', 'corr', 'foyer'], avoid: ['men'] }], links: [], ids: [b.id], kind: role, b };
}
export function familyUnit(b, P) {
  const r = room(b.id, 'family', b.area, { name: b.name, kind: 'family' });
  return { node: r, access: [{ id: b.id, prefer: ['hall', 'corr', 'foyer'], avoid: ['men'], kind: 'arch', w: 2.0 }], links: [], ids: [b.id], kind: 'family', b };
}

// ------------------------------------------------------------------------------------------ فراغات الحركة
/** الصالة: مساحتها مستهدفة صغيرة نسبيًا (لا تمتص فائض الأرض): max قريب من المفضَّل، ونسبتها ≤ 1:1.6 تفحصها المرحلة التالية. */
export function hallLeaf(P, { narrow = false, name = null, upper = false, id = 'hall' } = {}) {
  const fixed = P.hallFixed, area = fixed ? P.hallArea : Math.min(P.hallArea || 26, upper ? 24 : 26), ms = narrow ? 3.5 : 4.75;
  const s = Math.max(ms, Math.sqrt(area)), mx = fixed ? Math.max(s + .4, Math.sqrt(area * 1.12 * 1.5)) : Math.max(s + .3, 5.85);
  return L(id, [ms, s, mx], [ms, s, mx], { type: 'living', kind: 'hall', name: name || (P.hall ? 'الصالة' : 'صالة الحركة'), circ: true, ckind: 'hall' });
}
export const foyerLeaf = (P, o = {}) => L('foyer', [2.3, 2.8, o.maxW || 8], [2.3, 2.9, 6.5], { type: 'entrance', kind: 'foyer', name: P.men ? 'مدخل العائلة' : 'الردهة', circ: true, ckind: 'foyer' });
export const stairLeaf = (id = 'stair') => L(id, [2.5, 2.7, 3.2], [4.2, 4.5, 5.2], { type: 'stairs', kind: 'stair', name: 'السلم', circ: true, ckind: 'stair' });
/** ممر أفقي (طوله على x) أو رأسي. عرضه 1.3–1.9 م: الأوسع من ذلك صالة لا ممر. */
export const corrLeaf = (id, dir, o = {}) => dir === 'x'
  ? L(id, [o.min || 2.2, o.pref || 4, o.max || 60], [1.3, 1.45, 1.9], { type: 'corridor', kind: 'corr', name: o.name || 'ممر الغرف', circ: true, ckind: 'corr' })
  : L(id, [1.3, 1.45, 1.9], [o.min || 2.2, o.pref || 4, o.max || 60], { type: 'corridor', kind: 'corr', name: o.name || 'ممر الغرف', circ: true, ckind: 'corr' });
/** فراغ خارجي: فناء/ساحة/تراس. sink: يمتص فائض الأرض أولًا (قبل رفع الغرف نحو أقصاها). */
export const courtLeaf = (id, w, h, o = {}) => L(id, w, h, { type: 'courtyard', kind: 'terrace', name: o.name || 'الحوش الداخلي', sink: o.sink ?? 1, trees: o.trees ?? true, fenceH: o.fenceH, outdoor: true, court: o.court ?? true });

/** حشوة مرنة في نهاية المنطقة تمتص فرق العمق بين المنطقة وقلب المبنى: مخزن (أرضي) / تراس (علوي) / ساحة (دور واحد). */
export function padLeaf(zid, lv, axis) {
  const along = [0, 0, 14], cross = [1.2, 3, 40], w = axis === 'x' ? along : cross, h = axis === 'x' ? cross : along;
  if (lv === 'g') return L('pad:' + zid, w, h, { type: 'courtyard', kind: 'terrace', name: 'ساحة خارجية', sink: true, pad: true, outdoor: true, trees: false, fenceH: 1.8 });
  if (lv === 'u') return L('pad:' + zid, w, h, { type: 'balcony', kind: 'terrace', name: 'تراس علوي', sink: true, pad: true, outdoor: true, fenceH: 1.1 });
  return L('pad:' + zid, w, h, { type: 'courtyard', kind: 'terrace', name: 'ساحة خارجية', sink: true, pad: true, outdoor: true, trees: false, fenceH: 1.8 });
}
