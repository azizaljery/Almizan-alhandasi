import { verifyProposedProgram, verifyProgramGeometry } from '../brief-contract.mjs';
/** Local integration preview over frozen handoffs. No provider call, UI change or deployment.
 * Keeps native module/package names. SHA-256 binding is kept separate from legacy AZIZ FNV.
 * Only measured geometry/area/program axes participate. Other AZIZ axes are diagnostics,
 * NOT evidence of privacy, ventilation, statutory compliance or engineering approval.
 */
import schema from './control/contracts/mizan-envelope-v1.schema.mjs';
import {generateModelLegacy,quantities} from '../claude/compat-layer.mjs';
import {validateModel,RECT_SEARCH_VERSION} from '../claude/planner.mjs';
import {reviewCandidate,verifyBoundReview} from './gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
import {validateEnvelope} from './gemini/packages/engineering-core/contracts/mizan-ir-v1.adapter.js';
import {contentHash,geometryHash,candidateId,verifyCandidateBinding,canonicalJSON,FRAME,UNITS} from './control/reference/identity.mjs';
import {auditMassing} from './control/reference/orthogonal-audit.mjs';
import {createAziz,defaultConfig,fnv1aHash,stableStringify,fixedClock} from './aziz/index.js';
import {generatePavilionModel,pavilionTopology,PAVILION_COMPOSER_VERSION} from '../pavilion-planner.mjs';
import {generateStaggeredModel,staggeredTopology,STAGGERED_COMPOSER_VERSION} from '../staggered-planner.mjs';
import {exploreGeometry,conceptFor} from '../design-exploration.mjs';
import {evaluatePlanPreferences,rankAzizSurvivingPreferences} from '../preference-evidence.mjs';

const CLAUDE_ID='@mizan/claude-planner';
const CLAUDE_VERSION=RECT_SEARCH_VERSION;
const SOURCE='408f51b84bb52c3f67ddeb9f0e81f52adbe7c8c45751d999ed58d99521788d36';
const ADAPTER_VERSION='control-local-preview/1.1.0';
const PAVILION_SOURCE='1ce9f064dd41f822582ce13f70d86a3cdc8c418808c9cad5df3c653c810972a9';
const STAGGERED_SOURCE='0300ebb2460433dcee8c44ce28be7b1bc1db403ef9721a2d922292f190abcf16';
const STRATEGIES={rect:'compact',l:'l',u:'u-court',pavilions:'pavilions',staggered:'staggered'};
const GEOMETRY_KEYS=[...Object.keys(schema.$defs.geometry.properties),'footprint','program'];
const CAPABILITIES={disciplines:['architectural'],supportsGeometry:true,supportsRequirements:true,supportsScoring:false,deterministic:true};
const CONFIDENCE=.5; // Uniform legacy numeric field, explicit neutral heuristic, NOT calibrated confidence.

