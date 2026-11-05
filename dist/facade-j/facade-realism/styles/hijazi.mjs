// نمط H (حجازي جدة): واجهة مستلهمة من عمارة جدة التاريخية (الحجاز الساحلي) لا من اللون وحده. العنصر المهيمن: الفتحة + الشاشة الخشبية + الإيقاع الرأسي (عكس نجد: الكتلة).
// الروشان مركّب من مكونات: فتحة ← غلاف خشبي خفيف (خدود + قاعدة + تاج مائل + كوابيل) ← تقسيمات شبك (درف متحركة + حزام علوي زخرفي) ← إطار وحشوات ← تظليل/خصوصية (الشبك نفسه + خلفية معتمة).
// MAX_PROJECTION = 250 مم. HISTORICAL FEATURE REQUIRES GREATER PROJECTION — NOT IMPLEMENTED UNDER CURRENT CONSTRAINT (الروشان التاريخي عمقه ≥1 م؛ هنا قشرة 15–25 سم فقط).
// المصادر (بحث ويب 2026-11-05) والعناصر المأخوذة منها:
//  [1] Springer، «Rowshan in Hejaz» (cityterritoryarchitecture.springeropen.com/articles/10.1186/s40410-023-00204-6):
//      الروشان بروز خشبي مشبّك: حزام سفلي مصمت (ارتفاعه 40–50 سم عن الأرضية)، وسط بدرف/ألواح متحركة بشبك (شيش/أباجورة)،
//      حزام علوي ثابت بفتحات زخرفية (1–1.2 م)، وتاج مائل علوي (برنيطة)، وكوابيل/دعامات مثلثة (كرادي) تحته؛ زخارف هندسية (نجوم، سداسيات، ثمانيات)؛
//      الخشب الطبيعي هو الأصل والأخضر والأزرق والعنابي أحدث وبحسب رغبة المالك. (النسبة الحقيقية: عمق ≥1 م، أما هنا فبروز 15–25 سم بحد المالك.)
//  [2] Aramco World 1971، «Jiddah's balconies» (archive.aramcoworld.com/issue/197105/jiddah.s.balconies-.splendid.bright.htm):
//      بيوت جدة من كتل المرجان (المنقبي) ثم لاحقًا لياسة إسمنتية؛ الروشان على كوابيل مع كورنيش وسقيفة وشيش؛ أبواب وشبابيك خشبية مزخرفة بنقش ثقيل.
//  [3] Arab News/ينبع (arabnews.pk/node/2457216): حجر المنقبي المرجاني، رواشين بحوامل بارزة وكوابيل وكرانيش مائلة، شبك (مشربية) على النوافذ.
//  [4] Omrania، «8 Features of the Vernacular Architecture of the Hejaz»: المشربية بروز مشبّك، المواد المحلية (مرجان، طين، نخيل)، زخارف هندسية ونباتية وخط حول الأبواب والنوافذ، والباب عنصر استقبال يعبّر عن مكانة المالك.
//  [5] Gulf News 2026 (مشروع الطراز الحجازي الساحلي لجدة): ألوان لؤلؤية/رملية ودرجات المشربية، وإبراز عناصر خشبية أو بديل حديث.
//  غير متحقق: (أ) نسب التاج المائل/الكوابيل المبسطة بالأبعاد المصغرة؛ (ب) أقواس مدببة/مستديرة فوق الأبواب والنوافذ كلازمة حجازية (شائعة في صور البلد التاريخية لكن لم أجد مصدرًا نصيًا يحدد أنواعها)؛
//      (ج) حليات الأسنان (dentils) في الكورنيش؛ (د) تنوع اللوحات اللونية للخشب الأخضر/التيل/العنابي كتاريخية (المصدر [1] يقول إن الأخضر والأزرق متأخران).
// القواعد: لا تُحرَّك فتحة ولا جدار ولا منسوب. كل الإضافات أمام وجه الجدار فقط (مدفونة 2.5 سم لالتحام). أقصى بروز للروشان 25 سم (حد المالك 15–25).
// التنوع: params.rnd(k) يغيّر لوحة الألوان، ارتفاع المرجان، كثافة الروشان وعمقه، نمط الشبك لكل روشان، نوع القوس، الدرف، نوع الباب، الكورنيش.
export const meta = { id: 'H', ar: 'حجازي جدة', scope: 'Hijazi-Jeddah (جدة التاريخية/البلد) وليس كل الحجاز', maxProjectionMm: 250, sources: [
  'springeropen.com/articles/10.1186/s40410-023-00204-6 (Rowshan in Hejaz)', 'archive.aramcoworld.com/issue/197105 (Jiddah balconies)',
  'arabnews.pk/node/2457216 (Yanbu)', 'omrania.com/insights/8-features-vernacular-architecture-hejaz', 'gulfnews.com (Hejazi coastal design Jeddah)'] };

const SIDES = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
const CLASSIC = new Set(['projection', 'surround', 'cornice', 'sill', 'pediment']);
function bandLevels() { const L = globalThis.__FLOORS?.levels; if (!Array.isArray(L) || !L.length) return [3.55];
  return L.map(l => typeof l === 'number' ? l : l.top ?? ((l.elevation ?? 0) + (l.height ?? 3.2) + .35)).filter(Number.isFinite).sort((a, b) => a - b); }
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const rnd = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const tex = (THREE, renderer, c, srgb = true, rep = [1, 1]) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function aoTexture(THREE) { const [c, x] = cnv(4, 128), g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, '#fff'); g.addColorStop(.25, '#8a8a8a'); g.addColorStop(.6, '#262626'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); }

// لوحات الألوان: جدار لياسة، حلية، خشب. hist=false يعني أن لون الخشب (أخضر/أزرق/عنابي) متأخر تاريخيًا بحسب [1]
const PAL = [
  { n: 'تيك طبيعي على لؤلؤي', wall: '#efe7d4', trim: '#e3d9c0', wood: '#7a5230', dark: '#4b2f1b', coral: '#d4c7a6', hist: true },
  { n: 'أخضر زيتوني على كريمي', wall: '#f0e9d6', trim: '#e6dcc4', wood: '#44705a', dark: '#2c4a3c', coral: '#d8caa9', hist: false },
  { n: 'تيل على رملي', wall: '#e8dbbf', trim: '#f0e6cf', wood: '#2f6a6e', dark: '#1f4649', coral: '#cdbd98', hist: false },
  { n: 'بني غامق على أبيض', wall: '#f4f0e6', trim: '#e9e2d0', wood: '#503221', dark: '#321e12', coral: '#d6cab0', hist: true },
  { n: 'عنابي على لؤلؤي', wall: '#f1eadb', trim: '#e5dbc3', wood: '#6b302d', dark: '#431d1b', coral: '#d2c5a5', hist: false },
  { n: 'أزرق رمادي على رملي فاتح', wall: '#eadfc8', trim: '#f2ead7', wood: '#46647c', dark: '#2e4356', coral: '#cfc09c', hist: false },
];

