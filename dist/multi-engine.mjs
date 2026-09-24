import { generateModel, normalizeRooms, quantities, SHAPES } from './planner.mjs';
import { analyzeEngineeringLayer } from './engineering-layer.mjs';
import { createAziz, deterministicId, fnv1aHash, stableStringify } from './aziz-browser.mjs';

const FIXED_TIME = '1970-01-01T00:00:00.000Z';
const SHAPE_KEYS = Object.freeze(Object.keys(SHAPES).filter(k => ['rect','l','u'].includes(k)));
const DESIGN_PRIORITIES = new Set([
  'privacy','guestFamilySeparation','daylight','circulation','accessibility','serviceFlow','efficiency','futureFlexibility'
]);

function cleanIntent(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const priorities = Array.isArray(value.priorities)
    ? [...new Set(value.priorities.filter(p => DESIGN_PRIORITIES.has(p)))].slice(0, 6)
    : [];
  const preferredShapes = Array.isArray(value.preferredShapes)
    ? [...new Set(value.preferredShapes.map(s => String(s).trim().toLowerCase()).filter(s => SHAPE_KEYS.includes(s)))].slice(0, 3)
    : [];
  const conceptDirections = Array.isArray(value.conceptDirections)
    ? value.conceptDirections.filter(x => x && typeof x === 'object').slice(0, 3).map((x, i) => ({
        id: typeof x.id === 'string' && x.id ? x.id : `concept-${i+1}`,
        label: typeof x.label === 'string' && x.label ? x.label : `اتجاه ${i+1}`,
        shapeHint: ['auto', ...SHAPE_KEYS].includes(String(x.shapeHint).toLowerCase()) ? String(x.shapeHint).toLowerCase() : 'auto',
        rationale: typeof x.rationale === 'string' ? x.rationale : '',
        tradeoffs: Array.isArray(x.tradeoffs) ? x.tradeoffs.filter(t => typeof t === 'string').slice(0, 4) : [],
      }))
    : [];
  return { priorities, preferredShapes, conceptDirections };
}

function configFromIntent(intent) {
  const weights = {};
  const bump = (axis, value) => { weights[axis] = Math.max(weights[axis] ?? 0, value); };
  for (const p of intent.priorities) {
    if (p === 'privacy') { bump('privacy', 3.2); bump('guestFamilySeparation', 2.5); }
    if (p === 'guestFamilySeparation') bump('guestFamilySeparation', 3.2);
    if (p === 'daylight') { bump('daylightPotential', 2.8); bump('ventilationPotential', 2.2); }
    if (p === 'circulation') { bump('circulation', 2.8); bump('adjacency', 1.6); }
    if (p === 'accessibility') bump('accessibility', 3.0);
    if (p === 'serviceFlow') bump('serviceFlow', 2.8);
    if (p === 'efficiency') bump('designEfficiency', 2.6);
    if (p === 'futureFlexibility') { bump('designEfficiency', 1.8); bump('requirementCoverage', 2.0); }
  }
  return { weights };
}

function shapeOrder(shapeMode, intent) {
  const explicit = String(shapeMode ?? 'auto').trim().toLowerCase();
  if (SHAPE_KEYS.includes(explicit)) return [explicit];
  return [...new Set([...intent.preferredShapes, ...SHAPE_KEYS])];
}

function canonicalInput(input) {
  return {
    requestId: input.requestId,
    hardConstraints: input.hardConstraints,
    softPreferences: input.softPreferences,
    context: input.context,
    ...(input.previousRefinement ? { previousFeedback: input.previousRefinement } : {}),
  };
}

function roomBoundary(room) {
  return { points: [
    {x: room.x, y: room.y}, {x: room.x + room.w, y: room.y},
    {x: room.x + room.w, y: room.y + room.h}, {x: room.x, y: room.y + room.h},
  ] };
}

function adjacencyFor(model) {
  const groups = new Map();
  for (const r of model.rooms) {
    const key = r.corridorId || 'unlinked';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r.id);
  }
  const out=[]; const seen=new Set();
  for (const ids of groups.values()) {
    for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++) {
      const a=ids[i], b=ids[j]; const key=[a,b].sort().join('|'); if(seen.has(key)) continue;
      seen.add(key); out.push({a,b,sharedLength:0.5});
    }
  }
  return out;
}

function entryFor(model) {
  const preferred = model.rooms.find(r => r.position === 'front' && r.type === 'majlis') || model.rooms.find(r => r.position === 'front') || model.rooms[0];
  return preferred ? [{ id:'main-entry', side:model.plot.entry, roomId:preferred.id }] : [];
}

function hardConstraintsFor(rooms) {
  return [
    { id:'hc-room-count', kind:'room_count_exact', description:'الحفاظ على عدد الفراغات المطلوبة', value:{count:rooms.length}, source:'user', priority:'must' },
    ...rooms.map(r => ({ id:`hc-area-${r.id}`, kind:'explicit_area', description:`الحفاظ على مساحة ${r.name}`, value:{roomId:r.id, area:r.area, tolerance:0.005}, appliesTo:r.id, source:'user', priority:'must' })),
  ];
}

