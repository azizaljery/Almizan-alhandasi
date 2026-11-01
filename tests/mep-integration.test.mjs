// تكامل حزمة الأنظمة الهندسية (dist/engineering-systems، MIZAN-MEP 0.1.0) مع البديل المعماري المختار عبر dist/mep-binding.mjs.
// البدائل من محركي الفيلا الفعليين (v3 الافتراضي وv2) محفوظة في tests/fixtures/mep (تولَّد بـ scripts/mep-fixtures.mjs)
// مع بصمة ملفي المحركين؛ إن تغيّر محرك يفشل اختبار المصدر حتى يُعاد توليدها (لا تُقبل مستندات من محرك آخر بصمت).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import * as B from '../dist/mep-binding.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { applyCommand, validateDoc } from '../dist/draw/doc.mjs';
import { exportArtifacts, toSvg, VERSION, InputError } from '../dist/engineering-systems/src/index.mjs';
import { interiorPoint, inRoom, segmentBox } from '../dist/engineering-systems/src/geometry.mjs';

const root = new URL('../', import.meta.url).pathname;
const fx = name => JSON.parse(readFileSync(root + 'tests/fixtures/mep/' + name + '.json', 'utf8'));
const docOf = name => fx(name).alternatives[0].doc;
const clone = v => JSON.parse(JSON.stringify(v));
const sha = s => createHash('sha256').update(s).digest('hex');
const ROUTE = { routeHeightM: 2.6, widthM: 0.03, heightM: 0.03, clearanceM: 0.02 };
const bind = async (doc, inputs = B.emptyInputs(), id = 'ALT-1') => { const b = await B.bindArchitecture(doc, { alternativeId: id, revision: 'test', inputs }); assert.equal(b.ok, true, JSON.stringify(b.error)); return b; };
const roomOfType = (p, t, levelId = 'L1') => p.architecture.rooms.find(r => r.type === t && r.levelId === levelId);
const at = (room, z) => ({ ...interiorPoint(room), z });

test('الحزمة في موضع يُنسخ إلى ناتج البناء، ودون تعديل (بصمات SHA256SUMS للحزمة)', () => {
  const out = execFileSync(process.execPath, ['scripts/verify-bundle.mjs'], { cwd: root + 'dist/engineering-systems', encoding: 'utf8' });
  assert.equal(JSON.parse(out).status, 'PASS');
  assert.equal(VERSION, '0.1.0');
  // build.mjs ينسخ كل dist/* (عدا client/server) إلى dist/client: الحزمة والربط والصفحة ضمنها
  assert.match(readFileSync(root + 'scripts/build.mjs', 'utf8'), /cpSync\(`dist\/\$\{entry\.name\}`, `dist\/client\/\$\{entry\.name\}`/);
});

test('اختبارات الحزمة نفسها تمر داخل موضعها المدمج (66 اختبارًا، بلا تخطٍ)', () => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...['agent-actions', 'engine', 'equations', 'exports-adapters', 'geometry-routing'].map(n => `tests/${n}.test.mjs`)], { cwd: root + 'dist/engineering-systems', encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-1000));
  assert.match(r.stdout, /^# pass 66$/m); assert.match(r.stdout, /^# fail 0$/m); assert.match(r.stdout, /^# skipped 0$/m); assert.match(r.stdout, /^# todo 0$/m);
});

test('البدائل المستعملة مخرجات فعلية لمحركي الفيلا الحاليين v3 وv2 (بصمة الملفات مطابقة)', () => {
  const engines = new Set();
  for (const n of ['C6-v3', 'C6-v2', 'C7-v3', 'C4-v2']) {
    const f = fx(n); engines.add(f.villaEngine);
    for (const [file, h] of Object.entries(f.engineSha)) assert.equal(sha(readFileSync(root + file)), h, `${file} تغيّر بعد توليد ${n}: أعد node scripts/mep-fixtures.mjs`);
    assert.deepEqual(validateDoc(f.alternatives[0].doc).filter(i => i.severity === 'error'), []);
  }
  assert.deepEqual([...engines].sort(), ['v2', 'v3']);
});

test('الربط بالمحلّل الأصلي يحفظ معرفات الغرف والأدوار والمناسيب وهوية البديل، ولا يغيّر المستند (بايتًا)', async () => {
  for (const n of ['C6-v3', 'C6-v2', 'C7-v3', 'C4-v2']) {
    const doc = docOf(n), before = JSON.stringify(doc), A = analyzeDoc(clone(doc));
    const b = await bind(doc, B.emptyInputs(), 'D123-v' + n.slice(-1));
    const expected = A.levels.flatMap(l => l.rooms.filter(r => !['courtyard', 'balcony'].includes(r.type)).map(r => r.id)).sort();
    assert.deepEqual(b.project.architecture.rooms.map(r => r.id).sort(), expected, n);
    assert.deepEqual(b.project.architecture.levels, doc.levels.map(l => ({ id: l.id, elevationM: l.elevation, heightM: l.height })));
    assert.equal(b.project.projectId, 'MIZAN-D123-v' + n.slice(-1));
    const r = await B.computeSystems(b.project);
    await B.buildExport('json-result', { project: b.project, result: r, sourceHash: b.sourceHash });
    assert.equal(JSON.stringify(doc), before, 'المستند المعماري لم يتغير بعد الربط والحساب والتصدير');
    assert.equal(await B.hash(doc), b.sourceHash); assert.equal(r.source.sha256, b.sourceHash);
    assert.equal(r.constructionApproved, false); assert.equal(r.codeCompliance, 'NOT_EVALUATED');
    for (const d of r.disciplines) { assert.equal(d.constructionApproved, false); assert.equal(d.codeCompliance, 'NOT_EVALUATED'); }
  }
  // دوران: طابقان فعليان فقط حين يوجدان في المستند
  assert.equal((await bind(docOf('C7-v3'))).project.architecture.levels.length, 2);
  assert.equal((await bind(docOf('C6-v3'))).project.architecture.levels.length, 1);
});

