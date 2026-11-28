import { bank, questionById, validate, gateMatches } from './core.mjs';
import { normalizeAr } from '../requirements.mjs';
import { capability } from './capabilities.mjs';
const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
const labelValue=(q,value)=>q?.options.find(o=>o.value===value)?.label??String(value);
const button=(text,handler,className='sv3-button')=>{const b=node('button',text,className);b.type='button';b.addEventListener('click',handler);return b;};
const names={household:'الأسرة',children:'الأبناء',parents:'الوالدان',hospitality:'الضيافة',site:'الموقع',privacy:'الخصوصية',daily:'الحياة اليومية',services:'الخدمات',sleep:'النوم',living:'المعيشة',environment:'البيئة',garden:'الحوش',future:'المستقبل',architecture:'الطابع',budget:'الميزانية'};
export function renderAdaptiveTurn(packet,{answer,onGenerate}){
 const root=node('section',null,'sv3');root.id='sharaaV3';root.setAttribute('aria-label','مقابلة شرعاء المعمارية المتكيفة');
 const head=node('div',null,'sv3-head');head.append(node('strong','شرعاء V3'),node('span',`${packet.readiness.answered} إجابة مؤكدة`));root.append(head);
 const env=packet.projection.environment;
 if(env.cityName){const place=node('p',`${env.cityName} · ${packet.brief.land.widthM} × ${packet.brief.land.depthM} م · ${packet.brief.land.streets.length} جهة شارع`,'sv3-context');root.append(place);}
 const fire=(id,value,label)=>answer(id,value,label);
 const depthLabel=node('label','تفاصيل المقابلة','sv3-priority'),depth=node('select');depth.setAttribute('aria-label','تفاصيل المقابلة');
 for(const[value,label]of [['core','القرارات الأساسية'],['standard','الاحتياجات المعتادة'],['full','تفاصيل معمارية موسعة']]){const option=node('option',label);option.value=value;option.selected=value===packet.depth;depth.append(option);}depth.addEventListener('change',()=>fire('v3.depth',depth.value));depthLabel.append(depth);root.append(depthLabel);
 if(packet.proposals.length){
  const box=node('section',null,'sv3-proposals');box.append(node('h3','هذا ما فهمته من وصفك — أكّده أو صحّحه'));
  for(const p of packet.proposals){const q=questionById(p.id),row=node('div',null,'sv3-proposal');const before=packet.brief.facts[p.id];
   row.append(node('span',q.text),node('b',(before?labelValue(q,before.value)+' ← ':'')+labelValue(q,p.value)));if(p.priority==='mandatory')row.append(node('small','شرط أساسي من صيغة وصفك؛ راجعه قبل الاعتماد.'));
   if(!validate(q,p.value))row.append(node('small','القيمة خارج المدى المتاح؛ عدّل الإجابة أو استبعد هذا الفهم.'));
   row.append(button('اعتماد',()=>fire('v3.confirm',p.id,'أكدت: '+q.text+' '+labelValue(q,p.value))),button('استبعاد',()=>fire('v3.reject',p.id,'استبعدت هذا الفهم.')));box.append(row);
  }
  box.append(button('اعتماد جميع النقاط الظاهرة',()=>fire('v3.confirm','all','اعتماد الفهم المعروض.'),'sv3-button primary'));root.append(box);
 }
 const q=packet.question;
 if(q?.kind==='conflict'){
  const box=node('section',null,'sv3-conflict');box.setAttribute('role','alert');box.dataset.conflict=q.id;box.append(node('h3','لنحسم هذين القرارين أولًا'),node('p',q.reason));
  for(const id of q.fields)box.append(button('تعديل: '+questionById(id).text,()=>fire('v3.focus',id)));root.append(box);
 }else if(q){
  const card=node('section',null,'sv3-question');card.dataset.question=q.id;
  const title=node('h3',q.text);title.id='sv3-question-title';card.append(title,node('p',q.reason,'sv3-why'));
  const previous=packet.brief.facts[q.id];
  if(previous){card.append(node('p',(previous.recheck?'تحتاج هذه الإجابة مراجعتك بعد التغيير: ':previous.verification==='needs_confirmation'?'هذا فهم مقترح يحتاج تأكيدك: ':'إجابتك الحالية: ')+labelValue(q,previous.value),'sv3-previous'));}
  const form=node('form');form.setAttribute('aria-labelledby',title.id);
  let priority=previous?.priority||q.defaultPriority;
  if(capability(q.id,previous?.value).mode!=='context'){
   const label=node('label','أهمية القرار','sv3-priority'),select=node('select');select.setAttribute('aria-label','أهمية القرار');
   for(const[value,text]of[['mandatory','شرط أساسي'],['preferred','تفضيل مهم'],['flexible','قابل للتفاوض']]){const option=node('option',text);option.value=value;option.selected=value===priority;select.append(option);}select.addEventListener('change',()=>{priority=select.value;});label.append(select);form.append(label);
  }
  const submit=value=>fire('v3.answer',{id:q.id,value,priority},q.text+' '+labelValue(q,value));
  if(q.options.length){const picks=node('div',null,'sv3-picks');for(const option of q.options){const b=button(option.label,()=>submit(option.value));b.dataset.answer=String(option.value);b.setAttribute('aria-pressed',String(previous?.value===option.value));picks.append(b);}form.append(picks);}
  else{
   const input=node(q.type==='t'?'textarea':'input');input.name='answer';input.setAttribute('aria-label',q.text);input.required=true;
   if(q.type!=='t'){input.type='text';input.inputMode=q.type==='decimal'?'decimal':'numeric';input.autocomplete='off';input.pattern=q.type==='decimal'?'[0-9٠-٩۰-۹.,٫]+':'[0-9٠-٩۰-۹]+';input.placeholder=q.min!=null?`من ${q.min} إلى ${q.max}`:'اكتب العدد';}
   else{input.maxLength=2000;input.rows=3;}
   if(previous)input.value=String(previous.value);form.append(input);
   const next=node('button','تأكيد ومتابعة','sv3-button primary');next.type='submit';form.append(next);
   form.addEventListener('submit',event=>{event.preventDefault();const raw=input.value.trim();const value=q.type==='t'?raw:Number(normalizeAr(raw).replace(/[٫,]/g,'.'));if(!raw||!validate(q,value)){input.setCustomValidity(q.type==='t'?'اكتب إجابة واضحة.':`أدخل قيمة بين ${q.min??0} و${q.max??100}.`);input.reportValidity();return;}input.setCustomValidity('');submit(value);});
   input.addEventListener('input',()=>input.setCustomValidity(''));
  }
  if(packet.canSkip)form.append(button('أقرر لاحقًا',()=>fire('v3.defer',q.id,'أؤجل هذا السؤال.')));card.append(form);root.append(card);
 }
 if(packet.readiness.limits.length){
  const box=node('section',null,'sv3-limits');box.append(node('h3','نقاط تحتاج مراجعة المهندس'));
  const accepted=new Set(packet.brief.acknowledged.filter(a=>a.revision===packet.brief.revision).map(a=>a.id));
  const selected=new Set(accepted);
  for(const id of packet.readiness.limits){const f=packet.brief.facts[id],label=node('label',null,'sv3-limit'),cb=node('input');cb.type='checkbox';cb.value=id;cb.disabled=f.priority==='mandatory';cb.checked=accepted.has(id);cb.addEventListener('change',()=>cb.checked?selected.add(id):selected.delete(id));
   label.append(cb,node('span',questionById(id).text+' '+labelValue(questionById(id),f.value)+(cb.disabled?' — شرط أساسي لا يمكن تجاوزه.':' — يوثّق في طلبك ولا يُعد تنفيذه مثبتًا.')),button('تعديل',()=>fire('v3.focus',id)));box.append(label);
  }
  if(packet.readiness.limits.some(id=>!packet.readiness.hard.includes(id)))box.append(button('متابعة مع توثيق النقاط المحددة للمراجعة',()=>fire('v3.acknowledge',[...selected],'قبول توثيق النقاط المحددة للمراجعة دون اعتبارها منفذة.')));root.append(box);
 }
 if(packet.ideas?.length){const ideas=node('details',null,'sv3-ideas');ideas.append(node('summary','خيارات معمارية تناسب سياقك'));for(const idea of packet.ideas){const row=node('section');row.append(node('h3',idea.title),node('p',idea.reason),button('أعتمد دراسة هذا الخيار',()=>fire('v3.idea',idea.id,'اعتمدت دراسة: '+idea.title)),button('لا يناسبني',()=>fire('v3.declineIdea',idea.id,'لا يناسبني: '+idea.title)));ideas.append(row);}root.append(ideas);}
 const summary=node('details',null,'sv3-summary');summary.append(node('summary','ملخص إجاباتك وتعديلها'));
 for(const row of packet.projection.ledger){const line=node('div',null,'sv3-fact');line.append(node('span',row.label),node('b',row.valueLabel),node('small',row.mode==='context'?'معلومة توجه الأسئلة':row.status==='requires_review'?'تحتاج مراجعة متخصصة':'طلب يُراجع على المخطط'),button('تعديل',()=>fire('v3.focus',row.id)),button('إلغاء هذا القرار',()=>fire('v3.remove',row.id,'ألغيت قراري: '+row.label)));summary.append(line);}root.append(summary);
 const domains=node('details',null,'sv3-domains');domains.append(node('summary','اختر محورًا لمزيد من التفاصيل'));
 const known=new Set();for(const question of bank){if(known.has(question.domain))continue;known.add(question.domain);const target=bank.find(q=>q.domain===question.domain&&!packet.brief.facts[q.id]&&gateMatches(q.gate,packet.brief));if(target)domains.append(button(names[question.domain],()=>fire('v3.focus',target.id)));}root.append(domains);
 const intake=node('details',null,'sv3-intake');intake.append(node('summary','أضف وصفًا أو تعديلًا بكلامك'));
 const form=node('form'),text=node('textarea');text.maxLength=4000;text.rows=3;text.setAttribute('aria-label','وصف احتياجاتك أو تعديلها');text.placeholder='مثال: أمي تسكن معنا، وعندي ولدين، وأريد أربع غرف نوم إجمالًا ومطبخًا مغلقًا';
 const send=node('button','راجعي ما فهمتِه','sv3-button');send.type='submit';form.append(text,send);form.addEventListener('submit',e=>{e.preventDefault();fire('v3.free',text.value,text.value);});intake.append(form);root.append(intake);
 const foot=node('div',null,'sv3-generate');const generate=button('توليد التصميم وفق الإجابات المؤكدة',onGenerate,'sv3-button primary');generate.id='sv3Generate';generate.disabled=!packet.readiness.canGenerate;foot.append(generate,node('p',packet.readiness.canGenerate?'الأساس جاهز. يمكنك التوليد الآن أو إكمال التفاصيل؛ النتيجة تُفحص هندسيًا قبل عرضها.':packet.readiness.missing.length?`بقي ${packet.readiness.missing.length} من القرارات الأساسية قبل التوليد.`:'احسم التعارضات والتأكيدات والنقاط الإلزامية قبل التوليد.'));root.append(foot);
 return root;
}

// Retain the previous standalone prototype for integrations that import it.
export {mountAdaptive} from './prototype-ui.mjs';
