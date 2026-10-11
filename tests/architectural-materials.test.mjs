import test from 'node:test';
import assert from 'node:assert/strict';
import {architecturalTextures,applyMeterTextureScale} from '../dist/architectural-materials.mjs';
function textures(){const old=globalThis.document;const canvases=[];globalThis.document={createElement(){const canvas={getContext:()=>({fillRect(){},getImageData:()=>({data:new Uint8ClampedArray(256*256*4)}),putImageData(image){canvas.pixels=image.data;}})};canvases.push(canvas);return canvas;}};try{return architecturalTextures({CanvasTexture:class{constructor(canvas){this.image=canvas;this.repeat={set:(x,y)=>{this.repeats=[x,y];}};}},RepeatWrapping:1,SRGBColorSpace:'srgb'});}finally{globalThis.document=old;}}
test('wood floor has restrained grain contrast and deterministic neutral modulation',()=>{const a=textures().wood.image.pixels,b=textures().wood.image.pixels;let min=255,max=0;for(let i=0;i<a.length;i+=4){min=Math.min(min,a[i]);max=Math.max(max,a[i]);assert.equal(a[i],a[i+1]);assert.equal(a[i],a[i+2]);}assert.ok(max-min<=10,`wood modulation range ${max-min} overwhelms floor`);assert.ok(min>=235);assert.deepEqual(a,b);});

test('finish scale follows metre coordinates instead of changing with room size',()=>{
 const points=[[0,0,0],[2.4,0,0],[0,0,4.8]],mapped=[];const geometry={attributes:{position:{count:3,getX:i=>points[i][0],getY:i=>points[i][1],getZ:i=>points[i][2]},normal:{getX:()=>0,getY:()=>1,getZ:()=>0},uv:{setXY:(i,x,y)=>{mapped[i]=[x,y];}}}};
 applyMeterTextureScale(geometry,2.4);assert.deepEqual(mapped,[[0,0],[1,0],[0,2]]);assert.equal(geometry.attributes.uv.needsUpdate,true);assert.deepEqual(points,[[0,0,0],[2.4,0,0],[0,0,4.8]]);
});
