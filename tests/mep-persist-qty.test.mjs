// حفظ الأنظمة الهندسية واستعادتها وإبطالها بعد تعديل العمارة، ودمج كمياتها في المخرجات النهائية (كتاب المشروع، quantities.csv، manifest.json).
// البدائل من محركي الفيلا الفعليين (tests/fixtures/mep). التخزين ذاكرة تحاكي localStorage بالواجهة نفسها (getItem/setItem).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as B from '../dist/mep-binding.mjs';
import * as Q from '../dist/mep-quantities.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { applyCommand, parseDoc } from '../dist/draw/doc.mjs';
import { interiorPoint } from '../dist/engineering-systems/src/geometry.mjs';
import { quantitiesCsv, buildExportBundle, bundleZip } from '../dist/draw/export-studio.mjs';
import { computeDocQuantities } from '../dist/draw/quantities-doc.mjs';
import { buildFinalData, projectBookHtml } from '../dist/final-outputs.mjs';

const root = new URL('../', import.meta.url).pathname;
const fx = name => JSON.parse(readFileSync(root + 'tests/fixtures/mep/' + name + '.json', 'utf8'));
const docOf = name => fx(name).alternatives[0].doc;
const clone = v => JSON.parse(JSON.stringify(v));
const memStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), raw: m }; };
const at = (room, z, dx = 0) => ({ ...interiorPoint(room), x: interiorPoint(room).x + dx, z });
const sha = b => createHash('sha256').update(b).digest('hex');
const V3 = docOf('C6-v3'), V2 = docOf('C6-v2');
const sessionOf = (createdAt, docs = [V3, V2]) => ({ v: 1, createdAt, current: 0, approved: 0, alternatives: [], designs: docs.map((d, i) => ({ doc: JSON.stringify(d), version: i + 1, engine: i ? 'v2' : 'v3' })) });
const roomOf = (project, type, lv = 'L1') => project.architecture.rooms.find(r => r.type === type && r.levelId === lv);

/** ما تفعله صفحة الأنظمة عند «أعد الحساب»: ربط، حساب، حفظ الكيان بمفتاحه وبصمة المستند. */
async function calcAndSave(store, src, inputs) {
  const doc = parseDoc(src.docText), b = await B.bindArchitecture(doc, { alternativeId: src.id, revision: src.revision, inputs });
  assert.equal(b.ok, true, JSON.stringify(b.error));
  const result = await B.computeSystems(b.project), data = B.loadStore(store), ent = B.entityFor(data, src.id, { sessionKey: src.sessionKey, kind: src.kind });
  B.saveEntity(store, data, { ...ent, sessionKey: src.sessionKey, kind: src.kind, revision: src.revision, sourceHash: b.sourceHash, inputs, result });
  return { b, result };
}
const devicesFor = async (src, kind, discipline, group, z) => {
  const b = await B.bindArchitecture(parseDoc(src.docText), { alternativeId: src.id, revision: src.revision });
  const room = roomOf(b.project, 'majlis');
  return B.addDevice(B.emptyInputs(), { discipline, group, kind, levelId: 'L1', roomId: room.id, position: at(room, z) }).inputs;
};
const edited = doc => { const A = analyzeDoc(doc), w = doc.walls.find(w => A.levels[0].rooms.filter(r => r.edges.some(e => e.wallIds?.includes(w.id))).length >= 2); return applyCommand(clone(doc), { type: 'update', id: w.id, patch: { t: Math.min(0.5, w.t + 0.1) } }).doc; };
const parseCsv = text => { const rows = []; let row = [], cur = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c; } if (cur || row.length) { row.push(cur); rows.push(row); } return rows; };

