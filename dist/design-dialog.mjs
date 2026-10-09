// Conservative checks for proposed conversational edits. A broad edit verb such as
// “change” or “rename” never authorizes removing unrelated rooms.
const norm = value => String(value ?? '').trim().normalize('NFKC')
  .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ').toLowerCase();
const key = room => norm(room.name) + '|' + norm(room.type);
const area = room => Number(room.area ?? room.areaM2);
const removePattern = /احذف|حذف|الغ|شيل|از(?:ل|الة)|استبعد|استغن|remove|delete/i;
const areaPattern = /كبر|وسع|صغر|قلل|خفض|ضيق|resize|larger|smaller|enlarge|expand|shrink|مساح|حجم|ابعاد|مقاس|متر\s*(?:مربع|مربعه)|م(?:2|²)|sqm|m(?:2|²)|(?:\d+(?:\.\d+)?)\s*[×xX*]\s*\d+(?:\.\d+)?/i;
const negationPattern = /(?:لا|لم|لن|ليس|عدم|بدون|دون|without|don't|do\s+not|not|no)(?:\s+\S+){0,3}\s*$/iu;

function actionIsNegated(request, actionPattern) {
  const source = norm(request);
  const actions = new RegExp(actionPattern.source, actionPattern.flags.replace('g', '') + 'g');
  for (const match of source.matchAll(actions)) {
    const prefix = source.slice(Math.max(0, match.index - 55), match.index);
    if (negationPattern.test(prefix)) return true;
  }
  return false;
}

const typeTerms = {
  bedroom: /غرف(?:ه|تين)?(?:\s+(?:نوم|النوم))?|bedrooms?/i,
  living: /صاله|معيشه|living(?:\s+room)?/i,
  dining: /سفره|طعام|dining(?:\s+room)?/i,
  kitchen: /مطبخ|kitchen/i,
  majlis: /مجلس|مجالس|majlis/i,
  bath: /حمام|حمامات|bathrooms?/i,
  storage: /مستودع|مخزن|storage/i,
};

function roomIsNamed(room, request) {
  const name = norm(room.name);
  return name.length >= 4 && norm(request).includes(name);
}

function removalAuthorized(previous, removed, request) {
  if (!removePattern.test(request) || !removed.length || actionIsNegated(request, removePattern)) return false;
  const text = norm(request);
  const byType = new Map();
  for (const room of removed) {
    const type = norm(room.type);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(room);
  }
  for (const [type, rows] of byType) {
    const named = rows.filter(room => roomIsNamed(room, text));
    if (named.length === rows.length) continue;
    // Generic type deletion is supported only when it is unambiguous. Multiple
    // same-type rooms require naming each one, or an explicit all-of-type request.
    const term = typeTerms[type];
    if (!term?.test(text)) return false;
    const previousCount = previous.filter(room => norm(room.type) === type).length;
    const allOfType = /(?:كل|جميع|كافه|all|every)/i.test(text);
    if (allOfType && rows.length === previousCount) continue;
    if (previousCount === 1 && rows.length === 1) continue;
    return false;
  }
  return true;
}

function areaAuthorized(request, room, previous) {
  if (!areaPattern.test(norm(request)) || actionIsNegated(request, areaPattern)) return false;
  if (roomIsNamed(room, request)) return true;
  const type = norm(room.type);
  return previous.filter(item => norm(item.type) === type).length === 1 && !!typeTerms[type]?.test(norm(request));
}

export function diffRoomPrograms(previous, next, request = '', { requireChange = true, initial = false } = {}) {
  if (!Array.isArray(previous) || !Array.isArray(next)) throw Error('برنامج الغرف غير صالح.');
  const group = rooms => {
    const result = new Map();
    for (const room of rooms) {
      const k = key(room);
      if (!result.has(k)) result.set(k, []);
      result.get(k).push(room);
    }
    return result;
  };
  const before = group(previous), after = group(next);
  const added = [], removed = [], changed = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(k) || [], b = after.get(k) || [];
    const common = Math.min(a.length, b.length);
    for (let i = 0; i < common; i++) {
      const fields = [];
      if (Math.abs(area(a[i]) - area(b[i])) > .01) fields.push({ name: 'area', from: area(a[i]), to: area(b[i]) });
      if (norm(a[i].position) !== norm(b[i].position)) fields.push({ name: 'position', from: a[i].position, to: b[i].position });
      if (norm(a[i].side) !== norm(b[i].side)) fields.push({ name: 'side', from: a[i].side, to: b[i].side });
      if (fields.length) changed.push({ room: b[i].name, type: b[i].type, fields });
    }
    removed.push(...a.slice(common));
    added.push(...b.slice(common));
  }
  const blockers = [];
  if (!initial && removed.length && !removalAuthorized(previous, removed, request)) {
    blockers.push('الاقتراح يحذف غرفًا لم تحددها صراحةً. سمِّ الغرفة المطلوب حذفها، أو وضّح عدد ونوع الغرف التي تريد إزالتها.');
  }
  const unauthorizedAreas = changed.filter(row => row.fields.some(field => field.name === 'area') && !areaAuthorized(request, { name: row.room, type: row.type }, previous));
  if (!initial && unauthorizedAreas.length) {
    blockers.push('الاقتراح غيّر مساحة غرفة لم تحددها صراحةً؛ سمِّ الغرفة ومساحتها المطلوبة قبل المتابعة.');
  }
  const noChange = added.length + removed.length + changed.length === 0;
  if (requireChange && noChange) blockers.push('الاقتراح لم يغيّر برنامج الغرف؛ لن نعتبر إعادة الرسم نفسها تنفيذًا لتعديلك.');
  return { added, removed, changed, noChange, blockers };
}

export function geometryFingerprint(model) {
  if (!model?.rooms) return null;
  const rect = r => [r.id, r.name, r.type, r.x, r.y, r.w, r.h].map(v => v ?? null);
  return JSON.stringify({
    shape: model.shape,
    rooms: model.rooms.map(rect).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    corridors: (model.corridors || []).map(r => [r.x, r.y, r.w, r.h]),
    courtyards: (model.courtyards || []).map(r => [r.x, r.y, r.w, r.h]),
    openings: (model.openings || []).map(o => [o.wallId, o.type, o.at, o.w, o.h]),
  });
}

export function composeDesignConversation(initial, history, latest, limit = 3900) {
  const first = String(initial || '').trim(), next = String(latest || '').trim();
  if (!next) throw Error('اكتب طلبك أو التعديل الذي تريده.');
  const intro = first && first !== next ? 'المتطلبات الأصلية المعتمدة:\n' + first + '\n\n' : '';
  const final = 'التعديل المطلوب الآن:\n' + next;
  if (intro.length + final.length > limit) throw Error('وصف المشروع طويل جدًا. اختصر النص الأصلي دون حذف المتطلبات المهمة.');
  const turns = (Array.isArray(history) ? history : []).slice(-8);
  let text = intro + final;
  for (const turn of turns.slice().reverse()) {
    const segment = '\n\nملاحظة سابقة من العميل: ' + String(turn).slice(0, 450);
    if (text.length + segment.length > limit) break;
    text = intro + segment + '\n\n' + text.slice(intro.length).trimStart();
  }
  return text;
}
