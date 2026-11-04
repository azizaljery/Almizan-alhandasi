// (طلب المالك 2026-11-02) صفحة عينة الواجهات الواقعية والمجلد المرافق لها لا يدخلان حزمة العميل (dist/client).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

test('scripts/build.mjs لا ينسخ صفحة العينة ولا مجلدها إلى dist/client', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe', timeout: 600000 });
  assert.equal(existsSync('dist/client/facade-realism.html'), false);
  assert.equal(existsSync('dist/client/facade-realism-pt.html'), false);
  assert.equal(existsSync('dist/client/facade-realism'), false);
  // الصفحة والمجلد ما زالا في dist/ للفحص أثناء التطوير
  assert.equal(existsSync('dist/facade-realism.html'), true);
  assert.equal(existsSync('dist/facade-realism/model.mjs'), true);
  const hit = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(html|mjs|js|json)$/.test(e.name) && readFileSync(p, 'utf8').includes('facade-realism')) hit.push(p); } };
  walk('dist/client');
  assert.deepEqual(hit, [], 'مرجع إلى صفحة العينة داخل حزمة العميل');
});
