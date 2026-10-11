// Conservative checks: a proposed AI brief is not proof that a drawing changed.
const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').toLowerCase();
const key = room => norm(room.name) + '|' + norm(room.type);
const area = room => Number(room.area ?? room.areaM2);
// Permission is local to an affirmative command and one unambiguous room name.
const tokens = value => norm(value).replace(/[\u064b-\u065f\u0670]/g, '').split(/[^\p{L}\p{N}-]+/u).filter(Boolean).map(t => t.replace(/^ال/, ''));
const deletionCommands = new Set(['احذف', 'ازل', 'شيل', 'استبعد', 'الغ', 'delete', 'remove']);
const actionWords = new Set(['غير', 'بدل', 'استبدل', 'انقل', 'حرك', 'كبر', 'صغر', 'وسع', 'change', 'move', 'rename', 'replace', ...deletionCommands]);
const genericNames = new Set(['غرف', 'غرفه', 'غرفه نوم', 'نوم', 'room', 'rooms']);
const negativeWords = new Set(['لا', 'لم', 'لن', 'عدم', 'دون', 'بدون', 'ليس', 'لاتحذف', 'dont', 'not', 'never']);
function removalAuthorized(room, previous, request) {
  const name = tokens(room.name).filter(t => t !== 'the');
  if (!name.length || name.every(t => ['غرف', 'غرفه', 'room', 'rooms'].includes(t))) return false;
  // Identical names need a more precise request; never guess which instance was meant.
  if (previous.filter(r => tokens(r.name).join(' ') === name.join(' ')).length !== 1) return false;
  for (const clause of String(request).split(/[،,؛;.!?\n]/)) {
    const words = tokens(clause);
    // Conservative around negation, including Arabic inflections and English don't.
    if (words.some(t => negativeWords.has(t) || t === 'don')) continue;
    for (let i = 0; i < words.length; i++) {
      if (!deletionCommands.has(words[i].replace(/^و/, ''))) continue;
      const target = [];
      for (let j = i + 1; j < words.length; j++) {
        const word = words[j].replace(/^و/, '');
        if (actionWords.has(word)) break;
        target.push(words[j]);
      }
      if (target[0] === 'the') target.shift();
      if (['and', 'و'].includes(target.at(-1))) target.pop();
      // Full name must immediately follow the deletion command. Prefix aliases such
      // as الصالة are accepted only if unique; generic غرفة never authorizes deletion.
      if (target.length === name.length && name.every((t, j) => target[j] === t)) return true;
      const first = target[0];
      if (target.length === 1 && first && !genericNames.has(first) && name[0] === first && previous.filter(r => tokens(r.name)[0] === first).length === 1) return true;
    }
  }
  return false;
}
const areaPattern = /كبر|كبّر|وسع|وسّع|صغر|صغّر|قلل|زد|زيادة|مساح|متر|×|resize|larger|smaller|increase|reduce/i;

export function diffRoomPrograms(previous, next, request = '', { requireChange = true, initial = false } = {}) {
  if (!Array.isArray(previous) || !Array.isArray(next)) throw Error('برنامج الغرف غير صالح.');
  // Retain the precise proposal reviewed, even when the caller later edits its arrays.
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
    // Match stable identities first, then exact unchanged duplicates. Array order is
    // not identity, and a removed duplicate must not masquerade as an area change.
    for (let i = a.length - 1; i >= 0; i--) {
      const j = a[i].id != null ? b.findIndex(r => r.id === a[i].id) : -1;
      if (j >= 0) pairs.push([a.splice(i, 1)[0], b.splice(j, 1)[0]]);
    }
    for (let i = a.length - 1; i >= 0; i--) {
      const j = b.findIndex(r => JSON.stringify(r) === JSON.stringify(a[i]));
      if (j >= 0) pairs.push([a.splice(i, 1)[0], b.splice(j, 1)[0]]);
    }
    while (a.length && b.length) {
      // Different explicit IDs are additions/removals, not the same room.
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
      if (fields.length) changed.push({ room: right.name, fields });
    }
    removed.push(...a);
    added.push(...b);
  }
  const blockers = [];
  if (!initial && removed.some(room => !removalAuthorized(room, beforeSnapshot, request))) {
    blockers.push('الاقتراح يحذف غرفًا لم تطلب حذفها؛ راجعه قبل إعادة الرسم.');
  }
  if (!initial && changed.some(x => x.fields.some(f => f.name === 'area')) && !areaPattern.test(request)) {
    blockers.push('الاقتراح غيّر مساحات غرف دون طلب واضح بذلك.');
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
  const intro = first && first !== next ? 'المتطلبات الأصلية المعتمدة:\n' + first + '\n\n' : '';
  const final = 'التعديل المطلوب الآن:\n' + next;
  if (intro.length + final.length > limit) throw Error('وصف المشروع طويل جدًا. اختصر النص الأصلي دون حذف المتطلبات المهمة.');
  const turns = (Array.isArray(history) ? history : []).slice(-8);
  let text = intro + final;
  for (const turn of turns.slice().reverse()) {
    const segment = '\n\nملاحظة سابقة من العميل: ' + String(turn).slice(0, 450);
    if (text.length + segment.length > limit) break;
    text = intro + segment + text.slice(intro.length);
  }
  return text;
}
