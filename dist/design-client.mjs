// واجهة عامل التوليد من الصفحات: run(op, args) ينفّذ في Web Worker (design-worker.mjs) فلا تتجمّد الواجهة،
// وإن لم يتوفر العامل (متصفح قديم، أو تعذّر تحميله) يُنفَّذ في الخيط الرئيسي بالدوال نفسها — النتيجة واحدة.
let worker = null, dead = false, seq = 0;
const waiting = new Map();

function failAll(reason) { for (const w of waiting.values()) w.fallback(reason); waiting.clear(); }
function boot() {
  if (worker || dead) return worker;
  try {
    if (typeof Worker !== 'function') throw Error('no Worker');
    worker = new Worker(new URL('./design-worker.mjs', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ev => {
      const w = waiting.get(ev.data?.id); if (!w) return; waiting.delete(ev.data.id);
      if (ev.data.ok) w.resolve(ev.data.result);
      else { const e = Error(ev.data.error?.message || 'خطأ غير معروف'); if (ev.data.error?.code) e.code = ev.data.error.code; if (ev.data.error?.unclear) e.unclear = ev.data.error.unclear; w.reject(e); }
    });
    // تعذّر تحميل العامل أو تعطّل: ما كان ينتظر يُنفَّذ في الخيط الرئيسي، وما بعده كذلك
    const down = () => { dead = true; try { worker?.terminate(); } catch { /* انتهى */ } worker = null; failAll('worker-error'); };
    worker.addEventListener('error', down); worker.addEventListener('messageerror', down);
  } catch { dead = true; worker = null; }
  return worker;
}

let local = null, localRunning = 0;
async function runLocal(op, args) {
  localRunning++;
  try {
    local ||= import('./design-worker.mjs');
    const { OPS, plain } = await local;
    await new Promise(r => setTimeout(r, 30)); // يُرسم مؤشر الانتظار قبل أن ينشغل الخيط
    return plain(await OPS[op](args || {}));
  } finally { localRunning--; }
}
/** هل يوجد توليد جارٍ الآن؟ (لا يُبدأ طلب ثانٍ يعدّل الجلسة نفسها قبل انتهاء الأول) */
export const pending = () => [...waiting.values()].filter(w => w.op !== 'ping').length + localRunning > 0;

/** هل يعمل التوليد خارج الخيط الرئيسي الآن؟ (للاختبارات والقياس) */
export const offMainThread = () => !!worker && !dead;
/** تحميل العامل ووحدات المولّد مسبقًا (والمتصفح خامل) حتى لا ينتظرها أول طلب. */
export function warm() { if (boot()) run('ping').catch(() => {}); }
export function run(op, args) {
  const w = boot();
  if (!w) return runLocal(op, args);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { op, resolve, reject, fallback: () => runLocal(op, args).then(resolve, reject) });
    try { w.postMessage({ id, op, args }); } catch { waiting.delete(id); runLocal(op, args).then(resolve, reject); }
  });
}
export const generateInWorker = (input, sessionArgs) => run('generate', { input, sessionArgs });
export const redesignInWorker = (session, ask) => run('redesign', { session, ask });
export const fixInWorker = (session, id) => run('fix', { session, id });
export const mergeInWorker = (session, a, b) => run('merge', { session, a, b });
export const diagnoseInWorker = input => run('diagnose', { input });

/**
 * مؤشر انتظار صادق: نص الحالة + الثواني المنقضية فعلًا (لا نسبة مخترعة)، يتحدث كل ثانية ما دام العمل جاريًا.
 * يعيد دالة الإيقاف.
 */
export function ticking(node, text, { every = 1000 } = {}) {
  if (!node) return () => {};
  const t0 = Date.now(); node.dataset.busy = '1';
  const paint = () => { const s = Math.round((Date.now() - t0) / 1000); node.textContent = text + (s >= 2 ? ` (${s} ث)` : ''); };
  paint(); const h = setInterval(paint, every);
  return () => { clearInterval(h); delete node.dataset.busy; };
}
export default { run, warm, ticking, offMainThread, pending };
