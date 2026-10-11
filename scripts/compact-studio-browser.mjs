// Local compact-studio acceptance. No provider traffic leaves the browser.
// Baseline: COMPACT_PHASE=before MIZAN_URL=http://127.0.0.1:8771
// Final: COMPACT_PHASE=after against the current local static server.
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/cua/lib/node_modules/playwright');
const phase=process.env.COMPACT_PHASE||'after',evidence=process.env.MIZAN_EVIDENCE||'/workspace/compact-studio-evidence/browser';
const url=process.env.MIZAN_URL||(phase==='before'?'http://127.0.0.1:8771':'http://127.0.0.1:8766');
const three=await readFile(process.env.THREE_MODULE||'/tmp/rendering-three.module.js');await mkdir(evidence,{recursive:true});
const report={phase,url,sourceCommit:phase==='before'?'d622baf0cc5b049282154743697eafb0a41ef932':(process.env.MIZAN_SOURCE_COMMIT||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()),sourceDirty:phase==='before'?'isolated git archive':(process.env.MIZAN_SOURCE_COMMIT?'isolated exact git archive':execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()),screenshots:[],steps:[],pageErrors:[],blocked:[],mockRequests:0,paidRequests:0};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let page,mockMode='change';
try{
 page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(20000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.pathname.endsWith('/three.module.js')&&['cdn.jsdelivr.net','unpkg.com'].includes(u.hostname))return route.fulfill({contentType:'text/javascript',body:three,headers:{'access-control-allow-origin':'*'}});
  if(u.pathname.startsWith('/api/assistant')){
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
   if(u.pathname.endsWith('/status'))return route.fulfill({headers,body:JSON.stringify({configured:true,accessConfigured:true,model:'LOCAL_BROWSER_MOCK_ONLY'})});
   report.mockRequests++;if(mockMode==='failure')return route.fulfill({status:503,headers,body:JSON.stringify({error:'تعذر فهم الطلب في اختبار الفشل المحلي المحاكى.'})});
   const input=route.request().postDataJSON(),rooms=structuredClone(input.previous.rooms).map(r=>r.type==='kitchen'?{...r,area:19}:r);
   return route.fulfill({headers,body:JSON.stringify({source:'openai',model:'LOCAL_BROWSER_MOCK_ONLY',brief:{summary:'فهم محاكى للاختبار: مساحة المطبخ19م² فقط، وبقية برنامج الغرف محفوظ.',rooms,assumptions:[],questions:[],unhandled:[]},limitations:[]})});
  }
  if(u.pathname.startsWith('/api/')||!['127.0.0.1','localhost'].includes(u.hostname)){report.blocked.push(u.origin+u.pathname);return route.abort();}
  return route.continue();
 });
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.mizanStudioAPI);
 const shot=async(name,fullPage=false)=>{await page.screenshot({path:`${evidence}/${name}.png`,fullPage});report.screenshots.push(name+'.png');};
 let project;
 if(phase==='before'){
  project=await page.evaluate(async()=>{
   const {defaultRooms,normalizeRooms,validatePlot}=await import('./planner.mjs'),{runMultiEngineDesign}=await import('./multi-engine.mjs'),{encodeProject}=await import('./project.mjs'),{createStudioSession,appendStudioMessage}=await import('./studio-session.mjs');
   const plot=validatePlot({width:20,length:30,floors:1,entry:'s',streets:{s:true}}),rooms=normalizeRooms(defaultRooms()),result=await runMultiEngineDesign({plot,rooms,seed:1}),studioSession=createStudioSession({id:'compact-synthetic-fixture'});
   appendStudioMessage(studioSession,{role:'assistant',source:'system',status:'notice',text:'مشروع اصطناعي لاختبار الواجهة. المخطط والمحادثة محفوظان محليًا؛ لا خدمة ذكاء مدفوعة.'});
   return encodeProject({plot,rooms,model:result.selectedModel,alternatives:result.models,studioSession,palette:'modern',rates:{},costReserve:0,vat:0,idea:'',discovery:{likes:[],rejects:[],avoids:[],life:{}}});
  });await writeFile(`${evidence}/synthetic-project.json`,project);
 }else project=await readFile(`${evidence}/synthetic-project.json`,'utf8');
 await page.locator('#projectFile').setInputFiles({name:'compact-synthetic.json',mimeType:'application/json',buffer:Buffer.from(project)});await page.waitForFunction(()=>window.mizanStudioAPI.getState().hasModel&&!document.querySelector('#gen').disabled);
 if(await page.locator('#cinematicSkip').isVisible())await page.locator('#cinematicSkip').click().catch(()=>{});
 await page.waitForFunction(()=>!document.querySelector('#app').inert);
 const state=()=>page.evaluate(()=>window.mizanStudioAPI.getState());const original=await state();
 report.modelHash=createHash('sha256').update(JSON.stringify(original.model)).digest('hex');
 // Identical fixed-size scene, camera, roof and no-location solar input for visual comparison.
 const camera=phase==='after'?JSON.parse(await readFile(`${evidence}/before-scene.json`,'utf8')).camera:null;
 report.scene=await page.evaluate(async camera=>{
  await(await import('./three-runtime.mjs')).loadThreeRuntime();const {RoomViewer}=await import('./viewer3d.mjs');
  const root=document.createElement('section');root.id='compact-scene';root.style.cssText='position:fixed;inset:0;z-index:999999;background:#f6f5ef;display:grid;place-items:center;grid-template-rows:65px 1fr;padding:10px';
  root.innerHTML='<p style="font:17px sans-serif;color:#24463c">SAME MODEL / CAMERA / ROOF OFF · studio light only · no site sun</p><div id="compact-scene-view" style="width:1100px;height:800px;max-width:100%;overflow:hidden"></div>';document.body.append(root);
  const viewer=new RoomViewer(root.querySelector('#compact-scene-view'),()=>{},{reducedMotion:true});viewer.setModel(window.mizanStudioAPI.getState().model,'modern');viewer.setRoof(false);viewer.setSun({status:'not-calculated',visible:false});
  if(camera){viewer.applyOrbit(camera);viewer.render();}window.__compactScene={root,viewer};
  return {camera:viewer.orbitPose(),cameraPosition:viewer.camera.position.toArray(),canvas:{width:viewer.container.clientWidth,height:viewer.container.clientHeight},roof:viewer.roof.visible,solarInput:'not-calculated',sunVisible:viewer.sunLight.visible,ambientIntensity:viewer.ambientLight.intensity,studioKeyIntensity:viewer.studioLight?.intensity??0,studioKeyPosition:viewer.studioLight?.position?.toArray()??null,fillIntensity:viewer.fillLight.intensity,exposure:viewer.renderer.toneMappingExposure,performance:viewer.getPerformanceStats()};
 },camera);
 await shot(`${phase}-same-scene`);await writeFile(`${evidence}/${phase}-scene.json`,JSON.stringify(report.scene,null,2));await page.evaluate(()=>{window.__compactScene.viewer.destroy();window.__compactScene.root.remove();});
 if(phase==='before'){
  for(const [width,height] of [[390,844],[820,1100],[1440,1000]]){await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await shot(`before-first-${width}`);}
 }else{
  const before=JSON.parse(await readFile(`${evidence}/before-report.json`,'utf8'));assert.equal(report.modelHash,before.modelHash);assert.deepEqual(report.scene.camera,before.scene.camera);assert.equal(report.scene.roof,before.scene.roof);assert.equal(report.scene.solarInput,before.scene.solarInput);
  report.viewportChecks=[];
  for(const [width,height] of [[390,844],[820,1100],[1440,1000]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await shot(`after-first-${width}`);
   const check=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,alternativesOpen:document.querySelector('#studioCompareDialog')?.open,historyOpen:document.querySelector('#studioHistoryDetails')?.open,reviewOpen:document.querySelector('#studioReviewDetails')?.open,landOpen:document.querySelector('#studioLandDetails')?.open,aestheticOpen:document.querySelector('#studioAestheticTools')?.open}));
   check.firstScreenPlan=await page.evaluate(()=>{const r=document.querySelector('#plan').getBoundingClientRect();return {top:r.top,height:r.height,visiblePixels:Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,document.querySelector('.top').getBoundingClientRect().bottom))};});
   if(width===390)assert.ok(check.firstScreenPlan.visiblePixels>=200,`First phone screen must show at least200px of actual plan: ${JSON.stringify(check.firstScreenPlan)}`);
   assert.ok(check.scrollWidth<=width);for(const key of ['alternativesOpen','historyOpen','reviewOpen','landOpen','aestheticOpen'])assert.equal(check[key],false,key);
   await page.getByRole('button',{name:'المخطط والتعديل',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#plan').getBoundingClientRect().top<innerHeight*.55);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.evaluate(()=>new Promise(resolve=>{let previous=scrollY,stable=0;const tick=()=>{stable=Math.abs(scrollY-previous)<.1?stable+1:0;previous=scrollY;if(stable>=8)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
   const drawingBounds=await page.evaluate(()=>{const p=document.querySelector('#plan').getBoundingClientRect(),s=document.querySelector('#plan svg').getBoundingClientRect(),rooms=[...document.querySelectorAll('#plan .room-fill')].map(e=>e.getBoundingClientRect());return {canvasTop:p.top,headerBottom:document.querySelector('.top').getBoundingClientRect().bottom,canvasHeight:p.height,svgHeight:s.height,overflowRooms:rooms.filter(r=>r.top<p.top||r.bottom>p.bottom||r.left<p.left||r.right>p.right).length};});
   assert.ok(drawingBounds.canvasTop>=drawingBounds.headerBottom-1,`Sticky header covers plan at ${width}: ${JSON.stringify(drawingBounds)}`);assert.ok(drawingBounds.svgHeight<=drawingBounds.canvasHeight,`SVG must fit compact canvas at ${width}: ${JSON.stringify(drawingBounds)}`);assert.equal(drawingBounds.overflowRooms,0,`Default room geometry clipped at ${width}`);
   check.drawingBounds=drawingBounds;await shot(`after-plan-composer-${width}`);
   report.viewportChecks.push({...check,planAndComposer:await page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {plan:rect('plan'),composer:rect('studioRequestForm')};})});
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#studioCompareOpen').click();await page.locator('#studioCompareDialog').waitFor({state:'visible'});await shot('after-alternative-drawer-390');assert.equal(await page.locator('#freshIdeas').isVisible(),true);assert.equal(await page.locator('#freshIdeas').isEnabled(),true);
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('#studioCompareDialog')),true);}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#studioCompareDialog').open);assert.equal(await page.evaluate(()=>document.activeElement?.id),'studioCompareOpen');
  await page.locator('#studioCompareOpen').click();await page.locator('#studioCompareClose').click();assert.equal(await page.evaluate(()=>document.activeElement?.id),'studioCompareOpen');
  await page.locator('#studioCompareOpen').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#studioCompareDialog').open);
  const target=await page.locator('#studioCompareDialog [data-alternative]').evaluateAll(nodes=>nodes.find(n=>n.getAttribute('aria-pressed')!=='true')?.dataset.alternative);assert.ok(target!==undefined);
  await page.locator(`#studioCompareDialog [data-alternative="${target}"]`).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('#studioCompareDialog').open);const selected=await state();assert.notDeepEqual(selected.model,original.model);assert.equal(await page.evaluate(()=>document.activeElement?.id),'studioCompareOpen');
  report.steps.push('drawer keyboard open, trapped Tab focus, Escape, close-button and keyboard alternative selection restore focus and preserve real model selection');
  await page.locator('#studioLandDetails > summary').click();await page.locator('#studioAdvancedToggle').click();assert.equal(await page.evaluate(()=>!document.querySelector('#studioCompareDialog').contains(document.querySelector('.studio-alternatives'))),true);await page.locator('#studioContinueConversation').click();assert.equal(await page.evaluate(()=>document.querySelector('#studioCompareDialog').contains(document.querySelector('.studio-alternatives'))),true);report.steps.push('advanced roundtrip keeps original alternative and viewer nodes usable');
  // Explicit mock transport; no real credential or provider request.
  await page.locator('#studioLandDetails').evaluate(e=>{e.open=true;});await page.locator('.studio-access').evaluate(e=>{e.open=true;});await page.locator('#studioAccessCode').fill('LOCAL_BROWSER_FIXTURE_NOT_A_CREDENTIAL');await page.locator('#studioLandDetails').evaluate(e=>{e.open=false;});
  await page.locator('#studioBrief').fill('اجعل مساحة المطبخ 19 متر مربع');await page.locator('#studioSubmit').click();await page.waitForFunction(()=>!document.querySelector('#studioProposalPanel').hidden&&!document.querySelector('#studioApprove').disabled);await page.locator('#studioProposalPanel').scrollIntoViewIfNeeded();await shot('after-targeted-proposal-390');
  assert.deepEqual((await state()).model,selected.model);await page.locator('#studioApprove').click();await page.waitForFunction(()=>!document.querySelector('#studioSubmit').disabled,{timeout:45000});
  const edited=await state();assert.equal(edited.program.find(r=>r.type==='kitchen').area,19);assert.notDeepEqual(edited.model,selected.model);assert.deepEqual(edited.program.filter(r=>r.type!=='kitchen'),selected.program.filter(r=>r.type!=='kitchen'));
  await page.getByRole('button',{name:'المخطط والتعديل',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#plan').getBoundingClientRect().top<innerHeight*.55);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await shot('after-edited-return-390');report.steps.push('mock understanding of kitchen19m² requires explicit acceptance, real local generation changes model while preserving non-target program');
  mockMode='failure';await page.locator('#studioBrief').fill('غيّر موقع المطبخ إلى الخلف');await page.locator('#studioSubmit').click();await page.waitForFunction(()=>!document.querySelector('#studioSubmit').disabled);assert.deepEqual((await state()).model,edited.model);assert.ok((await page.locator('#studioStatus').textContent()).trim());assert.equal(await page.locator('#studioStatus').isVisible(),true);await shot('after-visible-failure-390');report.steps.push('failed mocked understanding remains visible in primary UI and preserves last successful geometry');
 }
 assert.deepEqual(report.pageErrors,[]);report.status='PASS';await writeFile(`${evidence}/${phase}-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){report.status='FAIL';report.error=error.stack;await writeFile(`${evidence}/${phase}-report.json`,JSON.stringify(report,null,2));if(page)await page.screenshot({path:`${evidence}/${phase}-failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
