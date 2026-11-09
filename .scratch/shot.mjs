import http from 'node:http'; import { readFile } from 'node:fs/promises'; import { existsSync, writeFileSync } from 'node:fs'; import { extname, join, normalize } from 'node:path';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { planSheetSvg } from '../dist/draw/plan-sheet.mjs';
const root='/tmp/claude-0/wt-elev/dist', SP='/tmp/claude-0/-home-claude/cc220171-1914-572f-b744-f8e0d2357b91/scratchpad/elev';
const txt='فيلا دورين مجلس وثلاث غرف نوم ومصعد'; const w=20,l=30;
const b=buildBrief(txt,{land:{width:w,length:l,floors:2}});
const out=await generateInitialDesign({land:{width:w,length:l,streets:['s'],entries:['s'],floors:2},rooms:[],idea:txt,counts:b.counts,requirements:b.requirements});
const doc=out.doc; const lab=doc.labels.filter(x=>x.type==='elevator'); console.log(JSON.stringify(lab.map(x=>x.seed)));
for (const lv of doc.levels) { const r = planSheetSvg(doc,{levelId:lv.id}); writeFileSync(`${SP}/plan-${lv.id}.svg`, r); }
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=http.createServer(async(q,s)=>{const f=normalize(join(root,decodeURIComponent(new URL(q.url,'http://x').pathname)));if(!f.startsWith(root)||!existsSync(f)){s.writeHead(404);return s.end('no')}s.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});s.end(await readFile(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const br=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const p=await br.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1}); const logs=[]; p.on('pageerror',e=>logs.push(e.message));
for (const lv of doc.levels) { await p.setContent(`<body style="margin:0;background:#fff">${planSheetSvg(doc,{levelId:lv.id})}</body>`); const svg=await p.$('svg'); await svg.screenshot({path:`${SP}/plan-${lv.id}.png`}); }
await p.goto(`http://127.0.0.1:${server.address().port}/draw/_harness3d.html`); await p.waitForFunction(()=>window.H?.ready,null,{timeout:60000});
await p.evaluate(d=>{const v=H.create(); v.setDoc(d); v.setMode('orbit',{animate:false});},doc);
const s0=lab[0].seed;
for (const [n,lvl,x,y,h] of [['g0',0,s0.x-3,s0.y,90],['g1',0,s0.x-3,s0.y,270],['u0',1,s0.x-3,s0.y,90],['u1',1,s0.x-3,s0.y,0]]) { await p.evaluate(([x,y,lvl,h])=>H.viewer.walkTo(x,y,{level:lvl,headingDeg:h,pitchDeg:-8}),[x,y,lvl,h]); await p.evaluate(()=>H.settle()); await p.screenshot({path:`${SP}/${n}.png`}); }
console.log('logs',logs); await br.close(); server.close();
