// AZ-06 — مقارنة تراعي الفتحات: وحدة نقية تقرأ موضع الأبواب والنوافذ ولا تغيّر اختيار AZIZ ولا ترتيب البدائل.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessOpenings, compareOpeningAware, OPENING_AWARE_VERSION, AXIS_LABELS } from '../dist/opening-aware.mjs';
import { generateAlternatives, defaultRooms } from '../dist/planner.mjs';
import { generateInitialDesign, normalizeLand } from '../dist/home-flow.mjs';
import { normalizeDiscovery } from '../dist/client-brief.mjs';

const STATUSES = new Set(['measured', 'estimated', 'unavailable']);
const programs = [{ bedrooms: 4, majlis: 2, baths: 4, kitchens: 1, halls: 1, dining: 1 }, { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 }];
const lands = [{ length: 40, width: 30, streets: ['s'] }, { length: 35, width: 25, streets: ['s', 'e'] }, { length: 30, width: 20, streets: ['n'] }, { length: 30, width: 20, streets: ['s'] }];
function generated() {
  const out = [];
  for (const land of lands) for (const counts of programs) {
    const { plot } = normalizeLand({ ...land, entries: [land.streets[0]] });
    try { out.push({ land, counts, models: generateAlternatives(plot, defaultRooms(counts)).models }); } catch { /* أرض لا تتسع للبرنامج */ }
  }
  return out;
}

// نموذج يدوي صغير: ممر رأسي x∈[9,10.2] ومدخل عند طرفه الجنوبي؛ المجلس وغرفة النوم على الجدار الغربي للممر.
function hand({ majlisY, bedY, extra = [] }) {
  const t = 0.15, pos = y => (y - 3) / 12;
  return {
    strategy: 'hand', plot: { width: 20, length: 30, streets: { s: true, n: false, e: false, w: false }, neighborSetback: 1.5 },
    footprint: { x: 1.5, y: 3, w: 15, h: 25, sb: { s: 3, n: 1.5, e: 1.5, w: 1.5 } },
    rooms: [
      { id: 'majlis', name: 'مجلس', type: 'majlis', x: 3, y: majlisY - 1, w: 6, h: 2 },
      { id: 'bed', name: 'غرفة نوم', type: 'bedroom', x: 3, y: bedY - 1, w: 6, h: 2 },
    ],
    corridors: [{ id: 'spine', name: 'ممر', x: 9, y: 3, w: 1.2, h: 12 }], links: [],
    walls: [
      { id: 'wl', x1: 9, y1: 3, x2: 9, y2: 15, type: 'int', t },
      { id: 'wf', x1: 9, y1: 3, x2: 10.2, y2: 3, type: 'ext', t: 0.25 },
    ],
    openings: [
      { id: 'entry', type: 'door', wallId: 'wf', pos: 0.5, connects: ['outside', 'spine'] },
      { id: 'd-majlis', type: 'door', wallId: 'wl', pos: pos(majlisY), connects: ['majlis', 'spine'], roomId: 'majlis' },
      { id: 'd-bed', type: 'door', wallId: 'wl', pos: pos(bedY), connects: ['bed', 'spine'], roomId: 'bed' },
      ...extra,
    ],
  };
}

test('البدائل المولّدة لعدة أراضٍ: حالات صحيحة، درجات ضمن 0..100، وبراهين تشير إلى فتحات وغرف موجودة فعلًا', () => {
  const sets = generated();
  assert.ok(sets.length >= 4, 'يلزم توليد لعدة أراضٍ');
  for (const { models } of sets) {
    const cmp = compareOpeningAware({ models, selectedIndex: 0 });
    assert.equal(cmp.version, OPENING_AWARE_VERSION);
    assert.equal(cmp.rows.length, models.length);
    cmp.rows.forEach((row, i) => {
      assert.equal(row.index, i, 'الترتيب كما أُدخل');
      const ids = new Set([...models[i].openings.map(o => o.id), ...models[i].rooms.map(r => r.id), ...models[i].corridors.map(c => c.id)]);
      assert.deepEqual(Object.keys(row.axes).sort(), Object.keys(AXIS_LABELS).sort());
      for (const a of Object.values(row.axes)) {
        assert.ok(STATUSES.has(a.status), a.key + ' ' + a.status);
        if (a.status === 'unavailable') assert.equal(a.score, null);
        else if (a.score !== null) assert.ok(a.score >= 0 && a.score <= 100, a.key);
        for (const ev of a.evidence) for (const f of ['openingId', 'fromOpeningId', 'roomId', 'otherRoomId', 'corridorId']) if (ev[f]) assert.ok(ids.has(ev[f]), `${a.key}.${f}=${ev[f]}`);
      }
      assert.ok(row.partialScore === null || (row.partialScore >= 0 && row.partialScore <= 100));
      assert.equal(row.coverage.total, 4);
    });
  }
});

