// عينة جودة العرض المعزولة (C1): node scripts/facade-render-hq.mjs <outDir> "name|query" ...
// يلتقط صفحة dist/facade-realism-hq.html بمعاملات الاستعلام المعطاة. لا يغيّر الصفحة الأصلية ولا الإنتاج.
import { createServer } from 'node:http'; import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'; import { extname, join, dirname, resolve, sep } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require=createRequire(import.meta.url); let chromium; try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/npm-tools/node_modules/playwright'));}
const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'..','dist'), fixtures=resolve(here,'..','tests','fixtures','facade');
const [,,out,...jobs]=process.argv; mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.hdr':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg'};
const PORT=8157, ORIGIN='http://localhost:'+PORT, inside=(p,b)=>p===b||p.startsWith(b+sep);
const srv=createServer((q,s)=>{ const p=new URL(q.url,ORIGIN).pathname, f=p==='/facade-realism/C1.json'?join(fixtures,'C1.json'):resolve(root,'.'+p); if(!inside(f,root)&&!inside(f,fixtures)){s.writeHead(403);s.end();return;} if(existsSync(f)&&statSync(f).isFile()){s.writeHead(200,{'Content-Type':mime[extname(f)]||'application/octet-stream'});s.end(readFileSync(f));} else {s.writeHead(404);s.end();} });
await new Promise(r=>srv.listen(PORT,r));
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}); const res=[];
try{ for(const j of jobs){ const [name,query]=j.split('|'); const pg=await b.newPage({viewport:{width:1280,height:800}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  const t=Date.now(); await pg.goto(`${ORIGIN}/facade-realism-hq.html?${query}`); await pg.waitForFunction(()=>globalThis.__FR?.ready===true,null,{timeout:900000}); const info=await pg.evaluate(()=>globalThis.__FR);
  if(info.error){ console.log('ERR',name,info.error); await pg.close(); continue; } await (await pg.$('#fr')).screenshot({path:join(out,name+'.png')}); res.push({name,query,ms:Date.now()-t,info:{...info,roi:undefined},errs}); console.log('OK',name,Date.now()-t,'ms',errs.slice(0,2).join('|')); await pg.close(); } }
finally{ await b.close(); srv.close(); }
writeFileSync(join(out,'results.json'),JSON.stringify(res,null,1));
