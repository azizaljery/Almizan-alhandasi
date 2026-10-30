/** Rejected candidate != impossible project. Keep every failure reason. */
const stages=new Set(['brief','constraints','organization','dimensions','geometry','review','presentation','search']);
export function rejection({candidateId,stage,rule,source,reason,measured=null,limit=null,unit=null}){
 if(!candidateId||!stages.has(stage)||!rule||!source||!reason)throw Error('Incomplete rejection evidence');
 if(measured!==null&&!Number.isFinite(measured))throw Error('Invalid measured value');
 if(limit!==null&&!Number.isFinite(limit))throw Error('Invalid limit');
 return Object.freeze({candidateId:String(candidateId),stage,rule,source,reason,measured,limit,unit});
}
export function assertBlocked(candidate){
 if(candidate.status!=='blocked')return true;
 if(!Array.isArray(candidate.rejections)||candidate.rejections.length===0)throw Error('Blocked candidate without evidence');
 for(const r of candidate.rejections)rejection(r);
 return true;
}
export function classifyRun({candidates=[],proof=null}){
 const ready=candidates.filter(c=>c.status==='ready');
 if(ready.length)return {status:'SOLVED',ready};
 if(proof?.verified===true&&proof.kind==='contradiction'&&Array.isArray(proof.sources)&&proof.sources.length>=2)return {status:'PROVEN_CONFLICT',proof};
 return {status:'SEARCH_INCOMPLETE',rejected:candidates.filter(c=>c.status==='blocked')};
}
export function clientNotice(result,{requested,shown}={}){
 const count=Number.isInteger(requested)&&requested>0&&Number.isInteger(shown)&&shown>=0?`عُرض ${shown} من ${requested} تصاميم مطلوبة. `:'';
 if(result.status==='SOLVED')return count+'المخططات اجتازت الفحص الأولي، وتحتاج مراجعة هندسية قبل التنفيذ.';
 if(result.status==='PROVEN_CONFLICT')return count+'هناك تعارض بين متطلبين في طلبك؛ نحتاج توضيح أيهما تفضّل.';
 return count+'لم يُعثر على مخطط صالح ضمن البحث الحالي. هذا لا يثبت أن طلبك مستحيل.';
}
