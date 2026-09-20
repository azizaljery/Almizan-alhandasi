import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, generateModel, generateAlternatives, quantities, validatePlot, validateModel, wallPieces, openingPoint } from '../dist/planner.mjs';
import { circulationNetwork } from '../dist/circulation.mjs';
import { reviewPlan } from '../dist/audit.mjs';
import { encodeProject, decodeProject, quantitiesCSV, MAX_PROJECT_BYTES } from '../dist/project.mjs';
import { requestLocalBrief } from '../dist/local-nlp.mjs';

const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } };
const rooms = defaultRooms();
const result = generateAlternatives(plot, rooms);
const models = result.models;
const publicRooms = list => list.map(({ name, type, area, position, side }) => ({ name, type, area, position, side }));
const snapshot = { plot, rooms, palette: 'classic', rates: { walls: 125, doors: 0 }, costReserve: 7, vat: 15, idea: 'منزل بمجلسين', model: models[1], alternatives: models, history: [{ model: models[0], palette: 'modern' }] };

test('alternatives differ geometrically, preserve inputs and pass the existing geometry contract', () => {
  const before = JSON.stringify([plot, rooms]);
  assert.equal(models.length, 3);
  const footprints = new Set(models.map(m => quantities(m).footprint.toFixed(4)));
  assert.equal(footprints.size, 3);
  for (const m of models) {
    assert.deepEqual(validateModel(m), []);
    assert.deepEqual(publicRooms(m.program), rooms);
    assert.ok(Math.abs(quantities(m).rooms - 228) < 1e-6);
    for (const room of m.rooms) assert.ok(Math.abs(room.area - room.w * room.h) < 1e-5);
  }
  assert.deepEqual(generateAlternatives(plot, rooms), result);
  assert.equal(JSON.stringify([plot, rooms]), before);
});

test('gross built-area cap includes walls and circulation and never shrinks the room schedule', () => {
  const capped = generateAlternatives({ ...plot, maxBuiltArea: 340 }, rooms);
  assert.ok(capped.models.length < 3);
  assert.ok(capped.failures.length);
  capped.models.forEach(m => { assert.ok(quantities(m).footprint <= 340); assert.equal(quantities(m).rooms, 228); });
  assert.throws(() => generateAlternatives({ ...plot, maxBuiltArea: 228 }, rooms), /توزيع/);
  for (const value of [0, -2, 601, NaN, Infinity, '500']) assert.throws(() => validatePlot({ ...plot, maxBuiltArea: value }));
  assert.equal(validatePlot(plot).maxBuiltArea, null);
  const tampered = structuredClone(models[0]); tampered.plot.maxBuiltArea = 200;
  assert.ok(validateModel(tampered).some(s => s.includes('سقف البناء')));
});

test('corridor routes rotate correctly, are not straight-line shortcuts and never cross solid walls', () => {
  for (const entry of ['s', 'n', 'e', 'w']) {
    const m = generateModel({ ...plot, width: 30, length: 30, entry, streets: { [entry]: true } }, rooms);
    const network = circulationNetwork(m);
    const solids = wallPieces(m).filter(p => p.bottom < 1.6 && p.bottom + p.height > 1.6);
    for (const room of m.rooms) {
      const path = network.toRoom(room.id); assert.ok(path, room.name); assert.ok(path.metres > 0);
      const door = openingPoint(m, m.openings.find(o => o.roomId === room.id && o.type === 'door'));
      assert.deepEqual(path.points.at(-1), door);
      let length = 0;
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1], b = path.points[i];
        assert.ok(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6, 'every segment is orthogonal');
        length += Math.hypot(a.x - b.x, a.y - b.y);
        for (let t = .05; t < 1; t += .05) {
          const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          for (const wall of solids) {
            const horizontal = Math.abs(Math.sin(wall.angle)) < 1e-6;
            const w = horizontal ? wall.length : wall.thickness, h = horizontal ? wall.thickness : wall.length;
            assert.ok(!(Math.abs(point.x - wall.x) < w / 2 - 1e-6 && Math.abs(point.y - wall.y) < h / 2 - 1e-6), `${entry} ${room.name} crosses ${wall.wallId}`);
          }
        }
      }
      assert.ok(Math.abs(length - path.metres) < 1e-6);
      assert.ok(length >= Math.hypot(door.x - path.points[0].x, door.y - path.points[0].y) - 1e-6);
    }
  }
});

test('a disconnected corridor is reported as unreachable, not as zero distance', () => {
  const m = structuredClone(models[0]), room = m.rooms.find(r => r.corridorId !== 'spine');
  assert.ok(room);
  m.links = m.links.filter(pair => !pair.includes(room.corridorId));
  assert.equal(circulationNetwork(m).toRoom(room.id), null);
  assert.ok(reviewPlan(m).issues.some(i => i.text.includes('تعذر حساب')));
});

test('review discloses shared guest/family circulation and measures inter-room connections', () => {
  const review = reviewPlan(models[0]);
  assert.ok(review.issues.some(i => /الممر نفسه/.test(i.text)));
  assert.ok(review.relationships.some(r => r.from.includes('مطبخ') && r.to.includes('طعام') && r.metres > 0));
  assert.match(review.note, /ليست أقصر/);
});

