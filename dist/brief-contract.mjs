// Deterministic guard for measurable client requirements. This validates the
// proposed room program before it is passed into the existing exact-geometry planner.
const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const numberWords = {
  واحد: 1, واحده: 1, واحدة: 1, one: 1,
  اثنين: 2, اثنتين: 2, اثنان: 2, اثنتان: 2, two: 2,
  ثلاث: 3, ثلاثة: 3, ثلاثه: 3, three: 3,
  اربع: 4, اربعة: 4, اربعه: 4, four: 4,
  خمس: 5, خمسة: 5, خمسه: 5, five: 5,
  ست: 6, ستة: 6, سته: 6, six: 6,
  سبع: 7, سبعة: 7, سبعه: 7, seven: 7,
  ثمان: 8, ثمانية: 8, ثمانيه: 8, eight: 8,
  تسع: 9, تسعة: 9, تسعه: 9, nine: 9,
  عشر: 10, عشرة: 10, عشره: 10, ten: 10,
};
const wordPattern = Object.keys(numberWords).sort((a, b) => b.length - a.length).join('|');

export function normalizeBriefText(value) {
  return String(value ?? '').slice(0, 4000).normalize('NFKC')
    .replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(persianDigits.indexOf(digit)))
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

const negativePrefix = /(?:^|[\s،؛])(?:لا|لم|لن|ليس|عدم|بدون|دون|without|don't|do\s+not|not|no)(?:\s+\S+){0,3}\s*$/iu;
const isNegatedAt = (source, index) => negativePrefix.test(source.slice(Math.max(0, index - 60), index).split(/[،؛,;.!?]/u).at(-1));

export function extractPlotDimensions(text) {
  const source = normalizeBriefText(text);
  const match = source.match(/(?:^|[\s،؛])(?:ال)?ارض(?:ي|نا)?\s*(?:(?:ب)?ابعاد|مقاس|:)?\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/iu);
  if (!match || isNegatedAt(source, match.index)) return null;
  const width = Number(match[1]), length = Number(match[2]);
  if (!(width >= 8 && width <= 100 && length >= 8 && length <= 100)) return null;
  return { width, length };
}

const countValue = value => /^\d+$/.test(value) ? Number(value) : numberWords[value.toLowerCase()] ?? null;
const roomType = label => /مستودع|مخزن|storage/i.test(label) ? 'storage'
  : /مطبخ|kitchen/i.test(label) ? 'kitchen'
  : /مجلس|majlis/i.test(label) ? 'majlis'
  : /غرف(?:ه|تين)?\s*(?:نوم|النوم)|bedrooms?/i.test(label) ? 'bedroom'
  : /صاله\s*(?:عائليه|العائله)?|معيشه|living/i.test(label) ? 'living'
  : /سفره|طعام|dining/i.test(label) ? 'dining'
  : /حمام|دوره مياه|bathroom/i.test(label) ? 'bath'
  : /مكتب|office/i.test(label) ? 'office'
  : /غرفه خدمه|service/i.test(label) ? 'service' : null;
const normalizeName = value => normalizeBriefText(value).toLowerCase();
const roomNameMatches = (room, label) => {
  if (room.type !== roomType(label)) return false;
  const name = normalizeName(room.name);
  if (/رجال|الرجال/.test(label)) return /رجال/.test(name);
  if (/نساء|النساء/.test(label)) return /نساء/.test(name);
  return true;
};

export function extractExplicitProgramRequirements(text) {
  const source = normalizeBriefText(text);
  const result = new Map();
  const addRule = (id, rule) => {
    const prior = result.get(id) || [];
    const count = id === 'bedrooms';
    const positive = item => count ? item.kind === 'exact-count' || item.kind === 'minimum-count' : item.kind === 'room-dimensions';
    const excluded = item => item.kind === 'excluded-count' || item.kind === 'excluded-room-dimensions';
    const sameConstraint = (a, b) => count ? a.expected === b.expected :
      (Math.abs(a.width - b.width) <= .01 && Math.abs(a.length - b.length) <= .01) ||
      (Math.abs(a.width - b.length) <= .01 && Math.abs(a.length - b.width) <= .01);
    if (!count && !id.startsWith('dimensions:')) { result.set(id, [rule]); return; }
    if (excluded(rule)) {
      const next = prior.filter(item => !(positive(item) && sameConstraint(item, rule)));
      if (!next.some(item => excluded(item) && sameConstraint(item, rule))) next.push(rule);
      result.set(id, next);
      return;
    }
    const next = prior.filter(item => !positive(item) && !(excluded(item) && sameConstraint(item, rule)));
    next.push(rule);
    result.set(id, next);
  };
  const countPattern = new RegExp(`(?:^|[\\s،؛])(${`\\d+|${wordPattern}`})\\s+(?:غرف(?:ه)?\\s+نوم|غرف\\s+النوم|bedrooms?)`, 'giu');
  const englishCountPattern = new RegExp(`(?:^|[\\s،؛])(${`\\d+|${wordPattern}`})\\s+bedrooms?`, 'giu');
  const recordCount = (match, offset) => {
    const n = countValue(match[1]);
    if (!Number.isSafeInteger(n) || n < 0) return;
    const prefix = source.slice(Math.max(0, offset - 36), offset);
    const suffix = source.slice(offset + match[0].length);
    const minimum = /(?:على\s+الاقل|بحد\s+ادن[ىي]|كحد\s+ادن[ىي]|at\s+least|minimum(?: of)?|min\.?)\s*$/iu.test(prefix) ||
      /^\s*(?:على\s+الاقل|بحد\s+ادن[ىي]|كحد\s+ادن[ىي]|at\s+least|minimum)(?=$|[\s،؛,.;])/iu.test(suffix);
    const negated = isNegatedAt(source, offset);
    addRule('bedrooms', { id: 'bedrooms', kind: negated ? 'excluded-count' : minimum ? 'minimum-count' : 'exact-count', label: 'غرف النوم', expected: n });
  };
  const countMatches = [];
  for (const match of source.matchAll(countPattern)) countMatches.push({ match, offset: match.index });
  for (const match of source.matchAll(englishCountPattern)) countMatches.push({ match, offset: match.index });
  // Common Arabic dual forms state an exact count without a leading numeral.
  const dualCountPattern = /(?:^|[\s،؛])(?:غرفتين|غرفتا|غرفتان|غرفتي)\s+(?:نوم|النوم)(?=$|[\s،؛])/giu;
  for (const match of source.matchAll(dualCountPattern)) countMatches.push({ match: [match[0], '2'], offset: match.index });
  countMatches.sort((a, b) => a.offset - b.offset);
  const seenCountMatches = new Set();
  for (const item of countMatches) {
    const key = item.offset + ':' + item.match[0];
    if (seenCountMatches.has(key)) continue;
    seenCountMatches.add(key);
    recordCount(item.match, item.offset);
  }

  for (const [id, expression, label] of [
    ['men-majlis', /مجلس\s+(?:ال)?رجال/, 'مجلس الرجال'],
    ['women-majlis', /مجلس\s+(?:ال)?نساء/, 'مجلس النساء'],
  ]) if (expression.test(source)) addRule(id, { id, kind: 'required-room', label });

  const roomName = '(?:مطبخ|المطبخ|kitchen|مستودع|المستودع|مخزن|المخزن|storage|مجلس\\s+(?:ال)?(?:رجال|نساء)|غرف(?:ه)?\\s+نوم|غرف\\s+النوم|bedrooms?|صاله(?:\\s+عائليه)?|معيشه|living(?:\\s+room)?|سفره|طعام|dining(?:\\s+room)?|حمام|دوره\\s+مياه|bathroom|مكتب|office)';
  const dimensionPattern = new RegExp(`(?:^|[\\s،؛])و?(${roomName})\\s*(?:(?:ب)?مساحه|مقاس|ابعاد|الى|ليكون|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*[×xX*]\\s*(\\d+(?:\\.\\d+)?)`, 'giu');
  for (const match of source.matchAll(dimensionPattern)) {
    const label = match[1], width = Number(match[2]), length = Number(match[3]);
    if (!(width >= 1 && width <= 50 && length >= 1 && length <= 50)) continue;
    const type = roomType(label) || 'other';
    const sex = /رجال/.test(label) ? ':men' : /نساء/.test(label) ? ':women' : '';
    const id = `dimensions:${type}${sex}`;
    const suffix = source.slice(match.index + match[0].length);
    const allowRotation = !/^\s*(?:(?:m|metres?|meters?|م|متر|امتار)(?=$|[\s،؛,.;])\s*)?[,،;؛]?\s*(?:بدون\s+(?:تدوير|دوران)|دون\s+(?:تدوير|دوران)|no\s+rotation|without\s+rotation)(?=$|[\s،؛,.;])/iu.test(suffix);
    addRule(id, { id, kind: isNegatedAt(source, match.index) ? 'excluded-room-dimensions' : 'room-dimensions', label, expected: width * length, width, length, ...(allowRotation ? {} : { allowRotation: false }) });
  }
  return [...result.values()].flat();
}

function dimensionsOf(room) {
  if (room?.dimensions && Number.isFinite(Number(room.dimensions.width)) && Number.isFinite(Number(room.dimensions.length))) {
    return { width: Number(room.dimensions.width), length: Number(room.dimensions.length), ...(room.dimensions.allowRotation === false ? { allowRotation: false } : {}) };
  }
  const exact = room?.exactDimensionsM || room?.exactDimensions;
  if (exact && Number.isFinite(Number(exact.widthM ?? exact.width)) && Number.isFinite(Number(exact.lengthM ?? exact.length))) {
    return { width: Number(exact.widthM ?? exact.width), length: Number(exact.lengthM ?? exact.length), ...(exact.allowRotation === false || exact.rotationAllowed === false ? { allowRotation: false } : {}) };
  }
  if (Number.isFinite(Number(room?.width)) && Number.isFinite(Number(room?.length))) return { width: Number(room.width), length: Number(room.length) };
  return null;
}
const sameDimensions = (actual, expected, tolerance = .01) => !!actual && (
  Math.abs(actual.width - expected.width) <= tolerance && Math.abs(actual.length - expected.length) <= tolerance ||
  expected.allowRotation !== false && Math.abs(actual.width - expected.length) <= tolerance && Math.abs(actual.length - expected.width) <= tolerance
);

const areaMatches = (left, right) => Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) <= .01;
const roomIdentity = room => {
  const name = normalizeBriefText(room?.name).toLowerCase().split(/\s+/u).map(word => word.replace(/^ال/u, '')).join(' ').replace(/[^\p{L}\p{N}]+/gu, '');
  return name ? `${room?.type}|${name}` : '';
};

