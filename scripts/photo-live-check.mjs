// فحص يدوي حي لميزة «صورة معمارية احترافية» على الموقع المنشور — يستدعي النموذج الحقيقي فعلًا، فكل تشغيل يستهلك رصيد Workers AI
// (صورة واحدة افتراضيًا). لا يُشغَّل تلقائيًا مع النشر؛ يُستعمل بعد النشر للتحقق والضبط (النموذج، الخطوات، المقاس، البرومبت، عتبة الأمانة).
//
// يرسل لقطة عيّنة من المستودع (tests/fixtures/photo-sample.jpg: واجهة كلاسيكية بدور واحد من مجسم الموقع نفسه) إلى /api/photo،
// يحفظ الناتج، ويطبع الزمن ودرجة الأمانة بمكوّناتها.
//
// الاستعمال:
//   SITE_URL=https://almizan-handasi.aljeryabod.workers.dev node scripts/photo-live-check.mjs
// متغيرات اختيارية: TIER=standard|premium (أو both)، LIGHTING=golden|day|sunset|night، STYLE (الافتراضي C)، FLOORS (1)، SEED،
//   VARIANTS=matrix  ← المصفوفة المعتمدة (16 صورة): 5 طرز × (نهار/ذهبي/ليل) × (دور/دورين) بلقطات مدخلات مصيَّرة لكل طراز (tests/fixtures/photo-matrix)،
//     أو قائمة style:lighting:floors[:tier] مثل N:golden:2,H:night:1:premium (حتى 16). تُنتج report.html بالمقارنة قبل/بعد ودرجة الأمانة وتجميعها.
//   VARIANTS (النمط القديم): عدة صور في تشغيل واحد للمقارنة، مفصولة بفواصل، كل واحدة tier:lighting[:seed] — مثل
//     VARIANTS=premium:golden,premium:day,premium:sunset,premium:night     أو     VARIANTS=premium:golden:1,premium:golden:2
//     (كل صورة تستهلك رصيدًا؛ حد الخادم 3 طلبات في الدقيقة فينتظر السكربت تلقائيًا عند 429). بدونه: صورة واحدة لكل مستوى في TIER.
//   ملف إعداد اختياري (.github/photo-live-check.conf أو PHOTO_LIVE_CONF): أسطر KEY=VALUE تُستعمل لما لم يُضبط في البيئة
//     (يفيد عند التشغيل بالدفع إلى الفرع photo-live-check حيث لا مدخلات).
//   SAMPLE (مسار لقطة أخرى JPEG/PNG)، SAMPLE_W/SAMPLE_H (مقاسها)، OUT (مجلد الحفظ، الافتراضي photo-live-out)، PLAYWRIGHT_MODULE.
// درجة الأمانة تُحسب في متصفح عبر playwright بالدالة نفسها التي يستعملها الموقع؛ إن لم يتوفر playwright تُطبع «غير محسوبة».
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { parseRows, rowName, shotKey, MAX_IMAGES, countByTier } from './photo-live-matrix.mjs';
import { reportHtml, costEstimate } from './photo-live-report.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
{ // ملف الإعداد: لا يغلب متغير بيئة مضبوطًا
  const conf = process.env.PHOTO_LIVE_CONF || path.join(ROOT, '.github/photo-live-check.conf');
  if (fs.existsSync(conf)) for (const line of fs.readFileSync(conf, 'utf8').split('\n')) { const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
}
const BASE = (process.env.SITE_URL || 'https://almizan-handasi.aljeryabod.workers.dev').replace(/\/$/, ''), ORIGIN = new URL(BASE).origin;
const OUT = process.env.OUT || path.join(ROOT, 'photo-live-out'); fs.mkdirSync(OUT, { recursive: true });
const lighting0 = process.env.LIGHTING || 'golden';
const spec = (process.env.VARIANTS || '').trim(), matrixMode = spec === 'matrix' || /^[NHSCM]:/.test(spec);
let rows = [], legacy = [];
if (matrixMode) { try { rows = parseRows(spec); } catch (e) { console.log('FAIL  ' + e.message); process.exit(1); } }
else legacy = spec
  ? spec.split(',').map(v => v.trim()).filter(Boolean).map(v => { const [tier, lighting = lighting0, seed] = v.split(':'); return { tier, lighting, ...(seed ? { seed: +seed } : process.env.SEED ? { seed: +process.env.SEED } : {}) }; })
  : ((process.env.TIER || 'standard') === 'both' ? ['standard', 'premium'] : [process.env.TIER || 'standard']).map(tier => ({ tier, lighting: lighting0, ...(process.env.SEED ? { seed: +process.env.SEED } : {}) }));
const count = matrixMode ? rows.length : legacy.length;
if (count > (matrixMode ? MAX_IMAGES : 8)) { console.log(`FAIL  أكثر من ${matrixMode ? MAX_IMAGES : 8} صور في تشغيل واحد غير مسموح (حماية الرصيد).`); process.exit(1); }
const samplePath = process.env.SAMPLE || path.join(ROOT, 'tests/fixtures/photo-sample.jpg');
function imageSize(b) { // مقاس PNG/JPEG من الترويسة
  if (b[0] === 0x89) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); }
  return [0, 0];
}
// المهام: كل مهمة = لقطة مدخلة + وصف + مستوى. المصفوفة: لقطة لكل (طراز، أدوار، نهار/ليل)؛ النمط القديم: اللقطة العيّنة الواحدة.
const jobs = matrixMode
  ? rows.map((r, i) => { const key = shotKey(r), file = path.join(ROOT, 'tests/fixtures/photo-matrix', key + '.jpg'); if (!fs.existsSync(file)) { console.log('FAIL  لقطة المدخل غير موجودة: ' + file); process.exit(1); } const buf = fs.readFileSync(file), [w, h] = imageSize(buf); return { name: rowName(r, i), tier: r.tier, lighting: r.lighting, style: r.style, floors: r.floors, buf, file, key, W: w, H: h, description: { style: r.style, floors: r.floors, lighting: r.lighting, view: 'facade' } }; })
  : legacy.map((v, i) => { const buf = fs.readFileSync(samplePath), [iw, ih] = imageSize(buf); return { name: `photo-${String(i + 1).padStart(2, '0')}-${v.tier}-${v.lighting}${v.seed !== undefined ? '-s' + v.seed : ''}`, tier: v.tier, lighting: v.lighting, style: process.env.STYLE || 'C', floors: +process.env.FLOORS || 1, seed: v.seed, buf, file: samplePath, key: 'sample', W: +process.env.SAMPLE_W || iw, H: +process.env.SAMPLE_H || ih, description: { style: process.env.STYLE || 'C', floors: +process.env.FLOORS || 1, lighting: v.lighting, view: 'facade' } }; });
