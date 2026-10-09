// Deterministic guard for explicitly measurable user requirements.
// AI can interpret the rest, but must not silently drop exact counts or room dimensions.
const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const words = { واحد: 1, واحده: 1, واحدة: 1, اثنين: 2, اثنتين: 2, اثنان: 2, اثنتان: 2, غرفتين: 2, ثلاث: 3, ثلاثة: 3, ثلاثه: 3, اربع: 4, اربعة: 4, اربعه: 4, خمس: 5, خمسة: 5, خمسه: 5, ست: 6, ستة: 6, سته: 6, سبع: 7, سبعة: 7, سبعه: 7, ثمان: 8, ثمانية: 8, ثمانيه: 8, تسع: 9, تسعة: 9, تسعه: 9, عشر: 10, عشرة: 10, عشره: 10 };
export function normalizeBriefText(value) {
  return String(value ?? '').slice(0, 4000).normalize('NFKC')
    .replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(persianDigits.indexOf(digit)))
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}
const count = value => /^\d+$/.test(value) ? Number(value) : words[value] ?? null;
const roomType = label => /مستودع|مخزن|storage/i.test(label) ? 'storage'
  : /مطبخ|kitchen/i.test(label) ? 'kitchen'
  : /مجلس|majlis/i.test(label) ? 'majlis' : null;
const roomNameMatches = (room, label) => {
  if (room.type !== roomType(label)) return false;
  const name = normalizeBriefText(room.name);
  if (/رجال|الرجال/.test(label)) return /رجال/.test(name);
  if (/نساء|النساء/.test(label)) return /نساء/.test(name);
  return true;
};

export function extractExplicitProgramRequirements(text) {
  const source = normalizeBriefText(text);
  const result = new Map();
  const bedrooms = /(?:^|[\s،؛])(\d+|واحده?|اثنين|اثنتين|اثنان|ثلاثه?|اربعه?|خمسه?|سته?|سبعه?|ثمانيه?|تسعه?|عشره?)\s+(?:غرف(?:ة|ه)?\s+نوم|غرف\s+النوم|bedrooms?)/giu;
  for (const match of source.matchAll(bedrooms)) {
    const n = count(match[1]);
    if (n !== null && n >= 1 && n <= 20) result.set('bedrooms', { id: 'bedrooms', kind: 'minimum-count', label: 'غرف النوم', expected: n });
  }
  for (const match of source.matchAll(/(?:^|[\s،؛])(\d+)\s+bedrooms?/giu)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= 20) result.set('bedrooms', { id: 'bedrooms', kind: 'minimum-count', label: 'غرف النوم', expected: n });
  }
  for (const [id, expression, label] of [
    ['men-majlis', /مجلس\s+(?:ال)?رجال/, 'مجلس الرجال'],
    ['women-majlis', /مجلس\s+(?:ال)?نساء/, 'مجلس النساء'],
  ]) if (expression.test(source)) result.set(id, { id, kind: 'required-room', label });
  const dimensionPattern = /(?:^|[\s،؛])((?:ال)?مطبخ|(?:ال)?مستودع|(?:ال)?مخزن|مجلس\s+(?:ال)?رجال|مجلس\s+(?:ال)?نساء)\s*(?:(?:ب)?مساحه|مقاس|ابعاد|الى|ليكون|:)?\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/giu;
  for (const match of source.matchAll(dimensionPattern)) {
    const label = match[1], w = Number(match[2]), h = Number(match[3]);
    if (!(w >= 1 && w <= 50 && h >= 1 && h <= 50)) continue;
    const id = 'area:' + (roomType(label) || 'other') + (label.includes('رجال') ? ':men' : label.includes('نساء') ? ':women' : '');
    result.set(id, { id, kind: 'room-area', label, expected: w * h, width: w, length: h });
  }
  return [...result.values()];
}

export function verifyProposedProgram(text, rooms) {
  if (!Array.isArray(rooms)) throw Error('قائمة الغرف المقترحة غير صالحة.');
  const requirements = extractExplicitProgramRequirements(text);
  const violations = [];
  for (const rule of requirements) {
    if (rule.kind === 'minimum-count') {
      const found = rooms.filter(room => room.type === 'bedroom').length;
      if (found < rule.expected) violations.push('طلبت ' + rule.expected + ' غرف نوم، لكن الاقتراح يتضمن ' + found + ' فقط.');
    } else if (rule.kind === 'required-room') {
      const found = rooms.some(room => room.type === 'majlis' &&
        (rule.id === 'men-majlis' ? /رجال/.test(normalizeBriefText(room.name)) : /نساء/.test(normalizeBriefText(room.name))));
      if (!found) violations.push('لم يظهر ' + rule.label + ' بوضوح في برنامج الغرف المقترح.');
    } else if (rule.kind === 'room-area') {
      const matches = rooms.filter(room => roomNameMatches(room, rule.label));
      const found = matches.some(room => Math.abs(Number(room.area ?? room.areaM2) - rule.expected) <= .25);
      if (!found) violations.push('طلبت ' + rule.label + ' بمساحة ' + rule.width + '×' + rule.length +
        ' م (' + rule.expected + ' م²)، لكن الاقتراح لا يحتوي غرفة مطابقة.');
    }
  }
  return { requirements, violations, pass: violations.length === 0 };
}
