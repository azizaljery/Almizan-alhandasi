// يحرس المرسم على الجوال 390×844: لا تمرير أفقي، #modeToggle كامل داخل الشاشة، elementFromPoint يرجع الزر نفسه، رسم/تصدير/تبديل الوضع.
// يتطلب chromium لـ Playwright؛ متصفح واحد في المرة. سطح المكتب 1366×900 يُفحص بالسكربت نفسه (لا انحدار).
import test from 'node:test'; import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process'; import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)); const script = join(root, 'scripts/preview-feedback-1031/mobile-hit.mjs');
for (const [w, h] of [[390, 844], [1366, 900]]) {
  test(`المرسم ${w}×${h}: بلا تمرير أفقي، الأزرار مرئية وقابلة للنقر، تصدير وتبديل الوضع`, { timeout: 180000 }, () => {
    const r = spawnSync(process.execPath, [script, join(root, 'dist'), mkdtempSync(join(tmpdir(), 'mz-mobile-')), String(w), String(h)], { encoding: 'utf8', timeout: 170000 });
    assert.equal(r.status, 0, (r.stdout || '').split('\n').filter(l => /^(FAIL|BAD|  BAD|PAGEERROR)/.test(l)).join('\n') + (r.stderr || ''));
    assert.match(r.stdout, /FAILS 0/);
  });
}