function softPreferencesFor(rooms) {
  const prefs=[];
  for (const r of rooms) {
    if (r.position && r.position !== 'any') prefs.push({id:`pref-zone-${r.id}`,kind:'prefer_zone_placement',description:`تفضيل موقع ${r.name}: ${r.position}`,weight:1,value:{type:r.type,zone:r.position},appliesTo:r.id,source:'user'});
  }
  return prefs;
}

function engineeringWarnings(review, shape) {
  const list=[];
  const status=review.coordination.status;
  if (status === 'CRITICAL_BLOCKERS_FOUND') list.push({id:`eng-critical-${shape}`,code:'ENGINEERING_CRITICAL_BLOCKERS',message:'وجدت المراجعة الهندسية عوائق أو تعارضات حرجة ضمن البيانات المتاحة.',severity:'critical'});
  else if (status === 'CHANGES_REQUIRED') list.push({id:`eng-change-${shape}`,code:'ENGINEERING_CHANGES_REQUIRED',message:'توجد تغييرات هندسية مطلوبة قبل اعتماد هذا التصور.',severity:'warning'});
  else if (status === 'PASSED_WITH_ADVISORIES') list.push({id:`eng-advisory-${shape}`,code:'ENGINEERING_ADVISORIES',message:'اجتاز التصور الفحص المتاح مع ملاحظات استرشادية.',severity:'info'});
  return list;
}

function referenceSignal(review) {
  const items = Array.isArray(review.intelligence?.candidateStrategies) ? review.intelligence.candidateStrategies : [];
  if (!items.length) return 0.5;
  const nums = items.map(x => Number(x.score ?? x.finalScore ?? x.compatibilityScore)).filter(Number.isFinite);
  if (!nums.length) return 0.7;
  const max=Math.max(...nums); return max > 1 ? Math.max(0,Math.min(1,max/100)) : Math.max(0,Math.min(1,max));
}

function confidenceFor(model, review, intent, shape) {
  let c=0.88;
  const status=review.coordination.status;
  if(status==='COORDINATION_PASSED')c+=0.05;
  if(status==='PASSED_WITH_ADVISORIES')c-=0.02;
  if(status==='CHANGES_REQUIRED')c-=0.12;
  if(status==='CRITICAL_BLOCKERS_FOUND')c-=0.35;
  c += (referenceSignal(review)-0.5)*0.12;
  const idx=intent.preferredShapes.indexOf(shape); if(idx===0)c+=0.05; else if(idx===1)c+=0.025;
  if(model.shapeFallback)c-=0.18;
  return Math.max(0.05,Math.min(0.99,Number(c.toFixed(4))));
}

function candidateFrom(model, review, shape, requestId, invocationId, confidence) {
  const q=quantities(model);
  const geometryKey={shape:model.shape,footprint:model.buildingFootprint,rooms:model.rooms.map(r=>({id:r.id,x:r.x,y:r.y,w:r.w,h:r.h})),courtyards:model.courtyards};
  const geometryHash=fnv1aHash(stableStringify(geometryKey));
  const strategies=(review.intelligence?.candidateStrategies||[]).slice(0,3).map(x=>x.name||x.patternName||x.patternId).filter(Boolean);
  return {
    candidateId: deterministicId('cand',[requestId,shape,geometryHash]),
    producedBy:`@mizan/claude-planner/${shape}`,
    producedByVersion:'2.2.0-hardened',
    invocationId,
    schemaVersion:'1.0.0',
    createdAt:FIXED_TIME,
    label:`${SHAPES[shape]?.name ?? shape}`,
    description:`مخطط ${shape.toUpperCase()} راجعه Claude هندسياً وGemini معرفياً قبل تحكيم AZIZ.`,
    geometryHash,
    footprint:{points:model.buildingFootprint.map(p=>({x:p.x,y:p.y}))},
    rooms:model.rooms.map(r=>({roomId:r.id,type:r.type,zone:r.position,boundary:roomBoundary(r),clearArea:r.area})),
    adjacency:adjacencyFor(model),
    entryPoints:entryFor(model),
    metrics:{grossArea:q.footprint,buildRatio:q.footprint/(model.plot.width*model.plot.length),roomCount:model.rooms.length},
    engineConfidence:confidence,
    engineSelfReportedScore:Math.round(referenceSignal(review)*100),
    tags:[`shape:${shape}`,`engineering:${review.coordination.status}`,...strategies.map(s=>`pattern:${s}`)].slice(0,12),
  };
}

