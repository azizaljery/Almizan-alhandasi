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
 const projectText = await page.evaluate(async()=>{
  const {encodeProject}=await import('./project.mjs');
  const {geoJSONFromVertices,validateLandSurvey}=await import('./land-survey.mjs');
  const api=window.mizanStudioAPI;
  const landSurvey=validateLandSurvey({version:1,
   geometry:geoJSONFromVertices([[46.6753,24.7136],[46.6755,24.7136],[46.6755,24.7139],[46.6753,24.7139]]),
   references:[20.1,33.3,20.1,33.3],engineLink:'survey-rectangle',
   binding:{width:20.1,length:33.3,source:'confirmed-edge-references'},mapView:{center:[24.7136,46.6753],zoom:16,provider:'local'}});
  return encodeProject({plot:{...api.getState().plot,width:20.1,length:33.3,maxBuiltArea:null},rooms:api.getState().program,
   palette:'modern',rates:{},costReserve:0,vat:0,idea:'synthetic survey compatibility test',discovery:{likes:[],rejects:[],avoids:[],life:{}},
   model:null,landSurvey,modelLandSurvey:null});
 });
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#projectFile').setInputFiles({name:'synthetic-survey.json',mimeType:'application/json',buffer:Buffer.from(projectText)});
 await page.waitForFunction(()=>document.getElementById('projectStatus').textContent.includes('تم استيراد'));
 const survey = await page.evaluate(()=>{
  const api=window.mizanStudioAPI, before=api.getState().plot;let rejected=false;
  try{api.setPlot({...before,width:before.width+1});}catch(e){rejected=/المسح/.test(e.message);}
  const unchanged=JSON.stringify(before)===JSON.stringify(api.getState().plot);
  const accepted=api.setPlot({...before,entry:'e'});
  return {rejected,unchanged,entryAccepted:accepted.entry==='e',streetsPreserved:JSON.stringify(accepted.streets)===JSON.stringify(before.streets)};
 });
 for(const [name,pass] of Object.entries(survey)) assert.equal(pass,true,'survey '+name);
 console.log(JSON.stringify({browser:'Chromium',checks:result,invalidFormPreservedLand:true,surveyBinding:survey},null,2));
} finally { await browser.close(); }
