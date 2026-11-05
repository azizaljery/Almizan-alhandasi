// نمط سلماني (S): إعادة تفسير معاصرة مهذّبة للجذر النجدي، مبنية على السمات الموثّقة فقط (انظر meta.sources و meta.verified/unverified).
// المحقَّق (مصادر ثانوية متقاطعة، لا نصًا رسميًا للميثاق): لوحة ترابية رملية/بيج/ثقيلة غير لامعة؛ حجر جيري محلي بملمس خشن؛ فتحات غائرة عميقة (ظل وتجويف)؛
// أكاليل مثلثية على الأطراف وفوق المدخل فقط (وليس على امتداد الواجهة) بمقياس 30–50 سم وبُعد قمة-قمة = ضعف القاعدة؛ كتل مدرّجة أفقية؛
// حجب/تظليل مُثقَّب (مشربية هندسية) بدل الزجاج الكامل؛ زخرفة مقتصدة؛ أفنية مظلّلة (خارج نطاق الواجهة).
// ممنوع: تحريك جدار أو فتحة أو منسوب. الإضافات أمام وجه الجدار فقط وبروزها 15–25 سم. لا أصول خارجية: كل الخامات Canvas إجرائية.
export const meta = {
  id: 'S', ar: 'سلماني',
  sources: [
    { t: 'سعوديبيديا: العمارة السلمانية', u: 'https://saudipedia.com/article/6088', note: 'تعريف عام: نمط عمراني الرياض مستلهم من التراث؛ لا تفاصيل واجهة' },
    { t: 'المدينة: العمارة السلمانية الأصالة والحداثة', u: 'https://www.al-madina.com/article/1006593', note: 'القيم الست وعدم نسخ الأشكال؛ التظليل والخصوصية والخامات المحلية' },
    { t: 'MDPI Buildings 15(24):4531 Socio-Cultural Sustainability in Contemporary Saudi Architecture', u: 'https://www.mdpi.com/2075-5309/15/24/4531', note: 'كتل مكعبة مبنية بالحجر، تمفصل رأسي، شرفات (شرفات نجدية) مزخرفة، تظليل رمزي، لبن/لياسة' },
    { t: 'Heyazah: Riyadh New Architectural Identity (Salmani vs Contemporary Najdi)', u: 'https://heyazah.com/en/articles/riyadh-architectural-identity-salmani-style', note: 'مقالة ثانوية: بيج/رملي/بني رمادي، كتل مدرّجة، أكاليل مثلثية 30–50 سم عند الأطراف والمداخل، فتحات عميقة، زجاج محدود' },
    { t: 'عقارماب: العمارة السلمانية في السعودية', u: 'https://blog.aqarmap.sa/ar/salmani-architecture-saudi-arabia/', note: 'نوافذ عميقة، مشربيات/فتحات مزخرفة، أقواس مداخل، زخرفة متزنة، حجر وطين' },
    { t: 'Business Today ME: Salmani design guidelines', u: 'https://businesstoday.me/design/what-specific-design-guidelines-define-the-salmani-architecture-movement/', note: 'ثانوي: حجر جيري كثيف خشن، لوحة أوكر/بيج رملي/تيراكوتا مطفأة، فتحات غائرة، حجب مشربية، منع زجاج عاكس' },
  ],
  verified: ['لوحة ترابية رملية مطفأة', 'حجر جيري خشن غير لامع', 'فتحات غائرة عميقة', 'أكاليل مثلثية عند الأطراف والمدخل فقط (مصدر ثانوي واحد للأرقام)', 'كتل مدرّجة', 'حجب مُثقَّب بنمط هندسي', 'زخرفة مقتصدة'],
  unverified: ['قاعدة حجرية (سوكل) داكنة', 'أحزمة مداميك عند البلاطات', 'فواصل/قواعد المدخل وشكل البوابة', 'فوانيس الجدار', 'لون البرونز للإطارات', 'قيم النسب الدقيقة (عرض التجويف، ارتفاع الأبراج)'],
};

const CLASSIC = new Set(['projection', 'surround', 'cornice', 'sill', 'pediment']);
const SIDES = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const mulb = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const texOf = (THREE, renderer, c, srgb, rep) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
function noise2(seed) { const P = new Float32Array(512 * 512), r = mulb(seed); for (let i = 0; i < P.length; i++) P[i] = r();
  const h = (x, y) => P[((y & 511) << 9) | (x & 511)], f = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), u = f(x - X), v = f(y - Y); return h(X, Y) * (1 - u) * (1 - v) + h(X + 1, Y) * u * (1 - v) + h(X, Y + 1) * (1 - u) * v + h(X + 1, Y + 1) * u * v; };
  return (x, y, oct = 4) => { let s = 0, a = .5, k = 1, t = 0; for (let o = 0; o < oct; o++) { s += a * n(x * k + o * 17.3, y * k - o * 9.1); t += a; a *= .5; k *= 2.03; } return s / t; }; }

