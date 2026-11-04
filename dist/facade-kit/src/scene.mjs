import { fail, number } from './core.mjs';
import { verifyFacadePackage,SIDES } from './model.mjs';
import { layerMask } from './polygons.mjs';
import { extrudePolygons,mergeGeometry,stoneGeometries } from './geometry.mjs';
export async function buildFacadeScene(THREE,packet,library,{stoneMode='cut',monochrome=false}={}) {
  if(THREE.REVISION!=='160')fail('THREE_VERSION_UNTESTED',String(THREE.REVISION));
  if(!await verifyFacadePackage(packet))fail('RESULT_INTEGRITY','packet');
  if(!['cut','flat'].includes(stoneMode))fail('STONE_MODE','stoneMode');
  const group=new THREE.Group();group.name='mizan-facade-'+packet.style.id;
  group.userData={schema:packet.schema,sourceHash:packet.sourceHash,resultHash:packet.resultHash,visualApproval:'NOT_REVIEWED',constructionApproved:false};
  const meshes=[],extraMaterials=[],geometries=[];
  const grey=new THREE.MeshStandardMaterial({color:'#a8a8a8',roughness:.8,vertexColors:false});if(monochrome)extraMaterials.push(grey);else grey.dispose();
  const add=(g,material,name,data)=>{if(!g.attributes.position.count){g.dispose();return;}const mesh=new THREE.Mesh(g,monochrome?grey:material);mesh.name=name;mesh.userData=data;mesh.castShadow=data.role!=='glazing';mesh.receiveShadow=true;group.add(mesh);meshes.push(mesh);geometries.push(g);};
  for(const side of SIDES){const rows=packet.transforms[side],M=new THREE.Matrix4().set(...rows[0],...rows[1],...rows[2],0,0,0,1);
    for(const L of packet.built[side].layers){const data={side,id:L.id,role:L.role,sourceOpeningId:L.opening||null,proposal:L.id.includes(':kit:')};const cut=packet.cuts[side+':'+L.id];
      if(cut&&stoneMode==='cut'){
        const backing=extrudePolygons(THREE,cut.mask,L.C+L.o0,L.C+cut.backingFrontM);add(mergeGeometry(THREE,backing,{matrix:M}),library.get('joint'),side+':'+L.id+':bed',data);
        const pieces=stoneGeometries(THREE,cut,L.C);add(mergeGeometry(THREE,pieces,{matrix:M}),library.get(L.mat),side+':'+L.id+':stones',{...data,tileCount:cut.tiles.length});
      }else{const geos=extrudePolygons(THREE,layerMask(L),L.C+L.o0,L.C+L.o1);add(mergeGeometry(THREE,geos,{matrix:M}),library.get(L.mat),side+':'+L.id,data);}
      if(L.role==='glazing'){
        const inner=extrudePolygons(THREE,layerMask(L),L.C+L.o0-.035,L.C+L.o0-.033);add(mergeGeometry(THREE,inner,{matrix:M}),library.get('interior'),side+':'+L.id+':interior',{...data,role:'interior'});
      }
    }
  }
  for(const roof of packet.roofSurfaces||[]){const multi=layerMask({id:roof.id,outer:roof.polygon,holes:roof.holes||[]});const geos=extrudePolygons(THREE,multi,roof.bottomM,roof.topM);
    // Extruded XY plan [east,north] -> scene [east,height,-north].
    const M=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1);add(mergeGeometry(THREE,geos,{matrix:M}),library.get('roof'),roof.id,{role:'source-roof',proposal:false});
  }
  const box=new THREE.Box3().setFromObject(group);if(box.isEmpty())fail('EMPTY_SCENE','built');
  return {group,meshes,bounds:box,stats:{meshes:meshes.length,triangles:meshes.reduce((s,m)=>s+m.geometry.attributes.position.count/3,0),stoneTiles:Object.values(packet.cuts).reduce((s,c)=>s+c.tiles.length,0),stoneMode,monochrome,sourceHash:packet.sourceHash,resultHash:packet.resultHash},dispose(){geometries.forEach(g=>g.dispose());extraMaterials.forEach(m=>m.dispose());group.clear();}};
}
