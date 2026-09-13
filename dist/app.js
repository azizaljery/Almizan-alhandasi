/* الميزان الهندسي — السلوك التفاعلي */
let _id = 1;
const nid = () => 'e' + (_id++);

const APP = {
  plot: {
    length: 30, width: 20,
    streets: { n:null, s:{w:15,name:'الشارع الرئيسي'}, e:null, w:null },
    direction: 'n', style: 'resort', layout: 'privacy',
    rooms: { bedrooms:2, menMajlis:1, womenMajlis:1, familyHall:1, dining:1, kitchen:1, baths:5, motherSuite:1, stairs:1, floors:2 },
    extras: { maid:false, driver:false, storage:false, accessible:false }
  },
  model: { walls:[], openings:[], blocks:[], zones:[] },
  ui: { tool:'select', snap:.5, showGrid:true, selected:null, zoom:1, offset:{x:0,y:0}, sunHour:10, sunMonth:6, cat:'furniture', planVariant:0 },
  history: [], historyIdx: -1,
  prices: { block:2.5, cement:14, sand:350, rebar:3.5, paint:12, door:800, window:1200, masonLabor:25, plasterLabor:18, paintLabor:10 },
  waste: .07, vat: .15
};

const LIB = {
  furniture: { sofa:{n:'كنبة',w:2.2,h:.9}, table:{n:'طاولة',w:1.6,h:.9}, tv:{n:'تلفاز',w:1.4,h:.15}, rug:{n:'سجادة',w:2.4,h:1.2}, stairs:{n:'درج',w:2.6,h:3.2} },
  kitchen: { sink:{n:'حوض',w:.8,h:.5}, stove:{n:'موقد',w:.6,h:.55}, fridge:{n:'ثلاجة',w:.7,h:.7} },
  bath: { toilet:{n:'مرحاض',w:.55,h:.7}, basin:{n:'مغسلة',w:.6,h:.45}, shower:{n:'دش',w:1.2,h:1} },
  bed: { single:{n:'سرير فردي',w:1,h:2}, double:{n:'سرير مزدوج',w:1.6,h:2}, wardrobe:{n:'خزانة',w:2,h:.6} },
  outdoor: { pool:{n:'مسبح',w:5,h:3}, tree:{n:'شجرة',w:1.5,h:1.5}, umbrella:{n:'مظلة',w:2,h:2} }
};

function findDef(type){
  for (const group of Object.values(LIB)) if (group[type]) return group[type];
  return null;
}
function plotArea(){ return APP.plot.length * APP.plot.width; }
function setbackFor(side){
  const street = APP.plot.streets[side];
  if (!street) return 1.5;
  return street.w < 30 ? Math.max(2,street.w/5) : 6;
}
function computeFootprint(){
  const L=APP.plot.length, W=APP.plot.width;
  const sb={n:setbackFor('n'),s:setbackFor('s'),e:setbackFor('e'),w:setbackFor('w')};
  const x0=sb.w,y0=sb.s,x1=W-sb.e,y1=L-sb.n;
  const aw=Math.max(0,x1-x0), ah=Math.max(0,y1-y0);
  const maxA=L*W*.75, availA=aw*ah, usable=Math.min(availA,maxA);
  const scale=availA>0?Math.sqrt(Math.max(0,usable)/availA):0;
  const bw=aw*scale,bh=ah*scale;
  return {x:x0+(aw-bw)/2,y:y0+(ah-bh)/2,w:bw,h:bh,sb:sb,maxA:maxA,availA:availA,usable:usable};
}
function computeRating(){
  const fp=computeFootprint(), area=plotArea();
  const streets=Object.values(APP.plot.streets).filter(Boolean).length;
  const eff=Math.min(100,(fp.usable/area/.75)*100);
  const avg=(fp.sb.n+fp.sb.s+fp.sb.e+fp.sb.w)/4;
  const setback=Math.max(0,Math.min(100,100-(avg-3)*12));
  const light=Math.min(100,40+streets*15);
  const privacy=Math.min(100,50+((fp.sb.e+fp.sb.w)/2)*10);
  const flexibility=Math.min(100,40+area/20);
  const total=Math.round(eff*.25+setback*.2+light*.2+privacy*.15+flexibility*.2);
  const grade=total>=88?'A':total>=75?'B':total>=60?'C':total>=45?'D':'F';
  return {grade:grade,total:total,bars:[
    {name:'الاستغلال',val:Math.round(eff)},
    {name:'الارتدادات',val:Math.round(setback)},
    {name:'الإضاءة',val:Math.round(light)},
    {name:'الخصوصية',val:Math.round(privacy)},
    {name:'المرونة',val:Math.round(flexibility)}
  ]};
}
function gradeTitle(g){
  return {A:'أرض ممتازة — استغلال كامل',B:'أرض جيدة — إمكانات عالية',C:'أرض متوسطة — تحتاج تخطيطاً ذكياً',D:'أرض محدودة — تحتاج تنازلات',F:'أرض صعبة — يُنصح بمراجعة الاختيار'}[g] || 'تقييم';
}
function getSun(hour,month){
  const day=[31,59,90,120,151,181,212,243,273,304,334,365][month-1];
  const d=23.45*Math.sin((360/365)*(day-81)*Math.PI/180), lat=24.71, ha=(hour-12)*15;
  const sinE=Math.sin(lat*Math.PI/180)*Math.sin(d*Math.PI/180)+Math.cos(lat*Math.PI/180)*Math.cos(d*Math.PI/180)*Math.cos(ha*Math.PI/180);
  const elev=Math.asin(Math.max(-1,Math.min(1,sinE)))*180/Math.PI;
  const cosA=(Math.sin(d*Math.PI/180)-Math.sin(lat*Math.PI/180)*sinE)/(Math.cos(lat*Math.PI/180)*Math.cos(elev*Math.PI/180));
  let az=Math.acos(Math.max(-1,Math.min(1,cosA)))*180/Math.PI;
  if(ha>0) az=360-az;
  return {elev:elev,az:az};
}

/* نماذج الأرض */
const CTR=[
  {k:'bedrooms',n:'غرف نوم الأبناء',s:'تُوزّع في جناح هادئ',min:0,max:6},
  {k:'motherSuite',n:'جناح الوالدة',s:'غرفة وجلسة قريبة من العائلة',min:0,max:1},
  {k:'menMajlis',n:'مجلس الرجال',s:'مدخل وبهو مستقلان',min:0,max:2},
  {k:'womenMajlis',n:'مجلس النساء',s:'مدخل وبهو خاصان',min:0,max:2},
  {k:'familyHall',n:'الصالة العائلية',s:'القلب الرابط للمنزل',min:0,max:2},
  {k:'dining',n:'صالة الطعام',s:'بين الضيافة والمطبخ',min:0,max:2},
  {k:'kitchen',n:'المطابخ',s:'تُربط بالخدمة والطعام',min:0,max:2},
  {k:'baths',n:'دورات المياه',s:'للضيافة والجناح الخاص',min:0,max:8},
  {k:'stairs',n:'السلالم',s:'عند تعدد الأدوار',min:0,max:2}
];
const EXT=[{k:'maid',n:'غرفة خادمة',s:'مع حمام'},{k:'driver',n:'غرفة سائق',s:'مدخل منفصل'},{k:'storage',n:'مستودع',s:'قريب من المطبخ'},{k:'accessible',n:'الوصول الشامل',s:'ممرات أوسع'}];

function renderForm(){
  const len=document.getElementById('inLen'),wid=document.getElementById('inWid');
  if(len) len.value=APP.plot.length;
  if(wid) wid.value=APP.plot.width;
  const dir=document.getElementById('inDirection'),floors=document.getElementById('inFloors');
  if(dir) dir.value=APP.plot.direction;
  if(floors) floors.value=APP.plot.rooms.floors;
  updateArea(); renderStreets(); renderCounters(); renderExtras(); updateRating();
}
function updateArea(){
  const el=document.getElementById('outArea');
  if(el) el.textContent=Math.round(plotArea()).toLocaleString('ar-SA')+' م²';
}
function renderStreets(){
  document.querySelectorAll('.street').forEach(function(card){
    const st=APP.plot.streets[card.dataset.side];
    card.classList.toggle('on',!!st);
    const name=card.querySelector('.st-n'), width=card.querySelector('.st-w');
    name.disabled=!st;width.disabled=!st;
    if(st){name.value=st.name||'';width.value=st.w||15;}
  });
}
function updateRating(){
  const r=computeRating(), letter=document.getElementById('ratingLetter');
  if(!letter) return;
  letter.textContent=r.grade;letter.dataset.grade=r.grade;
  document.getElementById('ratingTitle').textContent=gradeTitle(r.grade)+' — '+r.total+'/100';
  document.getElementById('ratingDesc').textContent='تقييم آلي حسب نسبة الاستغلال، الارتدادات، الإضاءة، الخصوصية، والمرونة.';
  document.getElementById('ratingBars').innerHTML=r.bars.map(function(b){
    return '<div class="rating-bar-row"><span>'+b.name+'</span><div class="rating-bar"><div class="rating-bar-fill" style="width:'+b.val+'%;background:linear-gradient(90deg,#e0b25e,#4fd8d0)"></div></div><span>'+b.val+'</span></div>';
  }).join('');
}
function renderCounters(){
  const box=document.getElementById('counters'); if(!box) return;
  box.innerHTML=CTR.map(function(c){
    return '<div class="counter"><div class="lbl">'+c.n+'<small>'+c.s+'</small></div><div class="stepper"><button aria-label="إنقاص '+c.n+'" data-k="'+c.k+'" data-a="dec">−</button><span class="v" id="v_'+c.k+'">'+APP.plot.rooms[c.k]+'</span><button aria-label="زيادة '+c.n+'" data-k="'+c.k+'" data-a="inc">+</button></div></div>';
  }).join('');
  box.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){
      const k=b.dataset.k,def=CTR.find(function(c){return c.k===k;}),min=def.min,max=def.max||20;
      APP.plot.rooms[k]=b.dataset.a==='inc'?Math.min(max,APP.plot.rooms[k]+1):Math.max(min,APP.plot.rooms[k]-1);
      document.getElementById('v_'+k).textContent=APP.plot.rooms[k];
    });
  });
}

