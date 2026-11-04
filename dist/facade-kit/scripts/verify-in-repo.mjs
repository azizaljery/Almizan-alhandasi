import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {fromMizanDraw,planSignature} from '../src/model.mjs';import {hash} from '../src/core.mjs';
if(!process.argv[2])throw new Error('Usage: node scripts/verify-in-repo.mjs /absolute/path/to/Almizan-alhandasi');
const repo=path.resolve(process.argv[2]);
const [{buildAllSides,sideTransform},{validateDoc}]=await Promise.all(['dist/facade-realism/model.mjs','dist/draw/doc.mjs'].map(p=>import(pathToFileURL(path.join(repo,p)).href)));
const doc=JSON.parse(fs.readFileSync(new URL('../examples/source-C1.json',import.meta.url))),before=await hash(doc),checks=validateDoc(doc);assert.ok(!checks.some(x=>x.severity==='error'),JSON.stringify(checks));
const results=[];
for(const style of ['A','B','C']){const envelope=await fromMizanDraw(doc,{buildAllSides,sideTransform,validateDoc,style,frontSide:'s',maxProjectionM:{s:.7,n:0,e:0,w:0}});assert.equal(await hash(doc),before);assert.equal(await hash(planSignature(envelope.sourceBuilt)),envelope.result.sourceGeometryHash);results.push({style,sourceGeometryHash:envelope.result.sourceGeometryHash,tiles:Object.values(envelope.result.cuts).reduce((n,c)=>n+c.tiles.length,0)});}
console.log(JSON.stringify({nativeValidationErrors:0,sourceUnchanged:true,results},null,2));