// ———————————————————————————————— أ) الحفظ والاستعادة بالمفتاح الصحيح
test('بديلان في جلسة واحدة بأنظمة مختلفة: التبديل يعيد الصحيح، وإعادة التحميل تستعيد، وكلاهما مطابق لبصمة مستنده', async () => {
  const store = memStore(), S = sessionOf(7), L = B.listSources({ session: S, studioRaw: JSON.stringify(V3) });
  const d1 = L.find(s => s.id === 'D7-v1'), d2 = L.find(s => s.id === 'D7-v2');
  assert.equal(d1.sessionKey, '7'); assert.equal(d2.sessionKey, '7');
  const in1 = await devicesFor(d1, 'PANEL', 'electrical', 0, 1.6), in2 = await devicesFor(d2, 'SMOKE_DETECTOR', 'fire', 0, 2.9);
  await calcAndSave(store, d1, in1); await calcAndSave(store, d2, in2);
  // «إعادة تحميل الصفحة» = قراءة جديدة من التخزين وحده
  for (const [src, want, kind] of [[d1, 'DB1', 'electrical'], [d2, 'SD1', 'fire'], [d1, 'DB1', 'electrical']]) {
    const e = B.entityFor(B.loadStore(store), src.id, { sessionKey: src.sessionKey, kind: src.kind });
    assert.equal(e.alternativeId, src.id); assert.equal(e.sessionKey, '7');
    assert.deepEqual(B.deviceRefs(e.inputs).map(d => d.id), [want]);
    assert.deepEqual(e.result.disciplines.find(d => d.id === kind).devices.map(d => d.id), [want]);
    const b = await B.bindArchitecture(parseDoc(src.docText), { alternativeId: src.id, revision: src.revision, inputs: e.inputs });
    const a = await B.assessEntity(e, { project: b.project, sourceHash: b.sourceHash });
    assert.equal(a.state, 'CURRENT'); assert.equal(a.fresh, true); assert.equal(e.sourceHash, b.sourceHash);
  }
  const hashes = ['D7-v1', 'D7-v2'].map(id => B.loadStore(store).entities[id].sourceHash);
  assert.notEqual(hashes[0], hashes[1]);
});

test('جلسة قديمة (createdAt مختلف) لا تخلط: كيان بالمعرّف نفسه من جلسة أخرى يُرفض، وبديل ثالث لا يرث شيئًا', async () => {
  const store = memStore(), old = B.listSources({ session: sessionOf(7), studioRaw: null }).find(s => s.id === 'D7-v1');
  await calcAndSave(store, old, await devicesFor(old, 'PANEL', 'electrical', 0, 1.6));
  // الجلسة الجديدة بالمستندين نفسيهما: معرّفات مختلفة، فلا كيان
  const fresh = B.listSources({ session: sessionOf(8), studioRaw: null }).find(s => s.id === 'D8-v1');
  const e = B.entityFor(B.loadStore(store), fresh.id, { sessionKey: fresh.sessionKey, kind: fresh.kind });
  assert.deepEqual(B.deviceRefs(e.inputs), []); assert.equal(e.result, null);
  // تلف أو نسخ يدوي: كيان جلسة 7 مخزّن تحت مفتاح جلسة 8 ⇒ يُرفض بالسبب ولا يُحمَّل
  const data = B.loadStore(store); data.entities['D8-v1'] = clone(data.entities['D7-v1']);
  const rejected = B.entityFor(data, 'D8-v1', { sessionKey: '8', kind: 'design' });
  assert.equal(rejected.restore.rejected, 'ALTERNATIVE_MISMATCH'); assert.equal(rejected.result, null); assert.deepEqual(B.deviceRefs(rejected.inputs), []);
  data.entities['D8-v1'].alternativeId = 'D8-v1';
  assert.equal(B.entityFor(data, 'D8-v1', { sessionKey: '8', kind: 'design' }).restore.rejected, 'SESSION_MISMATCH');
  // المصدر المباشر بلا جلسة: مفتاح nosession منفصل عن أي جلسة
  const solo = B.listSources({ session: null, studioRaw: JSON.stringify(V3) })[0];
  assert.equal(solo.id, 'STUDIO-unlinked'); assert.equal(solo.sessionKey, 'nosession');
  // كيان قديم بلا sessionKey (إصدار سابق) يبقى مقروءًا
  delete data.entities['D7-v1'].sessionKey; assert.ok(B.entityFor(data, 'D7-v1', { sessionKey: '7' }).result);
});

