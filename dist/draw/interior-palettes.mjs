// Hand-built colour palettes for the interior themes. Every palette is a decision, not a random draw:
//   * 60%  dominant neutral  = walls + ceiling + the big floor plane      (`wall`, floors)
//   * 30%  secondary         = main upholstery, curtains, rug, timber     (`main`, `mainAlt`, `curtain`, `rug`, woods)
//   * 10%  accent            = cushions, throws, art, lamp shades, metal  (`accent`, `accent2`, `metal`)
// plus: one colour temperature per palette (floor, wall and furniture lean the same way), a lightness gap between floor / wall / upholstery,
// and at most one strong chromatic colour at large scale. `checkPalette` (interior-color-check) enforces all of it and the tests run it on every palette.
//
// Sources (consulted 2026-11; they support the PRINCIPLES, not the exact hex values, which are illustrative design choices — «غير متحقق» كمعايير):
//  [1] Gulf News, «60-30-10: The one simple rule for your perfect home colour palette» — 60% neutral walls/ceiling/floor (white, beige or brown in the UAE), 30% sofas,
//      curtains, rugs, cabinets, 10% accent; neutral schemes take a metal (black/gold) or greenery as the accent; mix yellow- and blue-based neutrals.
//  [2] Juliette's Interiors, «Modern Majlis Interior Design» — modern majlis: neutral palette with traditional accents, cream and gold, dark floor-to-ceiling curtains,
//      marble floors, low seating with plush cushions, lanterns, a grand chandelier, incense burners, geometric tile (zellige).
//  [3] Jazeera Paints, «Arab traditional houses» — clay is the prominent building material of Arabian houses «especially in Najd»; rich layered interiors, embroidered drapes, rugs.
//  [4] Arab News (2021), Najdi-style majlis commissioned in Saudi Arabia — hardwood and hand-carved tables, leather, upholstery and curtains inspired by Bedouin rugs, colourful poufs, brass/copper.
//  [5] Attiah & Alawad (2022), «colour in the interior spaces of traditional Saudi houses, the majlis» (Journal of King Faisal University) — each Saudi region has its own interior
//      palette. Only the abstract was read: which colours? غير متحقق.
import { FLOOR_PRESETS, WALL_PRESETS } from './interior-themes.mjs';
import { checkColors, presetColor } from './interior-color-check.mjs';

export const PALETTE_SOURCES = Object.freeze(['Gulf News 60-30-10', "Juliette's Interiors modern majlis", 'Jazeera Paints Arab traditional houses', 'Arab News Najdi majlis 2021', 'Attiah & Alawad 2022 (abstract only)']);

/**
 * Palette fields:
 *  wall / wallPrivate / wallService / wallWet : paint
 *  floors  : preset id per room family { public, private, kitchen, wet, entrance }  (FLOOR_PRESETS)
 *  wetWall : tile preset for bathrooms (WALL_PRESETS) · band : kitchen splash-back preset
 *  accentWall : { preset } | { color } feature wall (colour must stay near the wall hue)
 *  main / mainAlt : sofa upholstery / seat cushions · accent / accent2 : cushions and throws · woodDark / woodMid / woodLight · metal · curtain · rug · duvet
 *  why : one line, WHY these colours (shown in the UI blurb and kept here as documentation)
 */
