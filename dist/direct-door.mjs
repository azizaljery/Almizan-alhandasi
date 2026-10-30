// الباب الداخلي المباشر بين فراغين محددين (علاقة direct_access): تخطيط هندسي نقي، بلا اعتماد على المحرك ولا على المستند.
// الغاية: «باب حقيقي» على جدار مشترك فعلي، لا ملاصقة فقط. إن تعذّر يُعاد سبب مقيس برمز ثابت (لا فشل صامت).
// القيم الرقمية قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا) وتوافق ما في villa-layout-v2: باب 0.8 م وبعد 0.15 م من وجه
// الجدار المتقاطع في طرفيه (≈ 1.22 م)؛ الباب 0.9 م متى اتسع الحد المشترك له.
export const DIRECT_DOOR_MIN_SPAN = 1.22;    // أدنى طول مشترك بين الفراغين يُركَّب عليه باب 0.8 م
export const DIRECT_DOOR_W = 0.9;            // عرض الباب المفضّل
export const DIRECT_DOOR_W_MIN = 0.8;        // أدنى عرض صافٍ للباب
export const DOOR_JAMB_CLEAR = 0.15;         // أدنى بعد بين حافة الباب وطرف الحد المشترك (وجه جدار متقاطع)
export const DOOR_GAP = 0.1;                 // أدنى فراغ بين حافتي بابين على الجدار نفسه
export const DOOR_WALL_ALLOW = 0.12;         // هامش سماكة الجدار المتقاطع (يُضاف إلى بعدي 0.15 م): باب 0.8 م = 0.8 + 0.3 + 0.12 = 1.22 م
const END_CLEAR = DOOR_JAMB_CLEAR + DOOR_WALL_ALLOW / 2;     // بعد حافة الباب عن طرف الحد المشترك
/** أدنى طول مشترك لباب بعرض w. */
export const spanNeeded = w => w + 2 * DOOR_JAMB_CLEAR + DOOR_WALL_ALLOW;
/** عرض الباب المقترح لطول مشترك معيّن؛ null إن لم يتسع باب. */
export const doorWidthFor = span => (span >= spanNeeded(DIRECT_DOOR_W) - 1e-9 ? DIRECT_DOOR_W : span >= spanNeeded(DIRECT_DOOR_W_MIN) - 1e-9 ? DIRECT_DOOR_W_MIN : null);

const TOL = 1e-3;
const SIDES = ['x0', 'x1', 'y0', 'y1'], OPP = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };
const edgeOf = (r, s) => (s === 'x0' || s === 'x1' ? { axis: 'x', at: r[s], from: r.y0, to: r.y1 } : { axis: 'y', at: r[s], from: r.x0, to: r.x1 });
/** الحد المشترك بين مستطيلين متلامسين على جدار واحد (أو null): { axis, at, from, to, side } */
export function sharedEdge(a, b) {
  for (const s of SIDES) {
    if (Math.abs(a[s] - b[OPP[s]]) > TOL) continue;
    const e = edgeOf(a, s), o = edgeOf(b, OPP[s]); const from = Math.max(e.from, o.from), to = Math.min(e.to, o.to);
    if (to - from > TOL) return { axis: e.axis, at: e.at, from, to, side: s };
  }
  return null;
}
/** أقرب مسافة بين مستطيلين (0 إن تلامسا أو تداخلا). */
export const gapBetween = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));

/** رموز الفشل (ثابتة؛ تُختبر وتُعرض): */
export const DIRECT_DOOR_FAIL = Object.freeze({
  same_room: 'الطرفان فراغ واحد.',
  different_levels: 'الفراغان في دورين مختلفين؛ لا يجمعهما جدار.',
  not_adjacent: 'الفراغان لا يتلامسان على جدار مشترك.',
  wall_too_short: 'الجدار المشترك أقصر من أن يُركَّب عليه باب.',
  no_clear_span: 'الجدار المشترك مشغول بأبواب أخرى فلا يتسع باب إضافي.',
  open_passage_instead: 'بين الفراغين فتحة مفتوحة (قوس/منزلق) لا باب.',
});

/**
 * a, b: مستطيلات { id, x0, x1, y0, y1, level? }؛ doors: أبواب التخطيط الحالية [{ a, b, edge, pos, w, kind }] (لكشف التزاحم).
 * يعيد { ok: true, via: 'existing' | 'new', door } أو { ok: false, code, why_ar, span?, gap? }.
 * لا يُغيّر المدخلات.
 */