// ———————————————————————————————— أ) الإبطال بعد تعديل العمارة
test('تعديل جدار: النتيجة المحفوظة «قديمة» بالبصمة، المدخلات محفوظة كما هي، والتصدير يُرفض حتى إعادة الحساب', async () => {
  const store = memStore(), src = B.listSources({ session: sessionOf(7), studioRaw: null })[0];
  const inputs = await devicesFor(src, 'SMOKE_DETECTOR', 'fire', 0, 2.9);
  const { b: b0, result: r0 } = await calcAndSave(store, src, inputs);
  const doc2 = edited(parseDoc(src.docText)), b2 = await B.bindArchitecture(doc2, { alternativeId: src.id, revision: src.revision, inputs });
  assert.equal(b2.ok, true); assert.notEqual(b2.sourceHash, b0.sourceHash);
  const e = B.entityFor(B.loadStore(store), src.id, { sessionKey: '7' }), a = await B.assessEntity(e, { project: b2.project, sourceHash: b2.sourceHash });
  assert.equal(a.state, 'STALE'); assert.equal(a.reason, 'ARCHITECTURE_CHANGED'); assert.equal(a.archChanged, true); assert.equal(a.fresh, false);
  assert.equal(a.deviceCount, 1); assert.deepEqual(a.orphans, []); assert.equal(a.foreign, false);
  assert.deepEqual(e.inputs, inputs, 'مدخلات المستخدم محفوظة دون مساس');
  await assert.rejects(B.buildExport('csv', { project: b2.project, result: e.result, sourceHash: b2.sourceHash, scheduleId: 'quantities' }), x => x.code === 'STALE_RESULT');
  // إعادة الحساب على العمارة الجديدة تعيد الحالة CURRENT بنتيجة ببصمة معمارية جديدة
  const r2 = await B.computeSystems(b2.project); assert.notEqual(r2.architectureHash, r0.architectureHash);
  assert.equal((await B.assessEntity({ ...e, result: r2, sourceHash: b2.sourceHash }, { project: b2.project, sourceHash: b2.sourceHash })).state, 'CURRENT');
});

test('تعديل مدخل (نقل جهاز) بعد الحساب دون إعادة حساب: قديمة بسبب INPUTS_CHANGED، وجهاز فقد غرفته يُسجَّل يتيمًا ولا يُحذف', async () => {
  const store = memStore(), src = B.listSources({ session: sessionOf(7), studioRaw: null })[0];
  const inputs = await devicesFor(src, 'SMOKE_DETECTOR', 'fire', 0, 2.9);
  const { b } = await calcAndSave(store, src, inputs);
  const e = B.entityFor(B.loadStore(store), src.id, { sessionKey: '7' });
  const moved = B.moveDevice(e.inputs, 'SD1', { ...interiorPoint(roomOf(b.project, 'majlis')), x: interiorPoint(roomOf(b.project, 'majlis')).x + 0.3, z: 2.9 });
  B.saveEntity(store, B.loadStore(store), { ...e, inputs: moved }); // ما تفعله changed() في الصفحة: يحفظ المدخلات ويُبقي النتيجة القديمة
  const e2 = B.entityFor(B.loadStore(store), src.id, { sessionKey: '7' }), b2 = await B.bindArchitecture(parseDoc(src.docText), { alternativeId: src.id, revision: src.revision, inputs: e2.inputs });
  const a = await B.assessEntity(e2, { project: b2.project, sourceHash: b2.sourceHash });
  assert.equal(a.state, 'STALE'); assert.equal(a.reason, 'INPUTS_CHANGED'); assert.equal(a.archChanged, false);
  // جهاز في غرفة لم تعد موجودة: يتيم (يبقى في المدخلات للمراجعة)، وإن كانت كل الأجهزة يتيمة بعد تغيّر العمارة فالمدخلات «غريبة»
  const lost = clone(e2.inputs); lost.services.fire.devices[0].roomId = 'r999';
  assert.deepEqual(B.orphanDevices(lost, b2.project.architecture).map(d => d.id), ['SD1']);
  const doc2 = edited(parseDoc(src.docText)), b3 = await B.bindArchitecture(doc2, { alternativeId: src.id, revision: src.revision });
  const a3 = await B.assessEntity({ ...e2, inputs: lost }, { project: b3.project, sourceHash: b3.sourceHash });
  assert.equal(a3.foreign, true); assert.equal(a3.orphans.length, 1); assert.equal(B.deviceRefs(lost).length, 1);
  const a4 = await B.assessEntity({ ...e2 }, { project: b3.project, sourceHash: b3.sourceHash });
  assert.equal(a4.foreign, false, 'جهاز بغرفة موجودة ليس غريبًا');
});