function outputFor(model, review, shape, requestId, inputHash, intent) {
  const engineId=`@mizan/claude-planner/${shape}`;
  const engineVersion='2.2.0-hardened';
  const confidence=confidenceFor(model,review,intent,shape);
  const tempHash=fnv1aHash(stableStringify({shape:model.shape,footprint:model.buildingFootprint,rooms:model.rooms.map(r=>[r.id,r.x,r.y,r.w,r.h])}));
  const invocationId=deterministicId('inv',[requestId,shape,tempHash]);
  const candidate=candidateFrom(model,review,shape,requestId,invocationId,confidence);
  const assumptions=[];
  if(model.shapeFallback) assumptions.push({id:`fallback-${shape}`,statement:`تعذر تنفيذ ${shape} وتم الرجوع إلى ${model.shape}.`,confidence:1});
  return {
    engineId, engineVersion, invocationId,
    capabilities:{disciplines:['architectural','geometry','reference-review'],supportsGeometry:true,supportsRequirements:true,supportsScoring:true,deterministic:true,custom:{geminiReview:true}},
    confidence,
    execution:{startedAt:FIXED_TIME,completedAt:FIXED_TIME,durationMs:0,version:engineVersion,status:'ok'},
    provenance:{engineId,engineVersion,invocationId,requestedAt:FIXED_TIME,completedAt:FIXED_TIME,inputHash},
    assumptions,
    warnings:[...engineeringWarnings(review,shape),...model.warnings.slice(0,8).map((message,i)=>({id:`planner-${shape}-${i}`,code:'PLANNER_REVIEW_NOTE',message,severity:'info'}))],
    constraintsEvaluated:[],
    candidates:[candidate],
  };
}

function decisionAlternatives(candidates, azizState) {
  const scoreById=new Map(azizState.scores.map(s=>[s.candidateId,s]));
  const rejectedById=new Map();
  for(const r of azizState.candidatesRejected){if(!rejectedById.has(r.candidateId))rejectedById.set(r.candidateId,[]); rejectedById.get(r.candidateId).push(r);}
  return candidates.map(x=>({shape:x.shape,candidateId:x.output.candidates[0].candidateId,selected:azizState.selectedCandidateId===x.output.candidates[0].candidateId,score:scoreById.get(x.output.candidates[0].candidateId)?.confidenceAdjustedTotal ?? null,confidence:x.output.confidence,engineeringStatus:x.review.coordination.status,rejections:rejectedById.get(x.output.candidates[0].candidateId)??[],patterns:(x.review.intelligence?.candidateStrategies||[]).slice(0,3).map(p=>p.name||p.patternName||p.patternId).filter(Boolean)}));
}

export async function runMultiEngineDesign({plot, rooms, designIntent, shapeMode='auto', cityCode='SA-UNSPECIFIED', locale='ar-SA'}={}) {
  const normalizedRooms=normalizeRooms(rooms);
  const intent=cleanIntent(designIntent);
  const requestId=deterministicId('mizan-design',[plot.width,plot.length,plot.entry,shapeMode,fnv1aHash(stableStringify(normalizedRooms)),fnv1aHash(stableStringify(intent))]);
  const hardConstraints=hardConstraintsFor(normalizedRooms);
  const softPreferences=softPreferencesFor(normalizedRooms);
  const context={plotArea:plot.width*plot.length,cityCode,locale};
  const azizBase={requestId,hardConstraints,softPreferences,context};
  const inputHash=fnv1aHash(stableStringify(canonicalInput(azizBase)));
  const failures=[]; const candidates=[]; const canonicalSeen=new Set();
  for(const shape of shapeOrder(shapeMode,intent)) {
    try {
      const model=generateModel({...plot,shape},normalizedRooms);
      if(shapeMode==='auto' && model.shapeFallback && model.shape!==shape) { failures.push({shape,reason:`shape-fallback:${model.shape}`}); continue; }
      const canonical=stableStringify({footprint:model.buildingFootprint,rooms:model.rooms.map(r=>[r.id,r.x,r.y,r.w,r.h])});
      if(canonicalSeen.has(canonical)){failures.push({shape,reason:'duplicate-geometry'});continue;}
      canonicalSeen.add(canonical);
      const review=analyzeEngineeringLayer(model);
      const output=outputFor(model,review,shape,requestId,inputHash,intent);
      candidates.push({shape,model,review,output});
    } catch(error) { failures.push({shape,reason:error instanceof Error?error.message:String(error)}); }
  }
  if(!candidates.length) throw new Error(`لم ينتج أي محرك تصوراً صالحاً. ${failures.map(f=>`${f.shape}: ${f.reason}`).join(' | ')}`);
  const azizInput={...azizBase,engineOutputs:candidates.map(x=>x.output)};
  const aziz=createAziz(configFromIntent(intent));
  const state=await aziz.process(azizInput);
  const selected=candidates.find(x=>x.output.candidates[0].candidateId===state.selectedCandidateId) ?? null;
  if(!selected) {
    const reasons=state.candidatesRejected.map(r=>`${r.candidateId}:${r.code}`).join(', ');
    throw new Error(`رفض AZIZ جميع البدائل الهندسية. ${reasons || 'لا يوجد مرشح مقبول.'}`);
  }
  return {
    requestId,
    model:selected.model,
    engineering:selected.review,
    selectedShape:selected.shape,
    aziz:state,
    designIntent:intent,
    alternatives:decisionAlternatives(candidates,state),
    generationFailures:failures,
    explanation:state.decisionTrace?.narrative ?? state.selectionReason ?? 'تم اختيار البديل وفق القيود الصريحة والمحاور الموزونة.',
  };
}
