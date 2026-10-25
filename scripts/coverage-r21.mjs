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

if (import.meta.url === `file://${process.argv[1]}`) {
  const E = engine === 'v2' ? V2 : V3;
  const out = [];
  const all = casesFor(seedName, N).filter((_, i) => i % part[1] === part[0]);
  for (const C of all) {
    const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
    const two = C.land.floors >= 2 || req.prefs?.floors === 2;
    const t0 = Date.now(), row = { id: C.id, land: C.land, text: C.text, want: C.want, floors: two ? 2 : 1 };
    try {
      const o = (two ? E.generateVillaTwoFloors : E.generateVillaDesigns)({ land: C.land, counts: req.counts, requirements: req, keep: C.want });
      const st = o.designs.map(d => d.presentation?.status || 'unknown');
      row.outcome = st.some(s => s !== 'hidden') ? 'sound' : 'hidden-only';
      row.statuses = st; row.pats = o.designs.map(d => d.pat);
      row.notice = shortfallNotice({ requested: C.want, shown: o.designs.length, shortfall_ar: o.designs.length < C.want ? (o.shortfall_ar || '') : null, hidden: o.hidden || [] });
    } catch (e) {
      row.outcome = e.code === 'VILLA_INFEASIBLE' ? 'infeasible' : 'failed'; row.code = e.code || null; row.error = String(e.message || e).slice(0, 400);
      row.notice = shortfallNotice({ requested: C.want, shown: 0, report_ar: e.report_ar || e.message });
    }
    row.leaks = internalLeaks(JSON.stringify(row.notice || ''));
    row.ms = Date.now() - t0;
    out.push(row);
    console.log(`${C.id} ${C.land.width}×${C.land.length} ${C.land.streets.join('+')} ${row.floors}F: ${row.outcome} ${row.statuses ? row.statuses.join(',') : row.code} (${row.ms}ms)${row.leaks.length ? ' LEAK ' + row.leaks.join('|') : ''}`);
  }
  const dir = new URL(`../evidence/coverage-r21/`, import.meta.url).pathname; mkdirSync(dir, { recursive: true });
  const f = `${dir}${label}-${seedName}${part[1] > 1 ? `-p${part[0]}of${part[1]}` : ''}.json`;
  const tally = k => out.filter(r => r.outcome === k).length;
  writeFileSync(f, JSON.stringify({ label, seed: seedName, engine, n: out.length, sound: tally('sound'), hiddenOnly: tally('hidden-only'), infeasible: tally('infeasible'), failed: tally('failed'), rows: out }, null, 1));
  console.log(`sound ${tally('sound')}/${out.length}, hidden-only ${tally('hidden-only')}, infeasible ${tally('infeasible')}, failed ${tally('failed')} → ${f}`);
}
