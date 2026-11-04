import { number } from './core.mjs';
function textureCanvas(THREE,{size=512,tint=[222,213,194],seed=17,amplitude=7,repeatM=1.2,kind='stone',data=false}={}) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d'),im=ctx.createImageData(size,size);let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4;const wave=Math.sin(x*.031+Math.sin(y*.019)*2)*1.7+Math.sin(x*.083+y*.047)*.8;
    const n=kind==='wood'?Math.sin(x*.19+Math.sin(y*.025)*2)*15+(random()-.5)*5:wave+(random()-.5)*amplitude;
    for(let k=0;k<3;k++)im.data[i+k]=Math.max(0,Math.min(255,(data?128:tint[k])+n));im.data[i+3]=255;
  }
  ctx.putImageData(im,0,0);const t=new THREE.CanvasTexture(canvas);t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/repeatM,1/repeatM);return t;
}
export function createMaterialLibrary(THREE,{surfaceAssets={},maxAnisotropy=1,glassMode='reflective-preview'}={}) {
  const textures=[],materials=[];const evidence=[];
  const make=(name,cfg)=>{const m=new THREE.MeshStandardMaterial(cfg);m.name=name;materials.push(m);return m;};
  const surface=(key,tint)=>{
    const asset=surfaceAssets[key],maps=asset?.maps;let map=maps?.color,bumpMap=maps?.height;
    if(!map){map=textureCanvas(THREE,{tint,seed:key==='stone'?71:73});textures.push(map);evidence.push({material:key,status:'AUTHOR_CREATED_PROCEDURAL',representsVerifiedProduct:false});}
    else evidence.push({material:key,status:asset.completeness,manifest:asset.manifest,evidence:asset.evidence});
    if(!maps?.normal&&!bumpMap){bumpMap=textureCanvas(THREE,{data:true,amplitude:6,seed:13});textures.push(bumpMap);}
    return make(key,{color:'#ffffff',map,bumpMap:bumpMap||null,bumpScale:.0007,normalMap:maps?.normal||null,roughnessMap:maps?.roughness||null,roughness:.79,vertexColors:true});
  };
  const mats={stone:surface('stone',[226,219,204]),beigeStone:surface('beigeStone',[200,181,150])};
  mats.joint=make('recessed-joint',{color:'#a39783',roughness:.97});
  const renderBump=textureCanvas(THREE,{data:true,seed:8,amplitude:3,repeatM:1});textures.push(renderBump);
  mats.render=make('render',{color:'#dedbd2',roughness:.92,bumpMap:renderBump,bumpScale:.0003});
  mats.darkRender=make('darkRender',{color:'#5a5b57',roughness:.86});
  mats.metal=make('metal',{color:'#363c40',metalness:1,roughness:.32});
  const wood=textureCanvas(THREE,{kind:'wood',tint:[150,105,65],repeatM:1.2});textures.push(wood);
  mats.wood=make('wood',{color:'#ffffff',map:wood,roughness:.62});
  // Reflective preview is deliberately labelled. Transmission requires a closed/thick glazing model.
  mats.glass=new THREE.MeshPhysicalMaterial({name:'glass',color:'#a7b7bf',metalness:0,roughness:.08,ior:1.5,envMapIntensity:1.15,transmission:glassMode==='transmission-preview'?.7:0,thickness:.008});materials.push(mats.glass);
  mats.interior=make('interior',{color:'#272a29',roughness:1});
  mats.ground=make('ground',{color:'#b4ac99',roughness:1});mats.roof=make('roof',{color:'#c8c4b7',roughness:.92});
  for(const t of textures)t.anisotropy=maxAnisotropy;
  return {mats,evidence,glassMode,get(key){const aliases={limestoneWhite:'stone',limestoneBeige:'beigeStone',aluminium:'metal',timberLook:'wood'};return mats[aliases[key]||key]||mats.render;},dispose(){textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}};
}
