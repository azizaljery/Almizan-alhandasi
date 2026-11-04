import {copy,freeze,hash,fail} from './core.mjs';
import {fromMizanDraw,verifyFacadePackage,EXPERIMENT_PRESET} from './model.mjs';
export const AGENT_ACTIONS=freeze({
  'facade.generate':{descriptionAr:'توليد بديل دون تعديل العمارة',required:['expectedDocumentHash','style']},
  'facade.edit':{descriptionAr:'إعادة التوليد بعد تعديل خصائص الكسوة فقط',required:['resultId','expectedDocumentHash','patch']},
  'facade.validate':{descriptionAr:'فحص سلامة النتيجة وربطها بالمستند الحالي',required:['resultId']},
  'facade.get':{descriptionAr:'قراءة نتيجة حديثة صالحة للعرض والتصدير',required:['resultId']}
});
/** Local functions for the existing agent. No model calls, API key, storage or document writes. */
export function createFacadeAgentActions({getDocument,buildAllSides,sideTransform,validateDoc,getOptions,maxResults=8}){
  if(typeof getDocument!=='function'||typeof getOptions!=='function')fail('AGENT_CALLBACKS_REQUIRED','agent');
  const results=new Map();
  const current=async()=>{const doc=copy(await getDocument());return {doc,documentHash:await hash(doc)};};
  const remember=(envelope)=>{const resultId=envelope.result.resultHash;results.set(resultId,freeze({...envelope,resultId}));while(results.size>maxResults)results.delete(results.keys().next().value);return results.get(resultId);};
  const lookup=(id)=>{const r=results.get(id);if(!r)fail('RESULT_NOT_FOUND',String(id));return r;};
  const generate=async(params,overrides={})=>{const {doc,documentHash}=await current();if(params.expectedDocumentHash!==documentHash)fail('STALE_DOCUMENT','expectedDocumentHash');
    const options=copy(await getOptions(doc));
    const exp=(params.experiment===true||overrides.experiment===true)?{experiment:copy(EXPERIMENT_PRESET)}:{};
    const envelope=await fromMizanDraw(doc,{...options,...overrides,...exp,style:params.style||overrides.style||'A',buildAllSides,sideTransform,validateDoc});
    if((await current()).documentHash!==documentHash)fail('DOCUMENT_CHANGED_DURING_GENERATION','doc');
    const optionHash=await hash(options);
    if(optionHash!==await hash(copy(await getOptions(doc))))fail('OPTIONS_CHANGED_DURING_GENERATION','options');
    return remember({...envelope,requestDocumentHash:documentHash,optionHash,options:{...options,...overrides,...exp,style:params.style||overrides.style||'A'}});
  };
  return {
    schemas:AGENT_ACTIONS,
    async documentHash(){return (await current()).documentHash;},
    async call(action,params={}){
      if(!AGENT_ACTIONS[action])fail('ACTION_NOT_ALLOWED',action);
      if(action==='facade.generate')return generate(params);
      const found=lookup(params.resultId);
      const now=await current();const validHash=await verifyFacadePackage(found.result),fresh=found.requestDocumentHash===now.documentHash&&found.optionHash===await hash(copy(await getOptions(now.doc)));
      if(action==='facade.validate')return {resultId:found.resultId,integrity:validHash,fresh,visualApproval:'NOT_REVIEWED',constructionApproved:false,issues:found.result.issues};
      if(!validHash)fail('RESULT_INTEGRITY','resultId');if(!fresh)fail('STALE_FACADE','resultId');
      if(action==='facade.get')return found;
      const patch=copy(params.patch);if(!patch||Array.isArray(patch)||Object.keys(patch).some(k=>!['style','stone'].includes(k)))fail('EDIT_SCOPE','patch');
      if(patch.stone&&Object.keys(patch.stone).some(k=>!['widthM','heightM','jointM','recessM','bevelM','rowOffset','seed','toneVariation','originU','originZ','maxTiles'].includes(k)))fail('EDIT_SCOPE','patch.stone');
      // Re-read current engineering options on every edit; never replay obsolete projection/roof rules.
      const overrides={experiment:!!found.result.experiment?.enabled,style:patch.style||found.result.style.id,stone:{...found.result.stone,...patch.stone}};
      return generate({...params,style:overrides.style,experiment:overrides.experiment},overrides);
    },clear(){results.clear();}
  };
}