test('زاوية شمال غير صفرية تُرفض صراحة برسالة عربية دون تصفيرها', async () => {
  const doc = clone(docOf('C6-v3')); doc.north = 30;
  const b = await B.bindArchitecture(doc, { alternativeId: 'N1' });
  assert.equal(b.ok, false); assert.equal(b.error.code, 'FRAME_TRANSFORM_REQUIRED'); assert.match(b.error.messageAr, /30°/); assert.match(b.error.messageAr, /لم يُصفَّر/);
  assert.equal(doc.north, 30);
});

test('شوكة صفرية المساحة في المضلع الصافي (ناتج فعلي من v2) تُطبَّع بإعلان، والتقاطع الحقيقي يبقى مرفوضًا', async () => {
  const b = await bind(docOf('C4-v2'));
  assert.ok(b.notes.some(n => n.code === 'NET_POLYGON_SPIKE_REMOVED' && n.roomId === 'r3'));
  const A = analyzeDoc(docOf('C4-v2')).levels[0].rooms.find(r => r.id === 'r3');
  assert.equal(b.project.architecture.rooms.find(r => r.id === 'r3').areaM2.toFixed(6), A.area.toFixed(6));
  const bow = [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }];
  assert.equal(B.removeSpikes(bow).removed, 0);
});

test('بديلان حقيقيان (v3 وv2 بمعرفات غرف متطابقة): لا تتسرب أجهزة أحدهما إلى الآخر', async () => {
  const mem = new Map(), store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const A = docOf('C6-v3'), Bd = docOf('C6-v2'), bA = await bind(A, B.emptyInputs(), 'D1-v1');
  assert.ok(bA.project.architecture.rooms.some(r => r.id === 'r4') && (await bind(Bd, B.emptyInputs(), 'D1-v2')).project.architecture.rooms.some(r => r.id === 'r4'));
  let data = B.loadStore(store), eA = B.entityFor(data, 'D1-v1');
  const room = bA.project.architecture.rooms.find(r => r.id === 'r4');
  eA.inputs = B.addDevice(eA.inputs, { discipline: 'electrical', group: 0, kind: 'PANEL', levelId: 'L1', roomId: 'r4', position: at(room, 1.6) }).inputs;
  data = B.saveEntity(store, data, { ...eA, sourceHash: bA.sourceHash }).data;
  const eB = B.entityFor(B.loadStore(store), 'D1-v2');
  assert.deepEqual(eB.inputs.services, {});
  const rB = await B.computeSystems((await bind(Bd, eB.inputs, 'D1-v2')).project);
  assert.equal(rB.disciplines.flatMap(d => d.devices).length, 0);
  const rA = await B.computeSystems((await bind(A, B.entityFor(B.loadStore(store), 'D1-v1').inputs, 'D1-v1')).project);
  assert.deepEqual(rA.disciplines.flatMap(d => d.devices).map(d => d.id), ['DB1']);
  assert.notEqual(rA.source.sha256, rB.source.sha256); assert.notEqual(rA.projectId, rB.projectId);
  // نتيجة البديل A لا تُصدَّر على البديل B
  await assert.rejects(B.buildExport('svg', { project: (await bind(Bd, eB.inputs, 'D1-v2')).project, result: rA, sourceHash: rB.source.sha256, levelId: 'L1' }), e => e.code === 'STALE_RESULT');
});