// ———————————————————————————————— ب) قسم الكميات في المخرجات
const STUDIO_RAW = JSON.stringify(V3);
const resolveFor = (store, { doc = parseDoc(STUDIO_RAW), session = sessionOf(7), raw = STUDIO_RAW } = {}) => Q.resolveSystemsSection({ doc, session, studioRaw: raw, store });
async function calcStudio(store, inputs, { session = sessionOf(7), raw = STUDIO_RAW, sourceId = null } = {}) {
  const src = B.listSources({ session, studioRaw: raw }).find(s => sourceId ? s.id === sourceId : s.kind === 'studio');
  return calcAndSave(store, { ...src, docText: raw }, inputs);
}

test('قسم الكميات: لا أنظمة محسوبة ⇒ NOT_CALCULATED بلا أرقام ولا أصفار، والاسم والتصنيف حرفيان', async () => {
  const s = await resolveFor(memStore());
  assert.equal(s.status, 'NOT_CALCULATED'); assert.equal(s.title, 'كميات الأنظمة الهندسية — أولية'); assert.equal(s.classification, 'كميات أولية — غير معتمدة للتنفيذ');
  assert.deepEqual(s.rows, []); assert.equal(s.priced, null); assert.equal(s.constructionApproved, false); assert.equal(s.codeCompliance, 'NOT_EVALUATED');
  assert.equal(Q.PRELIMINARY_AR, B.PRELIMINARY_AR);
  // أجهزة أُدخلت بلا حساب: تُذكر محفوظة ولا كميات
  const store = memStore(), src = B.listSources({ session: sessionOf(7), studioRaw: STUDIO_RAW }).find(x => x.kind === 'studio');
  B.saveEntity(store, B.loadStore(store), { ...B.entityFor(B.loadStore(store), src.id, { sessionKey: '7' }), sessionKey: '7', inputs: await devicesFor({ ...src, docText: STUDIO_RAW }, 'SMOKE_DETECTOR', 'fire', 0, 2.9) });
  const s2 = await resolveFor(store); assert.equal(s2.status, 'NOT_CALCULATED'); assert.equal(s2.keptInputs.devices, 1); assert.deepEqual(s2.rows, []);
});

