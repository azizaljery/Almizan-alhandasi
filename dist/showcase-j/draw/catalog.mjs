// Names, colours and default sizes used by the drawing studio, the 3D builder and the assistant.
// Arabic labels live here so every surface says the same thing.

export const ROOM_TYPES = Object.freeze({
  bedroom:   { ar: 'غرفة نوم',      color: '#e8dcc8', floor: 'wood',   wet: false, habitable: true,  minArea: 9,   minWidth: 2.7, windowRequired: true },
  master:    { ar: 'غرفة نوم رئيسية', color: '#e6d6bd', floor: 'wood',   wet: false, habitable: true,  minArea: 14,  minWidth: 3.2, windowRequired: true },
  majlis:    { ar: 'مجلس',          color: '#ead9bb', floor: 'marble', wet: false, habitable: true,  minArea: 16,  minWidth: 3.2, windowRequired: true },
  living:    { ar: 'صالة معيشة',     color: '#efe3cc', floor: 'marble', wet: false, habitable: true,  minArea: 14,  minWidth: 3.2, windowRequired: true },
  dining:    { ar: 'غرفة طعام',      color: '#ecdcc0', floor: 'marble', wet: false, habitable: true,  minArea: 10,  minWidth: 2.8, windowRequired: false },
  kitchen:   { ar: 'مطبخ',          color: '#dfe6df', floor: 'tile',   wet: true,  habitable: true,  minArea: 7,   minWidth: 2.2, windowRequired: true },
  bath:      { ar: 'دورة مياه',      color: '#d6e4ea', floor: 'wet',    wet: true,  habitable: false, minArea: 2.5, minWidth: 1.2, windowRequired: false },
  laundry:   { ar: 'غرفة غسيل',      color: '#d9e3e6', floor: 'wet',    wet: true,  habitable: false, minArea: 3,   minWidth: 1.5, windowRequired: false },
  storage:   { ar: 'مخزن',          color: '#e3ddd3', floor: 'tile',   wet: false, habitable: false, minArea: 2,   minWidth: 1.2, windowRequired: false },
  service:   { ar: 'غرفة خدمة',      color: '#e0dccf', floor: 'tile',   wet: false, habitable: true,  minArea: 7,   minWidth: 2.2, windowRequired: true },
  office:    { ar: 'مكتب',          color: '#e5dfd0', floor: 'wood',   wet: false, habitable: true,  minArea: 8,   minWidth: 2.4, windowRequired: true },
  corridor:  { ar: 'ممر',           color: '#efeae0', floor: 'tile',   wet: false, habitable: false, minArea: 2,   minWidth: 1.0, windowRequired: false },
  entrance:  { ar: 'مدخل',          color: '#ece3d3', floor: 'marble', wet: false, habitable: false, minArea: 3,   minWidth: 1.4, windowRequired: false },
  stairs:    { ar: 'سلم',           color: '#ddd6c8', floor: 'tile',   wet: false, habitable: false, minArea: 4,   minWidth: 1.0, windowRequired: false },
  balcony:   { ar: 'شرفة',          color: '#e4ebe0', floor: 'tile',   wet: false, habitable: false, minArea: 3,   minWidth: 1.2, windowRequired: false, open: true },
  courtyard: { ar: 'فناء داخلي',     color: '#d7e3cf', floor: 'grass',  wet: false, habitable: false, minArea: 6,   minWidth: 2.0, windowRequired: false, open: true },
  garage:    { ar: 'مواقف سيارات',   color: '#dcdcdc', floor: 'concrete', wet: false, habitable: false, minArea: 15, minWidth: 2.7, windowRequired: false },
  // فراغ مزدوج الارتفاع في دور علوي (فوق بهو المدخل أو الصالة): لا أرضية في دوره، ولا سقف للفراغ الذي تحته؛ يحده درابزين
  void:      { ar: 'فراغ مزدوج الارتفاع', color: '#f6f3ec', floor: 'tile', wet: false, habitable: false, minArea: 0, minWidth: 0, windowRequired: false, void: true },
  other:     { ar: 'غير محدد',       color: '#f1ede4', floor: 'tile',   wet: false, habitable: false, minArea: 0,   minWidth: 0,   windowRequired: false },
});
export const roomTypeName = type => (ROOM_TYPES[type] || ROOM_TYPES.other).ar;
export const isRoomType = type => Object.hasOwn(ROOM_TYPES, type);

/** Legacy planner types (bedroom, majlis ...) are a subset, so generated plans import unchanged. */
export const LEGACY_TYPES = ['bedroom', 'majlis', 'living', 'dining', 'kitchen', 'bath', 'storage', 'service', 'corridor'];

