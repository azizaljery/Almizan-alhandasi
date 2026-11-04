import path from 'node:path';import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
if(!process.argv[2])throw new Error('Usage: node scripts/verify-site-binding.mjs /absolute/repository');
const root=path.resolve(process.argv[2]),native=await import(pathToFileURL(path.join(root,'dist/facade-kit/integration/site-native.mjs'))),policy=JSON.parse(fs.readFileSync(new URL('../config/project-policy.json',import.meta.url))),doc=JSON.parse(fs.readFileSync(new URL('../examples/source-C1.json',import.meta.url)));
const session={createdAt:1,current:0,designs:[{doc:JSON.stringify(doc),version:1},{doc:JSON.stringify(doc),version:2}]};
const actions=native.connectDesignFacade({getSession:()=>session,projectId:'native-test',getPolicy:()=>policy});const cases=[];
for(const style of ['A','B','C']){const e=await actions.call('facade.generate',{style,expectedDocumentHash:await actions.documentHash()});assert.ok((await actions.call('facade.validate',{resultId:e.resultId})).fresh);cases.push({style,resultId:e.resultId,projectBinding:e.result.projectBinding});}
session.current=1;assert.equal((await actions.call('facade.validate',{resultId:cases[0].resultId})).fresh,false);
const editor={doc},studio=native.connectStudioFacade({editor,getProjectId:()=>'editor-test',getPolicy:()=>policy});assert.equal((await studio.reference()).projectId,'editor-test');
console.log(JSON.stringify({status:'PASS',nativeFunctions:true,sessionAlternativeInvalidation:true,studioBinding:true,cases},null,2));