test('قسم الكميات لنتيجة حديثة: صفوف الحزمة نفسها، «غير مسعّر» لا صفر، لا إجمالي ما دام فيه بند غير مسعّر، والتسعير من مدخل العميل', async () => {
  const store = memStore(), src = B.listSources({ session: sessionOf(7), studioRaw: STUDIO_RAW }).find(x => x.kind === 'studio');
  let inputs = await devicesFor({ ...src, docText: STUDIO_RAW }, 'PANEL', 'electrical', 0, 1.6);
  const maj = roomOf((await B.bindArchitecture(parseDoc(STUDIO_RAW), { alternativeId: src.id, revision: src.revision })).project, 'majlis');
  inputs = B.addDevice(inputs, { discipline: 'fire', group: 0, kind: 'SMOKE_DETECTOR', levelId: 'L1', roomId: maj.id, position: at(maj, 2.9) }).inputs;
  const { result } = await calcStudio(store, inputs);
  const s = await resolveFor(store);
  assert.equal(s.status, 'CURRENT'); assert.equal(s.rows.length, result.quantities.rows.length);
  assert.deepEqual(s.rows.map(r => [r.discipline, r.layer, r.quantity]).sort(), result.quantities.rows.map(r => [r.discipline, r.layer, r.quantity]).sort());
  assert.ok(s.rows.every(r => r.priceAr === 'غير مسعّر' && r.amountAr === 'غير مسعّر' && r.rate === null && r.amount === null), 'لا سعر ≠ صفر');
  assert.equal(s.priced.total, null); assert.match(s.priced.totalAr, /لا إجمالي: 2 من 2 بندًا غير مسعّر/); assert.equal(s.priced.subtotalAr, 'غير مسعّر');
  assert.ok(s.rows.some(r => r.disciplineAr === 'كهرباء' && r.kindAr === 'لوحة توزيع') && s.rows.some(r => r.disciplineAr === 'حريق' && r.kindAr === 'كاشف دخان'));
  assert.deepEqual(s.emptyDisciplines, ['hvac', 'plumbing', 'low_current', 'solar']);
  assert.deepEqual([s.binding.inputHash, s.binding.resultHash, s.binding.architectureHash], [result.inputHash, result.resultHash, result.architectureHash]);
  assert.equal(s.binding.sourceHash, result.source.sha256);
  // تسعير جزئي ثم كامل: المبلغ = الكمية × السعر، والإجمالي لا يظهر قبل اكتمال التسعير
  const rates = { [result.quantities.rows[0].key]: 100 };
  const part = clone(inputs); part.rules.rates = rates; await calcStudio(store, part);
  const sp = await resolveFor(store); assert.equal(sp.priced.pricedCount, 1); assert.equal(sp.priced.total, null); assert.notEqual(sp.priced.subtotalAr, 'غير مسعّر');
  const full = clone(inputs); full.rules.rates = Object.fromEntries(result.quantities.rows.map(r => [r.key, 10])); await calcStudio(store, full);
  const sf = await resolveFor(store); assert.equal(sf.priced.unpricedCount, 0); assert.equal(sf.priced.total, 20); assert.ok(sf.rows.every(r => r.amount === r.quantity * 10));
});

test('بعد تعديل العمارة أو المدخلات: القسم STALE بلا أي كمية قديمة في HTML أو CSV أو JSON، ويذكر المدخلات المحفوظة', async () => {
  const store = memStore(), src = B.listSources({ session: sessionOf(7), studioRaw: STUDIO_RAW }).find(x => x.kind === 'studio');
  const inputs = await devicesFor({ ...src, docText: STUDIO_RAW }, 'PANEL', 'electrical', 0, 1.6);
  await calcStudio(store, inputs);
  assert.equal((await resolveFor(store)).status, 'CURRENT');
  const doc2 = edited(parseDoc(STUDIO_RAW)), raw2 = JSON.stringify(doc2);
  const s = await resolveFor(store, { doc: parseDoc(raw2), raw: raw2 });
  assert.equal(s.status, 'STALE'); assert.equal(s.reason, 'ARCHITECTURE_CHANGED'); assert.deepEqual(s.rows, []); assert.equal(s.priced, null);
  assert.equal(s.keptInputs.devices, 1); assert.match(s.statusAr, /قديمة/);
  const html = Q.sectionBodyHtml(s), csv = Q.sectionCsvRows(s).flat().join('|'), json = JSON.stringify(Q.sectionJson(s));
  for (const t of [html, csv, json]) { assert.ok(!/DB1|E-POWER|لوحة توزيع/.test(t), 'لا بند قديم'); }
  assert.match(html, /data-mep-status="STALE"/); assert.match(html, /1 جهازًا/); assert.ok(!html.includes('<table'));
  // الرجوع إلى المخطط الأصلي يعيدها حديثة (البصمة تطابق)، وتعديل المدخلات بلا إعادة حساب يجعلها قديمة
  assert.equal((await resolveFor(store)).status, 'CURRENT');
  const e = B.entityFor(B.loadStore(store), src.id, { sessionKey: '7' }), more = B.removeDevice(e.inputs, 'DB1');
  B.saveEntity(store, B.loadStore(store), { ...e, inputs: more });
  const si = await resolveFor(store); assert.equal(si.status, 'STALE'); assert.equal(si.reason, 'INPUTS_CHANGED'); assert.deepEqual(si.rows, []);
});

