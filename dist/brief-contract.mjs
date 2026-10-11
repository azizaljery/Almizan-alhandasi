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
export function extractPlotDimensions(text) {
  const source = normalizeBriefText(text);
  const match = source.match(/(?:^|[\s،؛])(?:ال)?ارض(?:ي|نا)?\s*(?:(?:ب)?ابعاد|مقاس|:)?\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/iu);
  if (!match) return null;
  const width = Number(match[1]), length = Number(match[2]);
  if (!(width >= 8 && width <= 100 && length >= 8 && length <= 100)) return null;
  return { width, length };
}

const englishNumbers = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
const numberWords = { ...words, صفر: 0, احد: 1, احدى: 1, ثماني: 8, عشرون: 20, عشرين: 20, ...Object.fromEntries(englishNumbers.map((word, i) => [word, i])) };
for (const [first, n] of Object.entries({ احد: 1, احدى: 1, اثنا: 2, اثني: 2, اثنتا: 2, اثنتي: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, تسع: 9, تسعه: 9 })) {
  numberWords[first + ' عشر'] = 10 + n;
  numberWords[first + ' عشره'] = 10 + n;
}
for (const [tensWord, tens] of Object.entries({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 })) {
  numberWords[tensWord] = tens;
  for (let unit = 1; unit <= 9; unit++) {
    numberWords[tensWord + ' ' + englishNumbers[unit]] = tens + unit;
    numberWords[tensWord + '-' + englishNumbers[unit]] = tens + unit;
  }
}
for (const [tensWord, tens] of Object.entries({ عشرون: 20, عشرين: 20, ثلاثون: 30, ثلاثين: 30, اربعون: 40, اربعين: 40, خمسون: 50, خمسين: 50, ستون: 60, ستين: 60, سبعون: 70, سبعين: 70, ثمانون: 80, ثمانين: 80, تسعون: 90, تسعين: 90 })) {
  numberWords[tensWord] = tens;
  for (const [unitWord, unit] of Object.entries(words)) if (unit >= 1 && unit <= 9 && unitWord !== 'غرفتين') {
    numberWords[unitWord + ' و' + tensWord] = tens + unit;
  }
}
const count = value => /^\d+$/.test(value) ? Number(value) : numberWords[value.toLowerCase()] ?? null;
const roomType = label => /مستودع|مخزن|storage/i.test(label) ? 'storage'
  : /مطبخ|مطابخ|kitchen/i.test(label) ? 'kitchen'
  : /مجلس|مجالس|majlis/i.test(label) ? 'majlis'
  : /نوم|bedroom/i.test(label) ? 'bedroom'
  : /حمام|حمامات|دور(?:ه|ات) مياه|bathroom/i.test(label) ? 'bath'
  : /صاله|صالات|living/i.test(label) ? 'living' : null;
