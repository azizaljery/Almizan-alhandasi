/** Explicit MIZAN-IR/1.0.0 boundary. This is not the legacy coordinate API. */
import schema from '../../../contracts/mizan-envelope-v1.schema.json' with { type: 'json' };
import { canonicalJSON, assertUnitsAndFrame, verifyCandidateBinding, ContractError } from '../../../reference/identity.mjs';
import { deepFreeze } from '../core/geometry-hasher.js';

export const ADAPTER_VERSION = 'P1-GEM-01/1.0.0';

// Executes exactly the vocabulary used by the frozen control-room schema.
// Not a replacement for a general JSON Schema validator. Unknown keywords fail closed.
const keywords = new Set(['$schema','$id','$defs','$ref','title','type','const','enum','properties','required',
  'additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern',
  'minimum','maximum','exclusiveMinimum','allOf','anyOf','oneOf','if','then','else']);
function conforms(v, s) {
  if (Object.keys(s).some(k => !keywords.has(k))) throw new ContractError('SCHEMA_KEYWORD_UNSUPPORTED');
  if (s.$ref && !conforms(v, schema.$defs[s.$ref.split('/').at(-1)])) return false;
  const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  if (s.type && !(s.type === 'integer' ? Number.isInteger(v) : type === s.type)) return false;
  if (Object.hasOwn(s, 'const') && canonicalJSON(v) !== canonicalJSON(s.const)) return false;
  if (s.enum && !s.enum.some(x => canonicalJSON(x) === canonicalJSON(v))) return false;
  if (s.allOf && !s.allOf.every(x => conforms(v,x))) return false;
  if (s.anyOf && !s.anyOf.some(x => conforms(v,x))) return false;
  if (s.oneOf && s.oneOf.filter(x => conforms(v,x)).length !== 1) return false;
  if (s.if && !conforms(v, conforms(v,s.if) ? (s.then || {}) : (s.else || {}))) return false;
  if (type === 'number' && (!Number.isFinite(v) || (s.minimum !== undefined && v < s.minimum) ||
      (s.maximum !== undefined && v > s.maximum) || (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum))) return false;
  if (type === 'string' && ((s.minLength !== undefined && [...v].length < s.minLength) ||
      (s.maxLength !== undefined && [...v].length > s.maxLength) || (s.pattern && !new RegExp(s.pattern,'u').test(v)))) return false;
  if (type === 'array' && ((s.minItems !== undefined && v.length < s.minItems) ||
      (s.maxItems !== undefined && v.length > s.maxItems) || (s.items && !v.every(x => conforms(x,s.items))))) return false;
  if (type === 'object') {
    if (s.required?.some(k => !Object.hasOwn(v,k))) return false;
    for (const k of Object.keys(v)) {
      if (Object.hasOwn(s.properties || {}, k)) { if (!conforms(v[k],s.properties[k])) return false; }
      else if (s.additionalProperties === false) return false;
    }
  }
  return true;
}
export function validateEnvelope(value, definition) {
  canonicalJSON(value); // Reject non-finite, accessors, cycles and non-JSON before cloning.
  if (!Object.hasOwn(schema.$defs,definition) || !conforms(value,schema.$defs[definition])) {
    throw new ContractError('SCHEMA_INVALID', definition);
  }
  return true;
}