test('جلسة أخرى أو مخطط بلا حساب لا يرث أنظمة جلسة قديمة، والمخطط المعتمد بلا تعديل يتبنّى حساب نسخته من الجلسة نفسها (البصمة نفسها)', async () => {
  const store = memStore(), inputs = await devicesFor(B.listSources({ session: sessionOf(7), studioRaw: null })[0], 'PANEL', 'electrical', 0, 1.6);
  // حساب على التصميم 1 (D7-v1) فقط، ثم المرسم بالمستند نفسه ⇒ يتبنّى
  await calcStudio(store, inputs, { sourceId: 'D7-v1' });
  const adopted = await resolveFor(store); assert.equal(adopted.status, 'CURRENT'); assert.equal(adopted.binding.alternativeId, 'D7-v1');
  // جلسة 9 (جديدة): لا شيء
  const other = await resolveFor(store, { session: sessionOf(9) }); assert.equal(other.status, 'NOT_CALCULATED'); assert.deepEqual(other.rows, []);
  // مستند مرسم مختلف تمامًا (التصميم 2) بالجلسة نفسها: بصمة مختلفة فلا تبنٍّ
  const raw2 = JSON.stringify(V2), none = await resolveFor(store, { doc: parseDoc(raw2), raw: raw2 }); assert.notEqual(none.status, 'CURRENT');
});

test('المحجوب (BLOCKED) وغير المحسوب (NOT_CALCULATED) بسببهما، وكميات المسار المتعذر لا تدخل الحصر ولا أصفار', async () => {
  const store = memStore(), src0 = B.listSources({ session: sessionOf(7), studioRaw: STUDIO_RAW }).find(x => x.kind === 'studio');
  const p0 = (await B.bindArchitecture(parseDoc(STUDIO_RAW), { alternativeId: src0.id, revision: src0.revision })).project, hall = roomOf(p0, 'living'), c = interiorPoint(hall), y = c.y, x0 = c.x - 1.2, x1 = c.x + 1.2;
  const i = B.emptyInputs(); i.structure = { usePrecheck: false };
  i.services.low_current = { devices: [{ id: 'R1', kind: 'DATA_RACK', levelId: 'L1', roomId: hall.id, position: { x: x0, y, z: 1 } }, { id: 'D1', kind: 'DATA_OUTLET', levelId: 'L1', roomId: hall.id, position: { x: x1, y, z: 0.4 } }],
    connections: [{ id: 'T1', fromId: 'R1', toId: 'D1', routing: { routeHeightM: 2.6, widthM: 0.03, heightM: 0.03, clearanceM: 0.02 } }] };
  i.manualObstacles = [{ id: 'BEAM-T', kind: 'beam', min: { x: c.x - 0.15, y: -100, z: 2.4 }, max: { x: c.x + 0.15, y: 100, z: 3.2 } }];
  const maj = roomOf(p0, 'majlis'); i.services.electrical = { loads: [{ id: 'SO1', kind: 'SOCKET', levelId: 'L1', roomId: maj.id, position: at(maj, 0.3), powerW: 200 }] };
  const { result } = await calcStudio(store, i);
  assert.equal(result.disciplines.find(d => d.id === 'low_current').routes[0].status, 'BLOCKED');
  const s = await resolveFor(store);
  assert.equal(s.status, 'CURRENT');
  assert.equal(s.blocked.length, 1); assert.equal(s.blocked[0].discipline, 'low_current'); assert.match(s.blocked[0].reason, /NO_PATH|BLOCKED/); assert.match(s.blocked[0].reasonAr, /لا يوجد مسار|محجوب|المسار/);
  assert.ok(s.notCalculated.some(n => n.id === 'E-P-SO1' && /powerFactor|بيانات الحساب/.test(n.reasonAr)), JSON.stringify(s.notCalculated));
  assert.ok(!s.rows.some(r => r.unitAr === 'م' && r.discipline === 'low_current'), 'لا طول لمسار متعذر');
  assert.ok(s.rows.every(r => r.quantity > 0), 'لا صفر مضلل');
  const html = Q.sectionBodyHtml(s); assert.match(html, /مسارات متعذرة \(BLOCKED\)/); assert.match(html, /بنود غير محسوبة \(NOT_CALCULATED\)/);
  const csvRows = Q.sectionCsvRows(s); assert.ok(csvRows.some(r => r[0] === 'مسار متعذر') && csvRows.some(r => r[0] === 'غير محسوب'));
});

