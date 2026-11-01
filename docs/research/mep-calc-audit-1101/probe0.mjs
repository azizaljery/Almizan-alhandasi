import { readFileSync } from 'node:fs';
const R='/home/claude/wt-calcaudit/';
const B = await import(R+'dist/mep-binding.mjs');
const doc = JSON.parse(readFileSync(R+'tests/fixtures/mep/C6-v3.json','utf8')).alternatives[0].doc;
const b = await B.bindArchitecture(doc,{alternativeId:'AUDIT',revision:'audit',inputs:B.emptyInputs()});
console.log(b.ok, b.levels.map(l=>[l.id,l.elevationM,l.heightM,l.rooms]));
for (const r of b.project.architecture.rooms) console.log(r.id,r.levelId,r.type,r.name,r.areaM2,r.heightM, JSON.stringify(B.interiorOf(r)));
console.log(JSON.stringify(b.project.rules.routingByLevel).slice(0,300));
