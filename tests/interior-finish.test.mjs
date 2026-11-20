// نظام التشطيب الداخلي: طرز متماسكة، مواد حسب نوع الغرفة، بذر حسب التصميم، تأثيث توضيحي لا يمس المستند، واختيار العميل يُحفظ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { parseDoc } from '../dist/draw/doc.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import { FIXTURES } from '../dist/draw/catalog.mjs';
import { INTERIOR_THEMES, INTERIOR_THEME_IDS, FLOOR_PRESETS, WALL_PRESETS, DEFAULT_INTERIOR_THEME, INTERIOR_STORAGE_KEY, resolveInteriorTheme, roomFinish, furniturePalette, roomGroup, isInteriorTheme } from '../dist/draw/interior-themes.mjs';
import { PAINTERS, hexLinear, fbm } from '../dist/draw/interior-textures.mjs';
import { buildPiece, PIECE_KINDS, PIECE_DEFAULTS } from '../dist/draw/interior-pieces.mjs';
import { fixtureObb, obbOverlap } from '../dist/interior/staging.mjs';
import { PROJECT_KEYS } from '../dist/project-lifecycle.mjs';

const FLOW = parseDoc(readFileSync(new URL('./fixtures/flow-30x20-doc.json', import.meta.url), 'utf8'));
const HEX = /^#[0-9a-f]{6}$/i, ROOMS = ['majlis', 'living', 'dining', 'entrance', 'kitchen', 'bedroom', 'master', 'office', 'bath', 'laundry', 'corridor', 'storage'];
const shifted = (doc, dx) => { const d = structuredClone(doc); for (const w of d.walls) { w.a.x += dx; w.b.x += dx; } return d; };

test('الطرز: خمسة طرز كاملة، كل ما تشير إليه موجود، وكل الألوان صالحة', () => {
  assert.deepEqual(INTERIOR_THEME_IDS.slice().sort(), ['classic', 'contemporary', 'dark', 'luxury', 'najdi']);
  assert.ok(isInteriorTheme(DEFAULT_INTERIOR_THEME));
  for (const [id, T] of Object.entries(INTERIOR_THEMES)) {
    assert.ok(T.ar && T.blurb && T.swatch.length === 4, id);
    for (const g of ['public', 'private', 'service', 'wet']) assert.ok(T.paint[g]?.length, `${id}.paint.${g}`);
    for (const h of [...Object.values(T.paint).flat(), ...T.accents, T.ceiling, T.trim, T.led, ...T.swatch, T.door.leaf, T.door.frame, ...T.curtain, ...T.rug]) assert.match(h, HEX, `${id} ${h}`);
    for (const t of ROOMS) {
      const R = T.rooms[t]; if (!R) { assert.ok(['laundry', 'office'].includes(t) || T.rooms[t] === undefined, `${id}.${t}`); continue; }
      assert.ok(R.floor.length && R.floor.every(f => FLOOR_PRESETS[f]), `${id}.${t}.floor`);
      for (const k of ['band', 'full']) if (R[k]) assert.ok(WALL_PRESETS[R[k].preset], `${id}.${t}.${k}`);
      if (R.accent?.preset) assert.ok(WALL_PRESETS[R.accent.preset], `${id}.${t}.accent`);
    }
    for (const arr of Object.values(T.furn)) for (const h of arr) assert.match(h, HEX, id);
  }
  for (const s of [...Object.values(FLOOR_PRESETS), ...Object.values(WALL_PRESETS)]) { assert.ok(PAINTERS[s.p], s.p); assert.ok(s.size > 0 && s.S >= 256 && s.S <= 1024, 'حجم الخامة محدود للجوال'); }
});