// ———————————————————————————————— صيغ التصدير: فتح الملفات الناتجة فعلًا
test('quantities.csv في حزمة التصدير: BOM، كميات العمارة كما كانت، ثم قسم الأنظمة بترويسته، والقديم بلا أرقام', async () => {
  const store = memStore(), src = B.listSources({ session: sessionOf(7), studioRaw: STUDIO_RAW }).find(x => x.kind === 'studio');
  const inputs = await devicesFor({ ...src, docText: STUDIO_RAW }, 'PANEL', 'electrical', 0, 1.6);
  await calcStudio(store, inputs);
  const doc = parseDoc(STUDIO_RAW), cur = await resolveFor(store), NOW = new Date('2026-11-01T00:00:00Z');
  const { files, manifest } = await buildExportBundle(doc, { now: NOW, systems: cur });
  const csvFile = files.find(f => f.name === 'quantities.csv'), text = Buffer.from(csvFile.bytes).toString('utf8');
  assert.equal(text.charCodeAt(0), 0xfeff);
  const res = computeDocQuantities(doc), base = quantitiesCsv(res);
  assert.ok(text.startsWith(base), 'جدول العمارة كما كان حرفيًا في أول الملف');
  const rows = parseCsv(text.slice(1));
  const ti = rows.findIndex(r => r[0] === 'كميات الأنظمة الهندسية — أولية'); assert.ok(ti > res.rows.length);
  assert.deepEqual(rows[ti + 1], ['التصنيف', 'كميات أولية — غير معتمدة للتنفيذ']);
  const hi = rows.findIndex(r => r[0] === 'التخصص' && r[5] === 'سعر الوحدة'); assert.ok(hi > ti);
  assert.deepEqual(rows[hi + 1].slice(0, 7), ['كهرباء', 'لوحة توزيع', 'لوحات وأحمال', '1', 'عدد', 'غير مسعّر', 'غير مسعّر']);
  assert.ok(rows.some(r => r[0] === 'الإجمالي' && /لا إجمالي/.test(r[1])));
  assert.ok(rows.some(r => r[0] === 'بصمة نتيجة الأنظمة' && r[1] === cur.binding.resultHash));
  // البيان: يحمل القسم نفسه وsha256 الملف صحيح
  assert.deepEqual(manifest.systemsQuantities, Q.sectionJson(cur)); assert.equal(manifest.files.find(f => f.name === 'quantities.csv').sha256, sha(csvFile.bytes));
  assert.equal(manifest.systemsQuantities.status, 'CURRENT'); assert.equal(manifest.systemsQuantities.constructionApproved, false);
  // ZIP: يبقى صالحًا وفيه الملف نفسه
  assert.ok(bundleZip({ files }, NOW).length > csvFile.bytes.length);
  // قديمة: القسم في الملف بلا أرقام
  const raw2 = JSON.stringify(edited(doc)), stale = await resolveFor(store, { doc: parseDoc(raw2), raw: raw2 });
  const b2 = await buildExportBundle(parseDoc(raw2), { now: NOW, systems: stale }), t2 = Buffer.from(b2.files.find(f => f.name === 'quantities.csv').bytes).toString('utf8');
  assert.match(t2, /كميات الأنظمة الهندسية — أولية/); assert.match(t2, /قديمة/); assert.ok(!/لوحة توزيع|E-POWER/.test(t2));
  assert.equal(b2.manifest.systemsQuantities.status, 'STALE'); assert.deepEqual(b2.manifest.systemsQuantities.rows, []);
});

