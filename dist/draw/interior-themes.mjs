// Interior finish system: five coherent themes, per-room-type material sets, seeded variation per design and per room.
// Pure data + pure functions (no THREE, no DOM) so it is testable in node and shared by scene3d and the UI.
// The finishes are ILLUSTRATIVE (what a finished room could look like); they never change walls, openings, areas or quantities.
import { designHash } from '../facade-j/facade-realism/variation.mjs';

export const INTERIOR_STORAGE_KEY = 'mizan.interior.theme.v1';

// ---- preset catalogue: floors and wall treatments (painter + parameters; materials are built lazily from these) ----------
/** Floors. `p` = painter in interior-textures; `size` = metres covered by one texture image. */
export const FLOOR_PRESETS = Object.freeze({
  marbleCream:  { ar: 'رخام كريمي', p: 'marble', size: 2.4, S: 640, args: { n: 2, base: [238, 228, 208], cloud: [224, 210, 184], vein: [150, 124, 92], veinAlpha: .5, seed: 41 }, rough: .13, env: 1.25 },
  marbleWhite:  { ar: 'رخام أبيض بعروق ذهبية', p: 'marble', size: 2.4, S: 640, args: { n: 2, base: [247, 245, 241], cloud: [233, 231, 227], vein: [104, 104, 110], veinAlpha: .7, veinSharp: 11, gold: [196, 164, 104], seed: 43 }, rough: .1, env: 1.35 },
  marbleGrey:   { ar: 'رخام رمادي', p: 'marble', size: 2.4, S: 640, args: { n: 2, base: [176, 176, 178], cloud: [146, 146, 150], vein: [240, 240, 242], veinAlpha: .6, veinSharp: 13, grout: [100, 100, 104], seed: 47 }, rough: .12, env: 1.25 },
  marbleDark:   { ar: 'رخام أسود بعروق بيضاء', p: 'marble', size: 2.4, S: 640, args: { n: 2, base: [32, 32, 35], cloud: [58, 58, 62], vein: [232, 232, 232], veinAlpha: .78, veinSharp: 14, grout: [20, 20, 22], seed: 53 }, rough: .1, env: 1.3 },
  marbleBeige:  { ar: 'رخام بيج', p: 'marble', size: 2.4, S: 640, args: { n: 2, base: [216, 198, 168], cloud: [198, 178, 148], vein: [156, 134, 104], veinAlpha: .38, veinSharp: 9, veinFine: .5, seed: 59 }, rough: .16, env: 1.15 },
  porcelainConcrete: { ar: 'بورسلان بتأثير الخرسانة', p: 'porcelain', size: 1.6, S: 512, args: { n: 2, base: [192, 191, 186], cloud: [170, 169, 164], seed: 71 }, rough: .32, ns: 1 },
  porcelainWarm: { ar: 'بورسلان بيج دافئ', p: 'porcelain', size: 1.6, S: 512, args: { n: 2, base: [216, 205, 188], cloud: [198, 186, 166], grout: [150, 138, 120], seed: 73 }, rough: .3, ns: 1 },
  porcelainAnthracite: { ar: 'بورسلان أنثراسايت', p: 'porcelain', size: 1.6, S: 512, args: { n: 2, base: [76, 78, 80], cloud: [56, 58, 60], grout: [28, 28, 30], speck: 10, seed: 77 }, rough: .28, ns: 1 },
  woodOak:      { ar: 'باركيه سنديان فاتح', p: 'wood', size: 2.0, S: 768, args: { ramp: [[158, 116, 72], [196, 154, 102], [222, 186, 136]], plank: .19, seed: 51 }, rough: .5, ns: .8 },
  woodNatural:  { ar: 'باركيه خشب طبيعي', p: 'wood', size: 2.0, S: 768, args: { ramp: [[120, 78, 44], [168, 116, 70], [204, 152, 100]], plank: .16, seed: 52 }, rough: .5, ns: .8 },
  woodWalnut:   { ar: 'باركيه جوز داكن', p: 'wood', size: 2.0, S: 768, args: { ramp: [[62, 38, 24], [96, 62, 40], [134, 90, 60]], plank: .2, seed: 54, gap: [24, 16, 10] }, rough: .45, ns: .8 },
  woodAsh:      { ar: 'باركيه رمادي', p: 'wood', size: 2.0, S: 768, args: { ramp: [[104, 98, 90], [146, 138, 128], [180, 172, 160]], plank: .21, seed: 55, gap: [50, 46, 42], ringFreq: 3.5 }, rough: .5, ns: .7 },
  cementNajdi:  { ar: 'بلاط إسمنتي مزخرف (تراثي)', p: 'cementTile', size: 1.2, S: 768, args: { n: 6, pal: ['#eadfc4', '#b5573a', '#2d2723', '#d3a45a'], seed: 7 }, rough: .55, ns: 0 },
  cementGreen:  { ar: 'بلاط إسمنتي أخضر وكريمي', p: 'cementTile', size: 1.2, S: 768, args: { n: 6, pal: ['#e9e3d0', '#2f6b57', '#1f2b29', '#c9a24c'], seed: 11 }, rough: .55, ns: 0 },
  terracotta:   { ar: 'بلاط فخاري (تيراكوتا)', p: 'clayTile', size: 1.2, S: 512, args: { n: 4, base: [[178, 94, 64], [164, 82, 56], [190, 108, 74]], seed: 19 }, rough: .7, ns: 2.5 },
  tileSand:     { ar: 'سيراميك رملي', p: 'clayTile', size: .9, S: 512, args: { n: 3, base: [[218, 206, 184], [210, 198, 176], [224, 212, 190]], grout: [150, 138, 118], seed: 21, mottle: .5 }, rough: .35, ns: 2.5 },
  tileSlate:    { ar: 'سيراميك رمادي', p: 'clayTile', size: .9, S: 512, args: { n: 3, base: [[126, 130, 132], [116, 120, 122], [136, 140, 141]], grout: [80, 82, 84], seed: 23, mottle: .6 }, rough: .35, ns: 2.5 },
  tileWhite:    { ar: 'سيراميك أبيض', p: 'clayTile', size: .9, S: 512, args: { n: 3, base: [[236, 236, 232], [230, 231, 228]], grout: [170, 168, 160], seed: 25, mottle: .25 }, rough: .28, ns: 2.5 },
  tileTeal:     { ar: 'سيراميك أخضر مزرق', p: 'clayTile', size: .9, S: 512, args: { n: 3, base: [[88, 138, 130], [78, 128, 122], [98, 146, 138]], grout: [150, 160, 150], seed: 27, glaze: 1, mottle: .7 }, rough: .3, ns: 2.5 },
});