test('الاختيار: اختيار العميل ثم المثبّت في التصميم ثم الذوق ثم طراز الواجهة ثم بصمة التصميم، وهو حتمي', () => {
  assert.deepEqual(resolveInteriorTheme(FLOW, { theme: 'najdi', taste: ['dark'], style: 'M' }), { id: 'najdi', source: 'user', reason: 'اختيارك' });
  assert.equal(resolveInteriorTheme({ ...FLOW, finish: { interior: 'luxury' } }, { taste: ['dark'] }).id, 'luxury');
  assert.equal(resolveInteriorTheme(FLOW, { taste: ['heritage'], style: 'M' }).id, 'najdi');
  assert.equal(resolveInteriorTheme(FLOW, { taste: ['calm'] }).id, 'contemporary');
  assert.ok(['najdi', 'classic'].includes(resolveInteriorTheme(FLOW, { style: 'N' }).id));
  assert.equal(resolveInteriorTheme(FLOW, { theme: 'bogus' }).source, 'auto');
  assert.deepEqual(resolveInteriorTheme(FLOW, {}), resolveInteriorTheme(structuredClone(FLOW), {}));
  const ids = new Set(); for (let i = 0; i < 24; i++) ids.add(resolveInteriorTheme(shifted(FLOW, i * .37 + 1)).id);
  assert.ok(ids.size >= 3, 'تصميمان مختلفان لا يأخذان الطراز نفسه دائمًا: ' + [...ids]);
});

test('تشطيب الغرفة: حتمي، يختلف بين أنواع الغرف وبين الطرز، والرطبة مبلّطة', () => {
  let differ = 0;
  for (const id of INTERIOR_THEME_IDS) {
    for (const t of ROOMS) { const a = roomFinish(id, t, 'L1:S3', 99, { area: 18 }), b = roomFinish(id, t, 'L1:S3', 99, { area: 18 }); assert.deepEqual(a, b, `${id}/${t}`); assert.ok(FLOOR_PRESETS[a.floor]); assert.match(a.paint, HEX); }
    const bath = roomFinish(id, 'bath', 'x', 1, { area: 5 }), majlis = roomFinish(id, 'majlis', 'x', 1, { area: 25 });
    assert.ok(bath.full && bath.full.h >= 2, `${id}: جدران الحمام مبلّطة حتى السقف تقريبًا`);
    assert.equal(bath.accent, null); assert.equal(bath.cove, false);
    differ += bath.floor !== majlis.floor ? 1 : 0;
    assert.equal(roomGroup('bath'), 'wet');
  }
  assert.ok(differ >= 2, 'أرضية الحمام تختلف عن المجلس في معظم الطرز: ' + differ);
  const floors = INTERIOR_THEME_IDS.map(id => roomFinish(id, 'majlis', 'k', 5, { area: 25 }).floor);
  assert.ok(new Set(floors).size >= 4, 'أرضية المجلس تختلف بين الطرز: ' + floors);
  const paints = new Set(INTERIOR_THEME_IDS.map(id => roomFinish(id, 'living', 'k', 5, { area: 25 }).paint)); assert.ok(paints.size >= 4);
  const kitchen = INTERIOR_THEME_IDS.map(id => roomFinish(id, 'kitchen', 'k', 5, { area: 12 })); assert.ok(kitchen.every(k => k.band && k.accent === null));
  // غرف النوع الواحد تتنوّع بالبذر (لون الدهان أو الأرضية أو الجدار الرئيسي)
  const sig = new Set(); for (let i = 0; i < 12; i++) { const f = roomFinish('classic', 'bedroom', 'L2:S' + i, 7, { area: 13 }); sig.add(f.paint + f.floor + (f.accent?.color || '')); } assert.ok(sig.size >= 3, 'غرف النوم لا تتشابه كلها');
  assert.equal(roomFinish('najdi', 'majlis', 'a', 1, { area: 25 }).beams, true);
  assert.equal(roomFinish('classic', 'bedroom', 'a', 1, { area: 6 }).accent, null, 'الغرفة الصغيرة بلا جدار رئيسي');
});

test('ألوان الأثاث: حتمية، صالحة، وتتبع الطراز', () => {
  const a = furniturePalette('najdi', 'majlis', 'L1:S1', 3), b = furniturePalette('najdi', 'majlis', 'L1:S1', 3);
  assert.deepEqual(a, b); for (const h of Object.values(a)) assert.match(h, HEX);
  assert.ok(a.rug && a.majlisFabric && a.woodMid);
  const fabrics = new Set(INTERIOR_THEME_IDS.map(id => furniturePalette(id, 'majlis', 'k', 1).majlisFabric)); assert.ok(fabrics.size >= 4);
  const lacq = new Set(); for (let i = 0; i < 20; i++) lacq.add(furniturePalette('dark', 'kitchen', 'K' + i, i).lacquer); assert.ok(lacq.size >= 2, 'ألوان خزائن المطبخ تتنوع');
});

