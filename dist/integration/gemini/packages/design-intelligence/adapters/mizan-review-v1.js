/** Gemini preliminary review. No geometry generation, editing, or production acceptance. */
import { adaptCandidateEnvelope, validateEnvelope, ADAPTER_VERSION } from '../../engineering-core/contracts/mizan-ir-v1.adapter.js';
import { EngineeringRulesRegistry } from '../../engineering-core/rules-registry/rules-registry.js';
import { DesignIntelligenceEngine } from '../engine.js';
import { CustomerBenefits } from '../../engineering-math/src/customer-benefits.js';
import { contentHash, summarizeChecks, verifyReviewBinding, ContractError } from '../../../reference/identity.mjs';

export const CHECK_REGISTRY_VERSION='gemini-ir-preliminary/1.0.0';
export const CHECK_REGISTRY=Object.freeze([
  ['identity','architectural'],['polygon-area','architectural'],['plot-bounds','architectural'],
  ['space-containment','architectural'],['courtyard-void','architectural'],['opening-references','architectural'],
  ['native-validation','architectural'],['max-built-area','architectural'],['plot-coverage','architectural'],
  ['program-areas','architectural'],['hard-constraints','architectural'],['requested-floors','architectural'],
  ['interpretation','architectural'],['access-connectivity','architectural'],['corridor-code','architectural'],
  ['headroom-code','architectural'],['door-swing','architectural'],['structural-model','structural'],
  ['soil','structural'],['electrical-layout','electrical'],['plumbing-routing','plumbing'],
  ['hvac-system','hvac'],['cross-discipline-clashes','structural'],['electrical-load','electrical'],
  ['cooling-load','hvac'],['pattern-retrieval','pattern'],['area-factor-boq','structural'],['market-prices','architectural']
].map(x=>Object.freeze(x)));

export function describeRuleReferences() {
  return EngineeringRulesRegistry.getAllRules().map(r=>({
    id:r.ruleId,classification:r.classification==='STATUTORY_SBC'?'STATUTORY_CLAIM_UNVERIFIED':'HEURISTIC',
    declaredSource:structuredClone(r.source),externalVerification:'NOT_AVAILABLE',
    externalVerifiedAt:null,calibrated:false,declaredConfidence:r.confidence,
    note:'edition/section/verifiedAt are original package metadata, not independent verification evidence.'
  }));
}
function patternContext(request) {
  const {plot}=request,streets=Object.keys(plot.streets).filter(k=>plot.streets[k]);
  const opposite=streets.length===2 && ((streets.includes('n')&&streets.includes('s'))||(streets.includes('e')&&streets.includes('w')));
  return {requestId:request.requestId,plot:{areaSqM:plot.widthM*plot.lengthM,
    frontageM:['e','w'].includes(plot.entry)?plot.lengthM:plot.widthM,
    depthM:['e','w'].includes(plot.entry)?plot.widthM:plot.lengthM,
    streetCondition:streets.length===1?'ONE_STREET':streets.length===2?(opposite?'TWO_STREETS_OPPOSITE':'TWO_STREETS_CORNER'):'UNSPECIFIED'},
    requirements:{}}; // No name-based rooms, assumed devices or fabricated adjacency.
}
const withinCap=(area,cap)=>area<=cap+Math.max(1e-6,Math.abs(cap)*1e-8);

