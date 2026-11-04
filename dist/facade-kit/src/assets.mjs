import { fail, number, copy } from './core.mjs';
import {digestHex} from './sha256.mjs';
const RIGHTS=['AUTHOR_CREATED','LICENSE_REVIEWED','USER_ATTESTED'];
export function validateAssetManifest(raw) {
  const a=copy(raw);
  if(!a.id||!RIGHTS.includes(a.rightsStatus)||!a.name||!a.source||!a.license)fail('ASSET_PROVENANCE_REQUIRED',a.id||'asset');
  if(a.rightsStatus==='LICENSE_REVIEWED'&&(!a.source.url||!a.license.url||!a.license.id))fail('LICENSE_DETAILS_REQUIRED',a.id);
  if(a.maps){for(const[k,v]of Object.entries(a.maps)){if(!['color','normal','roughness','height'].includes(k)||typeof v.url!=='string')fail('ASSET_MAP_INVALID',a.id);if(v.sha256&&!/^[a-f0-9]{64}$/.test(v.sha256))fail('ASSET_HASH_INVALID',a.id);}}
  if(a.type==='surface'){number(a.tileWidthM,a.id+'.tileWidthM',.01,50);number(a.tileHeightM,a.id+'.tileHeightM',.01,50);}
  return a;
}
export async function checkedAssetUrl(spec,{baseUrl,allowRemote=false,maxBytes=33554432}={}) {
  const base=new URL(baseUrl||location.href),url=new URL(spec.url,base);
  if(url.username||url.password||!['http:','https:'].includes(url.protocol)||!allowRemote&&url.origin!==base.origin)fail('ASSET_URL_NOT_ALLOWED',spec.url);
  const res=await fetch(url,{credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(30000)});if(!res.ok)fail('ASSET_HTTP',url.pathname);
  const advertised=Number(res.headers.get('content-length')||0);if(advertised>maxBytes)fail('ASSET_SIZE',url.pathname);
  const reader=res.body.getReader(),chunks=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();fail('ASSET_SIZE',url.pathname);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  const digest=await digestHex(bytes);
  if(spec.sha256&&digest!==spec.sha256)fail('ASSET_CONTENT_CHANGED',spec.url);
  return {url,bytes,sha256:digest,mime:res.headers.get('content-type')||'application/octet-stream'};
}
export async function loadSurfaceMaps(THREE,raw,options={}) {
  const manifest=validateAssetManifest(raw),maps={},evidence=[];
  if(manifest.type!=='surface')fail('SURFACE_ASSET_REQUIRED',manifest.id);
  try {for(const[k,spec]of Object.entries(manifest.maps||{})){
    const data=await checkedAssetUrl(spec,options),blob=URL.createObjectURL(new Blob([data.bytes],{type:data.mime}));let texture;
    try{texture=await new THREE.TextureLoader().loadAsync(blob);}finally{URL.revokeObjectURL(blob);}
    if(texture.image.width*texture.image.height>16777216){texture.dispose();fail('ASSET_PIXEL_LIMIT',manifest.id);}
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1/manifest.tileWidthM,1/manifest.tileHeightM);
    texture.colorSpace=k==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.anisotropy=options.maxAnisotropy||1;
    maps[k]=texture;evidence.push({map:k,sha256:data.sha256,sourceUrl:data.url.href});
  }}catch(e){Object.values(maps).forEach(t=>t.dispose());throw e;}
  return {manifest,maps,evidence,completeness:maps.color&&maps.normal&&maps.roughness?'PBR_MAPS_SUPPLIED':'PARTIAL_MAPS',dispose(){Object.values(maps).forEach(t=>t.dispose());}};
}
/** تحميل خامة سطح من ملفات محلية يختارها المستخدم (File)، مع سجل المصدر والترخيص والبصمة. لا شبكة ولا نسخ خارج المتصفح. */
export async function loadSurfaceMapsFromFiles(THREE,fields,files,{maxAnisotropy=1,maxBytes=33554432}={}) {
  const maps={};for(const k of Object.keys(files||{}))if(files[k])maps[k]={url:'local-file:'+(files[k].name||k)};
  if(!maps.color)fail('ASSET_COLOR_MAP_REQUIRED',fields?.id||'asset');
  const manifest=validateAssetManifest({type:'surface',...fields,maps}),out={},evidence=[];
  try{for(const[k,file]of Object.entries(files)){if(!file)continue;
    if(file.size>maxBytes)fail('ASSET_SIZE',file.name);if(!/^image\/(png|jpeg|webp)$/.test(file.type))fail('ASSET_TYPE',file.name+':'+file.type);
    const bytes=new Uint8Array(await file.arrayBuffer()),sha256=await digestHex(bytes),url=URL.createObjectURL(new Blob([bytes],{type:file.type}));let texture;
    try{texture=await new THREE.TextureLoader().loadAsync(url);}finally{URL.revokeObjectURL(url);}
    if(texture.image.width*texture.image.height>16777216){texture.dispose();fail('ASSET_PIXEL_LIMIT',file.name);}
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1/manifest.tileWidthM,1/manifest.tileHeightM);
    texture.colorSpace=k==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.anisotropy=maxAnisotropy;
    out[k]=texture;evidence.push({map:k,fileName:file.name,bytes:file.size,sha256,width:texture.image.width,height:texture.image.height});}
  }catch(e){Object.values(out).forEach(t=>t.dispose());throw e;}
  return {manifest:{...manifest,maps:Object.fromEntries(Object.entries(manifest.maps).map(([k,v])=>[k,{...v,sha256:evidence.find(e=>e.map===k)?.sha256}]))},maps:out,evidence,completeness:out.color&&out.normal&&out.roughness?'PBR_MAPS_SUPPLIED':'PARTIAL_MAPS',dispose(){Object.values(out).forEach(t=>t.dispose());}};
}
