import {hash,copy} from '../src/core.mjs';
export const JUDGEMENTS=['SAME','NEAR-DUPLICATE','RELATED FAMILY','DIFFERENT FAMILY','INVALID'];
export async function lockJudgements(bundle,answers,{reviewer,reviewedAt}){
  if(!reviewer?.trim()||!reviewedAt||!Number.isFinite(Date.parse(reviewedAt)))throw new Error('REVIEWER_AND_TIME_REQUIRED');
  if(!Array.isArray(answers)||answers.length!==bundle.pairs.length)throw new Error('INCOMPLETE_REVIEW');
  const expected=new Set(bundle.pairs.map(p=>p.id)),seen=new Set();
  for(const a of answers){if(!expected.has(a.pairId)||seen.has(a.pairId)||!JUDGEMENTS.includes(a.judgement))throw new Error('INVALID_REVIEW');if(a.judgement==='INVALID'&&!a.reason?.trim())throw new Error('INVALID_REQUIRES_REASON');seen.add(a.pairId);}
  const record={schema:'MIZAN-BLIND-JUDGEMENTS/1',bundleHash:await hash(bundle),reviewer,reviewedAt,answers:copy(answers).sort((a,b)=>a.pairId.localeCompare(b.pairId))};return {...record,lockHash:await hash(record)};
}
export async function revealReview(bundle,key,locked){
  const {lockHash,...record}=locked;if(lockHash!==await hash(record)||record.bundleHash!==await hash(bundle)||key.bundleHash!==record.bundleHash)throw new Error('REVIEW_BINDING_BROKEN');
  await lockJudgements(bundle,record.answers,record);
  return {status:'HUMAN_REVIEW_RECORDED_NOT_AUTOMATIC_VALIDATION',r7Status:'EXPERIMENTAL',lockHash,rows:record.answers.map(a=>({...a,...key.pairs[a.pairId]}))};
}
