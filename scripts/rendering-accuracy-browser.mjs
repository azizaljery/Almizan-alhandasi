// Real Chromium/Three acceptance. All provider/external requests are blocked;
// pinned Three r160 is served from an explicitly supplied local cache.
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/cua/lib/node_modules/playwright');
const evidence=process.env.MIZAN_EVIDENCE||'/workspace/rendering-accuracy-evidence/browser';
const three=await readFile(process.env.THREE_MODULE||'/tmp/rendering-three.module.js');
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),threeVersion:'0.160.0',threeSHA256:createHash('sha256').update(three).digest('hex'),browser:'Chromium headless, actual Three and software WebGL',blockedApiRequests:[],paidProviderRequests:0,externalBlocked:[],pageErrors:[],screenshots:[],limitations:['Synthetic local project only; no paid provider requests.','Software WebGL and emulated viewport sizes; not physical-device or GPU certification.','Solar cases are approximate examples, not a site calculation.']};
report.sourceFiles={};for(const name of ['dist/app.mjs','dist/index.html','dist/viewer3d.mjs','dist/plan-view.mjs','dist/solar-path.mjs'])report.sourceFiles[name]=createHash('sha256').update(await readFile(name)).digest('hex');
let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'no-preference'});page.setDefaultTimeout(20000);page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.pathname.endsWith('/three.module.js')&&['cdn.jsdelivr.net','unpkg.com'].includes(u.hostname))return route.fulfill({contentType:'text/javascript',body:three,headers:{'access-control-allow-origin':'*'}});
  if(u.pathname.startsWith('/api/')){report.blockedApiRequests.push(u.pathname);return route.abort();}
  if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();
  report.externalBlocked.push(u.origin+u.pathname);return route.abort();
 });
 await page.goto(process.env.MIZAN_URL||'http://127.0.0.1:8766',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.mizanStudioAPI);
 const fixture=await page.evaluate(async()=>{
  const {defaultRooms,validatePlot,normalizeRooms}=await import('./planner.mjs');const {encodeProject}=await import('./project.mjs');const {runMultiEngineDesign}=await import('./multi-engine.mjs');const {createStudioSession,appendStudioMessage}=await import('./studio-session.mjs');
  const plot=validatePlot({width:20,length:30,floors:1,entry:'s',streets:{s:true}}),rooms=normalizeRooms(defaultRooms()),result=await runMultiEngineDesign({plot,rooms,seed:1}),models=result.models,model=result.selectedModel;
  const studioSession=createStudioSession({id:'rendering-acceptance-synthetic'});appendStudioMessage(studioSession,{role:'assistant',source:'system',status:'notice',text:'مشروع اصطناعي للاختبار المحلي: راجع المخطط نفسه في المسقط وفي العرض الثلاثي. لم تُستخدم خدمة ذكاء مدفوعة.'});
  window.__renderingModel=model;
  return encodeProject({plot,rooms,palette:'modern',rates:{},costReserve:0,vat:0,idea:'',discovery:{likes:[],rejects:[],avoids:[],life:{}},model,alternatives:models,studioSession});
 });
 await page.locator('#projectFile').setInputFiles({name:'rendering-synthetic-fixture.json',mimeType:'application/json',buffer:Buffer.from(fixture)});
 await page.waitForFunction(()=>window.mizanStudioAPI.getState().hasModel&&!document.querySelector('#gen').disabled);
 if(await page.locator('#cinematicSkip').isVisible())await page.locator('#cinematicSkip').click().catch(()=>{});
 const original=await page.evaluate(()=>window.mizanStudioAPI.getState().model);
 report.geometrySHA256=createHash('sha256').update(JSON.stringify(original)).digest('hex');
 report.defaultLatitude=await page.locator('#solarLatitude').inputValue();assert.equal(report.defaultLatitude,'');
 // Same real model in a direct PlanViewport / RoomViewer comparison, with no rendering mocks.
 report.setup=await page.evaluate(async()=>{
  await(await import('./three-runtime.mjs')).loadThreeRuntime();const {RoomViewer}=await import('./viewer3d.mjs'),{PlanViewport}=await import('./plan-view.mjs');
  const root=document.createElement('section');root.id='rendering-acceptance';root.style.cssText='position:fixed;inset:0;z-index:999999;background:#f4f4ed;padding:14px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:65px 1fr;gap:12px;color:#183632';
  root.innerHTML='<header style="grid-column:1/3;font:18px sans-serif" id="rendering-caption">Synthetic local model · same geometry in 2D and actual WebGL</header><div id="rendering-plan" style="min-height:0;overflow:hidden"></div><div id="rendering-three" style="min-height:0"></div>';document.body.append(root);
  const model=window.mizanStudioAPI.getState().model,plan=new PlanViewport(root.querySelector('#rendering-plan'),model),states=[];
  plan.svg.style.cssText='width:100%;height:100%';const viewer=new RoomViewer(root.querySelector('#rendering-three'),()=>{},{onState:s=>states.push(s),transitionMs:320});viewer.setModel(model);viewer.setRoof(false);
  window.__rendering={root,model,plan,viewer,states,before:JSON.stringify(model)};
  return {roomCount:model.rooms.length,webgl:!viewer.renderer.getContext().isContextLost(),calls:viewer.renderer.info.render.calls};
 });assert.equal(report.setup.webgl,true);assert.ok(report.setup.calls>0);
 report.cardinal=await page.evaluate(()=>{
  const {viewer,plan}=window.__rendering;
  return [0,90,180,270].map(azimuth=>{
   const preview={status:'approximate-example',visible:true,altitude:45,azimuth,shadowLength:3.2,wallHeight:3.2};viewer.setSun(preview);plan.showSolar(preview);
   const points=plan.svg.querySelector('[data-solar-shadow] polygon').getAttribute('points').trim().split(/\s+/).map(s=>s.split(',').map(Number));
   const light=viewer.sunLight.position.clone().sub(viewer.sunLight.target.position).normalize();
   return {azimuth,light:light.toArray(),svgShadow:(()=>{const r=plan.model.massingParts?.[0]||plan.model.building;return [Math.min(...points.map(p=>p[0]))-r.x+Math.max(...points.map(p=>p[0]))-r.x-r.w,Math.min(...points.map(p=>p[1]))+r.y+r.h+Math.max(...points.map(p=>p[1]))+r.y];})()};
  });
 });
 for(const row of report.cardinal){const r=row.azimuth*Math.PI/180;assert.ok(Math.abs(row.light[0]-Math.sin(r)/Math.sqrt(2))<1e-6);assert.ok(Math.abs(row.light[2]+Math.cos(r)/Math.sqrt(2))<1e-6);assert.ok(Math.abs(row.svgShadow[0]+Math.sin(r)*3.2)<1e-6);assert.ok(Math.abs(row.svgShadow[1]-Math.cos(r)*3.2)<1e-6);}
 report.solar=await page.evaluate(async()=>{
  const {solarPreview}=await import('./solar-path.mjs'),{viewer,plan}=window.__rendering;
  return [6.5,9,15,23].map(hour=>{const preview=solarPreview({latitude:24.7,month:6,hour});viewer.setSun(preview);plan.showSolar(preview);return {hour,visible:preview.visible,altitude:preview.altitude,azimuth:preview.azimuth,intensity:viewer.sunLight.intensity,sunVisible:viewer.sunLight.visible,shadowCount:plan.svg.querySelectorAll('[data-solar-shadow]').length};});
 });assert.equal(report.solar.at(-1).shadowCount,0);assert.equal(report.solar.at(-1).sunVisible,false);assert.ok(report.solar[1].azimuth<180);assert.ok(report.solar[2].azimuth>180);
 const shot=async (name,fullPage=false)=>{await page.screenshot({path:`${evidence}/${name}.png`,fullPage});report.screenshots.push(`${name}.png`);};
 for(const hour of [9,15]){
  await page.evaluate(async hour=>{const {solarPreview}=await import('./solar-path.mjs'),{viewer,plan}=window.__rendering;const p=solarPreview({latitude:24.7,month:6,hour});viewer.setSun(p);plan.showSolar(p);document.querySelector('#rendering-caption').textContent=`EXAMPLE ONLY · latitude24.7 / representative June day / solar hour ${hour}:00 · assumed north · same geometry`;},hour);await shot(`same-model-example-${hour}`);
 }
 report.performance=await page.evaluate(()=>window.__rendering.viewer.getPerformanceStats());
 report.camera={};
 await page.evaluate(()=>{const v=window.__rendering.viewer;window.__cameraStart=v.phi;v.view('top');});
 report.camera.transitionStarted=await page.evaluate(()=>!!window.__rendering.viewer.transition);assert.equal(report.camera.transitionStarted,true);
 report.camera.intermediate=await page.evaluate(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); const v=window.__rendering.viewer;return {start:window.__cameraStart,now:v.phi,active:!!v.transition};});
 assert.ok(report.camera.intermediate.now<report.camera.intermediate.start&&report.camera.intermediate.now>.02);
 await page.waitForFunction(()=>!window.__rendering.viewer.transition);
 report.camera.idleFrame=await page.evaluate(()=>window.__rendering.viewer.frameId);assert.equal(report.camera.idleFrame,null);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>window.__rendering.viewer.reducedMotion);
 report.camera.reducedMotion=await page.evaluate(()=>{const v=window.__rendering.viewer;v.view('front');return {transition:!!v.transition,phi:v.phi};});assert.equal(report.camera.reducedMotion.transition,false);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!window.__rendering.viewer.reducedMotion);
 report.camera.replaceCancelled=await page.evaluate(()=>{const {viewer,model}=window.__rendering;viewer.view('top');viewer.setModel(structuredClone(model));return !viewer.transition;});assert.equal(report.camera.replaceCancelled,true);
 report.camera.roof=await page.evaluate(()=>{const v=window.__rendering.viewer;v.setRoof(true);const entered=v.enter(v.model.rooms[0].id),insideRoof=v.roof.visible;v.view('persp');return {entered,insideRoof,exteriorRoof:v.roof.visible,transition:!!v.transition};});assert.equal(report.camera.roof.entered,true);assert.equal(report.camera.roof.insideRoof,false);assert.equal(report.camera.roof.exteriorRoof,true);assert.equal(report.camera.roof.transition,false);
 report.moduleContext=await page.evaluate(()=>{const v=window.__rendering.viewer,ext=v.renderer.getContext().getExtension('WEBGL_lose_context');window.__moduleContextExtension=ext;ext.loseContext();return !!ext;});assert.equal(report.moduleContext,true);
 await page.waitForFunction(()=>window.__rendering.viewer.contextLost);await page.evaluate(()=>window.__moduleContextExtension.restoreContext());await page.waitForFunction(()=>!window.__rendering.viewer.contextLost);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__rendering.model)===window.__rendering.before),true);
 report.moduleStates=await page.evaluate(()=>window.__rendering.states);
 await page.evaluate(()=>{window.__rendering.viewer.destroy();window.__rendering.root.remove();});
 // Actual customer conversation UI, same loaded candidate at all three widths.
 for(const width of [390,820,1440]){
  await page.setViewportSize({width,height:width===390?844:width===1440?1000:1100});await page.locator('[data-studio-mode="2d"]').click();await page.evaluate(()=>scrollTo(0,0));await shot(`conversation-${width}`);
  for(const mode of ['2d','3d']){
   await page.locator(`[data-studio-mode="${mode}"]`).click();await page.locator(mode==='2d'?'#plan':'#view').scrollIntoViewIfNeeded();
   if(mode==='3d'){await page.waitForFunction(()=>document.querySelector('#view canvas')&&window.mizanStudioAPI.getState().renderedRevisions.three!==null);await page.locator('#roof').uncheck();}
   await page.locator(mode==='2d'?'#plan':'#view').scrollIntoViewIfNeeded();await shot(`actual-plan-${width}-${mode}`);
  }
 }
 report.uiSolar=await page.evaluate(()=>{
 const set=(id,value)=>{const input=document.getElementById(id);input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));};
 set('solarLatitude',24.7);set('sunMonth',6);set('sunHour',6.5);const low={shadow:!!document.querySelector('#plan [data-solar-shadow]'),info:document.querySelector('#sunInfo').textContent};
 set('solarLatitude',99);const invalid={shadow:!!document.querySelector('#plan [data-solar-shadow]'),info:document.querySelector('#sunInfo').textContent};
 set('solarLatitude','');const cleared={shadow:!!document.querySelector('#plan [data-solar-shadow]'),info:document.querySelector('#sunInfo').textContent};return {low,invalid,cleared};
 });assert.equal(report.uiSolar.low.shadow,true);assert.equal(report.uiSolar.invalid.shadow,false);assert.equal(report.uiSolar.cleared.shadow,false);assert.match(report.uiSolar.cleared.info,/غير محسوب/);
 await page.locator('#roof').check();await page.locator('#startTour').click();assert.equal(await page.locator('#roof').isChecked(),false);assert.equal(await page.locator('#roof').isDisabled(),true);
 await page.evaluate(()=>document.querySelector('#styles [data-v=classic]').click());await page.waitForFunction(()=>!document.querySelector('#roof').disabled&&document.querySelector('#roof').checked);report.roofAfterInsidePaletteRefresh=true;
 await page.locator('[data-view=top]').first().click();await page.waitForFunction(()=>document.querySelector('#viewMode').textContent.includes('علوي'));
 report.appContext=await page.evaluate(()=>{const c=document.querySelector('#view canvas'),gl=c.getContext('webgl2')||c.getContext('webgl'),ext=gl.getExtension('WEBGL_lose_context');window.__appContextExtension=ext;ext.loseContext();return !!ext;});assert.equal(report.appContext,true);
 await page.waitForFunction(()=>!document.querySelector('#threeError').hidden&&document.querySelector('#threeError').textContent.trim());
 report.contextLossNotice=await page.locator('#threeError').textContent();assert.ok(report.contextLossNotice.trim());await shot('app-webgl-context-lost');
 await page.evaluate(()=>window.__appContextExtension.restoreContext());await page.waitForFunction(()=>document.querySelector('#threeError').hidden||!document.querySelector('#threeError').textContent.trim());
 assert.match(await page.locator('#viewMode').textContent(),/علوي/);
 report.restoredTopLabel=true;
 await page.evaluate(()=>{const c=document.querySelector('#view canvas'),gl=c.getContext('webgl2')||c.getContext('webgl');window.__oldLostCanvas=c;gl.getExtension('WEBGL_lose_context').loseContext();});
 await page.locator('#retry3D').waitFor({state:'visible'});await page.locator('#retry3D').click();await page.waitForFunction(()=>document.querySelector('#view canvas')!==window.__oldLostCanvas&&document.querySelector('#view').dataset.renderStatus==='ready');report.manualRetryReplacedCanvas=true;
 await page.locator('[data-studio-mode="2d"]').click();assert.ok(await page.locator('#plan [data-room-id]').count());
 assert.deepEqual(await page.evaluate(()=>window.mizanStudioAPI.getState().model),original);
 report.geometryUnchanged=true;report.status='PASS';assert.deepEqual(report.pageErrors,[]);
 await writeFile(`${evidence}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){report.status='FAIL';report.failure=error.stack;await writeFile(`${evidence}/report.json`,JSON.stringify(report,null,2));if(page)await page.screenshot({path:`${evidence}/failure.png`}).catch(()=>{});throw error;}
finally{await browser.close();}
