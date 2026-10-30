#!/usr/bin/env node
// Strict wrapper around the project's own Playwright E2E script. No test script modifications.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const shots = mkdtempSync(join(tmpdir(), 'mizan-sharaa-e2e-'));
const child = spawn(process.execPath, ['scripts/e2e-sharaa-v2.mjs', shots], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', killed = false;
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { const t = chunk.toString(); output = (output + t).slice(-80000); process.stdout.write(t); });
const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); }, 210000);
const result = await new Promise(resolve => child.on('close', (code, signal) => resolve({code,signal})));
clearTimeout(timer);
const issues = [];
if (killed) issues.push('انتهت المهلة 210 ث');
if (result.code !== 0) issues.push('سكربت المتصفح خرج برمز غير صفر');
if (!output.includes('GENERATE-BUTTON-SHOWN')) issues.push('لم يثبت الضغط على توليد التصميم');
if (/NO-OUTCOME-IN-120s|NO-GENERATE-STEP|NO-GENERATE-BUTTON/.test(output)) issues.push('غياب نتيجة أو خطوة توليد');
if (!/design\.html/.test(output)) issues.push('لم يثبت الوصول إلى design.html بعد البدائل');
if (issues.length) { console.error('BROWSER_BLOCKED\n' + issues.map(x=>'- '+x).join('\n')); process.exitCode = 1; }
else console.log('BROWSER_SMOKE_PASS — اختبار متصفح محلي؛ ليس اختبار مفتاح المساعد الحقيقي ولا بيئة staging المنشورة');
