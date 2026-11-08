// المحور C: دقة الإخراج ثلاثي الأبعاد (الخامات، زاوية النظر داخل الغرف، مسار الجولة) وقوالب الواجهة على تصاميم حقيقية من المسار الكامل.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { parseDoc } from '../dist/draw/doc.mjs';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import { createMaterialLibrary, normalFromHeight } from '../dist/draw/materials3d.mjs';
import { DrawViewer } from '../dist/draw/viewer-draw.mjs';
import { planDrawTour, STORY } from '../dist/draw/tour.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';
import { STYLES } from '../dist/facade-j/facade-realism/styles/index.mjs';

// تصميمان من المسار الحقيقي (home → شرعاء → التصميم → اعتماد): أرض 30×20 مستطيلة، وأرض 30×30 بفناء داخلي (شكل U)
const flow = name => parseDoc(fs.readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
const RECT = flow('flow-30x20-doc.json'), COURT = flow('flow-court-doc.json');

test('U-court and rectangle docs: no facade template of any style falls back to the untouched design', async () => {
  const errors = []; const ce = console.error; console.error = (...a) => errors.push(a.join(' '));
  try {
    for (const [name, d] of [['rect', RECT], ['court', COURT]]) for (const id of Object.keys(STYLES)) {
      const m = await STYLES[id].load();
      for (const t of m.templates) {
        errors.length = 0;
        const out = m.docTransform(structuredClone(d), new URLSearchParams('tpl=' + t.id));
        assert.equal(errors.length, 0, `${name} ${t.id}: ${errors[0]}`);
        assert.notEqual(out, d, `${name} ${t.id}: returned the original`);
      }
    }
  } finally { console.error = ce; }
});

test('the court doc really has an open courtyard (the case that used to fail M_DOC_INVALID on inherited openings)', () => {
  assert.ok(COURT.labels.some(l => l.type === 'courtyard'));
});

test('every style gained two documented variants that differ from their parent', async () => {
  for (const id of Object.keys(STYLES)) {
    const m = await STYLES[id].load(), vs = m.templates.filter(t => t.variantOf);
    assert.equal(vs.length, 2, id);
    for (const v of vs) {
      const base = m.templates.find(t => t.id === v.variantOf);
      assert.ok(base && !base.variantOf, v.id + ': parent');
      for (const k of ['entrance', 'windows', 'materials']) assert.ok(typeof v.differs?.[k] === 'string' && v.differs[k].length > 10, v.id + ': ' + k);
      assert.deepEqual(Object.keys(v.p).sort(), Object.keys(base.p).sort(), v.id + ': same key set as its parent');
      assert.ok(Object.keys(v.p).filter(k => v.p[k] !== base.p[k]).length >= 3, v.id + ': at least three keys differ');
      const enums = m.ENUMS || m.ENUM || (id === 'J' ? (await import('../dist/facade-j/facade-realism/styles/j-templates.mjs')).ENUMS : {}); // J and S publish their value lists; other styles: a value some other template already uses
      for (const [k, val] of Object.entries(v.p)) assert.ok(m.templates.some(t => t !== v && t.p[k] === val) || (Array.isArray(enums[k]) && Number.isInteger(val) && val >= 0 && val < enums[k].length), `${v.id}.${k}=${val} is outside the style's values`);
    }
  }
});

test('material library: terrazzo exists, maps degrade to plain colours without a canvas, height → normal helper is exported', () => {
  const lib = createMaterialLibrary(THREE, { textures: false });
  for (const k of ['terrazzo', 'marble', 'wood', 'tile', 'plinth', 'accent', 'render', 'glass']) assert.ok(lib.m[k]?.isMeshStandardMaterial, k);
  assert.equal(lib.m.marble.normalMap, null); assert.ok(lib.m.glass.transparent && lib.m.glass.envMapIntensity > 2);
  assert.equal(typeof normalFromHeight, 'function'); assert.equal(normalFromHeight(null), null);
  lib.dispose();
});

test('composed interior viewpoints: inside the room, clear of furniture and walls, looking across the room', () => {
  for (const doc of [RECT, COURT]) {
    const built = buildBuildingScene(doc, THREE, { textures: false });
    const fake = { built, walk: { level: 0 }, blocked: DrawViewer.prototype.blocked };
    let n = 0;
    for (const r of built.rooms.values()) {
      if (r.area < 4) continue;
      const v = DrawViewer.prototype.roomView.call(fake, r.key);
      assert.ok(v, r.name);
      assert.ok(pointInPolygon({ x: v.x, y: v.y }, r.polygon, 0), r.name + ': inside');
      assert.equal(fake.blocked(v.x, v.y), false, r.name + ': not in a wall or furniture');
      assert.ok(v.depth >= Math.min(2, Math.sqrt(r.area) * .6), `${r.name}: view depth ${v.depth.toFixed(2)}`);
      n++;
    }
    assert.ok(n >= 6);
    built.dispose();
  }
});

test('story tour: entrance → majlis → dining → hall order, then the garden as the closing shot', () => {
  const built = buildBuildingScene(RECT, THREE, { textures: false, site: false });
  const plan = planDrawTour(built.rooms.values(), { story: true, cinematic: true, entry: 's' });
  const types = plan.segments.filter(s => s.kind === 'room').map(s => built.rooms.get(s.key).type);
  assert.deepEqual(types.slice(0, 4), ['entrance', 'majlis', 'dining', 'living']);
  assert.ok(types.every((t, i) => !i || STORY.indexOf(t) > STORY.indexOf(types[i - 1])), types.join(','));
  assert.equal(plan.segments.at(-1).kind, 'garden'); assert.equal(plan.cinematic, true);
  assert.ok(plan.segments.filter(s => s.kind === 'room').every(s => s.sweepDeg === 70));
  // the default plan (studio) is unchanged: no garden, wide sweep
  const old = planDrawTour(built.rooms.values(), { entry: 's' });
  assert.ok(!old.segments.some(s => s.kind === 'garden')); assert.equal(old.segments[2].sweepDeg, 220);
  built.dispose();
});