/** Wall treatments. `tint:true` = the colour map is neutral and the room colour multiplies it (vertex colour); `tint:false` = own colour. */
export const WALL_PRESETS = Object.freeze({
  subwayWhite: { ar: 'سيراميك جداري أبيض لامع', p: 'wallTile', size: .6, S: 384, args: { tw: .15, th: .075, base: [[244, 244, 240], [239, 240, 237]] }, rough: .18, ns: 3, tint: false },
  subwaySand:  { ar: 'سيراميك جداري رملي', p: 'wallTile', size: .6, S: 384, args: { tw: .15, th: .075, base: [[226, 214, 192], [220, 208, 186]], grout: [190, 176, 150] }, rough: .2, ns: 3, tint: false },
  subwayGreen: { ar: 'سيراميك جداري أخضر زيتي', p: 'wallTile', size: .6, S: 384, args: { tw: .15, th: .075, base: [[92, 128, 108], [84, 120, 102], [100, 134, 114]], grout: [176, 182, 168] }, rough: .16, ns: 3, tint: false },
  tileLargeGrey: { ar: 'سيراميك جداري كبير رمادي', p: 'wallTile', size: .6, S: 384, args: { tw: .3, th: .6, bond: 'stack', base: [[170, 172, 172], [164, 166, 167]], grout: [120, 122, 122] }, rough: .22, ns: 3, tint: false },
  tileLargeBeige: { ar: 'سيراميك جداري كبير بيج', p: 'wallTile', size: .6, S: 384, args: { tw: .3, th: .6, bond: 'stack', base: [[222, 210, 190], [216, 204, 184]], grout: [176, 162, 140] }, rough: .22, ns: 3, tint: false },
  tileLargeDark: { ar: 'سيراميك جداري كبير داكن', p: 'wallTile', size: .6, S: 384, args: { tw: .3, th: .6, bond: 'stack', base: [[66, 68, 70], [60, 62, 64]], grout: [30, 30, 32] }, rough: .2, ns: 3, tint: false },
  zelligeTeal: { ar: 'زليج أخضر مزرق', p: 'clayTile', size: .8, S: 384, args: { n: 8, base: [[70, 134, 128], [62, 122, 118], [80, 144, 136]], grout: [160, 172, 160], glaze: 1.4, seed: 31, mottle: .9 }, rough: .22, ns: 3, tint: false },
  panelClassic: { ar: 'كسوة جدارية كلاسيكية', p: 'wallPanel', size: 1.2, S: 512, args: { cols: 2, rows: 1, frame: .07 }, rough: .6, ns: 2.2, tint: true },
  panelTall:   { ar: 'كسوة جدارية طويلة', p: 'wallPanel', size: 1.2, S: 512, args: { cols: 1, rows: 1, frame: .08 }, rough: .6, ns: 2.2, tint: true },
  flutedDark:  { ar: 'شرائح خشب داكنة', p: 'flutedSlats', size: 1.0, S: 512, args: { slat: .05, ramp: [[44, 34, 28], [78, 60, 46]] }, rough: .55, ns: 2.5, tint: false },
  flutedOak:   { ar: 'شرائح خشب سنديان', p: 'flutedSlats', size: 1.0, S: 512, args: { slat: .06, ramp: [[126, 90, 58], [176, 132, 90]] }, rough: .55, ns: 2.5, tint: false },
  ashlarNajdi: { ar: 'حجر جيري منحوت', p: 'ashlar', size: 1.6, S: 768, args: { course: .22 }, rough: .85, ns: 3, tint: false },
  marbleWall:  { ar: 'رخام جداري', p: 'marble', size: 2.4, S: 640, args: { n: 1, base: [244, 241, 235], cloud: [226, 222, 214], vein: [112, 108, 106], veinAlpha: .66, veinSharp: 12, gold: [190, 158, 100], seed: 61 }, rough: .12, ns: 0, tint: false },
  marbleWallGrey: { ar: 'رخام جداري رمادي', p: 'marble', size: 2.4, S: 640, args: { n: 1, base: [168, 168, 170], cloud: [138, 138, 142], vein: [238, 238, 240], veinAlpha: .6, veinSharp: 13, seed: 67 }, rough: .12, ns: 0, tint: false },
  limewash:    { ar: 'بياض جصّي ناعم (لِبَد)', p: 'limewash', size: 1.6, S: 512, args: {}, rough: .95, ns: 1.4, tint: true },
});