function readIdea(){
  const input=document.getElementById('ideaInput');
  const text=(input&&input.value||'').trim();
  if(!text){warn('اكتب فكرة المنزل أولاً');return;}
  const has=function(pattern){return pattern.test(text);};
  const r=APP.plot.rooms;
  if(has(/رجال|مجلس\s*رجال/)) r.menMajlis=Math.max(1,r.menMajlis);
  if(has(/نساء|حريم|مجلس\s*نساء/)) r.womenMajlis=Math.max(1,r.womenMajlis);
  if(has(/صالة|معيشة|عائل/)) r.familyHall=Math.max(1,r.familyHall);
  if(has(/طعام|مقلط|سفرة/)) r.dining=Math.max(1,r.dining);
  if(has(/مطبخ/)) r.kitchen=Math.max(1,r.kitchen);
  if(has(/والد[ةه]|أم|امي|والدتي/)) r.motherSuite=Math.max(1,r.motherSuite);
  if(has(/درج|مصعد|دورين|دورين/)) r.stairs=Math.max(1,r.stairs);
  if(has(/مستودع|تخزين/)) APP.plot.extras.storage=true;
  if(has(/خادمة|عاملة/)) APP.plot.extras.maid=true;
  if(has(/مدخلين|مدخلين|مداخل مستقلة|مدخل مستقل|خصوص/)) APP.plot.layout='privacy';
  if(has(/فناء|حديقة وسط/)) APP.plot.layout='courtyard';
  if(has(/ضيافة مستقلة|فصل الضيوف/)) APP.plot.layout='separate';
  const arabicDigits={'٠':0,'١':1,'٢':2,'٣':3,'٤':4,'٥':5,'٦':6,'٧':7,'٨':8,'٩':9};
  const normalized=text.replace(/[٠-٩]/g,function(d){return arabicDigits[d];});
  const roomMatch=normalized.match(/(\d+)\s*(?:غرف|غرفة)/);
  if(roomMatch) r.bedrooms=Math.max(0,Math.min(6,Number(roomMatch[1])));
  document.querySelectorAll('#styleGrid .vs').forEach(function(v){v.classList.toggle('on',v.dataset.key===APP.plot.layout);});
  renderCounters();renderExtras();toast('تم فهم عناصر الفكرة وتعبئة البرنامج');
}
function renderExtras(){
  const box=document.getElementById('extras');if(!box)return;
  box.innerHTML=EXT.map(function(e){
    return '<div class="tg '+(APP.plot.extras[e.k]?'on':'')+'" data-ex="'+e.k+'"><div class="sw"></div><div><b>'+e.n+'</b><small>'+e.s+'</small></div></div>';
  }).join('');
  box.querySelectorAll('.tg').forEach(function(t){
    t.addEventListener('click',function(){const k=t.dataset.ex;APP.plot.extras[k]=!APP.plot.extras[k];t.classList.toggle('on');});
  });
}
function renderLib(){
  const box=document.getElementById('blocksGrid'),lib=LIB[APP.ui.cat];if(!box||!lib)return;
  box.innerHTML=Object.entries(lib).map(function(entry){return '<div class="bk" data-type="'+entry[0]+'"><b>'+entry[1].n+'</b></div>';}).join('');
  box.querySelectorAll('.bk').forEach(function(el){el.addEventListener('click',function(){addBlock(el.dataset.type);});});
}

/* محرر 2D */
const PX=30;
let stage,L_bg,L_gr,L_z,L_w,L_bk,L_op;
const m2px=function(x){return x*PX*APP.ui.zoom+APP.ui.offset.x;};
const m2py=function(y){return stage.height()-(y*PX*APP.ui.zoom+APP.ui.offset.y);};
const px2m=function(x){return (x-APP.ui.offset.x)/(PX*APP.ui.zoom);};
const px2my=function(y){return (stage.height()-y-APP.ui.offset.y)/(PX*APP.ui.zoom);};
const m2l=function(l){return l*PX*APP.ui.zoom;};

function initStage(){
  if(stage||!window.Konva) return;
  stage=new Konva.Stage({container:'stage',width:800,height:600});
  L_bg=new Konva.Layer({listening:false});L_gr=new Konva.Layer({listening:false});L_z=new Konva.Layer({listening:false});L_w=new Konva.Layer();L_bk=new Konva.Layer();L_op=new Konva.Layer();
  stage.add(L_bg,L_gr,L_z,L_w,L_bk,L_op);
  stage.on('wheel',function(e){
    e.evt.preventDefault();const p=stage.getPointerPosition();if(!p)return;
    const mp={x:px2m(p.x),y:px2my(p.y)},dir=e.evt.deltaY>0?-1:1;
    APP.ui.zoom=Math.max(.2,Math.min(4,APP.ui.zoom*(dir>0?1.1:.9)));
    APP.ui.offset.x=p.x-mp.x*PX*APP.ui.zoom;APP.ui.offset.y=(stage.height()-p.y)-mp.y*PX*APP.ui.zoom;drawAll();
  });
  let pan=false,panStart=null,drawStart=null;
  stage.on('mousedown',function(e){
    if(e.evt.button===1||e.evt.shiftKey){pan=true;panStart={x:e.evt.clientX,y:e.evt.clientY,ox:APP.ui.offset.x,oy:APP.ui.offset.y};return;}
    if(APP.ui.tool==='wall'){
      const p=stage.getPointerPosition();if(!p)return;
      drawStart={x:Math.round(px2m(p.x)/APP.ui.snap)*APP.ui.snap,y:Math.round(px2my(p.y)/APP.ui.snap)*APP.ui.snap};
    }
  });
  stage.on('touchstart',function(){
    if(APP.ui.tool!=='wall')return;const p=stage.getPointerPosition();if(!p)return;
    drawStart={x:Math.round(px2m(p.x)/APP.ui.snap)*APP.ui.snap,y:Math.round(px2my(p.y)/APP.ui.snap)*APP.ui.snap};
  });
  function finishWall(){
    if(APP.ui.tool!=='wall'||!drawStart)return;const p=stage.getPointerPosition();if(!p){drawStart=null;return;}
    const x=Math.round(px2m(p.x)/APP.ui.snap)*APP.ui.snap,y=Math.round(px2my(p.y)/APP.ui.snap)*APP.ui.snap;
    if(Math.hypot(x-drawStart.x,y-drawStart.y)<1.2){warn('الجدار قصير جداً');drawStart=null;return;}
    APP.model.walls.push(mkWall(drawStart.x,drawStart.y,x,y,.12,'int'));pushHist();drawStart=null;drawAll();setTool('select');
  }
  stage.on('mouseup',finishWall);stage.on('touchend',finishWall);
  window.addEventListener('mousemove',function(e){if(!pan)return;APP.ui.offset.x=panStart.ox+e.clientX-panStart.x;APP.ui.offset.y=panStart.oy-(e.clientY-panStart.y);drawAll();});
  window.addEventListener('mouseup',function(){pan=false;});
}
function resizeStage(){
  if(!stage)return;const zone=document.querySelector('.czone');if(!zone)return;const r=zone.getBoundingClientRect();
  if(r.width>0&&r.height>0){stage.width(r.width);stage.height(r.height);}
}
function drawAll(){if(!stage)return;resizeStage();drawBound();drawGrid();drawZones();drawWalls();drawBlocks();drawOpenings();updateStats();}
function drawBound(){
  L_bg.destroyChildren();const W=APP.plot.width,L=APP.plot.length,x1=m2px(0),y1=m2py(0),x2=m2px(W),y2=m2py(L);
  L_bg.add(new Konva.Rect({x:x1,y:y2,width:x2-x1,height:y1-y2,fill:'rgba(224,178,94,.04)',stroke:'rgba(224,178,94,.55)',strokeWidth:2,dash:[8,5]}));
  const fp=computeFootprint();if(fp.w>0&&fp.h>0)L_bg.add(new Konva.Rect({x:m2px(fp.x),y:m2py(fp.y+fp.h),width:m2l(fp.w),height:m2l(fp.h),fill:'rgba(79,216,208,.05)',stroke:'rgba(79,216,208,.4)',strokeWidth:1,dash:[5,4]}));
  L_bg.draw();
}
function drawGrid(){
  L_gr.destroyChildren();if(!APP.ui.showGrid){L_gr.draw();return;}
  const maxX=px2m(stage.width()),maxY=px2my(0);
  for(let x=0;x<=maxX+1;x++){const px=m2px(x);if(px<-10||px>stage.width()+10)continue;L_gr.add(new Konva.Line({points:[px,0,px,stage.height()],stroke:x%5===0?'rgba(120,145,190,.22)':'rgba(120,145,190,.08)',strokeWidth:x%5===0?1:.5}));}
  for(let y=0;y<=maxY+1;y++){const py=m2py(y);if(py<-10||py>stage.height()+10)continue;L_gr.add(new Konva.Line({points:[0,py,stage.width(),py],stroke:y%5===0?'rgba(120,145,190,.22)':'rgba(120,145,190,.08)',strokeWidth:y%5===0?1:.5}));}
  L_gr.draw();
}
function drawZones(){
  if(!L_z)return;L_z.destroyChildren();
  const palette={guest:'#e0b25e',family:'#4fd8d0',private:'#a9bce6',service:'#5ee6a8',circulation:'#d9c49a',wet:'#8fa7c7',outdoor:'#8cb477'};
  APP.model.zones.forEach(function(z){
    const color=palette[z.kind]||'#a078ff',x=m2px(z.x),y=m2py(z.y+z.h),w=m2l(z.w),h=m2l(z.h);
    if(w<3||h<3)return;
    L_z.add(new Konva.Rect({x:x,y:y,width:w,height:h,fill:z.kind==='outdoor'?'rgba(140,180,119,.12)':color.replace('#','')?hexToRgba(color,.10):'rgba(160,120,255,.10)',cornerRadius:3}));
    if(w>58&&h>36){
      const area=Math.max(0,z.w*z.h).toFixed(1),font=Math.max(10,Math.min(15,Math.min(w/10,h/5)));
      L_z.add(new Konva.Text({x:x+5,y:y+h/2-font-2,width:w-10,text:z.name,align:'center',fontSize:font,fontFamily:'Tajawal',fontStyle:'800',fill:color,listening:false}));
      if(w>72&&h>58)L_z.add(new Konva.Text({x:x+5,y:y+h/2+3,width:w-10,text:area+' م²',align:'center',fontSize:Math.max(9,font-2),fontFamily:'Tajawal',fontStyle:'600',fill:'rgba(233,239,248,.62)',listening:false}));
    }
  });
  L_z.draw();
}
function hexToRgba(hex,alpha){
  const h=String(hex||'#a078ff').replace('#','');const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}
