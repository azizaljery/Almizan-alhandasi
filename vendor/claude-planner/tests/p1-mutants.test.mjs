import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyRun} from '../tools/mutants.mjs';
const env={...process.env};delete env.NODE_TEST_CONTEXT;
const reporter=new URL('../tools/mutants.mjs',import.meta.url).href;
function fixture(code) {
 const dir=mkdtempSync(join(tmpdir(),'runner-proof-'));
 try {
  const path=join(dir,'case.mjs');writeFileSync(path,code);
  return spawnSync(process.execPath,['--test','--test-reporter='+reporter,path],{env,encoding:'utf8',timeout:10000});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('P1 C10 structured assertion fails -> KILLED, independent of default reporter',()=>{
 const r=fixture("import test from 'node:test';import assert from 'node:assert/strict';test('R99 target',()=>assert.equal(1,2));");
 assert.equal(r.status,1);assert.equal(classifyRun(r,'R99'),'KILLED');
});
test('P1 C10 passing target -> SURVIVED; missing target -> INCONCLUSIVE',()=>{
 const r=fixture("import test from 'node:test';test('R99 target',()=>{});");
 assert.equal(classifyRun(r,'R99'),'SURVIVED');
 assert.equal(classifyRun(r,'R98'),'INCONCLUSIVE');
});
test('P1 C10 loader/syntax/runtime errors never count as kills',()=>{
 for(const code of ["import './missing.mjs';","not valid syntax !","import test from 'node:test';test('R99 target',()=>{throw new TypeError('broken')});"]) {
  assert.equal(classifyRun(fixture(code),'R99'),'INCONCLUSIVE');
 }
});
test('P1 C10 newly thrown domain Error must originate in the specified mutated source',()=>{
 const dir=mkdtempSync(join(tmpdir(),'domain-proof-'));
 try {
  const source=join(dir,'source.mjs'), file=join(dir,'case.mjs');
  writeFileSync(source,"export function changed(){throw Error('unsupported shape')}");
  writeFileSync(file,"import test from 'node:test';import {changed} from './source.mjs';test('R99 target',()=>changed());");
  const r=spawnSync(process.execPath,['--test','--test-reporter='+reporter,file],{env,encoding:'utf8',timeout:10000});
  assert.equal(classifyRun(r,'R99',source),'KILLED');
  assert.equal(classifyRun(r,'R99',join(dir,'other.mjs')),'INCONCLUSIVE');
  assert.equal(classifyRun(r,'R99'),'INCONCLUSIVE');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('P1 C10 timeout, signal and malformed output -> INCONCLUSIVE',()=>{
 const r=spawnSync(process.execPath,['-e','setInterval(()=>{},1000)'],{env,encoding:'utf8',timeout:50});
 assert.equal(classifyRun(r,'R99'),'INCONCLUSIVE');
 assert.equal(classifyRun({status:1,signal:'SIGTERM',stdout:''},'R99'),'INCONCLUSIVE');
 assert.equal(classifyRun({status:1,stdout:'not ok 1 - R99 target'},'R99'),'INCONCLUSIVE');
});
test('P1 C10 failed baseline stops tool with Exit 2 and no KILLED',()=>{
 const dir=mkdtempSync(join(tmpdir(),'baseline-proof-'));
 try {
  for(const sub of ['src','tools','tests'])mkdirSync(join(dir,sub));
  writeFileSync(join(dir,'src','planner.mjs'),'export const untouched=true;');
  copyFileSync(fileURLToPath(reporter),join(dir,'tools','mutants.mjs'));
  writeFileSync(join(dir,'tests','bad.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';test('bad baseline',()=>assert.fail());");
  const r=spawnSync(process.execPath,[join(dir,'tools','mutants.mjs'),'--only=M01'],{env,encoding:'utf8',timeout:10000});
  assert.equal(r.status,2);assert.match(r.stderr,/baseline failed/);assert.doesNotMatch(r.stdout,/KILLED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
