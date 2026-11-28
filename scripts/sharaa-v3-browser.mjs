// Real client UI + real generation worker. Synthetic projects stay in browser
// storage; no delivery reservation, provider call or production database write.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {questionById} from '../dist/sharaa-v3/core.mjs';
const BASE=(process.env.SITE_URL||'http://127.0.0.1:4317').replace(/\/$/,'');
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)&&process.env.SHARAA_LIVE_SMOKE!=='1')throw Error('Remote smoke needs explicit SHARAA_LIVE_SMOKE=1.');
const OUT=process.env.QUALITY_EVIDENCE_DIR||'/tmp/almizan-sharaa-v3-browser';await mkdir(OUT,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const executablePath=process.env.SMOKE_CHROMIUM||(existsSync('/usr/lib/chromium/chromium')?'/usr/lib/chromium/chromium':undefined);
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[],errors=[];let page;
const check=(name,ok,detail='')=>{results.push({name,ok:!!ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' '+detail:''}`);assert.ok(ok,name+' '+detail);};
const context=async(viewport={width:1440,height:1000},mobile=false)=>{
 const ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
 await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 ctx.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&!/\/api\//.test(r.url())&&new URL(r.url()).origin===new URL(BASE).origin)errors.push(r.status()+' '+r.url());});});return ctx;
};
async function begin(p){
 await p.goto(BASE+'/home.html',{waitUntil:'load'});await p.locator('#start').waitFor();
 if(await p.locator('#lxSkip').isVisible())await p.locator('#lxSkip').click();
 await p.locator('#start').click();await p.fill('#landLength','30');await p.fill('#landWidth','20');
 await p.check('input[data-kind=street][value=s]');await p.check('input[data-kind=entry][value=s]');
 await p.locator('#landForm button[type=submit]').click();
 await p.getByRole('button',{name:'مقابلة معمارية متكيفة — شرعاء V3',exact:true}).click();
 await p.locator('#sharaaV3').waitFor();
}
async function respond(p,id,value,priority){
 const card=p.locator(`.sv3-question[data-question="${id}"]`);await card.waitFor();
 const select=card.locator('select');if(priority&&await select.count())await select.selectOption(priority);
 const q=questionById(id);
 if(q.options.length)await card.locator(`[data-answer="${value}"]`).click();
 else{await card.locator('[name=answer]').fill(String(value));await card.getByRole('button',{name:'تأكيد ومتابعة',exact:true}).click();}
 await p.waitForFunction(()=>!document.querySelector('#chatError:not([hidden])'));
}
const essentials={'household.adults':2,'household.children':0,'household.parents':'none','household.bedrooms':2,'hospitality.men':true,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3};
async function interview(p,values={}){
 const inputs={...essentials,...values},seen=[];
 for(let i=0;i<35;i++){
  if(await p.locator('#sv3Generate').isEnabled())break;
  const id=await p.locator('.sv3-question').getAttribute('data-question');seen.push(id);
  if(Object.hasOwn(inputs,id))await respond(p,id,inputs[id]);
  else if(id==='children.ages')await respond(p,id,'school');
  else if(id==='parents.ground')await respond(p,id,true,'preferred');
  else{const skip=p.locator('.sv3-question').getByRole('button',{name:'أقرر لاحقًا',exact:true});assert.equal(await skip.count(),1,'unexpected blocking question '+id);await skip.click();}
 }
 assert.equal(await p.locator('#sv3Generate').isEnabled(),true);return seen;
}
async function free(p,text){await p.locator('.sv3-intake').evaluate(d=>d.open=true);await p.locator('.sv3-intake textarea').fill(text);await p.locator('.sv3-intake button[type=submit]').click();await p.locator('.sv3-proposals').waitFor();}
async function edit(p,id,value){await p.locator('.sv3-summary').evaluate(d=>d.open=true);await p.locator('.sv3-fact').filter({has:p.getByText(questionById(id).text,{exact:true})}).getByRole('button',{name:'تعديل',exact:true}).click();await respond(p,id,value);}
try{
 const ctx=await context();page=await ctx.newPage();await begin(page);
 const seen=await interview(page);check('couple has no child/parent follow-up questions',!seen.some(id=>/^(children|parents)\./.test(id)));
 check('question explains architectural purpose',(await page.locator('.sv3-why').innerText()).length>25);
 check('confirmed essentials enable generation',await page.locator('#sv3Generate').isEnabled());
 check('past dialogue stays available without pushing the current question below it',await page.locator('#sv3History:not([open])').count()===1&&await page.locator('#sv3History .row').count()>5);
 await page.getByRole('combobox',{name:'تفاصيل المقابلة',exact:true}).selectOption('core');
 check('basic interview can end without forcing optional questions',await page.locator('.sv3-question').count()===0&&await page.locator('#sv3Generate').isEnabled());
 await page.getByRole('combobox',{name:'تفاصيل المقابلة',exact:true}).selectOption('full');
 check('expanded interview exposes applicable further questions',await page.locator('.sv3-question').count()===1);
 await page.getByRole('combobox',{name:'تفاصيل المقابلة',exact:true}).selectOption('standard');
 await free(page,'لازم عزل صوتي');await free(page,'أريد 3 غرف نوم');
 check('later description preserves pending hard acoustic wish',await page.locator('.sv3-proposal').filter({hasText:'عزل صوتي'}).count()===1);
 check('unconfirmed free text blocks generation',!(await page.locator('#sv3Generate').isEnabled()));
 const pending=await page.evaluate(()=>__mizanHome.session.proposals.map(p=>p.id));
 for(const id of pending){const text=questionById(id).text;await page.locator('.sv3-proposal').filter({has:page.getByText(text,{exact:true})}).getByRole('button',{name:'استبعاد',exact:true}).click();}
 await free(page,'أريد 4 غرف نوم');
 check('proposal has not changed confirmed bedroom count',await page.evaluate(()=>__mizanHome.session.counts.bedrooms)===2);
 await page.locator('.sv3-proposals').getByRole('button',{name:'اعتماد',exact:true}).click();
 check('confirmed correction replaces count instead of adding it',await page.evaluate(()=>__mizanHome.session.counts.bedrooms)===4);
 await edit(page,'household.bedrooms',2);
 const saved=await ctx.storageState(),tab=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage)));
 await page.screenshot({path:OUT+'/interview-desktop.png',fullPage:true,animations:'disabled',timeout:90000});
 for(const width of [820,390,360]){
  const mctx=await context({width,height:900},width<700);await mctx.addInitScript(({state,tab})=>{for(const item of state.origins.flatMap(o=>o.localStorage))localStorage.setItem(item.name,item.value);for(const[k,v]of Object.entries(tab))sessionStorage.setItem(k,v);},{state:saved,tab});
  const mp=await mctx.newPage();await mp.goto(BASE+'/home.html#shara');await mp.locator('#sharaaV3').waitFor();
  check('no interview overflow at '+width+'px',await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  check('touch buttons at least 44px at '+width+'px',await mp.locator('#sharaaV3 button:visible').evaluateAll(bs=>bs.every(b=>b.getBoundingClientRect().height>=43.5)));
  check('motion control does not stretch across the mobile interview at '+width+'px',await mp.locator('.ambient-motion').evaluate(b=>b.getBoundingClientRect().height<=64));
  await mp.locator('#sv3Generate').scrollIntoViewIfNeeded();
  check('generation button is reachable without an overlay at '+width+'px',await mp.locator('#sv3Generate').evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
  check('saved confirmed count survives reload at '+width+'px',await mp.evaluate(()=>__mizanHome.session.counts.bedrooms)===2);
  if(width===390)await mp.screenshot({path:OUT+'/interview-mobile.png',fullPage:true,animations:'disabled',timeout:90000});await mctx.close();
 }
 const family=await context(),fp=await family.newPage();await begin(fp);const familySeen=await interview(fp,{'household.children':2,'household.parents':'permanent'});
 check('resident parents trigger ground-floor follow-up',familySeen.includes('parents.ground'));
 check('children trigger age follow-up',familySeen.includes('children.ages'));
 await fp.screenshot({path:OUT+'/family-interview.png',fullPage:true,animations:'disabled',timeout:90000});await family.close();
 await page.locator('#sv3Generate').click();
 await page.waitForURL(/\/design(\.html)?(\?|$)/,{timeout:120000});await page.locator('#ledger').waitFor({timeout:60000});
 const design=await page.evaluate(()=>JSON.parse(localStorage.getItem('mizan.design.session.v1')));
 check('real generation worker stores current confirmed V3 facts',design.input.requirements.sharaaV3.facts['household.bedrooms'].value===2&&design.input.requirements.counts.bedrooms===2);
 check('generated plan has a current V3 geometric review',design.designs[0].review?.findings?.some(f=>f.source==='sharaa-v3')||await page.evaluate(async()=>{const {reviewDesign}=await import('./design-review.mjs');const {parseDoc}=await import('./draw/doc.mjs');const s=JSON.parse(localStorage.getItem('mizan.design.session.v1'));return reviewDesign(parseDoc(s.designs[0].doc),{requirements:s.input.requirements,land:s.input.land}).findings.some(f=>f.source==='sharaa-v3');}));
 await page.screenshot({path:OUT+'/generated-plan-desktop.png',fullPage:true,animations:'disabled',timeout:90000});
 // Change a required reception role in browser storage as a manual edit, then
 // use the real approval button. /delivery/check is read-only; never claim.
 await page.evaluate(async()=>{const {parseDoc,serialize,applyCommand}=await import('./draw/doc.mjs');const s=JSON.parse(localStorage.getItem('mizan.design.session.v1'));const d=parseDoc(s.designs[s.current].doc),label=d.labels.find(l=>/رجال/.test(l.name));if(!label)throw Error('Missing male reception label in actual generated fixture');s.designs[s.current].doc=serialize(applyCommand(d,{type:'update',id:label.id,patch:{name:'مجلس غير مصنّف'}}).doc);s.approved=null;localStorage.setItem('mizan.design.session.v1',JSON.stringify(s));});
 await page.reload();await page.locator('#btnApprove').waitFor();await page.locator('#btnApprove').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.toast')].some(t=>t.textContent.includes('الاعتماد موقوف')),null,{timeout:30000});
 check('real approval button refuses a manual edit that loses a mandatory V3 role',await page.locator('#extShara').isHidden());
 check('refused manual edit never becomes the approved project',await page.evaluate(()=>JSON.parse(localStorage.getItem('mizan.design.session.v1')).approved)===null);
 await page.evaluate(s=>localStorage.setItem('mizan.design.session.v1',JSON.stringify(s)),design);
 await page.goto(BASE+'/home.html#shara');await page.locator('#editRequest').click();await page.locator('#sharaaV3').waitFor();
 check('existing project can reopen authoritative V3 interview',await page.evaluate(()=>__mizanHome.session.mode)==='adaptive');
 await edit(page,'household.bedrooms',3);await page.reload();await page.locator('#editRequest').click();
 check('post-design correction persists through reload',await page.evaluate(()=>__mizanHome.session.counts.bedrooms)===3);
 check('no page errors or missing application assets',errors.length===0,errors.join(' | '));await ctx.close();
}catch(e){results.push({name:'browser journey',ok:false,detail:e.stack});console.error(e);if(page)await page.screenshot({path:OUT+'/failure.png',fullPage:true,animations:'disabled',timeout:90000}).catch(()=>{});}
finally{await browser.close();await writeFile(OUT+'/results.json',JSON.stringify({base:BASE,at:new Date().toISOString(),results,errors},null,2));}
console.log(`${results.filter(r=>r.ok).length}/${results.length} passed`);process.exitCode=results.some(r=>!r.ok)?1:0;
