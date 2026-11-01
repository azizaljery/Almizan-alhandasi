// يمرر المدخل الحرفي المسجّل من الرحلة (calls[0].input) إلى generateInitialDesign في Node مباشرة من dist الإيداع. الاستعمال: node node-direct.mjs <ROOT> <run.json>
import { readFileSync } from 'node:fs'; import { createHash } from 'node:crypto'; import { pathToFileURL } from 'node:url'; import { join, resolve } from 'node:path';
const ROOT = resolve(process.argv[2]); const input = JSON.parse(readFileSync(process.argv[3])).calls[0].input;
const { generateInitialDesign } = await import(pathToFileURL(join(ROOT, 'dist/home-flow.mjs')).href);
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const t = Date.now(); let o;
try { const r = await generateInitialDesign(structuredClone(input)); o = { ok: true, alts: r.alternatives?.length }; }
catch (e) { const x = { name: e.name, message: e.message }; for (const k of Object.getOwnPropertyNames(e)) if (k !== 'stack' && k !== 'message') x[k] = e[k]; o = { ok: false, err: x }; }
o.ms = Date.now() - t; o.errHash = createHash('sha256').update(JSON.stringify(canon(o.err || {}))).digest('hex').slice(0, 12);
console.log(JSON.stringify({ root: ROOT.split('/').pop(), ms: o.ms, ok: o.ok, code: o.err?.code, rej: o.err?.result?.candidatesRejected, outcome: o.err?.result?.outcome, errHash: o.errHash, msg: o.err?.message, errKeys: o.err && Object.keys(o.err), resultKeys: o.err?.result && Object.keys(o.err.result) }));
