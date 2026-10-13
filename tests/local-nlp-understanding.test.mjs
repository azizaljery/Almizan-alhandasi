import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeClientRequest } from '../dist/client-request.mjs';

const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { s: true }, streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null };
const analyze = (prompt, extra = {}) => analyzeClientRequest({ prompt, rooms: [], plot, discovery: {}, mode: 'replace', ...extra });
const counts = result => result.rooms.reduce((acc, room) => ({ ...acc, [room.type]: (acc[room.type] || 0) + 1 }), {});

test('"ابي دور غرفتين وحمامين ومجلس": the floor word does not eat the counts, and nothing is asked', async () => {
  const r = await analyze('ابي دور غرفتين وحمامين ومجلس');
  assert.deepEqual(counts(r), { bedroom: 2, bath: 2, majlis: 1 });
  assert.deepEqual(r.questions, []);
});

test('a number glued to "دور" is a floor count, never a room count; a dual noun wins over a stray number', async () => {
  const one = await analyze('أبي دور واحد غرفتين نوم وحمامين ومجلس');
  assert.deepEqual(counts(one), { bedroom: 2, bath: 2, majlis: 1 });
  assert.equal(one.plotPatch.floors, 1);
  const three = await analyze('ابي دور واحد 3 غرف نوم و حمامين');
  assert.deepEqual(counts(three), { bedroom: 3, bath: 2 });
  const home = await analyze('ابي بيت دور واحد فيه غرفتين وحمامين ومجلس');
  assert.deepEqual(counts(home), { bedroom: 2, bath: 2, majlis: 1 });
});

test('the same room type mentioned twice in one request accumulates instead of the last mention replacing the first', async () => {
  const master = await analyze('ابي غرفة نوم ماستر ومعها حمام وغرفتين اطفال');
  assert.deepEqual(counts(master), { bedroom: 3, bath: 1 });
  assert.ok(master.assumptions.some(text => /جمعنا غرف النوم المذكورة في طلبك: 3/.test(text)));
  const staff = await analyze('ابي غرفة خادمة وغرفة سواق ومستودع');
  assert.deepEqual(counts(staff), { service: 2, storage: 1 });
  const mixed = await analyze('ابي مجلس وغرفتين نوم وغرفة نوم ماستر');
  assert.deepEqual(counts(mixed), { majlis: 1, bedroom: 3 });
});

test('a mention that refers back to an already counted room ("منها", "ال…") adds no extra room', async () => {
  const subset = await analyze('أبي 4 غرف نوم منها غرفة نوم ماستر');
  assert.deepEqual(counts(subset), { bedroom: 4 });
  const definite = await analyze('ابي مطبخ والمطبخ يكون قريب من الصالة');
  assert.equal(counts(definite).kitchen, 1);
});

test('named majlis, explicit counts, dimensions and Arabic-Indic digits are unchanged', async () => {
  assert.deepEqual(counts(await analyze('ابغى مجلس رجال ومجلس نساء وصالة ومطبخ وثلاث غرف نوم وحمامين')), { majlis: 2, living: 1, kitchen: 1, bedroom: 3, bath: 2 });
  assert.deepEqual(counts(await analyze('عندي ارض 20×30 ابي ٤ غرف نوم ومجلس ومطبخ')), { bedroom: 4, majlis: 1, kitchen: 1 });
  const dims = await analyze('ابي ثلاث غرف نوم حجم كل وحدة ٤×٥');
  assert.equal(dims.rooms.length, 3);
  assert.ok(dims.rooms.every(room => room.dimensions?.width === 4 && room.dimensions?.length === 5));
});

test('a vague request gets exactly one short question, not a list of technical messages', async () => {
  const small = await analyze('ابي بيت صغير');
  assert.equal(small.rooms.length, 0);
  assert.equal(small.questions.length, 1);
  assert.ok(small.questions[0].length < 90);
  const generic = await analyze('ودي بيت دورين فيه ٥ غرف');
  assert.equal(generic.questions.length, 1);
  assert.match(generic.questions[0], /5 غرف دون تحديد نوعها/);
  assert.equal(generic.plotPatch.floors, 2);
  const big = await analyze('ابي مطبخ كبير ومجلس واسع');
  assert.equal(big.questions.length, 1);
});

test('a clear request produces no per-type "review" noise; modifying an existing program still reports what changed', async () => {
  const fresh = await analyze('أبي مجلس وصالة ومطبخ وغرفتين نوم');
  assert.deepEqual(fresh.questions, []);
  assert.ok(fresh.assumptions.length <= 1, fresh.assumptions.join(' | '));
  const first = await analyze('ابي 3 غرف نوم ومجلس');
  const modified = await analyze('اضف غرفة نوم', { rooms: first.rooms, mode: 'modify' });
  assert.equal(counts(modified).bedroom, 4);
  assert.ok(modified.assumptions.some(text => /راجع غرفة نوم/.test(text)));
});
