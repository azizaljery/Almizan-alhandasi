// «صورة داخلية احترافية»: لقطة بمستوى العين من مجسم داخلي مؤثث (مجلس/صالة/غرفة نوم رئيسية) ← نموذج الصور نفسه ← صورة داخلية واقعية.
// كل كلمة في البرومبت من جداول مغلقة هنا؛ لا نص حر من العميل. ما لم يُتحقق منه بعد: جودة الصورة الداخلية الفعلية وحفظ النموذج لأعداد القطع (لا وصول لـ Workers AI من بيئة التطوير).
export const INTERIOR_ROOMS = Object.freeze({
  majlis: { name: 'formal Arab majlis', text: 'a formal Arab majlis: low continuous upholstered seating units arranged back to the wall along the room edges in the traditional Arab seating layout, with large scatter cushions, a few small coffee tables in the middle of the room and one large patterned rug' },
  living: { name: 'family living room', text: 'a family living room: a three-seat sofa and armchairs arranged around a coffee table on a large rug, facing a low TV unit on the main wall' },
  master: { name: 'master bedroom', text: 'a master bedroom: a double bed with its headboard against a solid wall, a nightstand on each side, a wardrobe along another wall and a TV unit or dresser opposite the bed' },
});
export const INTERIOR_STYLES = Object.freeze({
  N: { name: 'Najdi', text: 'Najdi interior character: warm clay-colored hand-troweled plaster walls, carved gypsum (jiss) niches and a thin carved frieze near the ceiling, a ceiling of exposed natural timber beams, hand-woven wool Sadu-pattern rugs in deep red, ochre and black, upholstery in earthy red and sand fabrics, brass lanterns, a floor of honed sand-colored stone' },
  H: { name: 'Hijazi', text: 'Hijazi interior character: whitewashed lime plaster walls, carved teak mashrabiya screens and tall timber doors, painted timber ceiling panels, patterned encaustic floor tiles in muted tones, brass lamps, damask and velvet upholstery in deep green, burgundy and cream' },
  S: { name: 'Salmani', text: 'Salmani interior character: wall panels of sand-colored Riyadh limestone, thin dark bronze trims, geometric carved gypsum screens, warm oak joinery, a muted geometric wool rug, low-profile upholstery in camel, oatmeal and charcoal, honed limestone floor' },
  C: { name: 'Classical', text: 'classical interior character: moulded cornices and a ceiling rosette, raised wall panelling with fine mouldings, cream marble floor with a darker border, tufted upholstery in cream and gold-beige, silk curtains with pelmets, a crystal chandelier' },
  M: { name: 'Light contemporary', text: 'light contemporary interior character: smooth off-white mineral plaster walls, slim dark aluminium frames, natural oak veneer joinery, linen and boucle upholstery in warm grey and cream, a plain wool rug, recessed linear ceiling lighting, large-format light porcelain floor' },
  J: { name: 'Stone contemporary', text: 'stone contemporary interior character: honed travertine wall cladding with legible veining, bronze-anodized metal trims, walnut joinery, upholstery in taupe and boucle, warm timber ceiling accents, a travertine floor' },
});
export const INTERIOR_LIGHTING = Object.freeze({
  day: 'Lighting: soft clear daylight entering through the existing windows, neutral white balance, gentle open shadows, interior lamps off or very low.',
  golden: 'Lighting: warm late-afternoon light entering through the existing windows with only a slight warmth, plus soft warm lamp light; no orange cast.',
  night: 'Lighting: evening, warm (about 2700K) soft light from the existing ceiling and lamp positions, the windows show a deep blue evening sky, rich but readable material colors, no blown highlights.',
});
export const INTERIOR_LOOK = 'Look: calm editorial interior photography, natural soft light, neutral white balance, balanced exposure, realistic muted colors, visible shadow detail, true-to-life fabric and material textures; no oversaturation, no HDR look, no heavy vignette, no lens flare.';
export const INTERIOR_GEOMETRY_RULES = 'Strict constraints: keep the exact room layout, camera position and angle, wall positions, ceiling height, and the positions, sizes and proportions of every door, window, opening and main piece of furniture in the reference image; only upgrade materials, fabrics, lighting and realism; do not add, remove, move, merge or resize any door, window, opening or piece of furniture; do not change the framing or crop. No people, no pets, no cars, no text, no logos, no watermark, no framed pictures with text.';
export const INTERIOR_AVOID = 'Avoid: extra or missing windows or doors, extra furniture, a different room layout, a different ceiling shape, distorted or melted furniture, duplicated cushions, bent walls, a cartoon or CGI look.';
export const INTERIOR_PIECES = Object.freeze({
  'majlis-sofa': 'Arab seating unit', 'sofa-3': 'three-seat sofa', 'sofa-2': 'two-seat sofa', armchair: 'armchair', 'coffee-table': 'coffee table', 'tv-unit': 'TV unit',
  rug: 'rug', 'bed-double': 'double bed', nightstand: 'nightstand', wardrobe: 'wardrobe', plant: 'potted plant',
});
export const INTERIOR_COUNT_MAX = 12;
export const INTERIOR_VIEW = 'The reference image is a simple 3D render of the interior of a private villa in Saudi Arabia, shot at eye level (1.5 metres) with a wide-angle lens.';

