import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash as nodeHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sha256,createHash} from '../dist/integration/browser-crypto.mjs';
import {checkBrowserImports} from '../scripts/check-browser-imports.mjs';
import controlSchema from '../dist/integration/control/contracts/mizan-envelope-v1.schema.mjs';
import geminiSchema from '../dist/integration/gemini/contracts/mizan-envelope-v1.schema.mjs';
test('browser SHA-256 preserves Node audit hashes across UTF-8 and block boundaries',()=>{
 for(const value of ['', 'abc', 'الميزان الهندسي 🏠', ...[55,56,63,64,65,127,128,10000].map(n=>'x'.repeat(n))])
  assert.equal(sha256(value),nodeHash('sha256').update(value).digest('hex'));
 assert.equal(createHash('sha256').update('a').update('bc').digest('hex'),sha256('abc'));
});
test('browser schema modules preserve original contracts exactly',()=>{
 assert.deepEqual(controlSchema,JSON.parse(readFileSync('dist/integration/control/contracts/mizan-envelope-v1.schema.json','utf8')));
 assert.deepEqual(geminiSchema,JSON.parse(readFileSync('dist/integration/gemini/contracts/mizan-envelope-v1.schema.json','utf8')));
});
test('complete app import graph uses existing browser JavaScript modules only',()=>{
 assert.ok(checkBrowserImports()>30);
});