function woodGrain(THREE, renderer, seed) { // ألياف رأسية بتدرج رمادي (يُلوَّن بـcolor الخامة)
  const W = 128, H = 1024, [c, x] = cnv(W, H), r = rnd(seed), img = x.createImageData(W, H), d = img.data, ph = [r() * 9, r() * 9, r() * 9];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const u = px / W, v = py / H;
    const ring = Math.sin((u * 7 + .6 * Math.sin(v * 5 + ph[0]) + .25 * Math.sin(v * 21 + ph[1] + u * 3)) * Math.PI * 2);
    const fine = Math.sin(u * 140 + Math.sin(v * 9 + ph[2]) * 2) * .5 + .5, k = .8 + .12 * ring + .06 * fine + (r() - .5) * .06, i = (py * W + px) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255 * Math.min(1, k); d[i + 3] = 255; }
  x.putImageData(img, 0, 0); return tex(THREE, renderer, c, true); }

/** جدار: لياسة فوق خط Hb، وحجر مرجاني (مداميك غير منتظمة) تحته. القماش 6×12 م (اللون + نتوء). UV = (u, ارتفاع) بالمتر. */
function wallTexture(THREE, renderer, pal, Hb, seed) {
  const PPM = 200, W = 6 * PPM, H = 12 * PPM, [c, x] = cnv(W, H), [bc, bx] = cnv(W, H), r = rnd(seed);
  const Y = m => H - m * PPM;
  x.fillStyle = pal.wall; x.fillRect(0, 0, W, H); bx.fillStyle = '#9a9a9a'; bx.fillRect(0, 0, W, H);
  // لياسة: بقع منخفضة التردد + حبيبات + تلطيخ رأسي خفيف
  for (let i = 0; i < 700; i++) { const px = r() * W, py = r() * H, rad = 30 + r() * 140, g = x.createRadialGradient(px, py, 0, px, py, rad), a = .018 + r() * .03, dk = r() < .55;
    g.addColorStop(0, dk ? `rgba(120,98,60,${a})` : `rgba(255,252,240,${a * 1.2})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  for (let i = 0; i < 26000; i++) { const v = r() < .5; x.fillStyle = v ? 'rgba(110,92,60,.06)' : 'rgba(255,255,248,.07)'; x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
    bx.fillStyle = v ? 'rgba(60,60,60,.25)' : 'rgba(200,200,200,.25)'; bx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 120; i++) { const px = r() * W, py = Y(.4 + r() * 11), len = 40 + r() * 160, g = x.createLinearGradient(0, py, 0, py + len); g.addColorStop(0, 'rgba(110,95,70,.0)'); g.addColorStop(.3, `rgba(110,95,70,${.02 + r() * .035})`); g.addColorStop(1, 'rgba(110,95,70,0)'); x.fillStyle = g; x.fillRect(px, py, 5 + r() * 14, len); }
  // مرجان: مداميك بارتفاع 20–34 سم وأطوال 35–95 سم، فواصل غائرة، تجاويف (حفر) وتدرجات
  if (Hb > .05) { x.save(); x.beginPath(); x.rect(0, Y(Hb), W, Hb * PPM + 2); x.clip(); bx.save(); bx.beginPath(); bx.rect(0, Y(Hb), W, Hb * PPM + 2); bx.clip();
    x.fillStyle = '#9d8e6c'; x.fillRect(0, Y(Hb), W, Hb * PPM + 2); bx.fillStyle = '#2c2c2c'; bx.fillRect(0, Y(Hb), W, Hb * PPM + 2);
    const base = pal.coral, br = parseInt(base.slice(1, 3), 16), bg = parseInt(base.slice(3, 5), 16), bb = parseInt(base.slice(5, 7), 16);
    let y = 0; while (y < Hb + .4) { const ch = .2 + r() * .14; let u = -r() * .5;
      while (u < 6) { const bw = .35 + r() * .6, t = .9 + r() * .2, wv = (r() - .5) * 22, px = u * PPM + 3, py = Y(y + ch) + 3, w2 = bw * PPM - 6, h2 = ch * PPM - 6;
        x.fillStyle = `rgb(${clamp(br * t + wv, 0, 255) | 0},${clamp(bg * t + wv * .9, 0, 255) | 0},${clamp(bb * t + wv * .7, 0, 255) | 0})`;
        const rr = 5 + r() * 6; x.beginPath(); x.roundRect(px, py, w2, h2, rr); x.fill(); bx.fillStyle = `rgb(${190 + r() * 50 | 0},${190 + r() * 50 | 0},${190 + r() * 50 | 0})`; bx.beginPath(); bx.roundRect(px, py, w2, h2, rr); bx.fill();
        // حفر مرجانية وبقع
        for (let k = 0; k < 6 + bw * 9; k++) { const qx = px + r() * w2, qy = py + r() * h2, qr = .8 + r() * r() * 5; x.fillStyle = `rgba(95,78,52,${.08 + r() * .16})`; x.beginPath(); x.ellipse(qx, qy, qr, qr * (.6 + r() * .6), r() * 3, 0, 7); x.fill();
          bx.fillStyle = 'rgba(40,40,40,.7)'; bx.beginPath(); bx.ellipse(qx, qy, qr, qr * .8, 0, 0, 7); bx.fill(); }
        for (let k = 0; k < 5; k++) { const qx = px + r() * w2, qy = py + r() * h2; x.strokeStyle = `rgba(255,250,235,${.1 + r() * .12})`; x.lineWidth = 1 + r() * 2; x.beginPath(); x.arc(qx, qy, 5 + r() * 14, r() * 6, r() * 6 + 2); x.stroke(); }
        u += bw; }
      y += ch; }
    x.restore(); bx.restore(); }
  const rep = [1 / 6, 1 / 12], map = tex(THREE, renderer, c, true, rep), bump = tex(THREE, renderer, bc, false, rep);
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.4, roughness: .94, metalness: 0 }); m.name = 'hijazi-wall'; return m; }

// ===== أنماط الشبك (المشربية): تُرسم قضبانًا في مستطيل. ppm بكسل/م.
function lattice(x, x0, y0, x1, y1, kind, col, ppm) {
  const w = x1 - x0, h = y1 - y0; x.save(); x.beginPath(); x.rect(x0, y0, w, h); x.clip(); x.lineCap = 'butt';
  const pass = (dx, color, lwm) => { x.strokeStyle = color; x.lineWidth = Math.max(1.4, lwm * ppm); x.beginPath();
    if (kind === 0) { const s = .05 * ppm; for (let u = x0 + s / 2; u < x1; u += s) { x.moveTo(u + dx, y0); x.lineTo(u + dx, y1); } for (let v = y0 + s / 2; v < y1; v += s) { x.moveTo(x0, v + dx); x.lineTo(x1, v + dx); } }
    else if (kind === 1) { const s = .075 * ppm; for (let k = -h; k < w + h; k += s) { x.moveTo(x0 + k + dx, y0); x.lineTo(x0 + k + h + dx, y1); x.moveTo(x0 + k + dx, y1); x.lineTo(x0 + k + h + dx, y0); } }
    else if (kind === 2) { const s = .15 * ppm, a = s * .5, b = s * .2; for (let v = y0; v < y1 + s; v += s) for (let u = x0; u < x1 + s; u += s) { const cx = u + a + dx, cy = v + a + dx;
      x.moveTo(u + dx, v + dx); x.lineTo(u + s + dx, v + dx); x.moveTo(u + dx, v + dx); x.lineTo(u + dx, v + s + dx);
      x.moveTo(cx - a * .62, cy); x.lineTo(cx, cy - a * .62); x.lineTo(cx + a * .62, cy); x.lineTo(cx, cy + a * .62); x.closePath();
      x.moveTo(cx - b, cy - b); x.lineTo(cx + b, cy + b); x.moveTo(cx + b, cy - b); x.lineTo(cx - b, cy + b); } }
    else { const s = .042 * ppm; for (let u = x0 + s / 2; u < x1; u += s) { x.moveTo(u + dx, y0); x.lineTo(u + dx, y1); } for (const f of [.33, .66]) { x.moveTo(x0, y0 + h * f + dx); x.lineTo(x1, y0 + h * f + dx); } }
    x.stroke(); };
  pass(1.2, 'rgba(0,0,0,.45)', kind === 3 ? .02 : .016); pass(0, col, kind === 3 ? .017 : .013); x.restore(); }

function bayFront(THREE, renderer, Wm, Hm, ap, up, kind, pal, seed) {
  const ppm = 150, cw = Math.round(Wm * ppm), ch = Math.round(Hm * ppm), [c, x] = cnv(cw, ch), r = rnd(seed), Y = m => ch - m * ppm;
  x.fillStyle = pal.wood; x.fillRect(0, 0, cw, ch);
  for (let i = 0; i < cw / 1.6; i++) { x.fillStyle = r() < .5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.05)'; x.fillRect(r() * cw, 0, 1, ch); }
  const st = .05, rail = .055, nN = Math.max(1, Math.round((Wm - 2 * st) / .62)), cwid = (Wm - 2 * st - (nN - 1) * st) / nN;
  const holes = [], midY0 = ap + rail, midY1 = Hm - up - rail;
  for (let i = 0; i < nN; i++) holes.push({ u0: st + i * (cwid + st), u1: st + i * (cwid + st) + cwid, y0: midY0, y1: midY1, k: kind });
  const topK = kind === 2 ? 0 : 2; // العلوي دائمًا زخرفي (نجمي) إلا إن كان الأوسط نجميًا
  const nU = Math.max(1, Math.round((Wm - 2 * st) / .5)), uw = (Wm - 2 * st - (nU - 1) * st * .7) / nU;
  for (let i = 0; i < nU; i++) holes.push({ u0: st + i * (uw + st * .7), u1: st + i * (uw + st * .7) + uw, y0: Hm - up + .02, y1: Hm - st, k: topK });
  for (const h of holes) if (h.y1 - h.y0 > .05) x.clearRect(h.u0 * ppm, Y(h.y1), (h.u1 - h.u0) * ppm, (h.y1 - h.y0) * ppm);
  for (const h of holes) if (h.y1 - h.y0 > .05) lattice(x, h.u0 * ppm, Y(h.y1), h.u1 * ppm, Y(h.y0), h.k, pal.wood, ppm);
  // لوح الحزام السفلي: إطار بارز مع معين محفور
  const ax0 = st * 1.6 * ppm, ay0 = Y(ap - .05), aw = (Wm - 3.2 * st) * ppm, ah = (ap - .1) * ppm;
  x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; x.strokeRect(ax0, ay0, aw, ah); x.strokeStyle = 'rgba(255,255,255,.14)'; x.strokeRect(ax0 + 2, ay0 + 2, aw, ah);
  x.strokeStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.moveTo(ax0 + aw / 2, ay0 + 5); x.lineTo(ax0 + aw / 2 + ah / 2 - 5, ay0 + ah / 2); x.lineTo(ax0 + aw / 2, ay0 + ah - 5); x.lineTo(ax0 + aw / 2 - ah / 2 + 5, ay0 + ah / 2); x.closePath(); x.stroke();
  // مسامير/أزرار صغيرة على الدعامات
  x.fillStyle = 'rgba(0,0,0,.35)'; for (const h of holes.slice(0, nN)) { x.beginPath(); x.arc(h.u0 * ppm - st * ppm / 2, Y(ap + .15), 2, 0, 7); x.fill(); }
  const t = tex(THREE, renderer, c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; }

function leafTex(THREE, renderer, w, h, pal, seed) { // درفة شيش مفتوحة (ألواح شيش أفقية)
  const ppm = 120, cw = Math.max(16, Math.round(w * ppm)), ch = Math.round(h * ppm), [c, x] = cnv(cw, ch), r = rnd(seed);
  x.fillStyle = pal.wood; x.fillRect(0, 0, cw, ch); const f = .06 * ppm;
  x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(f, f, cw - 2 * f, ch - 2 * f);
  for (let v = f + 2; v < ch - f - 3; v += .045 * ppm) { const g = x.createLinearGradient(0, v, 0, v + .045 * ppm); g.addColorStop(0, pal.wood); g.addColorStop(.6, pal.wood); g.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = g; x.fillRect(f, v, cw - 2 * f, .036 * ppm); }
  for (let i = 0; i < cw / 2; i++) { x.fillStyle = r() < .5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)'; x.fillRect(r() * cw, 0, 1, ch); }
  return tex(THREE, renderer, c, true); }

function doorTex(THREE, renderer, w, h, pal, seed, orn = true) { // باب مزدوج منقوش: إطار، حشوات بارزة، نجمة ثمانية، مسامير نحاسية، حلقتا قبضة
  const ppm = 150, cw = Math.round(w * ppm), ch = Math.round(h * ppm), [c, x] = cnv(cw, ch), r = rnd(seed), pad = .03 * ppm;
  x.fillStyle = pal.dark; x.fillRect(0, 0, cw, ch);
  for (let i = 0; i < cw / 1.5; i++) { x.fillStyle = r() < .5 ? 'rgba(0,0,0,.12)' : 'rgba(255,230,190,.06)'; x.fillRect(r() * cw, 0, 1, ch); }
  const lw = (cw - 3 * pad) / 2, brass = '#b78d3a';
  for (let k = 0; k < 2; k++) { const lx = pad + k * (lw + pad);
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 3; x.strokeRect(lx, pad, lw, ch - 2 * pad);
    const rows = [{ y0: .06, y1: .36 }, { y0: .4, y1: .94 }]; // أسفل ثم أعلى (من الأسفل)
    // حشوة سفلية، وحشوة علوية كبيرة فيها نجمة
    for (const [i, rw] of rows.entries()) { const px = lx + .06 * ppm, pw = lw - .12 * ppm, py = ch - rw.y1 * h * ppm, ph = (rw.y1 - rw.y0) * h * ppm;
      x.fillStyle = 'rgba(255,225,180,.09)'; x.fillRect(px, py, pw, ph); x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 2.5; x.strokeRect(px, py, pw, ph); x.strokeStyle = 'rgba(255,225,180,.22)'; x.lineWidth = 1.2; x.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
      if (i === 1 && orn) { const cx = px + pw / 2, cy = py + ph * .42, R = Math.min(pw, ph) * .36; x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 2;
        for (let s = 0; s < 2; s++) { x.beginPath(); for (let a = 0; a < 4; a++) { const an = a * Math.PI / 2 + s * Math.PI / 4 + Math.PI / 4, X = cx + Math.cos(an) * R, Yy = cy + Math.sin(an) * R; a ? x.lineTo(X, Yy) : x.moveTo(X, Yy); } x.closePath(); x.stroke(); }
        x.beginPath(); x.arc(cx, cy, R * .38, 0, 7); x.stroke(); x.strokeStyle = 'rgba(255,225,180,.25)'; x.beginPath(); x.arc(cx, cy, R * .38 + 2, 0, 7); x.stroke(); }
      if (orn) x.fillStyle = brass; if (orn) for (const [qx, qy] of [[px + 5, py + 5], [px + pw - 5, py + 5], [px + 5, py + ph - 5], [px + pw - 5, py + ph - 5]]) { x.beginPath(); x.arc(qx, qy, 2.4, 0, 7); x.fill(); } }
    // حلقة قبضة عند خط المنتصف
    const hx = k ? lx + .07 * ppm : lx + lw - .07 * ppm, hy = ch * .5; x.strokeStyle = brass; x.lineWidth = 3; x.beginPath(); x.arc(hx, hy, 8, 0, 7); x.stroke(); x.fillStyle = brass; x.beginPath(); x.arc(hx, hy - 12, 3.5, 0, 7); x.fill(); }
  return tex(THREE, renderer, c, true); }

function tileLattice(THREE, renderer, kind, col) { const ppm = 160, S = Math.round(.3 * ppm), [c, x] = cnv(S, S); lattice(x, 0, 0, S, S, kind, col, ppm);
  const t = tex(THREE, renderer, c, true, [1 / .3, 1 / .3]); return t; }

// منشور: مقطع (d,y) يُسحب بعرض w على امتداد u. الإحداثيات المحلية (u,y,d).
function prism(THREE, prof, w, u0) { const sh = new THREE.Shape(prof.map(([d, y]) => new THREE.Vector2(-d, y))), g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(u0, 0, 0); return g; }
// منحنى قوس (u,y) من اليسار إلى اليمين: نصف العرض a، الارتفاع h. pointed (مركزان على خط الارتكاز) | round | segmental
function archPts(a, h, kind, n = 14) { const pts = [];
  if (kind === 'segmental') { const R = (a * a + h * h) / (2 * h), cy = h - R, t0 = Math.atan2(-cy, a); for (let i = 0; i <= n * 2; i++) { const t = Math.PI - t0 - i * (Math.PI - 2 * t0) / (n * 2); pts.push([R * Math.cos(t), cy + R * Math.sin(t)]); } return pts; }
  if (kind === 'round') { for (let i = 0; i <= n * 2; i++) { const t = Math.PI - i * Math.PI / (n * 2); pts.push([a * Math.cos(t), (h - a) + a * Math.sin(t)]); } return pts; }
  const R = (a * a + h * h) / (2 * a), th = Math.atan2(h, R - a), right = []; // القوس الأيمن مركزه (-(R-a),0)
  for (let i = 0; i <= n; i++) { const t = th * i / n; right.push([-(R - a) + R * Math.cos(t), R * Math.sin(t)]); }
  for (const [x, y] of right) pts.push([-x, y]); for (let i = right.length - 2; i >= 0; i--) pts.push(right[i]); return pts; }

let _gate = { maxProjectionMm: null, openingsUnchanged: null, notImplemented: [], detail: {} };
/** بوابات المطابقة: تُقرأ بعد apply(). maxProjectionMm = أقصى بروز فعلي (مم) لأي عنصر أضافه النمط أمام وجه الجدار. */
export const gates = () => _gate;

export async function apply(THREE, { scene, renderer, S, q, doc, FI, params }) {
  // التنوع: params.rnd(k) من variation.mjs (بذرة مشتقة من بصمة التصميم + seed)؛ احتياطي حتمي إن غاب.
  const R = k => params?.rnd ? params.rnd(k) : (((Math.imul(k + 1, 2654435761) >>> 0) / 4294967296) * 7 % 1), night = q.get('night') === '1', BH = .30;
  const palI = q.get('pal') != null ? Math.abs(+q.get('pal') | 0) % PAL.length : Math.floor(R(1) * PAL.length), pal = PAL[palI];
  // عمق الروشان: حد المالك 15–25 سم. ما فوق 25 غير مطبّق (يُقصّ إلى 25) ويُسجَّل.
  let PR = .15 + R(7) * .06; const reqD = q.get('rdepth'), notes = [];
  if (reqD != null) { if (+reqD > .25) { PR = .21; notes.push('روشان أعمق من 25 سم غير مطبّق (حد المالك 15–25): نُفّذ بروز 25 سم بنقش ضحل'); console.warn('[hijazi] ' + notes[0]); } else PR = clamp(+reqD, .15, .21); }
  const orn = q.get('orn') !== '0'; // orn=0: يخفي الزخرفة (أسنان الكورنيش، شريط الإفريز، نقش الباب، مسامير) ويُبقي الكتلة والروشان والأقواس
  notes.push('HISTORICAL FEATURE REQUIRES GREATER PROJECTION — NOT IMPLEMENTED UNDER CURRENT CONSTRAINT: الروشان التاريخي عمقه ≥1 م وارتفاعه ~3 م؛ نُفّذ بروز '+(PR*100).toFixed(0)+' سم فقط');
  const dens = .4 + R(3) * .6, coralFull = R(2) < .5, plinthH = 1.0 + R(4) * .6;
  const archPref = ['pointed', 'round', 'segmental', 'pointed'][Math.floor(R(5) * 4)], doorArch = ['pointed', 'round', 'segmental'][Math.floor(R(8) * 3)];
  const shutterP = .2 + R(6) * .6, dentil = orn && R(9) < .5, frieze = orn && R(12) < .55, latBase = Math.floor(R(10) * 4), corniceD = .14 + R(11) * .06, archFillSolid = R(13) < .5;
  const LOCK = new Set(['glazing', 'door', 'frame', 'wall', 'cladding']);
  const snap = () => S.meshes.filter(m => LOCK.has(m.userData?.role)).map(m => { m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m); return [m.name, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, ...m.matrixWorld.elements].map(v => typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v).join(','); });
  const before = snap(), groups = [];
  for (const m of S.meshes) if (CLASSIC.has(m.userData?.role)) m.visible = false;
  const levels = bandLevels(), multi = levels.length > 1;
  const Hb = coralFull && multi ? levels[0] + .02 : plinthH;
  const wallMat = wallTexture(THREE, renderer, pal, Hb, 40 + palI * 7 + (params?.seed | 0));
  const grain = woodGrain(THREE, renderer, 5 + palI);
  const wmat = (color, rough = .62) => new THREE.MeshStandardMaterial({ map: grain, bumpMap: grain, bumpScale: .35, color, roughness: rough });
  const wood = wmat(pal.wood), woodD = wmat(pal.dark), trim = new THREE.MeshStandardMaterial({ color: pal.trim, roughness: .88 }), trimD = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.trim).multiplyScalar(.9), roughness: .9 });
  const backing = new THREE.MeshStandardMaterial({ color: '#1b1511', roughness: 1, envMapIntensity: .1 });
  const glow = new THREE.MeshStandardMaterial({ color: '#2a1d10', emissive: '#ffcf8e', emissiveIntensity: .95, roughness: 1 });
  const brassM = new THREE.MeshStandardMaterial({ color: '#b78d3a', metalness: .7, roughness: .4 });
  const lanternM = new THREE.MeshStandardMaterial({ color: '#7a4f1c', emissive: '#ffd699', emissiveIntensity: night ? .95 : .35 });
  const latMat = tx => new THREE.MeshStandardMaterial({ map: tx, transparent: true, alphaTest: .03, depthWrite: false, roughness: .7, side: THREE.DoubleSide });
  const tileMats = [0, 1, 2, 3].map(k => latMat(tileLattice(THREE, renderer, k, pal.wood)));
  const frameMat = wmat(pal.wood, .55);
  for (const m of S.meshes) { const p = m.userData?.part, r = m.userData?.role;
    if (p === 'wallcore' || p === 'plate') m.material = wallMat; if (p === 'blocks') m.visible = false; if (r === 'frame') m.material = frameMat; }
  const AO = aoTexture(THREE), aoMat = a => new THREE.MeshBasicMaterial({ color: '#000', alphaMap: AO, transparent: true, opacity: a * (night ? .5 : 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const box = m => new THREE.Box3().setFromObject(m), up = new THREE.Vector3(0, 1, 0), cache = new Map();
  const cached = (key, f) => { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); };
  let south = null;
  for (const [si, [side, [nx, nz]]] of Object.entries(SIDES).map((e, i) => [i, e])) {
    const sm = S.meshes.filter(m => m.userData?.side === side && (m.visible || m.userData.part === 'blocks')); if (!sm.length) continue;
    const n = new THREE.Vector3(nx, 0, nz), t = new THREE.Vector3().crossVectors(up, n);
    const loc = b => { const us = [b.min.x * t.x + b.min.z * t.z, b.max.x * t.x + b.max.z * t.z], ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z];
      return { u0: Math.min(...us), u1: Math.max(...us), y0: b.min.y, y1: b.max.y, d0: Math.min(...ds), d1: Math.max(...ds) }; };
    const walls = sm.filter(m => m.userData.role === 'wall' || m.userData.role === 'cladding').map(m => loc(box(m))); if (!walls.length) continue;
    const wallD = Math.max(...walls.map(w => w.d1)), face = walls.filter(w => w.d1 > wallD - .1);
    const X0 = Math.min(...face.map(w => w.u0)), X1 = Math.max(...face.map(w => w.u1)), top = Math.max(...face.map(w => w.y1));
    const G = new THREE.Group(); G.matrix.makeBasis(t, up, n); G.matrix.decompose(G.position, G.quaternion, G.scale); scene.add(G);
    groups.push({ side, G, n, wallD });
    const sd = si * 100; // عزل بذور الجهات
    const add = (g, mat, u, y, d, cast = true, recv = true) => { const o = new THREE.Mesh(g, mat); o.position.set(u, y, d); o.castShadow = cast; o.receiveShadow = recv; G.add(o); return o; };
    const bx = (sx, sy, d0, d1, mat, u, y, cast = true) => add(new THREE.BoxGeometry(sx, sy, d1 - d0), mat, u, y, (d0 + d1) / 2, cast); // صندوق بين عمقين
    const plane = (w, h, mat, u, y, d) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(u, y, d); o.receiveShadow = true; G.add(o); return o; };
    const P = (u, y, d) => t.clone().multiplyScalar(u).addScaledVector(n, d).setY(y);
    const ao = (a, b, away, alpha) => { const A = P(...a), B = P(...b), w = new THREE.Vector3().addScaledVector(t, away[0]).addScaledVector(n, away[2]).setY(away[1]);
      const g = new THREE.BufferGeometry(), v = [A, B, B.clone().add(w), A.clone().add(w)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
      const o = new THREE.Mesh(g, aoMat(alpha)); o.renderOrder = 2; scene.add(o); };
    const bands = levels.filter(y => y + BH < top - .05);
    const dOf = m => { const f = sm.find(x => x.userData.role === 'frame' && x.userData.opening === m.userData.opening); return loc(box(f || m)).d1; };
    const gl = sm.filter(m => m.userData.role === 'glazing').map(m => ({ m, b: loc(box(m)), d: dOf(m) })).filter(g => wallD - g.d <= 1.9).sort((a, b) => a.b.u0 - b.b.u0); // فتحات جناح خلفي بعيد (أكثر من 1.9 م خلف الوجه) خارج مستوى الواجهة: لا تُعالَج
    const doors = sm.filter(m => m.userData.role === 'door').map(m => ({ m, b: loc(box(m)), d: dOf(m) })).filter(g => wallD - g.d <= 1.9);
    // وجه الجدار لفتحة ما: عند الارتداد (الدور الأخير في الأمامية) نستعمل عمق إطارها الفعلي
    const wdOf = d => (wallD - d > .3 ? d : wallD);
    // ===== الإشغال: لا تتداخل الإضافات مع فتحة أو شريط أو بعضها
    const occ = []; for (const o of [...gl, ...doors]) occ.push({ u0: o.b.u0 - .05, u1: o.b.u1 + .05, y0: o.b.y0 - .05, y1: o.b.y1 + .05, id: o.m.id });
    for (const yb of bands) occ.push({ u0: -1e9, u1: 1e9, y0: yb - .02, y1: yb + BH + .02, id: 'band' });
    occ.push({ u0: -1e9, u1: 1e9, y0: top - .46, y1: 1e9, id: 'roof' });
    const free = (u0, u1, y0, y1, self) => u0 >= X0 + .1 && u1 <= X1 - .1 && y0 >= .06 && occ.every(o => o.id === self || u1 <= o.u0 || u0 >= o.u1 || y1 <= o.y0 || y0 >= o.y1);
    const yLoLim = y => { let v = .08; for (const yb of bands) if (yb + BH + .02 <= y + .01) v = Math.max(v, yb + BH + .06); return v; };
    const yHiLim = y => { let v = Infinity; for (const yb of bands) if (yb >= y - .01) v = Math.min(v, yb - .04); return Number.isFinite(v) ? v : (y < top - .5 ? top - .5 : y + .6); };
    // ===== خط المرجان والشرائح وكرانيش السقف
    const L = X1 - X0, uc0 = (X0 + X1) / 2, WD0 = wallD - .03;
    const segs = (y0, y1) => { let iv = [[X0 - .01, X1 + .01]]; for (const o of [...gl, ...doors]) if (o.b.y1 > y0 - .06 && o.b.y0 < y1 + .06) { const pad = o.m.userData.role === 'door' ? .18 : .13;
      iv = iv.flatMap(([a, b]) => o.b.u1 + pad <= a || o.b.u0 - pad >= b ? [[a, b]] : [[a, o.b.u0 - pad], [o.b.u1 + pad, b]].filter(([p, q]) => q - p > .04)); } return iv; };
    const course = (yBase, items, mat = trim, cut = false) => { let y = yBase; for (const [h, d] of items) { for (const [a, b] of cut ? segs(y, y + h) : [[X0 - .01, X1 + .01]]) bx(b - a, h, WD0, wallD + d, mat, (a + b) / 2, y + h / 2); y += h; } };
    if (!(coralFull && multi)) course(Hb - .03, [[.05, .05], [.08, .09]], trim, true);
    for (const yb of bands) { course(yb + .01, [[.06, .04], [.13, .08], [.06, .12], [.04, .06]]);
      ao([X0, yb, wallD + .003], [X1, yb, wallD + .003], [0, -.3, 0], .3); }
    course(top - .30, [[.06, .04], [.10, .08], [.08, .12], [.06, corniceD]]);
    bx(L + .02, .07, wallD - .30, wallD + .06, trim, uc0, top + .035);
    if (frieze) bx(L, .10, WD0, wallD + .035, wood, uc0, top - .40);
    if (dentil) { const nD = Math.floor(L / .13), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(.07, .06, .08), trim, nD), M4 = new THREE.Matrix4();
      for (let i = 0; i < nD; i++) { M4.makeTranslation(X0 + .1 + i * .13, top - (frieze ? .49 : .34), wallD + .04); inst.setMatrixAt(i, M4); } inst.castShadow = inst.receiveShadow = true; G.add(inst); }
    ao([X0, .003, wallD], [X1, .003, wallD], [0, 0, .5], .5); ao([X0, 0, wallD + .003], [X1, 0, wallD + .003], [0, .4, 0], .3);
    // ===== قوس فوق فتحة: مرتكز yS وعرض داخلي wIn؛ ya الارتفاع المتاح. يعيد القمة أو null
    const archOver = (uc, wIn, yS, ya, pref, ringW, fill, wd, seed) => {
      const a = wIn / 2; let kind, h;
      if (pref === 'pointed' && ya - ringW * 1.15 >= a * 1.12) { kind = 'pointed'; h = Math.min(ya - ringW * 1.15, a * 1.5); }
      else if (pref !== 'segmental' && ya - ringW * 1.1 >= a) { kind = 'round'; h = a; }
      else if (ya - ringW >= a * .3) { kind = 'segmental'; h = Math.min(ya - ringW, a * .62); }
      else return null;
      const inner = archPts(a, h, kind), outer = archPts(a + ringW, h + (kind === 'segmental' ? ringW * .7 : ringW), kind);
      const v2 = p => new THREE.Vector2(p[0], p[1]);
      const ring = new THREE.Shape([...outer.map(v2), ...inner.slice().reverse().map(v2)]);
      const rg = new THREE.ExtrudeGeometry(ring, { depth: .06, bevelEnabled: false }); add(rg, trim, uc, yS, wd - .02);
      const inShape = new THREE.Shape(inner.map(v2));
      const fg = () => new THREE.ShapeGeometry(inShape); const fillAt = (mat, d) => { const o = new THREE.Mesh(fg(), mat); o.position.set(uc, yS, d); o.receiveShadow = true; G.add(o); return o; };
      fillAt(backing, wd + .008);
      if (fill === 'lattice') { fillAt(night && R(sd + seed) < .6 ? glow : backing, wd + .01); const tm = tileMats[(latBase + seed) % 4]; fillAt(tm, wd + .028); }
      else if (fill === 'solid') { const o = fillAt(wood, wd + .018); o.castShadow = false; }
      else fillAt(trimD, wd + .012);
      // ترس القفل: كتلة صغيرة عند الذروة
      bx(.1, .1, wd, wd + .09, trim, uc, yS + h + ringW * .98, true);
      return yS + h + ringW; };
    // ===== أبواب: باب مزدوج منقوش + إطار حجري + قوس بمروحة شبك + عتبة + فوانيس
    for (const { m, b, d } of doors) { const wd = wdOf(d), w = b.u1 - b.u0, h = b.y1 - b.y0, uc = (b.u0 + b.u1) / 2, k = sd + 900;
      const dt = cached('door' + w.toFixed(2) + h.toFixed(2), () => new THREE.MeshStandardMaterial({ map: doorTex(THREE, renderer, w, h, pal, 3, orn), roughness: .55 }));
      const dp = plane(w - .02, h, dt, uc, (b.y0 + b.y1) / 2, wd + .02);
      const jw = .14; bx(jw, h + .14, wd - .02, wd + .09, trim, b.u0 - jw / 2 + .0, (b.y0 + b.y1 + .14) / 2); bx(jw, h + .14, wd - .02, wd + .09, trim, b.u1 + jw / 2, (b.y0 + b.y1 + .14) / 2); bx(w + 2 * jw, .14, wd - .02, wd + .09, trim, uc, b.y1 + .07);
      const sh = Math.max(.04, b.y0 - .0); // درجات حجرية من الأرض حتى عتبة الباب (دكة المدخل)
      bx(w + .36, sh, wd - .02, wd + .20, trimD, uc, sh / 2); // دكة مدخل بعمق 20 سم كحد أقصى (الدرجات الأعمق غير منفّذة تحت القيد)
      const yS = b.y1 + .14, ya = yHiLim(b.y1) - yS, wIn = w + 2 * jw, topA = archOver(uc, wIn, yS, ya, doorArch, .11, 'lattice', wd, 1);
      if (!topA) bx(w + 2 * jw + .3, .07, wd - .02, wd + .20, trim, uc, yS + .035); // لا مجال لقوس: كورنيش مظلة مسطح
      occ.push({ u0: b.u0 - .35, u1: b.u1 + .35, y0: 0, y1: (topA ?? yS) + .1, id: 'doorx' + k }); void sd;
      for (const sx of [b.u0 - jw - .3, b.u1 + jw + .3]) { // فانوس جداري
        bx(.02, .02, wd, wd + .13, brassM, sx, 2.25, false); bx(.012, .06, wd + .125, wd + .135, brassM, sx, 2.22, false); add(new THREE.BoxGeometry(.11, .22, .11), lanternM, sx, 2.02, wd + .13, false); bx(.15, .025, wd + .06, wd + .20, brassM, sx, 1.895, false); add(new THREE.ConeGeometry(.12, .1, 4).rotateY(Math.PI / 4), brassM, sx, 2.19, wd + .13, false);
        if (night) { const Ls = new THREE.SpotLight('#ffd9a0', 6, 4, 1.1, .6, 2); Ls.position.set(sx, 2.0, wd + .16); Ls.target.position.set(sx, 0, wd + .35); G.add(Ls, Ls.target); } }
    }
    // ===== نوافذ
    // عدد الروشان: الأوائل بترتيب عشوائي مبذور من النوافذ الصالحة (عرض ≥ 0.5 م)، بنسبة dens، وواحد على الأقل
    const eligible = gl.map((g, i) => ({ i, w: g.b.u1 - g.b.u0, r: R(sd + 100 + i) })).filter(e => e.w >= .5).sort((a, b) => a.r - b.r);
    const bayCount = side === 's' ? Math.ceil(eligible.length * dens) : Math.floor(eligible.length * dens * .8 + .5 * R(sd + 77));
    const bayGeom = (b, id) => { const w = b.u1 - b.u0, uc = (b.u0 + b.u1) / 2, W = w + (w < .8 ? .2 : .24), lo = yLoLim(b.y0), hi = yHiLim(b.y1), crown = .22, below = clamp(b.y0 - lo, 0, .30), upE = clamp(hi - b.y1 - crown, 0, .28);
      const yF0 = b.y0 - below, yF1 = b.y1 + upE; return below >= .18 && upE >= .16 && W < 3.2 && free(uc - W / 2 - .03, uc + W / 2 + .03, yF0 - .3, yF1 + crown, id) ? { W, lo, crown, yF0, yF1, Hm: yF1 - yF0, uc } : null; };
    const bayIdx = new Set(); // حجز الروشان بالترتيب العشوائي مع التحقق من الإمكان (اختيار نافذة لا يتسع لها يُنتقل منه إلى التالية)
    for (const e of eligible) { if (bayIdx.size >= bayCount) break; const g = gl[e.i], G0 = bayGeom(g.b, g.m.id); if (!G0) continue; bayIdx.add(e.i); occ.push({ u0: G0.uc - G0.W / 2 - .03, u1: G0.uc + G0.W / 2 + .03, y0: G0.yF0 - .3, y1: G0.yF1 + G0.crown, id: 'tent' + e.i }); }
    gl.forEach(({ m, b, d }, i) => {  const wd = wdOf(d), w = b.u1 - b.u0, h = b.y1 - b.y0, uc = (b.u0 + b.u1) / 2, id = m.id, r1 = R(sd + 100 + i), r2 = R(sd + 200 + i), r3 = R(sd + 300 + i), r4 = R(sd + 400 + i);
      const upper = multi && b.y0 > levels[0] - .1;
      const kindL = (latBase + Math.floor(r2 * 4)) % 4;
      // ملاحظة: زجاج الدور بإطاره الأصلي يبقى كما هو؛ الروشان يُركَّب أمامه
      let done = false;
      if (bayIdx.has(i)) { // روشان
        const k0 = occ.findIndex(o => o.id === 'tent' + i); if (k0 >= 0) occ.splice(k0, 1);
        const G1 = bayGeom(b, id), { W, lo, crown, yF0, yF1, Hm } = G1 || {};
        if (G1) {
          const dF = wd + PR - .045, ap = b.y0 + .06 - yF0, upz = clamp(.36, .2, Hm * .26);
          const tx = cached(['bay', W.toFixed(2), Hm.toFixed(2), ap.toFixed(2), kindL, palI].join('|'), () => latMat(bayFront(THREE, renderer, W, Hm, ap, upz, kindL, pal, 11 + i)));
          bx(W - .06, Hm, wd + .004, wd + .014, R(sd + 500 + i) < .45 && night ? glow : backing, uc, (yF0 + yF1) / 2, false);
          plane(W, Hm, tx, uc, (yF0 + yF1) / 2, dF);
          for (const sx of [-1, 1]) bx(.05, Hm, (wd - .03), dF, wood, uc + sx * (W / 2 - .025), (yF0 + yF1) / 2);
          bx(W, .05, (wd - .03), dF + .01, woodD, uc, yF0 + .025);
          add(prism(THREE, [[(wd - .03), yF1], [dF + .04, yF1], [dF + .04, yF1 + .05], [(wd - .03), yF1 + crown]], W + .08, -(W + .08) / 2), wood, uc, 0, 0);
          bx(W + .08, .035, dF - .02, dF + .045, woodD, uc, yF1 + .02);
          const cb = Math.min(.30, yF0 - lo - .02); if (cb > .12) for (const cu of W > 1.3 ? [-W / 2 + .12, 0, W / 2 - .12] : [-W / 2 + .1, W / 2 - .1]) add(prism(THREE, [[(wd - .03), yF0], [dF + .02, yF0], [(wd - .03), yF0 - cb]], .07, -.035), woodD, uc + cu, 0, 0);
          ao([uc - W / 2, yF0 - cb, wd + .003], [uc + W / 2, yF0 - cb, wd + .003], [0, -.25, 0], .35);
          occ.push({ u0: uc - W / 2 - .03, u1: uc + W / 2 + .03, y0: yF0 - cb, y1: yF1 + crown, id: 'bay' + i }); done = true;
        }
      }
      if (!done) { // نافذة عادية بحلية وقوس ودرف شيش أو شبك ضحل
        const tw = .10, ww = w + 2 * tw;
        if (w < .7) { // شبك ضحل (طاقة مشبّكة) أمام الزجاج: بروز 5 سم
          const tx = cached(['scr', w.toFixed(2), h.toFixed(2), kindL, palI].join('|'), () => latMat(bayFront(THREE, renderer, w + .06, h + .06, .06, .06, kindL, pal, 21 + i)));
          bx(w + .06, h + .06, wd + .004, wd + .014, backing, uc, (b.y0 + b.y1) / 2, false); plane(w + .06, h + .06, tx, uc, (b.y0 + b.y1) / 2, wd + .045); }
        else { // قواطع خشبية رقيقة داخل الفتحة
          const nV = Math.ceil(w / .62) - 1, gd = b.d1 + .02; for (let k = 1; k <= nV; k++) bx(.035, h, gd - .02, gd + .02, frameMat, b.u0 + w * k / (nV + 1), (b.y0 + b.y1) / 2, false);
          if (h > 1.1) bx(w, .035, gd - .02, gd + .02, frameMat, uc, b.y1 - h * .28, false); }
        bx(tw, h + .1, (wd - .03), wd + .05, trim, b.u0 - tw / 2, (b.y0 + b.y1) / 2); bx(tw, h + .1, (wd - .03), wd + .05, trim, b.u1 + tw / 2, (b.y0 + b.y1) / 2);
        bx(ww, .09, (wd - .03), wd + .05, trim, uc, b.y1 + .045); bx(ww + .1, .06, (wd - .03), wd + .12, trim, uc, b.y0 - .03);
        ao([b.u0 - tw, b.y0 - .06, wd + .003], [b.u1 + tw, b.y0 - .06, wd + .003], [0, -.22, 0], .28);
        let topY = b.y1 + .09;
        if (r3 < .62 && w >= .5) { const ya = yHiLim(b.y1) - (b.y1 + .09); const ex = archOver(uc, ww, b.y1 + .09, ya, archPref, .09, archFillSolid ? 'solid' : 'lattice', wd, 2 + i); if (ex) topY = ex; }
        occ.push({ u0: b.u0 - tw - .02, u1: b.u1 + tw + .02, y0: b.y0 - .1, y1: topY + .05, id: 'trim' + i });
        if (w >= .5 && r4 < shutterP) { const lw = clamp(w / 2, .25, .52), hh = h + .04, tx = cached('leaf' + lw.toFixed(2) + hh.toFixed(2) + palI, () => new THREE.MeshStandardMaterial({ map: leafTex(THREE, renderer, lw, hh, pal, 9), roughness: .6 }));
          for (const sg of [-1, 1]) { const u1c = sg < 0 ? b.u0 - tw - .03 - lw / 2 : b.u1 + tw + .03 + lw / 2;
            if (free(u1c - lw / 2, u1c + lw / 2, b.y0 - .04, b.y1 + .04, id)) { bx(lw, hh, wd, wd + .03, wood, u1c, (b.y0 + b.y1) / 2); plane(lw, hh, tx, u1c, (b.y0 + b.y1) / 2, wd + .032); occ.push({ u0: u1c - lw / 2, u1: u1c + lw / 2, y0: b.y0 - .04, y1: b.y1 + .04, id: 'leaf' + i + sg }); } } }
      }
    });
    if (night) for (const [, y] of [[0, 0]]) { /* مصابيح السقف لا تُضاف: نمط حجازي يعتمد فوانيس الأبواب وتوهج الروشان */ }
    if (side === 's') south = { X0, X1, wallD };
  }
  if (!south) return {};
  // ===== البوابات: أقصى بروز فعلي، وعدم تغيّر هندسة الفتحات/الجدران، والعناصر المعلّقة
  let maxP = 0, attached = 0; const worst = [];
  for (const { side, G, n, wallD } of groups) { G.updateMatrixWorld(true); G.traverse(o => { if (!o.isMesh || !o.geometry) return; const b = new THREE.Box3().setFromObject(o); const ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z], p = (Math.max(...ds) - wallD) * 1000;
    if (p > maxP) { maxP = p; worst.length = 0; worst.push(side + ':' + (o.geometry.type) + ':' + p.toFixed(0)); } const dmin = Math.min(...ds); if (dmin > wallD + .02) attached++; }); }
  const after = snap(), same = before.length === after.length && before.every((v, i) => v === after[i]);
  const niNotes = notes.filter(x => /HISTORICAL|غير/.test(x)); niNotes.push('درجات مدخل أعمق من 25 سم (دكة/سلالم تاريخية) غير منفّذة: اقتصرت على دكة 25 سم', 'الروشان التاريخي (عمق ≥1 م، ارتفاع ~3 م، كوابيل خشبية ثقيلة) غير منفّذ تحت القيد الحالي؛ نُفّذ قشرة ضحلة', 'فتحات الأجنحة المرتدة أكثر من 1.9 م خلف مستوى الواجهة لا تُعالَج بالنمط (تبقى كما صُمّمت)');
  _gate = { maxProjectionMm: Math.round(maxP), openingsUnchanged: same, notImplemented: niNotes, detail: { worst, lockedMeshes: before.length, floatingByDesignAttached: attached, orn, palette: pal.n, roshanDepthMm: Math.round(PR * 1000) } };
  console.info('GATES ' + JSON.stringify({ p: _gate.maxProjectionMm, same, d: _gate.detail }));
  return { wallZ: south.wallD, X0: south.X0, X1: south.X1, notes };
}
