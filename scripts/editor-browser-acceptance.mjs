import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true});
 await page.goto(process.env.MIZAN_URL||'http://127.0.0.1:8766');
 await page.waitForFunction(()=>!!window.mizanStudioAPI);
 const result=await page.evaluate(async()=>{
  const p=await import('./planner.mjs'),{encodeProject,decodeProject}=await import('./project.mjs');
  const {circulationNetwork}=await import('./circulation.mjs');
  const plot={width:20,length:30,floors:1,entry:'s',streets:{s:true}},rooms=p.defaultRooms(),model=p.generateModel(plot,rooms);
  const win=model.openings.find(o=>o.type==='window'),edited=p.removeOpening(model,p.openingPoint(model,win));
  const text=encodeProject({plot,rooms,palette:'modern',rates:{},costReserve:0,vat:0,idea:'synthetic browser acceptance',discovery:{likes:[],rejects:[],avoids:[],life:{}},model:edited});
  const reopened=decodeProject(text).model;
  const wall=model.walls.find(w=>w.id==='wall-6');
  const withDoor=p.placeOpening(model,{type:'door',point:{x:wall.x1+(wall.x2-wall.x1)*.25,y:wall.y1+(wall.y2-wall.y1)*.25}});
  const original=withDoor.openings.find(o=>o.type==='door'&&o.roomId==='room-4');
  const routeModel=p.removeOpening(withDoor,p.openingPoint(withDoor,original));
  const route=circulationNetwork(routeModel).toRoom('room-4');
  let webgl;
  try {
   const {loadThreeRuntime}=await import('./three-runtime.mjs');await loadThreeRuntime();
   const {RoomViewer}=await import('./viewer3d.mjs');
   const box=document.createElement('div');box.style.cssText='position:fixed;inset:0;width:800px;height:600px;background:white;z-index:99999';document.body.append(box);
   const viewer=new RoomViewer(box);viewer.setModel(routeModel);const entered=viewer.enter('room-4');
   webgl={verified:entered===true&&viewer.mode==='inside'&&!viewer.renderer.getContext().isContextLost(),entered,mode:viewer.mode,canvas:box.querySelectorAll('canvas').length};
   viewer.destroy();box.remove();
  }catch(error){webgl={verified:false,error:error.message};}
  return {openingCounts:[model.openings.length,edited.openings.length,reopened.openings.length],windowCounts:[model,edited,reopened].map(m=>m.openings.filter(o=>o.type==='window').length),exact:JSON.stringify(reopened.openings)===JSON.stringify(edited.openings),route:!!route,routeMetres:route?.metres,validation:p.validateModel(routeModel),webgl};
 });
 assert.deepEqual(result.openingCounts,[22,21,21]);assert.deepEqual(result.windowCounts,[9,8,8]);assert.equal(result.exact,true);assert.equal(result.route,true);assert.deepEqual(result.validation,[]);
 console.log(JSON.stringify({browser:'Chromium',...result},null,2));
 if(!result.webgl.verified)process.exitCode=2;
}finally{await browser.close();}
