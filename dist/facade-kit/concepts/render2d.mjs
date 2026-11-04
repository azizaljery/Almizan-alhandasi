// رسم الواجهة كمسقط رأسي (SVG) من الهندسة نفسها: أنماط tone / edge / mass / uniform. لا ألوان.
import { TONE_GREY } from './vocabulary.mjs';
const g=v=>{const n=Math.round(v*255);return `rgb(${n},${n},${n})`;};
export function elevationSVG(analysis, comps, mode='tone', {w=480,h=300,pad=14}={}) {
  const {u0,u1,zTop}=analysis.frame, sx=(w-2*pad)/(u1-u0), sy=(h-2*pad)/zTop, s=Math.min(sx,sy), ox=pad+((w-2*pad)-(u1-u0)*s)/2, oy=(h+zTop*s)/2;
  const X=u=>(ox+(u-u0)*s).toFixed(1), Y=z=>(oy-z*s).toFixed(1);
  const path=poly=>poly.map(r=>'M'+r.map(p=>X(p[0])+','+Y(p[1])).join('L')+'Z').join('');
  let o=`<rect width="${w}" height="${h}" fill="#fff"/>`;
  const bgWall=mode==='edge'?'#fff':mode==='mass'?'#fff':g(TONE_GREY.base);
  for(const p of analysis.pieces){ const b=p.bb; o+=`<rect x="${X(b.u0)}" y="${Y(b.z1)}" width="${((b.u1-b.u0)*s).toFixed(1)}" height="${((b.z1-b.z0)*s).toFixed(1)}" fill="${bgWall}" stroke="#000" stroke-width="${mode==='edge'?2:1}"/>`; }
  for(const c of comps){ const fill=mode==='tone'?g(TONE_GREY[c.tone]):mode==='mass'?'#000':mode==='uniform'?g(TONE_GREY.base):'none';
    o+=`<path d="${path(c.poly)}" fill="${fill}" fill-rule="evenodd" stroke="${mode==='uniform'?'none':'#000'}" stroke-width="${mode==='edge'?1.6:.6}"/>`; }
  for(const p of analysis.pieces)for(const op of p.ops){ const fill=mode==='edge'||mode==='mass'?'#fff':(op.entry?'#2b2b2b':'#6b7378'); o+=`<rect x="${X(op.u0)}" y="${Y(op.z1)}" width="${((op.u1-op.u0)*s).toFixed(1)}" height="${((op.z1-op.z0)*s).toFixed(1)}" fill="${fill}" stroke="#000" stroke-width="${mode==='edge'?1.2:.8}"/>`; if(op.window&&mode==='tone') o+=`<line x1="${X(op.cu)}" x2="${X(op.cu)}" y1="${Y(op.z1)}" y2="${Y(op.z0)}" stroke="#d8d8d8" stroke-width=".8"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${o}</svg>`;
}
