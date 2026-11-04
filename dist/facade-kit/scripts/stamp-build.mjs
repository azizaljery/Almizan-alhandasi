import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||'');if(!process.argv[2])throw new Error('Usage: node scripts/stamp-build.mjs /path/to/Almizan-alhandasi');
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const sourceRevision=git('rev-parse','HEAD'),dirty=git('status','--porcelain').length>0;
if(!/^[a-f0-9]{40}$/.test(sourceRevision)||dirty)throw new Error('Commit the reviewed source first; build stamping requires a clean checkout.');
const target=new URL('../config/build-info.mjs',import.meta.url),build={repository:'azizaljery/Almizan-alhandasi',projectName:'MIZAN-ALHANDASAH',packageName:'@mizan/facade-kit',sourceRevision,verificationScope:'REQUIRES_RETEST_AFTER_STAMP',dirty:false};
fs.writeFileSync(target,'// Generated from the clean checkout. Run the integration test after stamping.\nexport const BUILD_INFO=Object.freeze('+JSON.stringify(build,null,2)+');\n');
console.log(sourceRevision);