const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const smallInt = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
/** يطبّع وصف الغرفة الداخلية؛ قيم غير معروفة في الحقول الإلزامية (room/style) ترمي invalid_input، وغير المعروف من pieces يُهمل. */
export function normalizeInteriorDescription(d) {
  if (!record(d)) throw new Error('invalid_input');
  if (typeof d.room !== 'string' || !Object.hasOwn(INTERIOR_ROOMS, d.room)) throw new Error('invalid_input');
  if (typeof d.style !== 'string' || !Object.hasOwn(INTERIOR_STYLES, d.style)) throw new Error('invalid_input');
  if (d.lighting !== undefined && !(typeof d.lighting === 'string' && Object.hasOwn(INTERIOR_LIGHTING, d.lighting))) throw new Error('invalid_input');
  const c = record(d.counts) ? d.counts : {};
  for (const k of ['doors', 'windows']) if (c[k] !== undefined && !smallInt(c[k], 8)) throw new Error('invalid_input');
  if (d.pieces !== undefined && !record(d.pieces)) throw new Error('invalid_input');
  const pieces = {}; for (const [k, v] of Object.entries(d.pieces || {})) if (Object.hasOwn(INTERIOR_PIECES, k)) { if (!smallInt(v, INTERIOR_COUNT_MAX)) throw new Error('invalid_input'); if (v > 0) pieces[k] = v; }
  return { kind: 'interior', room: d.room, style: d.style, lighting: d.lighting || 'golden', counts: { ...(c.doors !== undefined ? { doors: c.doors } : {}), ...(c.windows !== undefined ? { windows: c.windows } : {}) }, pieces };
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export function buildInteriorPrompt(description) {
  const d = normalizeInteriorDescription(description), r = INTERIOR_ROOMS[d.room], st = INTERIOR_STYLES[d.style];
  const pcs = Object.entries(d.pieces).map(([k, n]) => `${n} ${INTERIOR_PIECES[k]}${n > 1 ? 's' : ''}`);
  const cnt = [d.counts.doors !== undefined ? plural(d.counts.doors, 'door or archway opening', 'door or archway openings') : '', d.counts.windows !== undefined ? plural(d.counts.windows, 'window', 'windows') : ''].filter(Boolean);
  return [
    'Turn the reference image into a realistic, calm editorial interior photograph of the same room.',
    INTERIOR_VIEW,
    `It is a ${r.name} in ${st.name} style: ${r.text}.`,
    cnt.length ? `The visible walls show exactly ${cnt.join(' and ')}; keep exactly that many, in the same places.` : '',
    pcs.length ? `The main furniture to keep exactly as placed: ${pcs.join(', ')}.` : '',
    INTERIOR_GEOMETRY_RULES,
    st.text + '.',
    INTERIOR_LIGHTING[d.lighting], INTERIOR_LOOK,
    'Photography: full-frame camera with a 20mm lens at eye level, vertical lines kept vertical, sharp fine detail, legible real-world material texture (fabric weave, wood grain, stone, plaster), subtle natural wear.',
    INTERIOR_AVOID,
  ].filter(Boolean).join(' ');
}
export const INTERIOR_LIMITS = Object.freeze({ dailyCapDefault: 10, dailyCapMax: 200 });
/** سقف الداخلية اليومي: افتراضي صغير (10)؛ 0 يوقفها؛ PHOTO_INTERIOR_ENABLED=0/false مفتاح إيقاف صريح. */
export function interiorCap(env = {}) {
  const off = String(env.PHOTO_INTERIOR_ENABLED ?? '').trim().toLowerCase(); if (off === '0' || off === 'false' || off === 'off') return 0;
  const raw = env.PHOTO_INTERIOR_DAILY_CAP; if (raw === undefined || raw === null || String(raw).trim() === '') return INTERIOR_LIMITS.dailyCapDefault;
  const n = Number(raw); return Number.isInteger(n) && n >= 0 ? Math.min(n, INTERIOR_LIMITS.dailyCapMax) : INTERIOR_LIMITS.dailyCapDefault;
}