test('project file round-trips selected alternative, dirty draft, history and explicit zero prices without secrets', () => {
  const text = encodeProject({ ...snapshot, plot: { ...plot, maxBuiltArea: 500 }, accessCode: 'PRIVATE-NEVER-EXPORT', apiKey: 'DO-NOT-EXPORT' });
  assert.ok(!text.includes('PRIVATE-NEVER-EXPORT')); assert.ok(!text.includes('DO-NOT-EXPORT'));
  const restored = decodeProject(text);
  assert.deepEqual(restored.model, snapshot.model);
  assert.deepEqual(restored.alternatives, models);
  assert.deepEqual(restored.history, snapshot.history);
  assert.equal(restored.rates.doors, 0); assert.equal(restored.rates.windows, undefined);
  assert.equal(restored.plot.maxBuiltArea, 500); assert.equal(restored.model.plot.maxBuiltArea, null);
});

test('project import rejects corrupt, mismatched, huge and infeasible files before accepting state', () => {
  const original = encodeProject(snapshot);
  assert.throws(() => decodeProject('not json'));
  assert.throws(() => decodeProject('x'.repeat(MAX_PROJECT_BYTES + 1)), /ميغابايت/);
  for (const mutate of [
    p => { p.engineVersion = 'old'; },
    p => { p.draft.rates.walls = -1; },
    p => { p.draft.vat = 100; },
    p => { p.design = null; },
    p => { p.alternatives[0].rooms[0].area += 1; },
    p => { p.history.push(...Array(6).fill(p.history[0])); },
    p => { p.design.plot.maxBuiltArea = 200; p.alternatives = []; },
  ]) { const altered = JSON.parse(original); mutate(altered); assert.throws(() => decodeProject(JSON.stringify(altered))); }
  assert.equal(encodeProject(snapshot).includes('corrupted'), false);
});

test('CSV distinguishes unpriced values from zero and carries a UTF-8 BOM and partial-scope warning', () => {
  const csv = quantitiesCSV(models[0], { doors: 0 }, 0, 0);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /ليست للتنفيذ/); assert.match(csv, /غير مسعّر/); assert.match(csv, /"0","0"/);
  assert.throws(() => quantitiesCSV(models[0], { doors: -1 }, 0, 0));
});

test('local understanding isolates negation, supports Arabic digits and retains room attributes', async () => {
  const original = defaultRooms(); original.find(r => r.type === 'kitchen').area = 48;
  const before = structuredClone(original);
  const brief = await requestLocalBrief({ prompt: 'أبي ٣ غرف نوم ومجلسين بدون خادمة', previous: { rooms: original } });
  assert.equal(brief.rooms.filter(r => r.type === 'bedroom').length, 3);
  assert.equal(brief.rooms.filter(r => r.type === 'majlis').length, 2);
  assert.equal(brief.rooms.find(r => r.type === 'kitchen').area, 48);
  assert.deepEqual(original, before);
  const removed = await requestLocalBrief({ prompt: 'لا أريد مطبخ ولا مستودع', previous: { rooms: [...original, { name: 'مستودع', type: 'storage', area: 20, position: 'middle', side: 'any' }] } });
  assert.ok(!removed.rooms.some(r => ['kitchen', 'storage'].includes(r.type)));
  assert.equal(removed.rooms.filter(r => r.type === 'bedroom').length, 4);
});

test('local understanding separates dining from living and reports unsupported dimensions and privacy', async () => {
  const brief = await requestLocalBrief({ prompt: 'مجلس رجال ٩×٧ ومجلس نساء٨×٦ وصالة طعام ٢٠ م² وصالة عائلية ٣٠ م² بمدخل مستقل', previous: { rooms: rooms } });
  assert.deepEqual(brief.rooms.filter(r => r.type === 'majlis').map(r => [r.name, r.area]), [['مجلس رجال', 63], ['مجلس نساء', 48]]);
  assert.equal(brief.rooms.find(r => r.type === 'dining').area, 20);
  assert.equal(brief.rooms.find(r => r.type === 'living').area, 30);
  assert.ok(brief.unhandled.some(s => /لا يثبّت/.test(s)));
  assert.ok(brief.unhandled.some(s => /المداخل/.test(s)));
});

test('local understanding handles English, additions and requests clarification for ambiguous resizing', async () => {
  const b = await requestLocalBrief({ prompt: 'three bedrooms and two bathrooms, no kitchen', previous: { rooms } });
  assert.equal(b.rooms.filter(r => r.type === 'bedroom').length, 3);
  assert.equal(b.rooms.filter(r => r.type === 'bath').length, 2);
  assert.equal(b.rooms.filter(r => r.type === 'kitchen').length, 0);
  const added = await requestLocalBrief({ prompt: 'أضف مطبخ', previous: { rooms } });
  assert.equal(added.rooms.filter(r => r.type === 'kitchen').length, 2);
  const ambiguous = await requestLocalBrief({ prompt: 'مجلس بمساحة ٤٨ م²', previous: { rooms } });
  assert.ok(ambiguous.questions.length); assert.deepEqual(ambiguous.rooms.filter(r => r.type === 'majlis').map(r => r.area), [32, 32]);
  await assert.rejects(requestLocalBrief({ prompt: '١١ غرف نوم', previous: { rooms } }), /لم أختصر/);
});
