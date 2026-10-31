#!/usr/bin/env node
// Fast, read-only compatibility check against real Mizan source structure.
// (تصحيح 2026-10-31، قرار المالك ثالثًا) يفحص العقود الفعلية (الصادرات، وسلسلة الاستيراد، وسلوك صغير حتمي بلا توليد) بدل وجود نصوص قد لا تظهر
// في النسخة الصحيحة (كان يبحث عن «r21shower» في v2 و«r21linkall» في v3 فيرفض R21 نفسه). لا يكتب شيئًا ولا يشغّل المحرك الكامل.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = new Set(process.argv.slice(2));
const r21 = args.has('--r21'), combined = args.has('--combined');
const sharaa = !r21 || combined;
const errors = [];
const src = p => { const f = join(root, p); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
const check = (path, patterns) => {
  const s = src(path); if (s === null) { errors.push(path + ': missing'); return; }
  for (const [label, re] of patterns) if (!re.test(s)) errors.push(path + ': ' + label);
};
/** هل يستورد الملف الاسم المحدد من الوحدة المحددة (استيراد ES ثابت)؟ */
const imports = (path, name, from) => { const s = src(path); if (s === null) return false;
  return [...s.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)].some(m => m[2].endsWith(from) && m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).includes(name)); };
const mod = async p => import(pathToFileURL(join(root, p)).href);
const contract = async (label, fn) => { try { const ok = await fn(); if (ok !== true) errors.push(label + (typeof ok === 'string' ? ': ' + ok : '')); } catch (e) { errors.push(label + ': ' + String(e.message || e).slice(0, 160)); } };

