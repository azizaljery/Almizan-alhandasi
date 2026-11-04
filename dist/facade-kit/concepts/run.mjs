// تشغيل مجموعة مفاهيم لمبنى واحد. يُستعمل في الاختبارات والتقرير.
import fs from 'node:fs';
import { buildAllSides, sideTransform } from '../../facade-realism/model.mjs';
import { synthDoc } from './synth.mjs';
import { generate, gateAndSelect, packageConcept } from './generate.mjs';
const FX=new URL('../../../tests/fixtures/facade/',import.meta.url);
export function loadDoc(name){ return ['RECT','L','U'].includes(name)?synthDoc(name):JSON.parse(fs.readFileSync(new URL(name+'.json',FX),'utf8')); }
export function sourceOf(doc){ let built,used; for(const v of ['B','A','C']){ try{ built=buildAllSides(doc,v); used=v; break; }catch(e){ /* بديل المصدر لا يؤثر: النواة تُسقط كل طبقات غير المسقط */ } } if(!built) throw new Error('SOURCE_BUILD_FAILED'); const transforms=Object.fromEntries(Object.keys(built).map(s=>[s,sideTransform(s,built[s].off)])); return {built,transforms,front:doc.entry||'s',sourceVariant:used}; }
export async function runBuilding(name,opts={}){ const doc=loadDoc(name), S=sourceOf(doc); const gen=await generate(S.built,S.front,opts); const sel=gateAndSelect(gen.candidates); return {name,doc,...S,gen,sel}; }
