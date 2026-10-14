import { identityCollisionGate, canonicalContentFingerprint } from '/tmp/claude-0/audit/zip/aziz-id-collision.mjs';
const rect=(w,h)=>({points:[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}]});
const mk=(engine)=>({candidateId:'X',producedBy:engine,producedByVersion:'1.0.0',invocationId:'inv-'+engine,schemaVersion:'1.0.0',createdAt:'2026-10-14T00:00:0'+(engine==='e1'?1:2)+'Z',label:'RECT',geometryHash:'h',footprint:rect(20,16.575),rooms:[{roomId:'a',type:'living',zone:'f',boundary:rect(20,16.575),clearArea:331.5}],adjacency:[],entryPoints:[],metrics:{grossArea:331.5,buildRatio:.55,roomCount:1},engineConfidence:.8});
const a=mk('e1'), b=mk('e2');
console.log('identical DESIGN, different producer/invocation/createdAt');
console.log('  fingerprint equal?', canonicalContentFingerprint(a)===canonicalContentFingerprint(b));
const r=identityCollisionGate([a,b]);
console.log('  zip gate -> survivors', r.survivors.length, 'rejected', r.rejected.length, '(contract C3 expects identical content NOT rejected by the gate)');
