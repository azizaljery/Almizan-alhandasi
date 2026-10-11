import test from 'node:test';
import assert from 'node:assert/strict';
import { PlanViewport, buildPlanSVG } from '../dist/plan-view.mjs';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { solarVectors, solarPreview } from '../dist/solar-path.mjs';
class Node {
  constructor(tag) { this.tagName=tag; this.children=[]; this.attrs={}; this.textContent=''; }
  setAttribute(k,v) { this.attrs[k]=String(v); }
  getAttribute(k) { return this.attrs[k]; }
  append(...nodes) { for(const n of nodes) { n.parent=this; this.children.push(n); } }
  insertBefore(n,other) { n.parent=this; this.children.splice(this.children.indexOf(other),0,n); }
  get firstChild() { return this.children[0]; }
  querySelector(q) { const key=q.slice(1,-1); for(const n of this.children) { if(key in n.attrs) return n; const found=n.querySelector(q); if(found) return found; } return null; }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this),1); }
}
function fixture() {
  const svg=new Node('svg'), bg=new Node('rect'), layer=new Node('g'), building=new Node('rect');
  bg.setAttribute('fill','#f8f7f1'); layer.setAttribute('data-solar-layer','true'); svg.append(bg,layer,building);
  globalThis.document={createElementNS:(_,tag)=>new Node(tag)};
  return Object.assign(Object.create(PlanViewport.prototype),{svg,view:{x:-30,y:-30,w:60,h:60},model:{plot:{width:20,length:20},building:{x:2,y:3,w:4,h:6}}});
}
function points(v) { return v.svg.querySelector('[data-solar-shadow]').children[0].attrs.points.split(' ').map(p=>p.split(',').map(Number)); }
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const [name,az,dx,dy] of [['north',0,0,10],['south',180,0,-10],['east',90,-10,0],['west',270,10,0]]) test(`actual showSolar projects ${name} sun opposite in SVG / world z=-north`,()=>{
  const v=fixture(); v.showSolar({visible:true,azimuth:az,altitude:45,shadowLength:10}); const p=points(v);
  near(Math.min(...p.map(p=>p[0])),2+Math.min(0,dx)); near(Math.max(...p.map(p=>p[0])),6+Math.max(0,dx));
  near(Math.min(...p.map(p=>p[1])),-9+Math.min(0,dy)); near(Math.max(...p.map(p=>p[1])),-3+Math.max(0,dy));
});
test('prism silhouette is convex, includes base and translated roof, and has correct area',()=>{
  const v=fixture(); v.showSolar({visible:true,azimuth:225,altitude:45,shadowLength:Math.sqrt(50)}); const p=points(v);
  const turns=p.map((a,i)=>{const b=p[(i+1)%p.length],c=p[(i+2)%p.length];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
  assert.ok(turns.every(x=>x>=-1e-8)||turns.every(x=>x<=1e-8));
  const area=Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2; near(area,24+4*5+6*5);
});
test('shadow paints above opaque paper and below building',()=>{
  const v=fixture();v.showSolar({visible:true,azimuth:90,altitude:45,shadowLength:10});
  const shadow=v.svg.querySelector('[data-solar-shadow]'),layer=v.svg.querySelector('[data-solar-layer]');
  assert.equal(shadow.parent,layer); assert.equal(v.svg.children.indexOf(layer),1);
});
test('low altitude retains full physical length and explicitly labels viewport clipping',()=>{
  const v=fixture();v.showSolar({visible:true,azimuth:90,altitude:.1,shadowLength:2000});
  near(Math.min(...points(v).map(p=>p[0])),-1998);
  assert.match(v.svg.querySelector('[data-solar-direction]').textContent,/خارج إطار العرض/);
});
test('night and hidden preview remove shadows and labels',()=>{
  const v=fixture();v.showSolar({visible:true,azimuth:90,altitude:45,shadowLength:10});v.showSolar({visible:false,altitude:-1,azimuth:90,shadowLength:null});
  assert.equal(v.svg.querySelector('[data-solar-shadow]'),null);assert.equal(v.svg.querySelector('[data-solar-direction]'),null);
  v.showSolar({visible:true,altitude:45,azimuth:90,shadowLength:10},false);assert.equal(v.svg.querySelector('[data-solar-shadow]'),null);
});

test('generated SVG places the solar layer after paper and before building paint',()=>{
  const model=generateModel({width:20,length:30,floors:1,entry:'s',streets:{s:true}},defaultRooms());
  const svg=buildPlanSVG(model),layer=svg.indexOf('data-solar-layer');
  assert.ok(layer>svg.indexOf('fill="#f8f7f1"'));assert.ok(layer<svg.indexOf('fill="#eceae3"'));
});
test('separate massing prisms remain separate and overlapping shadows use group opacity',()=>{
  const v=fixture();v.model.massingParts=[{x:2,y:3,w:4,h:6},{x:16,y:3,w:2,h:2}];
  v.showSolar({visible:true,azimuth:180,altitude:45,shadowLength:2});
  const group=v.svg.querySelector('[data-solar-shadow]');assert.equal(group.children.length,2);assert.equal(group.attrs.opacity,'.22');
  assert.ok(group.children.every(p=>!('fill-opacity' in p.attrs)));
});
test('clipping notice follows actual viewport changes without changing geometry',()=>{
  const v=fixture();v.showSolar({visible:true,azimuth:90,altitude:45,shadowLength:100});const before=points(v);
  assert.match(v.svg.querySelector('[data-solar-direction]').textContent,/خارج إطار العرض/);
  v.view={x:-110,y:-30,w:160,h:60};v.apply();assert.doesNotMatch(v.svg.querySelector('[data-solar-direction]').textContent,/خارج إطار العرض/);assert.deepEqual(points(v),before);
});
test('preview length and direction equal the shared 3D world projection for actual solar output',()=>{
  const preview=solarPreview({latitude:24.7,month:6,hour:9,wallHeight:3.2}),vectors=solarVectors(preview),v=fixture();v.showSolar(preview);
  const dx=-vectors.world.x/vectors.world.y*preview.wallHeight,svgDy=-vectors.world.z/vectors.world.y*preview.wallHeight;
  const p=points(v);near(Math.min(...p.map(p=>p[0])),2+Math.min(0,dx));near(Math.min(...p.map(p=>p[1])),-9+Math.min(0,svgDy));
});
test('Arabic solar label anchors inside the right viewport edge and follows panning',()=>{
 const v=fixture();v.showSolar({visible:true,azimuth:90,altitude:45,shadowLength:100});
 const label=v.svg.querySelector('[data-solar-direction]');assert.equal(label.attrs.direction,'rtl');assert.equal(label.attrs['text-anchor'],'start');near(Number(label.attrs.x),29.6);
 v.view={x:10,y:-20,w:20,h:20};v.apply();near(Number(label.attrs.x),29.6);near(Number(label.attrs.y),-19.4);
});

test('compass indicates plan +Y until confirmed site north, and rotates independently of shadow visibility or night',()=>{
 const v=fixture(),arrow=new Node('g'),label=new Node('text');arrow.setAttribute('data-plan-north-arrow','');label.setAttribute('data-plan-north-label','');v.svg.append(arrow,label);
 v.showSolar({status:'not-calculated',visible:false});assert.equal(arrow.attrs.transform,'rotate(0)');assert.equal(label.textContent.trim(),'+Y');
 v.showSolar({status:'approximate-site',visible:false,provenance:{northAngleDeg:90}},false);assert.equal(arrow.attrs.transform,'rotate(90)');assert.equal(label.textContent,'N');
 v.showSolar(null,false);assert.equal(label.textContent.trim(),'+Y');assert.equal(arrow.attrs.transform,'rotate(0)');
});
