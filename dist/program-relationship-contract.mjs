import { extractExplicitProgramRequirements, normalizeBriefText } from './brief-contract.mjs';
import { circulationNetwork } from './circulation.mjs';
import { pointInPolygon, rectInPolygon } from './claude/planner.mjs';
import { spatialRelationDescriptor } from './spatial-relations.mjs';

const has = (text, expression) => expression.test(text);
const roomTypes = list => new Set((list || []).map(room => room.type));
const roomByType = (model, type) => (model?.rooms || []).filter(room => room.type === type);
const pair = (model, typeA, typeB) => {
  const left = roomByType(model, typeA), right = roomByType(model, typeB);
  return left.flatMap(a => right.map(b => [a, b]));
};
const exactBedroomCount = text => extractExplicitProgramRequirements(text)
  .find(rule => rule.id === 'bedrooms' && rule.kind === 'exact-count')?.expected ?? null;

/**
 * A narrow, source-text-backed contract for the current example request.
 * It deliberately does not turn unsupported wishes into generator preferences.
 */
export function buildProgramRelationshipContract({ prompt = '', program = [] } = {}) {
  const text = normalizeBriefText(prompt).toLowerCase();
  const types = roomTypes(program);
  const bedrooms = exactBedroomCount(prompt);
  const asksOpenLivingKitchen = text.split(/[،,؛.!؟\n]+/u).some(clause =>
    has(clause, /صاله(?:\s+عائليه)?\s+(?:مفتوحه|مفتوح)\s+(?:على|مع)\s+(?:ال)?مطبخ/iu)
      && !has(clause, /(?:لا|ما)\s*(?:ابي|ابغى|ابغا|اريد|ارغب)|(?:لا\s+تكون|غير\s+مفتوحه|غير\s+مفتوح)/iu));
  const asksGuestDiningBath = has(text, /مجلس\s+(?:ال)?رجال/iu) && has(text, /حمام|دوره\s+مياه/iu) && has(text, /طعام|سفره/iu);
  const asksGuestPrivacy = has(text, /مجلس|ضيوف|ضيافه/iu) && has(text, /عائله|اسره|صاله|نوم/iu) && has(text, /خصوصيه|خصوص|عزل|منفصل/iu);
  const asksExternalGuest = has(text, /غرفه\s+(?:ال)?ضيوف?\s+(?:خارجيه|منفصله)|غرفه\s+خارجيه\s+(?:لل)?ضيوف|external\s+guest\s+room/iu);
  if (!(bedrooms === 2 && asksOpenLivingKitchen && asksGuestDiningBath && asksGuestPrivacy && asksExternalGuest)
      && !(asksOpenLivingKitchen && roomTypes(program).has('living') && roomTypes(program).has('kitchen'))) return null;
  const focusedOpenPlan = !(bedrooms === 2 && asksOpenLivingKitchen && asksGuestDiningBath && asksGuestPrivacy && asksExternalGuest);

  const guestRooms = ['majlis', 'dining', 'bath'];
  const familyRooms = ['living', 'bedroom'];
  const requiredProgram = focusedOpenPlan ? [] : [
    { id: 'bedrooms-exact', type: 'bedroom', count: 2, mode: 'exact', label: 'غرفتا نوم بالضبط' },
    { id: 'living-single', type: 'living', count: 1, mode: 'exact', label: 'صالة عائلية واحدة' },
    { id: 'kitchen-single', type: 'kitchen', count: 1, mode: 'exact', label: 'مطبخ واحد' },
    { id: 'majlis-single', type: 'majlis', count: 1, mode: 'exact', label: 'مجلس رجال واحد' },
    { id: 'dining-single', type: 'dining', count: 1, mode: 'exact', label: 'منطقة طعام واحدة' },
    { id: 'guest-bath-single', type: 'bath', count: 1, mode: 'exact', label: 'حمام ضيوف واحد' },
    { id: 'external-guest-room', type: 'external_guest', count: 1, mode: 'exact', label: 'غرفة ضيوف خارج الكتلة الرئيسية' },
  ];
  const relationships = (focusedOpenPlan ? [] : [
    { id: 'open-living-kitchen', kind: 'open-plan', from: 'living', to: 'kitchen', required: true,
      proof: 'تجاور فعلي وفتحة مباشرة واسعة بلا حاجز جداري مغلق.' },
    { id: 'guest-dining-access', kind: 'walkable-access', from: 'majlis', to: 'dining', required: true,
      proof: 'مسار أبواب وممرات فعلي قابل للقياس.' },
    { id: 'guest-bath-dining-access', kind: 'walkable-access', from: 'bath', to: 'dining', required: true,
      proof: 'مسار أبواب وممرات فعلي؛ يلزم تأكيد معنى «مرتبط بالطعام» قبل ادعاء التجاور.' },
    { id: 'guest-family-privacy', kind: 'separated-circulation-and-sightlines', from: guestRooms, to: familyRooms, required: true,
      proof: 'عدم وجود باب مباشر أو ممر مشترك، مع فحص خط رؤية مستقل.' },
    { id: 'external-guest-room-location', kind: 'outside-primary-footprint', from: 'external_guest', to: 'outside', required: true,
      proof: 'كتلة ضيوف مستقلة داخل حدود الأرض مع وصول خارجي مادي.' },
  ]).concat(focusedOpenPlan ? [{ id: 'open-living-kitchen', kind: 'open-plan', from: 'living', to: 'kitchen', required: true,
    proof: 'تجاور فعلي وفتحة مباشرة واسعة بلا حاجز جداري مغلق.' }] : []);
  const unsupported = focusedOpenPlan ? [] : [
    { id: 'guest-family-privacy', reason: 'المولد الحالي له مدخل واحد ولا يفحص خطوط الرؤية؛ غياب التجاور وحده لا يثبت الخصوصية.' },
    { id: 'external-guest-room-location', reason: 'عقد المخطط الحالي يحصر جميع الغرف داخل مضلع مبنى رئيسي واحد ولا يمثل كتلة ضيوف خارجية.' },
  ];
  const clarifications = focusedOpenPlan ? [] : [
    'هل المقصود بحمام مرتبط بالطعام اتصال أبواب مباشر أم مسار قصير عبر ممر؟',
    'هل غرفة الضيوف الخارجية مبنى مستقل داخل الأرض ويحتاج مدخلًا خارجيًا مستقلًا؟',
  ];
  return {
    schemaVersion: 'mizan.program-relationships/1', source: 'explicit-client-text', status: 'REVIEW_REQUIRED',
    fixtureFingerprint: null, requiredProgram, relationships, unsupported, clarifications,
    generatorProgramTypesSupported: [...types],
    note: 'عقد المتطلبات يصف الطلب ولا يثبت تنفيذه؛ لا يُقبل مرشح ما لم تجتز العلاقات المطلوبة فحص الهندسة الفعلية.',
  };
}

