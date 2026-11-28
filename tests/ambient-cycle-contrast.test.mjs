// دورة النهار والليل: كان الحبر يُحسب على السطح فقط، فأثناء الانتقال بين النهار والغروب تكون خلفية الصفحة فاتحة والسطح داكنًا
// (أو العكس) فيختفي نص العناوين وتسمية الوقت. المطلوب: في كل طور حبر واحد يحقق 4.5:1 على السماء وعلى السطح معًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleState, contrast } from '../dist/ambient-cycle.mjs';

test('الحبر والنص الخافت يحققان 4.5:1 على السماء والسطح في كل طور من الدورة', () => {
  const bad = [];
  for (let i = 0; i <= 1000; i++) {
    const s = cycleState(i / 1000);
    for (const [name, c] of [['ink', s.ink], ['skyInk', s.skyInk], ['muted', s.muted]])
      for (const [bgName, bg] of [['sky', s.sky], ['surface', s.surface]]) {
        const r = contrast(c, bg);
        if (r < 4.5) bad.push(`${(i / 1000).toFixed(3)} ${s.name}: ${name} على ${bgName} = ${r.toFixed(2)}`);
      }
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test('تغيّر اللون بين طورين متجاورين لا يقفز قفزة كبيرة (لا وميض عند التحول)', () => {
  const hex = s => s.slice(1).match(/../g).map(x => parseInt(x, 16));
  let worst = 0, at = 0;
  for (let i = 0; i < 1000; i++) {
    const a = cycleState(i / 1000), b = cycleState((i + 1) / 1000);
    for (const k of ['sky', 'surface']) { const d = Math.max(...hex(a[k]).map((x, j) => Math.abs(x - hex(b[k])[j]))); if (d > worst) { worst = d; at = i / 1000; } }
  }
  assert.ok(worst <= 20, `أكبر قفزة لونية ${worst}/255 عند الطور ${at}`);
});