test('تعديل غرفة في المخطط أو نقل جهاز: النتيجة القديمة تُرفض في التصدير وإعادة الحساب تعطي نتيجة جديدة', async () => {
  const doc = docOf('C6-v3');
  let inputs = B.emptyInputs();
  const b0 = await bind(doc, inputs), maj = roomOfType(b0.project, 'majlis');
  inputs = B.addDevice(inputs, { discipline: 'fire', group: 0, kind: 'SMOKE_DETECTOR', levelId: 'L1', roomId: maj.id, position: at(maj, 2.9) }).inputs;
  const b1 = await bind(doc, inputs), r1 = await B.computeSystems(b1.project);
  assert.equal((await B.freshness(r1, b1.project, b1.sourceHash)).fresh, true);
  // تعديل معماري بمسار المرسم الأصلي (applyCommand): سماكة جدار داخلي — يغيّر المضلع الصافي لغرفة
  const A = analyzeDoc(doc), interior = doc.walls.find(w => A.levels[0].rooms.filter(r => r.edges.some(e => e.wallIds?.includes(w.id))).length >= 2);
  const doc2 = applyCommand(clone(doc), { type: 'update', id: interior.id, patch: { t: Math.min(0.5, interior.t + 0.1) } }).doc;
  const b2 = await bind(doc2, inputs);
  assert.notEqual(b2.sourceHash, b1.sourceHash);
  const f2 = await B.freshness(r1, b2.project, b2.sourceHash); assert.equal(f2.fresh, false); assert.equal(f2.reason, 'ARCHITECTURE_CHANGED');
  await assert.rejects(B.buildExport('dxf', { project: b2.project, result: r1, sourceHash: b2.sourceHash, levelId: 'L1' }), e => e.code === 'STALE_RESULT');
  await assert.rejects(exportArtifacts(b2.project, r1), e => e.code === 'STALE_RESULT');
  const r2 = await B.computeSystems(b2.project);
  assert.notEqual(r2.architectureHash, r1.architectureHash);
  assert.ok((await B.buildExport('dxf', { project: b2.project, result: r2, sourceHash: b2.sourceHash, levelId: 'L1' })).text.includes('ENTITIES'));
  // نقل جهاز: المخطط نفسه، المدخل تغيّر
  const moved = B.moveDevice(inputs, 'SD1', { x: interiorPoint(maj).x + 0.3, y: interiorPoint(maj).y, z: 2.9 });
  const b3 = await bind(doc, moved), f3 = await B.freshness(r1, b3.project, b3.sourceHash);
  assert.equal(f3.reason, 'INPUTS_CHANGED');
  await assert.rejects(B.buildExport('csv', { project: b3.project, result: r1, sourceHash: b3.sourceHash, scheduleId: 'fire-devices' }), e => e.code === 'STALE_RESULT');
  const r3 = await B.computeSystems(b3.project);
  assert.deepEqual(B.comparePackages(r1, r3).changed, ['SD1']);
});

test('نقص المناخ أو PF أو بيانات الكابل: null مع سبب، دون صفر ولا اختيار مقاس تلقائي', async () => {
  const doc = docOf('C6-v3'); let inputs = B.emptyInputs();
  const p0 = (await bind(doc)).project, kit = roomOfType(p0, 'kitchen'), maj = roomOfType(p0, 'majlis');
  inputs = B.addDevice(inputs, { discipline: 'electrical', group: 0, kind: 'PANEL', levelId: 'L1', roomId: kit.id, position: at(kit, 1.6) }).inputs;
  inputs = B.addDevice(inputs, { discipline: 'electrical', group: 1, kind: 'SOCKET', levelId: 'L1', roomId: maj.id, position: at(maj, 0.4), extra: { powerW: 1000, demandFactor: 0.5 } }).inputs; // PF ناقص
  inputs = B.addDevice(inputs, { discipline: 'electrical', group: 1, kind: 'SOCKET', levelId: 'L1', roomId: maj.id, position: { ...at(maj, 0.4), x: interiorPoint(maj).x + 0.5 }, extra: { powerW: 800, powerFactor: 0.95, demandFactor: 0.5 } }).inputs;
  inputs.services.electrical.circuits = [{ id: 'C1', panelId: 'DB1', loadIds: ['SO2'], phases: 1, phase: 'L1', voltageV: 230, routing: ROUTE }]; // بلا كابل
  inputs.services.hvac = { zones: [{ id: 'Z1', roomId: maj.id, thermal: { indoorC: 24, surfaces: [{ areaM2: 20, uWm2K: 0.5 }] }, supplyDeltaK: 12 }] }; // بلا مناخ خارجي
  const r = await B.computeSystems((await bind(doc, inputs)).project);
  const E = B.calcRows(r, 'electrical'), H = B.calcRows(r, 'hvac');
  const pf = E.find(c => c.id === 'E-P-SO1'); assert.equal(pf.status, 'NOT_CALCULATED'); assert.equal(pf.value, null); assert.match(pf.reason, /powerFactor/);
  const vd = E.find(c => c.id === 'E-VD-C1'); assert.equal(vd.value, null); assert.match(vd.reason, /resistanceOhmPerKm/);
  assert.equal(E.find(c => c.id === 'E-I-C1').status, 'CALCULATED');
  const q = H.find(c => c.id === 'M-Q-Z1'); assert.equal(q.value, null); assert.match(q.reason, /outdoorC/);
  const zone = r.disciplines.find(d => d.id === 'hvac').schedules.find(s => s.id === 'hvac-zones').rows[0];
  for (const k of ['sensibleGainW', 'totalGainW', 'supplyM3S', 'selectedCapacityW']) assert.equal(zone[k], null, k);
  const circ = r.disciplines[0].schedules.find(s => s.id === 'electrical-circuits').rows[0];
  assert.equal(circ.cableSizeMm2, null); assert.equal(circ.voltageDropPercent, null); assert.equal(circ.breakerA, null);
  // الكميات بلا أسعار: الإجمالي null لا صفر
  assert.equal(r.quantities.total, null); assert.ok(r.quantities.unpricedCount > 0);
});

