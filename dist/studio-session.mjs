/** Serializable customer conversation evidence. Mutators change only the supplied session.
 * Geometry is referenced by a synchronous digest; no geometry or transport payload is stored.
 */
import { sha256 } from './integration/browser-crypto.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
let runtimeOperationSequence=0;
const operationNonce=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${(++runtimeOperationSequence).toString(36)}-${Math.random().toString(36).slice(2)}`;
const nat=v=>Number.isSafeInteger(v)&&v>=0?v:0;
export function sanitizeStudioText(value,max=6000){
  const s=typeof value==='string'?value:'';
  if(s.length>max)fail('STUDIO_TEXT_LIMIT');
  return s.replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/g,'[محجوب]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [محجوب]')
    .replace(/((?:api[_-]?key|access[_-]?code|password|secret|token|authorization|كلمة المرور|رمز الدخول|رمز الخدمة)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[محجوب]');
}
const text=(v,max=6000)=>sanitizeStudioText(v,max);
const list=(v,max=256)=>{if(v==null)return [];if(!Array.isArray(v)||v.length>max)fail('STUDIO_LIST_LIMIT');return v;};
const choice=(v,values,fallback)=>values.includes(v)?v:fallback;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
// Nested geometry fields are numeric/string/boolean only; exclude unknown transport/presentation fields.
const geometryKeys=new Set(('id name type x y w h x1 y1 x2 y2 t width length area targetArea position side resolvedSide corridorId doorSide dimensions widthM lengthM allowRotation wallId pos at sill roomId connects from to a b points rings outer holes polygon footprint boundary massing wings shape mode entry streets setbacks coverage maxBuiltArea floors floorHeight wallThickness north south east west n s e west e w front rear left right topology circulation links program rooms walls openings corridors courtyards reserves plot buildable building buildingFootprint boundingBox builtArea massingParts drawnFloors sb streetSetback neighborSetback roofPolicy height floor z').split(' '));
function geometryValue(v,depth=0){if(depth>16)fail('STUDIO_GEOMETRY_DEPTH');if(v===null||typeof v==='string'||typeof v==='boolean')return v;if(typeof v==='number'){if(!Number.isFinite(v))fail('STUDIO_GEOMETRY_NUMBER');return v;}if(Array.isArray(v))return v.map(x=>geometryValue(x,depth+1));if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).filter(k=>geometryKeys.has(k)&&v[k]!==undefined).sort().map(k=>[k,geometryValue(v[k],depth+1)]));return null;}
export function studioRevisionReference(model){
  if(!model)return null;
  const i=model.integration||{};
  return {fingerprint:sha256(JSON.stringify(stable(geometryValue({...model,courtyards:model.courtyards||[],reserves:model.reserves||[],corridors:model.corridors||[],links:model.links||[],drawnFloors:model.drawnFloors||[]})))),candidateId:text(i.candidateId,256)||null,reviewId:text(i.reviewId,256)||null,reviewOverall:text(i.reviewOverall,64)||null,requiresReview:i.requiresReview===true};
}
function reference(v){if(!v||!/^[a-f0-9]{64}$/.test(v.fingerprint||''))return null;return {fingerprint:v.fingerprint,candidateId:text(v.candidateId,256)||null,reviewId:text(v.reviewId,256)||null,reviewOverall:text(v.reviewOverall,64)||null,requiresReview:v.requiresReview===true};}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createStudioSession({id}={}){return {version:1,id:text(id||globalThis.crypto?.randomUUID?.()||`studio-${Date.now()}-${Math.random()}`,128),epoch:0,revision:0,operationSequence:0,messageSequence:0,draftText:'',legacyDisclosure:'',messages:[],understanding:null,understandingHistory:[],selectedRevision:null,currentApproval:null,approvalHistory:[],activeOperation:null};}
export function isCurrentStudioOperation(s,t){return !!(t&&s.activeOperation&&t.sessionId===s.id&&t.epoch===s.epoch&&t.baseRevision===s.revision&&same(t,s.activeOperation));}
function assertToken(s,t){if(t&&!isCurrentStudioOperation(s,t))fail('STALE_STUDIO_OPERATION');}
export function cancelStudioOperation(s){s.activeOperation=null;s.epoch++;return s;}
export function beginStudioOperation(s,kind){cancelStudioOperation(s);s.operationSequence++;const token={id:`operation-${s.operationSequence}-${operationNonce()}`,sessionId:s.id,epoch:s.epoch,baseRevision:s.revision,kind:text(kind,64)};s.activeOperation=token;return clone(token);}
export function invalidateStudioApproval(s,reason='edit'){cancelStudioOperation(s);s.revision++;s.currentApproval=null;return s;}
export function bindStudioRevision(s,model,reason='sync'){const ref=studioRevisionReference(model);if(!same(ref,s.selectedRevision)||['edit','select','load'].includes(reason)){invalidateStudioApproval(s,reason);s.selectedRevision=ref;}return s;}
export function setStudioDraft(s,value){const next=text(value);if(next!==s.draftText)cancelStudioOperation(s);s.draftText=next;return s;}
function message(v,id){return {id:text(v.id||id,128),role:choice(v.role,['user','assistant','system'],'system'),text:text(v.text),source:choice(v.source,['customer','local','ai','import','system'],v.role==='user'?'customer':'system'),status:choice(v.status,['recorded','proposed','rejected','notice'],'recorded')};}
export function appendStudioMessage(s,packet){assertToken(s,packet.operationToken);if(s.messages.length>=256)fail('STUDIO_LIST_LIMIT');const m=message(packet,`message-${s.messageSequence+1}`);if(s.messages.some(x=>x.id===m.id))fail('STUDIO_DUPLICATE_MESSAGE');s.messageSequence++;s.messages.push(m);return s;}
function understanding(v,messages,revision){
  const valid=id=>messages.some(m=>m.id===id&&m.role==='user'&&m.source==='customer'&&m.status==='recorded');
  const sourceMessageIds=[...new Set(list(v.sourceMessageIds).map(x=>text(x,128)))];
  if(sourceMessageIds.some(id=>!valid(id)))fail('STUDIO_SOURCE_INVALID');
  const constraints=list(v.constraints).map(c=>{const sourceMessageId=text(c.sourceMessageId,128);if(!valid(sourceMessageId)||!sourceMessageIds.includes(sourceMessageId)||['assumption','rejected'].includes(c.source)||c.status==='rejected')fail('STUDIO_SOURCE_INVALID');return {text:text(c.text),sourceMessageId};});
  return {revision:nat(revision),summary:text(v.summary),sourceMessageIds,constraints,assumptions:list(v.assumptions).map(x=>text(x)),rejectedProposals:list(v.rejectedProposals).map(x=>text(x))};
}
export function acceptStudioUnderstanding(s,packet){assertToken(s,packet.operationToken);if(s.understandingHistory.length>=100)fail('STUDIO_HISTORY_LIMIT');const next=understanding(packet,s.messages,(s.understanding?.revision||0)+1);invalidateStudioApproval(s,'understanding');s.understanding=next;s.understandingHistory.push(clone(next));return s;}
function approval(v){const ref=reference(v.reference);if(!ref)return null;return {id:text(v.id,128),sessionRevision:nat(v.sessionRevision),understandingRevision:nat(v.understandingRevision),reference:ref,sourceMessageId:text(v.sourceMessageId,128)||null};}
export function approveStudioRevision(s,{confirmed=false,sourceMessageId=null}={}){if(confirmed!==true||!s.selectedRevision)fail('STUDIO_APPROVAL_REQUIRED');if(s.approvalHistory.length>=100)fail('STUDIO_HISTORY_LIMIT');if(sourceMessageId&&!s.messages.some(m=>m.id===sourceMessageId&&m.role==='user'))fail('STUDIO_SOURCE_INVALID');const record={id:`approval-${s.approvalHistory.length+1}`,sessionRevision:s.revision,understandingRevision:s.understanding?.revision||0,reference:clone(s.selectedRevision),sourceMessageId};s.currentApproval=record;s.approvalHistory.push(clone(record));return s;}
export function normalizeStudioSession(raw,options={}){
  if(raw!=null&&raw.version!==1)fail('STUDIO_VERSION_UNSUPPORTED');
  const v=raw||{},s=createStudioSession({id:v.id||'studio-legacy'});
  for(const k of ['epoch','revision','operationSequence','messageSequence'])s[k]=nat(v[k]);
  s.draftText=text(v.draftText);s.legacyDisclosure=text(v.legacyDisclosure||(!raw?'هذا المشروع لا يحتوي سجل محادثة محفوظًا.':''));
  s.messages=list(v.messages).map((m,i)=>message(m,`message-${i+1}`));
  if(new Set(s.messages.map(m=>m.id)).size!==s.messages.length)fail('STUDIO_DUPLICATE_MESSAGE');
  s.messageSequence=Math.max(s.messageSequence,s.messages.length,...s.messages.map(m=>Number(/^message-(\d+)$/.exec(m.id)?.[1])||0));
  s.understandingHistory=list(v.understandingHistory,100).map(u=>understanding(u,s.messages,u.revision));
  s.understanding=v.understanding?understanding(v.understanding,s.messages,v.understanding.revision):null;
  s.selectedRevision=reference(v.selectedRevision);
  s.approvalHistory=list(v.approvalHistory,100).map(approval).filter(Boolean);
  const a=approval(v.currentApproval||{}), hasModel=Object.hasOwn(options,'model'), originalReference=clone(s.selectedRevision);
  if(hasModel){const current=studioRevisionReference(options.model);if(!same(s.selectedRevision,current))s.selectedRevision=current;}
  if(a&&same(originalReference,s.selectedRevision)&&same(a.reference,s.selectedRevision)&&a.understandingRevision===(s.understanding?.revision||0)&&s.approvalHistory.some(h=>same(h,a)))s.currentApproval=a;
  return s;
}
