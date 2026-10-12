import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
function fixture(){
 const start=source.indexOf('function setStudioMode(mode) {'),end=source.indexOf('\nfunction editPlanAtPoint',start);
 const elements=Object.fromEntries(['studioPlanCard','studio3dCard'].map(id=>[id,{hidden:false}]));
 const buttons=['cad','2d','3d'].map(mode=>({dataset:{studioMode:mode},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}}));
 const model=Object.freeze({rooms:Object.freeze([{id:'r',w:8,h:6}])}),state={model,studioMode:'2d'};
 const modes=[],visibility=[];let fits=0,three=0;
 const context={state,$:id=>elements[id],all:()=>buttons,viewport:{setMode(mode){modes.push(mode);},fit(){fits++;}},viewer:{setVisible(v){visibility.push(v);},resize(){}},requestAnimationFrame:fn=>fn(),show3D(){three++;},switchTab(){}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 return {context,state,model,elements,buttons,modes,visibility,counts:()=>({fits,three})};
}
test('CAD, colored plan and 3D switch presentation without replacing the authoritative model',()=>{
 const f=fixture();f.context.setStudioMode('cad');assert.equal(f.state.studioMode,'cad');assert.equal(f.elements.studioPlanCard.hidden,false);assert.equal(f.elements.studio3dCard.hidden,true);assert.equal(f.modes.at(-1),'cad');
 f.context.setStudioMode('2d');assert.equal(f.modes.at(-1),'color');assert.equal(f.state.model,f.model);
 f.context.setStudioMode('3d');assert.equal(f.elements.studioPlanCard.hidden,true);assert.equal(f.elements.studio3dCard.hidden,false);assert.equal(f.counts().three,1);
 f.context.setStudioMode('cad');assert.equal(f.state.model,f.model);assert.equal(f.buttons[0]['aria-pressed'],'true');assert.equal(f.buttons[1]['aria-pressed'],'false');assert.equal(f.counts().fits,3);
});
test('a new application session starts in CAD before colored and 3D presentation',()=>{
 assert.match(source,/studioMode: 'cad'/);
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('data-studio-mode="cad"')<html.indexOf('data-studio-mode="2d"'));
 assert.ok(html.indexOf('data-studio-mode="2d"')<html.indexOf('data-studio-mode="3d"'));
});