test('جهاز في الفناء أو خارج غرفته: رفض موثق لا نجاح صامت', async () => {
  const doc = docOf('C4-v2'), b = await bind(doc), court = analyzeDoc(doc).levels[0].rooms.find(r => r.type === 'courtyard');
  assert.ok(court, 'البديل الحقيقي C4-v2 فيه فناء');
  const pt = interiorPoint({ polygon: court.net, holes: [] });
  const loc = B.locate(doc, b.project, 'L1', pt); assert.equal(loc.ok, false); assert.equal(loc.code, 'DEVICE_IN_OPEN_SPACE');
  assert.throws(() => B.addDevice(B.emptyInputs(), { discipline: 'hvac', group: 0, kind: 'AIR_EQUIPMENT', levelId: 'L1', roomId: null, position: { ...pt, z: 2.5 } }), e => e.code === 'ROOM_OR_OUTSIDE_REQUIRED');
  const bed = roomOfType(b.project, 'bedroom');
  const inputs = { ...B.emptyInputs(), services: { hvac: { equipment: [
    { id: 'AC1', kind: 'AIR_EQUIPMENT', levelId: 'L1', roomId: court.id, position: { ...pt, z: 2.5 } },
    { id: 'AC2', kind: 'AIR_EQUIPMENT', levelId: 'L1', roomId: bed.id, position: { ...pt, z: 2.5 } }] } } };
  const r = await B.computeSystems((await bind(doc, inputs)).project), H = r.disciplines.find(d => d.id === 'hvac');
  assert.equal(H.devices.length, 0);
  assert.deepEqual(H.issues.filter(i => i.code === 'DEVICE_OUTSIDE_ROOM' && i.severity === 'error').map(i => i.details.id).sort(), ['AC1', 'AC2']);
  assert.equal(r.status, 'BLOCKED_PRELIMINARY');
  // الفناء مطروح من حيز التمرير
  assert.equal(b.project.rules.routingByLevel.L1.holes.length, 1);
});

test('عمود أو كمرة يسدان المسار: التفاف صالح يتجنب العائق، أو تعذر صريح BLOCKED بسببه', async () => {
  const doc = docOf('C6-v3'), p0 = (await bind(doc)).project, hall = roomOfType(p0, 'living');
  const c = interiorPoint(hall), y = c.y, x0 = c.x - 1.2, x1 = c.x + 1.2;
  const base = () => { const i = B.emptyInputs(); i.structure = { usePrecheck: false };
    i.services.low_current = { devices: [{ id: 'R1', kind: 'DATA_RACK', levelId: 'L1', roomId: hall.id, position: { x: x0, y, z: 1 } }, { id: 'D1', kind: 'DATA_OUTLET', levelId: 'L1', roomId: hall.id, position: { x: x1, y, z: 0.4 } }], connections: [{ id: 'T1', fromId: 'R1', toId: 'D1', routing: ROUTE }] }; return i; };
  // عمود جزئي بين الجهازين: التفاف
  const col = base(); col.manualObstacles = [{ id: 'COL-T', kind: 'column', min: { x: c.x - 0.2, y: y - 0.2, z: 0 }, max: { x: c.x + 0.2, y: y + 0.2, z: 3.2 } }];
  const r1 = await B.computeSystems((await bind(doc, col)).project), route = r1.disciplines.find(d => d.id === 'low_current').routes[0];
  assert.equal(route.status, 'PROPOSED');
  const rad = Math.max(route.widthM, route.heightM) / 2 + route.clearanceM;
  assert.ok(route.points.slice(1).every((p, i) => !segmentBox(route.points[i], p, col.manualObstacles[0], rad)), 'المسار لا يعبر العمود');
  assert.ok(route.lengthM > (x1 - x0) + 0.6 + 2.2, 'التفاف فعلي أطول من المسار المستقيم');
  assert.equal(r1.coordination.clashes.filter(k => k.kind === 'SERVICE_OBSTACLE').length, 0);
  // كمرة تقطع المبنى كله عند منسوب المسار: تعذر صريح
  const beam = base(); beam.manualObstacles = [{ id: 'BEAM-T', kind: 'beam', min: { x: c.x - 0.15, y: -100, z: 2.4 }, max: { x: c.x + 0.15, y: 100, z: 3.2 } }];
  const r2 = await B.computeSystems((await bind(doc, beam)).project), rt = r2.disciplines.find(d => d.id === 'low_current').routes[0];
  assert.equal(rt.status, 'BLOCKED'); assert.equal(rt.lengthM, null); assert.match(rt.reason, /NO_PATH|BLOCKED/);
  assert.ok(r2.issues.some(i => i.code === 'ROUTE_BLOCKED' && i.details.id === 'low_current-R-T1'));
  assert.ok(!r2.quantities.rows.some(q => q.unit === 'm' && q.discipline === 'low_current'), 'المسار المتعذر لا يدخل الحصر');
  // أعمدة الفحص الإنشائي المبدئي الفعلية عوائق، والمسار المقترح لا يعبرها
  const real = base(); real.structure = { usePrecheck: true }; const b3 = await bind(doc, real);
  assert.ok(b3.project.architecture.obstacles.some(o => o.kind === 'column-precheck') && b3.project.architecture.obstacles.some(o => o.kind === 'beam-precheck'));
  const r3 = await B.computeSystems(b3.project);
  assert.equal(r3.coordination.clashes.filter(k => k.kind === 'SERVICE_OBSTACLE').length, 0);
  assert.ok(r3.issues.some(i => i.code === 'STRUCTURAL_MODEL_INCOMPLETE'), 'غياب التعارض لا يعني اكتمال المراجعة');
});

