import {bank,createBrief,answer,nextQuestion,readiness,defer,reviseLand,ingest,gateMatches} from './core.mjs';
import {parseFree,qualityReview} from './quality.mjs';
import {previewProjection} from './native-bridge.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
export function mountAdaptive(host,land,nativeBrief,{onClose}={}){
 let b=createBrief(land),editing=null,notice='',original=[],projection=null,quality=null;
 const qBy=id=>bank.find(q=>q.id===id);
 const btn=(text,fn,cls='chip')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',()=>{try{fn()}catch(e){notice=e.message;draw()}});return n};
 function draw(){host.replaceChildren();host.append(el('h3','شرعاء V3 — مقابلة معمارية تجريبية'),el('p','أرضك موروثة من المرحلة السابقة. الأسئلة تتغير حسب إجاباتك. لا يُعتمد أي شرط غير مثبت في المحرك.','hint'));
 if(notice)host.append(el('p',notice,'hint'));
 const free=el('textarea');free.placeholder='صف احتياجاتك بطريقتك';free.setAttribute('aria-label','وصف المنزل');
 host.append(free,btn('فهم الوصف',()=>{const p=parseFree(free.value);original.push(p.originalText);const r=ingest(b,p.proposals);b=r.brief;notice='استخرجت '+p.proposals.length+' معلومة تحتاج تأكيدك. النص الأصلي محفوظ؛ ما لم أفهمه لا يُفترض.'+(p.ambiguous.length?' توجد أعداد متعارضة.':'');projection=null;draw()}));
 const r=readiness(b);host.append(el('p','المعلومات المسجلة: '+Object.keys(b.facts).length+' · الأسئلة الأساسية المتبقية: '+r.missing.length,'hint'));
 const q=editing?qBy(editing):nextQuestion(b);
 if(q?.kind==='conflict'){host.append(el('p',q.reason,'error'));for(const id of q.fields)host.append(btn('تعديل: '+qBy(id).text,()=>{editing=id;draw()}))}
 else if(q){const f=b.facts[q.id];host.append(el('h4',q.text));if(f)host.append(el('p','القيمة السابقة: '+String(f.value)+(f.recheck?' — تحتاج مراجعة':' — أكدها أو عدلها'),'hint'));
 const priority=el('select');priority.setAttribute('aria-label','أولوية الطلب');for(const [v,t] of [['preferred','تفضيل'],['mandatory','إلزامي'],['flexible','مرن']]){const o=el('option',t);o.value=v;priority.append(o)}priority.value=f?.priority||'preferred';
 const submit=v=>{b=answer(b,q.id,v,{source:'client_confirmed',priority:priority.value,revise:!!f,evidence:f?.evidence||q.text});editing=null;projection=null;notice='تم تسجيل قرارك';draw()};
 host.append(priority);
 const opts=q.options||(q.type==='b'?[{value:true,label:'نعم'},{value:false,label:'لا'}]:q.type.includes('|')?q.type.split('|').map(value=>({value,label:value})):[]);
 if(opts.length){const wrap=el('div',undefined,'pick');for(const o of opts)wrap.append(btn(o.label,()=>submit(o.value)));host.append(wrap)}else{const form=el('form',undefined,'free'),i=el('input');i.type=['n','decimal'].includes(q.type)?'number':'text';i.required=true;i.min='0';i.step=q.type==='decimal'?'any':'1';i.setAttribute('aria-label',q.text);if(f)i.value=f.value;const go=el('button','تأكيد','cta');go.type='submit';form.append(i,go);form.addEventListener('submit',e=>{e.preventDefault();try{submit(i.type==='number'?i.valueAsNumber:i.value)}catch(err){notice=err.message;draw()}});host.append(form)}
 if(q.tier!==1&&f?.priority!=='mandatory')host.append(btn('لاحقًا',()=>{b=defer(b,q.id);editing=null;draw()}));
 }else host.append(el('p','انتهت الأسئلة المتاحة وفق إجاباتك.'));
 const review=el('details');review.append(el('summary','ملف القرارات وتعديل الإجابات'));for(const [id,f] of Object.entries(b.facts)){const row=el('div');row.append(el('p',qBy(id).text+' — '+String(f.value)+(f.recheck?' (مراجعة مطلوبة)':'')));if(gateMatches(qBy(id).gate,b))row.append(btn('تعديل',()=>{editing=id;draw()}));review.append(row)}host.append(review);
 host.append(btn('مراجعة التوافق مع المحرك',()=>{projection=previewProjection(b,nativeBrief);draw()},'cta ghost'));
 if(projection){host.append(el('p','بنود مرسلة للمحوّل: '+projection.sent.length+' · غير مرسلة: '+projection.withheld.length));for(const id of projection.withheld)host.append(el('p','غير مطبق: '+qBy(id).text,'hint'));for(const item of projection.engineInput.blockers||[])host.append(el('p',item.text_ar||item.type,'error'));host.append(el('p','هذه معاينة للعقد وليست تصريحًا بالتوليد.','hint'))}
 const evidence=el('input');evidence.type='file';evidence.accept='.json,application/json';evidence.setAttribute('aria-label','ملف أدلة هندسية JSON');evidence.addEventListener('change',async()=>{try{const f=evidence.files[0];if(!f||f.size>1000000)throw Error('ملف غير صالح أو كبير');quality=qualityReview(JSON.parse(await f.text()));notice='تم تحليل البيانات المدخلة؛ لم يتحقق النظام من مصدرها.';draw()}catch(e){notice=e.message;draw()}});host.append(el('h4','مراجعة جودة التصميم من ملف أدلة'),el('p','تجريبية: لا تعتمد على صورة أو على قياسات غير موثقة.','hint'),evidence);if(quality)for(const f of quality.findings)host.append(el('p',f.id+' — '+f.status+' — '+f.reason));
 host.append(btn('تصدير ملف المقابلة',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({brief:b,originalText:original,readiness:r},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='sharaa-v3-brief.json';a.click();URL.revokeObjectURL(url)}),btn('العودة إلى شرعاء الحالي',()=>onClose?.()));
 }
 draw();return {snapshot:()=>structuredClone(b),changeLand:(l,n)=>{b=reviseLand(b,l);nativeBrief=n;projection=null;quality=null;draw()}};
}
