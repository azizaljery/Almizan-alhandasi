// يرسم مفاهيم المرحلة الأولى: npm-free. node scripts/facade-concepts-render.mjs <building> <outdir> [modes=full,tone,uniform] [views=front,oblique] [ids=K01,K02,K03]
import { createServer } from 'node:http'; import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'; import { extname, join, dirname, resolve, sep } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require=createRequire(import.meta.url); let chromium; try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/npm-tools/node_modules/playwright'));}
const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'..','dist');
const [,, building='C1', outDir='out', modesA='full,tone,uniform', viewsA='front,oblique', idsA=''] = process.argv;
const { runBuilding } = await import('../dist/facade-kit/concepts/run.mjs'); const { packageConcept } = await import('../dist/facade-kit/concepts/generate.mjs');
const r=await runBuilding(building); const ids=idsA?idsA.split(','):(r.sel.selected?.ids||r.gen.candidates.slice(0,3).map(c=>c.id));
mkdirSync(outDir,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json'};
const srv=createServer((q,s)=>{const p=new URL(q.url,'http://x').pathname,f=resolve(root,'.'+p);if((f===root||f.startsWith(root+sep))&&existsSync(f)&&statSync(f).isFile()){s.writeHead(200,{'Content-Type':mime[extname(f)]||'application/octet-stream'});s.end(readFileSync(f));}else{s.writeHead(404);s.end();}});
await new Promise(res=>srv.listen(8161,res));
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}), pg=await b.newPage({viewport:{width:1000,height:700}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());if(m.text().startsWith('CAM')&&process.env.DBG)console.log(m.text());});
await pg.goto('http://localhost:8161/facade-kit/concepts/lab.html'); await pg.waitForFunction(()=>window.__LAB_READY,null,{timeout:60000});
for(const idSpec of ids){ const [id,palOverride]=idSpec.split('@'); const cand=r.gen.candidates.find(c=>c.id===id);
  for(const mode of modesA.split(',')) for(const view of viewsA.split(',')){
    const palette=mode==='full'?(palOverride||cand.params.palette):'P1'; const pkg=await packageConcept(r.built,r.transforms,r.front,cand,{palette});
    const res=await pg.evaluate(async({pkg,mode,view})=>window.renderConcept(pkg,{mode,view}),{pkg:JSON.parse(JSON.stringify(pkg)),mode,view});
    writeFileSync(join(outDir,`${building}-${idSpec.replace('@','-')}-${mode}-${view}.png`),Buffer.from(res.url.split(',')[1],'base64')); } }
console.log('done',ids.join(','),errs.slice(0,3)); await b.close(); srv.close();