function mergeIntervals(intervals) {
  const ordered = intervals.filter(([a, b]) => b - a > 1e-7).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of ordered) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + 1e-7) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}
function lengthOf(intervals) { return mergeIntervals(intervals).reduce((sum, [a, b]) => sum + b - a, 0); }

function openBoundary(model, a, b) {
  const eps = 1e-5;
  let horizontal, fixed, start, end;
  if (Math.abs(a.x + a.w - b.x) <= .3 || Math.abs(b.x + b.w - a.x) <= .3) {
    horizontal = false; fixed = Math.abs(a.x + a.w - b.x) <= .3 ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2;
    start = Math.max(a.y, b.y); end = Math.min(a.y + a.h, b.y + b.h);
  } else if (Math.abs(a.y + a.h - b.y) <= .3 || Math.abs(b.y + b.h - a.y) <= .3) {
    horizontal = true; fixed = Math.abs(a.y + a.h - b.y) <= .3 ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2;
    start = Math.max(a.x, b.x); end = Math.min(a.x + a.w, b.x + b.w);
  } else return { adjacent: false, sharedLengthM: 0, clearWidthM: 0, clearRatio: 0 };
  if (end - start <= eps) return { adjacent: false, sharedLengthM: 0, clearWidthM: 0, clearRatio: 0 };
  const solid = [];
  for (const wall of model.walls || []) {
    const wallHorizontal = Math.abs(wall.y1 - wall.y2) <= eps;
    if (wallHorizontal !== horizontal || Math.abs((horizontal ? wall.y1 : wall.x1) - fixed) > wall.t / 2 + eps) continue;
    const alongStart = horizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
    const alongEnd = horizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.y1, wall.y2);
    const clipStart = Math.max(start, alongStart), clipEnd = Math.min(end, alongEnd);
    if (clipEnd <= clipStart) continue;
    const doorSpans = (model.openings || []).filter(opening => opening.type === 'door' && opening.openPlan === true && opening.wallId === wall.id &&
      opening.connects?.includes(a.id) && opening.connects?.includes(b.id)).map(opening => {
      const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      const center = (horizontal ? wall.x1 : wall.y1) + (horizontal ? wall.x2 - wall.x1 : wall.y2 - wall.y1) * opening.pos;
      return [center - opening.w / 2, center + opening.w / 2];
    });
    let pieces = [[clipStart, clipEnd]];
    for (const [doorStart, doorEnd] of doorSpans) {
      pieces = pieces.flatMap(([x, y]) => doorEnd <= x || doorStart >= y ? [[x, y]] : [
        ...(doorStart > x ? [[x, Math.min(doorStart, y)]] : []),
        ...(doorEnd < y ? [[Math.max(doorEnd, x), y]] : []),
      ]);
    }
    solid.push(...pieces);
  }
  const solidLengthM = Math.min(end - start, lengthOf(solid));
  const clearWidthM = Math.max(0, end - start - solidLengthM);
  return { adjacent: true, sharedLengthM: end - start, clearWidthM,
    clearRatio: clearWidthM / (end - start), solidWallLengthM: solidLengthM };
}