// The connected Worker schema intentionally carries room areas but not exact
// rectangles. Restore dimensions from the client-parsed request only after
// proving that the AI's room identity, count, and area agree. Never overwrite
// a conflicting AI dimension or guess between same-type rooms.
export function bindRequestedDimensions(proposedRooms, requestedRooms) {
  if (!Array.isArray(proposedRooms) || !Array.isArray(requestedRooms)) throw Error('لا يمكن التحقق من أبعاد الغرف في الاقتراح.');
  const required = requestedRooms.filter(room => dimensionsOf(room));
  if (!required.length) return structuredClone(proposedRooms);
  const result = structuredClone(proposedRooms);
  const updates = new Map();
  for (const type of new Set(required.map(room => room.type))) {
    const requestedGroup = requestedRooms.filter(room => room.type === type);
    const proposedGroup = result.map((room, index) => ({ room, index })).filter(item => item.room.type === type);
    if (proposedGroup.length !== requestedGroup.length) {
      throw Error(`طلبك يتضمن ${requestedGroup.length} من نوع ${type}، لكن اقتراح الذكاء يتضمن ${proposedGroup.length}. لم أطبّق الاقتراح؛ وضّح العدد أو أعد التحليل.`);
    }
    for (const requested of requestedGroup.filter(room => dimensionsOf(room))) {
      const dimensions = dimensionsOf(requested);
      const requestedArea = Number(requested.area ?? requested.areaM2);
      const dimensionArea = dimensions.width * dimensions.length;
      if (!(dimensions.width > 0 && dimensions.length > 0) || !areaMatches(requestedArea, dimensionArea)) {
        throw Error(`أبعاد ${requested.name || type} ومساحتها المسجلة غير متطابقة؛ صحّح الجدول قبل اعتماد اقتراح الذكاء.`);
      }
    }
    const fullyConstrained = requestedGroup.length > 0 && requestedGroup.every(room => dimensionsOf(room));
    const sharedDimensions = fullyConstrained && requestedGroup.every(room => dimensionsOf(room).allowRotation === dimensionsOf(requestedGroup[0]).allowRotation && sameDimensions(dimensionsOf(room), dimensionsOf(requestedGroup[0])));
    if (sharedDimensions) {
      const requiredDimensions = dimensionsOf(requestedGroup[0]);
      const area = requiredDimensions.width * requiredDimensions.length;
      if (requestedGroup.some(room => !areaMatches(room.area ?? room.areaM2, area)) ||
          proposedGroup.some(({ room }) => !areaMatches(room.area ?? room.areaM2, area))) {
        throw Error(`لم يطابق اقتراح الذكاء مساحة كل غرفة ${type} لأبعادك الدقيقة؛ وضّح البرنامج قبل اعتماده.`);
      }
      for (const { room, index } of proposedGroup) {
        const current = dimensionsOf(room);
        if (current && !sameDimensions(current, requiredDimensions)) {
          throw Error(`اقتراح الذكاء أعطى ${room.name} أبعادًا متعارضة مع طلبك. لم أستبدلها بصمت.`);
        }
        updates.set(index, { ...requiredDimensions });
      }
      continue;
    }
    for (const requested of requestedGroup.filter(room => dimensionsOf(room))) {
      const identity = roomIdentity(requested);
      const requestedMatches = requestedGroup.filter(room => roomIdentity(room) === identity);
      const proposedMatches = proposedGroup.filter(({ room }) => roomIdentity(room) === identity);
      if (!identity || requestedMatches.length !== 1 || proposedMatches.length !== 1) {
        throw Error(`تعذّر ربط أبعاد ${requested.name || type} بغرفة واحدة واضحة في اقتراح الذكاء. سمِّ الغرفة أو حدّد عدد كل نوع؛ لم أُخمّن الربط.`);
      }
      const { room, index } = proposedMatches[0];
      const dimensions = dimensionsOf(requested);
      const area = dimensions.width * dimensions.length;
      if (!areaMatches(requested.area ?? requested.areaM2, area) ||
          !areaMatches(room.area ?? room.areaM2, requested.area ?? requested.areaM2) ||
          !areaMatches(room.area ?? room.areaM2, area)) {
        throw Error(`لم يطابق ${room.name} هوية الغرفة ومساحتها المطلوبة؛ لم أُطبّق أبعادًا على غرفة أخرى.`);
      }
      const current = dimensionsOf(room);
      if (current && !sameDimensions(current, dimensions)) {
        throw Error(`اقتراح الذكاء أعطى ${room.name} أبعادًا متعارضة مع طلبك. لم أستبدلها بصمت.`);
      }
      updates.set(index, { ...dimensions });
    }
  }
  return result.map((room, index) => updates.has(index) ? { ...room, dimensions: updates.get(index) } : room);
}

