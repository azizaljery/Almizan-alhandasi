import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDNA, weightsFromDNA, rankByDNA, geometryFingerprint, fingerprint, DNA_AXES } from '../dist/design-dna.mjs';
import { generateInitialDesign, SharaSession, normalizeLand } from '../dist/home-flow.mjs';
import { defaultRooms } from '../dist/planner.mjs';
import { normalizeDiscovery } from '../dist/client-brief.mjs';
import { writeHandoff, consumeHandoff, loadSavedDNA, HANDOFF_KEY, DNA_KEY } from '../dist/draw/handoff.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';

const land = { length: 30, width: 20, streets: ['s'], entries: ['s'] };
const counts = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
const { plot } = normalizeLand(land);
const rooms = defaultRooms(counts);
const empty = normalizeDiscovery({ likes: [], rejects: [], avoids: [], life: {} });
const rich = normalizeDiscovery({ likes: [], rejects: [], avoids: ['غرف نوم مكشوفة أو قريبة من الضيافة', 'مرور الضيوف عبر خصوصية العائلة'], life: { guests: 'متكررة', children: 'جناح هادئ', seniors: 'موجودون', future: 'مهمة' } });

test('بصمة بلا إجابات: كل المحاور «افتراضي» ولا ينسب المحرك شيئًا للعميل', () => {
  const d = buildDNA({ plot, rooms, discovery: empty, counts });
  assert.equal(d.defaults.length, DNA_AXES.length);
  for (const a of DNA_AXES) assert.match(d.sources[a.id].join(), /افتراضي/);
});

test('إجابات العميل تحرّك المحاور المقابلة وتسجّل سببها', () => {
  const d = buildDNA({ plot, rooms, discovery: rich, counts });
  assert.equal(d.values.hospitality, 0.9); assert.equal(d.values.accessibility, 0.95); assert.equal(d.values.futureExpansion, 0.9);
  assert.ok(d.values.privacy >= 0.95); assert.match(d.sources.privacy.join(), /غرف نوم مكشوفة/);
  assert.ok(!d.defaults.includes('futureExpansion'));
});

test('نص «بدون فناء» يخفض الانفتاح ويُنسب لنص العميل', () => {
  const d = buildDNA({ plot, rooms, discovery: empty, counts, idea: 'أريد بيتًا بدون فناء' });
  assert.ok(d.values.openness <= 0.3); assert.match(d.sources.openness.join(), /بدون فناء/);
});

test('الأوزان مجموعها 1، والمحور الأعلى يرفع وزن مقياسه عن الافتراضي', () => {
  const lo = weightsFromDNA(buildDNA({ plot, rooms, discovery: empty, counts }).values);
  const hi = weightsFromDNA(buildDNA({ plot, rooms, discovery: rich, counts }).values);
  for (const w of [lo, hi]) assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(hi.privacy > lo.privacy);
  assert.ok(hi.circulation > lo.circulation);
});

test('التوليد يعيد بصمة وبدائل محوّلة وبصمة هندسة تطابق المستند', async () => {
  const out = await generateInitialDesign({ land, rooms, discovery: rich, idea: '', counts });
  assert.ok(out.dna && out.dna.rows.length === out.alternativesCount);
  assert.equal(out.dna.selectedIndex, out.selectedIndex);
  assert.ok(Number.isInteger(out.dna.bestIndex));
  assert.equal(out.dna.geometryFingerprint, geometryFingerprint(out.doc));
  assert.ok(out.alternatives.length >= 1 && out.alternatives.every(a => a.doc.schema === 'mizan-draw/1'));
  assert.ok(out.dna.rows.some(r => r.score !== r.neutralScore), 'ميزان العميل يغيّر الدرجة فعلًا');
  assert.equal(out.dna.rows.every(r => Number.isFinite(r.score)), true);
});

test('إجابات مختلفة تعطي بصمة ميزان مختلفة وأوزانًا مختلفة (البصمة مؤثرة لا شكلية)', async () => {
  const a = await generateInitialDesign({ land, rooms, discovery: empty, idea: '', counts });
  const b = await generateInitialDesign({ land, rooms, discovery: rich, idea: '', counts });
  assert.notEqual(a.dna.fingerprint, b.dna.fingerprint);
  assert.notDeepEqual(a.dna.rows.map(r => r.score), b.dna.rows.map(r => r.score));
});

test('بصمة الهندسة: ثابتة لترتيب العناصر والعنوان، وتتغير بتحريك جدار أو إضافة فتحة', async () => {
  const { doc } = await generateInitialDesign({ land, rooms, discovery: empty, idea: '', counts });
  const base = geometryFingerprint(doc);
  const shuffled = { ...doc, title: 'اسم آخر', walls: [...doc.walls].reverse(), openings: [...doc.openings].reverse() };
  assert.equal(geometryFingerprint(shuffled), base);
  const moved = { ...doc, walls: doc.walls.map((w, i) => (i === 0 ? { ...w, a: { ...w.a, x: w.a.x + 0.05 } } : w)) };
  assert.notEqual(geometryFingerprint(moved), base);
  const wall = doc.walls[0];
  const withDoor = applyCommand(doc, { type: 'add-opening', level: wall.level, wall: wall.id, kind: 'window', at: 0.5, w: 1.2 }).doc;
  assert.notEqual(geometryFingerprint(withDoor), base);
});

test('fingerprint ثابتة وحساسة للتغيير الطفيف', () => {
  assert.equal(fingerprint({ a: 1, b: [1, 2] }), fingerprint({ b: [1, 2], a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 1.01 }));
  assert.match(fingerprint({}), /^[0-9a-f]{16}$/);
});

test('التسليم يحمل البصمة والبدائل ويحفظها للمرسم، ويرفض البديل التالف', async () => {
  const out = await generateInitialDesign({ land, rooms, discovery: rich, idea: '', counts });
  const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), raw: m }; };
  const session = store(), local = store();
  writeHandoff(session, out.doc, { source: 'home-shara', dna: out.dna, alternatives: [...out.alternatives, { index: 99, strategy: 'bad', doc: { schema: 'x' } }] });
  const got = consumeHandoff(session, local);
  assert.ok(got.dna && got.alternatives.length === out.alternatives.length);
  assert.ok(!got.alternatives.some(a => a.index === 99));
  assert.equal(session.getItem(HANDOFF_KEY), null);
  assert.ok(local.getItem(DNA_KEY));
  const saved = loadSavedDNA(local);
  assert.equal(saved.dna.fingerprint, out.dna.fingerprint);
  assert.equal(saved.alternatives.length, out.alternatives.length);
  // تسليم بلا بصمة يزيل البصمة القديمة حتى لا تُنسب لمشروع آخر
  writeHandoff(session, out.doc, { source: 'home' }); consumeHandoff(session, local);
  assert.equal(loadSavedDNA(local), null);
});

test('بدائل ضخمة تُهمل ولا تكسر التسليم', async () => {
  const out = await generateInitialDesign({ land, rooms, discovery: empty, idea: '', counts });
  const big = Array.from({ length: 400 }, (_, i) => ({ index: i, strategy: 's', doc: out.doc }));
  const m = new Map(); const session = { setItem: (k, v) => m.set(k, v), getItem: k => m.get(k) ?? null, removeItem: k => m.delete(k) };
  writeHandoff(session, out.doc, { dna: out.dna, alternatives: big });
  assert.equal(JSON.parse(m.get(HANDOFF_KEY)).alternatives.length, 0);
});
