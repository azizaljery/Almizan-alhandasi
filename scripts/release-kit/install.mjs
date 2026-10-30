#!/usr/bin/env node
// Adds a single pre-deploy guard to the EXISTING staging workflow. Dry-run by default.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const apply = process.argv.includes('--apply');
const file = join(root, '.github/workflows/deploy-staging.yml');
const stop = m => { console.error('INSTALL_BLOCKED: ' + m); process.exit(1); };
if (!existsSync(file)) stop('ملف deploy-staging.yml غير موجود: ادمج إعدادات staging في الفرع أولًا');
let branch = ''; try { branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(); } catch { stop('يتطلب مستودع Git'); }
if (!branch.startsWith('dev/')) stop('التثبيت مسموح على فرع تطوير dev/* فقط، وليس على main/deploy/staging-preview');
const old = readFileSync(file, 'utf8');
if (!old.includes('branches: [staging-preview]') || !old.includes('wrangler.staging.toml')) stop('ملف نشر المعاينة لا يطابق سير العمل المعروف');
const step = `      - name: Mizan native staging guard\n        env:\n          MIZAN_PREVIEW_DEPLOY: '1'\n          MIZAN_DEPLOY_TARGET: staging\n        run: node scripts/release-kit/guard.mjs\n`;
if (old.includes('node scripts/release-kit/guard.mjs')) { console.log('ALREADY_INSTALLED'); process.exit(0); }
const anchor = '      - name: Deploy staging worker\n';
if (!old.includes(anchor) || !old.includes('run: node scripts/build.mjs')) stop('موضع حقن الفحص غير معروف؛ لا تعديل تلقائي');
const next = old.replace(anchor, step + anchor);
if (!apply) console.log('DRY_RUN: سيتغير .github/workflows/deploy-staging.yml فقط. استخدم --apply على فرع dev/*');
else { writeFileSync(file, next); console.log('APPLIED: أضيف فحص staging بعد البناء وقبل النشر؛ لم يحدث نشر أو دمج'); }
