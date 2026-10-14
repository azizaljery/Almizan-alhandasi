import { createAziz, fixedClock, fnv1aHash, stableStringify } from '/home/claude/almizan-alhandasi/dist/integration/aziz/index.js';
const C=fixedClock('2026-10-14T00:00:00.000Z');
const REQ={requestId:'r',context:{plotArea:600,cityCode:'u',locale:'ar'},hardConstraints:[],softPreferences:[]};
const FP=fnv1aHash(stableStringify(REQ));
const rect=(w,h)=>({points:[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}]});
const cand=(id,shape,area)=>({candidateId:id,producedBy:'e1',producedByVersion:'1.0.0',invocationId:'inv',schemaVersion:'1.0.0',createdAt:'t',label:shape,geometryHash:'h',footprint:rect(20,area/20),rooms:[{roomId:'a',type:'living',zone:'f',boundary:rect(20,area/20),clearArea:area}],adjacency:[],entryPoints:[],metrics:{grossArea:area,buildRatio:area/600,roomCount:1},engineConfidence:.8});
const out=(cs)=>({engineId:'e1',engineVersion:'1.0.0',invocationId:'inv',capabilities:{disciplines:['a'],supportsGeometry:true,supportsRequirements:false,supportsScoring:false,deterministic:true},confidence:.8,execution:{startedAt:'t',completedAt:'t',durationMs:0,version:'1.0.0',status:'ok'},provenance:{engineId:'e1',engineVersion:'1.0.0',invocationId:'inv',requestedAt:'t',completedAt:'t',inputHash:FP},assumptions:[],warnings:[],constraintsEvaluated:[],candidates:cs});
for (const order of [['RECT','L'],['L','RECT']]) {
  const cs=order.map(s=>cand('X',s,s==='RECT'?331.5:367.2));
  const st=await createAziz({},C).process({...REQ,engineOutputs:[out(cs)]});
  console.log(order.join(','),'=> status',st.status,'selected',st.selectedCandidateId,'| scores',JSON.stringify(st.scores.map(s=>({id:s.candidateId,total:s.confidenceAdjustedTotal}))));
  console.log('  provenance(proposed/invalid):',st.provenance.filter(p=>/invalid|proposed/i.test(p.statement)||p.action==='objected').map(p=>p.statement+' | '+p.evidence.join(',')));
  console.log('  trace keys:',st.decisionTrace?Object.keys(st.decisionTrace):null, st.decisionTrace?.steps?.map(s=>s.summary).slice(0,4));
}
