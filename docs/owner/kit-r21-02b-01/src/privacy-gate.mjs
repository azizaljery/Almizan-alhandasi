/** C6: conservative sightline screening; not a replacement for 3D sun/ventilation checks. */
export function segmentHit(a,b,c,d){
 const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;
 if(Math.abs(den)<1e-9)return null;
 const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;
 return t>=0&&t<=1&&u>=0&&u<=1?{t,u,x:a.x+t*rx,y:a.y+t*ry}:null;
}
export function screenWindowPrivacy({window,parkingPoints,interiorPoints,opaqueScreens=[],eyeHeight=1.6}){
 if(!window||!Array.isArray(parkingPoints)||!Array.isArray(interiorPoints))throw Error('Missing geometry');
 const exposed=[];
 for(const outside of parkingPoints)for(const inside of interiorPoints){
  const hit=segmentHit(outside,inside,window.a,window.b);
  if(!hit||eyeHeight<window.sillHeight||eyeHeight>window.headHeight)continue;
  const screened=opaqueScreens.some(s=>{const h=segmentHit(outside,inside,s.a,s.b);return h&&h.t<hit.t&&(s.height??0)>=eyeHeight;});
  if(!screened)exposed.push({outside,inside,windowHit:{x:hit.x,y:hit.y}});
 }
 return {potentialExposure:exposed.length>0,paths:exposed,limitations:'2D sightline screening only; check 3D, daylight, ventilation and safety separately'};
}
export function compareAcceptance(before,after,{mandatory=[],protect=[]}={}){
 const violations=[];
 for(const rule of mandatory)if(!after?.checks?.[rule]?.passed)violations.push({rule,type:'mandatory'});
 for(const rule of protect)if(before?.checks?.[rule]?.passed&&!after?.checks?.[rule]?.passed)violations.push({rule,type:'regression'});
 return {pass:violations.length===0,violations};
}