export function polygonArea(polygon) {
  // Shift to the first point to avoid cancellation from a distant origin.
  const o=polygon[0]; let twice=0;
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    twice+=(a.x-o.x)*(b.y-o.y)-(b.x-o.x)*(a.y-o.y);
  }
  const area=Math.abs(twice)/2;
  if (!Number.isFinite(area) || area<=0) throw new ContractError('INVALID_POLYGON_AREA');
  return area;
}
function assertSimple(p) {
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const on=(a,b,c)=>cross(a,b,c)===0 && c.x>=Math.min(a.x,b.x) && c.x<=Math.max(a.x,b.x) && c.y>=Math.min(a.y,b.y) && c.y<=Math.max(a.y,b.y);
  for(let i=0;i<p.length;i++) {
    const a=p[i],b=p[(i+1)%p.length];
    if(a.x===b.x && a.y===b.y) throw new ContractError('DEGENERATE_POLYGON_EDGE');
    for(let j=i+1;j<p.length;j++) {
      if(j===i+1 || (i===0 && j===p.length-1)) continue;
      const c=p[j],d=p[(j+1)%p.length];
      if((cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)) {
        throw new ContractError('SELF_INTERSECTING_POLYGON');
      }
    }
  }
}
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
function inRing(x,y,p) {
  let inside=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++) {
    const a=p[i],b=p[j];
    if((a.y>y)!==(b.y>y) && x<a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y)) inside=!inside;
  }
  return inside;
}
// Exact cell integration for orthogonal footprint vs each rectangular space/void.
function intersectionArea(p,r) {
  const xs=[...new Set([r.x,r.x+r.w,...p.map(q=>q.x).filter(x=>x>r.x&&x<r.x+r.w)])].sort((a,b)=>a-b);
  const ys=[...new Set([r.y,r.y+r.h,...p.map(q=>q.y).filter(y=>y>r.y&&y<r.y+r.h)])].sort((a,b)=>a-b);
  if(xs.length*ys.length*p.length>2000000) throw new ContractError('GEOMETRY_RESOURCE_LIMIT');
  let area=0;
  for(let i=1;i<xs.length;i++) for(let j=1;j<ys.length;j++) {
    if(inRing((xs[i]+xs[i-1])/2,(ys[j]+ys[j-1])/2,p)) area+=(xs[i]-xs[i-1])*(ys[j]-ys[j-1]);
  }
  return area;
}
function unique(items,path) {
  const ids=items.map(x=>x.id);
  if(new Set(ids).size!==ids.length) throw new ContractError('DUPLICATE_ID',path);
}