function drawWalls(){
  L_w.destroyChildren();APP.model.walls.forEach(function(w){
    const col=w.type==='ext'?'#e0b25e':'#4fd8d0',x1=m2px(w.x1),y1=m2py(w.y1),x2=m2px(w.x2),y2=m2py(w.y2);
    const line=new Konva.Line({points:[x1,y1,x2,y2],stroke:col,strokeWidth:Math.max(3,m2l(w.t)),lineCap:'round',lineJoin:'round',shadowColor:col,shadowBlur:APP.ui.selected===w.id?20:5,shadowOpacity:APP.ui.selected===w.id?.95:.3,hitStrokeWidth:16});
    line.on('click',function(e){e.cancelBubble=true;if(APP.ui.tool==='erase')return deleteWall(w.id);if(APP.ui.tool==='door')return addOpening(w.id,'door');if(APP.ui.tool==='window')return addOpening(w.id,'window');selectItem('wall',w.id);});
    L_w.add(line);
    if(APP.ui.tool==='select'){addHandle(w,'start',x1,y1);addHandle(w,'end',x2,y2);L_w.add(new Konva.Text({x:(x1+x2)/2-22,y:(y1+y2)/2-22,text:Math.hypot(w.x2-w.x1,w.y2-w.y1).toFixed(1)+' م',fill:col,fontSize:11,fontFamily:'Tajawal',fontStyle:'800',listening:false}));}
  });L_w.draw();
}
function addHandle(w,which,x,y){
  const circle=new Konva.Circle({x:x,y:y,radius:7,fill:'#060a11',stroke:w.type==='ext'?'#e0b25e':'#4fd8d0',strokeWidth:2.5,draggable:true,hitStrokeWidth:20});
  circle.on('dragmove',function(){const nx=Math.round(px2m(circle.x())/APP.ui.snap)*APP.ui.snap,ny=Math.round(px2my(circle.y())/APP.ui.snap)*APP.ui.snap;circle.position({x:m2px(nx),y:m2py(ny)});if(which==='start'){w.x1=nx;w.y1=ny;}else{w.x2=nx;w.y2=ny;}});
  circle.on('dragend',function(){pushHist();drawAll();});L_w.add(circle);
}
function drawBlocks(){
  L_bk.destroyChildren();APP.model.blocks.forEach(function(b){
    const d=findDef(b.type);if(!d)return;const w=m2l(b.w),h=m2l(b.h),g=new Konva.Group({x:m2px(b.x),y:m2py(b.y),draggable:APP.ui.tool==='select'});
    g.add(new Konva.Rect({x:-w/2,y:-h/2,width:w,height:h,fill:'rgba(160,120,255,.12)',stroke:APP.ui.selected===b.id?'#a078ff':'rgba(160,120,255,.6)',strokeWidth:APP.ui.selected===b.id?2.5:1.4}));
    g.add(new Konva.Text({x:-w/2,y:-6,text:d.n,fill:'#a078ff',fontSize:10,fontFamily:'Tajawal',fontStyle:'700',width:w,align:'center'}));
    g.on('click',function(e){e.cancelBubble=true;if(APP.ui.tool==='erase')return deleteBlock(b.id);selectItem('block',b.id);});
    g.on('dragend',function(){b.x=Math.round(px2m(g.x())/APP.ui.snap)*APP.ui.snap;b.y=Math.round(px2my(g.y())/APP.ui.snap)*APP.ui.snap;pushHist();drawAll();});
    L_bk.add(g);
  });L_bk.draw();
}
function drawOpenings(){
  L_op.destroyChildren();APP.model.openings.forEach(function(op){
    const wall=APP.model.walls.find(function(w){return w.id===op.wallId;});if(!wall)return;
    const cx=wall.x1+(wall.x2-wall.x1)*op.pos,cy=wall.y1+(wall.y2-wall.y1)*op.pos,ang=-Math.atan2(wall.y2-wall.y1,wall.x2-wall.x1)*180/Math.PI,len=m2l(op.w);
    const g=new Konva.Group({x:m2px(cx),y:m2py(cy),rotation:ang});
    if(op.type==='door')g.add(new Konva.Line({points:[-len/2,0,len/2,0],stroke:'#8a6423',strokeWidth:Math.max(4,m2l(.08))}));
    else g.add(new Konva.Rect({x:-len/2,y:-m2l(.06),width:len,height:m2l(.12),fill:'rgba(94,184,255,.4)',stroke:'#5eb8ff',strokeWidth:1.5}));
    g.on('click',function(e){e.cancelBubble=true;if(APP.ui.tool==='erase')return deleteOpening(op.id);selectItem('opening',op.id);});L_op.add(g);
  });L_op.draw();
}
function updateStats(){
  const vals={stR:APP.model.zones.filter(function(z){return z.kind!=='outdoor';}).length,stW:APP.model.walls.length,stD:APP.model.openings.filter(function(o){return o.type==='door';}).length,stN:APP.model.openings.filter(function(o){return o.type==='window';}).length,stB:APP.model.blocks.length};
  Object.entries(vals).forEach(function(e){const el=document.getElementById(e[0]);if(el)el.textContent=e[1];});
}
function mkWall(x1,y1,x2,y2,t,type){return {id:nid(),x1:x1,y1:y1,x2:x2,y2:y2,t:t,type:type,h:3.2};}
function selectItem(kind,id){APP.ui.selected=id;drawAll();renderProps(kind,id);}
function renderProps(kind,id){
  const box=document.getElementById('props');if(!box)return;
  let obj,html;
  if(kind==='wall'){
    obj=APP.model.walls.find(function(x){return x.id===id;});if(!obj)return;
    html='<div class="prop"><label>النوع</label><select id="pType"><option value="ext" '+(obj.type==='ext'?'selected':'')+'>خارجي</option><option value="int" '+(obj.type==='int'?'selected':'')+'>داخلي</option></select></div><div class="prop"><label>السماكة (م)</label><input type="number" id="pT" value="'+obj.t+'" step=".01"></div><button class="btn" id="delItem" style="width:100%;border-color:var(--danger);color:var(--danger)">🗑️ حذف الجدار</button>';
    box.innerHTML=html;document.getElementById('pType').onchange=function(e){obj.type=e.target.value;pushHist();drawAll();};document.getElementById('pT').onchange=function(e){obj.t=parseFloat(e.target.value)||.25;pushHist();drawAll();};document.getElementById('delItem').onclick=function(){deleteWall(id);};
  }else if(kind==='opening'){
    obj=APP.model.openings.find(function(x){return x.id===id;});if(!obj)return;
    html='<div class="prop"><label>النوع</label><select id="oT"><option value="door" '+(obj.type==='door'?'selected':'')+'>باب</option><option value="window" '+(obj.type==='window'?'selected':'')+'>نافذة</option></select></div><div class="prop"><label>العرض (م)</label><input type="number" id="oW" value="'+obj.w+'" step=".1"></div><button class="btn" id="delItem" style="width:100%;border-color:var(--danger);color:var(--danger)">🗑️ حذف الفتحة</button>';
    box.innerHTML=html;document.getElementById('oT').onchange=function(e){obj.type=e.target.value;pushHist();drawAll();};document.getElementById('oW').onchange=function(e){obj.w=parseFloat(e.target.value)||1;pushHist();drawAll();};document.getElementById('delItem').onclick=function(){deleteOpening(id);};
  }else{
    obj=APP.model.blocks.find(function(x){return x.id===id;});if(!obj)return;const d=findDef(obj.type);
    html='<div class="prop"><label>النوع</label><input type="text" value="'+(d?d.n:obj.type)+'" disabled></div><div class="prop"><label>العرض (م)</label><input type="number" id="bW" value="'+obj.w+'" step=".1"></div><div class="prop"><label>الطول (م)</label><input type="number" id="bH" value="'+obj.h+'" step=".1"></div><button class="btn" id="delItem" style="width:100%;border-color:var(--danger);color:var(--danger)">🗑️ حذف العنصر</button>';
    box.innerHTML=html;document.getElementById('bW').onchange=function(e){obj.w=parseFloat(e.target.value)||1;pushHist();drawAll();};document.getElementById('bH').onchange=function(e){obj.h=parseFloat(e.target.value)||1;pushHist();drawAll();};document.getElementById('delItem').onclick=function(){deleteBlock(id);};
  }
}
function emptyProps(){const x=document.getElementById('props');if(x)x.innerHTML='<div class="empty">اضغط على عنصر لعرض خصائصه</div>';}
function deleteWall(id){showConfirm('حذف الجدار','سيتم حذف الجدار وكل الفتحات المرتبطة به.',function(){APP.model.walls=APP.model.walls.filter(function(w){return w.id!==id;});APP.model.openings=APP.model.openings.filter(function(o){return o.wallId!==id;});APP.ui.selected=null;pushHist();drawAll();emptyProps();toast('تم حذف الجدار');});}
function deleteOpening(id){APP.model.openings=APP.model.openings.filter(function(o){return o.id!==id;});APP.ui.selected=null;pushHist();drawAll();emptyProps();}
function deleteBlock(id){APP.model.blocks=APP.model.blocks.filter(function(b){return b.id!==id;});APP.ui.selected=null;pushHist();drawAll();emptyProps();}
function addOpening(wallId,type){
  const wall=APP.model.walls.find(function(w){return w.id===wallId;});if(!wall)return;
  if(Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1)<1.5){warn('الجدار قصير جداً');return;}
  const d=type==='door'?{w:1,h:2.1}:{w:1.4,h:1.4};APP.model.openings.push({id:nid(),wallId:wallId,pos:.5,w:d.w,h:d.h,type:type});pushHist();drawAll();toast(type==='door'?'تمت إضافة باب':'تمت إضافة نافذة');setTool('select');
}
function addBlock(type){
  const d=findDef(type);if(!d||!stage)return;APP.model.blocks.push({id:nid(),type:type,x:px2m(stage.width()/2),y:px2my(stage.height()/2),w:d.w,h:d.h,rot:0});pushHist();drawAll();toast('تمت إضافة '+d.n);
}
function setTool(t){APP.ui.tool=t;document.querySelectorAll('.tool[data-tool]').forEach(function(b){b.classList.toggle('on',b.dataset.tool===t);});drawAll();}
function pushHist(){const s=JSON.stringify({w:APP.model.walls,o:APP.model.openings,b:APP.model.blocks,z:APP.model.zones});APP.history=APP.history.slice(0,APP.historyIdx+1);APP.history.push(s);APP.historyIdx=APP.history.length-1;if(APP.history.length>50){APP.history.shift();APP.historyIdx--;}}
function undo(){if(APP.historyIdx<=0){warn('لا يوجد ما يمكن التراجع عنه');return;}APP.historyIdx--;const s=JSON.parse(APP.history[APP.historyIdx]);APP.model.walls=s.w;APP.model.openings=s.o;APP.model.blocks=s.b||[];APP.model.zones=s.z||[];APP.ui.selected=null;drawAll();renderPlanSpecs();toast('تم التراجع');}
function fitView(){if(!stage)return;const margin=80,aw=stage.width()-margin*2,ah=stage.height()-margin*2;APP.ui.zoom=Math.max(.2,Math.min(aw/(APP.plot.width*PX),ah/(APP.plot.length*PX)));APP.ui.offset.x=(stage.width()-APP.plot.width*PX*APP.ui.zoom)/2;APP.ui.offset.y=(stage.height()-APP.plot.length*PX*APP.ui.zoom)/2;drawAll();}

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function planVariantName(v){return ['خصوصية متدرجة','ضيافة معكوسة','فناء عائلي'][v]||'خصوصية متدرجة';}

