import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
test('compact primary markup places accepted summary then plan then composer',()=>{assert(html.indexOf('id="studioAcceptedSummary"')>=0);assert(html.indexOf('id="studioAcceptedSummary"')<html.indexOf('id="studioPlanSlot"'));assert.match(html,/<section id="studioPlanSlot"[^>]*><\/section>\s*<form id="studioRequestForm"/);});
test('secondary details and comparison dialog start closed',()=>{for(const id of ['studioLandDetails','studioReviewDetails','studioHistoryDetails','studioAestheticTools','studioPlanTools']){const tag=html.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`))?.[0];assert(tag,id);assert(!/\sopen(?:\s|=|>)/.test(tag));}assert.match(html,/<dialog[^>]*id="studioCompareDialog"/);assert.match(html,/id="studioCompareClose"/);assert.match(html,/id="studioMandatoryIssues"/);});
test('original viewport identities stay unique',()=>{for(const id of ['plan','view','out','alternativeCards','studioBrief'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);});
