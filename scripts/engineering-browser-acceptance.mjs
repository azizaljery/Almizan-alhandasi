// Real Chromium acceptance. Set PLAYWRIGHT_MODULE to the installed playwright entrypoint.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
 const page = await browser.newPage();
 page.on('pageerror', error => console.error('BROWSER ERROR:', error.message));
 await page.goto(process.env.MIZAN_URL || 'http://127.0.0.1:8765');
 await page.waitForFunction(() => !!window.mizanStudioAPI);
 const result = await page.evaluate(async () => {
  const api = window.mizanStudioAPI;
  const { footprint, generateModel, validateModel, inside, quantities } = await import('./planner.mjs');
  const initial = api.getState().plot;
  let rejected = false;
  try { api.setPlot({width:32,length:40,entry:'n',maxBuiltArea:500}); } catch { rejected = true; }
  const unchanged = JSON.stringify(initial) === JSON.stringify(api.getState().plot);
  const cases = [];
  for (const streets of [{s:true,n:false,e:false,w:false},{s:true,n:false,e:true,w:false},{s:true,n:true,e:true,w:true}]) {
   const entries = Object.keys(streets).filter(k=>streets[k]);
   let expected;
   for (const entry of entries) {
    const p = api.setPlot({width:35,length:45,entry,maxBuiltArea:700,streets});
    const f = footprint(p);
    expected ||= JSON.stringify(f);
    const model = generateModel(p, api.getState().program);
    cases.push({streets:p.streets,expectedStreets:streets,sameEnvelope:JSON.stringify(f)===expected,
      setbacks:Object.entries(streets).every(([side,on])=>f.sb[side]===(on?p.streetSetback:p.neighborSetback)),
      valid:validateModel(model).length===0,inside:inside(model.building,f),cap:quantities(model).footprint<=700});
   }
  }
  const prior = api.getState().plot;
  let noAccessRejected = false;
  try { api.setPlot({...prior,streets:{n:false,s:false,e:false,w:false}}); } catch { noAccessRejected=true; }
  return {rejected,unchanged,cases,noAccessRejected,noAccessUnchanged:JSON.stringify(prior)===JSON.stringify(api.getState().plot)};
 });
 assert.equal(result.rejected,true,'entry on neighbor side must be rejected');
 assert.equal(result.unchanged,true,'rejected update must not mutate land');
 for(const row of result.cases) {
  assert.deepEqual(row.streets,row.expectedStreets);
  for(const key of ['sameEnvelope','setbacks','valid','inside','cap']) assert.equal(row[key],true,key);
 }
 assert.equal(result.noAccessRejected,true); assert.equal(result.noAccessUnchanged,true);
 // Exercise the actual form's invalid entrance submission, with no AI/network call.
 await page.locator('#cinematicSkip').click({force:true});
 await page.locator('#studioEntry').selectOption('n');
 await page.locator('#studioBrief').fill('ثلاث غرف نوم');
 const beforeForm = await page.evaluate(() => window.mizanStudioAPI.getState().plot);
 await page.locator('#studioLocal').click({force:true});
 await page.waitForFunction(() => document.getElementById('studioStatus').textContent.includes('الشوارع'));
 assert.deepEqual(await page.evaluate(() => window.mizanStudioAPI.getState().plot),beforeForm);
 assert.equal(await page.locator('[data-studio-street="n"]').isChecked(),false);
 const guards = await page.evaluate(async () => {
  const {diffRoomPrograms} = await import('./design-dialog.mjs');
  const {verifyProposedProgram,verifyProgramGeometry} = await import('./brief-contract.mjs');
  const {runMultiEngineDesign} = await import('./multi-engine.mjs');
  const before=[{name:'الصالة',type:'living',area:24},{name:'المطبخ',type:'kitchen',area:48}];
  const deletion=diffRoomPrograms(before,before.slice(0,1),'احذف الصالة وانقل المطبخ');
  const bedrooms=Array.from({length:4},(_,i)=>({name:'نوم '+i,type:'bedroom',area:20,position:'back',side:'any'}));
  let dimensionsRejected=false;
  try { await runMultiEngineDesign({plot:window.mizanStudioAPI.getState().plot,rooms:[...bedrooms.slice(0,3),{name:'Kitchen',type:'kitchen',area:48,position:'front',side:'any'}],idea:'3 bedrooms and kitchen 8x6'}); }
  catch(e) { dimensionsRejected=/DIMENSIONS/.test(e.message); }
  return {deletionBlocked:deletion.blockers.length>0,snapshots:!!deletion.before&&!!deletion.after,
   exact:!verifyProposedProgram('Three bedrooms',bedrooms).pass,
   minimum:verifyProposedProgram('3 غرف نوم على الأقل',bedrooms).pass,
   wrongShape:!verifyProgramGeometry('kitchen 8x6',[{name:'Kitchen',type:'kitchen',w:12,h:4}]).pass,
   rotation:verifyProgramGeometry('kitchen 8x6',[{name:'Kitchen',type:'kitchen',w:6,h:8}]).pass,dimensionsRejected};
 });
 for(const [name,pass] of Object.entries(guards)) assert.equal(pass,true,name);
 console.log(JSON.stringify({browser:'Chromium',checks:result,invalidFormPreservedLand:true,browserRuntimeGuards:guards},null,2));
} finally { await browser.close(); }
