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
import { readFileSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { projectionBudgets, frontSideOf, connectSiteFacade } from '../dist/facade-kit-site.mjs';
const C1 = () => parseDoc(readFileSync('tests/fixtures/facade/C1.json', 'utf8'));
test('الربط بالموقع: جهة المدخل وحدود البروز مشتقة من المستند', () => {
  const d = C1(), b = projectionBudgets(d);
  assert.equal(frontSideOf(d), 's'); for (const k of ['s', 'n', 'e', 'w']) assert.ok(b[k] >= 0 && b[k] <= 2, k);
  assert.equal(frontSideOf({ ...d, entry: 'x' }), null);
});
test('الربط بالموقع: توليد A/B/C سليم وحديث، ويرفض بصمة قديمة وتعديل المستند', async () => {
  let d = C1(); const a = connectSiteFacade({ getDocument: () => d });
  const h = await a.documentHash(), env = await a.call('facade.generate', { expectedDocumentHash: h, style: 'B' });
  assert.equal((await a.call('facade.validate', { resultId: env.resultId })).integrity, true);
  d = { ...d, walls: d.walls.slice(0, -1) };
  await assert.rejects(a.call('facade.get', { resultId: env.resultId }), /STALE_FACADE/);
  await assert.rejects(a.call('facade.generate', { expectedDocumentHash: h, style: 'A' }), /STALE_DOCUMENT/);
});
