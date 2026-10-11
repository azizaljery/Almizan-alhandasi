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

// A deletion target belongs to its own command, never to another action in
// the same request. Keep the production area guards separate and unchanged.
const deletionTokens = value => norm(value).split(/[^\p{L}\p{N}'-]+/u).filter(Boolean).map(word => word === 'الغ' || word === 'والغ' ? word : word.replace(/^ال/, ''));
const deletionCommands = new Set(['احذف', 'حذف', 'ازل', 'شيل', 'استبعد', 'استغن', 'الغ', 'delete', 'remove']);
const editCommands = new Set(['غير', 'بدل', 'استبدل', 'انقل', 'حرك', 'كبر', 'صغر', 'وسع', 'change', 'move', 'rename', 'replace', ...deletionCommands]);
const negativeDeletionWords = new Set(['لا', 'لم', 'لن', 'ليس', 'عدم', 'بدون', 'دون', 'without', "don't", 'not', 'no', 'never']);
const allWords = new Set(['كل', 'جميع', 'كافه', 'all', 'every']);
const genericRoomWords = new Set(['غرف', 'غرفه', 'room', 'rooms']);
const targetName = value => deletionTokens(value).filter(word => word !== 'the').join(' ');
function removalAuthorized(previous, removed, request) {
  if (!removed.length || actionIsNegated(request, removePattern)) return false;
  // Conservatively reject negated requests even when an ellipsis or a long
  // qualifier separates the negation from the deletion verb.
  if (deletionTokens(request).some(word => negativeDeletionWords.has(word) || negativeDeletionWords.has(word.replace(/^و/, '')))) return false;
  const targets = [];
  for (const clause of String(request).split(/[،,؛;.!?\n]/)) {
    const words = deletionTokens(clause);
    for (let i = 0; i < words.length; i++) {
      if (!deletionCommands.has(words[i].replace(/^و/, ''))) continue;
      const target = [];
      for (let j = i + 1; j < words.length; j++) {
        if (editCommands.has(words[j]) || editCommands.has(words[j].replace(/^و/, ''))) break;
        target.push(words[j]);
      }
      if (words[i].replace(/^و/, '') === 'استغن' && target[0] === 'عن') target.shift();
      if (target[0] === 'the') target.shift();
      if (['and', 'و'].includes(target.at(-1))) target.pop();
      const all = allWords.has(target[0]);
      if (all) target.shift();
      if (target[0] === 'the') target.shift();
      const groups = [[]];
      for (const word of target) {
        if (word === 'and' || word === 'و') groups.push([]);
        else if (/^وال/.test(word)) groups.push([word.slice(3)]);
        else groups.at(-1).push(word);
      }
      for (const group of groups) {
        if (group[0] === 'the') group.shift();
        if (group.length) targets.push({ text: group.join(' '), all });
      }
    }
  }
  return removed.every(room => targets.some(target => {
    const type = norm(room.type);
    const sameType = previous.filter(item => norm(item.type) === type);
    const term = typeTerms[type];
    const exactType = term && new RegExp('^(?:' + term.source + ')$', term.flags).test(target.text);
    // Preserve explicit all-of-type deletion, but its quantifier and type must
    // be in this deletion clause and all rooms of that type must be removed.
    if (genericRoomWords.has(target.text)) return false;
    if (target.all) return !!exactType && removed.filter(item => norm(item.type) === type).length === sameType.length;
    const name = targetName(room.name);
    if (target.text === name) return previous.filter(item => targetName(item.name) === name).length === 1;
    return !!exactType && sameType.length === 1;
  }));
}

function areaAuthorized(request, room, previous) {
  if (!areaPattern.test(norm(request)) || actionIsNegated(request, areaPattern)) return false;
  if (roomIsNamed(room, request)) return true;
  const type = norm(room.type);
  return previous.filter(item => norm(item.type) === type).length === 1 && !!typeTerms[type]?.test(norm(request));
}

function namedOrUniqueType(room, request, previous) {
  return roomIsNamed(room, request) ||
    (previous.filter(item => norm(item.type) === norm(room.type)).length <= 1 && !!typeTerms[norm(room.type)]?.test(norm(request)));
}
function protectedRoom(room, request, previous) {
  const clauses = norm(request).split(/[،,؛;.!?\n]/);
  return clauses.some(clause => {
    const negative = /(?:^|\s)(?:لا|لم|لن|بدون|دون|عدم|without|not|never|don't|do not)\s/.exec(clause);
    return negative && namedOrUniqueType(room, clause.slice(negative.index), previous);
  });
}
function additionAuthorized(room, request) {
  const source = norm(request);
  // Ambiguous negated additions are refused; a room mention alone is insufficient.
  if (/(?:^|\s)(?:لا|لم|لن|بدون|دون|عدم|without|not|never|don't)\s/.test(source)) return false;
  const action = /(?:اضف|اضافه|زد|زياده|\badd\b|\binclude\b|\bincrease\b|اجعل\s+عدد|اريد\s+عدد|عدد)/i;
  return source.split(/[،,؛;.!?\n]/).some(clause => {
    const match = action.exec(clause); if (!match) return false;
    const target = clause.slice(match.index + match[0].length);
    const type = norm(room.type), term = typeTerms[type];
    const namesRoom = roomIsNamed(room, target) || !!term?.test(target);
    const countAction = /عدد/.test(match[0]);
    return namesRoom && (!countAction || /[0-9]|واحد|اثن|اثنت|ثلاث|اربع|خمس|ست|سبع|ثمان|تسع|عشر/.test(target));
  });
}

export function diffRoomPrograms(previous, next, request = '', { requireChange = true, initial = false } = {}) {
  if (!Array.isArray(previous) || !Array.isArray(next)) throw Error('برنامج الغرف غير صالح.');
  const beforeSnapshot = structuredClone(previous), afterSnapshot = structuredClone(next);
  const group = rooms => {
    const result = new Map();
    for (const room of rooms) {
      const k = key(room);
      if (!result.has(k)) result.set(k, []);
      result.get(k).push(room);
    }
    return result;
  };
  const before = group(beforeSnapshot), after = group(afterSnapshot);
  const added = [], removed = [], changed = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const a = [...(before.get(k) || [])], b = [...(after.get(k) || [])];
    const pairs = [];
    // Match stable identities, then unchanged duplicate records, before pairing
    // remaining legacy records. Reordering must not produce a fictitious edit.
    for (let i = a.length - 1; i >= 0; i--) {
      const j = a[i].id != null ? b.findIndex(room => room.id === a[i].id) : -1;
      if (j >= 0) pairs.push([a.splice(i, 1)[0], b.splice(j, 1)[0]]);
    }
    for (let i = a.length - 1; i >= 0; i--) {
      const j = b.findIndex(room => JSON.stringify(room) === JSON.stringify(a[i]));
      if (j >= 0) pairs.push([a.splice(i, 1)[0], b.splice(j, 1)[0]]);
    }
    while (a.length && b.length) {
      const i = a.findIndex(left => b.some(right => left.id == null || right.id == null));
      if (i < 0) break;
      const j = b.findIndex(right => a[i].id == null || right.id == null);
      pairs.push([a.splice(i, 1)[0], b.splice(j, 1)[0]]);
    }
    for (const [left, right] of pairs) {
      const fields = [];
      if (Math.abs(area(left) - area(right)) > .01) fields.push({ name: 'area', from: area(left), to: area(right) });
      for (const field of new Set([...Object.keys(left), ...Object.keys(right)])) {
        if (['area', 'areaM2', 'name', 'type', 'id'].includes(field)) continue;
        if (JSON.stringify(left[field]) !== JSON.stringify(right[field])) fields.push({ name: field, from: left[field], to: right[field] });
      }
      if (fields.length) changed.push({ room: right.name, type: right.type, fields });
    }
    removed.push(...a);
    added.push(...b);
  }
  const blockers = [];
  if (!initial && removed.length && !removalAuthorized(previous, removed, request)) {
    blockers.push('الاقتراح يحذف غرفًا لم تحددها صراحةً. سمِّ الغرفة المطلوب حذفها، أو وضّح عدد ونوع الغرف التي تريد إزالتها.');
  }
  const unauthorizedAreas = changed.filter(row => row.fields.some(field => field.name === 'area') && !areaAuthorized(request, { name: row.room, type: row.type }, previous));
  if (!initial && unauthorizedAreas.length) {
    blockers.push('الاقتراح غيّر مساحة غرفة لم تحددها صراحةً؛ سمِّ الغرفة ومساحتها المطلوبة قبل المتابعة.');
  }
  // A named edit must not silently change another room's placement or dimensions.
  // Type-only references are unambiguous only when that type occurs once.
  const unauthorizedFields = changed.filter(row =>
    row.fields.some(field => ['position', 'side', 'dimensions'].includes(field.name)) &&
    (protectedRoom({name:row.room,type:row.type}, request, previous) ||
      !namedOrUniqueType({name:row.room,type:row.type}, request, previous)));
  if (!initial && unauthorizedFields.length) {
    blockers.push('الاقتراح غيّر موقع أو جهة أو أبعاد غرفة غير مستهدفة؛ سمِّ الغرفة المطلوب تعديلها صراحةً.');
  }
  if (!initial && added.some(room => !additionAuthorized(room, request))) {
    blockers.push('الاقتراح أضاف غرفة لم تطلب إضافتها صراحةً؛ حدّد اسم أو نوع الغرفة المطلوبة.');
  }
  const noChange = added.length + removed.length + changed.length === 0;
  if (requireChange && noChange) blockers.push('الاقتراح لم يغيّر برنامج الغرف؛ لن نعتبر إعادة الرسم نفسها تنفيذًا لتعديلك.');
  return { added, removed, changed, noChange, blockers, before: beforeSnapshot, after: afterSnapshot };
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
  const intro = first && first !== next ? 'المتطلبات الأصلية المعتمدة:\n' + first + '.\n\n' : '';
  const final = 'التعديل المطلوب الآن:\n' + next;
  if (intro.length + final.length > limit) throw Error('وصف المشروع طويل جدًا. اختصر النص الأصلي دون حذف المتطلبات المهمة.');
  const turns = Array.isArray(history) ? history : [];
  let text = intro + final;
  for (const turn of turns.slice().reverse()) {
    const segment = '\n\nملاحظة سابقة من العميل: ' + String(turn) + '.';
    if (text.length + segment.length + 2 > limit) throw Error('وصف المشروع طويل جدًا. اختصر النص دون حذف المتطلبات المعتمدة قبل المتابعة.');
    text = intro + segment + '\n\n' + text.slice(intro.length).trimStart();
  }
  return text;
}