test('بلا تمرير systems: الحزمة وكتاب المشروع يحملان القسم بحالة «لم تُحسب» ولا يكسران، وكميات العمارة دون تغيير', async () => {
  const doc = parseDoc(STUDIO_RAW), { files, manifest } = await buildExportBundle(doc, { now: new Date('2026-11-01T00:00:00Z') });
  assert.equal(manifest.systemsQuantities.status, 'NOT_CALCULATED');
  const t = Buffer.from(files.find(f => f.name === 'quantities.csv').bytes).toString('utf8'); assert.match(t, /لم تُحسب الأنظمة الهندسية/);
  const d = buildFinalData(doc, { now: new Date('2026-11-01T00:00:00Z') }); assert.equal(d.systems.status, 'NOT_CALCULATED');
  const h = projectBookHtml(d); assert.match(h, /كميات الأنظمة الهندسية — أولية/); assert.match(h, /كميات أولية — غير معتمدة للتنفيذ/); assert.ok(!/NaN|undefined/.test(h));
});

test('كتاب المشروع: القسم الحديث بجداوله و«غير مسعّر» والمتعذر بسببه، ويهرّب النص، وبلا NaN/undefined', async () => {
  const store = memStore(), src = B.listSources({ session: sessionOf(7), studioRaw: STUDIO_RAW }).find(x => x.kind === 'studio');
  const inputs = await devicesFor({ ...src, docText: STUDIO_RAW }, 'SMOKE_DETECTOR', 'fire', 0, 2.9);
  inputs.rules.provenance = [];
  await calcStudio(store, inputs);
  const doc = parseDoc(STUDIO_RAW), cur = await resolveFor(store);
  const d = buildFinalData(doc, { now: new Date('2026-11-01T00:00:00Z'), systems: cur }), h = projectBookHtml(d);
  assert.match(h, /<h2>كميات الأنظمة الهندسية — أولية<\/h2>/); assert.match(h, /data-mep-status="CURRENT"/); assert.match(h, /كاشف دخان/); assert.match(h, /غير مسعّر/); assert.ok(!/NaN|undefined/.test(h));
  // الأقسام الأصلية باقية بترتيبها، والقسم قبل «لماذا هذا التصميم»
  for (const t of ['نظرة عامة', 'الكميات', 'التكلفة بأسعارك', 'لماذا هذا التصميم', 'ما بعد التصميم']) assert.ok(h.includes(t), t);
  assert.ok(h.indexOf('كميات الأنظمة الهندسية — أولية') < h.indexOf('لماذا هذا التصميم'));
  const evil = { ...cur, rows: cur.rows.map(r => ({ ...r, kindAr: '<img src=x onerror=alert(1)>' })) };
  assert.ok(!Q.sectionBodyHtml(evil).includes('<img'));
});
