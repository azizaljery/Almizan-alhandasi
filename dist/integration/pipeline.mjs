/** Local integration preview over frozen handoffs. No provider call, UI change or deployment.
 * Keeps native module/package names. SHA-256 binding is kept separate from legacy AZIZ FNV.
 * Only measured geometry/area/program axes participate. Other AZIZ axes are diagnostics,
 * NOT evidence of privacy, ventilation, statutory compliance or engineering approval.
 */
import { attachExplicitProgramConstraints, verifyProposedProgram } from '../brief-contract.mjs';
import schema from './control/contracts/mizan-envelope-v1.schema.json' with {type:'json'};
import {generateModelLegacy,quantities} from '../claude/compat-layer.mjs';
import {validateModel} from '../claude/planner.mjs';
import {reviewCandidate,verifyBoundReview} from './gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
import {validateEnvelope} from './gemini/packages/engineering-core/contracts/mizan-ir-v1.adapter.js';
import {contentHash,geometryHash,candidateId,verifyCandidateBinding,canonicalJSON,FRAME,UNITS} from './control/reference/identity.mjs';
import {auditMassing} from './control/reference/orthogonal-audit.mjs';
import {createAziz,defaultConfig,fnv1aHash,stableStringify,fixedClock} from './aziz/index.js';

const CLAUDE_ID='@mizan/claude-planner';
const CLAUDE_VERSION='2.3.1-p1-cla-01';
const SOURCE='549b8bcead0f9f2412bf1ea84c83ddb7524137d22166649a1adfcf87e8474c3d';
const ADAPTER_VERSION='control-local-preview/1.0.0';
const STRATEGIES={rect:'compact',l:'l',u:'u-court'};
const GEOMETRY_KEYS=[...Object.keys(schema.$defs.geometry.properties),'footprint','program'];
const CAPABILITIES={disciplines:['architectural'],supportsGeometry:true,supportsRequirements:true,supportsScoring:false,deterministic:true};
const CONFIDENCE=.5; // Uniform legacy numeric field, explicit neutral heuristic, NOT calibrated confidence.

