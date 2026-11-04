import { signedArea,openRing,bounds } from './polygons.mjs';
import { fail } from './core.mjs';
function asShape(THREE,poly) {
  const shape=new THREE.Shape(openRing(poly[0]).map(([x,y])=>new THREE.Vector2(x,y)));
  for(const h of poly.slice(1))shape.holes.push(new THREE.Path(openRing(h).map(([x,y])=>new THREE.Vector2(x,y))));return shape;
}
export function extrudePolygons(THREE,multi,back,front) {
  if(front<=back)fail('NEGATIVE_EXTRUSION','geometry');
  return multi.map(poly=>{const g=new THREE.ExtrudeGeometry(asShape(THREE,poly),{depth:front-back,bevelEnabled:false,curveSegments:12,steps:1});g.translate(0,0,back);return g;});
}
function rectangleOf(poly) {
  if(poly.length!==1)return null;const r=openRing(poly[0]);if(r.length!==4)return null;const b=bounds([poly]);
  return r.every(([x,y])=>(Math.abs(x-b.u0)<1e-8||Math.abs(x-b.u1)<1e-8)&&(Math.abs(y-b.z0)<1e-8||Math.abs(y-b.z1)<1e-8))?b:null;
}
/** Bevel stays INSIDE the tile envelope. Cut nonrectangular edges remain sawn, unbevelled. */
function beveledRectangle(THREE,b,back,front,bevel) {
  const v=[],uv=[]; const tri=(a,c,d)=>{for(const p of [a,c,d]){v.push(...p);uv.push(p[0],p[1]);}};
  const quad=(a,b,c,d)=>{tri(a,b,d);tri(b,c,d);};
  const ring=(inset,z)=>[[b.u0+inset,b.z0+inset,z],[b.u1-inset,b.z0+inset,z],[b.u1-inset,b.z1-inset,z],[b.u0+inset,b.z1-inset,z]];
  const k=Math.min(bevel,(b.u1-b.u0)/5,(b.z1-b.z0)/5,(front-back)/3),a=ring(0,back),o=ring(0,front-k),f=ring(k,front);
  quad(a[3],a[2],a[1],a[0]);quad(f[0],f[1],f[2],f[3]);
  for(let i=0;i<4;i++){const j=(i+1)%4;quad(a[i],a[j],o[j],o[i]);quad(o[i],o[j],f[j],f[i]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
export function mergeGeometry(THREE,geometries,{matrix=null}={}) {
  const arrays={position:[],normal:[],uv:[],color:[]};
  for(let g of geometries){if(g.index){const n=g.toNonIndexed();g.dispose();g=n;}if(matrix)g.applyMatrix4(matrix);const count=g.attributes.position.count;
    for(const [key,size]of Object.entries({position:3,normal:3,uv:2,color:3})){const a=g.attributes[key];if(a){for(const v of a.array)arrays[key].push(v);}else for(let i=0;i<count*size;i++)arrays[key].push(key==='color'?1:0);}g.dispose();}
  const out=new THREE.BufferGeometry();for(const [k,size]of Object.entries({position:3,normal:3,uv:2,color:3}))out.setAttribute(k,new THREE.Float32BufferAttribute(arrays[k],size));out.computeBoundingBox();out.computeBoundingSphere();return out;
}
export function stoneGeometries(THREE,cut,C=0) {
  const veneer=cut.config.veneerM;
  const all=[];
  for(const tile of cut.tiles)for(const poly of tile.polygons){const rect=rectangleOf(poly);
    const back=Math.max(tile.backM,tile.frontM-veneer),list=rect?[beveledRectangle(THREE,rect,C+back,C+tile.frontM,cut.config.bevelM)]:extrudePolygons(THREE,[poly],C+back,C+tile.frontM);
    for(const g of list){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,colors=new Float32Array(p.count*3);
      for(let i=0;i<p.count;i++){if(Math.abs(n.getZ(i))>.8){uv.setXY(i,p.getX(i)+tile.uvOffset[0],p.getY(i)+tile.uvOffset[1]);}const t=1+tile.variation;colors.set([t,t*.998,t*.992],i*3);}g.setAttribute('color',new THREE.BufferAttribute(colors,3));all.push(g);}
  }
  return all;
}
