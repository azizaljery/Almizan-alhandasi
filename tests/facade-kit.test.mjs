// حزمة واجهات الميزان (dist/facade-kit): اختباراتها الذاتية + عدم تسربها إلى حزمة العملاء.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
test('اختبارات حزمة الواجهات الذاتية تنجح', () => {
  const r = spawnSync(process.execPath, ['--test', 'dist/facade-kit/tests/kit.test.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.slice(-1500) + r.stderr.slice(-500));
});
test('الحزمة غير موجودة في حزمة العملاء', () => { if (existsSync('dist/client')) assert.ok(!existsSync('dist/client/facade-kit')); });
