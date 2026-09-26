import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function checkBrowserImports(entry='dist/app.mjs') {
 if(!vm.SourceTextModule) return Number(execFileSync(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url),entry],{encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}}).trim());
 const visited=new Set();
 function visit(file) {
  file=resolve(file);if(visited.has(file))return;visited.add(file);
  const source=readFileSync(file,'utf8');
  const imports=new vm.SourceTextModule(source).dependencySpecifiers;
  for(const specifier of imports) {
   if(!specifier.startsWith('.')) throw new Error(`Browser-incompatible import: ${relative('.',file)} -> ${specifier}`);
   const next=resolve(dirname(file),specifier);
   if(!existsSync(next))throw new Error(`Missing browser module: ${next}`);
   if(!/\.(mjs|js)$/.test(next))throw new Error(`Non-JavaScript browser import: ${next}`);
   visit(next);
  }
 }
 visit(entry);return visited.size;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) console.log(checkBrowserImports(process.argv[2]));
