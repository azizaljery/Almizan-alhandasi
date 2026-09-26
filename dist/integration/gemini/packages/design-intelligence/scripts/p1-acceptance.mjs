// Emit real review artifacts from the frozen control-room candidates.
import fs from 'node:fs/promises';
import path from 'node:path';
import { reviewCandidate } from '../adapters/mizan-review-v1.js';
const out=path.resolve(process.argv[2]||'p1-review-output');
await fs.mkdir(out,{recursive:true});
const runs=[];
for(const shape of ['rect','l','u']) for(const direction of ['s','n','e','w']) {
  const id=`${shape}-${direction}`;
  const read=async group=>JSON.parse(await fs.readFile(new URL(`../../../fixtures/${group}/${id}.json`,import.meta.url),'utf8'));
  const review=await reviewCandidate(await read('candidates'),await read('requests'));
  await fs.writeFile(path.join(out,id+'.json'),JSON.stringify(review,null,2)+'\n');
  runs.push({id,overall:review.overall,coverage:review.coverage,candidateId:review.candidateId,geometryHash:review.geometryHash,reviewId:review.reviewId});
}
await fs.writeFile(path.join(out,'RESULTS.json'),JSON.stringify(runs,null,2)+'\n');
console.log(JSON.stringify({reviews:runs.length,blocked:runs.filter(x=>x.overall==='BLOCKED').length,incomplete:runs.filter(x=>x.overall==='PRELIMINARY_INCOMPLETE').length,output:out}));
