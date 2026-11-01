// المسودة المرفوضة على صفحة التصميم: جلسة حقيقية (genC) مع نسخة ثانية حالتها «محجوب» كما في الصورة B (السبب نفسه نصًا)
import { readFileSync, mkdirSync } from 'node:fs'; import { createRequire } from 'node:module'; import { serve } from './serve.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [dist, shots, tag] = process.argv.slice(2); mkdirSync(shots, { recursive: true });
const s = JSON.parse(readFileSync('genC.json', 'utf8')).session; const d0 = s.designs[0];
const reason = 'شرط أساسي غير متحقق — موقف موازٍ للشارع في ارتداد أقل من 5.5 م أمام نافذة: «موقف سيارة» موازٍ للشارع في ارتداد 3.13 م أمام نافذة «دورة مياه الرجال» — دخول السيارة غير عملي (شرط أساسي في تصميم البيت السعودي (خصوصية/وظيفة)، ويمكنك طلب غيره صراحةً)';
s.designs.push({ ...d0, version: 2, feedback: null, presentation: { ...(d0.presentation || {}), status: 'hidden', label_ar: 'محجوب', hidden_ar: [reason], edits_ar: [] } }); s.current = 1;
const S = serve(dist, 8611); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1024, height: 1366 } });
await p.route(/googleapis|gstatic|workers\.dev/, r => r.abort()); p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto(S.ORIGIN + '/home.html'); await p.evaluate(x => { localStorage.clear(); localStorage.setItem('mizan.design.session.v1', x); }, JSON.stringify(s));
await p.goto(S.ORIGIN + '/design.html'); await p.waitForTimeout(1500);
const r = await p.evaluate(() => ({ approveDisabled: document.getElementById('btnApprove')?.disabled, approveText: document.getElementById('btnApprove')?.innerText, verdict: document.getElementById('ledgerVerdict')?.innerText || document.querySelector('#ledger .score')?.innerText, status: document.querySelector('#presentationStatus .score')?.innerText, badge: !!document.querySelector('.rejected-badge'), back: document.getElementById('btnBack')?.innerText || null }));
console.log(JSON.stringify(r, null, 1)); await p.screenshot({ path: `${shots}/design-hidden-${tag}.png` });
let ok = r.approveDisabled === true && r.badge && !/^نُفّذت كل/.test(r.verdict || '') && /مرفوض/.test(r.status || ''); console.log(ok ? 'PASS' : 'FAIL', 'المسودة المرفوضة لا تُعرض كأنها مقبولة');
await b.close(); S.close(); process.exit(ok ? 0 : 1);