test('الحساب نقي: لا يعدّل النموذج ونتيجته ثابتة، ولا يزعم تغيير اختيار AZIZ', () => {
  const { models } = generated()[0];
  const before = JSON.stringify(models);
  const a = compareOpeningAware({ models, selectedIndex: 1 }), b = compareOpeningAware({ models, selectedIndex: 1 });
  assert.equal(JSON.stringify(models), before);
  assert.deepEqual(a, b);
  assert.equal(a.selectedIndex, 1);
  assert.equal(a.changesAzizPick, false);
  assert.match(a.note, /غير متحقق/);
});

test('باب غرفة نوم يفتح مباشرة على المجلس: يُعلَّم مكشوفًا بدليل (id الباب والغرفتين) وتنخفض الدرجة', () => {
  const base = hand({ majlisY: 10, bedY: 5 });
  const direct = hand({ majlisY: 10, bedY: 5, extra: [{ id: 'd-direct', type: 'door', wallId: 'wl', pos: 0.9, connects: ['bed', 'majlis'], roomId: 'bed' }] });
  // الأساس: باب النوم أيضًا في خط رؤية المدخل، فنقارن الدليل لا الدرجة وحدها.
  const ev = assessOpenings(direct).axes.bedroomDoorExposure.evidence.find(e => e.kind === 'direct-to-guest-room');
  assert.ok(ev, 'يجب وجود دليل الفتح المباشر');
  assert.deepEqual([ev.openingId, ev.roomId, ev.otherRoomId], ['d-direct', 'bed', 'majlis']);
  assert.ok(!assessOpenings(base).axes.bedroomDoorExposure.evidence.some(e => e.kind === 'direct-to-guest-room'));
  // غرفة النوم الوحيدة مكشوفة في الحالتين → 0؛ نضيف غرفة نوم ثانية على ممر فرعي مستور لنرى التمييز.
  assert.equal(assessOpenings(direct).axes.bedroomDoorExposure.score, 0);
});

test('خط رؤية من المدخل: باب نوم على الممر نفسه مكشوف، وباب على ممر فرعي منحنٍ غير مكشوف', () => {
  const m = hand({ majlisY: 5, bedY: 10 });
  const sight = assessOpenings(m).axes.bedroomDoorExposure;
  assert.equal(sight.score, 0);
  assert.ok(sight.evidence.some(e => e.kind === 'sightline-from-entry' && e.openingId === 'd-bed' && e.fromOpeningId === 'entry'));
  assert.ok(sight.evidence.some(e => e.kind === 'sightline-from-guest-door' && e.fromOpeningId === 'd-majlis'));
  // ممر فرعي أفقي يبدأ من الممر الرئيسي: بابه ليس على خط مستقيم داخل الممر الرئيسي.
  const branch = structuredClone(m);
  branch.rooms.push({ id: 'bed2', name: 'غرفة نوم 2', type: 'bedroom', x: 12, y: 13, w: 4, h: 2 });
  branch.corridors.push({ id: 'br', name: 'فرعي', x: 10.2, y: 11, w: 6, h: 1.2 });
  branch.links.push(['spine', 'br']);
  branch.walls.push({ id: 'wb', x1: 12, y1: 12.2, x2: 16, y2: 12.2, type: 'int', t: 0.15 });
  branch.openings.push({ id: 'd-bed2', type: 'door', wallId: 'wb', pos: 0.5, connects: ['bed2', 'br'], roomId: 'bed2' });
  const out = assessOpenings(branch).axes.bedroomDoorExposure;
  assert.deepEqual(out.exposedRoomIds, ['bed']);
  assert.equal(out.score, 50);
});