export const PALETTES = Object.freeze({
  contemporary: [
    { id: 'c-greige-olive', ar: 'رملي رمادي مع زيتي', why: 'قاعدة محايدة دافئة (رملي) و٣٠٪ رمادي دافئ للأثاث، ولمسة خضراء زيتية ١٠٪ تكسر الحياد كما في توصية «لمسة نباتية/معدن» [1]؛ كل الدرجات من العائلة الصفراء الخفيفة نفسها.',
      wall: '#ece7dc', wallPrivate: '#e9e3d7', wallService: '#ebe7de', wallWet: '#ecebe5', floors: { public: 'porcelainConcrete', private: 'woodOak', kitchen: 'porcelainConcrete', wet: 'porcelainConcrete', entrance: 'porcelainConcrete' }, wetWall: 'tileLargeGrey', band: 'tileLargeGrey',
      accentWall: { preset: 'flutedOak' }, main: '#7f786c', mainAlt: '#d1c9ba', accent: '#56704f', accent2: '#c9a063', woodDark: '#4a3a2e', woodMid: '#a07b57', woodLight: '#caa97e', metal: 'chrome', curtain: '#d9d3c6', rug: '#cdc5b4', duvet: '#e6e1d5', leather: '#5a4a3c' },
    { id: 'c-oak-rust', ar: 'بلوط وكتان مع صدئي', why: 'خشب بلوط دافئ يغطي الأرضية (30٪ مع الأثاث) وجدران كتانية فاتحة (60٪)، ولمسة صدئية/نحاسية ١٠٪ من الطيف الدافئ نفسه فلا تتنافر مع الخشب.',
      wall: '#ebe5d8', wallPrivate: '#e8e1d3', wallService: '#eae6dc', wallWet: '#ecebe4', floors: { public: 'woodOak', private: 'woodOak', kitchen: 'porcelainConcrete', wet: 'porcelainConcrete', entrance: 'porcelainConcrete' }, wetWall: 'tileLargeGrey', band: 'tileLargeGrey',
      accentWall: { preset: 'flutedOak' }, main: '#625e57', mainAlt: '#8a8478', accent: '#b4673a', accent2: '#d2b27c', woodDark: '#43342a', woodMid: '#9a7550', woodLight: '#c9a67a', metal: 'brass', curtain: '#d8d0c0', rug: '#d4ccba', duvet: '#e9e4d8', leather: '#55402f' },
    { id: 'c-stone-slate', ar: 'حجري مع أزرق مخضر', why: 'أرضية حجرية رمادية محايدة وجدران رملية فاتحة (حرارة متقاربة)، أثاث بلون الفحم الأزرق ٣٠٪ ولمسة عنبرية ١٠٪ مقابلة له على العجلة اللونية [1].',
      wall: '#e8e4da', wallPrivate: '#e6e1d6', wallService: '#e9e6de', wallWet: '#ebeae5', floors: { public: 'marbleGrey', private: 'woodAsh', kitchen: 'tileSlate', wet: 'tileSlate', entrance: 'marbleGrey' }, wetWall: 'tileLargeGrey', band: 'tileLargeGrey',
      accentWall: { color: '#8d9288' }, main: '#4b5a5c', mainAlt: '#a9b3b0', accent: '#c28a3e', accent2: '#e0cfa4', woodDark: '#3f342c', woodMid: '#8c7258', woodLight: '#b9a083', metal: 'chrome', curtain: '#cfd0c8', rug: '#bdbcb2', duvet: '#e4e3dc', leather: '#463c34' },
  ],
  classic: [
    { id: 'k-ivory-burgundy', ar: 'عاجي مع عنّابي وذهبي', why: 'جدران عاجية (60٪) فوق رخام بيج أدكن منها بدرجة، أثاث بلون العنّاب المكتوم ٣٠٪ ولمسة ذهبية ١٠٪؛ العنّابي غير مشبع فلا يصادم الأرضية الدافئة، وكريمي+ذهبي من توصيات المجلس العصري [2].',
      wall: '#f3ecdd', wallPrivate: '#f0e8d8', wallService: '#f0eadd', wallWet: '#f0ece2', floors: { public: 'marbleBeige', private: 'woodWalnut', kitchen: 'tileSand', wet: 'tileSand', entrance: 'marbleBeige' }, wetWall: 'subwaySand', band: 'subwaySand',
      accentWall: { color: '#e4d7bd' }, main: '#74423f', mainAlt: '#a1805f', accent: '#b8923f', accent2: '#e2d2ae', woodDark: '#432a1c', woodMid: '#6e4730', woodLight: '#a77d53', metal: 'brass', curtain: '#8c5b4c', rug: '#a98866', duvet: '#eadfc9', leather: '#5a3a28' },
    { id: 'k-ivory-sage', ar: 'عاجي مع أخضر مريمي', why: 'العاج الدافئ والرخام البيج يشكّلان ٦٠٪، والأثاث بأخضر مريمي مكتوم ٣٠٪ يوازن الدفء، ولمسة ذهب نحاسي ١٠٪ تربط الثريات بالمقابض.',
      wall: '#f2ebdb', wallPrivate: '#efe7d6', wallService: '#efe9dc', wallWet: '#f0ece1', floors: { public: 'marbleBeige', private: 'woodWalnut', kitchen: 'tileSand', wet: 'tileSand', entrance: 'marbleBeige' }, wetWall: 'subwaySand', band: 'subwaySand',
      accentWall: { color: '#e3d8bf' }, main: '#5f6b55', mainAlt: '#9a8f6f', accent: '#ab8340', accent2: '#e4d6b2', woodDark: '#41291b', woodMid: '#6b452e', woodLight: '#a47a50', metal: 'brass', curtain: '#8d8566', rug: '#a99d78', duvet: '#e8dfc8', leather: '#5b3b29' },
    { id: 'k-ivory-navy', ar: 'عاجي مع كحلي', why: 'أزرق كحلي هادئ ٣٠٪ فوق قاعدة عاجية دافئة ٦٠٪ (تضاد حرارة محسوب في الأثاث فقط، لا في الأسطح الكبيرة)، ولمسة ذهبية ١٠٪.',
      wall: '#f3ecde', wallPrivate: '#f0e9da', wallService: '#f0eadd', wallWet: '#f1ede3', floors: { public: 'marbleBeige', private: 'woodWalnut', kitchen: 'tileSand', wet: 'tileSand', entrance: 'marbleBeige' }, wetWall: 'subwaySand', band: 'subwaySand',
      accentWall: { color: '#e5d9c1' }, main: '#3f506b', mainAlt: '#7e8896', accent: '#b6903f', accent2: '#e6d8b6', woodDark: '#3e281b', woodMid: '#6a452d', woodLight: '#a47a50', metal: 'brass', curtain: '#55657c', rug: '#a8987a', duvet: '#e9e0cc', leather: '#4a3224' },
  ],
  najdi: [
    { id: 'n-clay-sadu', ar: 'طيني مع أحمر سدو', why: 'جدران بلون الطين/الجص الرملي ٦٠٪ (الطين مادة البناء البارزة في نجد [3])، بلاط إسمنتي ترابي، جلسات بلون الجمل ٣٠٪، ولمسة حمراء ١٠٪ فقط في الوسائد والسجاد كخطوط السدو؛ لا قماش أحمر كبير فوق أرضية ترابية. درجات اللون توضيحية.',
      wall: '#e5d2b2', wallPrivate: '#e3d0b0', wallService: '#e6d6b9', wallWet: '#e8dcc3', floors: { public: 'cementNajdi', private: 'woodNatural', kitchen: 'tileSand', wet: 'tileSand', entrance: 'cementNajdi' }, wetWall: 'subwaySand', band: 'subwaySand',
      accentWall: { preset: 'ashlarNajdi' }, main: '#8b6a4a', mainAlt: '#b99a72', accent: '#9a3d2e', accent2: '#2e2a26', woodDark: '#3b2418', woodMid: '#6a4228', woodLight: '#a98055', metal: 'brass', curtain: '#8d5f40', rug: '#9a5a3e', duvet: '#dfd0b0', leather: '#5a3724' },
    { id: 'n-terracotta-indigo', ar: 'تيراكوتا مع نيلي', why: 'أرضية تيراكوتا هي اللون المشبع الوحيد الكبير؛ فيحمل الأثاث لونًا كريميًا/رمليًا ٣٠٪ فلا يتشابه معها، واللمسة نيلية ١٠٪ على الطرف المقابل في العجلة اللونية. درجات توضيحية.',
      wall: '#f0e5cf', wallPrivate: '#eee2cb', wallService: '#eadfc8', wallWet: '#ece2cd', floors: { public: 'terracotta', private: 'woodNatural', kitchen: 'terracotta', wet: 'tileSand', entrance: 'terracotta' }, wetWall: 'subwaySand', band: 'subwaySand',
      accentWall: { preset: 'ashlarNajdi' }, main: '#c9b08a', mainAlt: '#b89c72', accent: '#2f4a68', accent2: '#8a3a2c', woodDark: '#38231a', woodMid: '#69432a', woodLight: '#a77f56', metal: 'brass', curtain: '#b79a70', rug: '#b9a07a', duvet: '#e1d4b6', leather: '#5a3724' },
    { id: 'n-sand-palm', ar: 'رملي مع أخضر نخيلي', why: 'الرملي الفاتح للجدران والأرضية (٦٠٪)، أثاث بلون التمر/البني ٣٠٪ مع خشب داكن، ولمسة أخضر زيتي مكتوم ١٠٪ تذكّر بالنخيل. توضيحي؛ ربطه بتراث محدد غير متحقق.',
      wall: '#ebdfc6', wallPrivate: '#e9dcc2', wallService: '#ebe1cb', wallWet: '#ede4d0', floors: { public: 'woodNatural', private: 'woodWalnut', kitchen: 'tileSand', wet: 'tileSand', entrance: 'cementNajdi' }, wetWall: 'subwaySand', band: 'subwaySand',
      accentWall: { preset: 'ashlarNajdi' }, main: '#7b5a3e', mainAlt: '#a88a62', accent: '#4e6a4a', accent2: '#b5573a', woodDark: '#35211a', woodMid: '#5e3b27', woodLight: '#9b7550', metal: 'brass', curtain: '#9a7a52', rug: '#a4724a', duvet: '#e0d2b3', leather: '#4f3222' },
  ],
  luxury: [
    { id: 'l-champagne-bronze', ar: 'شامبانيا مع برونزي', why: 'رخام أبيض وجدران شامبانيا ٦٠٪ بلون أغمق من الأرضية قليلًا ليظهر الحد بينهما، أثاث تاوبي برونزي ٣٠٪ ولمسة ذهبية ١٠٪؛ كريمي+ذهبي من أنماط المجلس العصري [2].',
      wall: '#ddd1ba', wallPrivate: '#dbcfb7', wallService: '#e0d6c2', wallWet: '#e3dbc9', floors: { public: 'marbleWhite', private: 'woodWalnut', kitchen: 'marbleBeige', wet: 'marbleWhite', entrance: 'marbleWhite' }, wetWall: 'marbleWall', band: 'marbleWall',
      accentWall: { preset: 'marbleWall' }, main: '#85735b', mainAlt: '#b3a389', accent: '#b0883a', accent2: '#e4d8bc', woodDark: '#30211a', woodMid: '#5d4030', woodLight: '#b09270', metal: 'brass', curtain: '#a89a80', rug: '#c7baa0', duvet: '#efe8d8', leather: '#3b2a20' },
    { id: 'l-marble-emerald', ar: 'رخام مع أخضر زمردي', why: 'أرضية رخام بيج وجدران فاتحة ٦٠٪ وأثاث أخضر زمردي عميق ٣٠٪؛ الأخضر الداكن غير مشبع (ينسجم مع العروق الذهبية)، ولمسة ذهبية ١٠٪.',
      wall: '#efe7d6', wallPrivate: '#f1e9d9', wallService: '#eee6d6', wallWet: '#ebe4d4', floors: { public: 'marbleBeige', private: 'marbleBeige', kitchen: 'marbleBeige', wet: 'marbleBeige', entrance: 'marbleDark' }, wetWall: 'marbleWall', band: 'marbleWall',
      accentWall: { preset: 'marbleWall' }, main: '#34564c', mainAlt: '#a0ad9f', accent: '#bf9b4a', accent2: '#e6dac0', woodDark: '#2f2018', woodMid: '#5a3e2e', woodLight: '#ad8f6c', metal: 'brass', curtain: '#4e6b5f', rug: '#bdb399', duvet: '#eee7d6', leather: '#3b2a20' },
    { id: 'l-pearl-slate', ar: 'لؤلؤي مع أزرق أردوازي', why: 'تدرج رمادي لؤلؤي بارد متسق (جدران وأرضية في الجهة الباردة معًا، لا دفء مختلط)، أثاث أزرق أردوازي ٣٠٪ ولمسة ذهب شاحب ١٠٪.',
      wall: '#dedfdb', wallPrivate: '#dcdedb', wallService: '#e1e2de', wallWet: '#e4e5e2', floors: { public: 'marbleGrey', private: 'marbleGrey', kitchen: 'marbleGrey', wet: 'marbleGrey', entrance: 'marbleDark' }, wetWall: 'marbleWallGrey', band: 'marbleWallGrey',
      accentWall: { color: '#c5c9c8' }, main: '#4d5c6e', mainAlt: '#8794a0', accent: '#bd9d5c', accent2: '#e9e4d4', woodDark: '#2e2a28', woodMid: '#5b5148', woodLight: '#a39683', metal: 'brass', curtain: '#a1abb3', rug: '#b9bec0', duvet: '#eceeec', leather: '#38312c' },
  ],
  dark: [
    { id: 'd-charcoal-copper', ar: 'فحمي مع نحاسي', why: 'جدران رمادية فاتحة ٦٠٪ مع أرضية أنثراسايت (فرق لمعان كبير)، أثاث بلون الرمادي الدافئ ٣٠٪ ولمسة نحاسية ١٠٪ تدفئ الفحم؛ الأسود معدن/إطارات لا مساحات.',
      wall: '#dad9d4', wallPrivate: '#d7d6d1', wallService: '#dedcd8', wallWet: '#e0dfdc', floors: { public: 'porcelainAnthracite', private: 'woodAsh', kitchen: 'porcelainAnthracite', wet: 'porcelainAnthracite', entrance: 'marbleDark' }, wetWall: 'tileLargeDark', band: 'tileLargeDark',
      accentWall: { preset: 'flutedDark' }, cabinet: '#30343a', main: '#8d867b', mainAlt: '#b3ab9f', accent: '#b4703a', accent2: '#e0d7c8', woodDark: '#2c211b', woodMid: '#5a4232', woodLight: '#9b7c5a', metal: 'black', curtain: '#6b6862', rug: '#7a756c', duvet: '#d7d5cf', leather: '#2e2723' },
    { id: 'd-forest-brass', ar: 'أخضر غابي مع نحاسي أصفر', why: 'جدران رمادية دافئة وأرضية خشب رمادي، أثاث أخضر غابي داكن ٣٠٪ (محايد تقريبًا في اللمعان) ولمسة نحاس أصفر ١٠٪.',
      wall: '#dbdad3', wallPrivate: '#d8d7d0', wallService: '#dfddd7', wallWet: '#e0dfda', floors: { public: 'woodAsh', private: 'woodAsh', kitchen: 'porcelainAnthracite', wet: 'porcelainAnthracite', entrance: 'marbleDark' }, wetWall: 'tileLargeDark', band: 'tileLargeDark',
      accentWall: { preset: 'flutedDark' }, cabinet: '#2c3a33', main: '#35493f', mainAlt: '#b4c0b3', accent: '#c19a55', accent2: '#e2dccd', woodDark: '#2c211b', woodMid: '#5b4535', woodLight: '#9b805f', metal: 'black', curtain: '#4a5a4f', rug: '#8a8577', duvet: '#d8d8d2', leather: '#2e2723' },
    { id: 'd-ink-ochre', ar: 'حبري مع أوكر', why: 'درجة أزرق حبري داكن ٣٠٪ فوق جدران رمادية فاتحة وأرضية خشب جوزي؛ لمسة أوكر ١٠٪ هي المقابل الدافئ للأزرق فيبقى المشهد متزنًا.',
      wall: '#dad9d4', wallPrivate: '#d7d6d1', wallService: '#dedcd8', wallWet: '#e0dfdc', floors: { public: 'woodWalnut', private: 'woodWalnut', kitchen: 'porcelainAnthracite', wet: 'porcelainAnthracite', entrance: 'marbleDark' }, wetWall: 'tileLargeDark', band: 'tileLargeDark',
      accentWall: { preset: 'flutedDark' }, cabinet: '#2d3442', main: '#62718c', mainAlt: '#8e99ad', accent: '#bf8a3a', accent2: '#e0d8c6', woodDark: '#2c211b', woodMid: '#5a4232', woodLight: '#9b7c5a', metal: 'black', curtain: '#566176', rug: '#7b7a76', duvet: '#d6d6d1', leather: '#2e2723' },
  ],
});

