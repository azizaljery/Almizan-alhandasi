// (قرار المالك 2026-10-31، رابعًا) التوليد خارج خيط الواجهة: يرسل المدخلات نفسها إلى generation-worker.mjs ويعيد الناتج نفسه (نسخة structured clone)،
// والخطأ بحقوله التي يقرؤها شرعاء (code/result/report_ar/counterfactual/feasibility). إن تعذّر العامل (متصفح بلا Worker من نوع module، أو فشل تحميله)
// يعود إلى التوليد على الخيط الرئيسي كما كان — النتيجة نفسها، والفرق في تجمّد الواجهة فقط.
import { generateInitialDesign } from './home-flow.mjs';
let worker = null, disabled = false, seq = 0;
const pending = new Map();
const revive = p => Object.assign(new Error(p?.message || 'تعذّر التوليد'), p || {});
function fallbackAll() { disabled = true; try { worker?.terminate(); } catch { /* */ } worker = null; for (const [id, job] of pending) { pending.delete(id); generateInitialDesign(job.input).then(job.resolve, job.reject); } }
function ensure() {
  if (worker || disabled) return worker;
  if (typeof Worker !== 'function' || globalThis.__mizanNoWorker) { disabled = true; return null; }
  try { worker = new Worker(new URL('./generation-worker.mjs', import.meta.url), { type: 'module' }); } catch { disabled = true; return null; }
  worker.onmessage = ({ data }) => { const job = pending.get(data?.id); if (!job) return; pending.delete(data.id); data.ok ? job.resolve(data.out) : job.reject(revive(data.error)); };
  worker.onerror = ev => { ev?.preventDefault?.(); fallbackAll(); };
  worker.onmessageerror = () => fallbackAll();
  return worker;
}
/** generateInitialDesign بالعقد نفسه، دون حجب الواجهة. */
export function generateOffThread(input) {
  const w = ensure(); if (!w) return generateInitialDesign(input);
  return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { input, resolve, reject });
    try { w.postMessage({ id, input }); } catch { pending.delete(id); generateInitialDesign(input).then(resolve, reject); } });
}
export const generationMode = () => (worker ? 'worker' : disabled ? 'main-thread' : 'idle');
