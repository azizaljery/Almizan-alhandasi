// A shared, slow day cycle; no network, permissions or project data.
export const CYCLE_MS=180000;
const frames=[
 [0,'الفجر','#35364f','#252c40','#f4eee5','#c4c9d4','#4a4657',.3,.12,.35,-35,-3],
 [.14,'شروق الشمس','#ead0ac','#fff8ec','#263c39','#59675e','#ddd0bb',1.15,1.8,.2,-32,8],
 [.38,'النهار','#e5ede8','#ffffff','#213b3a','#526864','#dce7df',1.85,3.4,.15,0,42],
 [.64,'غروب الشمس','#b78772','#3b3d43','#fff0df','#ddcec3','#6c5b55',.65,1.25,.24,35,5],
 [.79,'الليل','#16243c','#202e40','#edf1ed','#bdcad2','#3d5061',.3,0,.3,32,-16],
 [1,'الفجر','#35364f','#252c40','#f4eee5','#c4c9d4','#4a4657',.3,.12,.35,-35,-3]
];
const rgb=s=>s.slice(1).match(/../g).map(x=>parseInt(x,16));
const mix=(a,b,t)=>'#'+rgb(a).map((x,i)=>Math.round(x+(rgb(b)[i]-x)*t).toString(16).padStart(2,'0')).join('');
const lum=s=>rgb(s).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const readable=(ink,bg)=>contrast(ink,bg)>=4.5?ink:(contrast('#ffffff',bg)>contrast('#000000',bg)?'#ffffff':'#000000');
export function cycleState(phase){
 const p=Number.isFinite(phase)?((phase%1)+(phase<0?1:0))%1:0;let i=0;while(i<frames.length-2&&p>=frames[i+1][0])i++;
 const a=frames[i],b=frames[i+1],v=(p-a[0])/(b[0]-a[0]),t=v*v*(3-2*v);
 const lerp=k=>a[k]+(b[k]-a[k])*t;
 const sky=mix(a[2],b[2],t),surface=mix(a[3],b[3],t),ink=mix(a[4],b[4],t);
 return {phase:p,name:a[1],sky,surface,ink:readable(ink,surface),skyInk:readable(ink,sky),muted:readable(mix(a[5],b[5],t),surface),line:mix(a[6],b[6],t),hemi:lerp(7),sun:lerp(8),fill:lerp(9),sunX:lerp(10),sunY:lerp(11),night:1-Math.min(1,lerp(8)/1.4)};
}
let singleton;
export function ambientCycle(){
 if(singleton)return singleton;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,subs=new Set();
 let start=performance.now(),offset=0,paused=reduced,frozen=reduced?.38:0,last=0,raf=0,state=cycleState(frozen),lastCSS=0;
 try{const saved=JSON.parse(sessionStorage.getItem('mizan.ambient.clock')||'null');if(saved&&Number.isFinite(saved.phase)&&Number.isFinite(saved.at)){paused=reduced||saved.paused===true;offset=paused?saved.phase:(saved.phase+(Date.now()-saved.at)/CYCLE_MS)%1;frozen=reduced?.38:offset;state=cycleState(frozen)}}catch{}
 const phase=()=>paused?frozen:((performance.now()-start)/CYCLE_MS+offset)%1;
 const paint=force=>{
  state=cycleState(phase());const now=performance.now();
  if(force||now-lastCSS>180){
   lastCSS=now;const s=document.body.style;
   for(const key of['sky','surface','ink','skyInk','muted','line'])s.setProperty('--ambient-'+key,state[key]);
   s.setProperty('--ambient-night',String(state.night));
   s.setProperty('--ambient-sun-x',(12+(state.sunX+35)/70*76)+'%');
   s.setProperty('--ambient-sun-y',(64-Math.max(0,state.sunY))+'%');
   s.setProperty('--ambient-sun-opacity',String(Math.min(1,Math.max(0,state.sunY)/6)));
   document.body.dataset.ambient='on';document.body.dataset.ambientPhase=state.name;
   document.querySelectorAll('[data-ambient-label]').forEach(e=>e.textContent=state.name);
  }
  for(const fn of subs)fn(state,reduced);
 };
 const tick=now=>{if(!paused&&now-last>1000/15){last=now;paint(false)}if(!paused&&!document.hidden)raf=requestAnimationFrame(tick)};
 const run=()=>{cancelAnimationFrame(raf);paint(true);if(!paused&&!document.hidden)raf=requestAnimationFrame(tick)};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAnimationFrame(raf);else run()});
 addEventListener('pagehide',()=>{try{sessionStorage.setItem('mizan.ambient.clock',JSON.stringify({phase:phase(),paused,at:Date.now()}))}catch{}});
 singleton={subscribe(fn){subs.add(fn);fn(state,reduced);return()=>subs.delete(fn)},seek(p){offset=p>=0?p%1:((p%1)+1)%1;start=performance.now();frozen=offset;paint(true)},pause(){frozen=phase();paused=true;cancelAnimationFrame(raf);paint(true)},resume(){offset=frozen;start=performance.now();paused=false;run()},get paused(){return paused},get state(){return state},get reduced(){return reduced}};
 run();return singleton;
}
