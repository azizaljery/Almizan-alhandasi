import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createStudioSession,appendStudioMessage} from '../dist/studio-session.mjs';
const source=fs.readFileSync(new URL('../dist/studio-simple.mjs',import.meta.url),'utf8');
const style=source.slice(source.indexOf('function styleOnlyCommand('),source.indexOf('\nfunction plotValues('));
const request=source.slice(source.indexOf('  const request = async local => {'),source.indexOf("\n  $('studioBrief').addEventListener('input'"));
for(const count of [253,255,256]) test(`full conversation (${count}) rejects style and plot requests before mutation`,async()=>{
 for(const text of ['modern','أرض 20×30']){
 const session=createStudioSession();for(let i=0;i<count;i++)appendStudioMessage(session,{role:'user',text:'prior'});
 const brief={value:text};let clicks=0,plotChanges=0,notices=[],draftCleared=false;
 const context={trim:v=>String(v??'').trim(),$:()=>brief,api:{getState:()=>({hasModel:true,studioSession:session}),setPlot:()=>plotChanges++,setStudioDraft:()=>{draftCleared=true;}},document:{querySelector:()=>({click:()=>clicks++})},persistMessage:(role,text)=>appendStudioMessage(session,{role,text}),status:msg=>notices.push(msg),clearPending:()=>{},extractPlotDimensions:()=>null,plotValues:()=>({}),updatePlotHint:()=>{}};
 const actual=vm.runInNewContext(style+'\n'+request+'\nrequest;',context);
 await actual(true);
 assert.equal(clicks,0);assert.equal(plotChanges,0);assert.equal(notices.length,1);assert.match(notices[0],/حد الرسائل/);assert.equal(draftCleared,false);assert.equal(session.messages.length,count);
 }
});