test('صرف لا يصل إلى منسوب قاع المنهل: BLOCKED مع فرق المناسيب، ولا اتصال رأسي وهمي', async () => {
  const doc = docOf('C6-v3'), p0 = (await bind(doc)).project, bath = p0.architecture.rooms.find(r => r.type === 'bath');
  const w = at(bath, 0), mh = { x: w.x + 1.0, y: w.y, z: -0.5 };
  const mk = endInvertM => ({ ...B.emptyInputs(), structure: { usePrecheck: false }, services: { plumbing: {
    fixtures: [{ id: 'WC1', kind: 'WC', levelId: 'L1', roomId: bath.id, position: w }],
    equipment: [{ id: 'MH1', kind: 'MANHOLE', levelId: 'L1', position: mh }],
    connections: [{ id: 'DR1', system: 'sanitary', fromId: 'WC1', toId: 'MH1', flowM3S: 0.001, velocityMS: 0.8, startInvertM: -0.3, endInvertM, slope: 0.02, routing: { widthM: 0.11, heightM: 0.11, clearanceM: 0.01 } }] } } });
  const bad = await B.computeSystems((await bind(doc, mk(-0.9))).project), P = bad.disciplines.find(d => d.id === 'plumbing');
  const r = P.routes.find(x => x.id === 'PR-DR1');
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.reason, 'OUTFALL_INVERT_MISMATCH');
  const iss = P.issues.find(i => i.code === 'OUTFALL_INVERT_MISMATCH');
  assert.equal(iss.severity, 'error'); assert.equal(iss.details.requestedEndInvertM, -0.9);
  assert.ok(Math.abs(iss.details.actualEndInvertM - (-0.3 - 0.02 * r.horizontalLengthM)) < 1e-9);
  assert.ok(Math.abs(iss.details.actualEndInvertM - iss.details.requestedEndInvertM) > 0.5, 'فرق المناسيب ظاهر');
  assert.equal(P.schedules.find(s => s.id === 'plumbing-connections').rows[0].routeStatus, 'BLOCKED');
  assert.ok(!bad.quantities.rows.some(q => q.layer === 'P-DRAIN' && q.unit === 'm'));
  // المنسوب المتسق مع الطول والميل: مقترح
  const len = r.horizontalLengthM, ok = await B.computeSystems((await bind(doc, mk(-0.3 - 0.02 * len))).project);
  assert.equal(ok.disciplines.find(d => d.id === 'plumbing').routes.find(x => x.id === 'PR-DR1').status, 'PROPOSED');
});

test('دوران حقيقيان (C7 من v3) ورايزر بإحداثيات ومناسيب فعلية وفحص عوائق، وعدم محاذاة يُرفض', async () => {
  const doc = docOf('C7-v3'), p0 = (await bind(doc)).project, rooms = p0.architecture.rooms;
  // نقطة داخل غرفة في الدورين معًا (بحث على شبكة)
  let hit = null;
  for (const r1 of rooms.filter(r => r.levelId === 'L1' && r.type === 'bath')) { const c = interiorPoint(r1); const r2 = rooms.find(r => r.levelId === 'L2' && inRoom(c, r)); if (r2) { hit = { c, r1, r2 }; break; } }
  if (!hit) for (const r1 of rooms.filter(r => r.levelId === 'L1')) { const c = interiorPoint(r1); const r2 = rooms.find(r => r.levelId === 'L2' && inRoom(c, r)); if (r2) { hit = { c, r1, r2 }; break; } }
  assert.ok(hit);
  const L2 = p0.architecture.levels.find(l => l.id === 'L2');
  const inputs = { ...B.emptyInputs(), structure: { usePrecheck: true }, services: { plumbing: { equipment: [
    { id: 'RN1', kind: 'RISER_NODE', levelId: 'L1', roomId: hit.r1.id, position: { ...hit.c, z: 0.3 } },
    { id: 'RN2', kind: 'RISER_NODE', levelId: 'L2', roomId: hit.r2.id, position: { ...hit.c, z: L2.elevationM + 0.3 } },
    { id: 'RN3', kind: 'RISER_NODE', levelId: 'L2', roomId: hit.r2.id, position: { ...hit.c, x: hit.c.x + 0.4, z: L2.elevationM + 0.3 } }] },
    risers: [{ id: 'PR1', discipline: 'plumbing', fromId: 'RN1', toId: 'RN2', layer: 'P-RISER', kind: 'cold_water', systemId: 'CW', widthM: 0.06, heightM: 0.06, clearanceM: 0.03 },
      { id: 'PR2', discipline: 'plumbing', fromId: 'RN1', toId: 'RN3', layer: 'P-RISER', kind: 'cold_water', systemId: 'CW2', widthM: 0.06, heightM: 0.06, clearanceM: 0.03 }] } };
  const b = await bind(doc, inputs), r = await B.computeSystems(b.project), P = r.disciplines.find(d => d.id === 'plumbing');
  const riser = P.routes.find(x => x.id === 'PR1');
  assert.deepEqual(riser.levelIds, ['L1', 'L2']);
  assert.deepEqual(riser.points.map(p => p.z), [0.3, L2.elevationM + 0.3]);
  assert.equal(riser.points[0].x, hit.c.x);
  const hitObs = b.project.architecture.obstacles.find(o => segmentBox(riser.points[0], riser.points[1], o, 0.06));
  assert.equal(riser.status, hitObs ? 'BLOCKED' : 'PROPOSED');
  assert.ok(P.issues.some(i => i.code === (hitObs ? 'RISER_OBSTACLE' : 'SLAB_PENETRATION_REVIEW') && i.details.id === 'PR1'), 'لا اعتماد تلقائي للثقب');
  assert.ok(P.issues.some(i => i.code === 'RISER_ALIGNMENT_REQUIRED' && i.details.id === 'PR2' && i.severity === 'error'));
  assert.ok(!P.routes.some(x => x.id === 'PR2'));
  // الرسم لكل دور يُظهر الرايزر في سجلي الدورين
  for (const lv of ['L1', 'L2']) assert.ok(B.levelLayers(r, lv, 'plumbing').some(L => L.layer === 'P-RISER'));
});

