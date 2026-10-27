// (الجولة 21 — أدوات القياس) لا يُكتب تقرير باسم غير صالح: السبب الأصلي «undefined-report.json» من coverage-report-r21 بلا اسم قياس.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { reportName, reportPath, checkSegment } from '../scripts/_report-name.mjs';
const root = new URL('../', import.meta.url).pathname;
test('أسماء التقارير: المقاطع الصالحة تُضم، وundefined/null/فارغ/NaN (قيمًا أو نصًا) وفواصل المسار تُرفض', () => {
  assert.equal(reportName('proposal-final', 'dev'), 'proposal-final-dev');
  assert.equal(reportPath('/x/', ['compare', 'base', 'vs', 'all']), '/x/compare-base-vs-all.json');
  for (const bad of [undefined, null, '', '  ', NaN, Infinity, 'undefined', 'null', 'NaN', 'a-undefined', 'undefined-x', 'x.null', '../x', 'a/b'])
    assert.throws(() => checkSegment(bad), /مقطع اسم غير صالح/, String(bad));
  assert.throws(() => reportPath('/x/', [undefined, 'report']));
});
test('coverage-report-r21 بلا اسم قياس يرفض ولا يكتب «undefined-report.json»', () => {
  let code = 0; try { execFileSync(process.execPath, [root + 'scripts/coverage-report-r21.mjs'], { cwd: root, stdio: 'pipe' }); } catch (e) { code = e.status; }
  assert.equal(code, 2);
  assert.equal(existsSync(root + 'evidence/coverage-r21/undefined-report.json'), false);
});