export const OPENING_KINDS = Object.freeze({
  door:    { ar: 'باب',          w: .9,  h: 2.1, sill: 0,    min: .6 },
  door2:   { ar: 'باب مزدوج',    w: 1.5, h: 2.1, sill: 0,    min: 1.2 },
  window:  { ar: 'نافذة',        w: 1.4, h: 1.2, sill: 1.0,  min: .4 },
  window2: { ar: 'نافذة كبيرة',  w: 2.2, h: 1.5, sill: .8,   min: 1.2 },
  slider:  { ar: 'باب منزلق زجاجي', w: 2.4, h: 2.2, sill: 0, min: 1.2 },
  arch:    { ar: 'فتحة مفتوحة',   w: 1.6, h: 2.3, sill: 0,    min: .8 },
  garage:  { ar: 'باب مرآب',     w: 4.8, h: 2.4, sill: 0,    min: 2.4 },
});
export const isDoorKind = kind => ['door', 'door2', 'slider', 'arch', 'garage'].includes(kind);

export const FIXTURES = Object.freeze({
  'bed-double': { ar: 'سرير مزدوج', w: 1.8, d: 2.1, h: .55, rooms: ['bedroom', 'master'] },
  'bed-single': { ar: 'سرير مفرد',  w: 1.0, d: 2.0, h: .5,  rooms: ['bedroom'] },
  wardrobe:     { ar: 'دولاب',      w: 2.0, d: .6,  h: 2.2, rooms: ['bedroom', 'master'] },
  nightstand:   { ar: 'كومودينو',   w: .5,  d: .4,  h: .5,  rooms: ['bedroom', 'master'] },
  desk:         { ar: 'مكتب عمل',   w: 1.4, d: .7,  h: .75, rooms: ['office', 'bedroom'] },
  'sofa-3':     { ar: 'كنبة ثلاثية', w: 2.2, d: .95, h: .85, rooms: ['living', 'majlis'] },
  'sofa-2':     { ar: 'كنبة ثنائية', w: 1.6, d: .9,  h: .85, rooms: ['living', 'majlis'] },
  armchair:     { ar: 'كرسي صالة',  w: .85, d: .85, h: .85, rooms: ['living', 'majlis'] },
  'coffee-table': { ar: 'طاولة وسط', w: 1.1, d: .6, h: .4, rooms: ['living', 'majlis'] },
  'tv-unit':    { ar: 'وحدة تلفاز', w: 1.8, d: .45, h: .5, rooms: ['living', 'majlis', 'bedroom', 'master'] },
  'majlis-sofa': { ar: 'جلسة عربية', w: 2.0, d: .8, h: .45, rooms: ['majlis'] },
  'dining-table': { ar: 'طاولة طعام', w: 1.8, d: .95, h: .76, rooms: ['dining', 'kitchen'] },
  chair:        { ar: 'كرسي',       w: .45, d: .45, h: .9,  rooms: ['dining', 'office'] },
  'kitchen-run': { ar: 'وحدة مطبخ',  w: 2.4, d: .6, h: .9,  rooms: ['kitchen'] },
  fridge:       { ar: 'ثلاجة',      w: .75, d: .7,  h: 1.8, rooms: ['kitchen'] },
  stove:        { ar: 'موقد',       w: .6,  d: .6,  h: .9,  rooms: ['kitchen'] },
  wc:           { ar: 'مرحاض',      w: .4,  d: .7,  h: .8,  rooms: ['bath'] },
  basin:        { ar: 'مغسلة',      w: .6,  d: .45, h: .85, rooms: ['bath'] },
  shower:       { ar: 'دش',         w: .9,  d: .9,  h: 2.0, rooms: ['bath'] },
  bathtub:      { ar: 'حوض استحمام', w: .8,  d: 1.7, h: .55, rooms: ['bath'] },
  'washing-machine': { ar: 'غسالة', w: .6,  d: .6,  h: .85, rooms: ['laundry', 'bath', 'kitchen'] },
  plant:        { ar: 'نبتة',       w: .4,  d: .4,  h: 1.1, rooms: [] },
  rug:          { ar: 'سجادة',      w: 2.4, d: 1.7, h: .02, rooms: [] },
  car:          { ar: 'سيارة',      w: 1.9, d: 4.6, h: 1.5, rooms: ['garage'] },
  tree:         { ar: 'شجرة',       w: 2.0, d: 2.0, h: 3.5, rooms: ['courtyard'] },
});
export const fixtureName = kind => FIXTURES[kind]?.ar || kind;

export const STAIR_KINDS = Object.freeze({ straight: 'سلم مستقيم', L: 'سلم على شكل L', U: 'سلم على شكل U' });
export const WALL_KINDS = Object.freeze({ wall: 'جدار', parapet: 'حاجز / سور سطح', fence: 'سور' });
export const WALL_DEFAULTS = Object.freeze({ exterior: .25, interior: .12, thickness: .2 });
export const LEVEL_DEFAULT_HEIGHT = 3.2;
export const PLOT_ENTRIES = Object.freeze({ s: 'جنوب', n: 'شمال', e: 'شرق', w: 'غرب' });

export default { ROOM_TYPES, OPENING_KINDS, FIXTURES, STAIR_KINDS, WALL_KINDS, WALL_DEFAULTS, LEVEL_DEFAULT_HEIGHT, PLOT_ENTRIES };
