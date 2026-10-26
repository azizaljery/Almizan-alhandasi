/** R21/02b. All coordinates are METRES and represent FINISHED INNER FACES.
 * The polygon is the clear usable footprint; columns/shafts are holes.
 * Axis-aligned orthogonal rooms only; reject unsupported geometry explicitly.
 */
const EPS=1e-8;
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const unique=a=>[...new Set(a)].sort((a,b)=>a-b);
function onEdge(p,a,b){return Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;}
export function pointInPolygon(p,ring){
 if(!Array.isArray(ring)||ring.length<4||!ring.every(validPoint))throw Error('Invalid ring');
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j]; if(onEdge(p,a,b))return true;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside;
}
function orthogonal(r){return Array.isArray(r)&&r.length>=4&&r.every(validPoint)&&r.every((p,i)=>{const q=r[(i+1)%r.length];return (Math.abs(p.x-q.x)<EPS)!==(Math.abs(p.y-q.y)<EPS);});}
export function enumerateClearRectangles(outer,holes=[]){
 if(!orthogonal(outer)||!holes.every(orthogonal))throw Error('Only axis-aligned orthogonal polygons supported');
 const rings=[outer,...holes],xs=unique(rings.flatMap(r=>r.map(p=>p.x))),ys=unique(rings.flatMap(r=>r.map(p=>p.y)));
 const blocked=Array.from({length:xs.length-1},(_,i)=>Array.from({length:ys.length-1},(_,j)=>{const p={x:(xs[i]+xs[i+1])/2,y:(ys[j]+ys[j+1])/2};return !(pointInPolygon(p,outer)&&!holes.some(h=>pointInPolygon(p,h)));}));
 const ps=Array.from({length:xs.length},()=>Array(ys.length).fill(0));
 for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++)ps[i+1][j+1]=Number(blocked[i][j])+ps[i][j+1]+ps[i+1][j]-ps[i][j];
 const found=[];
 for(let i=0;i<xs.length-1;i++)for(let k=i+1;k<xs.length;k++)for(let j=0;j<ys.length-1;j++)for(let l=j+1;l<ys.length;l++){
  if(ps[k][l]-ps[i][l]-ps[k][j]+ps[i][j])continue;
  const rect={x:xs[i],y:ys[j],width:xs[k]-xs[i],height:ys[l]-ys[j]};rect.area=rect.width*rect.height;
  found.push(rect);
 }return found;
}
export function largestClearRectangle(outer,holes=[]){
 const rectangles=enumerateClearRectangles(outer,holes);
 return rectangles.reduce((best,r)=>!best||r.area>best.area?r:best,null);
}
export function toleranceFor(qualifier='unspecified',policy={}){
 const defaults={exact:0.03,unspecified:0.05,approximate:0.30};
 if(!(qualifier in defaults))throw Error('Unknown qualifier');
 const v=policy[qualifier]??defaults[qualifier];
 if(!Number.isFinite(v)||v<0)throw Error('Invalid tolerance');return v;
}
export function validateClearDimensions({outer,holes=[],required,qualifier='unspecified',allowRotation=true,policy={}}){
 if(!required||![required.width,required.height].every(x=>Number.isFinite(x)&&x>0))throw Error('Invalid target dimensions');
 const tol=toleranceFor(qualifier,policy),rectangles=enumerateClearRectangles(outer,holes);
 const clear=rectangles.reduce((best,r)=>!best||r.area>best.area?r:best,null);
 const bx=outer.map(p=>p.x),by=outer.map(p=>p.y);
 const envelope={width:Math.max(...bx)-Math.min(...bx),height:Math.max(...by)-Math.min(...by)};
 const options=[{width:required.width,height:required.height,rotated:false}];
 if(allowRotation&&Math.abs(required.width-required.height)>EPS)options.push({width:required.height,height:required.width,rotated:true});
 const evaluated=options.map(o=>{
  const deviations={width:envelope.width-o.width,height:envelope.height-o.height};
  const envelopeOK=Math.abs(deviations.width)<=tol+EPS&&Math.abs(deviations.height)<=tol+EPS;
  const clearOK=rectangles.some(r=>(r.width+EPS>=o.width-tol&&r.height+EPS>=o.height-tol)||(r.height+EPS>=o.width-tol&&r.width+EPS>=o.height-tol));
  return {...o,deviations,envelopeOK,clearOK,ok:envelopeOK&&clearOK};
 });
 return {ok:evaluated.some(o=>o.ok),tolerance:tol,envelope,largestClearRectangle:clear,evaluated,rule:'CLEAR_DIMENSIONS',source:'client',units:'m'};
}
/** ONLY for centreline coordinates; never subtract wall halves twice. */
export function clearSpanFromCentrelines(span,wallA,wallB){
 if(![span,wallA,wallB].every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid centreline span');
 return span-wallA/2-wallB/2;
}
