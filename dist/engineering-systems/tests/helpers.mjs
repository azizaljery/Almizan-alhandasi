import { readFileSync } from 'node:fs';
export const fixture = () => JSON.parse(readFileSync(new URL('../examples/demo-input.json', import.meta.url), 'utf8'));
export const sourceDoc = () => JSON.parse(readFileSync(new URL('../examples/source-draw.json', import.meta.url), 'utf8'));
export const near = (assert, a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