export function verifyProposedProgram(text, rooms, { dimensionTolerance = .01 } = {}) {
  if (!Array.isArray(rooms)) throw Error('قائمة الغرف المقترحة غير صالحة.');
  const requirements = extractExplicitProgramRequirements(text);
  const violations = [];
  for (const rule of requirements) {
    if (rule.kind === 'minimum-count' || rule.kind === 'exact-count' || rule.kind === 'excluded-count') {
      const found = rooms.filter(room => room.type === 'bedroom').length;
      const satisfied = rule.kind === 'minimum-count' ? found >= rule.expected : rule.kind === 'excluded-count' ? found !== rule.expected : found === rule.expected;
      if (!satisfied) violations.push(rule.kind === 'minimum-count'
        ? `طلبت ${rule.expected} غرف نوم على الأقل، لكن الاقتراح يتضمن ${found}.`
        : rule.kind === 'excluded-count'
          ? `ذكرت أنك لا تريد ${rule.expected} غرف نوم؛ الاقتراح يتضمن هذا العدد.`
          : `طلبت ${rule.expected} غرف نوم بالضبط، لكن الاقتراح يتضمن ${found}.`);
    } else if (rule.kind === 'required-room') {
      const found = rooms.some(room => room.type === 'majlis' &&
        (rule.id === 'men-majlis' ? /رجال/.test(normalizeName(room.name)) : /نساء/.test(normalizeName(room.name))));
      if (!found) violations.push('لم يظهر ' + rule.label + ' بوضوح في برنامج الغرف المقترح.');
    } else if (rule.kind === 'room-dimensions') {
      const matches = rooms.filter(room => roomNameMatches(room, rule.label));
      const found = matches.some(room => {
        const actual = dimensionsOf(room);
        const area = Number(room.area ?? room.areaM2);
        return sameDimensions(actual, rule, dimensionTolerance) && Math.abs(area - rule.expected) <= .25;
      });
      if (!found) violations.push(`طلبت أبعاد ${rule.label} ${rule.width}×${rule.length} م بالضبط، ${rule.allowRotation === false ? 'دون تدوير' : 'مع السماح بالتدوير 90°'}؛ المساحة وحدها لا تثبت الأبعاد.`);
    } else if (rule.kind === 'excluded-room-dimensions') {
      const matches = rooms.filter(room => roomNameMatches(room, rule.label));
      const dimensions = matches.map(dimensionsOf);
      const found = dimensions.some(actual => sameDimensions(actual, rule, dimensionTolerance));
      const unknown = matches.length > 0 && dimensions.some(actual => !actual);
      if (found) violations.push(`ذكرت أنك لا تريد أبعاد ${rule.label} ${rule.width}×${rule.length} م؛ الاقتراح يتضمنها.`);
      else if (unknown) violations.push(`لا يمكن التحقق من أن ${rule.label} لا يستخدم أبعاد ${rule.width}×${rule.length} م؛ نحتاج أبعادًا صريحة قبل الاعتماد.`);
    }
  }
  return { requirements, violations, pass: violations.length === 0 };
}


// Generated rectangles are verified independently of requested dimension metadata.
// Preserve exclusions and count semantics by reusing the current V51 contract.
export function verifyProgramGeometry(text, rooms) {
  if (!Array.isArray(rooms)) throw Error('قائمة الغرف الهندسية غير صالحة.');
  return verifyProposedProgram(text, rooms.map(room => {
    const { dimensions, exactDimensionsM, exactDimensions, width, length, ...rest } = room;
    const actualWidth = room.w ?? width, actualLength = room.h ?? length;
    const valid = Number.isFinite(actualWidth) && Number.isFinite(actualLength) && actualWidth > 0 && actualLength > 0;
    return { ...rest, area: valid ? actualWidth * actualLength : NaN,
      ...(valid ? { dimensions: { width: actualWidth, length: actualLength } } : {}) };
  }), { dimensionTolerance: 1e-5 });
}