export function validateProgramRelationshipContract(contract, model, program = []) {
  if (!contract || contract.schemaVersion !== 'mizan.program-relationships/1') throw Error('INVALID_PROGRAM_RELATIONSHIP_CONTRACT');
  const programEvidence = contract.requiredProgram.map(requirement => {
    const count = (model?.rooms || []).filter(room => requirement.type === 'external_guest'
      ? room.type === 'external_guest' || /غرفه\s+ضيوف\s+خارجيه/iu.test(normalizeBriefText(room.name))
      : room.type === requirement.type).length;
    const pass = requirement.mode === 'exact' ? count === requirement.count : count >= requirement.count;
    return { id: requirement.id, status: pass ? 'PASS' : 'FAIL', expected: requirement.count, actual: count, label: requirement.label };
  });
  const rooms = model?.rooms || [], graph = spatialRelationDescriptor(model), network = circulationNetwork(model);
  const pairStatus = (aType, bType) => {
    const pairs = pair(model, aType, bType);
    if (!pairs.length || !graph.valid) return { status: 'UNVERIFIED', paths: [], reason: graph.issues?.map(x => x.code).join(',') || 'MISSING_PAIR' };
    const paths = pairs.map(([a, b]) => ({ from: a.id, to: b.id, routeM: network.betweenRooms(a.id, b.id)?.metres ?? null }));
    return { status: paths.every(row => Number.isFinite(row.routeM)) ? 'PASS' : 'FAIL', paths };
  };
  const living = roomByType(model, 'living'), kitchen = roomByType(model, 'kitchen');
  const openPlan = living.length === 1 && kitchen.length === 1
    ? openBoundary(model, living[0], kitchen[0]) : { adjacent: false, sharedLengthM: 0, clearWidthM: 0, clearRatio: 0 };
  const guestDining = pairStatus('majlis', 'dining'), guestBathDining = pairStatus('bath', 'dining');
  const guests = rooms.filter(room => ['majlis', 'dining', 'bath'].includes(room.type));
  const family = rooms.filter(room => ['living', 'bedroom'].includes(room.type));
  let directGuestFamilyDoors = [];
  for (const opening of model?.openings || []) if (opening.type === 'door' && opening.connects?.length === 2) {
    const [left, right] = opening.connects;
    if (guests.some(room => room.id === left) && family.some(room => room.id === right) ||
        guests.some(room => room.id === right) && family.some(room => room.id === left)) directGuestFamilyDoors.push(opening.id);
  }
  const guestPaths = guests.map(room => network.toRoom(room.id));
  const familyPaths = family.map(room => network.toRoom(room.id));
  const sharedCorridors = [...new Set(guestPaths.flatMap(path => path?.spaces || []).filter(id =>
    familyPaths.some(path => path?.spaces?.includes(id)) && (model.corridors || []).some(corridor => corridor.id === id)))];
  const privacy = directGuestFamilyDoors.length || sharedCorridors.length
    ? { status: 'FAIL', directGuestFamilyDoors, sharedCorridors, sightlines: 'UNVERIFIED' }
    : { status: 'UNVERIFIED', directGuestFamilyDoors, sharedCorridors,
      sightlines: 'UNVERIFIED', reason: 'المسارات أو عدم وجود باب مباشر لا يثبت حجب الرؤية أو استقلال المدخل.' };
  const external = rooms.filter(room => room.type === 'external_guest' || /غرفه\s+ضيوف\s+خارجيه/iu.test(normalizeBriefText(room.name)));
  const externalLocation = external.length === 1 && Array.isArray(model?.buildingFootprint)
    ? { status: 'FAIL', roomId: external[0].id,
      centerInsidePrimaryFootprint: pointInPolygon(model.buildingFootprint, { x: external[0].x + external[0].w / 2, y: external[0].y + external[0].h / 2 }),
      roomInsidePrimaryFootprint: rectInPolygon(external[0], model.buildingFootprint),
      reason: 'عقد الهندسة الحالي يشترط أن تكون كل الغرف داخل مضلع مبنى واحد؛ لا يمثّل ملحقًا مستقلًا.' }
    : { status: 'FAIL', count: external.length, reason: 'غرفة الضيوف الخارجية غير ممثلة كنوع منفصل قابل للتحقق.' };
  const relations = [
    ...(contract.relationships.some(row => row.id === 'open-living-kitchen') ? [{ id: 'open-living-kitchen', status: openPlan.adjacent && openPlan.clearRatio >= .8 ? 'PASS' : 'FAIL', evidence: { ...openPlan, requiredClearRatio: .8 } }] : []),
    ...(contract.relationships.some(row => row.id === 'guest-dining-access') ? [{ id: 'guest-dining-access', ...guestDining }] : []),
    ...(contract.relationships.some(row => row.id === 'guest-bath-dining-access') ? [{ id: 'guest-bath-dining-access', ...guestBathDining }] : []),
    ...(contract.relationships.some(row => row.id === 'guest-family-privacy') ? [{ id: 'guest-family-privacy', ...privacy }] : []),
    ...(contract.relationships.some(row => row.id === 'external-guest-room-location') ? [{ id: 'external-guest-room-location', ...externalLocation }] : []),
  ];
  const satisfied = programEvidence.every(item => item.status === 'PASS') && relations.every(item => item.status === 'PASS');
  return { schemaVersion: contract.schemaVersion, status: satisfied ? 'SATISFIED' : 'NOT_SATISFIED', eligible: satisfied,
    programEvidence, relations, geometryEvidenceValid: graph.valid, geometryIssues: graph.issues,
    actualRoomTypes: [...new Set(rooms.map(room => room.type))], requestedProgramTypes: program.map(room => room.type) };
}

export function relationshipContractBlockers(evidence) {
  return [...(evidence?.programEvidence || []), ...(evidence?.relations || [])]
    .filter(row => row.status !== 'PASS').map(row => ({ id: row.id, status: row.status,
      reason: row.reason || (row.evidence && row.evidence.reason) || null }));
}
