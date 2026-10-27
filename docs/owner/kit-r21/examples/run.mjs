import { createBrief, diningRelation, generateR21, explainToClient } from '../src/index.mjs';
const brief = createBrief({ text:'أريد ثلاثة تصاميم', rooms:[{type:'majlis'},{type:'dining'}],
  relations:diningRelation({near:true,guestAccess:true}) });
const result = await generateR21(brief, {
  enumerate:async (_brief,{pass})=>pass===1?[]:[{id:'topology-demo'}],
  solve:async ()=>({ id:'plan-demo', rooms:[
    {id:'m',type:'majlis',zone:'guest',floor:0,x:0,y:0,width:5,height:6},
    {id:'d',type:'dining',zone:'guest',floor:0,x:5,y:0,width:4,height:6}
  ], doors:[{from:'m',to:'d',kind:'interior',width:0.9,offset:1.5}] }),
  review:async ()=>({valid:true,score:75}),
  frozenDifferent:()=>false
});
console.log(JSON.stringify({status:result.status, alternatives:result.alternatives?.length ?? 0,
  message:explainToClient(result)},null,2));
