// (الجولة 21) قياس الشمول على طلبات عشوائية حتمية: أراضٍ (أبعاد ونسب)، وشوارع (جنوبي/شمالي/شرقي/غربي/زاوية)، ودور ودوران، وبرامج
// (3–6 غرف، مجلس أو مجلسان، خادمة وسائق وغرفة ملابس، بنود موضع، مقاسات صريحة). لكل طلب: هل أنتج المحرك مخططًا سليمًا واحدًا على الأقل
// (معروضًا غير محجوب بمخالفة إلزامية)، أو رفضه بكشف الاستحالة، أو فشل بعد البحث؟ ونص الإشعار يُفحص بفاحص المصطلحات الداخلية.
// الاستعمال: node scripts/coverage-r21.mjs <label> [--seed dev|eval] [--n 40] [--engine v3] [--part i/k]
// بذرتان: «dev» تُستعمل في التطوير علنًا، و«eval» لا تُستعمل إلا للقياس قبل/بعد (لا ضبط عليها).
import { mkdirSync, writeFileSync } from 'node:fs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as V2 from '../dist/villa-layout-v2.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { shortfallNotice, internalLeaks } from '../dist/client-text.mjs';

const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) || 'scratch';
const seedName = opt('seed') || 'dev', N = Number(opt('n') || 40), engine = opt('engine') || 'v3';
const part = (opt('part') || '0/1').split('/').map(Number);
const SEEDS = { dev: 2026102501, eval: 2026102577 };
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** طلب عشوائي كما يكتبه عميل (الأرقام أمثلة عشوائية لا قيم في الموقع). */
export function randomCase(R, i) {
  const pick = a => a[Math.floor(R() * a.length)];
  const streets = pick([['s'], ['s'], ['n'], ['e'], ['w'], ['s', 'e'], ['n', 'w'], ['s', 'w'], ['n', 'e']]);
  const floors = R() < .25 ? 2 : 1;
  const width = Math.round(14 + R() * 18), length = Math.round(20 + R() * 16);
  const bedrooms = 3 + Math.floor(R() * (floors === 2 ? 4 : 3)), majlis = R() < .6 ? 2 : 1;
  const parts = [];
  if (floors === 2) parts.push('دورين:');
  else if (R() < .5) parts.push('فيلا دور واحد:');
  const master = R() < .7, dress = master && R() < .35;
  parts.push(`${bedrooms} غرف نوم${master ? ' منها ماستر' + (dress ? ' بغرفة ملابس' : '') : ''}`);
  const mDim = R() < .2 ? pick(['5×6', '5×7', '6×7', '4.5×6']) : null;
  parts.push(majlis === 2 ? `مجلس رجال${mDim ? ' ' + mDim : ''}${R() < .4 ? ' بمدخل مستقل' : ''}، مجلس نساء` : `مجلس${mDim ? ' ' + mDim : ''}`);
  const big = R() < .3, garden = R() < .25;
  parts.push((big ? 'صالة كبيرة' : 'صالة') + (garden ? ' تطل على الحديقة' : ''));
  const kDim = R() < .15 ? pick(['4×4', '3.5×5', '4×5']) : null;
  parts.push(`مطبخ${kDim ? ' ' + kDim : ''}${R() < .25 ? ' في الخلف' : ''}`);
  parts.push(R() < .25 ? 'طعام قريب من المجلس' : 'طعام');
  if (R() < .4) parts.push('غرفة خادمة' + (R() < .5 ? ' بحمام' : ''));
  if (R() < .2) parts.push('غرفة سائق');
  if (R() < .15) parts.push('غرفة غسيل');
  if (R() < .1) parts.push(`كل غرفة ${pick(['4×4', '4×5'])} تقريبًا`);
  if (floors === 2) parts.push('وغرف النوم فوق');
  const baths = bedrooms + majlis + (R() < .5 ? 1 : 0);
  return { id: `R${i + 1}`, land: { width, length, streets, entries: [streets[0]], floors }, text: parts.join('، ').replace('دورين:،', 'دورين:').replace('واحد:،', 'واحد:'),
    counts: { bedrooms, majlis, baths, kitchens: 1, halls: 1, dining: 1 }, want: R() < .3 ? 3 : 4 };
}
export function casesFor(seedName, n) { const R = rng(SEEDS[seedName]); return Array.from({ length: n }, (_, i) => randomCase(R, i)); }

