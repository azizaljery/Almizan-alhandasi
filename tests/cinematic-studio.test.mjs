import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cinematicFrame, CINEMATIC_TIMING } from '../dist/cinematic-entry.mjs';
import { diffRoomPrograms, geometryFingerprint, composeDesignConversation } from '../dist/design-dialog.mjs';
import { THREE_RUNTIME_VERSION } from '../dist/three-runtime.mjs';

const oldRooms = [
  { name: 'مجلس رجال', type: 'majlis', area: 63, position: 'front', side: 'any' },
  { name: 'صالة عائلية', type: 'living', area: 40, position: 'middle', side: 'any' },
  { name: 'غرفة نوم', type: 'bedroom', area: 24, position: 'back', side: 'any' },
];
const read = name => readFileSync(new URL('../dist/' + name, import.meta.url), 'utf8');

test('cinematic holds the architectural view before approaching the Mizan identity', () => {
  assert.equal(CINEMATIC_TIMING.holdMs, 2700);
  assert.equal(cinematicFrame(0).approach, 0);
  assert.equal(cinematicFrame(2500).approach, 0);
  assert.ok(cinematicFrame(3300).approach > 0);
  assert.ok(cinematicFrame(4200).approach > .9);
  assert.ok(cinematicFrame(4500).reveal > 0);
  assert.equal(cinematicFrame(4800).finished, true);
});

test('silent removal of a room is blocked during a revision', () => {
  const result = diffRoomPrograms(oldRooms, oldRooms.slice(0, 2), 'قرّب الصالة من مجلس الرجال');
  assert.equal(result.removed.length, 1);
  assert.ok(result.blockers.some(x => /يحذف غرفًا/.test(x)));
});

test('explicit removal and area changes are reviewed, not silently blocked', () => {
  const removed = diffRoomPrograms(oldRooms, oldRooms.slice(0, 2), 'احذف غرفة النوم');
  assert.equal(removed.blockers.length, 0);
  const changed = structuredClone(oldRooms);
  changed[0].area = 70;
  assert.equal(diffRoomPrograms(oldRooms, changed, 'كبر مساحة مجلس الرجال').blockers.length, 0);
  assert.ok(diffRoomPrograms(oldRooms, changed, 'أريد خصوصية أكثر').blockers.some(x => /مساحات/.test(x)));
});

test('identical room program is not counted as a successful revision', () => {
  const diff = diffRoomPrograms(oldRooms, structuredClone(oldRooms), 'أبعد غرف النوم عن الضيوف');
  assert.equal(diff.noChange, true);
  assert.ok(diff.blockers.some(x => /لم يغيّر/.test(x)));
  assert.equal(diffRoomPrograms(oldRooms, oldRooms, 'أريد بيتًا جديدًا', { initial: true, requireChange: false }).blockers.length, 0);
});

test('geometry fingerprint changes with actual room position, not marketing labels', () => {
  const model = { shape: 'rect', rooms: [{ id: 'room-0', name: 'مجلس', type: 'majlis', x: 1, y: 2, w: 6, h: 5 }], corridors: [], courtyards: [], openings: [] };
  const other = structuredClone(model);
  other.rooms[0].x = 3;
  assert.notEqual(geometryFingerprint(model), geometryFingerprint(other));
  assert.equal(geometryFingerprint(model), geometryFingerprint(structuredClone(model)));
});

test('conversation prompt preserves original brief and latest request within bounds', () => {
  const result = composeDesignConversation('ثلاث غرف نوم ومجلسان', ['قرب الطعام من المطبخ'], 'كبر الصالة');
  assert.match(result, /ثلاث غرف نوم/);
  assert.match(result, /قرب الطعام/);
  assert.match(result, /كبر الصالة/);
  assert.throws(() => composeDesignConversation('x'.repeat(3900), [], 'latest'), /طويل/);
});

test('old detailed editor and project functions remain in the source but are hidden in simple mode', () => {
  const html = read('index.html'), css = read('studio-simple.css');
  assert.match(html, /id="studioSimple"/);
  assert.match(html, /id="studioRequestForm"/);
  assert.match(html, /id="studioProposalPanel"/);
  assert.match(html, /id="roomRows"/);
  assert.match(html, /id="gen"/);
  assert.match(html, /id="out"/);
  assert.match(css, /studio-advanced-open/);
  assert.match(css, /:not\(#studioSimple\):not\(#out\)/);
});

test('3D runtime is ESM, cinematic can be skipped, and reduced-motion is supported', () => {
  const app = read('app.mjs'), html = read('index.html'), css = read('cinematic-entry.css');
  assert.equal(THREE_RUNTIME_VERSION, '0.160.0');
  assert.doesNotMatch(app, /build\/three\.min\.js/);
  assert.match(app, /loadThreeRuntime/);
  assert.match(html, /id="cinematicCanvas"/);
  assert.match(html, /id="cinematicSkip"/);
  assert.match(html, /id="enter"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(read('studio-simple.mjs'), /api\.drawProposal\(\)/);
});

test('cinematic and studio scripts preserve existing AI Worker and single-model generation', () => {
  const app = read('app.mjs'), studio = read('studio-simple.mjs');
  assert.match(app, /Object\.defineProperty\(window, 'mizanStudioAPI'/);
  assert.match(app, /await runMultiEngineDesign/);
  assert.match(app, /await requestBrief/);
  assert.match(studio, /diffRoomPrograms/);
  assert.match(studio, /geometryFingerprint/);
  assert.doesNotMatch(studio, /fakeSuccess|mockPlan/);
});