export async function reviewCandidate(candidate,request) {
  const a=await adaptCandidateEnvelope(candidate,request),c=a.candidate,r=a.request,g=a.nativeGeometry;
  const checks=[],findings=[],assumptions=[],references=describeRuleReferences();
  function add(id,status,reason,data) {
    const definition=CHECK_REGISTRY.find(x=>x[0]===id);
    if(!definition || checks.some(x=>x.id===id)) throw new ContractError('CHECK_REGISTRY_ERROR');
    const evidenceIds=[];
    if(data!==undefined) {
      const evidenceId=`ev:${id}`; evidenceIds.push(evidenceId);
      findings.push({id:evidenceId,checkId:id,classification:status==='ESTIMATE'?'ESTIMATE':'OBSERVATION',
        sourceCandidateId:c.candidateId,sourceGeometryHash:c.geometryHash,data});
    }
    checks.push({id,discipline:definition[1],status,evidenceIds,reason});
  }
  add('identity','PASS','Request SHA-256, geometry SHA-256 and candidateId recomputed using the frozen reference.',
    {inputHash:c.inputHash,geometryHash:c.geometryHash,candidateId:c.candidateId,adapterVersion:ADAPTER_VERSION});
  add('polygon-area','PASS','Simple footprint shoelace area in m2; courtyard notch already excluded, no bounding-box substitution.',
    {areaM2:a.areaM2,method:'shifted-shoelace',geometryPath:'geometry.buildingFootprint'});
  const bounds=g.buildingFootprint.every(p=>p.x>=0&&p.y>=0&&p.x<=r.plot.widthM&&p.y<=r.plot.lengthM);
  const plotMatches=g.plot.width===r.plot.widthM&&g.plot.length===r.plot.lengthM&&g.plot.entry===r.plot.entry;
  add('plot-bounds',bounds&&plotMatches?'PASS':'FAIL','Footprint bounds and native plot dimensions/entry checked against the request; this is not a setback-code check.',{bounds,plotMatches});
  const audit=a.geometryAudit;
  add('space-containment',!audit.orthogonal?'NOT_EVALUATED':audit.outsideSpaces.length?'FAIL':'PASS',
    audit.orthogonal?'Cell intersection measures rooms/corridors outside orthogonal footprint.':'Non-orthogonal containment is unsupported.',audit);
  add('courtyard-void',!g.courtyards.length?'NOT_APPLICABLE':!audit.orthogonal?'NOT_EVALUATED':
    audit.courtyardOverlapM2>audit.toleranceM2||audit.spaceVoidOverlapM2>audit.toleranceM2?'FAIL':'PASS',
    !g.courtyards.length?'Candidate explicitly has no courtyard.':'Open-to-sky policies preserved; footprint/space intersection with void checked.',
    {courtyards:structuredClone(g.courtyards),footprintOverlapM2:audit.courtyardOverlapM2,spaceOverlapM2:audit.spaceVoidOverlapM2});
  add('opening-references','PASS','Wall/room/connects references and finite schema dimensions checked; no swing or access-compliance inference.',
    {openingIds:g.openings.map(o=>o.id),wallIds:g.walls.map(w=>w.id),scope:'reference-integrity-only'});
  add('native-validation','NOT_EVALUATED','Claude validateModel is not shipped in this Gemini task; schema and limited geometry checks do not replace that upstream gate.');
  add('max-built-area',r.plot.maxBuiltAreaM2===null?'NOT_APPLICABLE':withinCap(a.areaM2,r.plot.maxBuiltAreaM2)?'PASS':'FAIL',
    r.plot.maxBuiltAreaM2===null?'No explicit cap in this request.':'Compare polygon area with explicit cap using contract tolerance.',{areaM2:a.areaM2,capM2:r.plot.maxBuiltAreaM2});
  const coverageCap=r.plot.widthM*r.plot.lengthM*r.plot.coverageRatio;
  add('plot-coverage',withinCap(a.areaM2,coverageCap)?'PASS':'FAIL','Polygon area compared with requested plot coverage; no statutory certification.',{areaM2:a.areaM2,capM2:coverageCap});
  const directMapping=r.program.every(p=>g.rooms.some(room=>room.id===p.id));
  const mismatches=directMapping?r.program.filter(p=>{
    const room=g.rooms.find(x=>x.id===p.id),tol=Math.max(1e-6,p.areaM2*1e-8);
    return Math.abs(room.w*room.h-p.areaM2)>tol||Math.abs(room.area-p.areaM2)>tol||Math.abs(room.targetArea-p.areaM2)>tol;
  }).map(p=>p.id):[];
  add('program-areas',!directMapping?'NOT_EVALUATED':mismatches.length||g.rooms.length!==r.program.length?'FAIL':'PASS',
    directMapping?'Exact request ID mapping and rectangle/declared/target areas checked.':'No explicit requestRoomIdMap supported here; room names are not used for matching.',
    {directMapping,mismatches,requested:r.program.length,actual:g.rooms.length});
  const constraintResults=r.hardConstraints.map(h=>{
    if(h.kind==='room_count_exact'&&Number.isInteger(h.value?.count)) return {id:h.id,status:h.value.count===g.rooms.length?'PASS':'FAIL',expected:h.value.count,actual:g.rooms.length};
    return {id:h.id,status:'NOT_EVALUATED',reason:'Unsupported must constraint; requires control-room handling.'};
  });
  add('hard-constraints',!constraintResults.length?'NOT_APPLICABLE':constraintResults.some(x=>x.status==='FAIL')?'FAIL':constraintResults.some(x=>x.status==='NOT_EVALUATED')?'NOT_EVALUATED':'PASS',
    'Fixed aggregate check includes every supplied must constraint; unsupported constraints remain unresolved.',{constraints:constraintResults});
  add('requested-floors',r.plot.floorsRequested===g.drawnFloors?'PASS':'NOT_EVALUATED',
    'Only the drawn floor is evaluated; additional requested floors are not generated or multiplied into quantities.',{requested:r.plot.floorsRequested,drawn:g.drawnFloors});
  add('interpretation',r.interpretation.status==='confirmed'&&!r.interpretation.unresolved.length?'PASS':'NOT_EVALUATED',
    'Reports explicit confirmation state only; not an AI understanding test.',{status:r.interpretation.status,unresolved:[...r.interpretation.unresolved]});
  add('access-connectivity','NOT_EVALUATED','References are preserved; physical door-to-wall access and traversable corridor connectivity require native validation.');
  add('corridor-code','NOT_EVALUATED','Widths can be measured, but statutory reference metadata has not been independently verified.',
    {widthsMm:a.coreGeometry.spaces.filter(s=>s.functionalType==='CORRIDOR').map(s=>({id:s.spaceId,widthMm:s.nominalWidthMm})),referenceId:'RULE-SBC-1101-CORRIDOR-WIDTH-01'});
  add('headroom-code','NOT_EVALUATED','Wall height does not establish finished clear headroom; heights/slabs are not defaulted and code evidence is unverified.');
  add('door-swing','NOT_EVALUATED','Native openings do not specify supported swing geometry/clearance evidence.');
  for(const [id,reason] of [
    ['structural-model','No supported structural model, load path or member capacities in the shared candidate contract.'],
    ['soil','No verified geotechnical report; no bearing capacity assumed.'],
    ['electrical-layout','No supported equipment/circuit/clearance model.'],
    ['plumbing-routing','No supported pipe routing/slope/fixture system model.'],
    ['hvac-system','No selected HVAC system, duct routes or plenum/headroom/slab data.'],
    ['cross-discipline-clashes','No supported structural/MEP volumes; absence of collisions cannot establish coordination success.']
  ]) add(id,'NOT_EVALUATED',reason);
  const power=EngineeringRulesRegistry.getRule('RULE-ELEC-HEURISTIC-LOAD-DENSITY-02');
  const cooling=EngineeringRulesRegistry.getRule('RULE-HVAC-HEURISTIC-COOLING-RATE-02');
  const roomArea=g.rooms.reduce((sum,room)=>sum+room.w*room.h,0);
  add('electrical-load','ESTIMATE','Existing area coefficient applied to drawn room area only; no circuit/design verification.',
    {roomAreaM2:roomArea,kVA:roomArea*power.parameters.nominalVAPerSqM/1000,referenceId:power.ruleId});
  add('cooling-load','ESTIMATE','Existing area heuristic assuming drawn rooms conditioned; not a thermal/system calculation.',
    {assumedConditionedAreaM2:roomArea,tonsRefrigeration:roomArea/cooling.parameters.sqMPerTon,referenceId:cooling.ruleId});
  assumptions.push({id:'assumed-conditioned-area',source:'assumed',field:'conditionedAreaM2',value:roomArea,affectedChecks:['cooling-load'],reason:'Room area used only for preliminary cooling estimate.'});
  const engine=new DesignIntelligenceEngine(),intelligence=engine.retrieveCandidates(patternContext(r));
  add('pattern-retrieval',intelligence.retrievedPatterns.length?'ESTIMATE':'NOT_EVALUATED',
    'Site-based heuristic retrieval, not verification of this candidate topology; privacy/access graph and soft-preference evaluation remain unsupported.',
    {patterns:intelligence.retrievedPatterns.map(p=>({patternId:p.patternId,matchScore:p.matchScore,confidence:{kind:'HEURISTIC',value:p.confidence,calibrated:false,method:'Static library annotation; not calibrated.'}})),
      unappliedPreferences:r.softPreferences.map(p=>p.id),warnings:[...intelligence.warnings]});
  for(const p of intelligence.retrievedPatterns) references.push({id:p.patternId,classification:'HEURISTIC',externalVerification:'NOT_AVAILABLE',externalVerifiedAt:null,declaredSource:structuredClone(p.source || p.provenance || {}),note:'Library metadata only; not certified engineering knowledge.'});
  references.push({id:'default-reference-cases',classification:'SYNTHETIC',externalVerification:'NOT_AVAILABLE',usedForCandidateValidation:false,note:'Engine defaults include synthetic reference cases; not treated as evidence.'});
  for(const reason of intelligence.assumptions) assumptions.push({source:'assumed',origin:'legacy-pattern-retrieval',reason,affectedChecks:['pattern-retrieval'],usedForEngineeringValidation:false});
  add('area-factor-boq','ESTIMATE','Unchanged area/count factors; steel/concrete are not structural takeoff. Polygon area excludes courtyard once.',
    {projectAreaM2:a.areaM2,drawnFloors:g.drawnFloors,estimate:CustomerBenefits.generateBillOfQuantities(a.areaM2,g.rooms.length)});
  add('market-prices','NOT_EVALUATED','Static undated benchmarks have no current market source; no market-price compliance is asserted.');
  if(checks.length!==CHECK_REGISTRY.length) throw new ContractError('INCOMPLETE_CHECK_REGISTRY');
  const coverage=summarizeChecks(checks);
  const semantic={schemaVersion:'1.0.0',kind:'ReviewEnvelope',projectId:c.projectId,requestId:c.requestId,candidateId:c.candidateId,
    inputHash:c.inputHash,geometryHash:c.geometryHash,engineId:'@mizan/gemini-review',checkRegistryVersion:CHECK_REGISTRY_VERSION,
    preliminaryOnly:true,overall:coverage.fail?'BLOCKED':coverage.notEvaluated||coverage.estimate?'PRELIMINARY_INCOMPLETE':'PASS_WITHIN_SCOPE',
    checks,coverage,confidence:{kind:'UNAVAILABLE',value:null,calibrated:false,method:'No calibrated aggregate review confidence; pattern annotations are separately labelled heuristic.'},findings,assumptions,references};
  const review={...semantic,reviewId:'review:'+(await contentHash(semantic)).value,telemetry:{generatedAt:new Date().toISOString()}};
  validateEnvelope(review,'review'); verifyReviewBinding(review,c);
  return review;
}

