import { chromium } from 'playwright';import assert from 'node:assert/strict';import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {planSheetSvg} from '../dist/draw/plan-sheet.mjs';
const base=process.env.ARCHITECT_BASE_URL||'http://127.0.0.1:4317',directory=process.argv[2]||'/tmp/architect-evidence';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/home.html');await page.click('#start');await page.fill('#landLength','30');await page.fill('#landWidth','20');
 await page.check('input[data-kind=street][value=s]');await page.check('input[data-kind=entry][value=s]');await page.click('#landForm button[type=submit]');
 await page.getByRole('button',{name:'اسألني أسئلة محددة',exact:true}).click();
 await page.locator('[data-ask=a_household]').waitFor();await page.locator('[data-ask=a_household]').getByRole('button',{name:'زوجان بلا أبناء',exact:true}).click();
 await page.locator('[data-ask=a_parents]').getByRole('button',{name:'لا يسكن معنا',exact:true}).click();
 assert.equal(await page.locator('[data-ask=a_child_ages]').count(),0);assert.equal(await page.locator('[data-ask=a_mobility]').count(),0);
 await page.locator('[data-ask=a_entries]').waitFor();await page.screenshot({path:directory+`/interview-couple-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'أضيف تفصيلًا بالكلام',exact:true}).click();await page.locator('form.free textarea').fill('الان عندنا 3 اطفال صغار وامي تسكن معنا');await page.locator('form.free button[type=submit]').click();
 await page.locator('[data-ask=a_mobility]').waitFor();await page.screenshot({path:directory+`/interview-parents-${width}.png`,fullPage:true});
 // Run the actual browser Worker -> canonical document -> independent unified review contract.
 const outcome=await page.evaluate(async()=>{const {generateInWorker}=await import('/design-client.mjs');const {defaultRooms}=await import('/planner.mjs');const{reviewDesign}=await import('/design-review.mjs');const land={width:20,length:30,streets:['s'],entries:['s'],floors:1},counts={bedrooms:3,majlis:2,halls:1,kitchens:1,baths:4,dining:1},requirements={counts,architect:{enabled:true}};const input={land,counts,rooms:defaultRooms(counts),requirements};const r=await generateInWorker(input,{land,counts,requirements});const doc=r.handoff.doc,review=reviewDesign(doc,{land,requirements});return{walls:doc.walls.length,architect:review.findings.filter(f=>f.source==='architect').map(f=>({title:f.title,state:f.state}))};});
 assert.ok(outcome.walls>0);assert.ok(outcome.architect.length>=4);assert.ok(outcome.architect.every(f=>f.state==='verified'),JSON.stringify(outcome));
 const failed=await page.evaluate(async()=>{const{generateInWorker}=await import('/design-client.mjs');const{defaultRooms}=await import('/planner.mjs');const land={width:20,length:30,streets:['s'],entries:['s'],floors:1},counts={bedrooms:3,majlis:2,halls:1,kitchens:1,baths:4,dining:1},requirements={counts,architect:{enabled:true,limits:{hallWidth:100}}};try{await generateInWorker({land,counts,rooms:defaultRooms(counts),requirements},{land,counts,requirements});return{unexpected:true};}catch(e){return{code:e.code,issues:e.architectIssues?.length||0};}});
 assert.equal(failed.code,'ARCHITECT_QUALITY_NOT_MET');assert.ok(failed.issues>0,'worker sends actual causes to the customer');
 const images=await page.evaluate(async()=>{const{auditImageUrls}=await import('/architect/image-quality.mjs');const c=document.createElement('canvas');c.width=1024;c.height=768;const x=c.getContext('2d');x.fillStyle='#888';x.fillRect(0,0,c.width,c.height);const url=c.toDataURL();const r=await auditImageUrls(url,url,{fidelity:{ok:true,score:1},capturedDesignKey:'1',currentDesignKey:'1'});return{geometryMeasured:r.geometryMeasured,technical:r.technicalPass};});assert.equal(images.geometryMeasured,false);assert.equal(images.technical,false);
 assert.deepEqual(errors,[]);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
 const row={width,childlessBranch:true,changedHouseholdBranch:true,realWorker:outcome,qualityRefusal:failed,blankImageAudit:images,uncaughtErrors:errors,horizontalOverflow:overflow};results.push(row);console.log(JSON.stringify(row));await context.close();
 }
 const page=await browser.newPage({viewport:{width:1280,height:950}});
 for(const name of ['baseline','selected']){const doc=JSON.parse(await readFile(directory+'/'+name+'-doc.json','utf8'));const svg=planSheetSvg(doc,{date:'2026-11-26',owner:'حالة اختبار افتراضية',office:'مقارنة آلية للتوزيع',sheet:'A3'});await writeFile(directory+'/'+name+'-plan.svg',svg);await page.setContent('<style>body{margin:0;background:white}svg{width:100%;height:auto;display:block}</style>'+svg);await page.screenshot({path:directory+'/'+name+'-plan.png',fullPage:true});}
}finally{await browser.close();await writeFile(directory+'/browser.json',JSON.stringify(results,null,2));}
