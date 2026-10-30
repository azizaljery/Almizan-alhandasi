#!/usr/bin/env node
// Native Mizan release acceptance runner. Read-only except existing build/test cache behavior.
// Never merges, commits, pushes, or deploys. Full suite is opt-in and may take a long time.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const args=new Set(process.argv.slice(2));
const r21=args.has('--r21'), combined=args.has('--combined');
const sharaa=!r21||combined;
const run=(label,cmd,argv,timeout=1800000)=>{
  console.log('\n=== '+label+' ===');
  const x=spawnSync(cmd,argv,{cwd:root,encoding:'utf8',stdio:'inherit',timeout});
  const code=x.status===null?1:x.status;
  console.log('RESULT '+label+' EXIT='+code+(x.error?' ERROR='+x.error.message:''));
  return code===0;
};
let ok=run('source-check',process.execPath,['scripts/release-kit/source-check.mjs',...(combined?['--combined']:r21?['--r21']:[])]);
if(sharaa) ok=run('sharaa-targeted-tests',process.execPath,['--test','--test-concurrency=1','tests/sharaa-brief.test.mjs','tests/sharaa-v2-acceptance.test.mjs','tests/requirements-direct-door.test.mjs','tests/direct-door-engine.test.mjs'])&&ok;
if(args.has('--build')) ok=run('native-build',process.execPath,['scripts/build.mjs'])&&ok;
if(args.has('--browser')) ok=run('browser-e2e',process.execPath,['scripts/release-kit/verify-browser.mjs'],240000)&&ok;
if(args.has('--full')) {
  console.log('تنبيه: الاختبارات الكاملة الموروثة قد تفشل؛ لا تُعدّل توقعاتها. احفظ السجل وقارن بالقاعدة.');
  ok=run('full-npm-test','npm',['test'],7200000)&&ok;
}
console.log(ok?'ACCEPTANCE_RUN_PASS_FOR_SELECTED_CHECKS':'ACCEPTANCE_RUN_FAILED_OR_INCOMPLETE');
process.exitCode=ok?0:1;
