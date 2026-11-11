// فحص يدوي حي لميزة «صورة معمارية احترافية» على الموقع المنشور — يستدعي النموذج الحقيقي فعلًا، فكل تشغيل يستهلك رصيد Workers AI
// (صورة واحدة افتراضيًا). لا يُشغَّل تلقائيًا مع النشر؛ يُستعمل بعد النشر للتحقق والضبط (النموذج، الخطوات، المقاس، البرومبت، عتبة الأمانة).
//
// يرسل لقطة عيّنة من المستودع (tests/fixtures/photo-sample.jpg: واجهة كلاسيكية بدور واحد من مجسم الموقع نفسه) إلى /api/photo،
// يحفظ الناتج، ويطبع الزمن ودرجة الأمانة بمكوّناتها.
//
// الاستعمال:
//   SITE_URL=https://almizan-handasi.aljeryabod.workers.dev node scripts/photo-live-check.mjs
// متغيرات اختيارية: TIER=standard|premium (أو both)، LIGHTING=golden|day|sunset|night، STYLE (الافتراضي C)، FLOORS (1)، SEED،
//   SAMPLE (مسار لقطة أخرى JPEG/PNG)، SAMPLE_W/SAMPLE_H (مقاسها)، OUT (مجلد الحفظ، الافتراضي photo-live-out)، PLAYWRIGHT_MODULE.
// درجة الأمانة تُحسب في متصفح عبر playwright بالدالة نفسها التي يستعملها الموقع؛ إن لم يتوفر playwright تُطبع «غير محسوبة».
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.SITE_URL || 'https://almizan-handasi.aljeryabod.workers.dev').replace(/\/$/, ''), ORIGIN = new URL(BASE).origin;
const OUT = process.env.OUT || path.join(ROOT, 'photo-live-out'); fs.mkdirSync(OUT, { recursive: true });
const tiers = (process.env.TIER || 'standard') === 'both' ? ['standard', 'premium'] : [process.env.TIER || 'standard'];
const lighting = process.env.LIGHTING || 'golden';
const samplePath = process.env.SAMPLE || path.join(ROOT, 'tests/fixtures/photo-sample.jpg'), sample = fs.readFileSync(samplePath);
const mime = sample[0] === 0x89 ? 'png' : 'jpeg', W = +process.env.SAMPLE_W || 768, H = +process.env.SAMPLE_H || 607;
const description = { style: process.env.STYLE || 'C', floors: +process.env.FLOORS || 1, lighting, view: 'facade' };
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

const beforeUrl = `data:image/${mime};base64,${sample.toString('base64')}`, report = []; let failed = 0;
for (const tier of tiers) {
  const body = { image: beforeUrl, width: W, height: H, tier, description, ...(process.env.SEED ? { seed: +process.env.SEED } : {}) };
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/photo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body), signal: AbortSignal.timeout(170000) }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
  const data = await r.json().catch(() => ({})), ms = Date.now() - t0;
  if (!r.ok || !data.image) { failed++; say(`FAIL  ${tier}: HTTP ${r.status} بعد ${ms} م.ث — ${data.error || ''} ${data.code || ''} ${data.detail || ''}`); report.push({ tier, ok: false, http: r.status, ms, error: data.error, code: data.code, detail: data.detail }); continue; }
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(data.image), ext = m[1] === 'jpeg' ? 'jpg' : m[1], file = path.join(OUT, `photo-${tier}-${lighting}.${ext}`);
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
  let f = null, fErr = ''; try { f = await fidelity(beforeUrl, data.image); } catch (e) { fErr = e.message; }
  say(`PASS  ${tier}: صورة ${m[1]} ${(fs.statSync(file).size / 1024).toFixed(0)} ك.ب في ${(ms / 1000).toFixed(1)} ث (زمن الخادم ${(data.ms / 1000).toFixed(1)} ث) — النموذج ${data.model}، البذرة ${data.seed}، المقاس المطلوب ${data.width}×${data.height}`);
  say(f ? `      درجة الأمانة ${f.score} (العتبة ${f.threshold}؛ ${f.ok ? 'تجتاز' : 'دون العتبة'}) — حواف رأسية ${f.vertical}، أفقية ${f.horizontal}، خط السماء ${f.skyline}` : `      درجة الأمانة: غير محسوبة (${fErr || 'playwright غير متاح'})`);
  say(`      المتبقي اليوم ${data.remainingToday} (عدّاد ${data.counter}) — الملف: ${file}`);
  report.push({ tier, ok: true, ms, serverMs: data.ms, model: data.model, seed: data.seed, width: data.width, height: data.height, file: path.basename(file), fidelity: f, remainingToday: data.remainingToday, counter: data.counter });
}
fs.copyFileSync(samplePath, path.join(OUT, 'input-sample.' + (mime === 'png' ? 'png' : 'jpg')));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ site: BASE, at: new Date().toISOString(), description, status: st, results: report }, null, 2));
say(`\nالتقرير: ${path.join(OUT, 'report.json')} — قارن الصورة الناتجة باللقطة input-sample بعينك: الدرجة الآلية تقريبية وعتبتها لم تُعايَر بعد.`);
process.exit(failed ? 1 : 0);