check('package.json', [['native build script', /scripts\/build\.mjs/]]);
check('scripts/build.mjs', [['dist/client asset output', /dist\/client/]]);
if (sharaa) {
  check('dist/home.html', [['land before Sharaa', /id="stageLand"/], ['Sharaa stage', /id="stageShara"/]]);
  if (!imports('dist/home.mjs', 'SharaFlow', 'sharaa/flow.mjs')) errors.push('dist/home.mjs: SharaFlow not imported from sharaa/flow.mjs');
  if (!imports('dist/home.mjs', 'generateInitialDesign', 'home-flow.mjs')) errors.push('dist/home.mjs: real generation (generateInitialDesign) not imported');
  await contract('sharaa/flow.mjs: land inherited, mode switch, generate step', async () => {
    const { SharaFlow } = await mod('dist/sharaa/flow.mjs'), { normalizeLand } = await mod('dist/home-flow.mjs');
    const f = new SharaFlow({ land: normalizeLand({ length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 }).land });
    const first = f.start(); if (!first.some(m => m.id === 'mode')) return 'no mode choice';
    if (!(f.brief.land && f.brief.provenance.land?.source === 'land_step')) return 'land not inherited';
    return typeof f.engineInput === 'function' || 'no engineInput';
  });
  await contract('sharaa/adapter.mjs: confirmed direct door ⇒ engine rule door:true (must), unconfirmed ⇒ never hard', async () => {
    const B = await mod('dist/sharaa/brief.mjs'), { toEngineInput } = await mod('dist/sharaa/adapter.mjs'), { extractRequirements } = await mod('dist/requirements.mjs'), { normalizeLand } = await mod('dist/home-flow.mjs');
    const t = 'لازم باب مباشر بين المجلس والطعام'; let b = B.applyExtraction(B.createBrief({ land: normalizeLand({ length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 }).land }), extractRequirements(t, { counts: {} }), t).brief;
    if (toEngineInput(b).requirements.rules.some(r => r.door && r.level === 'must')) return 'unconfirmed sent as must';
    const rel = b.relations.find(x => x.relation === 'direct_access' && x.detail === 'door'); if (!rel) return 'door not captured';
    b = B.decide(b, 'relation:' + rel.id, { priority: 'mandatory' }); const req = toEngineInput(b).requirements;
    if (!req.rules.some(r => r.door && r.level === 'must')) return 'confirmed door not sent';
    if (combined) { const { briefOf, SHARED_BRIEF_VERSION } = await mod('dist/shared-brief.mjs'); const sb = briefOf(req);
      if (sb !== req.brief || sb.version !== SHARED_BRIEF_VERSION || !sb.relations.some(r => r.kind === 'DIRECT_DOOR' && r.level === 'HARD')) return 'R21 shared brief does not carry DIRECT_DOOR from Sharaa'; }
    return true;
  });
  await contract('requirements/rules: «باب مباشر» parsed as door (not «قريب»)', async () => {
    const { extractRequirements } = await mod('dist/requirements.mjs');
    return extractRequirements('لازم باب مباشر بين المجلس والطعام', { counts: {} }).rules.some(r => r.kind === 'adjacent' && r.door === true) && !extractRequirements('ابي المقلط قريب من المجلس', { counts: {} }).rules.some(r => r.door) || 'door parsing contract broken';
  });
  await contract('villa-layout-v3.mjs: direct door is a hard touch constraint (switchable by R14_OFF=r21directdoor)', async () => {
    const { unitsOf } = await mod('dist/villa-layout-v3.mjs'); const s = src('dist/villa-layout-v3.mjs');
    if (!/r21directdoor/.test(s)) return 'owner switch r21directdoor missing';
    if (String(globalThis.process?.env?.R14_OFF || '').split(',').includes('r21directdoor')) return 'disabled by R14_OFF=r21directdoor';
    const { programV2 } = await mod('dist/villa-layout-v2.mjs'), { extractRequirements } = await mod('dist/requirements.mjs'), c = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
    const rel = unitsOf(programV2(c, extractRequirements('لازم المطبخ بباب مباشر على الصالة', { counts: c }))).rel;
    return rel.some(r => r.kind === 'touch' && r.hard && r.client && [r.a, r.b].includes('KS') && [r.a, r.b].includes('H')) || 'client direct door is not a hard constraint in v3';
  });
  check('tests/requirements-direct-door.test.mjs', [['direct door parsing tests', /باب مباشر/]]);
  check('tests/direct-door-engine.test.mjs', [['real engine test', /generateInitialDesign/]]);
  check('scripts/e2e-sharaa-v2.mjs', [['generate button pressed', /GENERATE-BUTTON-SHOWN/]]);
}
if (r21 || combined) {
  // بوابة الدش في R21: الوحدة bath-shower تصدّر showerGate وcompleteShowers، ويستعملهما حكم العرض والتشطيب فعلًا (لا نص مفتاح في v2)
  await contract('R21 shower gate (bath-shower ⇒ presentation-status, r16-polish)', async () => {
    const m = await mod('dist/bath-shower.mjs'); if (typeof m.showerGate !== 'function' || typeof m.completeShowers !== 'function') return 'bath-shower exports missing';
    if (!imports('dist/presentation-status.mjs', 'showerGate', 'bath-shower.mjs')) return 'presentation-status does not use showerGate';
    if (!imports('dist/r16-polish.mjs', 'completeShowers', 'bath-shower.mjs')) return 'r16-polish does not use completeShowers';
    return true;
  });
  // مسار الضيف (06): المولّد يقرأ الباب المباشر من العقد الموحد (briefMajlisDoor) — DIRECT_DOOR يفرض باب المجلس على الطعام، وNEAR لا يفرضه
  await contract('R21 guest route contract (shared brief ⇒ generator)', async () => {
    if (!imports('dist/villa-layout-v2.mjs', 'briefMajlisDoor', 'shared-brief.mjs')) return 'v2 does not read briefMajlisDoor';
    const { extractRequirements } = await mod('dist/requirements.mjs'), { programV2 } = await mod('dist/villa-layout-v2.mjs');
    const c = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
    const door = extractRequirements('المجلس يفتح على الطعام', { counts: c }), near = extractRequirements('الطعام قريب من المجلس', { counts: c });
    if (programV2(c, door).majlisDining !== true) return 'DIRECT_DOOR not seen by generator';
    if (programV2(c, near).majlisDining === true) return 'NEAR wrongly forces a door';
    return true;
  });
  const st = src('wrangler.staging.toml');
  if (st === null) errors.push('wrangler.staging.toml: missing');
  else { const { parseToml } = await mod('scripts/release-kit/guard-toml.mjs'); const t = parseToml(st); if (!/staging/i.test(String(t.root.name || '')) || t.root.name === 'almizan-handasi') errors.push('wrangler.staging.toml: independent worker'); }
  check('.github/workflows/deploy-staging.yml', [['staging branch only', /^\s*branches:\s*\[staging-preview\]\s*$/m]]);
}
if (errors.length) { console.error('SOURCE_CHECK_BLOCKED\n' + errors.map(x=>'- '+x).join('\n')); process.exitCode = 1; }
else console.log('SOURCE_CHECK_PASS — فحص توافق بنيوي وعقود صغيرة فقط؛ لا يغني عن الاختبارات الفعلية');