/** تصنيف أسباب رفض التصاميم المبنية (نصوص الفحص) — للتقرير فقط. */
const BUILT_WHY = [[/مجلس النساء[^.]*(?:عرضه|أصغر)/, 'women-majlis-size'], [/«(?:مجلس الرجال|المجلس)» (?:عرضه|[\d.]+ م² أصغر)/, 'men-majlis-size'], [/الرئيسية [\d.]+ م² أصغر من/, 'master-smaller'],
  [/وصل «maid»|الخادمة[^.]*بالحركة/, 'maid-unreachable'], [/دورة مياه يومية/, 'family-wc-missing'], [/دورات المياه المرسومة|دورة مياه إضافية|دورة مياه الرجال لم تتسع/, 'baths-missing'],
  [/الطعام عرضه/, 'dining-narrow'], [/بلا نافذة/, 'no-window'], [/يفتح مباشرة على/, 'majlis-door-family'], [/الحركة الفعلية/, 'circulation-furniture'], [/بلا جدار تحته|التراكب|فوق فراغ/, 'upper-wall-unsupported'],
  [/لا يمكن الوصول|لا يوجد باب/, 'unreachable-room'], [/بند من طلبك|لم يتحقق: «/, 'client-item-failed'], [/لا دور علوي يتسع/, 'no-upper-fits'], [/لا ترتيب أرضي/, 'no-ground'], [/أضيق من 4.2|الصالة [\d.]+×/, 'hall-narrow']];
