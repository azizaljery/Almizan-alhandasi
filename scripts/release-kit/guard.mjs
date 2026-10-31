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
import { parseToml } from './guard-toml.mjs'; // (تصحيح 2026-10-31) قراءة TOML فعلية — انظر guard-toml.mjs
const allKeys = t => [t.root, ...t.tables.map(x => x.keys)].flatMap(k => Object.keys(k));
const tablesNamed = (t, n) => t.tables.filter(x => x.name === n);
const branch = () => process.env.GITHUB_REF_NAME || (() => { try { return execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } })();
if (process.env.MIZAN_PREVIEW_DEPLOY !== '1' || process.env.MIZAN_DEPLOY_TARGET !== 'staging') fail('علمَا النشر المستقل غير موجودين أو غير صحيحين');
if (branch() !== 'staging-preview') fail('يجب تشغيل فحص النشر من فرع staging-preview فقط');
if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME !== 'push') fail('تشغيل CI ليس حدث push على فرع المعاينة');
const stageFile = 'wrangler.staging.toml', prodFile = 'wrangler.toml';
if (!existsSync(join(root, stageFile)) || !existsSync(join(root, prodFile))) fail('ملفا Wrangler للإنتاج والمعاينة مطلوبان للمقارنة');
else {
  const S = parseToml(read(stageFile)), P = parseToml(read(prodFile));
  if (S.invalid?.length) fail('أسطر TOML غير مفهومة في إعداد المعاينة: ' + S.invalid.slice(0, 2).join(' | '));
  const stageName = S.root.name, prodName = P.root.name;
  const dbs = t => tablesNamed(t, 'd1_databases').map(x => x.keys), sDb = dbs(S), pDb = dbs(P);
  if (typeof stageName !== 'string' || !stageName || stageName === prodName || !/staging/i.test(stageName)) fail('اسم Worker المعاينة غير مستقل');
  if (!sDb.length || sDb.some(d => !d.database_id || !d.database_name || pDb.some(p => p.database_id === d.database_id || p.database_name === d.database_name))) fail('قاعدة D1 للمعاينة ليست مستقلة');
  if (S.root.workers_dev !== true) fail('المعاينة يجب أن تستخدم workers.dev');
  // أي مسار أو نطاق أو نطاق مخصص في أي جدول (ومنه [env.*]) محظور؛ وكذلك أي جدول بيئة يعيد تعريف الاسم أو القاعدة
  if (allKeys(S).some(k => /^(?:route|routes|zone_id|zone_name|custom_domain|custom_domains)$/.test(k)) || S.tables.some(x => /^(?:route|routes)$/.test(x.name))) fail('مسارات أو نطاقات إنتاج محظورة');
  if (S.tables.some(x => /^env\./.test(x.name))) fail('جداول [env.*] محظورة في إعداد المعاينة (قد تعيد التوجيه إلى الإنتاج)');
  if (allKeys(S).includes('TRUST_SITES_HEADER')) fail('TRUST_SITES_HEADER محظور في المعاينة');
  const assets = tablesNamed(S, 'assets')[0]?.keys || {};
  if (!/^\.?\/?dist\/client\/?$/.test(String(assets.directory || '')) ) fail('مسار ملفات المتصفح يجب أن يكون dist/client');
  if (S.root.main !== 'worker/index.mjs') fail('مدخل Worker غير مطابق لبنية المشروع');
  const origin = String(tablesNamed(S, 'vars')[0]?.keys.ALLOWED_ORIGIN || '');
  if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev(?:,https:\/\/[a-z0-9.-]+\.workers\.dev)*$/i.test(origin)) fail('ALLOWED_ORIGIN ليس أصل معاينة workers.dev صالحًا');
  if (prodName && (origin.includes(prodName + '.') || origin.split(',').some(o => { try { return new URL(o).hostname.split('.')[0] === prodName; } catch { return true; } }))) fail('أصل المعاينة يطابق اسم Worker الإنتاج');
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
