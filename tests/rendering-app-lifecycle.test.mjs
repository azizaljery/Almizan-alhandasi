import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const actual=extract('function on3DState(','async function loadThree(')+extract('async function show3D(','function prepareTour(');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness({existing=false,lost=false,inside=false,roof=true,wait=null}={}){
  const fields={view:{dataset:{}},roof:{checked:inside?false:roof},analyticsOverlay:{checked:false},retry3D:{hidden:false},viewMode:{textContent:''}},calls=[];
  const model={geometryRevision:7,rooms:[{id:'r',name:'Room'}]},approval={review:'unchanged'};
  class Viewer {
    constructor(){this.mode='orbit';this.contextLost=false;this.roofChoice=false;this.currentViewName='persp';calls.push(['construct']);}
    setVisible(value){this.visible=value;calls.push(['visible',value]);}
    setModel(value,palette){this.model=value;this.mode='orbit';this.currentViewName='persp';calls.push(['model',value,palette]);}
    setRoof(value){this.roofChoice=value;calls.push(['roof',value]);}
    setAnalytics(value){this.analyticsOn=value;calls.push(['analytics',value]);}
    destroy(){this.destroyed=true;calls.push(['destroy']);}
  }
  const old=existing?Object.assign(new Viewer(),{model,mode:inside?'inside':'orbit',roofChoice:roof,contextLost:lost}):null;
  calls.length=0;
  const context={state:{model,palette:'modern',studioMode:'3d',selected:'r',approval},modelEpoch:4,viewer:old,RoomViewer:Viewer,
    $:id=>fields[id],message:(id,text)=>calls.push(['message',id,text]),loadThree:()=>wait?.promise??Promise.resolve(),
    studioSceneVisible:()=>true,renderSolarPreview:()=>calls.push(['solar']),on3DMode:(...args)=>calls.push(['mode',...args])};
  vm.createContext(context);vm.runInContext(actual+'\nglobalThis.run=show3D;globalThis.report=on3DState;',context);
  return {context,fields,calls,model,approval,old};
}
test('successful initial setup explicitly announces ready without changing model or approval',async()=>{
  const h=harness();assert.equal(await h.context.run(),true);assert.equal(h.fields.view.dataset.renderStatus,'ready');
  assert.equal(h.context.viewer.model,h.model);assert.equal(h.context.state.model,h.model);assert.equal(h.context.state.approval,h.approval);
  assert.equal(h.fields.retry3D.hidden,true);assert.equal(h.fields.view.dataset.geometryRevision,'7');
});
test('nonretry refresh during context loss retains current model but never claims ready',async()=>{
  const h=harness({existing:true,lost:true});const next={geometryRevision:8,rooms:[]};h.context.state.model=next;
  assert.equal(await h.context.run(),false);assert.equal(h.context.viewer,h.old);assert.equal(h.old.model,next);
  assert.equal(h.fields.view.dataset.renderStatus,'context-lost');assert.equal(h.fields.retry3D.hidden,false);assert.equal(h.old.destroyed,undefined);
});
for(const roof of [true,false]) test(`retry replaces lost viewer and preserves interior roof choice ${roof}`,async()=>{
  const h=harness({existing:true,lost:true,inside:true,roof});assert.equal(await h.context.run(true),true);
  assert.equal(h.old.destroyed,true);assert.notEqual(h.context.viewer,h.old);assert.equal(h.context.viewer.roofChoice,roof);
  assert.equal(h.context.viewer.model,h.model);assert.equal(h.context.state.approval,h.approval);assert.equal(h.fields.view.dataset.renderStatus,'ready');assert.equal(h.fields.retry3D.hidden,true);
});
test('ordinary refresh from interior preserves the explicit roof choice',async()=>{
  const h=harness({existing:true,inside:true,roof:true});assert.equal(h.fields.roof.checked,false);
  await h.context.run();assert.equal(h.context.viewer.roofChoice,true);assert.equal(h.fields.roof.checked,true);
});
for(const kind of ['model','epoch'])test(`stale runtime load cannot replace scene after ${kind} changed`,async()=>{
  const wait=deferred(),h=harness({wait});const task=h.context.run();
  if(kind==='model')h.context.state.model={geometryRevision:9};else h.context.modelEpoch++;
  wait.resolve();assert.equal(await task,false);assert.equal(h.context.viewer,null);assert.ok(!h.calls.some(c=>c[0]==='construct'));assert.equal(h.fields.view.dataset.renderStatus,undefined);
});
test('stale failed load cannot overwrite a newer rendering message',async()=>{
  const wait=deferred(),h=harness({wait});const task=h.context.run();h.context.modelEpoch++;h.calls.length=0;h.fields.viewMode.textContent='new scene';
  wait.reject(Error('obsolete error'));assert.equal(await task,false);assert.deepEqual(h.calls,[]);assert.equal(h.fields.viewMode.textContent,'new scene');
});
for(const preset of ['top','front'])test(`restored context retains ${preset} UI camera designation`,()=>{
  const h=harness({existing:true});h.old.currentViewName=preset;h.context.report({status:'ready'});
  assert.ok(h.calls.some(c=>c[0]==='mode'&&c[1]==='orbit'&&c[2]===preset));
});