const FLOOR_FAMILIES = ['public', 'private', 'kitchen', 'wet', 'entrance'];

/** Colour check of a whole palette: the dry public rooms, the bedrooms (their own floor and wall), the kitchen and the bathrooms. */
export function checkPalette(p) {
  const issues = [], seen = new Set();
  const floorHex = id => { const s = FLOOR_PRESETS[id]; return s ? presetColor(s) : null; };
  const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  const add = (tag, r) => { for (const i of r.issues) { const t = `${tag}: ${i}`; if (!seen.has(t)) { seen.add(t); issues.push(t); } } };
  // bedrooms: the upholstery that matters is the (lighter) headboard / bench colour `mainAlt`
  const base = { main: p.main, accent: p.accent, curtain: p.curtain, rug: p.rug };
  for (const fam of ['public', 'private', 'entrance']) {
    const fid = p.floors?.[fam], f = floorHex(fid); if (!f) { issues.push(`أرضية غير معروفة (${fam}): ${fid}`); continue; }
    const wall = fam === 'private' ? p.wallPrivate : p.wall;
    add(fam, checkColors({ ...base, main: fam === 'private' ? p.mainAlt : p.main, wall, floor: hex(f), floorKind: FLOOR_PRESETS[fid].p }));
  }
  // kitchen / bath: the floor must agree with the splash-back / wall tile in temperature and lightness (they are the two big planes of the room)
  for (const [fam, tile, wall] of [['kitchen', p.band, p.wallService], ['wet', p.wetWall, p.wallWet]]) {
    const fid = p.floors?.[fam], f = floorHex(fid), t = WALL_PRESETS[tile]; if (!f || !t) { issues.push(`أرضية/بلاط غير معروف (${fam})`); continue; }
    const tc = hex(presetColor(t));
    add(fam, checkColors({ wall: tc, floor: hex(f), floorKind: FLOOR_PRESETS[fid].p, skipFurniture: true }));
  }
  for (const f of FLOOR_FAMILIES) if (!FLOOR_PRESETS[p.floors?.[f]]) issues.push('أرضية ناقصة: ' + f);
  if (!p.why || p.why.length < 20) issues.push('سطر «لماذا هذه الألوان» ناقص');
  return { ok: issues.length === 0, issues };
}

export const PALETTE_IDS = Object.freeze(Object.values(PALETTES).flat().map(p => p.id));
export const palettesOf = themeId => PALETTES[themeId] || PALETTES.contemporary;
export const paletteById = id => Object.values(PALETTES).flat().find(p => p.id === id) || null;