if (jobs.some(j => !(j.W > 0 && j.H > 0))) { console.log('FAIL  تعذّر قراءة مقاس اللقطة؛ اضبط SAMPLE_W و SAMPLE_H.'); process.exit(1); }
const say = (...a) => console.log(...a);

async function fidelity(beforeUrl, afterUrl) {
  let chromium; try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); } catch { return null; }
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage(); await page.setContent('<!doctype html><title>fidelity</title>');
    const src = fs.readFileSync(path.join(ROOT, 'dist/photo-fidelity.mjs'), 'utf8');
    return await page.evaluate(async ({ src, a, b }) => {
      const m = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      const px = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = 384; c.height = 256; const x = c.getContext('2d'); x.drawImage(i, 0, 0, 384, 256); res(x.getImageData(0, 0, 384, 256)); }; i.onerror = () => rej(new Error('image')); i.src = url; });
      const [A, B] = await Promise.all([px(a), px(b)]); return m.fidelityScore(A, B);
    }, { src, a: beforeUrl, b: afterUrl });
  } finally { await browser.close(); }
}

const st = await fetch(`${BASE}/api/photo/status?check=${Date.now()}`).then(async r => ({ http: r.status, ...(await r.json().catch(() => ({}))) })).catch(e => ({ http: 0, error: e.message }));
say('الحالة:', JSON.stringify(st));
if (st.http !== 200) { say('FAIL  نقطة الحالة لا تستجيب 200 — هل نُشر هذا الإصدار؟'); process.exit(1); }
if (!st.configured) { say('INFO  الخدمة غير مهيأة (ربط AI غير موجود أو السقف صفر). لا شيء يُختبر.'); process.exit(2); }

