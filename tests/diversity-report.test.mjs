import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import {runMultiEngineDesign} from '../dist/multi-engine.mjs';
import {defaultRooms,normalizeRooms,validatePlot} from '../dist/planner.mjs';
test('search reports true candidate and exclusion counts and leaves exhausted prior designs intact',async()=>{
 const plot=validatePlot({width:18,length:22,coverage:.9,entry:'s',streets:{s:true},floors:1}),rooms=normalizeRooms(defaultRooms({majlis:1,halls:1,bedrooms:1,baths:1,dining:0}));
 const first=await runMultiEngineDesign({plot,rooms,seed:1}),s=first.searchEvidence;
 assert.equal(s.attempted,s.generated+s.generationRejected);
 assert.equal(s.generated,s.selected+s.excludedHistory+s.excludedBatch+s.limitDeferred);
 assert.equal(first.models.length,s.reviewed);assert.equal(s.reviewed+s.reviewRejected,s.selected);
 assert.equal(s.generationRejections.length,s.generationRejected);
 assert.ok(first.models.length<6);assert.ok(s.generationRejected>0);
 const before=structuredClone(first.models);
 await assert.rejects(runMultiEngineDesign({plot,rooms,seed:2,previous:first.models}),/تأهل 0.*بقيت البدائل السابقة محفوظة/);
 assert.deepEqual(first.models,before);
});