// لوحات ترابية (أساس الحجر، حجر العناصر المميزة، البرونز). مصدر الألوان: وصف «بيج ترابي، رمل فاتح، بني حمامي» (ثانوي)؛ القيم الدقيقة قرار تصميمي.
const PALETTES = [
  { name: 'رمل', base: [236, 216, 182], accent: [212, 186, 148], joint: '#a89270', bronze: '#4a3b2c', wood: '#5a3d28' },
  { name: 'بيج فاتح', base: [240, 228, 204], accent: [218, 200, 168], joint: '#b0a085', bronze: '#3f372f', wood: '#6a4a33' },
  { name: 'أوكر حجري', base: [226, 198, 152], accent: [198, 164, 118], joint: '#9a8059', bronze: '#3b2e22', wood: '#4f3322' },
  { name: 'بني حمامي', base: [214, 198, 178], accent: [184, 164, 142], joint: '#8e7e69', bronze: '#392f29', wood: '#4a3425' },
];

/** حجر جيري رملي: القماش 2.4×1.2 م (4×4 بلاطات 60×30 مع إزاحة نصف بلاطة للمدماك الفردي، كما في blockGrid). joints=true يرسم فواصل 1 سم للعناصر المضافة. */
function stoneMat(THREE, renderer, pal, { joints = false, tone = 1, seed = 3, name = 'sandstone-S' } = {}) {
  const PX = 512, W = PX * 2.4 | 0, H = PX * 1.2 | 0, [c, x] = cnv(W, H), [bc, bx] = cnv(W, H), N = noise2(seed), N2 = noise2(seed + 41), r = mulb(seed * 7 + 1);
  const img = x.createImageData(W, H), bim = bx.createImageData(W, H), d = img.data, bd = bim.data, tones = [];
  for (let i = 0; i < 64; i++) tones.push({ k: 1 + (r() - .5) * .09, w: (r() - .5) * 9, g: (r() - .5) * .03 });
  for (let py = 0; py < H; py++) { const yv = (H - 1 - py) / PX, row = Math.floor(yv / .3), off = (row & 1) * .3, ry = yv - row * .3;
    for (let px = 0; px < W; px++) { const xu = px / PX, xo = ((xu - off) % 2.4 + 2.4) % 2.4, col = Math.floor(xo / .6), rx = xo - col * .6, b = tones[(row & 3) * 4 + (col & 3)];
      const X = xu * 1.0, Y = yv * 1.0;
      const cloud = N(X * 1.3, Y * 1.3, 4), grain = N2(X * 38, Y * 38, 2), mid = N(X * 9 + 3, Y * 9, 3), bed = N2(X * 1.2, Y * 26, 3);
      let k = b.k * tone * (.95 + (cloud - .5) * .11 + (mid - .5) * .07 + (grain - .5) * .075 + (bed - .5) * .06);
      // فاصل (مدماك) مرسوم فقط للعناصر المضافة
      let jn = 0; if (joints) { const e = Math.min(rx, .6 - rx, ry, .3 - ry); if (e < .005) jn = 1 - e / .005; }
      k *= 1 - jn * .22;
      const i = (py * W + px) * 4, B = pal.base;
      d[i] = Math.min(255, B[0] * k + b.w); d[i + 1] = Math.min(255, B[1] * k + b.w * .8); d[i + 2] = Math.min(255, B[2] * k * (1 - jn * .02) + b.w * .5); d[i + 3] = 255;
      const bump = 150 + (grain - .5) * 110 + (mid - .5) * 70 - jn * 90; bd[i] = bd[i + 1] = bd[i + 2] = Math.max(0, Math.min(255, bump)); bd[i + 3] = 255; } }
  x.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  // نقر دقيقة (مسامات الحجر)
  for (let k = 0; k < 2600; k++) { const px = r() * W, py = r() * H, s = .6 + r() * 1.6; x.fillStyle = `rgba(70,52,34,${.10 + r() * .16})`; x.beginPath(); x.ellipse(px, py, s, s * (.6 + r() * .6), r() * 3, 0, 6.3); x.fill();
    bx.fillStyle = 'rgba(0,0,0,.35)'; bx.beginPath(); bx.ellipse(px, py, s, s * .8, 0, 0, 6.3); bx.fill(); }
  const rep = [1 / 2.4, 1 / 1.2], map = texOf(THREE, renderer, c, true, rep), bump = texOf(THREE, renderer, bc, false, rep);
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: .9, roughness: .96, metalness: 0, envMapIntensity: .35 }); m.name = name; return m; }

