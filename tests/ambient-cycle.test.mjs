import test from 'node:test';
import assert from 'node:assert/strict';
import {cycleState,contrast} from '../dist/ambient-cycle.mjs';
test('one continuous, periodic cycle follows dawn, sunrise, day, sunset and night',()=>{
 assert.deepEqual([0,.14,.38,.64,.79].map(p=>cycleState(p).name),['الفجر','شروق الشمس','النهار','غروب الشمس','الليل']);
 assert.deepEqual(cycleState(0),cycleState(1));
 const a=cycleState(.999999),b=cycleState(0);assert.ok(Math.abs(a.sun-b.sun)<.001);assert.equal(a.sky,b.sky);
});
test('text remains readable throughout the light-to-dark transition',()=>{
 for(let i=0;i<=1000;i++){const s=cycleState(i/1000);assert.ok(contrast(s.ink,s.surface)>=4.5);assert.ok(contrast(s.muted,s.surface)>=4.5);assert.ok(contrast(s.skyInk,s.sky)>=4.5);assert.ok(s.night>=0&&s.night<=1);}
});
