#!/usr/bin/env node
// مثبّت الميزان: يطبّق شريط المعاينة ولوحة النواقص على «مجلد موقع معاينة منفصل» فقط.
// تكييف عن install.mjs الأصلي (الذي يفترض Vite/index.html/public)، فمشروعنا يبني dist/client من dist/
// ولا index.html في جذره. هذا المثبّت: (1) يرفض أي مجلد داخل المستودع (فلا تدخل ملفات المعاينة حزمة الإنتاج)،
// (2) يحقن الوسم في كل صفحات *.html في جذر المجلد بمسار نسبي، (3) يكتب status.json من قالب الميزان.
// الافتراضي تجربة جافة (dry-run). لا ينشر ولا يدمج ولا يقرأ أسرارًا.
import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { realpathSync, existsSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeploymentTargets, currentBranch, validateBranch, getCommit } from './guards.mjs';
import { validateStatus } from '../src/logic.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAGS = '<link rel="stylesheet" href="./mizan-preview/preview.css" />\n    <script type="module" src="./mizan-preview/preview.js"></script>';

export function parseSiteArgs(argv) {
  const out = { apply: false };
  const keys = { '--repo': 'repo', '--site-dir': 'siteDir', '--preview-url': 'previewUrl', '--production-url': 'productionUrl' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') { out.apply = true; continue; }
    if (keys[a] && argv[i + 1]) { out[keys[a]] = argv[++i]; continue; }
    throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  return out;
}

// يرفض أي مجلد موقع داخل المستودع (ومنه dist/client المعرّف في wrangler.toml) أو يساويه أو يحويه.
export function assertSiteDirOutsideRepo(siteDir, repo) {
  if (!siteDir) throw new Error('--site-dir is required (a separate preview site copy outside the repository)');
  if (!existsSync(siteDir)) throw new Error(`Site directory not found: ${siteDir}`);
  const s = realpathSync(siteDir), r = realpathSync(repo);
  const inside = (a, b) => a === b || a.startsWith(b + sep);
  if (inside(s, r) || inside(r, s)) throw new Error(`Refusing: site directory must be outside the repository (production assets are built from it): ${s}`);
  return s;
}

export async function planInstall(args) {
  const repo = resolve(args.repo || '.');
  const { previewHost } = validateDeploymentTargets(args.previewUrl, args.productionUrl);
  const branch = validateBranch(currentBranch(repo));
  const commit = getCommit(repo);
  const site = assertSiteDirOutsideRepo(args.siteDir && resolve(args.siteDir), repo);
  const pages = (await readdir(site, { withFileTypes: true })).filter(e => e.isFile() && e.name.endsWith('.html')).map(e => e.name).sort();
  if (!pages.length) throw new Error('No root *.html pages found in the site directory');
  const edits = [];
  for (const name of pages) {
    const html = await readFile(join(site, name), 'utf8');
    if (html.includes('/mizan-preview/preview.js')) { edits.push({ name, action: 'already' }); continue; }
    // صفحة بلا </head> (مثل launcher.html: شظية تبدأ بـ<title>): يُحقن الوسم في أولها فيُنشئ المتصفح الرأس
    if (!html.includes('</head>')) { edits.push({ name, action: 'inject-top', html: `${TAGS}\n${html}` }); continue; }
    edits.push({ name, action: 'inject', html: html.replace('</head>', `    ${TAGS}\n  </head>`) });
  }
  const status = JSON.parse(await readFile(resolve(here, '../src/status.mizan.json'), 'utf8'));
  status.allowedHosts = [previewHost];
  status.sourceBaseCommit = commit;
  validateStatus(status);
  return { repo, site, branch, commit, previewHost, edits, status };
}

export async function applyInstall(plan) {
  const dest = join(plan.site, 'mizan-preview');
  await mkdir(dest, { recursive: true });
  for (const name of ['preview.js', 'preview.css', 'logic.mjs']) await copyFile(resolve(here, '../src', name), join(dest, name));
  const statusFile = join(dest, 'status.json');
  let previous; try { previous = JSON.parse(await readFile(statusFile, 'utf8')); } catch { /* أول تثبيت */ }
  const status = { ...plan.status };
  if (previous) { validateStatus(previous); status.issues = previous.issues; status.independentTests = previous.independentTests; }
  await writeFile(statusFile, JSON.stringify(status, null, 2) + '\n');
  for (const e of plan.edits) if (e.action === 'inject' || e.action === 'inject-top') await writeFile(join(plan.site, e.name), e.html);
}

async function main() {
  const args = parseSiteArgs(process.argv.slice(2));
  const plan = await planInstall(args);
  console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', branch: plan.branch, commit: plan.commit, site: plan.site, previewHost: plan.previewHost,
    pages: plan.edits.map(({ name, action }) => ({ name, action })), files: ['mizan-preview/preview.js', 'mizan-preview/preview.css', 'mizan-preview/logic.mjs', 'mizan-preview/status.json'] }, null, 2));
  if (!args.apply) return;
  await applyInstall(plan);
  console.log('Preview banner installed into the separate site copy only. Nothing was deployed or merged.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(err => { console.error('REFUSED:', err.message); process.exitCode = 1; });
