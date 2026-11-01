import { readFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url'; import { join, resolve } from 'node:path';
const ROOT = resolve(process.argv[2]); const input = JSON.parse(readFileSync(process.argv[3])).calls[0].input;
const { generateInitialDesign } = await import(pathToFileURL(join(ROOT, 'dist/home-flow.mjs')).href);
try { await generateInitialDesign(structuredClone(input)); console.log('OK'); } catch (e) { const o = {}; for (const k of Object.getOwnPropertyNames(e)) if (k !== 'stack') o[k] = e[k]; console.log(JSON.stringify(o, (k, v) => v, 1)); }