function buildSmartZones(fp,variant){
  const r=APP.plot.rooms,zones=[],mirror=variant===1;
  function add(name,kind,rx,ry,rw,rh,role){
    if(rw<=0||rh<=0)return;
    const x=mirror?fp.x+(1-rx-rw)*fp.w:fp.x+rx*fp.w;
    zones.push({id:nid(),name:name,kind:kind,role:role||kind,x:x,y:fp.y+ry*fp.h,w:rw*fp.w,h:rh*fp.h});
  }
  const has=function(key){return (r[key]||0)>0;};

  add(has('menMajlis')?'مجلس الرجال':'جلسة ضيافة مرنة','guest',0,.00,.42,.24,'guest');
  add('بهو الرجال','circulation',.42,.00,.13,.12,'guest');
  add(r.baths>0?'حمام الرجال':'مغاسل الرجال','wet',.55,.00,.13,.12,'guest');
  add(has('womenMajlis')?'مجلس النساء':'جلسة عائلية هادئة','guest',.68,.12,.32,.36,'guest');
  add('بهو النساء','circulation',.82,.00,.18,.12,'guest');
  add(r.baths>1?'حمام النساء':'مغاسل النساء','wet',.68,.00,.14,.12,'guest');

  add(has('dining')?'صالة الطعام':'سفرة مرنة','guest',.00,.24,.42,.24,'guest');
  if(has('stairs')){
    add('درج محفوظ','circulation',.42,.24,.13,.24,'family');
    if(variant===2){
      add('فناء عائلي','outdoor',.55,.29,.13,.15,'family');
      add('رواق داخلي','circulation',.55,.24,.13,.05,'family');
      add('بهو العائلة','circulation',.55,.44,.13,.04,'family');
    }else add('بهو العائلة','circulation',.55,.24,.13,.24,'family');
  }else if(variant===2){
    add('فناء عائلي','outdoor',.42,.29,.26,.15,'family');
    add('رواق داخلي','circulation',.42,.24,.26,.05,'family');
    add('بهو العائلة','circulation',.42,.44,.26,.04,'family');
  }else add('بهو العائلة','circulation',.42,.24,.26,.24,'family');

  if(has('kitchen')){
    add(APP.plot.extras.storage?'تحضير وتخزين':'تحضير','service',.00,.48,.14,.12,'service');
    add('مطبخ','service',.14,.48,.28,.24,'service');
  }else add('منطقة خدمة مرنة','service',.00,.48,.42,.24,'service');
  add(has('familyHall')?'صالة عائلية':'معيشة مرنة','family',.42,.48,.58,.24,'family');

  add(has('motherSuite')?'جناح الوالدة':'غرفة متعددة الاستخدام','private',.00,.72,.28,.28,'private');
  const bedroomCount=clamp(r.bedrooms||0,0,6),bathStrip=r.baths>2?.12:0,bedStart=.28,bedEnd=1-bathStrip;
  if(bedroomCount){
    const roomW=(bedEnd-bedStart)/bedroomCount;
    for(let i=0;i<bedroomCount;i++)add('غرفة نوم '+(i+1),'private',bedStart+i*roomW,.72,roomW,.28,'private');
  }else add('جناح عائلي مرن','private',bedStart,.72,bedEnd-bedStart,.28,'private');
  if(bathStrip){
    const privateBaths=clamp(r.baths-2,1,2),bathH=.28/privateBaths;
    for(let i=0;i<privateBaths;i++)add('حمام خاص '+(i+1),'wet',1-bathStrip,.72+i*bathH,bathStrip,bathH,'private');
  }
  return zones;
}

function buildPlanWalls(fp,zones){
  const segs=[],eps=.015;
  function outer(x1,y1,x2,y2){
    return (Math.abs(y1-y2)<eps&&(Math.abs(y1-fp.y)<eps||Math.abs(y1-(fp.y+fp.h))<eps)) || (Math.abs(x1-x2)<eps&&(Math.abs(x1-fp.x)<eps||Math.abs(x1-(fp.x+fp.w))<eps));
  }
  function addSeg(x1,y1,x2,y2,type){
    const h=Math.abs(y1-y2)<eps,v=Math.abs(x1-x2)<eps;if(!h&&!v)return;
    if(type==='int'&&outer(x1,y1,x2,y2))return;
    const axis=h?'h':'v',coord=+(h?y1:x1).toFixed(3),a=+(h?Math.min(x1,x2):Math.min(y1,y2)).toFixed(3),b=+(h?Math.max(x1,x2):Math.max(y1,y2)).toFixed(3);
    let from=a,to=b;
    for(let i=segs.length-1;i>=0;i--){
      const s=segs[i];if(s.axis===axis&&s.type===type&&Math.abs(s.coord-coord)<eps&&from<=s.to+eps&&to>=s.from-eps){from=Math.min(from,s.from);to=Math.max(to,s.to);segs.splice(i,1);}
    }
    segs.push({axis:axis,coord:coord,from:from,to:to,type:type});
  }
  addSeg(fp.x,fp.y,fp.x+fp.w,fp.y,'ext');addSeg(fp.x+fp.w,fp.y,fp.x+fp.w,fp.y+fp.h,'ext');addSeg(fp.x+fp.w,fp.y+fp.h,fp.x,fp.y+fp.h,'ext');addSeg(fp.x,fp.y+fp.h,fp.x,fp.y,'ext');
  zones.forEach(function(z){
    addSeg(z.x,z.y,z.x+z.w,z.y,'int');addSeg(z.x+z.w,z.y,z.x+z.w,z.y+z.h,'int');addSeg(z.x+z.w,z.y+z.h,z.x,z.y+z.h,'int');addSeg(z.x,z.y+z.h,z.x,z.y,'int');
  });
  return segs.map(function(s){return s.axis==='h'?mkWall(s.from,s.coord,s.to,s.coord,s.type==='ext'?.25:.12,s.type):mkWall(s.coord,s.from,s.coord,s.to,s.type==='ext'?.25:.12,s.type);});
}

function addPlannedOpening(openings,walls,x,y,type,kind){
  const desired=type==='door'?1.1:1.35;
  const candidates=walls.filter(function(w){return !kind||w.type===kind;}).map(function(w){
    const dx=w.x2-w.x1,dy=w.y2-w.y1,len=Math.hypot(dx,dy);if(len<1.1)return null;
    const t=clamp(((x-w.x1)*dx+(y-w.y1)*dy)/(len*len),.13,.87),px=w.x1+dx*t,py=w.y1+dy*t;
    return {w:w,len:len,t:t,d:Math.hypot(x-px,y-py)};
  }).filter(Boolean).sort(function(a,b){return a.d-b.d;});
  for(let i=0;i<candidates.length;i++){
    const c=candidates[i],width=Math.min(desired,c.len*.32),gap=(width/c.len)*.85;
    if(openings.some(function(o){return o.wallId===c.w.id&&Math.abs(o.pos-c.t)<gap;}))continue;
    openings.push({id:nid(),wallId:c.w.id,pos:c.t,w:width,h:type==='door'?2.2:1.35,type:type});return true;
  }
  return false;
}

function buildPlanOpenings(fp,zones,walls){
  const openings=[];
  function named(name){return zones.find(function(z){return z.name===name;});}
  function outerDoor(name,side){
    const z=named(name);if(!z)return;
    const x=side==='left'?fp.x:side==='right'?fp.x+fp.w:z.x+z.w/2,y=side==='bottom'?fp.y:side==='top'?fp.y+fp.h:z.y+z.h/2;
    addPlannedOpening(openings,walls,x,y,'door','ext');
  }
  outerDoor('مجلس الرجال','bottom');outerDoor('بهو النساء','bottom');outerDoor('تحضير وتخزين','left');
  zones.filter(function(z){return !['outdoor','wet','circulation'].includes(z.kind);}).forEach(function(z){addPlannedOpening(openings,walls,z.x+z.w/2,z.y+z.h/2,'door','int');});
  zones.filter(function(z){return ['guest','family','private','service'].includes(z.kind);}).forEach(function(z){
    const cx=z.x+z.w/2,cy=z.y+z.h/2,eps=.03;
    if(Math.abs(z.x-fp.x)<eps)addPlannedOpening(openings,walls,fp.x,cy,'window','ext');
    else if(Math.abs(z.x+z.w-(fp.x+fp.w))<eps)addPlannedOpening(openings,walls,fp.x+fp.w,cy,'window','ext');
    else if(Math.abs(z.y+z.h-(fp.y+fp.h))<eps)addPlannedOpening(openings,walls,cx,fp.y+fp.h,'window','ext');
    else if(Math.abs(z.y-fp.y)<eps)addPlannedOpening(openings,walls,cx,fp.y,'window','ext');
  });
  return openings;
}

