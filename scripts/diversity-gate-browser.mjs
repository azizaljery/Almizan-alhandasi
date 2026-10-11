import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/cua/lib/node_modules/playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('dialog',d=>d.accept());
 await page.goto(process.env.MIZAN_URL||'http://127.0.0.1:8766');await page.waitForFunction(()=>!!window.mizanStudioAPI);
 const fixture=await page.evaluate(async()=>{
  const {runMultiEngineDesign}=await import('./multi-engine.mjs'),{defaultRooms,normalizeRooms,validatePlot}=await import('./planner.mjs'),{encodeProject}=await import('./project.mjs');
  const plot=validatePlot({width:18,length:22,coverage:.9,entry:'s',streets:{s:true},floors:1}),rooms=normalizeRooms(defaultRooms({majlis:1,halls:1,bedrooms:1,baths:1,dining:0}));
  const result=await runMultiEngineDesign({plot,rooms,seed:1});
  return encodeProject({plot,rooms,model:result.selectedModel,alternatives:result.models,palette:'modern',rates:{},vat:0,costReserve:0,idea:'',discovery:{likes:[],rejects:[],avoids:[],life:{}}});
 });
 await page.locator('#projectFile').setInputFiles({name:'diversity-exhaustion.json',mimeType:'application/json',buffer:Buffer.from(fixture)});
 await page.waitForFunction(()=>window.mizanStudioAPI.getState().hasModel&&!document.querySelector('#gen').disabled);
 if(await page.locator('#cinematicSkip').isVisible())await page.locator('#cinematicSkip').click({timeout:1000}).catch(()=>{});
 if(await page.locator('#studioAdvancedToggle').isVisible())await page.locator('#studioAdvancedToggle').click();
 await page.locator('[data-tab=result]').click();
 const before=await page.evaluate(()=>window.mizanStudioAPI.getState());
 await page.locator('#freshIdeas').click();
 await page.waitForFunction(()=>!document.querySelector('#gen').disabled&&document.querySelector('#generationError').textContent.includes('تأهل 0'));
 const after=await page.evaluate(()=>window.mizanStudioAPI.getState());
 assert.deepEqual(after.model,before.model);assert.equal(after.alternativeCount,before.alternativeCount);
 assert.ok((await page.locator('#alternativesCount').textContent()).includes('٢'));
 const reason=await page.locator('#generationError').textContent();assert.match(reason,/بقيت البدائل السابقة محفوظة/);
 console.log(JSON.stringify({browser:'Chromium',preservedModel:true,preservedAlternatives:after.alternativeCount,reason},null,2));
}finally{await browser.close();}