function snapshot(request) {
 validateEnvelope(request,'request');
 return JSON.parse(canonicalJSON(request));
}
function validDimensions(c, r) {
 const v=c.value;
 return c.kind==='explicit_dimensions' && r.program.some(p=>p.id===v?.roomId)
  && Number.isFinite(v.width) && v.width>0 && Number.isFinite(v.length) && v.length>0
  && typeof v.allowRotation==='boolean';
}
function dimensionViolations(r, geometry) {
 const inferred=attachExplicitProgramConstraints(r.interpretation.originalText,r.program).flatMap(p=>p.dimensions ? [{kind:'explicit_dimensions',value:{roomId:p.id,...p.dimensions}}] : []);
 return [...r.hardConstraints.filter(c=>c.kind==='explicit_dimensions'),...inferred].filter(c=>{
  const v=c.value, matches=geometry.rooms.filter(room=>room.id===v.roomId);
  if(matches.length!==1) return true;
  const room=matches[0], equal=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<=1e-7;
  return !(equal(room.w,v.width)&&equal(room.h,v.length))
   && !(v.allowRotation&&equal(room.w,v.length)&&equal(room.h,v.width));
 });
}
function supportedRequest(r) {
 const reasons=[];
 const programCompliance=verifyProposedProgram(r.interpretation.originalText,r.program);
 if(!programCompliance.pass) reasons.push('EXPLICIT_PROGRAM_CONSTRAINT_VIOLATED:'+programCompliance.violations.join('|'));
 try { attachExplicitProgramConstraints(r.interpretation.originalText,r.program); } catch(e) { reasons.push('EXPLICIT_DIMENSIONS_REQUIRE_CLARIFICATION:'+e.message); }
 if(r.interpretation.status!=='confirmed'||r.interpretation.unresolved.length) reasons.push('REQUEST_REQUIRES_CONFIRMATION');
 if(r.plot.floorsRequested!==1) reasons.push('ADDITIONAL_FLOORS_NOT_IMPLEMENTED');
 if(!r.program.every((p,i)=>p.id===`room-${i}`)) reasons.push('EXPLICIT_PROGRAM_ID_MAPPING_NOT_IMPLEMENTED_IN_PREVIEW');
 // Fail closed rather than pretending the legacy distance/adjacency heuristics prove a must.
 for(const c of r.hardConstraints) {
  if(!validDimensions(c,r)&&(c.kind!=='room_count_exact'||!Number.isInteger(c.value?.count)||c.value.count<0)) reasons.push(`MUST_REQUIRES_REVIEW:${c.id}`);
 }
 return reasons;
}
export async function generateCandidate(request,shape,generationOverrides={}) {
 const r=snapshot(request);
 if(!Object.hasOwn(STRATEGIES,shape)) throw Error('UNSUPPORTED_SHAPE');
 const inputReasons=supportedRequest(r); if(inputReasons.length) throw Error(inputReasons.join(';'));
 const plot={width:r.plot.widthM,length:r.plot.lengthM,entry:r.plot.entry,streets:r.plot.streets,
  floors:r.plot.floorsRequested,coverage:r.plot.coverageRatio,maxBuiltAreaM2:r.plot.maxBuiltAreaM2,...generationOverrides};
 const rooms=r.program.map(p=>({name:p.name,type:p.type,area:p.areaM2,position:p.position,side:p.side}));
 const m=generateModelLegacy(plot,rooms,{strategy:STRATEGIES[shape],allowFallback:false});
 const errors=validateModel(m); if(errors.length) throw Error('NATIVE_VALIDATION_FAILED:'+errors.join(';'));
 const geometry=Object.fromEntries(GEOMETRY_KEYS.filter(k=>m[k]!==undefined).map(k=>[k,structuredClone(m[k])]));
 if(dimensionViolations(r,geometry).length) throw Error('EXPLICIT_DIMENSIONS_VIOLATED:'+dimensionViolations(r,geometry).map(c=>c.value.roomId).join(','));
 canonicalJSON(geometry); // Never turn NaN/Infinity into JSON null.
 const massing=auditMassing(geometry.buildingFootprint,m.massingParts??[m.building],geometry.courtyards);
 if(!massing.pass) throw Error('MASSING_NOT_EQUIVALENT');
 const c={schemaVersion:'1.0.0',kind:'CandidateEnvelope',projectId:r.projectId,requestId:r.requestId,
  inputHash:await contentHash(r),producer:{engineId:CLAUDE_ID,packageName:'planner-pkg',packageVersion:CLAUDE_VERSION,
  sourceSha256:SOURCE,adapterVersion:ADAPTER_VERSION},alternativeKey:`${shape}-${r.plot.entry}`,requestedShape:shape,actualShape:m.shape,
  units:{...UNITS},frame:FRAME,fallback:{used:m.shapeFallback,allowedByUser:false,reason:null},geometry,
  presentation:{label:m.architecture.tag,massingParts:structuredClone(m.massingParts??null)}};
 c.geometryHash=await geometryHash(c); c.candidateId=await candidateId(c);
 validateEnvelope(c,'candidate'); await verifyCandidateBinding(c,r);
 return {candidate:c,massing,nativeValidation:{engineId:CLAUDE_ID,sourceSha256:SOURCE,errors}};
}
function asAziz(c,invocationId,at) {
 const g=c.geometry,area=quantities(g).footprint;
 // AZIZ v1 cannot represent corridor access without distorting room_count_exact.
 // Preserve ALL native doors/links in raw. Do not fabricate room adjacency or entries.
 return {candidateId:c.candidateId,producedBy:CLAUDE_ID,producedByVersion:CLAUDE_VERSION,invocationId,
  schemaVersion:'1.0.0',createdAt:at,label:c.presentation.label,geometryHash:c.geometryHash.value,
  footprint:{points:structuredClone(g.buildingFootprint)},rooms:g.rooms.map(r=>({roomId:r.id,type:r.type,
   zone:'unspecified',boundary:{points:[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}]},clearArea:r.w*r.h})),
  adjacency:[],entryPoints:[],metrics:{grossArea:area,buildRatio:area/(g.plot.width*g.plot.length),roomCount:g.rooms.length},
  engineConfidence:CONFIDENCE,raw:{candidateEnvelope:structuredClone(c),confidenceMeaning:'Uniform uncalibrated adapter heuristic; not probability of correctness.',
  accessProjection:'Unavailable in legacy AZIZ; original openings/corridors/links preserved; native validation separately required.'}};
}
function output(engineId,version,candidates,inputHash,at,invocationId,raw,confidence,geometry=true) {
 return {engineId,engineVersion:version,invocationId,capabilities:{...CAPABILITIES,supportsGeometry:geometry},confidence,
  execution:{startedAt:at,completedAt:at,durationMs:0,version,status:geometry?'ok':'partial'},
  provenance:{engineId,engineVersion:version,invocationId,requestedAt:at,completedAt:at,inputHash},assumptions:[],warnings:[],constraintsEvaluated:[],candidates,raw};
}
async function decision(r,status,selected,reviews,reasons) {
 const core={schemaVersion:'1.0.0',kind:'DecisionEnvelope',projectId:r.projectId,requestId:r.requestId,inputHash:await contentHash(r),
 status,selectedCandidateId:selected?.candidateId??null,geometryHash:selected?.geometryHash??null,
 reviewIds:reviews.map(x=>x.reviewId).sort(),reasons,acceptanceProfile:'ARCHITECTURAL_PRELIMINARY_V1',constructionApproved:false};
 const d={...core,decisionId:'decision:'+(await contentHash(core)).value}; validateEnvelope(d,'decision'); return d;
}
export async function decideReviewed(request,pairs) {
 const r=snapshot(request),inputReasons=supportedRequest(r);
 if(!Array.isArray(pairs)) throw Error('PAIRS_NOT_ARRAY');
 if(inputReasons.length) return {decision:await decision(r,'NEEDS_CLARIFICATION',null,[],inputReasons),aziz:null,rejected:[]};
 const eligible=[],validReviews=[],rejected=[],seen=new Set();
 for(const p of pairs) {
  const {candidate:c,review}=p;
  if(!c||!review) throw Error('CANDIDATE_OR_REVIEW_MISSING');
  await verifyBoundReview(review,c,r); // source schema, identity, actual content hash, registry and coverage.
  const nativeErrors=validateModel(c.geometry);
  if(nativeErrors.length) throw Error('NATIVE_VALIDATION_FAILED:'+nativeErrors.join(';'));
  const audit=auditMassing(c.geometry.buildingFootprint,c.presentation.massingParts??[c.geometry.building],c.geometry.courtyards);
  if(!audit.pass) throw Error('MASSING_NOT_EQUIVALENT');
  if(seen.has(c.candidateId)) throw Error('DUPLICATE_CANDIDATE_ID'); seen.add(c.candidateId);
  validReviews.push(review);
  if(dimensionViolations(r,c.geometry).length) { rejected.push({candidateId:c.candidateId,failedChecks:['explicit-dimensions'],unprovenChecks:[]}); continue; }
  const failed=review.checks.filter(x=>x.status==='FAIL');
  const essential=['identity','polygon-area','plot-bounds','space-containment','opening-references','plot-coverage','program-areas','requested-floors','interpretation'];
  const missing=essential.filter(id=>review.checks.find(x=>x.id===id)?.status!=='PASS');
  if(failed.length||missing.length) { rejected.push({candidateId:c.candidateId,failedChecks:failed.map(x=>x.id),unprovenChecks:missing}); continue; }
  eligible.push(c);
 }
 if(!eligible.length) return {decision:await decision(r,'NO_SELECTION',null,validReviews,['No candidate passed native validation and all required architectural checks.']),aziz:null,rejected};
 const at=new Date().toISOString(),invocationId='inv:'+(await contentHash({request:r,adapterVersion:ADAPTER_VERSION})).value;
 // Dimensions are proven above on actual rectangles; legacy AZIZ cannot evaluate this kind.
 const hard=[...r.hardConstraints.filter(c=>c.kind!=='explicit_dimensions'),...r.program.map(p=>({id:`area:${p.id}`,kind:'explicit_area',description:'Preserve requested clear room area',
  value:{roomId:p.id,area:p.areaM2,tolerance:1e-8},source:'user',priority:'must'}))];
 const input={requestId:r.requestId,context:{plotArea:r.plot.widthM*r.plot.lengthM,cityCode:'unspecified',locale:'ar'},hardConstraints:hard,softPreferences:[]};
 const legacyHash=fnv1aHash(stableStringify(input));
 const mapped=eligible.map(c=>asAziz(c,invocationId,at));
 const engineOutputs=[output(CLAUDE_ID,CLAUDE_VERSION,mapped,legacyHash,at,invocationId,{sharedRequestHash:await contentHash(r)},CONFIDENCE),
  output('@mizan/gemini-review','P1-GEM-01/1.0.0',[],legacyHash,at,invocationId,
   {reviews:validReviews,confidence:{kind:'UNAVAILABLE',value:null}},0,false)];
 const weights=Object.fromEntries(Object.keys(defaultConfig().weights).map(k=>[k,0]));
 Object.assign(weights,{geometryValidity:3,hardConstraintCompliance:3,areaAccuracy:1,designEfficiency:1});
 const aziz=await createAziz({weights,activeProfile:'balanced',tieThreshold:Number.EPSILON},fixedClock(at)).process({...input,engineOutputs});
 const selected=eligible.find(c=>c.candidateId===aziz.selectedCandidateId)??null;
 const reasons=[selected?'AZIZ selected from native-validated candidates after the bound Gemini review gate.':'AZIZ rejected all architectural candidates.',
  'Only geometry validity, explicit area compliance and area efficiency are weighted; privacy, access graph, reference and MEP axes have weight 0.',
  'Gemini incomplete discipline coverage is retained; this is not construction approval.',
  r.softPreferences.length?'Soft preferences retained in request but NOT_EVALUATED by this first integration preview.':'No soft preferences were supplied.'];
 return {decision:await decision(r,selected?'SELECTED_PRELIMINARY':'NO_SELECTION',selected,validReviews,reasons),aziz,rejected,
 finalDesignState:selected?{candidateId:selected.candidateId,geometryHash:selected.geometryHash,model:structuredClone(selected.geometry),
  presentation:structuredClone(selected.presentation),constructionApproved:false}:null};
}
export async function runPipeline(request,{shapes=['rect','l','u'],generationOverrides={}}={}) {
 const r=snapshot(request),problems=supportedRequest(r);
 if(problems.length) return {pairs:[],failures:[],decision:await decision(r,'NEEDS_CLARIFICATION',null,[],problems),aziz:null};
 if(!Array.isArray(shapes)||!shapes.length||shapes.some(s=>!Object.hasOwn(STRATEGIES,s))) throw Error('INVALID_SHAPE_LIST');
 const pairs=[],failures=[];
 for(const shape of [...new Set(shapes)]) {
  let generated;
  try { generated=await generateCandidate(r,shape,generationOverrides); }
  catch(e) { failures.push({shape,reason:e.message}); continue; }
  const review=await reviewCandidate(generated.candidate,r);
  pairs.push({...generated,review});
 }
 return {pairs,failures,...await decideReviewed(r,pairs)};
}
