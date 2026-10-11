import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setImmediate as nextTurn} from 'node:timers/promises';
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const extract=(name,next)=>{const start=source.indexOf(`async function ${name}(`),end=source.indexOf(`\n${next}`,start);assert(start>=0&&end>start);return source.slice(start,end);};
const functions={generate:extract('generate','function renderBOQ('),understandRequest:extract('understandRequest','function applyRequest('),askAI:extract('askAI','function showBrief(')};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(name){
  const elements=new Map(),calls=[],messages={};let active;
  const element=id=>{if(!elements.has(id))elements.set(id,{disabled:false,value:'',textContent:'',classList:{contains:()=>false,remove(){}},replaceChildren(){},scrollIntoView(){}});return elements.get(id);};
  const pending=()=>{const d=deferred();calls.push(d);return d.promise;};
  const c={console,structuredClone,AbortSignal,document:{createElement:()=>({})},$:element,modelEpoch:0,generationSequence:0,studioOperationContext:null,studioAbort:null,clientBrief:null,AI_ENABLED:false,
    state:{studioSession:{},program:[],model:null,alternatives:[],history:[],discovery:{},briefContext:null,landSurvey:null,requestAppliedPrompt:''},exploration:{signature:'',previous:[],seed:0},
    assertStudioOperation:t=>{if(t&&t!==active)throw Error('STALE OPERATION');},isCurrentStudioOperation:(_,t)=>t===active,
    rawPlot:()=>({}),requestInput:()=>({prompt:'',rooms:[],mode:'modify'}),requestFingerprint:()=> 'same',workspaceSignature:()=> 'same',engineeringSignature:()=> 'same',signature:()=> 'same',validatePlot:x=>x,normalizeRooms:x=>x,publicRooms:x=>x,
    runPlanner:pending,analyzeClientRequest:pending,requestBrief:pending,requestLocalBrief:async()=>({rooms:[],questions:[]}),discoveryText:()=>'',buildEngineeringPromptContext:()=>({}),buildClientContext:()=>({}),bindRequestedDimensions:x=>x,verifyProposedProgram:()=>({pass:true}),
    message:(id,text)=>{messages[id]=text;},markDirty(){},renderRows(){},showResults(){},switchTab(){},toast(){},syncWorkspace(){},fmt:String,esc:String,POSITIONS:{},SIDES:{},historyEntry:model=>({model}),showBrief:brief=>{c.state.proposal=brief;}
  };
  vm.createContext(c);vm.runInContext(functions[name],c);
  return {c,calls,messages,start(id){active={id,sessionId:'session'};for(const el of elements.values())el.disabled=false;return name==='generate'?c[name]({operation:active}):c[name](active);}};
}
const success=name=>name==='generate'?{models:[{id:'new'}],selectedModel:{id:'new'},failures:[],request:{requestId:'new'}}:name==='askAI'?{brief:{rooms:[],summary:'new'},limitations:[]}:{fingerprint:'same',summary:'new',understood:[],rooms:[],desires:[],questions:[],assumptions:[],limitations:[]};
for(const name of Object.keys(functions))for(const outcome of ['reject','resolve'])test(`${name}: late A ${outcome} cannot overwrite B success feedback`,async()=>{
  const h=harness(name),a=h.start('A');await nextTurn();assert.equal(h.calls.length,1,'A must reach its real async boundary');h.c.modelEpoch++;
  const b=h.start('B');await nextTurn();assert.equal(h.calls.length,2,'B must reach its real async boundary');h.calls[1].resolve(success(name));await b;
  const feedback=name==='generate'?'generationError':name==='askAI'?'aiFeedback':'requestFeedback',before=h.messages[feedback];
  assert(!/ReferenceError|not defined|is not a function/.test(before||''),before);
  if(name==='generate')assert.equal(h.c.state.model.id,'new');else assert.equal((name==='askAI'?h.c.state.proposal:h.c.state.requestProposal).summary,'new');
  if(outcome==='reject')h.calls[0].reject(Error('OLD A ERROR'));else h.calls[0].resolve(success(name));await a;
  assert.equal(h.messages[feedback],before,'Late stale A must leave the newer successful feedback intact');
});
