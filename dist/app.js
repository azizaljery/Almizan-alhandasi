/* الميزان الهندسي — السلوك التفاعلي */
let _id = 1;
const nid = () => 'e' + (_id++);

const APP = {
  plot: {
    length: 30, width: 20,
    streets: { n:null, s:{w:15,name:'الشارع الرئيسي'}, e:null, w:null },
    style: 'resort', structure: 'L',
    rooms: { bedrooms:4, halls:2, majlis:2, baths:4, floors:2 },
    extras: { maid:false, driver:false, storage:false, accessible:false }
  },
  model: { walls:[], openings:[], blocks:[] },
  ui: { tool:'select', snap:.5, showGrid:true, selected:null, zoom:1, offset:{x:0,y:0}, sunHour:10, sunMonth:6, cat:'furniture' },
  history: [], historyIdx: -1,
  prices: { block:2.5, cement:14, sand:350, rebar:3.5, paint:12, door:800, window:1200, masonLabor:25, plasterLabor:18, paintLabor:10 },
  waste: .07, vat: .15
};

const LIB = {
  furniture: { sofa:{n:'كنبة',w:2.2,h:.9}, table:{n:'طاولة',w:1.6,h:.9}, tv:{n:'تلفاز',w:1.4,h:.15}, rug:{n:'سجادة',w:2.4,h:1.2} },
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
const CTR=[{k:'bedrooms',n:'غرف النوم',min:1},{k:'halls',n:'الصالات',min:0},{k:'majlis',n:'المجالس',min:0},{k:'baths',n:'دورات المياه',min:0},{k:'floors',n:'عدد الأدوار',min:1}];
const EXT=[{k:'maid',n:'غرفة خادمة',s:'مع حمام'},{k:'driver',n:'غرفة سائق',s:'مدخل منفصل'},{k:'storage',n:'مستودع',s:'قريب من المطبخ'},{k:'accessible',n:'الوصول الشامل',s:'ممرات أوسع'}];

function renderForm(){
  const len=document.getElementById('inLen'),wid=document.getElementById('inWid');
  if(len) len.value=APP.plot.length;
  if(wid) wid.value=APP.plot.width;
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
    return '<div class="counter"><div class="lbl">'+c.n+'</div><div class="stepper"><button data-k="'+c.k+'" data-a="dec">−</button><span class="v" id="v_'+c.k+'">'+APP.plot.rooms[c.k]+'</span><button data-k="'+c.k+'" data-a="inc">+</button></div></div>';
  }).join('');
  box.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){
      const k=b.dataset.k,min=CTR.find(function(c){return c.k===k;}).min;
      APP.plot.rooms[k]=b.dataset.a==='inc'?Math.min(20,APP.plot.rooms[k]+1):Math.max(min,APP.plot.rooms[k]-1);
      document.getElementById('v_'+k).textContent=APP.plot.rooms[k];
    });
  });
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
let stage,L_bg,L_gr,L_w,L_bk,L_op;
const m2px=function(x){return x*PX*APP.ui.zoom+APP.ui.offset.x;};
const m2py=function(y){return stage.height()-(y*PX*APP.ui.zoom+APP.ui.offset.y);};
const px2m=function(x){return (x-APP.ui.offset.x)/(PX*APP.ui.zoom);};
const px2my=function(y){return (stage.height()-y-APP.ui.offset.y)/(PX*APP.ui.zoom);};
const m2l=function(l){return l*PX*APP.ui.zoom;};

