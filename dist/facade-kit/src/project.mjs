import {copy,freeze,fail,number,hash} from './core.mjs';
import {stoneConfig} from './stone.mjs';
export const PROJECT_IDENTITY=freeze({repository:'azizaljery/Almizan-alhandasi',projectName:'MIZAN-ALHANDASAH',packageName:'@mizan/facade-kit'});
export function projectOptions({policy,buildInfo,projectId,designId,roofSurfaces=[]}){
  const p=copy(policy),b=copy(buildInfo);
  if(p.schema!=='MIZAN-FACADE-POLICY/1')fail('POLICY_SCHEMA','policy');
  for(const[k,v]of Object.entries(PROJECT_IDENTITY))if(p[k]!==v||b[k]!==v)fail('PROJECT_IDENTITY_MISMATCH',k);
  if(!/^[a-f0-9]{40}$/.test(b.sourceRevision||''))fail('REAL_SOURCE_REVISION_REQUIRED','sourceRevision');
  if(b.dirty===true)fail('UNCOMMITTED_SOURCE','buildInfo');
  if(!['preview','project'].includes(p.usage))fail('POLICY_USAGE','usage');
  if(typeof projectId!=='string'||!projectId.trim()||typeof designId!=='string'||!designId.trim())fail('PROJECT_BINDING_REQUIRED','projectId/designId');
  if(!['s','n','e','w'].includes(p.frontSide))fail('FRONT_SIDE_REQUIRED','frontSide');
  const projection=p.projection;if(!projection?.source||!['UNVERIFIED','PROJECT_REVIEWED'].includes(projection.status))fail('PROJECTION_EVIDENCE_REQUIRED','projection');
  const limits=projection.maxProjectionM;
  for(const side of ['s','n','e','w']){number(limits?.[side],'maxProjectionM.'+side,0,2);if(projection.status!=='PROJECT_REVIEWED'&&limits[side]!==0)fail('UNVERIFIED_PROJECTION_NOT_ZERO',side);}
  const stone=p.stone;if(!stone?.source||!['VISUAL_ASSUMPTION','PRODUCT_DEFINED'].includes(stone.status))fail('STONE_EVIDENCE_REQUIRED','stone');
  if(!stone.dimensions||['widthM','heightM','jointM','recessM'].some(k=>stone.dimensions[k]===undefined))fail('STONE_DIMENSIONS_REQUIRED','stone.dimensions');
  if(stone.status==='PRODUCT_DEFINED'&&(!stone.productId||!stone.technicalDocument))fail('STONE_PRODUCT_REFERENCE_REQUIRED','stone');
  if(p.usage==='project'&&(projection.status!=='PROJECT_REVIEWED'||stone.status!=='PRODUCT_DEFINED'))fail('PROJECT_POLICY_INCOMPLETE','policy');
  return freeze({sourceRevision:b.sourceRevision,frontSide:p.frontSide,maxProjectionM:limits,stone:stoneConfig(stone.dimensions),roofSurfaces:copy(roofSurfaces),projectBinding:{projectId,designId},projectEvidence:{identity:PROJECT_IDENTITY,projection,stone,usage:p.usage,verificationScope:b.verificationScope||'NOT_DECLARED'}});
}
export async function integrationReference(doc,options){return freeze({schema:'MIZAN-FACADE-REFERENCE/1',projectId:options.projectBinding.projectId,designId:options.projectBinding.designId,sourceRevision:options.sourceRevision,documentHash:await hash(doc),hashAlgorithm:'SHA-256/sorted-JSON-v1',policyHash:await hash(options),constructionApproved:false});}