test('حمل التكييف والمضخة مربوط بالكهرباء بالاستهلاك الفعلي (sourceEquipmentId)، والغياب أو الاختلاف يظهر', async () => {
  const doc = docOf('C6-v3'), p0 = (await bind(doc)).project, maj = roomOfType(p0, 'majlis'), kit = roomOfType(p0, 'kitchen');
  let inputs = B.emptyInputs();
  inputs = B.addDevice(inputs, { discipline: 'hvac', group: 0, kind: 'AIR_EQUIPMENT', levelId: 'L1', roomId: maj.id, position: at(maj, 2.7), extra: { ratedInputW: 1800 } }).inputs;
  inputs = B.addDevice(inputs, { discipline: 'plumbing', group: 1, kind: 'PUMP', levelId: 'L1', roomId: kit.id, position: at(kit, 0.2), extra: { ratedInputW: 750 } }).inputs;
  inputs = B.addDevice(inputs, { discipline: 'hvac', group: 0, kind: 'AIR_EQUIPMENT', levelId: 'L1', roomId: maj.id, position: { ...at(maj, 2.7), x: interiorPoint(maj).x + 0.6 } }).inputs; // بلا استهلاك
  assert.throws(() => B.linkElectricalLoad(inputs, 'AC2'), e => e.code === 'RATED_INPUT_REQUIRED');
  inputs = B.linkElectricalLoad(inputs, 'AC1').inputs;
  let r = await B.computeSystems((await bind(doc, inputs)).project);
  const by = id => r.coordination.interfaces.find(i => i.equipmentId === id)?.outcome;
  assert.equal(by('AC1'), 'MATCHED_SUPPLIED_INPUT'); assert.equal(by('PMP1'), 'MISSING_OR_DUPLICATE_ELECTRICAL_LOAD'); assert.equal(by('AC2'), undefined);
  const load = inputs.services.electrical.loads.find(l => l.sourceEquipmentId === 'AC1');
  assert.equal(load.powerW, 1800); assert.equal(load.powerFactor, undefined, 'لا PF مخترع');
  inputs = B.linkElectricalLoad(inputs, 'PMP1').inputs; inputs = B.updateDevice(inputs, 'AC1-LOAD', { powerW: 1500 });
  r = await B.computeSystems((await bind(doc, inputs)).project);
  assert.equal(r.coordination.interfaces.find(i => i.equipmentId === 'PMP1').outcome, 'MATCHED_SUPPLIED_INPUT');
  assert.equal(r.coordination.interfaces.find(i => i.equipmentId === 'AC1').outcome, 'POWER_MISMATCH');
});

test('أفعال الوكيل مربوطة ببصمة المخطط: بصمة قديمة ونتيجة قديمة تُرفضان، بلا مزود ولا شبكة', async () => {
  let doc = docOf('C6-v3');
  const agent = B.createSystemsAgent(async () => (await bind(doc)).project);
  const snap = await agent.snapshot(), res = await agent.generate({ expectedArchitectureHash: snap.architectureHash });
  assert.match(await agent.render({ expectedArchitectureHash: snap.architectureHash, result: res, format: 'svg', levelId: 'L1' }), /^<svg /);
  const A = analyzeDoc(doc), w = doc.walls.find(x => A.levels[0].rooms.filter(r => r.edges.some(e => e.wallIds?.includes(x.id))).length >= 2);
  doc = applyCommand(clone(doc), { type: 'update', id: w.id, patch: { t: Math.min(0.5, w.t + 0.1) } }).doc;
  await assert.rejects(agent.generate({ expectedArchitectureHash: snap.architectureHash }), e => e.code === 'ARCHITECTURE_REVISION_CONFLICT');
  const snap2 = await agent.snapshot();
  await assert.rejects(agent.render({ expectedArchitectureHash: snap2.architectureHash, result: res, format: 'dxf' }), e => e.code === 'STALE_RESULT');
  const src = readFileSync(root + 'dist/mep-binding.mjs', 'utf8') + readFileSync(root + 'dist/systems.mjs', 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|api\/|anthropic|openai|gemini/i.test(src.replace(/gemini-engineering-layer/g, '')), 'لا شبكة ولا مزود ذكاء في طبقة الأنظمة');
});

