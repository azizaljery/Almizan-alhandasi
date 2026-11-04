// مخططات اصطناعية RECT / L / U بصيغة mizan-draw/1 لاختبار المفاهيم (ليست مشاريع حقيقية).
const W=.25;
function poly(pts,pre){return pts.map((p,i)=>({id:pre+(i+1),level:'L1',a:{x:p[0],y:p[1]},b:{x:pts[(i+1)%pts.length][0],y:pts[(i+1)%pts.length][1]},t:W,h:null,kind:'wall'}));}
// footprints: y يزداد نحو الشمال؛ الجنوب (y الأصغر) هو الواجهة الأمامية.
const FOOT={
  RECT:[[3,3],[17,3],[17,15],[3,15]],
  L:[[3,3],[11,3],[11,7],[17,7],[17,15],[3,15]],
  U:[[3,3],[8,3],[8,8],[12,8],[12,3],[17,3],[17,15],[3,15]],
};
const OPEN={ // لكل جدار: [kind,at(مسافة من البداية),w,h,sill,entry]
  RECT:{1:[['window',3,1.6,1.2,1],['door',7,1.1,2.2,0,true],['window',11,1.6,1.2,1]]},
  L:{1:[['window',2,1.6,1.2,1],['window',5.4,1.2,1.2,1]],3:[['door',2.5,1.1,2.2,0,true],['window',5.5,1.5,1.2,1]]},
  U:{1:[['window',2,1.4,1.2,1]],5:[['window',2,1.4,1.2,1]],3:[['door',1.4,1.1,2.2,0,true]]},
};
export function synthDoc(kind,{levelHeight=3.2,floors=1}={}){
  const pts=FOOT[kind]; if(!pts) throw new Error('SYNTH_KIND '+kind);
  const walls=poly(pts,'w'),openings=[];let n=0;
  const wallsOf=OPEN[kind];
  for(const [idx,list] of Object.entries(wallsOf)){const w=walls[+idx-1]; for(const [k,at,wd,h,sill,entry] of list) openings.push({id:'o'+(++n),level:'L1',wall:w.id,kind:k==='door'?'door2':k,at,w:wd,h,sill,swing:'in',hinge:'left',entry:!!entry});}
  // لبقية الجدران نوافذ إيقاعية بسيطة لكي لا تكون الجهات الأخرى فارغة
  walls.forEach((w,i)=>{if(wallsOf[i+1])return;const L=Math.hypot(w.b.x-w.a.x,w.b.y-w.a.y);if(L>5)openings.push({id:'o'+(++n),level:'L1',wall:w.id,kind:'window',at:L/2,w:1.4,h:1.2,sill:1,swing:'in',hinge:'left',entry:false});});
  return {schema:'mizan-draw/1',title:'اصطناعي '+kind,levels:[{id:'L1',name:'الدور الأرضي',elevation:0,height:levelHeight}],plot:{polygon:[{x:0,y:0},{x:20,y:0},{x:20,y:18},{x:0,y:18}],setbacks:{s:3,n:1.5,e:1.5,w:1.5},streetWidth:null},north:0,entry:'s',roof:{parapet:1.8,overhang:0,parapetTier:'mizan-default'},settings:{grid:.1,defaultThickness:.2},counters:{},walls,openings,labels:[],zones:[],fixtures:[],stairs:[],columns:[],dimensions:[],texts:[],streets:['s'],entries:['s']};
}
