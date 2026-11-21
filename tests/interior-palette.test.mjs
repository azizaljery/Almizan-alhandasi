// لوحات الألوان اليدوية والمدقّق اللوني: كل لوحة تجتاز المدقّق، والمدقّق يرفض التركيبات المتنافرة المعروفة (من ورقة المالك).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PALETTE_IDS, checkPalette, palettesOf, paletteById } from '../dist/draw/interior-palettes.mjs';
import { checkColors, oklab, hueGap, presetColor, THRESHOLDS } from '../dist/draw/interior-color-check.mjs';
import { INTERIOR_THEME_IDS, FLOOR_PRESETS, WALL_PRESETS, roomFinish, furniturePalette, resolveInteriorPalette, shade } from '../dist/draw/interior-themes.mjs';

const HEX = /^#[0-9a-f]{6}$/i;
const hx = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

test('OKLab: أبيض وأسود ومحايد، وفرق الصبغة دائري', () => {
  const w = oklab('#ffffff'), k = oklab('#000000'), g = oklab('#808080');
  assert.ok(Math.abs(w.L - 1) < 1e-3 && k.L < 1e-3 && g.C < 1e-3);
  assert.ok(oklab('#c0392b').C > THRESHOLDS.strongC && oklab('#e07b00').C > THRESHOLDS.strongC);
  assert.equal(hueGap(350, 10), 20); assert.equal(hueGap(0, 180), 180);
});

test('اللوحات: ٣ على الأقل لكل طراز، معرّفات فريدة، حقول كاملة وألوان صالحة وسطر «لماذا»', () => {
  assert.deepEqual(Object.keys(PALETTES).sort(), INTERIOR_THEME_IDS.slice().sort());
  assert.equal(new Set(PALETTE_IDS).size, PALETTE_IDS.length);
  for (const [t, list] of Object.entries(PALETTES)) {
    assert.ok(list.length >= 3, t);
    for (const p of list) {
      for (const k of ['wall', 'wallPrivate', 'wallService', 'wallWet', 'main', 'mainAlt', 'accent', 'accent2', 'woodDark', 'woodMid', 'woodLight', 'curtain', 'rug', 'duvet', 'leather']) assert.match(p[k], HEX, `${p.id}.${k}`);
      assert.ok(p.why.length > 40 && p.ar, p.id);
      for (const f of ['public', 'private', 'kitchen', 'wet', 'entrance']) assert.ok(FLOOR_PRESETS[p.floors[f]], `${p.id}.floors.${f}`);
      assert.ok(WALL_PRESETS[p.wetWall] && WALL_PRESETS[p.band], p.id);
    }
  }
});

test('المدقّق: كل لوحة مصمَّمة تجتاز كل الفحوص (حرارة، لمعان، تشبّع، نسب 60/30/10)', () => {
  for (const list of Object.values(PALETTES)) for (const p of list) { const r = checkPalette(p); assert.deepEqual(r.issues, [], p.id); assert.ok(r.ok); }
});

test('المدقّق: يرفض أحمر مشبعًا مع برتقالي مشبع (كنب أحمر فوق قرميد برتقالي كما في ورقة المالك)', () => {
  const terracotta = hx(presetColor(FLOOR_PRESETS.terracotta));
  const r = checkColors({ wall: '#ebd1a0', floor: terracotta, main: '#9a2f26', accent: '#4e6a4a', floorKind: 'clayTile' });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some(i => /مشبعان|المهيمن/.test(i)), r.issues.join(' | '));
});

test('المدقّق: يرفض جدارًا دافئًا مع أرضية باردة، وأرضية بلا تباين مع الجدار، وأثاثًا يذوب في الأرضية', () => {
  const cold = checkColors({ wall: '#f4e0b0', floor: '#7a8794', main: '#3f506b', accent: '#b6903f' });
  assert.equal(cold.ok, false); assert.ok(cold.issues.some(i => /حرارة|دافئ/.test(i)), cold.issues.join('|'));
  const flat = checkColors({ wall: '#e8e2d4', floor: '#e4dccb', main: '#6a5a48', accent: '#b6903f' });
  assert.ok(flat.issues.some(i => /تباين اللمعان بين الجدار والأرضية/.test(i)));
  const melt = checkColors({ wall: '#efe7d6', floor: '#6b5846', main: '#6a5646', accent: '#b6903f' });
  assert.ok(melt.issues.some(i => /يذوب في الأرضية/.test(i)));
});

test('المدقّق: يرفض لمسة أقل تشبّعًا من المهيمن، وجدرانًا مشبعة، ويقبل لوحة متزنة', () => {
  assert.equal(checkColors({ wall: '#ece7dc', floor: '#9a8f80', main: '#4f5d5c', accent: '#e8e4da' }).ok, false);
  assert.equal(checkColors({ wall: '#f4cf7a', floor: '#8a7a68', main: '#3f506b', accent: '#b4673a' }).ok, false);
  assert.equal(checkColors({ wall: '#ece7dc', floor: '#9a8f80', main: '#4f5d5c', accent: '#b4673a' }).ok, true);
});

test('المدقّق: أرقام ناقصة تُرفض بسبب مذكور لا بخطأ برمجي', () => {
  const r = checkColors({ wall: '#fff' }); assert.equal(r.ok, false); assert.match(r.issues[0], /مفقود/);
});

test('تطبيق اللوحة: الدهان والأرضية ولون الأثاث تأتي من اللوحة بلا عشوائية داخل التصميم الواحد', () => {
  for (const t of INTERIOR_THEME_IDS) {
    const p = palettesOf(t)[0], a = roomFinish(t, 'majlis', 'k1', 7, { area: 30, palette: p }), b = roomFinish(t, 'majlis', 'k2', 9, { area: 30, palette: p });
    assert.equal(a.paint, p.wall); assert.equal(a.floor, p.floors.public); assert.equal(a.paletteId, p.id);
    assert.equal(a.floor, b.floor); assert.equal(a.paint, b.paint);
    assert.equal(roomFinish(t, 'master', 'm', 1, { area: 20, palette: p }).floor, p.floors.private);
    assert.equal(roomFinish(t, 'bath', 'b', 1, { area: 5, palette: p }).full.preset, p.wetWall);
    const f = furniturePalette(t, 'majlis', 'k1', 7, p);
    assert.equal(f.upholstery, p.main); assert.equal(f.cushionA, p.accent); assert.equal(f.woodDark, p.woodDark);
    for (const v of Object.values(f)) assert.match(v, HEX);
  }
});

test('اختيار اللوحة: حتمي بالبصمة، يقبل معرّفًا أو رقمًا، وتختلف التصاميم', () => {
  for (const t of INTERIOR_THEME_IDS) {
    assert.equal(resolveInteriorPalette(t, 123).id, resolveInteriorPalette(t, 123).id);
    assert.equal(resolveInteriorPalette(t, 1, 1).id, palettesOf(t)[1].id);
    assert.equal(resolveInteriorPalette(t, 1, palettesOf(t)[2].id).id, palettesOf(t)[2].id);
    assert.equal(resolveInteriorPalette(t, 1, 'nope').id, resolveInteriorPalette(t, 1).id);
    const ids = new Set(Array.from({ length: 40 }, (_, i) => resolveInteriorPalette(t, i * 2654435761 >>> 0).id)); assert.ok(ids.size >= 2, t);
  }
  assert.equal(paletteById('c-greige-olive').id, 'c-greige-olive');
  assert.match(shade('#808080', .5), HEX); assert.equal(shade('#808080', 0), '#808080');
});
