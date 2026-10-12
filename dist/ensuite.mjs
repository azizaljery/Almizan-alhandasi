// الحمام الملحق بغرفة النوم: ربط كل غرفة نوم بحمامها قبل التوليد، ثم فتح باب مباشر بينهما بعد التوليد.
// لا يغيّر خوارزمية التوزيع نفسها؛ يستعمل علاقة «قرب» المدعومة أصلًا في المحرك، ويضيف بابًا حقيقيًا
// على الجدار المشترك بين الغرفتين (ويحذف باب الحمام إلى الممر) فقط عند وجود تجاور فعلي.
const E = 1e-6;
const GUEST_BATH = /ضيوف|ضيافة|مجلس|عام|زوار|خدمة|خادمة|سائق/u;
const DOOR_WIDTH = .8;

/** أزواج (غرفة نوم، حمام) بحسب ترتيب البرنامج؛ حمامات الضيوف والخدمة لا تُربط بغرفة نوم. */
export function ensuitePairs(program = []) {
  const bedrooms = program.filter(room => room.type === 'bedroom');
  const baths = program.filter(room => room.type === 'bath' && !GUEST_BATH.test(room.name || ''));
  const count = Math.min(bedrooms.length, baths.length, 8);
  return Array.from({ length: count }, (_, i) => ({ bedroomId: bedrooms[i].id, bathId: baths[i].id }));
}

/** علاقات القرب التي يقبلها بحث المحرك المستطيل (حد أقصى ثماني علاقات). */
export function ensuiteRelationships(program = []) {
  return ensuitePairs(program).map(pair => ({ roomIds: [pair.bedroomId, pair.bathId], relation: 'near', weight: 3 }));
}

// الحافة المشتركة بين مستطيلين: { axis: 'v'|'h', at, from, to } أو null.
function sharedEdge(a, b) {
  const xo = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const yo = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const tol = .35; // سماكة الجدار بين الفراغين
  if (xo > DOOR_WIDTH + .4 && (Math.abs(a.y + a.h - b.y) < tol || Math.abs(b.y + b.h - a.y) < tol)) {
    const at = Math.abs(a.y + a.h - b.y) < tol ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2;
    return { axis: 'h', at, from: Math.max(a.x, b.x), to: Math.min(a.x + a.w, b.x + b.w) };
  }
  if (yo > DOOR_WIDTH + .4 && (Math.abs(a.x + a.w - b.x) < tol || Math.abs(b.x + b.w - a.x) < tol)) {
    const at = Math.abs(a.x + a.w - b.x) < tol ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2;
    return { axis: 'v', at, from: Math.max(a.y, b.y), to: Math.min(a.y + a.h, b.y + b.h) };
  }
  return null;
}

/**
 * يضيف بابًا بين كل غرفة نوم وحمامها المتجاور ويحذف باب الحمام إلى الممر.
 * يعدّل النموذج المولَّد حديثًا في مكانه ويعيد عدد الأجنحة التي تم ربطها.
 */
export function applyEnsuiteDoors(model, pairs) {
  if (!pairs?.length || !Array.isArray(model?.walls) || !Array.isArray(model?.openings)) return 0;
  let linked = 0;
  for (const { bedroomId, bathId } of pairs) {
    const bed = model.rooms.find(r => r.id === bedroomId), bath = model.rooms.find(r => r.id === bathId);
    if (!bed || !bath) continue;
    const edge = sharedEdge(bed, bath);
    if (!edge) continue;
    // الجدار الحامل للباب: جدار موازٍ للحافة يغطي موضع الباب.
    const doorAt = edge.from + (edge.to - edge.from) * .72;
    const wall = model.walls.find(w => {
      const vertical = Math.abs(w.x1 - w.x2) < E, horizontal = Math.abs(w.y1 - w.y2) < E;
      if (edge.axis === 'v') return vertical && Math.abs(w.x1 - edge.at) < .2 && Math.min(w.y1, w.y2) - E <= doorAt - DOOR_WIDTH / 2 && Math.max(w.y1, w.y2) + E >= doorAt + DOOR_WIDTH / 2;
      return horizontal && Math.abs(w.y1 - edge.at) < .2 && Math.min(w.x1, w.x2) - E <= doorAt - DOOR_WIDTH / 2 && Math.max(w.x1, w.x2) + E >= doorAt + DOOR_WIDTH / 2;
    });
    if (!wall) continue;
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const along = edge.axis === 'v' ? doorAt - Math.min(wall.y1, wall.y2) : doorAt - Math.min(wall.x1, wall.x2);
    let pos = along / length;
    if (edge.axis === 'v' ? wall.y2 < wall.y1 : wall.x2 < wall.x1) pos = 1 - pos;
    if (!(pos > 0 && pos < 1)) continue;
    // لا يتعارض مع فتحة أخرى على الجدار نفسه.
    const clash = model.openings.some(o => o.wallId === wall.id && Math.abs(o.pos - pos) * length < (o.w + DOOR_WIDTH) / 2 + .1);
    if (clash) continue;
    model.openings = model.openings.filter(o => !(o.type === 'door' && o.roomId === bathId && !o.connects?.includes(bedroomId)));
    const used = new Set(model.openings.map(o => o.id));
    let n = model.openings.length; while (used.has(`opening-${n}`)) n++;
    model.openings.push({ type: 'door', w: DOOR_WIDTH, h: 2.1, sill: 0, roomId: bedroomId, connects: [bedroomId, bathId], id: `opening-${n}`, wallId: wall.id, pos });
    linked++;
  }
  return linked;
}

/** كم غرفة نوم لها باب مباشر إلى حمامها في هذا النموذج. */
export function ensuiteCoverage(model) {
  const pairs = ensuitePairs(model?.program || []);
  const linked = pairs.filter(({ bedroomId, bathId }) => (model.openings || []).some(o => o.type === 'door' && o.connects?.includes(bedroomId) && o.connects?.includes(bathId))).length;
  return { wanted: pairs.length, linked };
}

const PROPORTION_TYPES = new Set(['bedroom', 'majlis', 'living', 'dining', 'kitchen', 'office']);
/** أسوأ نسبة طول إلى عرض بين الغرف الرئيسية (1 = مربع تمامًا). */
export function worstProportion(model) {
  const ratios = (model?.rooms || []).filter(r => PROPORTION_TYPES.has(r.type)).map(r => Math.max(r.w / r.h, r.h / r.w));
  return ratios.length ? Math.max(...ratios) : 1;
}

/** درجة جودة العرض للعميل: الأصغر أفضل — حمام داخل كل غرفة أولًا ثم تناسب أبعاد الغرف. */
export function presentationPenalty(model) {
  const { wanted, linked } = ensuiteCoverage(model);
  return (wanted - linked) * 10 + Math.max(0, worstProportion(model) - 1.6);
}