/** Validates identity and data; preserves the entire native geometry in metres. */
export async function adaptCandidateEnvelope(candidate,request) {
  canonicalJSON(candidate); canonicalJSON(request);
  assertUnitsAndFrame(candidate?.units,candidate?.frame);
  validateEnvelope(candidate,'candidate'); validateEnvelope(request,'request');
  // Snapshot BEFORE await: the caller cannot swap geometry during digest computation.
  const c=JSON.parse(JSON.stringify(candidate)), r=JSON.parse(JSON.stringify(request));
  await verifyCandidateBinding(c,r);
  const g=c.geometry;
  function checkDeclaredUnits(value,path='geometry') {
    if(!value||typeof value!=='object') return;
    for(const [key,item] of Object.entries(value)) {
      if(key==='units') {
        const isMetres=item==='METRIC_M'||(item&&typeof item==='object'&&item.length==='m'&&item.area==='m2'&&item.volume==='m3');
        if(!isMetres) throw new ContractError('UNIT_UNSUPPORTED',path+'.units');
      }
      if(/Mm$/.test(key) && (typeof item!=='number'||!Number.isFinite(item)||item<0)) throw new ContractError('INVALID_MEASUREMENT',path+'.'+key);
      checkDeclaredUnits(item,path+'.'+key);
    }
  }
  checkDeclaredUnits(g);
  if(g.units !== undefined && g.units !== 'METRIC_M') throw new ContractError('UNIT_UNSUPPORTED','geometry.units');
  if(g.frame !== undefined && g.frame !== c.frame) throw new ContractError('FRAME_UNSUPPORTED','geometry.frame');
  if(c.fallback.used && (!c.fallback.allowedByUser || !c.fallback.reason)) throw new ContractError('FALLBACK_NOT_AUTHORIZED');
  unique(r.program,'request.program'); unique(r.hardConstraints,'request.hardConstraints'); unique(r.softPreferences,'request.softPreferences');
  unique([...g.rooms,...g.corridors],'geometry.spaces'); unique(g.walls,'geometry.walls'); unique(g.openings,'geometry.openings');
  assertSimple(g.buildingFootprint);
  const areaM2=polygonArea(g.buildingFootprint), toleranceM2=Math.max(1e-6,areaM2*1e-8);
  const spaces=new Set([...g.rooms,...g.corridors].map(x=>x.id));
  const walls=new Map(g.walls.map(w=>[w.id,w]));
  for(const room of g.rooms) if(!g.corridors.some(x=>x.id===room.corridorId)) throw new ContractError('BROKEN_CORRIDOR_REFERENCE',room.id);
  for(const link of g.links) if(link.some(id=>!spaces.has(id))) throw new ContractError('BROKEN_LINK_REFERENCE');
  for(const opening of g.openings) {
    const w=walls.get(opening.wallId);
    if(!w || (opening.roomId!==undefined&&!g.rooms.some(r=>r.id===opening.roomId)) || opening.connects?.some(id=>!spaces.has(id)&&id!=='outside')) throw new ContractError('BROKEN_OPENING_REFERENCE',opening.id);
    if(Math.hypot(w.x2-w.x1,w.y2-w.y1)<=0) throw new ContractError('DEGENERATE_WALL',w.id);
  }
  const orthogonal=g.buildingFootprint.every((p,i)=>{const q=g.buildingFootprint[(i+1)%g.buildingFootprint.length];return p.x===q.x||p.y===q.y;});
  const outsideSpaces=orthogonal ? [...g.rooms,...g.corridors].filter(s=>s.w*s.h-intersectionArea(g.buildingFootprint,s)>toleranceM2).map(s=>s.id) : null;
  const courtyardOverlapM2=orthogonal ? g.courtyards.reduce((sum,s)=>sum+intersectionArea(g.buildingFootprint,s),0) : null;
  const spaceVoidOverlapM2=g.courtyards.reduce((sum,v)=>sum+[...g.rooms,...g.corridors].reduce((a,s)=>a+overlap(v,s),0),0);
  const rectMm=s=>({...s,x:s.x*1000,y:s.y*1000,w:s.w*1000,h:s.h*1000});
  const rectPolygon=s=>[[s.x*1000,s.y*1000],[(s.x+s.w)*1000,s.y*1000],[(s.x+s.w)*1000,(s.y+s.h)*1000],[s.x*1000,(s.y+s.h)*1000]];
  const mapped={
    schemaVersion:'claude-design-schema-v1.0',projectId:c.projectId,units:'METRIC_MM',frame:c.frame,
    // LVL-GF is an adapter identifier; no elevation/height/slab is invented.
    levels:[{levelId:'LVL-GF'}],buildingFootprint:g.buildingFootprint.map(p=>({x:p.x*1000,y:p.y*1000})),
    courtyards:g.courtyards.map(rectMm),corridors:g.corridors.map(rectMm),links:structuredClone(g.links),
    spaces:[...g.rooms.map(s=>({spaceId:s.id,levelId:'LVL-GF',functionalType:'UNSPECIFIED',polygon2D:rectPolygon(s),netAreaSqM:s.w*s.h})),
      ...g.corridors.map(s=>({spaceId:s.id,levelId:'LVL-GF',functionalType:'CORRIDOR',polygon2D:rectPolygon(s),netAreaSqM:s.w*s.h,nominalWidthMm:Math.min(s.w,s.h)*1000}))],
    enclosureElements:g.walls.map(w=>({elementId:w.id,levelId:'LVL-GF',type:w.type,start:[w.x1*1000,w.y1*1000],end:[w.x2*1000,w.y2*1000],thicknessMm:w.t*1000,heightMm:w.h*1000})),
    openings:g.openings.map(o=>{const w=walls.get(o.wallId);return {openingId:o.id,parentElementId:o.wallId,levelId:'LVL-GF',type:o.type.toUpperCase(),position:[(w.x1+(w.x2-w.x1)*o.pos)*1000,(w.y1+(w.y2-w.y1)*o.pos)*1000],widthMm:o.w*1000,heightMm:o.h*1000,sillMm:o.sill*1000,...(o.roomId?{roomId:o.roomId}:{}),...(o.connects?{connects:[...o.connects]}:{})};}),
    structuralElements:[],electricalEquipment:[],mepServiceZones:[]
  };
  canonicalJSON(mapped); // Detect finite inputs whose arithmetic overflowed.
  return deepFreeze({candidate:c,request:r,nativeGeometry:g,coreGeometry:mapped,unitScaleToMm:1,areaM2,
    geometryAudit:{orthogonal,outsideSpaces,courtyardOverlapM2,spaceVoidOverlapM2,toleranceM2},
    conversion:{from:'m',to:'mm',count:1,areaUnit:'m2',frame:c.frame},
    limitations:['Native Claude validateModel is a separate upstream gate; not executed by this adapter.',
      'Optional structural/MEP extension data is preserved in nativeGeometry but has no supported evaluation contract in MIZAN-IR/1.0.0.']});
}