function buildPlanBlocks(zones){
  const blocks=[];
  function add(z,type,fx,fy,scale){
    const d=findDef(type);if(!d||!z)return;const w=Math.min(d.w*(scale||1),z.w*.62),h=Math.min(d.h*(scale||1),z.h*.62);
    if(w<.25||h<.15)return;blocks.push({id:nid(),type:type,x:z.x+z.w*fx,y:z.y+z.h*fy,w:w,h:h,rot:0});
  }
  zones.forEach(function(z){
    if(z.name.indexOf('مجلس')===0||z.name.indexOf('جلسة')===0){add(z,'sofa',.28,.52,1.05);add(z,'sofa',.72,.52,1.05);add(z,'table',.5,.5,.95);}
    else if(z.name.indexOf('صالة عائلية')===0||z.name.indexOf('معيشة')===0){add(z,'sofa',.27,.5,1.15);add(z,'sofa',.72,.5,1.15);add(z,'tv',.5,.82,1.1);add(z,'rug',.5,.5,.95);}
    else if(z.name.indexOf('صالة الطعام')===0||z.name.indexOf('سفرة')===0){add(z,'table',.5,.5,1.35);}
    else if(z.name==='مطبخ'){add(z,'sink',.25,.7,1);add(z,'stove',.55,.7,1);add(z,'fridge',.82,.7,1);}
    else if(z.name.indexOf('غرفة نوم')===0||z.name.indexOf('جناح الوالدة')===0||z.name.indexOf('غرفة متعددة')===0){add(z,'double',.5,.48,1);add(z,'wardrobe',.78,.78,1);}
    else if(z.name.indexOf('حمام')===0){add(z,'toilet',.28,.3,1);add(z,'basin',.63,.3,1);add(z,'shower',.54,.72,.85);}
    else if(z.name.indexOf('درج')===0)add(z,'stairs',.5,.5,1);
  });
  return blocks;
}

function renderPlanSpecs(){
  const box=document.getElementById('planSpecs');if(!box)return;
  const z=APP.model.zones||[];
  if(!z.length){box.innerHTML='<div class="empty">ولّد المخطط لتظهر علاقات الفراغات هنا</div>';return;}
  const room=function(name){return z.some(function(x){return x.name===name;});};
  const words=[];
  if(room('مجلس الرجال'))words.push('<div class="spec-line guest"><i class="spec-dot"></i><span>الرجال: مدخل ← بهو ← مجلس ← طعام</span></div>');
  if(room('مجلس النساء'))words.push('<div class="spec-line guest"><i class="spec-dot"></i><span>النساء: مدخل خاص ← بهو ← مجلس</span></div>');
  words.push('<div class="spec-line"><i class="spec-dot"></i><span>العائلة: الصالة هي الرابط المباشر مع جناح النوم.</span></div>');
  words.push('<div class="spec-line service"><i class="spec-dot"></i><span>الخدمة: تحضير وتخزين ← مطبخ ← طعام.</span></div>');
  words.push('<div class="spec-line private"><i class="spec-dot"></i><span>الخصوصية: جناح الوالدة وغرف النوم في الخلف.</span></div>');
  box.innerHTML='<div class="spec-title"><span>'+planVariantName(APP.ui.planVariant)+'</span> · '+z.filter(function(x){return x.kind!=="outdoor";}).length+' فراغًا</div>'+words.join('');
}

function autoGen(advance){
  const fp=computeFootprint();if(fp.w<5||fp.h<8){warn('المساحة المتاحة بعد الارتدادات صغيرة لتوزيع آمن');return;}
  if(advance)APP.ui.planVariant=(APP.ui.planVariant+1)%3;
  else APP.ui.planVariant={privacy:0,separate:1,courtyard:2,flexible:0}[APP.plot.layout]||0;
  const zones=buildSmartZones(fp,APP.ui.planVariant),walls=buildPlanWalls(fp,zones),openings=buildPlanOpenings(fp,zones,walls),blocks=buildPlanBlocks(zones);
  APP.model.walls=walls;APP.model.openings=openings;APP.model.blocks=blocks;APP.model.zones=zones;APP.ui.selected=null;pushHist();drawAll();fitView();renderPlanSpecs();
}

/* العرض 3D */
let sc3,cam3,ren3,ctrl3,sun3,amb3,gWalls,gOps,gBlk,anim3;
function init3D(){
  if(ren3){onResize3();return;}if(!window.THREE)return;
  const THREE=window.THREE,c=document.getElementById('three-canvas');if(!c)return;const w=c.clientWidth,h=c.clientHeight;
  sc3=new THREE.Scene();sc3.background=new THREE.Color(0x0a0f18);sc3.fog=new THREE.Fog(0x0a0f18,100,320);
  cam3=new THREE.PerspectiveCamera(50,w/h,.1,2000);ren3=new THREE.WebGLRenderer({antialias:true});ren3.setSize(w,h);ren3.setPixelRatio(Math.min(devicePixelRatio,2));ren3.shadowMap.enabled=true;ren3.shadowMap.type=THREE.PCFSoftShadowMap;c.appendChild(ren3.domElement);
  ctrl3={target:new THREE.Vector3(),radius:60,theta:Math.PI*.25,phi:Math.PI*.35,update:function(){const r=this.radius,s=Math.sin(this.phi);cam3.position.set(this.target.x+r*s*Math.sin(this.theta),this.target.y+r*Math.cos(this.phi),this.target.z+r*s*Math.cos(this.theta));cam3.lookAt(this.target);}};
  let drag=false,lx=0,ly=0;ren3.domElement.addEventListener('mousedown',function(e){drag=true;lx=e.clientX;ly=e.clientY;});window.addEventListener('mouseup',function(){drag=false;});window.addEventListener('mousemove',function(e){if(!drag)return;ctrl3.theta-=(e.clientX-lx)*.01;ctrl3.phi=Math.max(.15,Math.min(Math.PI/2.1,ctrl3.phi-(e.clientY-ly)*.01));lx=e.clientX;ly=e.clientY;});ren3.domElement.addEventListener('wheel',function(e){e.preventDefault();ctrl3.radius=Math.max(15,Math.min(200,ctrl3.radius+e.deltaY*.1));},{passive:false});
  amb3=new THREE.AmbientLight(0xaac4e8,.55);sc3.add(amb3,new THREE.HemisphereLight(0xaac4e8,0x1a2536,.4));
  sun3=new THREE.DirectionalLight(0xfff2d0,1.8);sun3.castShadow=true;sun3.shadow.mapSize.set(2048,2048);sun3.shadow.camera.near=1;sun3.shadow.camera.far=240;sun3.shadow.camera.left=-80;sun3.shadow.camera.right=80;sun3.shadow.camera.top=80;sun3.shadow.camera.bottom=-80;sc3.add(sun3,sun3.target);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(800,800),new THREE.MeshStandardMaterial({color:0x1a2536,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;ground.receiveShadow=true;sc3.add(ground);
  gWalls=new THREE.Group();gOps=new THREE.Group();gBlk=new THREE.Group();sc3.add(gWalls,gOps,gBlk);
  document.getElementById('hudTime').addEventListener('input',function(e){const h=+e.target.value;document.getElementById('hudTimeV').textContent=String(Math.floor(h)).padStart(2,'0')+':'+(h%1?'30':'00');updSun(h);});
  document.getElementById('hudMat').addEventListener('change',build3D);document.querySelectorAll('.hud-btn button').forEach(function(b){b.addEventListener('click',function(){setView(b.dataset.view);});});
  build3D();updSun(10);setView('persp');loop3D();
}
function dispose(group){while(group.children.length){const c=group.children.pop();if(c.geometry)c.geometry.dispose();if(c.material){if(Array.isArray(c.material))c.material.forEach(function(m){m.dispose();});else c.material.dispose();}}}
function convexHull(points){
  if(points.length<3)return points;const p=points.slice().sort(function(a,b){return a[0]!==b[0]?a[0]-b[0]:a[1]-b[1];}),cross=function(o,a,b){return(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);},lo=[],up=[];
  p.forEach(function(x){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],x)<=0)lo.pop();lo.push(x);});for(let i=p.length-1;i>=0;i--){const x=p[i];while(up.length>=2&&cross(up[up.length-2],up[up.length-1],x)<=0)up.pop();up.push(x);}lo.pop();up.pop();return lo.concat(up);
}
function build3D(){
  if(!sc3||!window.THREE)return;const THREE=window.THREE;dispose(gWalls);dispose(gOps);dispose(gBlk);
  const colors={plaster:0xf2ede4,stone:0xc7b299,sand:0xd9c8a8,grey:0x9a9a9a},choice=document.getElementById('hudMat').value;
  const exterior=new THREE.MeshStandardMaterial({color:colors[choice],roughness:.9}),interior=new THREE.MeshStandardMaterial({color:0xe6e6e6,roughness:.95}),doorMat=new THREE.MeshStandardMaterial({color:0x6b4322,roughness:.7}),glass=new THREE.MeshPhysicalMaterial({color:0x8ecfff,transparent:true,opacity:.4,roughness:.05,transmission:.8,ior:1.5,thickness:.05});
  APP.model.walls.forEach(function(w){const dx=w.x2-w.x1,dy=w.y2-w.y1,len=Math.hypot(dx,dy);if(len<.01)return;const m=new THREE.Mesh(new THREE.BoxGeometry(len,w.h,w.t),w.type==='ext'?exterior.clone():interior.clone());m.position.set((w.x1+w.x2)/2,w.h/2,(w.y1+w.y2)/2);m.rotation.y=-Math.atan2(dy,dx);m.castShadow=m.receiveShadow=true;gWalls.add(m);});
  APP.model.openings.forEach(function(op){const w=APP.model.walls.find(function(x){return x.id===op.wallId;});if(!w)return;const cx=w.x1+(w.x2-w.x1)*op.pos,cy=w.y1+(w.y2-w.y1)*op.pos,ang=-Math.atan2(w.y2-w.y1,w.x2-w.x1),depth=Math.max(.03,w.t-.03);let m;if(op.type==='door'){m=new THREE.Mesh(new THREE.BoxGeometry(op.w,op.h,depth),doorMat);m.position.set(cx,op.h/2,cy);m.castShadow=true;}else{m=new THREE.Mesh(new THREE.BoxGeometry(op.w,op.h,depth),glass);m.position.set(cx,1.1+op.h/2,cy);}m.rotation.y=ang;gOps.add(m);});
  const ext=APP.model.walls.filter(function(w){return w.type==='ext';});if(ext.length>=3){const pts=[];ext.forEach(function(w){pts.push([w.x1,w.y1],[w.x2,w.y2]);});const hull=convexHull(pts);if(hull.length>=3){const shape=new THREE.Shape();shape.moveTo(hull[0][0],hull[0][1]);for(let i=1;i<hull.length;i++)shape.lineTo(hull[i][0],hull[i][1]);shape.lineTo(hull[0][0],hull[0][1]);const roof=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.3,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:0xb5a689,roughness:.92}));roof.rotation.x=Math.PI/2;roof.position.y=3.5;roof.castShadow=roof.receiveShadow=true;gWalls.add(roof);const slab=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:0x2a3550,roughness:.9}));slab.rotation.x=Math.PI/2;slab.position.y=.12;slab.receiveShadow=true;gWalls.add(slab);}}
  const blkMat=new THREE.MeshStandardMaterial({color:0x9b7bd4,roughness:.7});APP.model.blocks.forEach(function(b){const m=new THREE.Mesh(new THREE.BoxGeometry(b.w,.75,b.h),blkMat);m.position.set(b.x,.38,b.y);m.castShadow=true;gBlk.add(m);});
  const W=APP.plot.width,L=APP.plot.length,line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.02,0),new THREE.Vector3(W,.02,0),new THREE.Vector3(W,.02,L),new THREE.Vector3(0,.02,L),new THREE.Vector3(0,.02,0)]),new THREE.LineDashedMaterial({color:0xe0b25e,dashSize:.6,gapSize:.4}));line.computeLineDistances();gBlk.add(line);
}
function updSun(hour){if(!sun3)return;const t=Math.max(0,Math.min(1,(hour-6)/12)),elev=Math.sin(t*Math.PI)*65+5,a=135*Math.PI/180,e=elev*Math.PI/180,cx=APP.plot.width/2,cz=APP.plot.length/2,d=80;sun3.position.set(cx+Math.cos(a)*Math.cos(e)*d,Math.sin(e)*d+5,cz+Math.sin(a)*Math.cos(e)*d);sun3.target.position.set(cx,0,cz);const warmth=Math.max(0,1-Math.abs(hour-12)/6);sun3.color.setHSL(.11,.55,.5+warmth*.2);sun3.intensity=.6+warmth*1.9;amb3.intensity=.25+warmth*.4;}
function setView(v){if(!ctrl3)return;const s=Math.max(APP.plot.width,APP.plot.length);ctrl3.target.set(APP.plot.width/2,1.5,APP.plot.length/2);if(v==='top'){ctrl3.phi=.15;ctrl3.radius=s*1.5;}else if(v==='front'){ctrl3.phi=Math.PI/2.2;ctrl3.radius=s*1.4;}else{ctrl3.phi=Math.PI/3;ctrl3.radius=s*1.6;}ctrl3.update();}
function onResize3(){if(!ren3)return;const c=document.getElementById('three-canvas');if(!c)return;cam3.aspect=c.clientWidth/c.clientHeight;cam3.updateProjectionMatrix();ren3.setSize(c.clientWidth,c.clientHeight);}
function loop3D(){anim3=requestAnimationFrame(loop3D);if(ctrl3){ctrl3.update();ren3.render(sc3,cam3);}}