const roomNameMatches = (room, label) => {
  if (room.type !== roomType(label)) return false;
  const name = normalizeBriefText(room.name);
  if (/رجال|\bmen(?:'s)?\b/i.test(label)) return /رجال|\bmen(?:'s)?\b/i.test(name);
  if (/نساء|\bwomen(?:'s)?\b/i.test(label)) return /نساء|\bwomen(?:'s)?\b/i.test(name);
  return true;
};
const numberPattern = '(?:\\d+|' + Object.keys(numberWords).sort((a, b) => b.length - a.length).join('|') + ')';
const countLabel = '(?:غرف(?:ه)?\\s+(?:ال)?نوم|bedrooms?|مطابخ|مطبخ|kitchens?|مجالس|مجلس|majlis|حمامات|حمام|دورات\\s+مياه|bathrooms?|صالات|صاله|living\\s+rooms?)';
const minimumPrefix = /(?:على الاقل|بحد ادنى|at least|minimum(?: of)?)\s*$/iu;
const minimumSuffix = /^\s*(?:على الاقل|كحد ادنى|at least|minimum)\b/iu;
function isMinimum(source, start, end) {
  // Qualifiers bind only directly to this count, never globally to the brief.
  return minimumPrefix.test(source.slice(Math.max(0, start - 40), start)) ||
    /^\s*(?:على الاقل|كحد ادنى)(?=$|[\s،؛,.])/u.test(source.slice(end)) || minimumSuffix.test(source.slice(end));
}

export function extractExplicitProgramRequirements(text) {
  const source = normalizeBriefText(text);
  const result = new Map();
  const foundCounts = [];
  const prefix = new RegExp('(?:^|[\\s،؛,.;])و?(' + numberPattern + ')\\s+(' + countLabel + ')(?=$|[\\s،؛,.;])', 'giu');
  const suffix = new RegExp('(?:^|[\\s،؛,.;])و?(' + countLabel + ')\\s+(?:عدد\\s*)?(' + numberPattern + ')(?=$|[\\s،؛,.;])', 'giu');
  for (const match of source.matchAll(prefix)) foundCounts.push({ match, n: count(match[1]), label: match[2] });
  for (const match of source.matchAll(suffix)) foundCounts.push({ match, n: count(match[2]), label: match[1] });
  for (const match of source.matchAll(/(?:^|[\s،؛,.;])و?(غرفتين|غرفتان|غرفتا)\s+(?:ال)?نوم/gu)) foundCounts.push({ match, n: 2, label: 'غرف نوم' });
  for (const { match, n, label } of foundCounts.sort((a, b) => a.match.index - b.match.index)) {
    if (!Number.isSafeInteger(n) || n < 0) continue;
    const type = roomType(label), id = type === 'bedroom' ? 'bedrooms' : 'count:' + type;
    result.set(id, { id, kind: isMinimum(source, match.index, match.index + match[0].length) ? 'minimum-count' : 'exact-count', roomType: type, label: type === 'bedroom' ? 'غرف النوم' : label, expected: n });
  }
  for (const [id, expression, label] of [
    ['men-majlis', /مجلس\s+(?:ال)?رجال/, 'مجلس الرجال'],
    ['women-majlis', /مجلس\s+(?:ال)?نساء/, 'مجلس النساء'],
  ]) if (expression.test(source)) result.set(id, { id, kind: 'required-room', label });
  const dimensionPattern = /(?:^|[\s،؛])و?((?:ال)?مطبخ|(?:ال)?مستودع|(?:ال)?مخزن|مجلس\s+(?:ال)?رجال|مجلس\s+(?:ال)?نساء|(?:ال)?صاله|غرفه\s+نوم|kitchen|storage|(?:men(?:'s)?\s+|women(?:'s)?\s+)?majlis|living\s+room|bedroom)\s*(?:(?:ب)?مساحه|مقاس|ابعاد|الى|ليكون|:)?\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/giu;
  for (const match of source.matchAll(dimensionPattern)) {
    const label = match[1], w = Number(match[2]), h = Number(match[3]);
    if (!(w >= 1 && w <= 50 && h >= 1 && h <= 50)) continue;
    const id = 'area:' + (roomType(label) || 'other') + (/رجال|\bmen(?:'s)?\b/i.test(label) ? ':men' : /نساء|\bwomen(?:'s)?\b/i.test(label) ? ':women' : '');
    const tail = source.slice(match.index + match[0].length);
    const allowRotation = !/^\s*(?:بدون تدوير|دون تدوير|بدون دوران|no rotation)/iu.test(tail);
    result.set(id, { id, kind: 'room-area', label, expected: w * h, width: w, length: h, allowRotation });
  }
  return [...result.values()];
}

export function verifyProposedProgram(text, rooms) {
  if (!Array.isArray(rooms)) throw Error('قائمة الغرف المقترحة غير صالحة.');
  const requirements = extractExplicitProgramRequirements(text);
  const violations = [];
  for (const rule of requirements) {
    if (rule.kind === 'minimum-count' || rule.kind === 'exact-count') {
      const found = rooms.filter(room => room.type === (rule.roomType || 'bedroom')).length;
      if (rule.kind === 'minimum-count' ? found < rule.expected : found !== rule.expected) violations.push('طلبت ' + rule.expected + (rule.roomType === 'bedroom' ? ' غرف نوم' : ' ' + rule.label) + (rule.kind === 'minimum-count' ? ' على الأقل' : ' بالضبط') + '، لكن الاقتراح يتضمن ' + found + '.');
    } else if (rule.kind === 'required-room') {
      const found = rooms.some(room => room.type === 'majlis' &&
        (rule.id === 'men-majlis' ? /رجال/.test(normalizeBriefText(room.name)) : /نساء/.test(normalizeBriefText(room.name))));
      if (!found) violations.push('لم يظهر ' + rule.label + ' بوضوح في برنامج الغرف المقترح.');
    } else if (rule.kind === 'room-area') {
      const matches = rooms.filter(room => roomNameMatches(room, rule.label));
      const found = matches.some(room => Math.abs(Number(room.area ?? room.areaM2) - rule.expected) <= .25 && (!hasGeometry(room) || dimensionsMatch(rule, room)));
      if (!found) violations.push('طلبت ' + rule.label + ' بمساحة ' + rule.width + '×' + rule.length +
        ' م (' + rule.expected + ' م²)، لكن الاقتراح لا يحتوي غرفة مطابقة.');
    }
  }
  return { requirements, violations, pass: violations.length === 0 };
}


function hasGeometry(room) {
  return ['w', 'h', 'width', 'length'].some(key => Object.hasOwn(room, key));
}
function dimensionsMatch(rule, room) {
  const w = room.w ?? room.width, h = room.h ?? room.length;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  const near = (a, b) => Math.abs(a - b) <= 1e-5;
  return (near(w, rule.width) && near(h, rule.length)) ||
    (rule.allowRotation !== false && near(w, rule.length) && near(h, rule.width));
}

// Program requests retain dimension constraints separately from scalar area. Older
// projects without these optional fields keep their existing area-based contract.
export function attachExplicitProgramConstraints(text, rooms) {
  if (!Array.isArray(rooms)) throw Error('قائمة الغرف المقترحة غير صالحة.');
  const result = structuredClone(rooms);
  for (const rule of extractExplicitProgramRequirements(text).filter(rule => rule.kind === 'room-area')) {
    const matches = result.filter(room => roomNameMatches(room, rule.label));
    if (matches.length !== 1) throw Error('حدد غرفة واحدة لتطبيق أبعاد ' + rule.label + '؛ تعذر تحديد الغرفة المقصودة.');
    matches[0].dimensions = { width: rule.width, length: rule.length, allowRotation: rule.allowRotation !== false };
  }
  return result;
}

// This is the geometry acceptance boundary. Area or requested dimensions alone
// are not evidence that the generated rectangle meets the client's dimensions.
export function verifyProgramGeometry(textOrRequirements, rooms) {
  if (!Array.isArray(rooms)) throw Error('قائمة الغرف الهندسية غير صالحة.');
  const requirements = Array.isArray(textOrRequirements) ? textOrRequirements : extractExplicitProgramRequirements(textOrRequirements);
  const violations = [];
  for (const rule of requirements.filter(rule => rule.kind === 'room-area')) {
    const matches = rooms.filter(room => rule.roomId != null ? room.id === rule.roomId : roomNameMatches(room, rule.label));
    if (!matches.some(room => dimensionsMatch(rule, room))) violations.push('أبعاد ' + rule.label + ' المطلوبة ' + rule.width + '×' + rule.length + ' م غير متحققة في الهندسة الناتجة.');
  }
  return { requirements, violations, pass: violations.length === 0 };
}

export function verifyAttachedProgramGeometry(program, rooms) {
  const requirements = program.flatMap((room, i) => room.dimensions ? [{
    id: 'dimensions:' + (room.id ?? 'room-' + i), kind: 'room-area', roomId: room.id ?? 'room-' + i,
    label: room.name, width: room.dimensions.width, length: room.dimensions.length,
    allowRotation: room.dimensions.allowRotation !== false,
  }] : []);
  return verifyProgramGeometry(requirements, rooms);
}
