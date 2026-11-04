// لوحات إضافية: (1) تغيير اللوحة وحده، (2) رمادي موحّد بلا نغمات (حد الاختبار)، (3) منظور مائل. node scripts/facade-concepts-extra-sheets.mjs <rendersDir> <outDir>
import { createRequire } from 'node:module'; const rq=createRequire(import.meta.url); let sharp; try{sharp=rq('sharp');}catch{sharp=rq('/opt/npm-tools/node_modules/sharp');}
const [,, dir, out]=process.argv; const { runBuilding } = await import('../dist/facade-kit/concepts/run.mjs'); const r=await runBuilding('C1'), ids=r.sel.selected.ids;
const w=560,h=348,g=6; const cap=(W,H,t,x,y)=>`<rect x="${x}" y="${y}" width="${W}" height="24" fill="#000" fill-opacity=".6"/><text x="${x+W-8}" y="${y+17}" text-anchor="start" direction="rtl" font-family="DejaVu Sans" font-size="13" fill="#fff">${t}</text>`;
async function sheet(items,name,cols=3){ const comps=[]; let svg=''; for(const [i,it] of items.entries()){ const c=i%cols,rw=Math.floor(i/cols); comps.push({input:await sharp(it.file).resize(w,h,{fit:'fill'}).modulate(it.mod||{}).png().toBuffer(),left:c*(w+g),top:rw*(h+g)}); svg+=cap(w,h,it.cap,c*(w+g),rw*(h+g)+h-24); }
  const W=cols*w+(cols-1)*g,H=Math.ceil(items.length/cols)*h+(Math.ceil(items.length/cols)-1)*g; await sharp({create:{width:W,height:H,channels:3,background:'#fff'}}).composite([...comps,{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`),left:0,top:0}]).png().toFile(`${out}/${name}`); }
await sheet(['P1','P2','P3'].map(p=>({file:`${dir}/C1-K03-${p}-full-front.png`,cap:`نفس التركيب K03 — لوحة ${p} (ألوان/خامات فقط)`})),'extra-colour-only-C1-K03.png');
await sheet(ids.map(id=>({file:`${dir}/C1-${id}-uniform-front.png`,cap:`${id} — رمادي موحّد بلا نغمات (حد الاختبار)`})),'extra-uniform-grey-C1.png');
await sheet(ids.map(id=>({file:`${dir}/C1-${id}-full-oblique.png`,cap:`${id} — منظور مائل`})),'extra-oblique-C1.png');
console.log('ok');