/** حجب مُثقَّب بمثلثات (alphaMap): صفوف مثلثات متبادلة (قمة لأعلى/لأسفل)، أبعاد الخلية بالمتر على الخريطة المكررة. */
function screenAlpha(THREE, renderer, motif) { const [c, x] = cnv(256, 256); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#000';
  const tri = (cx, cy, w, h, up) => { x.beginPath(); if (up) { x.moveTo(cx - w / 2, cy + h / 2); x.lineTo(cx + w / 2, cy + h / 2); x.lineTo(cx, cy - h / 2); } else { x.moveTo(cx - w / 2, cy - h / 2); x.lineTo(cx + w / 2, cy - h / 2); x.lineTo(cx, cy + h / 2); } x.closePath(); x.fill(); };
  if (motif === 0) { for (const [cx, cy, up] of [[64, 64, 1], [192, 64, 0], [64, 192, 0], [192, 192, 1]]) tri(cx, cy, 78, 78, up); }
  else { for (const [cx, cy] of [[64, 64], [192, 192]]) { tri(cx, cy - 22, 64, 44, 1); tri(cx, cy + 22, 64, 44, 0); } // معين من مثلثين متقابلين
    for (const [cx, cy] of [[192, 64], [64, 192]]) { x.fillRect(cx - 10, cy - 10, 20, 20); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function aoTexture(THREE) { const [c, x] = cnv(4, 128), g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, '#fff'); g.addColorStop(.25, '#8a8a8a'); g.addColorStop(.6, '#262626'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); }

function bandLevels() { const L = globalThis.__FLOORS?.levels; if (!Array.isArray(L) || !L.length) return [3.55];
  return L.map(l => typeof l === 'number' ? l : l.top ?? ((l.elevation ?? 0) + (l.height ?? 3.2) + .35)).filter(Number.isFinite).sort((a, b) => a - b); }

export async function apply(THREE, { scene, renderer, S, q, doc, FI, params }) {
  const R = params?.rnd || (k => { const r = mulb(1234 + k * 977); return r(); });
  const night = q.get('night') === '1';
  const palI = Math.floor(R(31) * PALETTES.length), pal = PALETTES[q.get('pal') != null ? (+q.get('pal') | 0) % PALETTES.length : palI];
  const reg = params?.region || { e: Math.floor(R(50) * 4), r: Math.floor(R(51) * 3), t: Math.floor(R(52) * 3), p: Math.floor(R(53) * 3), c: Math.floor(R(34) * 3) }, bld = params?.building || {};
  const LIM = .20; // سقف البروز لأي عنصر مضاف: 20 سم من وجه جداره (القيد المعتمد ≤ 24 سم)
  const PRJ = Math.max(.15, Math.min(LIM - .02, Number(q.get('proj') ?? [.15, .165, .18][reg.p ?? 1]))), RW = (.12 + R(32) * .06) + (reg.t === 1 ? .04 : reg.t === 0 ? -.01 : 0); // بروز الإطار الحجري وعرض التجويف
  const crownStyle = reg.c ?? 0, portal = Math.floor(R(35) * 3), screenOn = R(36) > .12, screenLeft = R(37) > .5, motif = R(38) > .5 ? 1 : 0;
  const bandStyle = R(39) > .5 ? 1 : 0, plinthH = .38 + R(40) * .22, plinthOn = R(41) > .12, towerW = 1.0 + R(42) * .55, towerRise = .32 + R(43) * .24, entryPier = reg.t === 0 || reg.e === 0 ? R(44) > .1 : R(44) > .5, sillBlock = R(45) > .4;
  for (const m of S.meshes) if (CLASSIC.has(m.userData?.role)) m.visible = false;
  const stone = stoneMat(THREE, renderer, pal, { seed: 3 + palI }), stoneJ = stoneMat(THREE, renderer, pal, { joints: true, seed: 3 + palI, name: 'sandstone-joint-S' });
  const accent = stoneMat(THREE, renderer, { ...pal, base: pal.accent }, { joints: true, tone: .96, seed: 9 + palI, name: 'sandstone-accent-S' });
  const bronze = new THREE.MeshStandardMaterial({ color: pal.bronze, metalness: .55, roughness: .45 }); bronze.name = 'bronzeS';
  const darkWood = new THREE.MeshStandardMaterial({ color: pal.wood, roughness: .7 });
  const backing = new THREE.MeshStandardMaterial({ color: '#15100c', roughness: 1, envMapIntensity: .1 });
  const warm = new THREE.MeshStandardMaterial({ color: '#fff2d8', emissive: '#ffd79a', emissiveIntensity: night ? 5 : 1.6 });
  const renderMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...pal.base.map(v => v / 255 * .93)), roughness: 1 });
  const jointMat = new THREE.MeshStandardMaterial({ color: pal.joint, roughness: .95 });
  const alphaT = screenAlpha(THREE, renderer, motif); alphaT.repeat.set(1, 1);
  const screenMat = new THREE.MeshStandardMaterial({ color: '#7b5236', metalness: .55, roughness: .5, alphaMap: alphaT, alphaTest: .5, side: THREE.DoubleSide });
  for (const m of S.meshes) { const p = m.userData?.part; if (p === 'plate') m.material = jointMat; else if (p === 'blocks') m.material = stone; else if (m.userData?.role === 'frame') m.material = bronze; else if (p === 'wallcore' || (m.userData?.role === 'wall' && p !== 'blocks' && /render|limestone/.test(m.material?.name || ''))) m.material = renderMat; }
  const AO = aoTexture(THREE), aoMat = a => new THREE.MeshBasicMaterial({ color: '#000', alphaMap: AO, transparent: true, opacity: a * (night ? .5 : 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const box = m => new THREE.Box3().setFromObject(m), levels = bandLevels(), up = new THREE.Vector3(0, 1, 0);
  const plan = {}; let south = null;
  for (const [side, [nx, nz]] of Object.entries(SIDES)) {
    const sm = S.meshes.filter(m => m.userData?.side === side && m.visible); if (!sm.length) continue;
    const n = new THREE.Vector3(nx, 0, nz), t = new THREE.Vector3().crossVectors(up, n), basis = new THREE.Matrix4().makeBasis(t, up, n);
    const loc = b => { const us = [b.min.x * t.x + b.min.z * t.z, b.max.x * t.x + b.max.z * t.z], ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z];
      return { u0: Math.min(...us), u1: Math.max(...us), y0: b.min.y, y1: b.max.y, d0: Math.min(...ds), d1: Math.max(...ds) }; };
    // مجسم محلي (u,y,d) مع UV بالأمتار: الوجوه الأمامية (u,y)، الجانبية (d,y)، العلوية (u,d)، بمبدأ (uo,vo)
    const place = (geo, mat, u, y, d, o = {}) => { geo.translate(u, y, d); const P = geo.attributes.position, Nn = geo.attributes.normal, UV = geo.attributes.uv, uo = o.uo ?? 0, vo = o.vo ?? 0;
      for (let i = 0; i < P.count; i++) { const ax = Math.abs(Nn.getX(i)), ay = Math.abs(Nn.getY(i)), az = Math.abs(Nn.getZ(i));
        if (az >= ax && az >= ay) UV.setXY(i, P.getX(i) - uo, P.getY(i) - vo); else if (ax >= ay) UV.setXY(i, P.getZ(i), P.getY(i) - vo); else UV.setXY(i, P.getX(i) - uo, P.getZ(i)); }
      geo.applyMatrix4(basis); const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = true; scene.add(m); return m; };
    const add = (su, sy, sd, mat, u, y, d, o) => place(new THREE.BoxGeometry(su, sy, sd), mat, u, y, d, o);
    const P3 = (u, y, d) => t.clone().multiplyScalar(u).addScaledVector(n, d).setY(y);
    const ao = (a, b, away, alpha) => { const A = P3(...a), B = P3(...b), w = new THREE.Vector3().addScaledVector(t, away[0]).addScaledVector(n, away[2]).setY(away[1]);
      const g = new THREE.BufferGeometry(), v = [A, B, B.clone().add(w), A.clone().add(w)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
      const o = new THREE.Mesh(g, aoMat(alpha)); o.renderOrder = 2; scene.add(o); };
    const walls = sm.filter(m => m.userData.role === 'wall' || m.userData.role === 'cladding').map(m => loc(box(m))); if (!walls.length) continue;
    const wd = Math.max(...walls.map(w => w.d1)), face = walls.filter(w => w.d1 > wd - .1);
    const X0 = Math.min(...face.map(w => w.u0)), X1 = Math.max(...face.map(w => w.u1)), top = Math.max(...face.map(w => w.y1));
    const BH = .24, bands = levels.filter(y => y + BH < top - .05);
    const frames = sm.filter(m => m.userData.role === 'frame').map(m => ({ id: m.userData.opening, b: loc(box(m)) }));
    const fbox = (g) => (frames.find(f => f.id && f.id === g.m.userData.opening) || { b: g.b }).b;
    const gl = sm.filter(m => m.userData.role === 'glazing').map(m => ({ m, b: loc(box(m)) })), doors = sm.filter(m => m.userData.role === 'door').map(m => ({ m, b: loc(box(m)) }));
    const mains = frames.filter(f => f.b.d1 > wd - .3).map(f => f.b.d1 - wd).sort((a, b) => a - b), fo = mains.length ? mains[mains.length >> 1] : -.04; // انزياح وجه الإطار عن وجه الجدار
    const spans = []; // مدى الفتحات على الجهة (لتفادي القاعدة والحجب)
    const lanterns = [];
    // 1) إطارات الفتحات الحجرية: تجويف غائر (البروز PRJ أمام وجه الجدار، فيبدو الزجاج غائرًا). الأبواب لها بوابة خاصة بها.
    const WDmax = wd, wallFace = f => { const uc = (f.u0 + f.u1) / 2, yc = (f.y0 + f.y1) / 2, c = walls.filter(w => w.u0 - .02 <= uc && uc <= w.u1 + .02 && w.y0 - .02 <= yc && yc <= w.y1 + .02 && Math.abs(w.d1 - f.d1) < .4).map(w => w.d1); return c.length ? Math.max(...c) : f.d1 - fo; };
    const items = gl.map(g => { const f = fbox(g), wo = wallFace(f); return { f, wo, main: wo > WDmax - .3 }; }).sort((a, b) => a.f.u0 - b.f.u0);
    const thr = reg.r === 1 ? 1.1 : reg.r === 2 ? 2.4 : 0, groups = [];
    for (const it of items) { const g = groups[groups.length - 1]; const l = g && g[g.length - 1];
      if (thr && l && Math.abs(l.wo - it.wo) < .05 && it.f.u0 - l.f.u1 < thr && it.f.u0 > l.f.u1 && Math.abs(l.f.y0 - it.f.y0) < .35 && Math.abs(l.f.y1 - it.f.y1) < .35) g.push(it); else groups.push([it]); }
    for (const grp of groups) { const wo = grp[0].wo, main = grp[0].main, a = grp[0].f, z = grp[grp.length - 1].f, fw = Math.max(...grp.map(g => g.f.u1 - g.f.u0)), big = fw >= .85 || grp.length > 1,
        rw = big ? RW : .10, pr = Math.min(LIM, big ? PRJ : .12), th = big ? .06 : .04, gy0 = Math.min(...grp.map(g => g.f.y0)), gy1 = Math.max(...grp.map(g => g.f.y1));
      const x0 = a.u0 - rw, x1 = z.u1 + rw, y0 = gy0 - rw * .8, y1 = gy1 + rw, cx = (x0 + x1) / 2, mat = accent, dc = wo + pr / 2, hs = y1 - y0 - rw * .8 - rw - th, ym = (y0 + rw * .8 + y1 - rw - th) / 2;
      add(x1 - x0, rw + th, pr, mat, cx, y1 - (rw + th) / 2, dc, { uo: x0, vo: y1 }); // عتبة علوية بالعمق نفسه (≤ LIM)
      add(x1 - x0, rw * .8, pr, mat, cx, y0 + rw * .4, dc, { uo: x0, vo: y0 });
      add(rw, hs, pr, mat, x0 + rw / 2, ym, dc, { uo: x0, vo: y0 }); add(rw, hs, pr, mat, x1 - rw / 2, ym, dc, { uo: x1, vo: y0 });
      for (let k = 1; k < grp.length; k++) { const ga = grp[k - 1].f.u1, gb = grp[k].f.u0; add(gb - ga, hs, pr, mat, (ga + gb) / 2, ym, dc, { uo: ga, vo: y0 }); } // دعامة بين نافذتين (إيقاع مزدوج/مجمّع)
      if (big && (sillBlock || reg.t === 1) && gy0 > .5) add(x1 - x0 + .1, .05, Math.min(LIM, pr + .02), accent, cx, y0 - .025, wo + Math.min(LIM, pr + .02) / 2, { uo: x0, vo: y0 });
      const e = wo + .003, W = .14, al = .4; ao([x0, y1 + .01, e], [x1, y1 + .01, e], [0, W * .6, 0], al * .5); ao([x0, y0, e], [x1, y0, e], [0, -W, 0], al); ao([x0, y0, e], [x0, y1, e], [-W, 0, 0], al * .8); ao([x1, y0, e], [x1, y1, e], [W, 0, 0], al * .8);
      if (main) spans.push([x0, x1, y0, y1]); }
    // 2) بوابة المدخل: ركيزتان حجريتان وعتبة عميقة (ثلاثة أنماط من التنوّع)، وفوانيس جدارية
    let entry = null;
    for (const dr of doors) { const f = fbox(dr), wd = wallFace(f); if (wd < WDmax - .3) continue; const w = f.u1 - f.u0, pw = .24 + R(46) * .06 + (reg.t === 0 ? .1 : 0), hh = f.y1 + .22 + (portal === 1 ? .08 : 0) + (reg.t === 0 ? .1 : 0), pp = Math.min(LIM, PRJ + .03), x0 = f.u0 - pw, x1 = f.u1 + pw;
      add(pw, hh, pp, accent, x0 + pw / 2, hh / 2, wd + pp / 2, { uo: x0, vo: 0 }); add(pw, hh, pp, accent, x1 - pw / 2, hh / 2, wd + pp / 2, { uo: x1, vo: 0 });
      add(x1 - x0 + .1, .24, pp, accent, (x0 + x1) / 2, f.y1 + .12 + .02, wd + pp / 2, { uo: x0, vo: f.y1 });
      if (portal === 1) add(w + .06, .09, pp - .08, darkWood, (f.u0 + f.u1) / 2, f.y1 - .045, wd + (pp - .08) / 2 - .02, { cast: false }); // عتبة خشبية داكنة غائرة تحت الحجرية
      if (portal === 2) { add(x1 - x0 + .28, .06, pp, stoneJ, (x0 + x1) / 2, hh + .03, wd + pp / 2, { uo: x0, vo: hh }); } // غطاء بارز يلتقط الظل
      const e = wd + .003; ao([x0, hh, e], [x1, hh, e], [0, .14, 0], .22); ao([x0, 0, e], [x0, hh, e], [-.14, 0, 0], .3); ao([x1, 0, e], [x1, hh, e], [.14, 0, 0], .3);
      for (const sx of [x0 - .32, x1 + .32]) { add(.11, .24, .1, bronze, sx, 2.05, wd + .05); add(.07, .15, .06, warm, sx, 2.05, wd + .06, { cast: false }); lanterns.push([sx, 2.05]); }
      spans.push([x0, x1, 0, hh]); entry = { f, x0, x1, hh, pp }; }
    // 3) أحزمة المداميك عند منسوب كل بلاطة (قرار تصميمي): حزمة عريضة أو خطّان رفيعان
    for (const yb of bands) { if (bandStyle) { add(X1 - X0 + .02, .16, .06, accent, (X0 + X1) / 2, yb + .08, wd + .03, { uo: X0, vo: yb }); add(X1 - X0 + .02, .05, .09, accent, (X0 + X1) / 2, yb + .205, wd + .045, { uo: X0, vo: yb }); }
      else add(X1 - X0 + .02, BH, .08, accent, (X0 + X1) / 2, yb + BH / 2, wd + .04, { uo: X0, vo: yb });
      ao([X0, yb, wd + .003], [X1, yb, wd + .003], [0, -.26, 0], .3); }
    // 4) قاعدة (سوكل) حجرية خشنة غير متصلة عند الأبواب (قرار تصميمي غير موثق)
    if (plinthOn) { const gaps = doors.map(d => fbox(d)).map(f => [f.u0 - .3, f.u1 + .3]).sort((a, b) => a[0] - b[0]); let c = X0; const segs = [];
      for (const [a, b] of gaps) { if (a > c + .2) segs.push([c, Math.min(a, X1)]); c = Math.max(c, b); } if (X1 > c + .2) segs.push([c, X1]);
      for (const [a, b] of segs) add(b - a, plinthH, .05, accent, (a + b) / 2, plinthH / 2, wd + .025, { uo: a, vo: 0 }); }
    // 5) إكليل الدروة: غطاء حجري بقطرة 6 سم
    add(X1 - X0 + .02, .06, .38, stoneJ, (X0 + X1) / 2, top + .03, wd - .12, { uo: X0, vo: top });
    // 6) ملامسة الأرض
    ao([X0, .003, wd], [X1, .003, wd], [0, 0, .5], .5); ao([X0, 0, wd + .003], [X1, 0, wd + .003], [0, .4, 0], .3);
    // 7) حجب مُثقَّب (مشربية هندسية): بجانب المدخل أمامًا، وفي أكبر فراغ خالٍ على الجهات الجانبية والخلفية
    const freeSpan = () => { const iv = spans.map(s => [s[0], s[1]]).sort((a, b) => a[0] - b[0]); let c = X0 + .3, best = [0, 0]; for (const [a, b] of iv) { if (a - c > best[1] - best[0]) best = [c, a]; c = Math.max(c, b); } if (X1 - .3 - c > best[1] - best[0]) best = [c, X1 - .3]; return best; };
    const screen = (a, b, y0, y1) => { const w = b - a, h = y1 - y0; if (w < .6 || h < 1) return; const cx = (a + b) / 2, cy = (y0 + y1) / 2, rep = [Math.max(1, Math.round(w / .56)), Math.max(1, Math.round(h / .56))];
      const tx = alphaT.clone(); tx.needsUpdate = true; tx.repeat.set(...rep); const sm2 = screenMat.clone(); sm2.alphaMap = tx; sm2.name = 'perforated-screenS';
      add(w + .08, h + .08, .03, backing, cx, cy, wd + .016, { cast: false });
      const g = new THREE.PlaneGeometry(w, h); const pm = new THREE.Mesh(g, sm2); pm.position.copy(P3(cx, cy, wd + .09)); pm.quaternion.setFromRotationMatrix(basis); pm.receiveShadow = true; scene.add(pm);
      for (const [yy, hh2] of [[y1 + .035, .07], [y0 - .035, .07]]) add(w + .14, hh2, .13, bronze, cx, yy, wd + .08); for (const xx of [a - .035, b + .035]) add(.07, h, .13, bronze, xx, cy, wd + .08);
      spans.push([a - .06, b + .06, y0, y1]); };
    const second = (bld.solidVoid ?? 0) > .82;
    if (screenOn) { if (side === 's' && entry) { const sw = .85 + R(47) * .35, a = screenLeft ? entry.x0 - .55 - sw : entry.x1 + .55, b = a + sw; if (a > X0 + .3 && b < X1 - .3 && !spans.some(s => a < s[1] && b > s[0] && s[3] > .5)) screen(a, b, .55, entry.f.y1 + .1); if (second) { const a2 = screenLeft ? entry.x1 + .55 : entry.x0 - .55 - sw, b2 = a2 + sw; if (a2 > X0 + .3 && b2 < X1 - .3 && !spans.some(s => a2 < s[1] && b2 > s[0] && s[3] > .5)) screen(a2, b2, .55, entry.f.y1 + .1); } }
      else { const [a, b] = freeSpan(); if (b - a > 1.6) { const sw = Math.min(1.3, b - a - .8), c = (a + b) / 2; screen(c - sw / 2, c + sw / 2, .55, 2.9); } } }
    plan[side] = { sm, n, t, basis, X0, X1, top, wd, place, add, P3, doors: doors.map(d => fbox(d)), bands, lanterns };
    if (side === 's') south = plan[side];
  }
  if (!south) return {};
  // 8) أبراج الأطراف المدرّجة وأكاليل مثلثية: على الجهتين الجنوبية والشمالية عند الطرفين، وفوق المدخل جنوبًا (فقط، لا على امتداد الواجهة).
  // مقياس الإكليل 30–50 سم، وبُعد قمة-قمة = ضعف القاعدة، وارتفاع الزخرفة لا يتجاوز خُمس ارتفاع الواجهة (مصدر ثانوي: heyazah).
  const crownBase = .30 + R(48) * .14, crownH = Math.min(.5, crownBase * (1.0 + R(49) * .25)), crownDepth = .2;
  const tri = (pl, u, y, w, h, d0) => { const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]); const g = new THREE.ExtrudeGeometry(sh, { depth: crownDepth, bevelEnabled: false }); g.translate(0, 0, -crownDepth / 2);
    const nn = g.toNonIndexed(); nn.computeVertexNormals(); const e = pl.place(nn, stoneJ, u, y, d0, { uo: u - w / 2, vo: y }); return e; };
  const crownRow = (pl, a, b, y, d0) => { const pitch = crownBase * 2, nC = Math.max(1, Math.floor((b - a + crownBase) / pitch)), tot = (nC - 1) * pitch + crownBase, st = (a + b) / 2 - tot / 2 + crownBase / 2;
    for (let i = 0; i < nC; i++) { const u = st + i * pitch; let h = crownH; if (crownStyle === 1) h = crownH * (i % 2 ? .62 : 1); if (crownStyle === 2 && nC > 1) h = crownH * (i === Math.floor((nC - 1) / 2) ? 1.25 : .5); tri(pl, u, y, crownBase, Math.min(.5, h), d0); } };
  const pierBlock = (pl, a, b, rise, d0, dep) => { const y = pl.top; pl.add(b - a, rise, dep, stoneJ, (a + b) / 2, y + rise / 2, d0, { uo: a, vo: y }); pl.add(b - a + .06, .05, dep + .06, accent, (a + b) / 2, y + rise + .025, d0, { uo: a, vo: y + rise }); return y + rise + .05; };
  const tier = (pl, a, b, rise, d0, dep) => { const yt = pierBlock(pl, a, b, rise, d0, dep); // نمط خط السقف: 0 مستقيم، 1 متدرج بطبقتين، 2 تاج بارز مرتفع بمثلث مركزي كبير
    if (crownStyle === 1 && b - a > .9) { const m = (a + b) / 2, hw = (b - a) * .3, y2 = pl.top + rise + .05; pl.add(hw * 2, .22, dep - .1, stoneJ, m, y2 + .11, d0, { uo: m - hw, vo: y2 }); crownRow(pl, m - hw, m + hw, y2 + .22, pl.wd); return; }
    crownRow(pl, a, b, yt, pl.wd); };
  const rise0 = towerRise * (crownStyle === 2 ? 1.35 : crownStyle === 0 ? .8 : 1) * (reg.t === 2 ? 1.2 : 1);
  for (const sd of ['s', 'n']) { const pl = plan[sd]; if (!pl) continue; const dep = .38, d0 = pl.wd - dep / 2 + .04, e = sd === 's' ? reg.e : 0;
    const wL = towerW * (e === 1 ? 1.45 : e === 2 ? .8 : e === 3 ? 1.2 : 1) * (reg.t === 2 ? 1.2 : 1), wR = towerW * (e === 2 ? 1.45 : e === 1 ? .8 : e === 3 ? 1.2 : 1) * (reg.t === 2 ? 1.2 : 1);
    tier(pl, pl.X0 - .02, pl.X0 + wL, rise0 * (e === 1 ? 1.25 : 1), d0, dep); tier(pl, pl.X1 - wR, pl.X1 + .02, rise0 * (e === 2 ? 1.25 : 1), d0, dep);
    if (sd === 's' && entryPier && pl.doors.length) { const f = pl.doors[0], cw = Math.min(f.u1 - f.u0 + .9, 2.2), a = (f.u0 + f.u1) / 2 - cw / 2, b = a + cw; if (a > pl.X0 + wL + .2 && b < pl.X1 - wR - .2) tier(pl, a, b, rise0 * .6, d0, dep); }
    else if (sd === 's' && e === 0) { const c = (pl.X0 + pl.X1) / 2, a = c - 1.0, b = c + 1.0; if (a > pl.X0 + wL + .3 && b < pl.X1 - wR - .3 && !pl.doors.some(f => f.u1 > a - .3 && f.u0 < b + .3)) tier(pl, a, b, rise0 * .6, d0, dep); } }
  // 9) إنارة ليلية: مصابيح موضعية حقيقية عند الفوانيس، وغسيل ضوء على الأبراج
  if (night) { let cnt = 0; for (const sd of Object.keys(plan)) { const pl = plan[sd]; for (const [sx, y] of pl.lanterns) { if (cnt++ > 8) break; const L = new THREE.SpotLight('#ffd49a', 6, 4.5, 1.1, .6, 2); L.position.copy(pl.P3(sx, y, pl.wd + .1)); L.target.position.copy(pl.P3(sx, 0, pl.wd + .4)); scene.add(L, L.target); } }
    const pl = south; for (const u of [pl.X0 + .4, pl.X1 - .4]) { const L = new THREE.SpotLight('#ffe0ae', 5, 5, .9, .7, 2); L.position.copy(pl.P3(u, pl.top + .05, pl.wd + .35)); L.target.position.copy(pl.P3(u, pl.top - 1.8, pl.wd)); scene.add(L, L.target); } }
  return { wallZ: south.wd, X0: south.X0, X1: south.X1 };
}
