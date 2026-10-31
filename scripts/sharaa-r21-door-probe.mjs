// (تكامل شرعاء+R21، أداة قياس غير سلوكية) نُسخت كما شُغّلت. تنبيه معروف: في مسار sharaa يطغى requirements.counts من المحوّل (أعداد غير مؤكدة = 0) على counts المُمرَّرة في req المستعمل للتحقق فقط، فيظهر «بدون غرفة طعام» خطأً في حالة maqlat — أثر في المسبار لا في المحرك (التوليد استعمل counts الصحيحة).
// مسبار عقد شرعاء ↔ المحرك: نفس الطلب عبر محوّل شرعاء (toEngineInput) وعبر extractRequirements مباشرة.
// الاستعمال: node probe-contract.mjs <repoRoot> <caseId> [path=sharaa|direct]
import { pathToFileURL } from 'node:url';
const [root, caseId, path = 'sharaa'] = process.argv.slice(2);
const imp = p => import(pathToFileURL(root + '/' + p).href);
const { normalizeLand, generateInitialDesign } = await imp('dist/home-flow.mjs');
const { extractRequirements } = await imp('dist/requirements.mjs');
const { verifyRequest } = await imp('dist/rules.mjs');
const CASES = {
  door: { text: 'لازم باب مباشر بين المجلس والطعام', land: { length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 } },
  maqlat: { text: 'ابي مجلس رجال بمقلط', land: { length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 } },
  kdoor: { text: 'لازم المطبخ بباب مباشر على الطعام', land: { length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 } },
  hall: { text: 'لازم المجلس بباب مباشر على الصالة', land: { length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 } },
};
const c = CASES[caseId]; const counts = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
const land = normalizeLand(c.land).land;
let input, req;
if (path === 'sharaa') {
  const B = await imp('dist/sharaa/brief.mjs'); const { toEngineInput } = await imp('dist/sharaa/adapter.mjs');
  let b = B.applyExtraction(B.createBrief({ land }), extractRequirements(c.text, { counts: {} }), c.text).brief;
  // تأكيد العميل: الأعداد وكل البنود كما قالها (إلزامي حيث قال «لازم»)
  for (const r of b.relations) b = B.decide(b, 'relation:' + r.id, { priority: r.priority === 'mandatory' ? 'mandatory' : 'preferred' });
  const ans = B.applyCounts ? B.applyCounts(b, counts) : null; if (ans) b = ans.brief || ans;
  const e = toEngineInput(b); req = { ...e.requirements, counts: { ...counts, ...e.requirements.counts } };
  input = { land: e.land, counts: { ...counts }, requirements: { ...req, counts: { ...counts } } };
  console.log('ADAPTER rules', JSON.stringify(e.requirements.rules.map(r => ({ k: r.kind, a: r.a, b: r.b, door: r.door, level: r.level }))), 'blockers', JSON.stringify(e.blockers.map(x => x.type)));
  console.log('ADAPTER has brief/relations/text:', !!e.requirements.brief, !!e.requirements.relations, JSON.stringify(e.requirements.text));
} else {
  req = extractRequirements(c.text, { counts }); req.counts = { ...req.counts, ...counts }; input = { land, counts: req.counts, requirements: req };
  console.log('DIRECT rules', JSON.stringify(req.rules.map(r => ({ k: r.kind, a: r.a, b: r.b, door: r.door, level: r.level }))), 'relations', JSON.stringify((req.relations || []).map(r => r.kind)));
}
const t0 = Date.now(); let out;
try { out = await generateInitialDesign(input); } catch (e) { console.log('ERROR', e.code, String(e.message).slice(0, 300), e.result?.status || '', e.result?.reason || ''); console.log('SECONDS', ((Date.now() - t0) / 1000).toFixed(1)); process.exit(0); }
const alts = out.alternatives || [];
console.log('SECONDS', ((Date.now() - t0) / 1000).toFixed(1), 'alts', alts.length, 'hiddenList', (out.hidden || []).length, 'outcome', JSON.stringify(out.alternativesInfo?.outcome || out.presentationSummary?.outcome || null));
for (const [i, a] of alts.entries()) {
  const items = verifyRequest(a.doc, req, { entry: c.land.entries[0] }).filter(x => /باب مباشر|مقلط|طعام/.test(x.text || ''));
  console.log(` alt${i + 1} status=${a.presentation?.status} gates=${JSON.stringify((a.review?.failedGates || []).map(g => g.id || g))} door=${JSON.stringify(items.map(x => [x.text, x.ok, String(x.why).slice(0, 120)]))} hidden=${JSON.stringify((a.presentation?.hidden_ar || []).slice(0, 2))}`);
}
for (const h of (out.hidden || []).slice(0, 4)) console.log(' HIDDEN', JSON.stringify((h.reasons_ar || []).slice(0, 2)).slice(0, 300));