function snapshot(request) {
 validateEnvelope(request,'request');
 return JSON.parse(canonicalJSON(request));
}
function verifyRequestedGeometry(r,rooms) {
 const check=verifyProgramGeometry(r.interpretation.originalText,rooms);
 for(const c of r.hardConstraints.filter(c=>c.kind==='room_dimensions_exact')) {
  const matching=rooms.filter(room=>room.id===c.value.roomId), v=c.value;
  const same=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<=Math.min(v.toleranceM,1e-5);
  const room=matching[0];
  if(matching.length!==1 || !((same(room.w,v.widthM)&&same(room.h,v.lengthM)) ||
   (v.rotationAllowed&&same(room.w,v.lengthM)&&same(room.h,v.widthM)))) check.violations.push('EXPLICIT_DIMENSIONS_VIOLATED:'+v.roomId);
 }
 return {...check,pass:check.violations.length===0};
}
function supportedRequest(r) {
 const reasons=[];
 const programCompliance=verifyProposedProgram(r.interpretation.originalText,r.program);
 if(!programCompliance.pass) reasons.push('EXPLICIT_PROGRAM_CONSTRAINT_VIOLATED:'+programCompliance.violations.join('|'));
 if(r.interpretation.status!=='confirmed'||r.interpretation.unresolved.length) {
  if(r.interpretation.unresolved.length) reasons.push(...r.interpretation.unresolved.map(reason=>`REQUEST_REQUIRES_CONFIRMATION:${reason}`));
  else reasons.push('REQUEST_REQUIRES_CONFIRMATION');
 }
 if(r.plot.floorsRequested!==1) reasons.push('ADDITIONAL_FLOORS_NOT_IMPLEMENTED');
 if(!r.program.every((p,i)=>p.id===`room-${i}`)) reasons.push('EXPLICIT_PROGRAM_ID_MAPPING_NOT_IMPLEMENTED_IN_PREVIEW');
 // Fail closed rather than pretending the legacy distance/adjacency heuristics prove a must.
 for(const c of r.hardConstraints) {
  const count=c.kind==='room_count_exact'&&Number.isInteger(c.value?.count)&&c.value.count>=0;
  const exactRoom=r.program.find(p=>p.id===c.value?.roomId), exact= c.kind==='room_dimensions_exact' && exactRoom?.exactDimensionsM && typeof c.value?.rotationAllowed==='boolean' && Number.isFinite(c.value?.widthM) && Number.isFinite(c.value?.lengthM) && Number.isFinite(c.value?.toleranceM) && c.value.toleranceM>=0 && Math.abs(c.value.widthM-exactRoom.exactDimensionsM.widthM)<=1e-8 && Math.abs(c.value.lengthM-exactRoom.exactDimensionsM.lengthM)<=1e-8;
  const shape=c.kind==='shape_allowed'&&Array.isArray(c.value?.shapes)&&c.value.shapes.length>0&&c.value.shapes.every(s=>Object.hasOwn(STRATEGIES,s));
  const wing=c.kind==='wing_count_exact'&&c.value?.count===2&&r.hardConstraints.some(x=>x.kind==='shape_allowed'&&x.value?.shapes?.includes('staggered'));
  if(c.kind==='wing_count_exact'&&!wing) reasons.push(c.value?.count===2?'WING_COUNT_REQUIRES_STAGGERED':'UNSUPPORTED_WING_COUNT');
  else if(!count&&!exact&&!shape&&!wing) reasons.push(`MUST_REQUIRES_REVIEW:${c.id}`);
 }
 return reasons;
}
// Only already-recognized directional route preferences enter the bounded solver.
// Other asks remain in the existing explicit preference/unsupported evidence.
function searchRelationships(request) {
 const relationships=[];
 for(const preference of request.softPreferences) {
  const kind=preference.value?.mizanKind;
  if(!['prefer_dining_access_all_majlis','prefer_dining_far_from_majlis'].includes(kind)) continue;
  const relation=kind==='prefer_dining_far_from_majlis'?'far':'near';
  for(const a of request.program.filter(r=>r.type==='dining')) for(const b of request.program.filter(r=>r.type==='majlis')) relationships.push({roomIds:[a.id,b.id],relation,weight:1});
 }
 return relationships;
}
export async function generateCandidate(request,shape,generationOverrides={},exploration=null) {
 const r=snapshot(request);
 if(!Object.hasOwn(STRATEGIES,shape)) throw Error('UNSUPPORTED_SHAPE');
 const inputReasons=supportedRequest(r); if(inputReasons.length) throw Error(inputReasons.join(';'));
 if(r.hardConstraints.some(c=>c.kind==='shape_allowed'&&!c.value.shapes.includes(shape))) throw Error('SHAPE_NOT_ALLOWED');
 const composed=shape==='pavilions'||shape==='staggered';
 const plot={width:r.plot.widthM,length:r.plot.lengthM,entry:r.plot.entry,streets:r.plot.streets,
  floors:r.plot.floorsRequested,coverage:r.plot.coverageRatio,maxBuiltAreaM2:r.plot.maxBuiltAreaM2,...generationOverrides};
 const rooms=r.program.map(p=>({name:p.name,type:p.type,area:p.areaM2,...(p.exactDimensionsM?{dimensions:{width:p.exactDimensionsM.widthM,length:p.exactDimensionsM.lengthM,...(r.hardConstraints.some(c=>c.kind==='room_dimensions_exact'&&c.value.roomId===p.id&&c.value.rotationAllowed===false)?{allowRotation:false}:{})}}:{}),position:p.position,side:p.side}));
 const search=exploration?.search ? {...exploration.search,relationships:searchRelationships(r)} : null;
 const resolvedExploration=search?{...exploration,search}:exploration;
 const m=shape==='staggered' ? generateStaggeredModel(plot,rooms) : shape==='pavilions' ? generatePavilionModel(plot,rooms) : exploration ? exploreGeometry(plot,rooms,shape,resolvedExploration,STRATEGIES[shape]) : generateModelLegacy(plot,rooms,{strategy:STRATEGIES[shape],allowFallback:false});
 const topology=shape==='staggered'?staggeredTopology(m):shape==='pavilions'?pavilionTopology(m):{errors:[]};
 const requiredWings=r.hardConstraints.find(c=>c.kind==='wing_count_exact')?.value?.count;
 if(requiredWings!==undefined&&(shape!=='staggered'||topology.wingCount!==requiredWings)) throw Error('REQUESTED_WING_COUNT_MISMATCH');
 const errors=[...validateModel(m),...topology.errors]; if(errors.length) throw Error('NATIVE_VALIDATION_FAILED:'+errors.join(';'));
 const geometry=Object.fromEntries(GEOMETRY_KEYS.filter(k=>m[k]!==undefined).map(k=>[k,structuredClone(m[k])]));
 const geometryCompliance=verifyRequestedGeometry(r,geometry.rooms);
 if(!geometryCompliance.pass) throw Error('EXPLICIT_GEOMETRY_CONSTRAINT_VIOLATED:'+geometryCompliance.violations.join('|'));
 canonicalJSON(geometry); // Never turn NaN/Infinity into JSON null.
 const massing=auditMassing(geometry.buildingFootprint,m.massingParts??[m.building],geometry.courtyards);
 if(!massing.pass) throw Error('MASSING_NOT_EQUIVALENT');
 const c={schemaVersion:'1.0.0',kind:'CandidateEnvelope',projectId:r.projectId,requestId:r.requestId,
  inputHash:await contentHash(r),producer:{engineId:shape==='pavilions'?'@mizan/pavilion-composer':shape==='staggered'?'@mizan/staggered-composer':CLAUDE_ID,packageName:composed?`${shape==='pavilions'?'pavilion':shape}-composer`:'planner-pkg',packageVersion:shape==='staggered'?STAGGERED_COMPOSER_VERSION:composed?PAVILION_COMPOSER_VERSION:CLAUDE_VERSION,
  sourceSha256:shape==='staggered'?STAGGERED_SOURCE:composed?PAVILION_SOURCE:SOURCE,adapterVersion:exploration?'architectural-exploration/1.1.0':ADAPTER_VERSION},alternativeKey:exploration?.key??`${shape}-${r.plot.entry}`,requestedShape:shape,actualShape:m.shape,
  units:{...UNITS},frame:FRAME,fallback:{used:m.shapeFallback,allowedByUser:false,reason:null},geometry,
  presentation:{label:exploration?conceptFor(exploration,m.shape).tag:m.architecture.tag,massingParts:structuredClone(m.massingParts??null)}};
 c.geometryHash=await geometryHash(c); c.candidateId=await candidateId(c);
 validateEnvelope(c,'candidate'); await verifyCandidateBinding(c,r);
 return {candidate:c,massing,nativeValidation:{engineId:c.producer.engineId,sourceSha256:c.producer.sourceSha256,errors}};
}
function asAziz(c,invocationId,at) {
 const g=c.geometry,area=quantities(g).footprint;
 // AZIZ v1 cannot represent corridor access without distorting room_count_exact.
 // Preserve ALL native doors/links in raw. Do not fabricate room adjacency or entries.
 return {candidateId:c.candidateId,producedBy:c.producer.engineId,producedByVersion:c.producer.packageVersion,invocationId,
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
  const topologyModel={...c.geometry,massingParts:c.presentation.massingParts};
  const topology=c.actualShape==='staggered'?staggeredTopology(topologyModel):c.actualShape==='pavilions'?pavilionTopology(topologyModel):{errors:[]};
  const nativeErrors=[...validateModel(c.geometry),...topology.errors];
  if(nativeErrors.length) throw Error('NATIVE_VALIDATION_FAILED:'+nativeErrors.join(';'));
  const audit=auditMassing(c.geometry.buildingFootprint,c.presentation.massingParts??[c.geometry.building],c.geometry.courtyards);
  if(!audit.pass) throw Error('MASSING_NOT_EQUIVALENT');
  if(seen.has(c.candidateId)) throw Error('DUPLICATE_CANDIDATE_ID'); seen.add(c.candidateId);
  validReviews.push(review);
  const geometryCompliance=verifyRequestedGeometry(r,c.geometry.rooms);
  if(!geometryCompliance.pass) { rejected.push({candidateId:c.candidateId,failedChecks:['explicit-program-geometry'],unprovenChecks:[],reasons:geometryCompliance.violations}); continue; }
  const failed=review.checks.filter(x=>x.status==='FAIL');
  const essential=['identity','polygon-area','plot-bounds','space-containment','opening-references','plot-coverage','program-areas','hard-constraints','requested-floors','interpretation'];
  const missing=essential.filter(id=>review.checks.find(x=>x.id===id)?.status!=='PASS');
  if(failed.length||missing.length) { rejected.push({candidateId:c.candidateId,failedChecks:failed.map(x=>x.id),unprovenChecks:missing}); continue; }
  eligible.push(c);
 }
 if(!eligible.length) return {decision:await decision(r,'NO_SELECTION',null,validReviews,['No candidate passed native validation and all required architectural checks.']),aziz:null,rejected};
 const at=new Date().toISOString(),invocationId='inv:'+(await contentHash({request:r,adapterVersion:ADAPTER_VERSION})).value;
 const hard=[...r.hardConstraints.filter(c=>c.kind!=='shape_allowed'),...r.program.filter(p=>p.exactDimensionsM).map(p=>({id:`dimensions:${p.id}`,kind:'room_dimensions_exact',description:'Preserve the exact requested room dimensions, allowing 90-degree rotation.',value:{roomId:p.id,widthM:p.exactDimensionsM.widthM,lengthM:p.exactDimensionsM.lengthM,rotationAllowed:true,toleranceM:1e-5},source:'user',priority:'must'})),...r.program.map(p=>({id:`area:${p.id}`,kind:'explicit_area',description:'Preserve requested clear room area',
  value:{roomId:p.id,area:p.areaM2,tolerance:1e-8},source:'user',priority:'must'}))];
 // The frozen AZIZ v1 adapter accepts only its documented preference kinds.
 // Keep every user preference in the request while adapting unknown kinds to
 // `custom`; preference evidence below is computed from the native geometry.
 const azizPreferenceKinds=new Set(['prefer_area_near','prefer_zone_placement','prefer_adjacency','prefer_orientation','prefer_aesthetic','custom']);
 const azizPreferences=r.softPreferences.map(p=>azizPreferenceKinds.has(p.kind)?p:{...p,kind:'custom',value:{...(p.value&&typeof p.value==='object'?p.value:{}),mizanKind:p.kind}});
 const input={requestId:r.requestId,context:{plotArea:r.plot.widthM*r.plot.lengthM,cityCode:'unspecified',locale:'ar'},hardConstraints:hard,softPreferences:azizPreferences};
 const legacyHash=fnv1aHash(stableStringify(input));
 const mapped=eligible.map(c=>asAziz(c,invocationId,at));
 const producers=[...new Map(eligible.map(c=>[c.producer.engineId,c.producer])).values()];
 const engineOutputs=await Promise.all(producers.map(async p=>output(p.engineId,p.packageVersion,mapped.filter(c=>c.producedBy===p.engineId),legacyHash,at,invocationId,{sharedRequestHash:await contentHash(r)},CONFIDENCE)));
 engineOutputs.push(output('@mizan/gemini-review','P1-GEM-01/1.0.0',[],legacyHash,at,invocationId,{reviews:validReviews,confidence:{kind:'UNAVAILABLE',value:null}},0,false));
 const weights=Object.fromEntries(Object.keys(defaultConfig().weights).map(k=>[k,0]));
 Object.assign(weights,{geometryValidity:3,hardConstraintCompliance:3,areaAccuracy:1,designEfficiency:1});
 const aziz=await createAziz({weights,activeProfile:'balanced',tieThreshold:Number.EPSILON},fixedClock(at)).process({...input,engineOutputs});
 const preferenceEntries=eligible.map(c=>({candidateId:c.candidateId,weight:1,evaluations:evaluatePlanPreferences(c.geometry,r.softPreferences)}));
 const preferenceRankingResult=rankAzizSurvivingPreferences(preferenceEntries,aziz);
 const azizBaselineCandidateId=preferenceRankingResult.fallbackCandidateId;
 const selected=preferenceRankingResult.selectedCandidateId
  ? eligible.find(c=>c.candidateId===preferenceRankingResult.selectedCandidateId)??null : null;
 const selectedPair=pairs.find(p=>p.candidate.candidateId===selected?.candidateId)??null;
 const hasMeasuredPreference=preferenceRankingResult.ranked.some(entry=>entry.candidateId===selected?.candidateId&&entry.preferenceScore!==null);
 const preferenceRanking={...preferenceRankingResult,
  reportedAzizCandidateId:aziz.selectedCandidateId,
  selectedCandidateId:selected?.candidateId??null,
  selectedReviewId:selectedPair?.review?.reviewId??null,
  selectionMethod:!azizBaselineCandidateId?'aziz_no_surviving_candidate':
   selected?.candidateId!==azizBaselineCandidateId?'native_geometry_preference_dominance':
   preferenceRankingResult.bestPreferenceCandidateId!==azizBaselineCandidateId?'aziz_pareto_fallback':
    hasMeasuredPreference?'aziz_preference_tie':'aziz_geometry_fallback',
  selectionOverride:Boolean(azizBaselineCandidateId&&hasMeasuredPreference&&selected?.candidateId!==azizBaselineCandidateId)};
 const preferenceEvaluations=preferenceRanking.ranked.map(entry=>({candidateId:entry.candidateId,preferenceScore:entry.preferenceScore,evaluations:entry.evaluations}));
 const measuredPreferenceCount=preferenceRanking.activePreferenceCount;
 const reasons=[selected?(selected.candidateId!==azizBaselineCandidateId
  ? `Selection provenance: native preference candidate ${selected.candidateId} strictly Pareto-dominated AZIZ geometry-only fallback ${azizBaselineCandidateId} across measured user-requested axes after hard/native checks and bound review; selected review ${selectedPair.review.reviewId}.`
  : preferenceRankingResult.bestPreferenceCandidateId!==azizBaselineCandidateId
    ? `Selection provenance: AZIZ geometry-only fallback ${selected.candidateId} retained because preference-ranked alternative ${preferenceRankingResult.bestPreferenceCandidateId} traded off measured corridor/route axes; see candidate evidence. Selected review ${selectedPair.review.reviewId}.`
  : hasMeasuredPreference
  ? `Selection provenance: AZIZ geometry-only fallback ${selected.candidateId} was also the leading native preference candidate after hard/native checks and bound review; selected review ${selectedPair.review.reviewId}.`
  : `AZIZ geometry-only selection ${selected.candidateId} passed native validation and the bound review gate; no user preference had measurable evidence.`):'AZIZ did not return a selected candidate present in its accepted-survivor list; no preference override was made.',
  'Only geometry validity, explicit area compliance and area efficiency are weighted inside legacy AZIZ; access graph, privacy, reference and MEP axes have weight 0 there.',
  r.softPreferences.length?`${r.softPreferences.length} typed user preferences were retained in the request; ${measuredPreferenceCount} axes had measurable evidence and were compared across AZIZ-accepted survivors. Unsupported goals remain explicitly unscored.`:'No user soft preferences were supplied.',
  'Gemini incomplete discipline coverage is retained; this is not construction approval.',
  preferenceRanking.comparisons.length?`Measured preference axes compared across ${preferenceRanking.survivingCandidateIds.length} AZIZ-accepted alternatives; relative rankings do not establish an absolute code threshold.`:'No measurable soft preference could rank these candidates.' ];
 return {decision:await decision(r,selected?'SELECTED_PRELIMINARY':'NO_SELECTION',selected,validReviews,reasons),aziz,rejected,preferenceRanking,preferenceEvaluations,
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