// ---- themes ---------------------------------------------------------------------------------------------------------------------
const GROUP = { majlis: 'public', living: 'public', dining: 'public', entrance: 'public', stairs: 'public', bedroom: 'private', master: 'private', office: 'private', kitchen: 'service', bath: 'wet', laundry: 'wet', corridor: 'service', storage: 'service', service: 'service', garage: 'service', elevator: 'service', other: 'service' };
export const roomGroup = type => GROUP[type] || 'service';

/**
 * Each theme: paint pools per room group, accent colours, ceiling/trim, per-room-type floor pools + wall treatments, lighting,
 * door style and a furniture palette (names = shared fixture material names of fixtures3d).
 * `rooms[type]`: floor:[preset...] (one chosen by seed), band:{preset,h,cap} (wainscot), accent:{preset|color, rate} (feature wall),
 * full:{preset,h} (tiled walls), cove:bool, center: light fitting kind.
 */
export const INTERIOR_THEMES = Object.freeze({
  contemporary: {
    ar: 'معاصر محايد', blurb: 'ألوان محايدة هادئة، بورسلان كبير القياس، خشب فاتح وإضاءة خطية مخفية.', swatch: ['#e4e0d8', '#c9c4b9', '#b08d62', '#3b3f44'],
    paint: { public: ['#e6e2d9', '#e1ddd2', '#e8e4dc'], private: ['#e4ded3', '#dfe1dc', '#e6e0d6'], service: ['#e8e6e0', '#e3e1da'], wet: ['#e8e8e4'] },
    accents: ['#8a8f86', '#6f7b78', '#a39482'], ceiling: '#faf9f6', trim: '#f4f2ee', skirt: { h: .09, kind: 'flat' }, cornice: 'none', led: '#ffe9c4', metal: 'chrome',
    rooms: {
      majlis: { floor: ['porcelainConcrete', 'porcelainWarm'], accent: { preset: 'flutedOak', rate: .85 }, cove: true, center: 'linear' },
      living: { floor: ['porcelainConcrete'], accent: { color: 0, rate: .7 }, cove: true, center: 'linear' },
      dining: { floor: ['porcelainConcrete', 'porcelainWarm'], accent: { color: 1, rate: .6 }, cove: true, center: 'pendantLine' },
      entrance: { floor: ['porcelainWarm', 'porcelainConcrete'], accent: { preset: 'flutedOak', rate: .5 }, cove: false, center: 'downlight' },
      kitchen: { floor: ['porcelainConcrete', 'tileSlate'], full: { preset: 'tileLargeGrey', h: 0 }, band: { preset: 'tileLargeGrey', h: 1.5, from: .9 }, cove: false, center: 'downlight' },
      bedroom: { floor: ['woodOak', 'woodAsh'], accent: { color: 2, rate: .55 }, cove: false, center: 'flush' },
      master: { floor: ['woodOak', 'woodNatural'], accent: { preset: 'flutedOak', rate: .8 }, cove: true, center: 'linear' },
      office: { floor: ['woodAsh', 'woodOak'], accent: { color: 1, rate: .6 }, cove: false, center: 'flush' },
      bath: { floor: ['porcelainConcrete', 'tileSlate'], full: { preset: 'tileLargeGrey', h: 2.4 }, cove: false, center: 'downlight' },
      laundry: { floor: ['tileSlate'], full: { preset: 'tileLargeGrey', h: 1.2 }, cove: false, center: 'flush' },
      corridor: { floor: ['porcelainConcrete', 'porcelainWarm'], cove: false, center: 'downlight' },
      storage: { floor: ['porcelainConcrete'], cove: false, center: 'flush' },
    },
    door: { leaf: '#f1efea', style: 'paint', frame: '#f4f2ee', metal: 'chrome' },
    furn: {
      majlisFabric: ['#8d8a82', '#6f7479', '#9a8f80'], majlisCream: ['#d8d2c6', '#cfcac0'], fabric: ['#a6a49d', '#8c9096', '#b3a998'], woodDark: ['#4a3b30'], woodMid: ['#a78462', '#8a7060'], woodLight: ['#c9ab86', '#d4b995'],
      duvet: ['#e7e3da', '#d5d6d2'], duvetAccent: ['#6f7b78', '#8a8f86', '#b08d62'], pillowA: ['#ece8df'], pillowB: ['#6d7a77', '#b08d62', '#8a8f86'], leather: ['#4a4038', '#5a4a3c'], lacquer: ['#f1f0ec', '#dcdcd8', '#c4c9c4'], quartz: ['#ebe9e3'], gold: ['#b9bcc0'], lampShade: ['#f2eadb'],
    },
    curtain: ['#d8d3c8', '#c9c6bd', '#cfd2cc'], art: { kinds: ['lines', 'field', 'geo'], pal: ['#ece8df', '#8a8f86', '#3b3f44', '#b08d62'] }, rug: ['#cfc9bc', '#b8b4aa', '#c9bfae'],
  },
  classic: {
    ar: 'كلاسيكي دافئ', blurb: 'جدران كريمية بكسوات مصنّعة وكرانيش، رخام كريمي وخشب جوز، ثريات وإكسسوارات نحاسية.', swatch: ['#efe3cc', '#d9c29a', '#7a4a2d', '#a8803f'],
    paint: { public: ['#f4e0b0', '#efd9a4', '#f2e2bc'], private: ['#f1dcbc', '#ecd5b0', '#f0e0c4'], service: ['#eee3cc', '#ebdfc4'], wet: ['#eee6d6'] },
    accents: ['#cdb48a', '#b99a6c', '#a2785a'], ceiling: '#fbf6ea', trim: '#f8f2e6', skirt: { h: .16, kind: 'stepped' }, cornice: 'classic', led: '#ffdca0', metal: 'brass',
    rooms: {
      majlis: { floor: ['marbleCream', 'marbleBeige'], band: { preset: 'panelClassic', h: 1.2, cap: true }, accent: { color: 0, rate: .4 }, cove: true, center: 'chandelier' },
      living: { floor: ['marbleCream', 'marbleBeige'], band: { preset: 'panelClassic', h: 1.2, cap: true }, cove: true, center: 'chandelier' },
      dining: { floor: ['marbleBeige', 'marbleCream'], band: { preset: 'panelClassic', h: 1.2, cap: true }, cove: true, center: 'chandelier' },
      entrance: { floor: ['marbleCream'], band: { preset: 'panelTall', h: 1.2, cap: true }, cove: true, center: 'chandelier' },
      kitchen: { floor: ['tileSand', 'marbleBeige'], band: { preset: 'subwaySand', h: 1.5, from: .9 }, cove: false, center: 'flush' },
      bedroom: { floor: ['woodWalnut', 'woodNatural'], band: { preset: 'panelClassic', h: 1.0, cap: true }, accent: { color: 1, rate: .4 }, cove: false, center: 'flush' },
      master: { floor: ['woodWalnut', 'woodNatural'], band: { preset: 'panelClassic', h: 1.1, cap: true }, accent: { color: 2, rate: .6 }, cove: true, center: 'chandelier' },
      office: { floor: ['woodWalnut'], band: { preset: 'panelClassic', h: 1.1, cap: true }, cove: false, center: 'flush' },
      bath: { floor: ['marbleBeige', 'tileSand'], full: { preset: 'subwaySand', h: 2.4 }, cove: false, center: 'flush' },
      laundry: { floor: ['tileSand'], full: { preset: 'subwayWhite', h: 1.2 }, cove: false, center: 'flush' },
      corridor: { floor: ['marbleCream', 'marbleBeige'], band: { preset: 'panelClassic', h: 1.1, cap: true }, cove: false, center: 'flush' },
      storage: { floor: ['tileSand'], cove: false, center: 'flush' },
    },
    door: { leaf: '#6a4630', style: 'wood', frame: '#f8f2e6', metal: 'brass' },
    furn: {
      majlisFabric: ['#8a3a30', '#6a5a3a', '#7a4a3a'], majlisCream: ['#e2d3ae', '#dccba3'], fabric: ['#c2ab86', '#b9a58a', '#c7b79a'], woodDark: ['#43291b'], woodMid: ['#6e4730', '#7c5238'], woodLight: ['#a67c52', '#b58b5b'],
      duvet: ['#e9dfc8', '#ddd0b4'], duvetAccent: ['#8a3a30', '#a8803f', '#6b5a3a'], pillowA: ['#efe5cd'], pillowB: ['#a8803f', '#8a3a30'], leather: ['#5a3a28'], lacquer: ['#efe8d8', '#e6dcc4'], quartz: ['#efe9dc'], gold: ['#c8a24a'], lampShade: ['#f6e8c6'],
    },
    curtain: ['#bfa27a', '#a98a63', '#b08a6a'], art: { kinds: ['arch', 'field', 'dune'], pal: ['#efe3cc', '#b0845a', '#5a3a28', '#c8a24a'] }, rug: ['#b49a74', '#a86a4c', '#9a8a68'],
  },
  najdi: {
    ar: 'نجدي أصيل', blurb: 'بياض طيني ترابي، بلاط إسمنتي مزخرف، حجر جيري منحوت، جلسات حمراء وخشب داكن.', swatch: ['#dcc7a3', '#b5573a', '#2d2723', '#d3a45a'],
    paint: { public: ['#ebd1a0', '#e4c794', '#eed6a8'], private: ['#e9d0a4', '#e2c698', '#edd7ae'], service: ['#e8d6b2', '#e3cfa8'], wet: ['#eadcbf'] },
    accents: ['#b5573a', '#a65e3c', '#c28a52'], ceiling: '#f0e4cc', trim: '#e9dcc0', skirt: { h: .12, kind: 'flat' }, cornice: 'simple', led: '#ffcf8c', metal: 'brass', beams: true,
    rooms: {
      majlis: { floor: ['cementNajdi', 'terracotta'], accent: { preset: 'ashlarNajdi', rate: 1 }, band: { preset: 'limewash', h: 0 }, cove: false, center: 'lantern' },
      living: { floor: ['cementNajdi', 'terracotta'], accent: { color: 0, rate: .8 }, cove: false, center: 'lantern' },
      dining: { floor: ['terracotta', 'cementNajdi'], accent: { color: 2, rate: .6 }, cove: false, center: 'lantern' },
      entrance: { floor: ['cementNajdi'], accent: { preset: 'ashlarNajdi', rate: .7 }, cove: false, center: 'lantern' },
      kitchen: { floor: ['terracotta', 'tileSand'], band: { preset: 'zelligeTeal', h: 1.5, from: .9 }, cove: false, center: 'flush' },
      bedroom: { floor: ['woodNatural', 'terracotta'], accent: { color: 2, rate: .5 }, cove: false, center: 'flush' },
      master: { floor: ['woodNatural', 'woodWalnut'], accent: { color: 0, rate: .8 }, cove: false, center: 'lantern' },
      office: { floor: ['woodNatural'], accent: { color: 1, rate: .5 }, cove: false, center: 'flush' },
      bath: { floor: ['tileSand', 'terracotta'], full: { preset: 'zelligeTeal', h: 2.0 }, cove: false, center: 'flush' },
      laundry: { floor: ['terracotta'], full: { preset: 'subwaySand', h: 1.2 }, cove: false, center: 'flush' },
      corridor: { floor: ['cementNajdi', 'terracotta'], cove: false, center: 'lantern' },
      storage: { floor: ['terracotta'], cove: false, center: 'flush' },
    },
    door: { leaf: '#4a2f20', style: 'wood', frame: '#5a3a28', metal: 'brass' },
    furn: {
      majlisFabric: ['#8a3a2c', '#7d2f33', '#9a4a32'], majlisCream: ['#d8c29a', '#cdb78e'], fabric: ['#c9a77d', '#b8956a'], woodDark: ['#3b2418'], woodMid: ['#6a4228', '#7a5232'], woodLight: ['#a98055', '#b58b5b'],
      duvet: ['#dccfb0', '#d6c8a6'], duvetAccent: ['#8a3a2c', '#a65e3c', '#2d4a3f'], pillowA: ['#e6d8b6'], pillowB: ['#9a4a32', '#2d4a3f', '#d3a45a'], leather: ['#5a3724'], lacquer: ['#e6dac0', '#d9cba8'], quartz: ['#e9e0cc'], gold: ['#c8a24a'], lampShade: ['#f2deb0'],
    },
    curtain: ['#a65e3c', '#c28a52', '#8a5a3a'], art: { kinds: ['geo', 'dune', 'arch'], pal: ['#e8d8b8', '#b5573a', '#2d2723', '#d3a45a'] }, rug: ['#a2503a', '#8a3a2c', '#b5573a'],
  },
  luxury: {
    ar: 'رخام فاخر', blurb: 'رخام أبيض بعروق ذهبية، جدران عاجية وكسوات رخامية، إضاءة مخفية دافئة وثريات كريستال.', swatch: ['#f1ebe0', '#d8c9a8', '#b89a5a', '#2c2a28'],
    paint: { public: ['#f4e7ca', '#efe0c0', '#f2e6cf'], private: ['#f2e4c8', '#ecdcbe', '#f3e7d1'], service: ['#eee6d4', '#eae1cb'], wet: ['#eeeae0'] },
    accents: ['#d8c9a8', '#c9b48a', '#8a7a62'], ceiling: '#fdfaf3', trim: '#faf6ec', skirt: { h: .13, kind: 'marble' }, cornice: 'coved', led: '#ffe0a8', metal: 'brass',
    rooms: {
      majlis: { floor: ['marbleWhite'], accent: { preset: 'marbleWall', rate: 1 }, band: { preset: 'panelTall', h: 1.1, cap: true }, cove: true, center: 'chandelier' },
      living: { floor: ['marbleWhite', 'marbleBeige'], accent: { preset: 'marbleWall', rate: .9 }, cove: true, center: 'chandelier' },
      dining: { floor: ['marbleWhite'], accent: { preset: 'marbleWall', rate: .6 }, cove: true, center: 'chandelier' },
      entrance: { floor: ['marbleDark', 'marbleWhite'], accent: { preset: 'marbleWall', rate: .8 }, cove: true, center: 'chandelier' },
      kitchen: { floor: ['marbleBeige', 'marbleGrey'], band: { preset: 'marbleWall', h: 1.5, from: .9 }, cove: false, center: 'downlight' },
      bedroom: { floor: ['woodNatural', 'marbleBeige'], band: { preset: 'panelClassic', h: 1.0, cap: true }, cove: true, center: 'flush' },
      master: { floor: ['marbleBeige', 'woodWalnut'], accent: { preset: 'marbleWall', rate: .8 }, cove: true, center: 'chandelier' },
      office: { floor: ['woodWalnut'], band: { preset: 'panelClassic', h: 1.1, cap: true }, cove: false, center: 'flush' },
      bath: { floor: ['marbleWhite', 'marbleGrey'], full: { preset: 'marbleWall', h: 2.4 }, cove: true, center: 'downlight' },
      laundry: { floor: ['tileWhite'], full: { preset: 'subwayWhite', h: 1.2 }, cove: false, center: 'flush' },
      corridor: { floor: ['marbleWhite', 'marbleBeige'], band: { preset: 'panelTall', h: 1.1, cap: true }, cove: true, center: 'downlight' },
      storage: { floor: ['tileWhite'], cove: false, center: 'flush' },
    },
    door: { leaf: '#f6f1e6', style: 'paint', frame: '#faf6ec', metal: 'brass' },
    furn: {
      majlisFabric: ['#cdbd9c', '#b8a688', '#6d6a5a'], majlisCream: ['#efe6d2', '#e6dbc2'], fabric: ['#d9ccae', '#c9bba0', '#a9a28c'], woodDark: ['#2f2018'], woodMid: ['#5d4030', '#6a4a36'], woodLight: ['#b49872', '#c0a47e'],
      duvet: ['#f1ebdf', '#e8e0cf'], duvetAccent: ['#b89a5a', '#8a7a62', '#6d6a5a'], pillowA: ['#f3ecdc'], pillowB: ['#b89a5a', '#8a7a62'], leather: ['#3b2a20'], lacquer: ['#f4f0e6', '#ece6d8'], quartz: ['#f1eee6'], gold: ['#c8a24a'], lampShade: ['#f6ebcf'],
    },
    curtain: ['#d9cdb0', '#cdbe9d', '#e0d6bd'], art: { kinds: ['field', 'lines', 'arch'], pal: ['#f0eadf', '#c9b48a', '#2c2a28', '#b89a5a'] }, rug: ['#d6cbb4', '#c7baa0', '#bfb8a8'],
  },
  dark: {
    ar: 'حديث بلمسة داكنة', blurb: 'جدران رمادية فاتحة مع جدار رئيسي داكن، شرائح خشب، بورسلان أنثراسايت وإطارات سوداء.', swatch: ['#d9d9d6', '#2f3a3d', '#7a5a3c', '#1d1f21'],
    paint: { public: ['#dcdcd8', '#d5d6d3', '#e0dfdb'], private: ['#d9d9d5', '#d3d5d3', '#dedcd7'], service: ['#e0e0dd', '#dadad7'], wet: ['#e0e0de'] },
    accents: ['#2f3a3d', '#2e3b34', '#3a3236', '#27323f'], ceiling: '#f6f6f4', trim: '#202223', skirt: { h: .1, kind: 'flat' }, cornice: 'none', led: '#ffe2b4', metal: 'black',
    rooms: {
      majlis: { floor: ['porcelainAnthracite', 'woodAsh'], accent: { preset: 'flutedDark', rate: .9 }, cove: true, center: 'linear' },
      living: { floor: ['porcelainAnthracite', 'woodAsh'], accent: { color: 0, rate: 1 }, cove: true, center: 'linear' },
      dining: { floor: ['woodAsh', 'porcelainAnthracite'], accent: { color: 1, rate: .9 }, cove: true, center: 'pendantLine' },
      entrance: { floor: ['marbleDark', 'porcelainAnthracite'], accent: { preset: 'flutedDark', rate: .8 }, cove: false, center: 'downlight' },
      kitchen: { floor: ['porcelainAnthracite', 'tileSlate'], band: { preset: 'tileLargeDark', h: 1.5, from: .9 }, cove: false, center: 'downlight' },
      bedroom: { floor: ['woodAsh', 'woodWalnut'], accent: { color: 3, rate: .8 }, cove: false, center: 'flush' },
      master: { floor: ['woodWalnut', 'woodAsh'], accent: { preset: 'flutedDark', rate: .85 }, cove: true, center: 'linear' },
      office: { floor: ['woodWalnut', 'woodAsh'], accent: { color: 0, rate: .8 }, cove: false, center: 'flush' },
      bath: { floor: ['porcelainAnthracite', 'tileSlate'], full: { preset: 'tileLargeDark', h: 2.4 }, cove: false, center: 'downlight' },
      laundry: { floor: ['tileSlate'], full: { preset: 'tileLargeGrey', h: 1.2 }, cove: false, center: 'flush' },
      corridor: { floor: ['porcelainAnthracite', 'woodAsh'], cove: false, center: 'downlight' },
      storage: { floor: ['tileSlate'], cove: false, center: 'flush' },
    },
    door: { leaf: '#2c2f31', style: 'paint', frame: '#202223', metal: 'black' },
    furn: {
      majlisFabric: ['#3c4448', '#2f3a3d', '#5a5148'], majlisCream: ['#cfcdc6', '#bfbcb4'], fabric: ['#6a6f72', '#4b5155', '#8a8378'], woodDark: ['#2c211b'], woodMid: ['#5a4232', '#6b4e3a'], woodLight: ['#9b7c5a', '#a98a66'],
      duvet: ['#d7d8d5', '#bfc2c0'], duvetAccent: ['#2f3a3d', '#7a5a3c', '#3a3236'], pillowA: ['#e3e3e0'], pillowB: ['#2f3a3d', '#7a5a3c'], leather: ['#241f1c', '#3a2e26'], lacquer: ['#2f3335', '#d8d8d5', '#3a4a44'], quartz: ['#2e2f31'], gold: ['#2b2c2e'], lampShade: ['#efe6d2'],
    },
    curtain: ['#5d6266', '#3f4548', '#8a8378'], art: { kinds: ['lines', 'geo', 'field'], pal: ['#dcdcd8', '#2f3a3d', '#7a5a3c', '#c9a24c'] }, rug: ['#6a6f72', '#4b5155', '#8a8378'],
  },
});