const report = []; let failed = 0, lastStart = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = body => fetch(`${BASE}/api/photo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body), signal: AbortSignal.timeout(170000) }).catch(e => ({ ok: false, status: 0, headers: new Headers(), json: async () => ({ error: e.message }) }));
const cost = costEstimate(countByTier(matrixMode ? rows : jobs.map(j => ({ tier: j.tier }))));
say(`${matrixMode ? 'المصفوفة المعتمدة' : 'اللقطة العيّنة ' + path.basename(samplePath)} — ${jobs.length} صورة: ${jobs.map(j => j.name).join('، ')}`);
say(`التكلفة التقريبية: ${cost.total}$ — ${cost.note}`);
for (const j of jobs) {
  const { tier, lighting } = j, beforeUrl = `data:image/${j.buf[0] === 0x89 ? 'png' : 'jpeg'};base64,${j.buf.toString('base64')}`;
  const body = { image: beforeUrl, width: j.W, height: j.H, tier, description: j.description, ...(j.seed !== undefined ? { seed: j.seed } : {}) };
  const gap = 21000 - (Date.now() - lastStart); if (lastStart && gap > 0) await sleep(gap); // حد الخادم 3 طلبات في الدقيقة لكل عنوان
  lastStart = Date.now(); let t0 = Date.now(), r = await post(body), data = await r.json().catch(() => ({}));
  if (r.status === 429 && data.code === 'RATE_MINUTE') { const w = Math.min(65, (+r.headers.get('Retry-After') || 60) + 1); say(`INFO  حد الدقيقة؛ أنتظر ${w} ث ثم أعيد…`); await sleep(w * 1000); lastStart = Date.now(); t0 = Date.now(); r = await post(body); data = await r.json().catch(() => ({})); }
  const ms = Date.now() - t0, name = j.name, meta = { name, tier, lighting, style: j.style, floors: j.floors, input: 'in-' + j.key + '.jpg' };
  fs.copyFileSync(j.file, path.join(OUT, meta.input));
  if (!r.ok || !data.image) { failed++; say(`FAIL  ${name}: HTTP ${r.status} بعد ${ms} م.ث — ${data.error || ''} ${data.code || ''} ${data.detail || ''}`); report.push({ ...meta, ok: false, http: r.status, ms, error: data.error, code: data.code, detail: data.detail, attempts: data.attempts }); continue; }
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(data.image), ext = m[1] === 'jpeg' ? 'jpg' : m[1], file = path.join(OUT, `${name}.${ext}`);
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
  let f = null, fErr = ''; try { f = await fidelity(beforeUrl, data.image); } catch (e) { fErr = e.message; }
  say(`PASS  ${name}: صورة ${m[1]} ${(fs.statSync(file).size / 1024).toFixed(0)} ك.ب في ${(ms / 1000).toFixed(1)} ث (زمن الخادم ${(data.ms / 1000).toFixed(1)} ث) — النموذج ${data.model}، الخطوات ${data.steps ?? '—'}، محاولات المزوّد ${data.attempts ?? 1}، البذرة ${data.seed}، المقاس المطلوب ${data.width}×${data.height}`);
  say(f ? `      درجة الأمانة ${f.score} (العتبة ${f.threshold}؛ ${f.ok ? 'تجتاز' : 'دون العتبة'}) — حواف رأسية ${f.vertical}، أفقية ${f.horizontal}، الكتلة ${f.massing} (حافة السقف ${f.roof}، خط أفقي مضاف ${f.added})، خط السماء للمعلومة ${f.skyline}` : `      درجة الأمانة: غير محسوبة هنا (${fErr || 'playwright غير متاح'}) — تُحسب عند فتح report.html`);
  say(`      المتبقي اليوم ${data.remainingToday} (عدّاد ${data.counter}) — الملف: ${file}`);
  report.push({ ...meta, ok: true, ms, serverMs: data.ms, model: data.model, steps: data.steps, attempts: data.attempts, seed: data.seed, width: data.width, height: data.height, file: path.basename(file), fidelity: f, remainingToday: data.remainingToday, counter: data.counter });
}
const at = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ site: BASE, at, mode: matrixMode ? 'matrix' : 'sample', status: st, cost, results: report }, null, 2));
let fsrc = ''; try { fsrc = fs.readFileSync(path.join(ROOT, 'dist/photo-fidelity.mjs'), 'utf8').replace(/^export /gm, '').replace(/^export \{[^}]*\};?$/gm, ''); } catch { /* التقرير بلا حساب أمانة عند الفتح */ }
fs.writeFileSync(path.join(OUT, 'report.html'), reportHtml({ site: BASE, at, results: report, status: st, fidelitySrc: fsrc, cost }));
say(`\nالتقرير: ${path.join(OUT, 'report.html')} و report.json — قارن الصورة الناتجة بلقطة المجسم بعينك: الدرجة الآلية تقريبية وعتبتها معايَرة على عيّنة حية واحدة فقط.`);
process.exit(failed ? 1 : 0);