function initStage(){
  if(stage||!window.Konva) return;
  stage=new Konva.Stage({container:'stage',width:800,height:600});
  L_bg=new Konva.Layer({listening:false});L_gr=new Konva.Layer({listening:false});L_w=new Konva.Layer();L_bk=new Konva.Layer();L_op=new Konva.Layer();
  stage.add(L_bg,L_gr,L_w,L_bk,L_op);
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
function drawAll(){if(!stage)return;resizeStage();drawBound();drawGrid();drawWalls();drawBlocks();drawOpenings();updateStats();}
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
  const vals={stW:APP.model.walls.length,stD:APP.model.openings.filter(function(o){return o.type==='door';}).length,stN:APP.model.openings.filter(function(o){return o.type==='window';}).length,stB:APP.model.blocks.length};
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
function pushHist(){const s=JSON.stringify({w:APP.model.walls,o:APP.model.openings,b:APP.model.blocks});APP.history=APP.history.slice(0,APP.historyIdx+1);APP.history.push(s);APP.historyIdx=APP.history.length-1;if(APP.history.length>50){APP.history.shift();APP.historyIdx--;}}
function undo(){if(APP.historyIdx<=0){warn('لا يوجد ما يمكن التراجع عنه');return;}APP.historyIdx--;const s=JSON.parse(APP.history[APP.historyIdx]);APP.model.walls=s.w;APP.model.openings=s.o;APP.model.blocks=s.b||[];APP.ui.selected=null;drawAll();toast('تم التراجع');}
function fitView(){if(!stage)return;const margin=80,aw=stage.width()-margin*2,ah=stage.height()-margin*2;APP.ui.zoom=Math.max(.2,Math.min(aw/(APP.plot.width*PX),ah/(APP.plot.length*PX)));APP.ui.offset.x=(stage.width()-APP.plot.width*PX*APP.ui.zoom)/2;APP.ui.offset.y=(stage.height()-APP.plot.length*PX*APP.ui.zoom)/2;drawAll();}

function autoGen(){
  const fp=computeFootprint();if(fp.w<2||fp.h<2){warn('المساحة صغيرة جداً');return;}
  const walls=[],ops=[],s=APP.plot.structure;let outer=[];
  if(s==='L'){
    const cw=fp.w*.42,ch=fp.h*.42;outer=[[fp.x,fp.y],[fp.x+fp.w,fp.y],[fp.x+fp.w,fp.y+fp.h-ch],[fp.x+fp.w-cw,fp.y+fp.h-ch],[fp.x+fp.w-cw,fp.y+fp.h],[fp.x,fp.y+fp.h]];
  }else if(s==='U'){
    const c=Math.min(fp.w*.35,fp.h*.5);outer=[[fp.x,fp.y],[fp.x+fp.w,fp.y],[fp.x+fp.w,fp.y+fp.h],[fp.x+fp.w-c,fp.y+fp.h],[fp.x+fp.w-c,fp.y+fp.h-c],[fp.x+c,fp.y+fp.h-c],[fp.x+c,fp.y+fp.h],[fp.x,fp.y+fp.h]];
  }else if(s==='split'){
    const gap=fp.w*.06,w1=fp.w*.6,w2=fp.w-w1-gap,x2=fp.x+w1+gap;outer=[[fp.x,fp.y],[fp.x+w1,fp.y],[fp.x+w1,fp.y+fp.h],[fp.x,fp.y+fp.h]];
    walls.push(mkWall(x2,fp.y,x2,fp.y+fp.h,.25,'ext'),mkWall(x2,fp.y,x2+w2,fp.y,.25,'ext'),mkWall(x2+w2,fp.y,x2+w2,fp.y+fp.h,.25,'ext'),mkWall(x2+w2,fp.y+fp.h,x2,fp.y+fp.h,.25,'ext'));
  }else outer=[[fp.x,fp.y],[fp.x+fp.w,fp.y],[fp.x+fp.w,fp.y+fp.h],[fp.x,fp.y+fp.h]];
  for(let i=0;i<outer.length;i++){const a=outer[i],b=outer[(i+1)%outer.length];walls.push(mkWall(a[0],a[1],b[0],b[1],.25,'ext'));}
  const sy=fp.y+fp.h*.55;if(fp.w>=4)walls.push(mkWall(fp.x,sy,fp.x+fp.w,sy,.12,'int'));
  const entry=walls.find(function(w){return Math.abs(w.y1-fp.y)<.01&&Math.abs(w.y2-fp.y)<.01&&Math.abs(w.x2-w.x1)>2;});if(entry)ops.push({id:nid(),wallId:entry.id,pos:.5,w:1.1,h:2.2,type:'door'});
  walls.filter(function(w){return w.type==='int';}).forEach(function(w,i){if(Math.hypot(w.x2-w.x1,w.y2-w.y1)>3)ops.push({id:nid(),wallId:w.id,pos:.3+(i%3)*.2,w:.9,h:2.1,type:'door'});});
  walls.filter(function(w){return w.type==='ext';}).forEach(function(w){const len=Math.hypot(w.x2-w.x1,w.y2-w.y1);if(len>4&&w!==entry){const c=Math.max(1,Math.floor(len/4));for(let k=1;k<=c;k++)ops.push({id:nid(),wallId:w.id,pos:k/(c+1),w:1.2,h:1.4,type:'window'});}});
  APP.model.walls=walls;APP.model.openings=ops;APP.model.blocks=[];APP.ui.selected=null;pushHist();drawAll();fitView();
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
  let extA=0,intA=0;APP.model.walls.forEach(function(w){const a=Math.hypot(w.x2-w.x1,w.y2-w.y1)*w.h;if(w.type==='ext')extA+=a;else intA+=a;});
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
  const box=document.getElementById('movementMap');if(!box)return;const p=plotSvgBase(),fp=computeFootprint(),entry={x:p.W/2,y:0},guests={x:fp.x+fp.w*.85,y:fp.y+fp.h*.2},family={x:fp.x+fp.w*.5,y:fp.y+fp.h*.7},service={x:fp.x+fp.w*.15,y:fp.y+fp.h*.3};
  const path=function(a,b,c){return '<line x1="'+p.x(a.x)+'" y1="'+p.y(a.y)+'" x2="'+p.x(b.x)+'" y2="'+p.y(b.y)+'" stroke="'+c+'" stroke-width="3" stroke-linecap="round" opacity=".75"/>';},dot=function(q,c,l){return '<circle cx="'+p.x(q.x)+'" cy="'+p.y(q.y)+'" r="8" fill="'+c+'" stroke="#05080f" stroke-width="2"/><text x="'+p.x(q.x)+'" y="'+(p.y(q.y)-14)+'" fill="'+c+'" font-size="11" font-weight="700" text-anchor="middle" font-family="Tajawal">'+l+'</text>';};
  box.innerHTML='<svg viewBox="0 0 '+p.svgW+' '+p.svgH+'" preserveAspectRatio="xMidYMid meet"><rect x="'+p.x(0)+'" y="'+p.y(p.L)+'" width="'+(p.W*p.sc)+'" height="'+(p.L*p.sc)+'" fill="rgba(224,178,94,.04)" stroke="rgba(224,178,94,.4)" stroke-width="2" stroke-dasharray="6 4"/><rect x="'+p.x(fp.x)+'" y="'+p.y(fp.y+fp.h)+'" width="'+(fp.w*p.sc)+'" height="'+(fp.h*p.sc)+'" fill="rgba(79,216,208,.08)" stroke="rgba(79,216,208,.5)" stroke-width="1.5"/>'+path(entry,guests,'#e0b25e')+path(entry,family,'#4fd8d0')+path(service,family,'#a078ff')+dot(entry,'#e0b25e','المدخل')+dot(guests,'#e0b25e','الضيوف')+dot(family,'#4fd8d0','العائلة')+dot(service,'#a078ff','الخدمة')+'</svg>';
}
function computeSpaceBudget(){
  const bar=document.getElementById('budgetBar'),items=document.getElementById('budgetItems');if(!bar||!items)return;const area=plotArea(),build=computeFootprint().usable,parking=Math.min(40,area*.07),garden=Math.max(0,area-build-parking-area*.05),waste=area*.03,internal=Math.max(0,area-build-parking-garden-waste),parts=[{n:'المبنى',v:build,c:'#e0b25e'},{n:'الحديقة',v:garden,c:'#5ee6a8'},{n:'المواقف',v:parking,c:'#4fd8d0'},{n:'ممرات',v:internal,c:'#a078ff'},{n:'مهدر',v:waste,c:'#ff6b6b'}],total=parts.reduce(function(s,p){return s+p.v;},0);
  bar.innerHTML=parts.map(function(p){const pc=p.v/total*100;return '<div style="width:'+pc+'%;background:'+p.c+'">'+(pc>8?pc.toFixed(0)+'٪':'')+'</div>';}).join('');
  items.innerHTML=parts.map(function(p){return '<div class="budget-item"><span class="bl">'+p.n+'</span><div class="bv" style="color:'+p.c+'">'+Math.round(p.v)+' م²</div><span class="bp">'+(p.v/total*100).toFixed(0)+'٪ من الأرض</span></div>';}).join('');
}
function drawBeforeAfter(view){
  const box=document.getElementById('baView');if(!box)return;const p=plotSvgBase(),fp=computeFootprint();let content='<rect x="0" y="0" width="'+p.svgW+'" height="'+p.svgH+'" fill="#05080f"/><rect x="'+p.x(0)+'" y="'+p.y(p.L)+'" width="'+(p.W*p.sc)+'" height="'+(p.L*p.sc)+'" fill="rgba(224,178,94,.05)" stroke="rgba(224,178,94,.6)" stroke-width="2" stroke-dasharray="6 4"/>';
  if(view==='after'){content+='<rect x="'+p.x(fp.x)+'" y="'+p.y(fp.y+fp.h)+'" width="'+(fp.w*p.sc)+'" height="'+(fp.h*p.sc)+'" fill="rgba(79,216,208,.15)" stroke="rgba(79,216,208,.7)" stroke-width="2"/>';for(let i=1;i<3;i++){const rx=fp.x+fp.w/3*i;content+='<line x1="'+p.x(rx)+'" y1="'+p.y(fp.y+fp.h)+'" x2="'+p.x(rx)+'" y2="'+p.y(fp.y)+'" stroke="rgba(79,216,208,.4)" stroke-width="1"/>';}const ry=fp.y+fp.h/2;content+='<line x1="'+p.x(fp.x)+'" y1="'+p.y(ry)+'" x2="'+p.x(fp.x+fp.w)+'" y2="'+p.y(ry)+'" stroke="rgba(79,216,208,.4)" stroke-width="1"/>';}else content+='<text x="'+p.svgW/2+'" y="'+p.svgH/2+'" fill="rgba(224,178,94,.5)" font-size="20" font-weight="700" text-anchor="middle" font-family="Tajawal">أرض فاضية — '+Math.round(p.W*p.L)+' م²</text>';
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
  document.getElementById('btnAuto').addEventListener('click',function(){autoGen();toast('تم التوليد التلقائي');});
  document.getElementById('btnGen').addEventListener('click',function(){autoGen();switchTab('editor');toast('⚡ تم توليد المخطط');});
  document.querySelectorAll('#styleGrid .vs').forEach(function(v){v.addEventListener('click',function(){document.querySelectorAll('#styleGrid .vs').forEach(function(x){x.classList.remove('on');});v.classList.add('on');APP.plot.style=v.dataset.key;});});
  document.querySelectorAll('#structGrid .vs').forEach(function(v){v.addEventListener('click',function(){document.querySelectorAll('#structGrid .vs').forEach(function(x){x.classList.remove('on');});v.classList.add('on');APP.plot.structure=v.dataset.key;});});
  document.getElementById('inLen').addEventListener('input',function(e){APP.plot.length=Math.max(5,parseFloat(e.target.value)||5);updateArea();updateRating();});
  document.getElementById('inWid').addEventListener('input',function(e){APP.plot.width=Math.max(5,parseFloat(e.target.value)||5);updateArea();updateRating();});
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