export const INTERIOR_THEME_IDS = Object.freeze(Object.keys(INTERIOR_THEMES));
export const DEFAULT_INTERIOR_THEME = 'contemporary';
export const isInteriorTheme = id => Object.hasOwn(INTERIOR_THEMES, id);

// ---- picking the theme --------------------------------------------------------------------------------------------------------
const STYLE_BIAS = { N: ['najdi', 'classic'], najdi: ['najdi', 'classic'], H: ['classic', 'luxury'], hijazi: ['classic', 'luxury'], S: ['contemporary', 'classic'], salmani: ['contemporary', 'classic'], C: ['luxury', 'classic'], classic: ['luxury', 'classic'], M: ['contemporary', 'dark'], modern: ['contemporary', 'dark'], J: ['luxury', 'dark'] };
const TASTE_THEME = { dark: 'dark', luxury: 'luxury', grand: 'luxury', warm: 'classic', heritage: 'najdi', najdi: 'najdi', calm: 'contemporary', simple: 'contemporary', modern: 'contemporary' };
export function safeDesignHash(doc) { try { return designHash(doc) >>> 0; } catch { return 0; } }
const mulberry = seed => () => { let t = (seed += 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const seededRandom = mulberry;
const pickBy = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

/**
 * Which interior theme this design gets.
 *  1. the client's own choice (`theme`, from the selector)  2. `doc.finish.interior`  3. a stated taste word  4. the exterior style's two natural neighbours,
 *  picked by the design's geometric fingerprint (so two different plans do not end up with the same interior)  5. any theme by fingerprint.
 * @returns {{ id: string, source: 'user'|'design'|'taste'|'style'|'auto', reason: string }}
 */
export function resolveInteriorTheme(doc, { theme = null, style = null, taste = [] } = {}) {
  if (theme && isInteriorTheme(theme)) return { id: theme, source: 'user', reason: 'اختيارك' };
  const fin = doc?.finish?.interior; if (fin && isInteriorTheme(fin)) return { id: fin, source: 'design', reason: 'مثبّت في التصميم' };
  const h = safeDesignHash(doc), r = mulberry(h ^ 0x9e3779b9);
  for (const t of taste || []) if (TASTE_THEME[t]) return { id: TASTE_THEME[t], source: 'taste', reason: 'ذوقك الذي ذكرته' };
  const bias = STYLE_BIAS[style]; if (bias) return { id: pickBy(bias, r()), source: 'style', reason: 'ينسجم مع طراز الواجهة' };
  return { id: pickBy(INTERIOR_THEME_IDS, r()), source: 'auto', reason: 'اقتراح الميزان لهذا المخطط' };
}

// ---- per-room finish ------------------------------------------------------------------------------------------------------
const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * Concrete finish of one room: floor preset, wall paint, optional feature wall / wainscot / tiles, ceiling, skirting, light fitting.
 * Deterministic in (theme, room type, room key, design seed) so a rebuild never reshuffles, but each room of a type can differ.
 */
export function roomFinish(themeId, type, roomKey = '', designSeed = 0, { area = 12 } = {}) {
  const T = INTERIOR_THEMES[themeId] || INTERIOR_THEMES[DEFAULT_INTERIOR_THEME], R = T.rooms[type] || T.rooms.corridor, group = roomGroup(type);
  const r = mulberry((strHash(String(roomKey) + type) ^ designSeed) >>> 0);
  const pool = T.paint[group] || T.paint.service;
  const f = { theme: themeId, type, group, floor: pickBy(R.floor || ['porcelainConcrete'], r()), paint: pickBy(pool, r()), ceiling: T.ceiling, trim: T.trim, skirt: { ...T.skirt }, cornice: T.cornice, led: T.led, metal: T.metal, beams: !!T.beams && group === 'public' || !!T.beams && type === 'master', cove: !!R.cove && area >= 9, center: area >= 7 ? (area < 11 && R.center === 'chandelier' ? 'flush' : R.center || 'flush') : null, accent: null, band: null, full: null, seed: r() };
  if (R.full) f.full = { ...R.full };
  if (R.band && (R.band.h > 0)) f.band = { ...R.band };
  if (R.accent && area >= 8 && r() < (R.accent.rate ?? .5)) {
    if (R.accent.preset) f.accent = { preset: R.accent.preset };
    else { const ci = R.accent.color ?? 0; f.accent = { color: T.accents[Math.min(T.accents.length - 1, ci)] }; }
  }
  if (themeId === 'najdi' && type === 'majlis') f.beams = true;
  if (group === 'wet') { f.cove = false; f.accent = null; f.band = null; }
  if (type === 'kitchen') f.accent = null;
  if (f.band && f.accent?.preset && /marble|ashlar|fluted/.test(f.accent.preset) && !f.band.preset.startsWith('panel')) f.band = null;
  return f;
}

/** Colour overrides for the shared furniture material names of one room (consumed by scene3d to create material variants). */
export function furniturePalette(themeId, type, roomKey = '', designSeed = 0) {
  const T = INTERIOR_THEMES[themeId] || INTERIOR_THEMES[DEFAULT_INTERIOR_THEME], r = mulberry((strHash('f' + roomKey + type) ^ designSeed) >>> 0), out = {};
  const ix = r(); // one shared index keeps a room's pieces coherent (sofa + cushions + table come from the same family)
  for (const [name, arr] of Object.entries(T.furn)) out[name] = arr[Math.min(arr.length - 1, Math.floor((name === 'woodDark' || name === 'woodMid' || name === 'woodLight' ? ix : (ix * 7.13 + (name.length % 3) * .21) % 1) * arr.length))];
  if (T.rug) out.rug = pickBy(T.rug, r());
  if (type === 'kitchen') out.lacquer = pickBy(T.furn.lacquer, r());
  return out;
}

export const THEME_FIELDS = Object.freeze(['paint', 'accents', 'ceiling', 'trim', 'skirt', 'cornice', 'led', 'metal', 'rooms', 'door', 'furn', 'curtain', 'art', 'rug']);
