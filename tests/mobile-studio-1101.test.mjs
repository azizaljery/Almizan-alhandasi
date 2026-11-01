// يحرس المرسم على الجوال 390×844: لا تمرير أفقي، #modeToggle كامل داخل الشاشة، elementFromPoint يرجع الزر نفسه، رسم/تصدير/تبديل الوضع.
// يتطلب chromium لـ Playwright؛ متصفح واحد في المرة. سطح المكتب 1366×900 يُفحص بالسكربت نفسه (لا انحدار).
import test from 'node:test'; import assert from 'node:assert/strict';
import { createRequire } from 'node:module'; import { spawnSync } from 'node:child_process'; import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)); const script = join(root, 'scripts/preview-feedback-1031/mobile-hit.mjs');
// يُتخطى مع MIZAN_NO_BROWSER=1 أو إن لم يكن Playwright متاحًا (كحال بقية اختبارات المتصفح في المستودع)؛ وCI يثبّته صراحة فيعمل هناك.
const hasPw = (() => { try { createRequire(import.meta.url).resolve('playwright'); return true; } catch { return false; } })();
const skip = !!process.env.MIZAN_NO_BROWSER || !hasPw;
for (const [w, h] of [[390, 844], [1366, 900], [1024, 768]]) {
  test(`المرسم ${w}×${h}: بلا تمرير أفقي، الأزرار مرئية وقابلة للنقر، تصدير وتبديل الوضع`, { timeout: 180000, skip }, () => {
    const r = spawnSync(process.execPath, [script, join(root, 'dist'), mkdtempSync(join(tmpdir(), 'mz-mobile-')), String(w), String(h)], { encoding: 'utf8', timeout: 170000 });
    assert.equal(r.status, 0, (r.stdout || '').split('\n').filter(l => /^(FAIL|BAD|  BAD|PAGEERROR)/.test(l)).join('\n') + (r.stderr || ''));
    assert.match(r.stdout, /FAILS 0/);
  });
}
