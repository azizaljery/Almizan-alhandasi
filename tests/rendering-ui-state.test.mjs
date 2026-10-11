import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
function body(name,next){return source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+next+'(')).replace(/async\s*$/, '');}
test('solar UI does not coerce a missing latitude into a real site',()=>{
 const state={siteSolar:null,model:null,modelLandSurvey:null,modelSurveyAssociated:false};
 const get=vm.runInNewContext(body('currentSolarPreview','renderSolarPreview')+'\ncurrentSolarPreview',{state,siteSolarPreview:(input,context)=>({input,context})});
 assert.equal(get().input,null);assert.equal(get().context.modelSurveyAssociated,false);state.siteSolar={latitude:0,longitude:0};assert.equal(get().input.latitude,0);
});
test('invalid solar input clears old 2D shadow and 3D sunlight instead of retaining stale time',()=>{
 const fields={sunInfo:{textContent:''}},calls=[];
 const render=vm.runInNewContext(body('renderSolarPreview','programTotal')+'\nrenderSolarPreview',{$:id=>fields[id],currentSolarPreview:()=>{throw Error('invalid latitude');},viewport:{showSolar:(...args)=>calls.push(args)},viewer:{setSun:preview=>calls.push(preview)}});
 render();assert.equal(fields.sunInfo.textContent,'invalid latitude');assert.equal(calls[0][0],null);assert.equal(calls[0][1],false);assert.equal(calls[1].visible,false);assert.equal(calls[1].status,'not-calculated');
});
test('context loss communicates preserved 2D without mutating model or approval',()=>{
 const fields={view:{dataset:{}},viewMode:{textContent:''},retry3D:{hidden:true}},notices=[];
 const update=vm.runInNewContext(body('on3DState','loadThree')+'\non3DState',{$:id=>fields[id],message:(id,text)=>notices.push({id,text}),viewer:null});
 update({status:'context-lost',message:'فقد سياق WebGL؛ 2D محفوظ'});
 assert.equal(fields.view.dataset.renderStatus,'context-lost');assert.equal(fields.retry3D.hidden,false);assert.match(fields.viewMode.textContent,/2D محفوظ/);assert.equal(notices.length,1);
});
test('context restoration preserves the actual camera preset in labels',()=>{
 const fields={view:{dataset:{}},viewMode:{textContent:''},retry3D:{hidden:false}},modes=[];
 const update=vm.runInNewContext(body('on3DState','loadThree')+'\non3DState',{$:id=>fields[id],message(){},viewer:{model:{},mode:'orbit',currentViewName:'top'},on3DMode:(...args)=>modes.push(args)});
 update({status:'ready'});assert.equal(fields.view.dataset.renderStatus,'ready');assert.equal(fields.retry3D.hidden,true);assert.equal(modes[0][1],'top');
});