const causeOf = w => (BUILT_WHY.find(([re]) => re.test(String(w))) || [null, 'other'])[1];

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = opt('root') ? opt('root').replace(/\/$/, '') + '/' : new URL('../', import.meta.url).pathname;
  const E = await import(root + `dist/villa-layout-${engine === 'v2' ? 'v2' : 'v3'}.mjs`);
  const { extractRequirements: XR } = await import(root + 'dist/requirements.mjs');
  const CL = await import(root + 'dist/client-text.mjs');
  const { sameOrDifferent } = await import(root + 'dist/arch-criterion.mjs');
  let lint = null; try { lint = (await import(root + 'dist/client-language.mjs')).clientLint; } catch { lint = null; }
  const out = [];
  const all = casesFor(seedName, N).filter((_, i) => i % part[1] === part[0]);
  for (const C of all) {
    const req = XR(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
    const two = C.land.floors >= 2 || req.prefs?.floors === 2;
    const t0 = Date.now(), row = { id: C.id, land: C.land, text: C.text, want: C.want, floors: two ? 2 : 1 };
    globalThis.__v2dbg = {}; globalThis.__v2rej = null;
    let o = null, err = null;
    try { o = (two ? E.generateVillaTwoFloors : E.generateVillaDesigns)({ land: C.land, counts: req.counts, requirements: req, keep: C.want, _cf: true }); } catch (e) { err = e; }
    row.ms = Date.now() - t0; row.rssMB = Math.round(process.memoryUsage().rss / 1048576);
    const dbg = globalThis.__v2dbg || {}, search = o?.engine3?.search || err?.search || {};
    // سجل المراحل (غير سلوكي: من خطافات التشخيص الموجودة في المحرك)
    const treeWhy = {}; let treesTried = 0, treesFailed = 0;
    for (const [k, v] of Object.entries(dbg)) { if (k.startsWith('ms:')) { treesTried++; if (String(v).endsWith('x')) treesFailed++; } if (k.startsWith('why:')) for (const w of String(v).split(',').filter(Boolean)) treeWhy[w] = (treeWhy[w] || 0) + 1; }
    const rej = o?.rejected || err?.rejected || [], rejWhy = {};
    for (const r of rej) { const seen = new Set(); for (const w of [...(r.why || []), ...(r.tfWhy || []).map(x => 'tf:' + x)]) { const c = String(w).startsWith('tf:') ? w : causeOf(w); if (!seen.has(c)) { seen.add(c); rejWhy[c] = (rejWhy[c] || 0) + 1; } } }
    row.stages = {
      brief: { understood: (req.understood || []).length, unclear: (req.unclear || []).length, rules: (req.rules || []).length, dims: Object.keys(req.dims || {}) },
      constraints: search.units ? { units: search.units.length, hard: (search.rel || []).filter(r => r.hard).length, clientHard: (search.rel || []).filter(r => r.hard && r.client).length } : null,
      topology: search.grids ? { grids: search.grids.map(g => `${g.nc}x${g.nr}:${g.valid ?? g.ground}`), distinct: search.distinctTopologies ?? null, dimFit: search.dimFit ?? null, picked: search.picked ?? null, twoFloors: search.twoFloors ? { grids: (search.twoFloors.grids || []).map(g => `${g.nc}x${g.nr}:${g.ground}/${g.joint}`), noTree: search.twoFloors.noTree || 0, dimFail: search.twoFloors.dimFail || 0 } : null } : null,
      allocation: { treesTried, treesFailed, topViolations: Object.entries(treeWhy).sort((a, b) => b[1] - a[1]).slice(0, 6) },
      validation: { built: (o?.pool || []).length || null, rejected: rej.length, topReasons: Object.entries(rejWhy).sort((a, b) => b[1] - a[1]).slice(0, 6) },
      timeout: !!(err?.timedOut || o?.timedOut),
    };
    if (o) {
      const st = o.designs.map(d => d.presentation?.status || 'unknown'); row.statuses = st; row.pats = o.designs.map(d => d.pat);
      row.outcome = st.some(s => s !== 'hidden') ? 'sound' : 'hidden-only';
      // البدائل المختلفة معماريًا (المعيار المجمّد r19) بين المعروضة غير المحجوبة
      const ok = o.designs.filter(d => d.presentation?.status !== 'hidden'), pick = [];
      for (const d of ok) { try { if (pick.every(p => sameOrDifferent(p.doc, d.doc).different)) pick.push(d); } catch { /* */ } }
      row.distinctValid = pick.length; row.validShown = ok.length;
      row.notice = CL.shortfallNotice({ requested: C.want, shown: o.designs.length, shortfall_ar: o.designs.length < C.want ? (o.shortfall_client_ar || o.shortfall_ar || '') : null, hidden: o.hidden || [] });
    } else {
      row.code = err?.code || null; row.error = String(err?.message || err).slice(0, 400); row.contract = err?.result || null;
      row.outcome = err?.result ? (err.result.status === 'PROVEN_INFEASIBLE' ? 'proven-infeasible' : 'search-incomplete') : err?.code === 'VILLA_INFEASIBLE' ? 'claimed-infeasible' : 'search-incomplete';
      row.notice = CL.shortfallNotice({ requested: C.want, shown: 0, report_ar: err?.report_ar || err?.message });
      row.distinctValid = 0; row.validShown = 0;
    }
    const nt = JSON.stringify(row.notice || '');
    row.leaks = [...(CL.internalLeaks(nt) || []).map(x => x.match), ...(lint ? lint(nt).map(x => x.match) : [])];
    out.push(row);
    console.log(`${C.id} ${C.land.width}×${C.land.length} ${C.land.streets.join('+')} ${row.floors}F: ${row.outcome} ${row.statuses ? row.statuses.join(',') : row.code} distinct=${row.distinctValid} (${row.ms}ms)${row.leaks.length ? ' LEAK ' + row.leaks.join('|') : ''}`);
  }
  const dir = new URL(`../evidence/coverage-r21/`, import.meta.url).pathname; mkdirSync(dir, { recursive: true });
  const f = `${dir}${label}-${seedName}${part[1] > 1 ? `-p${part[0]}of${part[1]}` : ''}.json`;
  const tally = k => out.filter(r => r.outcome === k).length;
  writeFileSync(f, JSON.stringify({ label, seed: seedName, seedValue: SEEDS[seedName], n: out.length, engine, root, generator: 'scripts/coverage-r21.mjs randomCase()', sound: tally('sound'), hiddenOnly: tally('hidden-only'), provenInfeasible: tally('proven-infeasible'), claimedInfeasible: tally('claimed-infeasible'), searchIncomplete: tally('search-incomplete'), rows: out }, null, 1));
  console.log(`sound ${tally('sound')}/${out.length} → ${f}`);
}
