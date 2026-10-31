// (قرار المالك 2026-10-31، رابعًا) عامل التوليد: يشغّل generateInitialDesign نفسها خارج خيط الواجهة. لا منطق تصميم هنا ولا تغيير للمدخلات أو الترتيب؛
// المحرك حتمي (لا Math.random في وحداته)، والفحص في Chromium أثبت تطابق بصمة الناتج وترتيب البدائل بين الخيط الرئيسي والعامل (scripts/worker-feasibility-probe.mjs).
import { generateInitialDesign } from './home-flow.mjs';
const KEEP = ['name', 'message', 'code', 'status', 'reason', 'result', 'report_ar', 'counterfactual', 'feasibility', 'timedOut'];
const errOut = e => { const o = {}; for (const k of KEEP) if (e && e[k] !== undefined) o[k] = e[k]; if (o.message === undefined) o.message = String(e); try { return structuredClone(o); } catch { return { name: o.name, message: String(o.message), code: o.code }; } };
self.onmessage = async ({ data }) => {
  const { id, input } = data || {};
  try { self.postMessage({ id, ok: true, out: await generateInitialDesign(input) }); }
  catch (e) { self.postMessage({ id, ok: false, error: errOut(e) }); }
};
