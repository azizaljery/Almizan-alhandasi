import { ambientCycle } from './ambient-cycle.mjs';
// Navigation only: existing project rendering, events and approval remain owned by the app.
const body=document.body;
if(body.classList.contains('mizan-review')&&!document.querySelector('.mz-review-sidebar')){
 const current=location.pathname.split('/').pop().replace(/\.html$/,'')||'home';
 const pages=[['home','الرئيسية','M3 11 12 3l9 8M5 10v11h14V10M10 21v-7h4v7'],['design','المخطط','M3 3h18v18H3zM3 11h18M11 3v18M11 16h10'],['view3d','ثلاثي الأبعاد','m12 2 10 5v10l-10 5-10-5V7zM2 7l10 5 10-5M12 12v10'],['final','المخرجات','M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h8']];
 const side=document.createElement('aside');side.className='mz-review-sidebar';side.setAttribute('aria-label','مراحل مشروع الميزان الهندسي');
 const brand=document.createElement('a');brand.className='mz-review-brand';brand.href='./home.html';
 const logo=document.createElement('img');logo.src='./assets/mizan-logo.svg';logo.alt='';
 const identity=document.createElement('span');const name=document.createElement('strong');name.textContent='الميزان الهندسي';const sub=document.createElement('small');sub.textContent='مساحة تصميم منزلك';identity.append(name,sub);brand.append(logo,identity);
 const nav=document.createElement('nav');nav.className='mz-review-nav';
 for(const [id,label,path] of pages){
  const a=document.createElement('a');a.href='./'+id+'.html';if(current===id)a.setAttribute('aria-current','page');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path);svg.append(p);
  const text=document.createElement('span');text.textContent=label;a.append(svg,text);nav.append(a);
 }
 const note=document.createElement('p');note.className='mz-review-sidebar-note';note.textContent='من متطلباتك إلى المخطط، ثم العرض ثلاثي الأبعاد ومخرجات مشروعك.';
 side.append(brand,nav,note);body.prepend(side);
}

const cycle=ambientCycle();
const motion=document.createElement('button');motion.type='button';motion.className='ambient-motion';
const setMotionLabel=()=>{motion.textContent=cycle.paused?'تشغيل الحركة':'إيقاف الحركة';motion.setAttribute('aria-pressed',String(cycle.paused));body.dataset.ambientPaused=String(cycle.paused)};
setMotionLabel();motion.addEventListener('click',()=>{if(cycle.paused)cycle.resume();else cycle.pause();setMotionLabel()});
body.append(motion);
