// يولّد جداول docs/qa-30-cases.md من نتيجة scripts/qa-cases-run.mjs. الاستعمال: node scripts/qa-cases-report.mjs <results.json> > جداول.md
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).rows, ENG = ['legacy', 'hybrid', 'reference'], AR = { legacy: 'legacy', hybrid: 'hybrid', reference: 'reference' };
const L = [];
const nd = d => Object.values(d.defects || {}).reduce((s, v) => s + v, 0);
L.push('### جدول 1: طبقة المحرك (generateVillaDesigns/generateVillaTwoFloors بلا سلّم الاتساع، keep=5)', '', 'الخلية: عدد التصاميم / كم حقق الإلزامي بالمراجعة (لا مخالفة إلزامية ولا بند طلب مخالف أو غير متحقق) / تكوينات متميزة بالبصمة / تكوينات متميزة بنيويًا (macro) / مجموع العيوب المعروفة عبر التصاميم. «✗ CODE» = لم يُنتج تصميمًا.', '');
L.push('| الحالة | legacy | hybrid | reference | تطابق legacy~hybrid (نسخة؟) |', '|---|---|---|---|---|');
for (const r of rows) {
  const cell = e => { const y = r.engines[e]; return y.err ? `✗ ${y.err.code}` : `${y.n} / ${y.metDesigns} / ${y.distinctSig} / ${y.distinctMacro} / ${y.designs.reduce((s, d) => s + nd(d), 0)}`; };
  const c = r.cross['legacy~hybrid']; L.push(`| ${r.id} | ${cell('legacy')} | ${cell('hybrid')} | ${cell('reference')} | ${c ? (c.copy ? 'نعم (' + c.whole + ')' : 'لا (' + c.whole + ')') : '—'} |`);
}
L.push('', '### جدول 2: تشابه البدائل (أعلى تشابه كلي بالبصمة / أعلى تشابه بنيوي بين بديلين / نسخ مقابل المحجوز)', '', '| الحالة | legacy | hybrid | reference |', '|---|---|---|---|');
for (const r of rows) { const cell = e => { const y = r.engines[e]; return y.err || y.n < 2 ? '—' : `${y.maxWhole} / ${y.maxMacro} / ${y.vsReservedCopy}`; }; L.push(`| ${r.id} | ${cell('legacy')} | ${cell('hybrid')} | ${cell('reference')} |`); }
L.push('', '### جدول 3: طبقة الموقع (generateInitialDesign الافتراضي مع سلّم الاتساع)', '', 'نوم/مجالس: ما خرج / ما طُلب. «ما مُسّ» = بنود السلّم المعلنة في بيان الموقع. «مخالف للأصل» = بنود إلزامية في سجل الطلب الأصلي مخالفة في التصميم الخارج.', '', '| الحالة | المحرك | نتيجة | نوم | مجالس | أدوار | ما مُسّ | مخالف للأصل |', '|---|---|---|---|---|---|---|---|');
for (const r of rows) for (const e of ['legacy', 'hybrid']) { const d = r.site[e]?.default; if (!d) continue; L.push(d.ok ? `| ${r.id} | ${e} | ✓ | ${d.gotBedrooms}/${d.askedBedrooms} | ${d.gotMajlis}/${d.askedMajlis} | ${d.floorsGot}/${d.floorsAsked} | ${d.fitApplied.join('، ') || '—'} | ${d.requestViolatedOnOriginal.length} |` : `| ${r.id} | ${e} | ✗ ${d.code} | | | | | |`); }
L.push('', '### جدول 4: الحالات المتعارضة عمدًا: الشرح والاقتراحات (diagnoseFit)', '');
for (const r of rows.filter(x => x.conflict)) {
  const s = r.site.legacy; if (!s) continue;
  L.push(`**${r.id}** — خطأ طبقة المحرك: ${r.engines.legacy.err ? r.engines.legacy.err.message : 'لا'}`, '');
  L.push(`- الوضع الصارم: ${s.strictThrows ? s.strictThrows.message : 'نجح'}`);
  if (s.diagnose?.facts) L.push(`- الحقائق: مسطح ${s.diagnose.facts.net.width}×${s.diagnose.facts.net.depth} م، المطلوب ≈ ${s.diagnose.facts.required} م²، نسبة ${s.diagnose.facts.share}`);
  if (s.diagnose?.options) L.push(`- خيارات التشخيص: ${s.diagnose.options.map(o => `${o.label} [${o.ok ? 'ينجح' : 'لا ينجح'}]`).join('؛ ')}`);
  L.push('');
}
const agg = {}; for (const r of rows) for (const e of ENG) for (const d of r.engines[e].designs) for (const [k, v] of Object.entries(d.defects || {})) { (agg[k] ??= { legacy: 0, hybrid: 0, reference: 0 })[e]++; void v; }
const tot = Object.fromEntries(ENG.map(e => [e, rows.reduce((s, r) => s + r.engines[e].n, 0)]));
L.push('### جدول 5: العيوب المعروفة (عدد التصاميم التي ظهر فيها العيب)', '', `إجمالي التصاميم: legacy ${tot.legacy}، hybrid ${tot.hybrid}، reference ${tot.reference}.`, '', '| العيب | legacy | hybrid | reference |', '|---|---|---|---|');
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].legacy + b[1].hybrid - a[1].legacy - a[1].hybrid)) L.push(`| ${k} | ${v.legacy} | ${v.hybrid} | ${v.reference} |`);
const dl = {}; for (const r of rows) for (const e of ENG) for (const d of r.engines[e].designs) for (const [k, st] of Object.entries(d.daily || {})) { const c = k.replace(/:.*/, ''); const o = ((dl[c] ??= {})[e] ??= { v: 0, n: 0 }); o.n++; if (st === 'violated') o.v++; }
L.push('', '### جدول 6: الحياة اليومية (dist/daily-life.mjs) على كل التصاميم المنتجة: مخالف / مقيس', '', '| البند | legacy | hybrid | reference |', '|---|---|---|---|');
for (const [k, v] of Object.entries(dl)) L.push(`| ${k} | ${ENG.map(e => v[e] ? `${v[e].v}/${v[e].n}` : '—').join(' | ')} |`);
console.log(L.join('\n'));
