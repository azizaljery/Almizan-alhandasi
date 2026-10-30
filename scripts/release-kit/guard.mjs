#!/usr/bin/env node
// Mizan native staging guard. Read-only. Never deploys or writes to the repository.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const errors = [];
const fail = (message) => errors.push(message);
const read = p => readFileSync(join(root, p), 'utf8');
const key = (text, k) => (text.match(new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, 'm')) || [])[1];
const branch = () => process.env.GITHUB_REF_NAME || (() => { try { return execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } })();
if (process.env.MIZAN_PREVIEW_DEPLOY !== '1' || process.env.MIZAN_DEPLOY_TARGET !== 'staging') fail('علمَا النشر المستقل غير موجودين أو غير صحيحين');
if (branch() !== 'staging-preview') fail('يجب تشغيل فحص النشر من فرع staging-preview فقط');
if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME !== 'push') fail('تشغيل CI ليس حدث push على فرع المعاينة');
const stageFile = 'wrangler.staging.toml', prodFile = 'wrangler.toml';
if (!existsSync(join(root, stageFile)) || !existsSync(join(root, prodFile))) fail('ملفا Wrangler للإنتاج والمعاينة مطلوبان للمقارنة');
else {
  const stage = read(stageFile), prod = read(prodFile);
  const stageName = key(stage, 'name'), prodName = key(prod, 'name');
  const stageDb = key(stage, 'database_id'), prodDb = key(prod, 'database_id');
  const stageDbName = key(stage, 'database_name'), prodDbName = key(prod, 'database_name');
  if (!stageName || stageName === prodName || !/staging/i.test(stageName)) fail('اسم Worker المعاينة غير مستقل');
  if (!stageDb || stageDb === prodDb || !stageDbName || stageDbName === prodDbName) fail('قاعدة D1 للمعاينة ليست مستقلة');
  if (!/^\s*workers_dev\s*=\s*true\s*$/m.test(stage)) fail('المعاينة يجب أن تستخدم workers.dev');
  if (/^\s*(?:route|routes|zone_id|zone_name)\s*=/m.test(stage)) fail('مسارات أو نطاقات إنتاج محظورة');
  if (/^\s*TRUST_SITES_HEADER\s*=/m.test(stage)) fail('TRUST_SITES_HEADER محظور في المعاينة');
  if (!/^\s*directory\s*=\s*"\.\/dist\/client"/m.test(stage)) fail('مسار ملفات المتصفح يجب أن يكون dist/client');
  if (!/^\s*main\s*=\s*"worker\/index\.mjs"/m.test(stage)) fail('مدخل Worker غير مطابق لبنية المشروع');
  const origin = key(stage, 'ALLOWED_ORIGIN') || '';
  if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev(?:,https:\/\/[a-z0-9.-]+\.workers\.dev)*$/i.test(origin)) fail('ALLOWED_ORIGIN ليس أصل معاينة workers.dev صالحًا');
  if (origin.includes(prodName + '.')) fail('أصل المعاينة يطابق اسم Worker الإنتاج');
}
const client = join(root, 'dist/client');
if (!existsSync(client) || !statSync(client).isDirectory()) fail('dist/client غير موجود: شغّل node scripts/build.mjs أولًا');
else {
  let n = 0;
  const secretRe = /\b(?:sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)\b/;
  const sealedRe = /(?:heldout3|sample\.json|evaluation[-_ ]?seed|eval[-_ ]?seed|\.env(?:\.|$))/i;
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name), rel = relative(client, full).split(sep).join('/');
      if (sealedRe.test(rel)) { fail('ملف محظور داخل ملفات المعاينة: ' + rel); continue; }
      if (e.isSymbolicLink()) { fail('رابط رمزي داخل ملفات المعاينة: ' + rel); continue; }
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.isFile()) continue;
      n++;
      if (/\.(?:html?|mjs|js|json|css|txt|svg|map)$/i.test(rel)) {
        const content = readFileSync(full, 'utf8');
        if (secretRe.test(content)) fail('قيمة تشبه مفتاحًا سريًا داخل: ' + rel);
      }
    }
  };
  walk(client);
  if (!existsSync(join(client, 'home.html')) || !existsSync(join(client, 'home.mjs'))) fail('ملفات شرعاء الأساسية غير موجودة في dist/client');
  if (!existsSync(join(client, 'sharaa/flow.mjs'))) fail('شرعاء V2 غير موجود في ناتج البناء');
  if (n === 0) fail('ناتج البناء فارغ');
}
if (errors.length) { console.error('STAGING_BLOCKED\n' + errors.map(e => '- ' + e).join('\n')); process.exitCode = 1; }
else console.log('STAGING_PREFLIGHT_PASS_ONLY — عزل الإعدادات محليًا، لا إثبات لعزل صلاحيات Cloudflare ولا إذن نشر');
