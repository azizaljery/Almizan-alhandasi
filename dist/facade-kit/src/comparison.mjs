import {intersection,multiArea,rect,layerMask,bounds} from './polygons.mjs';
import {fail,freeze} from './core.mjs';
/** Stable targets are selected ONCE from native source A, not separately for every variant. */
export function closeupPlan(built,transforms,{side='s',width=960,height=720}={}){
  const b=built[side],wall=b.layers.find(l=>l.role==='wall'),glass=b.layers.find(l=>l.role==='glazing'),door=b.layers.find(l=>l.role==='door');
  if(!wall||!glass||!door)fail('CLOSEUP_SOURCE_MISSING',side);
  const mask=layerMask(wall),bb=bounds(mask);let patch=null;
  search:for(let z=bb.z0+.3;z<bb.z1-.3;z+=.25)for(let u=bb.u0+.3;u<bb.u1-.3;u+=.25){const area=multiArea(intersection(mask,[[rect(u-.2,z-.2,u+.2,z+.2)]]));if(area>.1599){patch=[u,z];break search;}}
  if(!patch)fail('NO_CLEAR_STONE_PATCH',wall.id);
  const center=L=>{const p=bounds(layerMask(L));return[(p.u0+p.u1)/2,(p.z0+p.z1)/2,L.C+L.o1];};
  const targets={stone:[...patch,wall.C+wall.o1],glass:center(glass),entrance:center(door)},M=transforms[side];
  const transform=p=>M.map(row=>row[0]*p[0]+row[1]*p[1]+row[2]*p[2]+row[3]);
  return freeze(Object.entries(targets).map(([shot,local])=>{const offset=shot==='stone'?[.35,.2,2]:shot==='glass'?[1,.35,3.2]:[1.2,.35,4.2],target=transform(local),position=transform(local.map((x,i)=>x+offset[i]));return{shot,width,height,fov:34,position,target,side};}));
}