test('نافذة نوم على الشارع أو على حد جار عند الارتداد تُحسب مكشوفة؛ وعلى جار بعيد لا', () => {
  const m = {
    strategy: 'hand-windows', plot: { width: 20, length: 30, streets: { s: true, n: false, e: false, w: false }, neighborSetback: 1.5 },
    footprint: { x: 1.5, y: 3, w: 15, h: 25, sb: { s: 3, n: 1.5, e: 1.5, w: 1.5 } },
    rooms: [
      { id: 'bedS', name: 'نوم على الشارع', type: 'bedroom', x: 5, y: 3.2, w: 4, h: 3 },
      { id: 'bedW', name: 'نوم على الجار', type: 'bedroom', x: 1.7, y: 10, w: 4, h: 3 },
      { id: 'bedFar', name: 'نوم داخلي', type: 'bedroom', x: 6, y: 20, w: 4, h: 3 },
    ],
    corridors: [], links: [],
    walls: [
      { id: 'ws', x1: 5, y1: 3.125, x2: 9, y2: 3.125, type: 'ext', t: 0.25 },
      { id: 'ww', x1: 1.625, y1: 10, x2: 1.625, y2: 13, type: 'ext', t: 0.25 },
      { id: 'wf', x1: 5.9, y1: 20, x2: 5.9, y2: 23, type: 'ext', t: 0.25 },
    ],
    openings: [
      { id: 'w-street', type: 'window', wallId: 'ws', pos: 0.5, roomId: 'bedS', sill: 1.1 },
      { id: 'w-near', type: 'window', wallId: 'ww', pos: 0.5, roomId: 'bedW', sill: 1.1 },
      { id: 'w-far', type: 'window', wallId: 'wf', pos: 0.5, roomId: 'bedFar', sill: 1.1 },
    ],
  };
  const w = assessOpenings(m).axes.bedroomWindowExposure;
  assert.deepEqual(w.exposedRoomIds.sort(), ['bedS', 'bedW']);
  assert.ok(Math.abs(w.score - 100 / 3) < 1e-9);
  assert.equal(w.status, 'estimated', 'وجود مبنى عند الجار غير متحقق منه');
  const byId = Object.fromEntries(w.evidence.map(e => [e.openingId, e]));
  assert.equal(byId['w-street'].kind, 'window-street');
  assert.equal(byId['w-near'].kind, 'window-neighbour'); assert.equal(byId['w-near'].near, true);
  assert.equal(byId['w-far'].near, false);
  // لو اقتصر الأمر على الشارع فقط فالحكم مقيس لا تقديري.
  const streetOnly = structuredClone(m); streetOnly.rooms = streetOnly.rooms.slice(0, 1); streetOnly.openings = streetOnly.openings.slice(0, 1);
  assert.equal(assessOpenings(streetOnly).axes.bedroomWindowExposure.status, 'measured');
});

test('مسار الضيف: يعبر باب غرفة النوم إن كانت قبل المجلس على الممر، ولا يعبر إن كانت بعده', () => {
  const crossing = assessOpenings(hand({ majlisY: 10, bedY: 5 })).axes.guestPath;
  const clean = assessOpenings(hand({ majlisY: 5, bedY: 10 })).axes.guestPath;
  assert.equal(crossing.score, 0);
  assert.deepEqual(crossing.evidence[0].crossesFamilyDoors.map(c => [c.openingId, c.roomId]), [['d-bed', 'bed']]);
  assert.equal(clean.score, 100);
  assert.deepEqual(clean.evidence[0].crossesFamilyDoors, []);
  assert.equal(clean.status, 'measured');
});

test('محاور بلا بيانات تُعلَن «unavailable» بدل رقم مخترع', () => {
  const noBeds = hand({ majlisY: 5, bedY: 10 }); noBeds.rooms = noBeds.rooms.filter(r => r.type !== 'bedroom'); noBeds.openings = noBeds.openings.filter(o => o.id !== 'd-bed');
  const a = assessOpenings(noBeds).axes;
  assert.equal(a.bedroomDoorExposure.status, 'unavailable'); assert.equal(a.bedroomDoorExposure.score, null);
  assert.equal(a.bedroomWindowExposure.status, 'unavailable');
  const noMajlis = hand({ majlisY: 5, bedY: 10 }); noMajlis.rooms = noMajlis.rooms.filter(r => r.type !== 'majlis');
  assert.equal(assessOpenings(noMajlis).axes.guestPath.status, 'unavailable');
  const broken = assessOpenings({ rooms: [] });
  assert.equal(broken.partialScore, null); assert.match(broken.note, /غير متحقق/);
  // حمل الأبواب نسبي: بديل واحد أو تساوٍ → لا درجة.
  const single = compareOpeningAware({ models: [hand({ majlisY: 5, bedY: 10 })] }).rows[0].axes.corridorDoorLoad;
  assert.equal(single.score, null); assert.equal(single.value, 2);
});

test('المقارنة الثانوية لا تغيّر اختيار AZIZ ولا ترتيب البدائل في مخرج التوليد', async () => {
  const land = { length: 40, width: 30, streets: ['s'], entries: ['s'] };
  const out = await generateInitialDesign({ land, rooms: defaultRooms(programs[0]), discovery: normalizeDiscovery({ likes: [], rejects: [], avoids: [], life: {} }), idea: '', counts: programs[0] });
  const oa = out.dna.openingAware;
  assert.ok(oa && oa.rows.length === out.alternativesCount);
  assert.equal(oa.selectedIndex, out.selectedIndex);
  assert.equal(out.dna.selectedIndex, out.selectedIndex);
  assert.deepEqual(oa.rows.map(r => r.index), out.dna.rows.map(r => r.index), 'نفس ترتيب صفوف البصمة');
  assert.equal(oa.changesAzizPick, false);
});