/** Call when consuming/caching a review, not only when producing it. */
export async function verifyBoundReview(review,candidate,request) {
  validateEnvelope(review,'review');
  review=structuredClone(review);
  const {candidate:c}=await adaptCandidateEnvelope(candidate,request);
  verifyReviewBinding(review,c);
  if(review.engineId!=='@mizan/gemini-review'||review.checkRegistryVersion!==CHECK_REGISTRY_VERSION ||
     review.checks.length!==CHECK_REGISTRY.length||CHECK_REGISTRY.some(([id,discipline],i)=>review.checks[i].id!==id||review.checks[i].discipline!==discipline)) throw new ContractError('CHECK_REGISTRY_MISMATCH');
  if(review.confidence.kind==='CALIBRATED'||review.confidence.calibrated) throw new ContractError('CALIBRATION_EVIDENCE_UNAVAILABLE');
  const overall=review.coverage.fail?'BLOCKED':review.coverage.notEvaluated||review.coverage.estimate?'PRELIMINARY_INCOMPLETE':'PASS_WITHIN_SCOPE';
  if(review.overall!==overall) throw new ContractError('OVERALL_MISMATCH');
  const {reviewId,telemetry,...semantic}=review;
  if(reviewId!=='review:'+(await contentHash(semantic)).value) throw new ContractError('REVIEW_CONTENT_MISMATCH');
  return true;
}
