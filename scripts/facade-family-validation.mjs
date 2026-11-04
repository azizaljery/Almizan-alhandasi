// Generate: node scripts/facade-family-validation.mjs generate /absolute/output /outside/repository/review.key
// Lock:     node scripts/facade-family-validation.mjs lock OUTPUT answers.json reviewer-name
// Reveal:   node scripts/facade-family-validation.mjs reveal OUTPUT /outside/repository/review.key
import {sealKey,openKey,externalKeyPath} from './review-vault.mjs';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {runBuilding} from '../dist/facade-kit/concepts/run.mjs';import {elevationSVG} from '../dist/facade-kit/concepts/render2d.mjs';import {compareSignatures} from '../dist/facade-kit/concepts/signature.mjs';
import {hash} from '../dist/facade-kit/src/core.mjs';import {lockJudgements,revealReview,JUDGEMENTS} from '../dist/facade-kit/concepts/blind-review.mjs';
const [mode,dir,arg,reviewer]=process.argv.slice(2);if(!mode||!dir)throw new Error('Specify generate|lock|reveal and output directory');const out=path.resolve(dir),read=p=>JSON.parse(fs.readFileSync(path.join(out,p),'utf8'));
function verifyAssets(bundle){for(const [name,expected]of Object.entries(bundle.assetHashes||{})){if(path.basename(name)!==name)throw new Error('INVALID_ASSET_PATH');const actual=createHash('sha256').update(fs.readFileSync(path.join(out,'review',name))).digest('hex');if(actual!==expected)throw new Error('REVIEW_IMAGE_CHANGED');}}
if(mode==='generate'){
  externalKeyPath(arg,out);
  if(fs.existsSync(out))throw new Error('OUTPUT_ALREADY_EXISTS: use a new review round');fs.mkdirSync(path.join(out,'review'),{recursive:true});fs.mkdirSync(path.join(out,'private'));
  const frozenPaths=['generate.mjs','signature.mjs','families.mjs','vocabulary.mjs','calibration.mjs','causal.mjs'];const frozen=Object.fromEntries(frozenPaths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL('../dist/facade-kit/concepts/'+p,import.meta.url))).digest('hex')]));
  const bundle={schema:'MIZAN-BLIND-FAMILY-REVIEW/1',representation:'2D elevations; Normal is a schematic tone rendering, NOT photorealistic or 3D',pairs:[],assetHashes:{}},key={calibrationSet:['C1','C7'],validationSet:['C4','RECT','L','U'],frozen,independentValidation:'PENDING_HUMAN_JUDGEMENT',pairs:{}};let seq=0;
  for(const name of key.validationSet){const r=await runBuilding(name,{count:12,maxTries:720});const ids=r.sel.offered?.ids||[],selected=ids.map(id=>r.gen.candidates.find(c=>c.id===id));
    for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
      const pairId='P'+String(++seq).padStart(3,'0'),pair={id:pairId,views:{}};const candidates=[selected[i],selected[j]];
      for(const view of ['Normal','Value Grey','Edges']){pair.views[view]=[];for(let k=0;k<2;k++){
        let svg=elevationSVG(r.gen.analysis,candidates[k].comps,view==='Edges'?'edge':'tone',{w:640,h:400});
        if(view==='Normal')svg=svg.replaceAll('rgb(204,204,204)','#d8d0c0').replaceAll('rgb(235,235,235)','#ebe4d6').replaceAll('rgb(77,77,77)','#414d49');
        const file=`${pairId}-${k}-${view.replaceAll(' ','-')}.svg`;fs.writeFileSync(path.join(out,'review',file),svg);pair.views[view].push(file);bundle.assetHashes[file]=createHash('sha256').update(svg).digest('hex');
      }}bundle.pairs.push(pair);
      key.pairs[pairId]={building:name,sourceHash:r.gen.sourceHash,candidates:candidates.map(c=>({id:c.id,key:c.key,family:c.family,signature:c.sig.dims,rankingScore:c.assess.realism.score})),surfaceDependency:{normalDifference:null,valuePreservingDifference:null,edgeDifference:compareSignatures(...candidates.map(c=>c.sig)).edgeZone,uniformGreyDiagnostic:'Expected loss of surface divisions; not a rejection gate',observation:'Normal/value differences NOT_MEASURED; no composite formula'}};
    }
  }
  key.bundleHash=await hash(bundle);fs.writeFileSync(path.join(out,'private/key.enc.json'),JSON.stringify(sealKey(key,arg,out),null,2));fs.writeFileSync(path.join(out,'review/bundle.json'),JSON.stringify(bundle,null,2));
  const cards=bundle.pairs.map(p=>`<section data-pair="${p.id}"><h2>${p.id}</h2>${Object.entries(p.views).map(([v,files])=>`<h3>${v}</h3><div class="pair">${files.map(f=>`<img src="${f}" alt="مقارنة واجهة">`).join('')}</div>`).join('')}<select aria-label="الحكم ${p.id}"><option value="">اختر الحكم</option>${JUDGEMENTS.map(j=>`<option>${j}</option>`).join('')}</select><textarea placeholder="سبب الحكم"></textarea></section>`).join('');
  fs.writeFileSync(path.join(out,'review/index.html'),`<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><title>مراجعة عائلات معمارية معماة</title><style>body{font:16px system-ui;background:#eee;margin:20px}.pair{display:flex}img{width:50%;min-width:0}section{background:white;padding:16px;margin:20px 0}textarea{display:block;width:90%;margin:12px}</style><h1>ثبّت الحكم قبل كشف التصنيف</h1><p>رسوم واجهات ثنائية الأبعاد، وليست لقطات واقعية. لا تظهر هنا تسميات العائلات أو الوصفات أو درجات المولد. لا تستخدم الرمادي الموحد للإسقاط.</p>${cards}<button id="save">حفظ الأحكام</button><script>document.getElementById('save').onclick=()=>{const answers=[...document.querySelectorAll('[data-pair]')].map(s=>({pairId:s.dataset.pair,judgement:s.querySelector('select').value,reason:s.querySelector('textarea').value}));if(answers.some(a=>!a.judgement)){alert('أكمل الأحكام');return;}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(answers,null,2)],{type:'application/json'}));a.download='answers.json';a.click();};</script></html>`);
  console.log(JSON.stringify({pairs:bundle.pairs.length,publicReview:path.join(out,'review'),encryptedKey:path.join(out,'private/key.enc.json'),warning:'Serve ONLY review/ to the reviewer. Decryption key is external; never commit it or show it before decisions are locked.'}));
}else if(mode==='lock'){
  if(fs.existsSync(path.join(out,'review/INVALIDATED.json')))throw new Error('REVIEW_ROUND_EXPOSED: generate a fresh encrypted round and use an unexposed reviewer');
  const bundle=read('review/bundle.json');verifyAssets(bundle);const answers=JSON.parse(fs.readFileSync(arg));const locked=await lockJudgements(bundle,answers,{reviewer,reviewedAt:new Date().toISOString()});fs.writeFileSync(path.join(out,'private/locked.json'),JSON.stringify(locked,null,2),{flag:'wx'});console.log(locked.lockHash);
}else if(mode==='reveal'){
  const bundle=read('review/bundle.json');verifyAssets(bundle);const result=await revealReview(bundle,openKey(read('private/key.enc.json'),arg,out),read('private/locked.json'));fs.writeFileSync(path.join(out,'private/revealed.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(result.status);
}else throw new Error('UNKNOWN_MODE');