test('ملفات التصدير صالحة: SVG وDXF (بالمتر وZ) وCSV UTF-8 وJSON، وتحمل وسم «أولي»', async () => {
  const doc = docOf('C7-v3'), p0 = (await bind(doc)).project, liv = roomOfType(p0, 'living'), b = await bind(doc, { ...B.emptyInputs(), services: { fire: { devices: [{ id: 'SD1', kind: 'SMOKE_DETECTOR', levelId: 'L1', roomId: liv.id, position: at(liv, 3) }] } } });
  const r = await B.computeSystems(b.project), args = { project: b.project, result: r, sourceHash: b.sourceHash };
  const svg = (await B.buildExport('svg', { ...args, levelId: 'L2', discipline: 'plumbing' })).text;
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/); assert.match(svg, /PRELIMINARY/); assert.match(svg, /<\/svg>$/);
  const dxf = (await B.buildExport('dxf', { ...args, levelId: 'L2' })).text;
  for (const m of ['SECTION', 'HEADER', '$INSUNITS', 'TABLES', 'ENTITIES', 'EOF', 'NOT FOR CONSTRUCTION']) assert.ok(dxf.includes(m), m);
  assert.match(dxf, /\$INSUNITS\n70\n6/);
  assert.ok(dxf.includes('\n30\n3.2'), 'مناسيب Z الحقيقية للدور الثاني');
  const csv = (await B.buildExport('csv', { ...args, scheduleId: 'fire-devices' })).text;
  assert.equal(csv.charCodeAt(0), 0xfeff); assert.match(csv, /^﻿"id","kind","levelId","roomId"\r\n"SD1"/);
  const js = JSON.parse((await B.buildExport('json-result', args)).text);
  assert.equal(js.constructionApproved, false); assert.equal(js.codeCompliance, 'NOT_EVALUATED'); assert.equal(js.resultHash, r.resultHash);
  JSON.parse((await B.buildExport('json-input', args)).text); JSON.parse((await B.buildExport('json-issues', args)).text);
  await assert.rejects(B.buildExport('dwg', args), e => e.code === 'FORMAT_UNSUPPORTED');
});

test('مصادر الواجهة: مفتاح جلسة التصميم ومفتاح المرسم كما في المصدر، وهويات بدائل منفصلة', async () => {
  assert.match(readFileSync(root + 'dist/design-session.mjs', 'utf8'), /export const SESSION_KEY = 'mizan\.design\.session\.v1'/);
  assert.match(readFileSync(root + 'dist/systems.mjs', 'utf8'), /const SESSION_KEY = 'mizan\.design\.session\.v1'/);
  const s = { createdAt: 7, current: 1, approved: 0, designs: [{ doc: '{}', version: 1 }, { doc: '{}', version: 2 }], alternatives: [{ index: 0, doc: '{}' }, { index: 1, doc: '{}' }] };
  const L = B.listSources({ session: s, studioRaw: '{}' });
  assert.deepEqual(L.map(x => x.id), ['STUDIO-D7-v1', 'D7-v1', 'D7-v2', 'A7-0', 'A7-1']);
  assert.equal(new Set(L.map(x => B.projectIdOf(x.id))).size, L.length);
  // structuralModelComplete لا يُرفع من المدخلات: يبقى false
  const b = await bind(docOf('C6-v3'), { ...B.emptyInputs(), rules: { structuralModelComplete: true } });
  assert.equal(b.project.rules.structuralModelComplete, false);
  assert.ok(b.project.rules.provenance.every(p => p.classification === 'PROJECT_ASSUMPTION'));
});

test('svgFrame يطابق رسم الحزمة (لتحويل نقرة المستخدم إلى المتر)', async () => {
  const doc = docOf('C6-v3'), p0 = (await bind(doc)).project, maj = roomOfType(p0, 'majlis');
  const inputs = B.addDevice(B.emptyInputs(), { discipline: 'electrical', group: 0, kind: 'PANEL', levelId: 'L1', roomId: maj.id, position: at(maj, 1.5) }).inputs;
  const b = await bind(doc, inputs), r = await B.computeSystems(b.project);
  const f = B.svgFrame(b.project, r, { levelId: 'L1', discipline: 'electrical' }), svg = await toSvg(b.project, r, { levelId: 'L1', discipline: 'electrical' });
  const q = f.toSvg(r.disciplines[0].devices[0].position);
  assert.ok(svg.includes(`<rect x="${q.X - 4.5}" y="${q.Y - 4.5}"`));
  const back = f.toPlan(q); assert.ok(Math.abs(back.x - r.disciplines[0].devices[0].position.x) < 1e-9);
  assert.ok(InputError);
});