/* الكميات */
function computeBOQ(){
  let extA=0,intA=0;APP.model.walls.forEach(function(w){
    const gross=Math.hypot(w.x2-w.x1,w.y2-w.y1)*w.h;
    const voids=APP.model.openings.filter(function(o){return o.wallId===w.id;}).reduce(function(sum,o){return sum+o.w*o.h;},0);
    const a=Math.max(0,gross-voids);if(w.type==='ext')extA+=a;else intA+=a;
  });
  const doors=APP.model.openings.filter(function(o){return o.type==='door';}).length,windows=APP.model.openings.filter(function(o){return o.type==='window';}).length,totA=extA+intA,fl=APP.plot.rooms.floors||1,net={blocks:Math.ceil((extA*12.5+intA*25)*fl),cement:Math.ceil(totA*.42*fl),sand:Math.ceil(totA*.035*fl*10)/10,rebar:Math.ceil(totA*3.2*fl),paint:Math.ceil(totA*.7*fl),doors:doors,windows:windows},w=APP.waste;
  return {extA:extA,intA:intA,totA:totA,doors:doors,windows:windows,fl:fl,net:net,waste:{blocks:Math.ceil(net.blocks*(1+w)),cement:Math.ceil(net.cement*(1+w)),sand:Math.ceil(net.sand*(1+w)*10)/10,rebar:Math.ceil(net.rebar*(1+w)),paint:Math.ceil(net.paint*(1+w))}};
}
function renderBOQ(){
  const q=computeBOQ(),p=APP.prices,w=APP.waste,vat=APP.vat,T={};T.blocks=q.waste.blocks*p.block;T.cement=q.waste.cement*p.cement;T.sand=q.waste.sand*p.sand;T.rebar=q.waste.rebar*p.rebar;T.paint=q.waste.paint*p.paint;T.doors=q.doors*p.door;T.windows=q.windows*p.window;T.mason=q.totA*q.fl*p.masonLabor;T.plaster=q.totA*q.fl*p.plasterLabor*2;T.paintL=q.totA*q.fl*p.paintLabor*2;
  const mat=T.blocks+T.cement+T.sand+T.rebar+T.paint,op=T.doors+T.windows,lab=T.mason+T.plaster+T.paintL,sub=mat+op+lab,vatA=sub*vat,grand=sub+vatA,n=function(v){return Math.round(v).toLocaleString('en');};
  document.getElementById('kpis').innerHTML='<div class="kpi gold"><span class="l">مساحة الجدران × الأدوار</span><div class="v">'+n(q.totA*q.fl)+' <i>م²</i></div></div><div class="kpi cyan"><span class="l">بلك (مع هدر '+Math.round(w*100)+'٪)</span><div class="v">'+q.waste.blocks.toLocaleString('en')+' <i>قطعة</i></div></div><div class="kpi ok"><span class="l">قبل الضريبة</span><div class="v">'+n(sub)+' <i>ر.س</i></div></div><div class="kpi danger"><span class="l">ضريبة ١٥٪</span><div class="v">'+n(vatA)+' <i>ر.س</i></div></div><div class="kpi gold"><span class="l">الإجمالي النهائي</span><div class="v">'+n(grand)+' <i>ر.س</i></div></div>';
  document.getElementById('tMat').innerHTML='<thead><tr><th>البند</th><th>صافي</th><th>+ هدر</th><th>الوحدة</th><th>الإجمالي</th></tr></thead><tbody><tr><td>طوب / بلك</td><td class="n">'+q.net.blocks.toLocaleString('en')+'</td><td class="n" style="color:var(--gold)">'+q.waste.blocks.toLocaleString('en')+'</td><td>قطعة</td><td class="n">'+n(T.blocks)+'</td></tr><tr><td>أسمنت</td><td class="n">'+q.net.cement+'</td><td class="n" style="color:var(--gold)">'+q.waste.cement+'</td><td>كيس</td><td class="n">'+n(T.cement)+'</td></tr><tr><td>رمل</td><td class="n">'+q.net.sand+'</td><td class="n" style="color:var(--gold)">'+q.waste.sand+'</td><td>م³</td><td class="n">'+n(T.sand)+'</td></tr><tr><td>حديد تسليح</td><td class="n">'+q.net.rebar+'</td><td class="n" style="color:var(--gold)">'+q.waste.rebar+'</td><td>كج</td><td class="n">'+n(T.rebar)+'</td></tr><tr><td>دهان</td><td class="n">'+q.net.paint+'</td><td class="n" style="color:var(--gold)">'+q.waste.paint+'</td><td>لتر</td><td class="n">'+n(T.paint)+'</td></tr></tbody>';
  document.getElementById('tFin').innerHTML='<thead><tr><th>البند</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody><tr><td>أبواب</td><td class="n">'+q.doors+'</td><td>'+p.door+' ر.س</td><td class="n">'+n(T.doors)+'</td></tr><tr><td>نوافذ</td><td class="n">'+q.windows+'</td><td>'+p.window+' ر.س</td><td class="n">'+n(T.windows)+'</td></tr><tr><td>أجور بناء ولياسة</td><td class="n">'+n(q.totA*q.fl)+' م²</td><td>'+p.masonLabor+' ر.س</td><td class="n">'+n(T.mason)+'</td></tr><tr><td>أجور دهان</td><td class="n">'+n(q.totA*q.fl)+' م²</td><td>'+p.paintLabor+' ر.س</td><td class="n">'+n(T.paintL)+'</td></tr></tbody>';
  document.getElementById('tTot').innerHTML='<tbody><tr><td>إجمالي المواد</td><td class="n">'+n(mat)+' ر.س</td></tr><tr><td>إجمالي الفتحات</td><td class="n">'+n(op)+' ر.س</td></tr><tr><td>إجمالي الأجور</td><td class="n">'+n(lab)+' ر.س</td></tr><tr class="waste"><td>المجموع قبل الضريبة</td><td class="n">'+n(sub)+' ر.س</td></tr><tr class="waste"><td>ضريبة ١٥٪</td><td class="n">'+n(vatA)+' ر.س</td></tr><tr class="vat tot"><td>الإجمالي النهائي</td><td class="n">'+n(grand)+' ر.س</td></tr></tbody>';
}