test('الخامات: ضوضاء حتمية في 0..1، وتحويل اللون إلى خطّي', () => {
  for (let i = 0; i < 50; i++) { const v = fbm(i * .37, i * .91, 3, 4); assert.ok(v >= 0 && v <= 1); assert.equal(v, fbm(i * .37, i * .91, 3, 4)); }
  const [r, g, b] = hexLinear('#ffffff'); assert.ok(Math.abs(r - 1) < 1e-9 && Math.abs(g - 1) < 1e-9 && Math.abs(b - 1) < 1e-9);
  assert.ok(hexLinear('#808080')[0] < .25, 'الرمادي المتوسط أقل من ربع الإضاءة الخطّية');
});

test('القطع التزيينية: كل صنف يُبنى بأبعاد محدودة وبلا قيم غير منتهية', () => {
  const cache = new Map(), M = n => { const k = typeof n === 'string' ? n : 'x'; if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial()); return cache.get(k); };
  for (const kind of PIECE_KINDS) {
    const dm = PIECE_DEFAULTS[kind], g = buildPiece(THREE, kind, dm, M, { seed: 3, art: 'iv:art:x', y: 1.5 });
    let meshes = 0; g.traverse(o => { if (o.isMesh) { meshes++; const p = o.geometry.attributes.position.array; for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), kind); assert.ok(o.geometry.attributes.uv, kind + ' بلا UV'); } });
    assert.ok(meshes >= 1 && meshes < 400, `${kind}: ${meshes}`);
    const box = new THREE.Box3().setFromObject(g), sz = box.getSize(new THREE.Vector3());
    if (!['curtain', 'chandelier', 'lantern', 'linear', 'pendantLine', 'flush', 'downlight', 'wall-art', 'wall-mirror', 'towel-rail'].includes(kind)) { assert.ok(sz.x <= dm.w + .15 && sz.z <= dm.d + .15 && sz.y <= dm.h + (['side-table', 'console', 'sideboard', 'dresser'].includes(kind) ? .5 : .12), `${kind} ${sz.x.toFixed(2)}x${sz.z.toFixed(2)}x${sz.y.toFixed(2)}`); assert.ok(box.min.y > -.01, kind + ' تحت الأرض'); }
  }
});

const build = (doc, o = {}) => buildBuildingScene(doc, THREE, { textures: false, interior: true, ...o });
const nonFinite = built => { let bad = 0; built.group.traverse(o => { if (o.isMesh) { const p = o.geometry.attributes.position.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad++; } }); return bad; };

test('المشهد: التشطيب لا يغيّر المستند، وكل طراز يبني هندسة سليمة ضمن ميزانية معقولة', () => {
  const before = JSON.stringify(FLOW), legacy = buildBuildingScene(FLOW, THREE, { textures: false });
  for (const id of INTERIOR_THEME_IDS) {
    const built = build(FLOW, { interiorTheme: id });
    assert.equal(JSON.stringify(FLOW), before, 'المستند لم يتغير');
    assert.equal(built.interior.theme, id); assert.equal(built.interior.source, 'user');
    assert.equal(nonFinite(built), 0, id);
    assert.equal(built.rooms.size, legacy.rooms.size, 'عدد الغرف نفسه');
    assert.ok(built.stats.meshes < 330, `${id} meshes ${built.stats.meshes}`);
    assert.ok(built.stats.triangles < 330000, `${id} tris ${built.stats.triangles}`);
    for (const r of built.rooms.values()) { if (r.open) continue; assert.match(r.floorKind, /^iv:floor:/, `${id}/${r.type}`); assert.ok(FLOOR_PRESETS[r.floorKind.slice(9)]); assert.ok(r.floor.isMesh && r.floor.material?.name?.startsWith('iv:floor:') || r.floor.material, 'مادة الأرضية'); }
  }
});

