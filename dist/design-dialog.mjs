// Conservative checks: a proposed AI brief is not proof that a drawing changed.
const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').toLowerCase();
const key = room => norm(room.name) + '|' + norm(room.type);
const area = room => Number(room.area ?? room.areaM2);
const removePattern = /احذف|حذف|الغ|شيل|أزل|ازل|استبعد|استغن|remove|delete/i;
const areaPattern = /كبر|كبّر|وسع|وسّع|صغر|صغّر|قلل|زد|زيادة|مساح|متر|×|resize|larger|smaller|increase|reduce/i;
const renamePattern = /اسم|بدل|غيّر|غير|استبدل|rename|replace/i;

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
      if (fields.length) changed.push({ room: b[i].name, fields });
    }
    removed.push(...a.slice(common));
    added.push(...b.slice(common));
  }
  const blockers = [];
  if (!initial && removed.length && !removePattern.test(request) && !renamePattern.test(request)) {
    blockers.push('الاقتراح يحذف غرفًا لم تطلب حذفها؛ راجعه قبل إعادة الرسم.');
  }
  if (!initial && changed.some(x => x.fields.some(f => f.name === 'area')) && !areaPattern.test(request)) {
    blockers.push('الاقتراح غيّر مساحات غرف دون طلب واضح بذلك.');
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
    text = intro + segment + text.slice(intro.length);
  }
  return text;
}
