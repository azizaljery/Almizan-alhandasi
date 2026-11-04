// لوحة المقارنة: لنفس المبنى ثلاثة مفاهيم جنبًا إلى جنب — ألوان / اختبار الرمادي / الحواف والكتل. node scripts/facade-concepts-sheet.mjs <building> <rendersDir> <out.png>
import { createRequire } from 'node:module'; const rq=createRequire(import.meta.url); let sharp; try{sharp=rq('sharp');}catch{sharp=rq('/opt/npm-tools/node_modules/sharp');}
const [,, building='C1', dir='.', out='sheet.png']=process.argv;
const { runBuilding } = await import('../dist/facade-kit/concepts/run.mjs'); const { elevationSVG } = await import('../dist/facade-kit/concepts/render2d.mjs'); const { ENT_AR,GRP_AR,ZON_AR,ROOF_AR,COR_AR } = await import('../dist/facade-kit/concepts/generate.mjs');
const r=await runBuilding(building), ids=r.sel.selected.ids, picks=ids.map(id=>r.gen.candidates.find(c=>c.id===id));
const w=560,h=348,gap=6,rows=['الألوان والخامات (الرسم الكامل)','اختبار الرمادي (إزالة اللون)','اختبار الحواف والكتل والفتحات'], lab=50, comps=[];
for(const [ci,c] of picks.entries()){ const f=`${dir}/${building}-${c.id}-full-front.png`;
  comps.push({input:await sharp(f).resize(w,h,{fit:'fill'}).png().toBuffer(),left:ci*(w+gap),top:lab});
  comps.push({input:await sharp(f).resize(w,h,{fit:'fill'}).grayscale().png().toBuffer(),left:ci*(w+gap),top:lab+h+gap});
  comps.push({input:await sharp(Buffer.from(elevationSVG(r.gen.analysis,c.comps,'edge',{w,h}))).png().toBuffer(),left:ci*(w+gap),top:lab+2*(h+gap)}); }
const W=3*w+2*gap,H=lab+3*h+2*gap; let svg=`<rect width="${W}" height="${H}" fill="#fff"/>`;
picks.forEach((c,ci)=>{ const x=ci*(w+gap)+w-8,p=c.params; svg+=`<text x="${x}" y="20" text-anchor="start" font-family="DejaVu Sans" font-size="14" font-weight="bold" direction="rtl">${c.id} — ${ENT_AR[p.entrance]} · ${GRP_AR[p.grouping]}</text><text x="${x}" y="40" text-anchor="start" font-family="DejaVu Sans" font-size="12" direction="rtl">${ZON_AR[p.zoning]} · ${ROOF_AR[p.roof]} · ${COR_AR[p.corner]}</text>`; });
rows.forEach((t,ri)=>{ svg+=`<rect x="${W-250}" y="${lab+ri*(h+gap)+h-24}" width="250" height="24" fill="#000" fill-opacity=".55"/><text x="${W-8}" y="${lab+ri*(h+gap)+h-7}" text-anchor="start" font-family="DejaVu Sans" font-size="13" fill="#fff" direction="rtl">${t}</text>`; });
await sharp({create:{width:W,height:H,channels:3,background:'#fff'}}).composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`),left:0,top:0},...comps]).png().toFile(out); console.log(out);