test('المشهد: أرضيات المجلس والحمام والمطبخ تتغير بين الطرز، والقديم يبقى كما هو عند إيقاف النظام', () => {
  const off = buildBuildingScene(FLOW, THREE, { textures: false });
  for (const r of off.rooms.values()) assert.ok(!String(r.floorKind).startsWith('iv:'), 'النظام معطّل افتراضيًا في scene3d');
  assert.equal(off.interior, null);
  const sets = {}; for (const id of INTERIOR_THEME_IDS) { const b = build(FLOW, { interiorTheme: id }); for (const r of b.rooms.values()) if (['majlis', 'bath', 'kitchen', 'master'].includes(r.type)) (sets[r.type] ||= new Set()).add(r.floorKind); }
  for (const t of ['majlis', 'bath', 'kitchen', 'master']) if (sets[t]) assert.ok(sets[t].size >= 3, `${t}: ${[...sets[t]]}`);
  // أرضية صريحة في المستند يحترمها النظام
  const forced = structuredClone(FLOW); forced.finish = { ...(forced.finish || {}), floors: { majlis: 'wood' } };
  assert.equal([...build(forced, { interiorTheme: 'luxury' }).rooms.values()].find(r => r.type === 'majlis').floorKind, 'wood');
});

test('التأثيث التوضيحي: داخل الغرف، بلا تداخل مع أثاث المستند ولا مع منطقة الأبواب، ولا يمس المستند', () => {
  const built = build(FLOW, { interiorTheme: 'classic' }), rooms = built.rooms;
  assert.ok(built.interior.dressed.length >= 4, 'غرف مؤثثة: ' + built.interior.dressed.length);
  let items = 0;
  for (const d of built.interior.dressed) {
    const room = rooms.get(d.room), lvl = room.levelId, own = FLOW.fixtures.filter(f => f.level === lvl);
    for (const it of d.items) {
      items++;
      assert.ok(it.w > 0 && it.d > 0 && it.h > 0);
      const o = fixtureObb(it);
      if (['console', 'sideboard', 'bookcase', 'dresser', 'side-table', 'bench', 'floor-lamp', 'plant'].includes(it.kind)) {
        for (const f of own) { if (f.kind === 'rug' || !FIXTURES[f.kind]) continue; assert.ok(!obbOverlap(o, fixtureObb({ x: f.x, y: f.y, rot: f.rot || 0, w: f.w ?? FIXTURES[f.kind].w, d: f.d ?? FIXTURES[f.kind].d }), .0), `${it.kind} يتداخل مع ${f.kind} في ${d.room}`); }
      }
    }
  }
  assert.ok(items > 12, 'قطع إضافية: ' + items);
  assert.ok(built.fixtureBoxes.length >= FLOW.fixtures.length, 'التصادم يشمل القطع الإضافية');
  const off = build(FLOW, { interiorTheme: 'classic', dress: false }); assert.equal(off.interior.dressed.length, 0);
  assert.ok(built.stats.triangles > off.stats.triangles, 'التأثيث يضيف هندسة');
});

test('البذر: تصميمان مختلفان يحصلان على طرازين أو تشطيبين مختلفين، والتبديل لا يعيد خلط الغرف', () => {
  const a = build(FLOW), a2 = build(structuredClone(FLOW));
  assert.deepEqual([...a.interior.rooms.entries()], [...a2.interior.rooms.entries()], 'إعادة البناء لا تغيّر التشطيب');
  const seen = new Set(); for (let i = 0; i < 12; i++) { const b = build(shifted(FLOW, 1 + i * .53)); seen.add(b.interior.theme); }
  assert.ok(seen.size >= 2, 'تنوّع الطراز بين التصاميم: ' + [...seen]);
  const sample = build(sampleVilla(), { interiorTheme: 'najdi' }); assert.equal(sample.interior.theme, 'najdi'); assert.equal(nonFinite(sample), 0);
});

test('الواجهة: المحدد في صفحة 3D، والاختيار يُحفظ مفتاحًا للمشروع', () => {
  const html = readFileSync(new URL('../dist/view3d.html', import.meta.url), 'utf8'), js = readFileSync(new URL('../dist/view3d.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('id="interiorSeg"') && html.includes('id="interiorNote"'));
  assert.ok(js.includes('INTERIOR_STORAGE_KEY') && js.includes('setInteriorTheme') && js.includes('saveInteriorTheme'));
  assert.equal(INTERIOR_STORAGE_KEY, 'mizan.interior.theme.v1'); assert.ok(PROJECT_KEYS.includes(INTERIOR_STORAGE_KEY), 'يُمسح عند مشروع جديد كبقية الذوق');
});
