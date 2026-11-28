// Bounded, reviewable design options derived from confirmed context. No auto-apply.
import { activeFacts, siteFacts } from './core.mjs';
export function architecturalIdeas(b){
 const facts=activeFacts(b),v=id=>facts[id]?.value,site=siteFacts(b.land,b.facts),ideas=[];
 const add=(id,title,reason,actions,dependencies)=>ideas.push({id,title,reason,actions,key:JSON.stringify([id,dependencies])});
 if(site['@narrow']&&v('architecture.concept')===undefined)add('light-court','دراسة فناء داخلي لأرض عميقة','عمق الأرض أكبر من واجهتها؛ الفناء خيار للدراسة بدل تمديد الصالة. لا يثبت وحده الإنارة أو التهوية.',[{id:'architecture.concept',value:'courtyard'}],[b.land.widthM,b.land.depthM,b.land.entries]);
 if(site['@wide']&&v('architecture.concept')===undefined)add('living-wings','دراسة كتلة على شكل L','الواجهة العريضة تسمح بدراسة فصل جناح الضيافة عن النوم مع جلسة خارجية؛ القبول النهائي من هندسة الناتج.',[{id:'architecture.concept',value:'l_shape'}],[b.land.widthM,b.land.depthM,b.land.entries]);
 if(v('hospitality.men')===true&&v('hospitality.women')===true&&v('hospitality.maleEntry')===undefined&&v('privacy.familyEntry')===undefined)add('separate-hospitality','مدخلان ومساران للضيافة والعائلة','وجود مجلسين يجعل استقلال المسارات خيارًا مهمًا. سأطلبه من المحرك وأقيسه بالأبواب والمسارات المرسومة.',[{id:'hospitality.maleEntry',value:true},{id:'privacy.familyEntry',value:true}],[v('hospitality.men'),v('hospitality.women'),b.land.entries]);
 if(v('household.parents')&&v('household.parents')!=='none'&&b.land.floors>1&&v('parents.ground')===undefined)add('parents-ground','دراسة غرفة الوالدين في الأرضي','تُخصّص من إجمالي غرف النوم الذي حددته، ويُراجع قرب الحمام. سهولة الحركة الكاملة تحتاج فحص العتبات والتجهيزات.',[{id:'parents.ground',value:true}],[v('household.parents'),b.land.floors,v('household.bedrooms')]);
 return ideas;
}
