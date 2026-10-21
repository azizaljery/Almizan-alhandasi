// الجولة الحادية عشرة: مقارنة «بعد-10» و«بعد-11» بالمراجع الحالي (plan-review/1.3.0 بالبوابات الثقيلة وDISTINCT v2) لكل حالة:
// البدائل المقبولة والمرفوضة وأسباب الرفض، ونسبة تحقق بنود الطلب (السجل الصارم من نص الطلب)، وأدنى اختلاف v2 مع شرحه،
// والمراجعة الإنشائية المبدئية (جسيمة/تنبيه، والحمامات العلوية فوق الرطب)، والحركة الفعلية والتطابق 2D/3D.
// الاستعمال: node scripts/r11-compare.mjs [after-10] [after-11] → evidence/acceptance/<الثانية>/compare-<الأولى>.json
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { reviewDesigns } from '../dist/plan-review.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { archSignatureV2, archDifferenceV2, explainDifference } from '../dist/arch-difference.mjs';
import { structuralPrecheck } from '../dist/structural-precheck.mjs';
import { circulationGate } from '../dist/circulation-proof.mjs';
import { openingConsistency } from '../dist/draw/wall-geometry.mjs';

const [A = 'after-10', B = 'after-11'] = process.argv.slice(2);
const ROOT = new URL('../', import.meta.url).pathname, r2 = v => Math.round(v * 100) / 100;
function stage(st) {
  const out = {};
  for (const C of CASES) {
    const dir = `${ROOT}evidence/acceptance/${st}/${C.id}/`; if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(f => /^alt-\d+\.json$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    const docs = files.map(f => { const j = JSON.parse(readFileSync(dir + f, 'utf8')); return j.doc || j; });
    const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
    const request = { text: C.text, counts: req.counts, land: C.land };
    const rows = reviewDesigns(docs, request, { external: false, distinct: true });
    const res = existsSync(dir + 'result.json') ? JSON.parse(readFileSync(dir + 'result.json', 'utf8')) : {};
    const alts = files.map((f, i) => {
      const r = rows.find(x => x.index === i), led = verifyRequest(docs[i], req, { entry: C.land.entries[0] });
      const sp = structuralPrecheck(docs[i]), cg = circulationGate(docs[i]), oc = openingConsistency(docs[i]);
      const up = sp.levels.slice(1).map(l => l.wetStacking).filter(Boolean)[0] || null;
      return { file: f, accepted: r.passed, failedGates: r.failedGates, reasons_ar: r.rejectReasons_ar.slice(0, 6),
        ledger: { total: led.length, ok: led.filter(x => x.ok).length, pct: led.length ? Math.round(100 * led.filter(x => x.ok).length / led.length) : 100, failed: led.filter(x => !x.ok).map(x => x.text + ': ' + x.why) },
        structural: { serious: sp.counts.serious, warn: sp.counts.warn, seriousCodes: [...new Set(sp.findings.filter(x => x.severity === 'serious').map(x => x.code))], upperBathsOverWet: up },
        circulation: { ok: cg.ok, fails: cg.fails.map(x => x.code) }, consistency: { ok: oc.ok, major: oc.issues.filter(x => x.major).map(x => `${x.id}:${x.code}`), minor: oc.issues.filter(x => !x.major).length } };
    });
    const sig = docs.map(d => archSignatureV2(d)), pairs = [];
    for (let i = 0; i < sig.length; i++) for (let j = i + 1; j < sig.length; j++) { const d = archDifferenceV2(sig[i], sig[j]); pairs.push({ pair: [i + 1, j + 1], verdict: d.verdict, substantive: d.substantive, total: d.total, explanation_ar: explainDifference(d).text }); }
    const minPair = pairs.slice().sort((x, y) => x.substantive.length - y.substantive.length || x.total - y.total)[0] || null;
    out[C.id] = { requested: C.want || 4, produced: docs.length, accepted: alts.filter(a => a.accepted).length, alts, pairsV2: pairs, minV2: minPair, editStability: res.edit ? { text: res.edit.text, consentAsked: !!res.edit.consentAsked, samePattern: res.edit.samePattern, programRoomsKept: res.edit.programRoomsKept, difference: res.edit.difference } : null, shortfallReason: res.shortfallReason || null };
  }
  return out;
}
const a = stage(A), b = stage(B);
const table = CASES.map(C => ({ id: C.id, [A]: a[C.id] && { produced: a[C.id].produced, accepted: a[C.id].accepted, rejected: a[C.id].alts.filter(x => !x.accepted).map(x => `${x.file}: ${x.failedGates.join('+')}`) }, [B]: b[C.id] && { produced: b[C.id].produced, accepted: b[C.id].accepted } }));
writeFileSync(`${ROOT}evidence/acceptance/${B}/compare-${A}.json`, JSON.stringify({ note: 'المراجع الحالي plan-review/1.3.0 (البوابات الثقيلة + DISTINCT بالمقياس v2) على المرحلتين؛ لا يُوصف أي بديل بأنه سليم إنشائيًا أو جاهز للتنفيذ.', [A]: a, [B]: b, table }, null, 1));
for (const t of table) console.log(t.id, `${A}: ${t[A]?.accepted}/${t[A]?.produced} [${(t[A]?.rejected || []).join(' | ')}]`, `${B}: ${t[B]?.accepted}/${t[B]?.produced}`);
