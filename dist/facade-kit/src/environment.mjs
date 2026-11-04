import {fail,number} from './core.mjs';
import {checkedAssetUrl,validateAssetManifest} from './assets.mjs';
import {RGBELoader} from '../vendor/RGBELoader.mjs';
/** Original analytic sky: a preview environment, not a measured HDR photograph. */
export function analyticSky(THREE,{width=512,height=256}={}){
  const data=new Float32Array(width*height*4),sun=new THREE.Vector3(-.55,.7,.45).normalize();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const theta=(y+.5)/height*Math.PI,phi=(x+.5)/width*Math.PI*2;
    const dir=new THREE.Vector3(-Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi));
    const h=Math.max(0,dir.y),below=dir.y<0,glow=Math.pow(Math.max(0,dir.dot(sun)),180)*7;
    const base=below?[.20,.18,.145]:[.62-h*.35,.72-h*.25,.88-h*.12];const i=(y*width+x)*4;
    data.set([base[0]+glow,base[1]+glow*.91,base[2]+glow*.72,1],i);
  }
  const t=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);t.mapping=THREE.EquirectangularReflectionMapping;t.colorSpace=THREE.LinearSRGBColorSpace;t.needsUpdate=true;return t;
}
export async function installEnvironment(THREE,renderer,scene,{asset=null,assetOptions={},intensity=1}={}){
  number(intensity,'environment.intensity',0,5);let texture,evidence;
  if(asset){const manifest=validateAssetManifest(asset);if(manifest.type!=='environment'||!manifest.file?.url)fail('HDR_ASSET_REQUIRED','environment');
    const file=await checkedAssetUrl(manifest.file,assetOptions);
    const header=new TextDecoder().decode(file.bytes.subarray(0,32768)),dimensions=header.match(/(?:^|\n)\s*-Y\s+(\d+)\s+\+X\s+(\d+)\s*(?:\n|$)/);
    if(!dimensions||Number(dimensions[1])*Number(dimensions[2])>8388608)fail('HDR_PIXEL_LIMIT',manifest.id);
    const loader=new RGBELoader().setDataType(THREE.HalfFloatType),parsed=loader.parse(file.bytes.buffer);
    texture=new THREE.DataTexture(parsed.data,parsed.width,parsed.height,THREE.RGBAFormat,THREE.HalfFloatType);texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.LinearSRGBColorSpace;texture.needsUpdate=true;
    evidence={status:'USER_SUPPLIED_HDR',manifest,sha256:file.sha256};
  }else{texture=analyticSky(THREE);evidence={status:'AUTHOR_CREATED_ANALYTIC_SKY',measuredEnvironment:false};}
  const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();const target=pmrem.fromEquirectangular(texture);pmrem.dispose();
  scene.environment=target.texture;scene.background=texture;scene.backgroundIntensity=intensity;
  return {evidence,dispose(){if(scene.environment===target.texture)scene.environment=null;if(scene.background===texture)scene.background=null;target.dispose();texture.dispose();}};
}