/* التحليل الذكي */
function listMarkup(items){
  return items.map(function(i){const mark=i.t==='ok'?'✓':i.t==='err'?'✗':'!',cls=i.t==='ok'?'ok':i.t==='err'?'err':'warn';return '<li class="'+cls+'"><span class="mark">'+mark+'</span><span class="txt"><b>'+i.m+'</b><small>'+i.d+'</small></span></li>';}).join('');
}
function runPreUploadCheck(){
  const list=document.getElementById('preList'),score=document.getElementById('preScore');if(!list)return;
  const fp=computeFootprint(),area=plotArea(),items=[],pct=fp.usable/area*100;
  items.push(pct>75?{t:'err',m:'نسبة البناء',d:pct.toFixed(0)+'٪ — الحد الأقصى ٧٥٪'}:{t:'ok',m:'نسبة البناء',d:pct.toFixed(0)+'٪ ضمن الحد'});
  const min=Math.min(fp.sb.n,fp.sb.s,fp.sb.e,fp.sb.w);items.push(min<1.5?{t:'err',m:'ارتداد أقل من الحد',d:'أصغر ارتداد: '+min.toFixed(1)+'م (المطلوب ≥ ١.٥م)'}:{t:'ok',m:'الارتدادات',d:'أصغر ارتداد: '+min.toFixed(1)+'م'});
  const parking=area<=400?1:2;items.push({t:'ok',m:'المواقف',d:'المطلوب '+parking+' موقف'});
  const floors=APP.plot.rooms.floors;items.push(floors>3?{t:'warn',m:'عدد الأدوار',d:floors+' — قد يتطلب مصعداً'}:{t:'ok',m:'عدد الأدوار',d:String(floors)});
  items.push(APP.model.walls.length<4?{t:'warn',m:'الجدران',d:'لم يتم توليد المخطط بعد'}:{t:'ok',m:'الجدران',d:APP.model.walls.length+' جدار'});
  const doors=APP.model.openings.filter(function(o){return o.type==='door';}).length,wins=APP.model.openings.filter(function(o){return o.type==='window';}).length;
  if(doors<2)items.push({t:'warn',m:'الأبواب',d:'عدد قليل من الأبواب'});if(wins<3)items.push({t:'warn',m:'النوافذ',d:'عدد قليل من النوافذ'});
  const errors=items.filter(function(i){return i.t==='err';}).length,warns=items.filter(function(i){return i.t==='warn';}).length,ready=Math.max(0,100-errors*25-warns*8);
  score.textContent=ready+'٪ جاهز';score.style.color=ready>80?'var(--ok)':ready>50?'var(--warn)':'var(--danger)';list.innerHTML=listMarkup(items);
}
function detectConflicts(){
  const list=document.getElementById('confList'),score=document.getElementById('confScore');if(!list)return;
  if(APP.model.walls.length<3){list.innerHTML='<li class="warn"><span class="mark">…</span><span class="txt">ولّد المخطط أولاً من المحرر</span></li>';if(score)score.textContent='—';return;}
  const items=[],doors=APP.model.openings.filter(function(o){return o.type==='door';}),by={};doors.forEach(function(d){(by[d.wallId]||(by[d.wallId]=[])).push(d);});
  Object.values(by).forEach(function(a){if(a.length>1)items.push({t:'err',m:'أبواب متعددة على نفس الجدار',d:a.length+' أبواب — قد يتصادم فتحها'});});
  APP.model.walls.filter(function(w){return w.type==='int';}).forEach(function(w){const len=Math.hypot(w.x2-w.x1,w.y2-w.y1);if(len<3)items.push({t:'warn',m:'جدار داخلي قصير',d:len.toFixed(1)+'م — أقل من ٣م'});});
  APP.model.walls.forEach(function(w){if(Math.abs(w.y1)<.5||Math.abs(w.y2)<.5){const wins=APP.model.openings.filter(function(o){return o.wallId===w.id&&o.type==='window';});if(wins.length>2)items.push({t:'warn',m:'نوافذ على الواجهة الجنوبية',d:'تعرض مباشر للشمس'});}});
  const r=APP.plot.rooms;if(r.bedrooms>0&&r.baths/r.bedrooms<.6)items.push({t:'warn',m:'نسبة الحمامات منخفضة',d:r.baths+' حمام لـ '+r.bedrooms+' غرف نوم'});
  if(!items.length)items.push({t:'ok',m:'لا توجد تعارضات مكتشفة',d:'المخطط سليم مبدئياً'});
  const errs=items.filter(function(i){return i.t==='err';}).length,warns=items.filter(function(i){return i.t==='warn';}).length,ready=Math.max(0,100-errs*30-warns*10);score.textContent=ready+'٪ نظيف';score.style.color=ready>80?'var(--ok)':ready>50?'var(--warn)':'var(--danger)';list.innerHTML=listMarkup(items);
}
function plotSvgBase(){
  const W=APP.plot.width,L=APP.plot.length,pad=20,svgW=800,svgH=svgW*(L/W),sc=Math.min((svgW-pad*2)/W,(svgH-pad*2)/L),x=function(v){return pad+v*sc;},y=function(v){return svgH-pad-v*sc;};
  return {W:W,L:L,svgW:svgW,svgH:svgH,sc:sc,x:x,y:y};
}
function drawMovementMap(){
  const box=document.getElementById('movementMap');if(!box)return;const p=plotSvgBase(),fp=computeFootprint(),zones=APP.model.zones||[];
  const get=function(names,fallback){const z=zones.find(function(x){return names.indexOf(x.name)>-1;});return z?{x:z.x+z.w/2,y:z.y+z.h/2}:fallback;};
  const men=get(['مجلس الرجال','جلسة ضيافة مرنة'],{x:fp.x+fp.w*.2,y:fp.y+fp.h*.12}),menFoyer=get(['بهو الرجال'],{x:fp.x+fp.w*.48,y:fp.y+fp.h*.07}),dining=get(['صالة الطعام','سفرة مرنة'],{x:fp.x+fp.w*.2,y:fp.y+fp.h*.36});
  const women=get(['مجلس النساء','جلسة عائلية هادئة'],{x:fp.x+fp.w*.84,y:fp.y+fp.h*.3}),womenFoyer=get(['بهو النساء'],{x:fp.x+fp.w*.9,y:fp.y+fp.h*.06}),hall=get(['صالة عائلية','معيشة مرنة'],{x:fp.x+fp.w*.7,y:fp.y+fp.h*.6});
  const prep=get(['تحضير وتخزين','تحضير','منطقة خدمة مرنة'],{x:fp.x+fp.w*.08,y:fp.y+fp.h*.54}),kitchen=get(['مطبخ'],{x:fp.x+fp.w*.28,y:fp.y+fp.h*.6}),mother=get(['جناح الوالدة','غرفة متعددة الاستخدام'],{x:fp.x+fp.w*.14,y:fp.y+fp.h*.86});
  const menEntry={x:men.x,y:fp.y},womenEntry={x:womenFoyer.x,y:fp.y},serviceEntry={x:fp.x,y:prep.y},familyEntry={x:hall.x,y:fp.y+fp.h*.48};
  const line=function(points,c){return '<polyline points="'+points.map(function(q){return p.x(q.x)+','+p.y(q.y);}).join(' ')+'" fill="none" stroke="'+c+'" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity=".82" marker-end="url(#arrow-'+c.slice(1)+')"/>';};
  const dot=function(q,c,l){return '<circle cx="'+p.x(q.x)+'" cy="'+p.y(q.y)+'" r="7" fill="'+c+'" stroke="#05080f" stroke-width="2"/><text x="'+p.x(q.x)+'" y="'+(p.y(q.y)-13)+'" fill="'+c+'" font-size="11" font-weight="700" text-anchor="middle" font-family="Tajawal">'+l+'</text>';};
  const rooms=zones.map(function(z){const color={guest:'#e0b25e',family:'#4fd8d0',private:'#a9bce6',service:'#5ee6a8',circulation:'#d9c49a',wet:'#8fa7c7',outdoor:'#8cb477'}[z.kind]||'#a078ff';return '<rect x="'+p.x(z.x)+'" y="'+p.y(z.y+z.h)+'" width="'+(z.w*p.sc)+'" height="'+(z.h*p.sc)+'" fill="'+color+'" fill-opacity=".08" stroke="'+color+'" stroke-opacity=".23" stroke-width="1"/>';}).join('');
  const defs='<defs><marker id="arrow-e0b25e" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#e0b25e"/></marker><marker id="arrow-a078ff" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#a078ff"/></marker><marker id="arrow-4fd8d0" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#4fd8d0"/></marker><marker id="arrow-5ee6a8" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#5ee6a8"/></marker></defs>';
  box.innerHTML='<svg viewBox="0 0 '+p.svgW+' '+p.svgH+'" preserveAspectRatio="xMidYMid meet">'+defs+'<rect x="'+p.x(0)+'" y="'+p.y(p.L)+'" width="'+(p.W*p.sc)+'" height="'+(p.L*p.sc)+'" fill="rgba(224,178,94,.04)" stroke="rgba(224,178,94,.4)" stroke-width="2" stroke-dasharray="6 4"/>'+rooms+line([menEntry,menFoyer,men,dining],'#e0b25e')+line([womenEntry,womenFoyer,women],'#a078ff')+line([familyEntry,hall,mother],'#4fd8d0')+line([serviceEntry,prep,kitchen,dining],'#5ee6a8')+dot(menEntry,'#e0b25e','رجال')+dot(womenEntry,'#a078ff','نساء')+dot(familyEntry,'#4fd8d0','عائلة')+dot(serviceEntry,'#5ee6a8','خدمة')+'</svg>';
}
function computeSpaceBudget(){
  const bar=document.getElementById('budgetBar'),items=document.getElementById('budgetItems');if(!bar||!items)return;const area=plotArea(),build=computeFootprint().usable,parking=Math.min(40,area*.07),garden=Math.max(0,area-build-parking-area*.05),waste=area*.03,internal=Math.max(0,area-build-parking-garden-waste),parts=[{n:'المبنى',v:build,c:'#e0b25e'},{n:'الحديقة',v:garden,c:'#5ee6a8'},{n:'المواقف',v:parking,c:'#4fd8d0'},{n:'ممرات',v:internal,c:'#a078ff'},{n:'مهدر',v:waste,c:'#ff6b6b'}],total=parts.reduce(function(s,p){return s+p.v;},0);
  bar.innerHTML=parts.map(function(p){const pc=p.v/total*100;return '<div style="width:'+pc+'%;background:'+p.c+'">'+(pc>8?pc.toFixed(0)+'٪':'')+'</div>';}).join('');
  items.innerHTML=parts.map(function(p){return '<div class="budget-item"><span class="bl">'+p.n+'</span><div class="bv" style="color:'+p.c+'">'+Math.round(p.v)+' م²</div><span class="bp">'+(p.v/total*100).toFixed(0)+'٪ من الأرض</span></div>';}).join('');
}
function drawBeforeAfter(view){
  const box=document.getElementById('baView');if(!box)return;const p=plotSvgBase(),fp=computeFootprint(),zones=APP.model.zones||[];let content='<rect x="0" y="0" width="'+p.svgW+'" height="'+p.svgH+'" fill="#05080f"/><rect x="'+p.x(0)+'" y="'+p.y(p.L)+'" width="'+(p.W*p.sc)+'" height="'+(p.L*p.sc)+'" fill="rgba(224,178,94,.05)" stroke="rgba(224,178,94,.6)" stroke-width="2" stroke-dasharray="6 4"/>';
  if(view==='after'){
    content+='<rect x="'+p.x(fp.x)+'" y="'+p.y(fp.y+fp.h)+'" width="'+(fp.w*p.sc)+'" height="'+(fp.h*p.sc)+'" fill="rgba(79,216,208,.12)" stroke="rgba(79,216,208,.7)" stroke-width="2"/>';
    if(zones.length){
      const colors={guest:'#e0b25e',family:'#4fd8d0',private:'#a9bce6',service:'#5ee6a8',circulation:'#d9c49a',wet:'#8fa7c7',outdoor:'#8cb477'};
      content+=zones.map(function(z){const c=colors[z.kind]||'#a078ff',x=p.x(z.x),y=p.y(z.y+z.h),w=z.w*p.sc,h=z.h*p.sc,show=w>58&&h>35;return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+c+'" fill-opacity=".11" stroke="'+c+'" stroke-opacity=".6" stroke-width="1"/>'+(show?'<text x="'+(x+w/2)+'" y="'+(y+h/2)+'" fill="'+c+'" font-size="11" font-weight="700" text-anchor="middle" font-family="Tajawal">'+z.name+'</text>':'');}).join('');
    }else content+='<text x="'+(p.svgW/2)+'" y="'+(p.svgH/2)+'" fill="rgba(79,216,208,.7)" font-size="18" font-weight="700" text-anchor="middle" font-family="Tajawal">منطقة بناء مبدئية</text>';
  }else content+='<text x="'+p.svgW/2+'" y="'+p.svgH/2+'" fill="rgba(224,178,94,.5)" font-size="20" font-weight="700" text-anchor="middle" font-family="Tajawal">أرض فاضية — '+Math.round(p.W*p.L)+' م²</text>';
  box.innerHTML='<svg viewBox="0 0 '+p.svgW+' '+p.svgH+'" preserveAspectRatio="xMidYMid meet">'+content+'</svg>';
}
function initAnalysis(){
  runPreUploadCheck();detectConflicts();drawMovementMap();computeSpaceBudget();drawBeforeAfter('before');
  const toggle=document.getElementById('baToggle');if(toggle&&!toggle.dataset.bound){toggle.dataset.bound='1';toggle.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){toggle.querySelectorAll('button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');drawBeforeAfter(b.dataset.view);});});}
}

