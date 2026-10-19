// فحص حي لوكيل Claude المنشور: الحالة ثم عبارات حقيقية؛ يطبع ما يعيده Claude كما هو. الرمز من متغير بيئة (سر GitHub).
const BASE = process.env.PROBE_BASE || 'https://almizan-handasi.aljeryabod.workers.dev';
const code = process.env.MIZAN_TEST_CODE || '';
const H = { 'Content-Type': 'application/json', Origin: BASE, 'X-Mizan-Access-Code': code };
const st = await fetch(BASE + '/api/assistant/status', { headers: { Origin: BASE } });
console.log('STATUS', st.status, await st.text());
const plot = { width: 20, length: 30, floors: 1, streets: { s: true }, entry: 's' };
const prompts = (process.env.PROBE_PROMPTS || '').split('||').filter(Boolean);
for (const prompt of prompts) {
  const t0 = Date.now();
  const r = await fetch(BASE + '/api/assistant', { method: 'POST', headers: H, body: JSON.stringify({ prompt, plot, previous: { summary: 'ابدأ من برنامج فارغ، واستخرج ما ذكره العميل فقط.', rooms: [] } }) });
  const body = await r.text();
  console.log('\n=== ' + prompt + '\nHTTP ' + r.status + ' ' + (Date.now() - t0) + 'ms\n' + body);
}