// ——— الإنارة بطريقة اللومن عبر الربط (dist/mep-binding.mjs) على بديل C6-v3 الفعلي ———
const lightIn = (spec, rooms = { r4: 150, r2: 150, r8: 300, r16: 100 }) => { const i = B.emptyInputs(); i.structure = { usePrecheck: false }; i.services.electrical = { lightingByRoom: Object.fromEntries(Object.entries(rooms).map(([id, lux]) => [id, { targetLux: lux, lumensPerFixture: 1600, utilizationFactor: 0.6, maintenanceFactor: 0.8, wattsPerFixture: 18, powerFactor: 0.9, demandFactor: 1, mountHeightM: 2.8, ...spec }])) }; return i; };
const luxCalc = (r, id) => r.disciplines.find(d => d.id === 'electrical').calculations.find(c => c.id === 'E-LUX-' + id);
const lights = (r, id) => r.disciplines.find(d => d.id === 'electrical').devices.filter(d => d.layer === 'E-LIGHT' && d.roomId === id);

test('الإنارة: 150 لوكس وΦ=1600 وUF=0.6 وMF=0.8 ⇒ r4=6 وr2=8 وr8(300)=8 وr16(100)=1 ويطابق ceil(E·A/(Φ·UF·MF)) من مساحة الغرفة نفسها', async () => {
  const doc = docOf('C6-v3'), b = await bind(doc, lightIn({})), r = await B.computeSystems(b.project);
  const want = { r4: 6, r2: 8, r8: 8, r16: 1 }, lux = { r4: 150, r2: 150, r8: 300, r16: 100 };
  for (const [id, n] of Object.entries(want)) {
    const room = b.project.architecture.rooms.find(x => x.id === id), manual = Math.ceil(lux[id] * room.areaM2 / (1600 * 0.6 * 0.8)), c = luxCalc(r, id);
    assert.equal(c.status, 'CALCULATED', id); assert.equal(c.value, manual, `${id}: ${room.areaM2} م²`); assert.equal(manual, n, id);
    assert.equal(lights(r, id).length, n, `وحدات ${id}`);
    assert.ok(lights(r, id).every(d => inRoom(d.position, room)), 'كل وحدة داخل غرفتها');
  }
  assert.ok(r.quantities.rows.some(q => q.layer === 'E-LIGHT' && q.quantity === 6 + 8 + 8 + 1));
});

test('الإنارة بلا معامل الاستفادة UF: E-LUX NOT_CALCULATED وقيمتها null ولا وحدات E-LIGHT', async () => {
  const i = lightIn({}); for (const s of Object.values(i.services.electrical.lightingByRoom)) delete s.utilizationFactor;
  const b = await bind(docOf('C6-v3'), i), r = await B.computeSystems(b.project);
  for (const id of ['r4', 'r2', 'r8', 'r16']) { const c = luxCalc(r, id); assert.equal(c.status, 'NOT_CALCULATED'); assert.equal(c.value, null); assert.equal(lights(r, id).length, 0); }
  assert.equal(r.disciplines.find(d => d.id === 'electrical').devices.filter(d => d.layer === 'E-LIGHT').length, 0);
  assert.ok(!r.quantities.rows.some(q => q.layer === 'E-LIGHT'));
  const calcs = B.calcRows(r, 'electrical').filter(c => c.id.startsWith('E-LUX-')); assert.ok(calcs.length === 4 && calcs.every(c => c.value === null && c.reason));
});

test('الإنارة: طلب أكثر من 160 وحدة ⇒ LAYOUT_RESOURCE_LIMIT ولا رسم لوحدات الغرفة', async () => {
  const b = await bind(docOf('C6-v3'), lightIn({ lumensPerFixture: 10 }, { r4: 150 })), r = await B.computeSystems(b.project);
  const room = b.project.architecture.rooms.find(x => x.id === 'r4'), need = Math.ceil(150 * room.areaM2 / (10 * 0.6 * 0.8)); assert.ok(need > 160);
  const iss = r.disciplines.find(d => d.id === 'electrical').issues.find(x => x.code === 'LAYOUT_RESOURCE_LIMIT');
  assert.ok(iss && iss.severity === 'error' && iss.details.roomId === 'r4' && iss.details.requested === need);
  assert.equal(lights(r, 'r4').length, 0); assert.equal(r.status, 'BLOCKED_PRELIMINARY');
});

test('تعديل شدة الإنارة يجعل النتيجة قديمة (INPUTS_CHANGED) ويمنع التصدير حتى إعادة الحساب', async () => {
  const doc = docOf('C6-v3'), b1 = await bind(doc, lightIn({}, { r4: 150 })), r1 = await B.computeSystems(b1.project);
  assert.equal((await B.freshness(r1, b1.project, b1.sourceHash)).fresh, true);
  const i2 = lightIn({}, { r4: 300 }), b2 = await bind(doc, i2), f = await B.freshness(r1, b2.project, b2.sourceHash);
  assert.equal(f.fresh, false); assert.equal(f.reason, 'INPUTS_CHANGED');
  await assert.rejects(B.buildExport('csv', { project: b2.project, result: r1, sourceHash: b2.sourceHash, scheduleId: 'quantities' }), e => e.code === 'STALE_RESULT');
  const r2 = await B.computeSystems(b2.project); assert.equal(luxCalc(r2, 'r4').value, 12); assert.equal((await B.freshness(r2, b2.project, b2.sourceHash)).fresh, true);
  assert.ok((await B.buildExport('csv', { project: b2.project, result: r2, sourceHash: b2.sourceHash, scheduleId: 'quantities' })).text.includes('E-LIGHT'));
});