/* التنقل والرسائل */
function switchTab(name){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('on',t.dataset.tab===name);});
  document.querySelectorAll('.panel').forEach(function(p){p.classList.toggle('on',p.id==='panel-'+name);});
  if(name==='editor')setTimeout(function(){initStage();resizeStage();drawAll();fitView();},50);
  if(name==='threeD')setTimeout(function(){init3D();if(ren3){onResize3();build3D();setView('persp');}},100);
  if(name==='boq')renderBOQ();
  if(name==='analysis')setTimeout(initAnalysis,50);
}
function goHome(){
  const platform=document.getElementById('platform'),journey=document.getElementById('journey');platform.classList.remove('show');journey.style.display='flex';requestAnimationFrame(function(){journey.style.opacity='1';journey.style.transform='translateY(0)';});window.scrollTo({top:0,behavior:'smooth'});
}
function openPlatform(){
  document.getElementById('journey').style.display='none';document.getElementById('platform').classList.add('show');window.scrollTo({top:0,behavior:'auto'});renderForm();renderLib();updateRating();
}
let toastTimer,confirmCb=null;
function toast(msg,type){
  const t=document.getElementById('toast'),m=document.getElementById('toastMsg');m.textContent=msg;t.classList.remove('err','warn');if(type)t.classList.add(type);t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show');},3000);
}
function warn(msg){toast('⚠️ '+msg,'warn');}
function showConfirm(title,body,cb){document.getElementById('mTitle').textContent=title;document.getElementById('mBody').textContent=body;document.getElementById('modal').classList.add('show');confirmCb=cb;}

/* الإقلاع */
function boot(){
  document.getElementById('enterBtn').addEventListener('click',function(){const intro=document.getElementById('intro');intro.classList.add('hidden');document.body.classList.add('revealed');setTimeout(function(){intro.remove();},2000);});
  document.querySelectorAll('.jcard').forEach(function(card){card.addEventListener('click',function(){openPlatform();setTimeout(function(){switchTab(card.dataset.go);},100);});});
  document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){switchTab(t.dataset.tab);});});
  document.querySelectorAll('.tool[data-tool]').forEach(function(b){b.addEventListener('click',function(){setTool(b.dataset.tool);});});
  document.getElementById('btnUndo').addEventListener('click',undo);
  document.getElementById('btnGrid').addEventListener('click',function(){APP.ui.showGrid=!APP.ui.showGrid;this.classList.toggle('on',APP.ui.showGrid);drawGrid();});
  document.getElementById('btnFit').addEventListener('click',fitView);
  document.getElementById('btnLibrary').addEventListener('click',function(){document.querySelector('.ed').classList.toggle('library-open');});
  document.getElementById('btnAuto').addEventListener('click',function(){autoGen(true);toast('تم توليد '+planVariantName(APP.ui.planVariant));});
  document.getElementById('btnGen').addEventListener('click',function(){autoGen(false);switchTab('editor');toast('⚡ تم توليد مخطط كامل قابل للتعديل');});
  document.getElementById('btnReadIdea').addEventListener('click',readIdea);
  document.querySelectorAll('#styleGrid .vs').forEach(function(v){v.addEventListener('click',function(){document.querySelectorAll('#styleGrid .vs').forEach(function(x){x.classList.remove('on');});v.classList.add('on');APP.plot.layout=v.dataset.key;});});
  document.querySelectorAll('#structGrid .vs').forEach(function(v){v.addEventListener('click',function(){document.querySelectorAll('#structGrid .vs').forEach(function(x){x.classList.remove('on');});v.classList.add('on');APP.plot.style=v.dataset.key;});});
  document.getElementById('inLen').addEventListener('input',function(e){APP.plot.length=Math.max(5,parseFloat(e.target.value)||5);updateArea();updateRating();});
  document.getElementById('inWid').addEventListener('input',function(e){APP.plot.width=Math.max(5,parseFloat(e.target.value)||5);updateArea();updateRating();});
  document.getElementById('inDirection').addEventListener('change',function(e){APP.plot.direction=e.target.value;});
  document.getElementById('inFloors').addEventListener('change',function(e){APP.plot.rooms.floors=Math.max(1,parseInt(e.target.value,10)||1);});
  document.querySelectorAll('.street').forEach(function(card){
    card.addEventListener('click',function(e){if(e.target.tagName==='INPUT')return;const side=card.dataset.side;APP.plot.streets[side]=APP.plot.streets[side]?null:{w:15,name:''};renderStreets();updateRating();});
    card.querySelector('.st-w').addEventListener('input',function(e){const s=card.dataset.side;if(APP.plot.streets[s])APP.plot.streets[s].w=parseFloat(e.target.value)||15;updateRating();});
    card.querySelector('.st-n').addEventListener('input',function(e){const s=card.dataset.side;if(APP.plot.streets[s])APP.plot.streets[s].name=e.target.value;});
  });
  document.querySelectorAll('.cat').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.cat').forEach(function(x){x.classList.remove('on');});b.classList.add('on');APP.ui.cat=b.dataset.cat;renderLib();});});
  function refreshSun(){
    const h=APP.ui.sunHour,s=getSun(h,APP.ui.sunMonth);document.getElementById('sunHV').textContent=String(Math.floor(h)).padStart(2,'0')+':'+(h%1?'30':'00');document.getElementById('sunInfo').innerHTML='ارتفاع: <b>'+s.elev.toFixed(1)+'°</b> · اتجاه: <b>'+s.az.toFixed(0)+'°</b>';
  }
  document.getElementById('sunH').addEventListener('input',function(e){APP.ui.sunHour=parseFloat(e.target.value);refreshSun();});
  document.getElementById('sunM').addEventListener('change',function(e){APP.ui.sunMonth=parseInt(e.target.value,10);refreshSun();});
  document.getElementById('mCancel').addEventListener('click',function(){document.getElementById('modal').classList.remove('show');confirmCb=null;});
  document.getElementById('mConfirm').addEventListener('click',function(){document.getElementById('modal').classList.remove('show');if(confirmCb)confirmCb();confirmCb=null;});
  window.addEventListener('resize',function(){if(document.querySelector('#panel-editor.on'))drawAll();if(document.querySelector('#panel-threeD.on'))onResize3();});
  window.addEventListener('keydown',function(e){if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();}if(e.key==='Escape'){APP.ui.selected=null;drawAll();emptyProps();}if(['v','V'].includes(e.key))setTool('select');if(['w','W'].includes(e.key))setTool('wall');if(['d','D'].includes(e.key))setTool('door');if(['n','N'].includes(e.key))setTool('window');if(['e','E'].includes(e.key))setTool('erase');});
  renderForm();renderLib();updateRating();
}
window.goHome=goHome;window.switchTab=switchTab;window.toast=toast;
document.addEventListener('DOMContentLoaded',boot);