export function planDirectDoor({ a, b, doors = [] }) {
  if (!a || !b || a.id === b.id) return { ok: false, code: 'same_room', why_ar: DIRECT_DOOR_FAIL.same_room };
  if (a.level != null && b.level != null && a.level !== b.level) return { ok: false, code: 'different_levels', why_ar: DIRECT_DOOR_FAIL.different_levels };
  const pair = d => (d.a === a.id && d.b === b.id) || (d.a === b.id && d.b === a.id);
  const had = doors.find(pair);
  if (had && ['door', 'door2'].includes(had.kind)) return { ok: true, via: 'existing', door: had };
  const e = sharedEdge(a, b);
  if (!e) return { ok: false, code: 'not_adjacent', why_ar: DIRECT_DOOR_FAIL.not_adjacent, gap: gapBetween(a, b) };
  const span = e.to - e.from;
  if (had) return { ok: false, code: 'open_passage_instead', why_ar: DIRECT_DOOR_FAIL.open_passage_instead, span };
  const w = doorWidthFor(span);
  if (w === null) return { ok: false, code: 'wall_too_short', why_ar: `${DIRECT_DOOR_FAIL.wall_too_short} (الطول المشترك ${Math.round(span * 100) / 100} م والمطلوب ≥ ${DIRECT_DOOR_MIN_SPAN} م).`, span };
  // أبواب الجدار نفسه: على المحور والإحداثي ذاتهما وتتقاطع مع الحد المشترك — تحجز مجالًا حول كل منها
  const taken = [];
  for (const d of doors) {
    const de = d.edge; if (!de || de.axis !== e.axis || Math.abs(de.at - e.at) > TOL) continue;
    const p = d.pos ?? (de.from + de.to) / 2, hw = (d.w ?? 0.9) / 2;
    if (p + hw + DOOR_GAP <= e.from || p - hw - DOOR_GAP >= e.to) continue;
    taken.push([p - hw - DOOR_GAP, p + hw + DOOR_GAP]);
  }
  taken.sort((x, y) => x[0] - y[0]);
  const lo = e.from + END_CLEAR + w / 2, hi = e.to - END_CLEAR - w / 2; // مجال مركز الباب
  // المراكز الممكنة: مجالات خالية من المحجوز؛ يُفضَّل أقرب مركز إلى منتصف الحد المشترك
  let cuts = [[lo, hi]];
  for (const [t0, t1] of taken) {
    const next = [];
    for (const [c0, c1] of cuts) {
      // مركز c يحجز [c - w/2, c + w/2]؛ يتعارض مع [t0, t1] إن c + w/2 > t0 و c - w/2 < t1
      const bad0 = t0 - w / 2, bad1 = t1 + w / 2;
      if (bad1 <= c0 || bad0 >= c1) { next.push([c0, c1]); continue; }
      if (bad0 > c0 + 1e-9) next.push([c0, bad0]);
      if (bad1 < c1 - 1e-9) next.push([bad1, c1]);
    }
    cuts = next;
  }
  cuts = cuts.filter(([c0, c1]) => c1 - c0 >= -1e-9);
  if (!cuts.length || lo > hi + 1e-9) return { ok: false, code: 'no_clear_span', why_ar: DIRECT_DOOR_FAIL.no_clear_span, span };
  const mid = (e.from + e.to) / 2;
  let best = null;
  for (const [c0, c1] of cuts) { const p = Math.max(c0, Math.min(c1, mid)); if (best === null || Math.abs(p - mid) < Math.abs(best - mid)) best = p; }
  const pos = Math.round(best * 100) / 100;
  return { ok: true, via: 'new', door: { a: a.id, b: b.id, edge: { axis: e.axis, at: e.at, from: e.from, to: e.to }, pos, kind: 'door', w } };
}

export default { planDirectDoor, sharedEdge, gapBetween, doorWidthFor, DIRECT_DOOR_MIN_SPAN, DIRECT_DOOR_W, DIRECT_DOOR_W_MIN, DOOR_JAMB_CLEAR, DOOR_GAP, DOOR_WALL_ALLOW, spanNeeded, DIRECT_DOOR_FAIL };
