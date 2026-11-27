import test from 'node:test';import assert from 'node:assert/strict';import {parseFree,qualityReview} from '../../dist/sharaa-v3/quality.mjs';
test('Arabic one design',()=>assert.equal(parseFree('أبي تصميم واحد').proposals[0].value,1));
test('Arabic digits',()=>assert.equal(parseFree('عندي ٣ عيال').proposals[0].value,3));
test('ambiguous counts withheld',()=>assert.equal(parseFree('عندي ٣ عيال وعندي ٤ عيال').proposals.length,0));
test('missing evidence never passes',()=>assert.equal(qualityReview({}).status,'NOT_EVALUATED'));
test('elongated lounge',()=>assert.equal(qualityReview({rooms:[{id:'a',role:'living',rectangular:true,clearWidthM:4,clearDepthM:12}]}).status,'REVIEW_REQUIRED'));
test('private service path',()=>assert.equal(qualityReview({paths:{kitchenDining:{verified:true,lengthM:5,zones:['family_private']}}}).status,'REVIEW_REQUIRED'));
test('same door rejected',()=>assert.equal(qualityReview({entrances:{verified:true,maleDoorId:'a',femaleDoorId:'a',maleZones:[],femaleZones:[]}}).status,'REVIEW_REQUIRED'));
