// Presentation only: all lengths are metres from the saved model. No geometry
// inference, structural design, construction detail, or fixed print scale.
const n=value=>Number(value.toFixed(5));
export function cadWallExtents(model){
  const walls=(model.walls||[]).filter(w=>[w.x1,w.y1,w.x2,w.y2,w.t].every(Number.isFinite)&&w.t>0);
  if(walls.length!==(model.walls||[]).length||!walls.length)return null;
  return {minX:Math.min(...walls.map(w=>Math.min(w.x1,w.x2)-w.t/2)),maxX:Math.max(...walls.map(w=>Math.max(w.x1,w.x2)+w.t/2)),minY:Math.min(...walls.map(w=>Math.min(w.y1,w.y2)-w.t/2)),maxY:Math.max(...walls.map(w=>Math.max(w.y1,w.y2)+w.t/2))};
}
export function cadViewBox(model){const e=cadWallExtents(model);return e?{x:e.minX-2,y:-e.maxY-2,w:e.maxX-e.minX+4,h:e.maxY-e.minY+4}:{x:model.building.x-2,y:-model.building.y-model.building.h-2,w:model.building.w+4,h:model.building.h+4};}
export function cadDimensionLayer(model){
  const e=cadWallExtents(model);if(!e)return '<g data-cad-only="true"><text font-size=".3">سماكات ناقصة: خطوط محاور فقط؛ الفتحات والأبعاد الخارجية غير مقاسة.</text></g>';
  const x=e.minX,right=e.maxX,top=-e.maxY,bottom=-e.minY,y=bottom+.7,dx=right+.8;
  const line=(a,b,c,d,extra='')=>`<line x1="${n(a)}" y1="${n(b)}" x2="${n(c)}" y2="${n(d)}" ${extra}/>`;
  const tick=(a,b)=>line(a-.09,b+.09,a+.09,b-.09);
  return `<g data-cad-only="true" pointer-events="none" fill="#1d252b" stroke="#283138" stroke-width=".018">
    <g data-cad-dimensions="wall-face-extents">${line(x,bottom+.15,x,y+.15)}${line(right,bottom+.15,right,y+.15)}${line(x,y,right,y)}${tick(x,y)}${tick(right,y)}
    <text x="${n((x+right)/2)}" y="${n(y+.38)}" font-size=".28" text-anchor="middle" stroke="none">${n(right-x)} م · الامتداد الخارجي للجدران</text>
    ${line(right+.15,top,dx+.15,top)}${line(right+.15,bottom,dx+.15,bottom)}${line(dx,top,dx,bottom)}${tick(dx,top)}${tick(dx,bottom)}
    <text x="${n(dx+.28)}" y="${n((top+bottom)/2)}" transform="rotate(-90 ${n(dx+.28)} ${n((top+bottom)/2)})" font-size=".28" text-anchor="middle" stroke="none">${n(e.maxY-e.minY)} م · امتداد الجدران</text></g>
    <g data-cad-scale="metres" transform="translate(${n(x)},${n(top-.65)})">${line(0,0,5,0,'stroke-width=".055"')}${[0,1,2,3,4,5].map(i=>line(i,-.1,i,.1)).join('')}<text x="0" y="-.18" font-size=".24" stroke="none">0</text><text x="5" y="-.18" font-size=".24" text-anchor="end" stroke="none">5 م · مقياس رسومي</text></g>
    <text x="${n((x+right)/2)}" y="${n(top-1.45)}" font-size=".27" text-anchor="middle" stroke="none">رسم هندسي أولي من النموذج · ليس مخطط تنفيذ معتمدًا</text>
    <text x="${n((x+right)/2)}" y="${n(bottom+1.55)}" font-size=".23" text-anchor="middle" stroke="none">اتجاه فتح الأبواب توضيحي غير مثبت · رموز النوافذ ليست قطاعات تصنيع</text>
  </g>`;
}
export function architecturalRoomFill(type) {
  if (type === 'bedroom') return '#e5eaf0';
  if (['kitchen','bath','storage','laundry'].includes(type)) return '#e5ece6';
  return '#ece8dd';
}
export function colorPlanLegend(model) {
  const b=model.building, cy=-b.y-b.h-.7;
  return `<g data-color-only="true" data-color-legend="functional" pointer-events="none" font-size=".27" fill="#3d474c" text-anchor="middle"><text x="${n(b.x+b.w/2)}" y="${n(cy)}">ألوان الاستخدام: استقبال ومعيشة · نوم · خدمات</text><text x="${n(b.x+b.w/2)}" y="${n(-b.y+1.15)}" font-size=".23">الجدران والفتحات من النموذج · اتجاه فتح الأبواب توضيحي</text></g>`;
}
export const cadStyles=`
[data-cad-only],[data-color-only]{display:none}
svg[data-plan-mode="color"] [data-color-only]{display:inline}
svg[data-plan-mode="color"] [data-plan-furniture]{display:none}
svg[data-plan-mode="color"] .cad-paper{fill:#fff}
svg[data-plan-mode="color"] .cad-mass{fill:#f1f2ef}
svg[data-plan-mode="color"] .cad-corridor{fill:#fafaf7}
svg[data-plan-mode="color"] .cad-courtyard{fill:#f4f6f2;stroke:#79877b;rx:0}
svg[data-plan-mode="color"] .cad-plot-boundary{fill:none;stroke:#929a99;stroke-width:.025}
svg[data-plan-mode="color"] .cad-buildable{stroke:#9aa49f;stroke-width:.018}
svg[data-plan-mode="color"] .cad-wall{stroke:#333d42}
svg[data-plan-mode="color"] .cad-opening-cut{stroke:#fafaf7}
svg[data-plan-mode="color"] .cad-door{stroke:#596469;stroke-dasharray:.08 .05}
svg[data-plan-mode="color"] .cad-window{stroke:#597d8a}
svg[data-plan-mode="color"] .cad-room-label{fill:#2b353b}
svg[data-plan-mode="color"] .cad-room-label text{stroke:#ffffff90;stroke-width:.035;paint-order:stroke}
svg[data-plan-mode="color"] .plan-room.selected .room-fill{stroke:#465f70;stroke-width:.06}
svg[data-plan-mode="cad"] .cad-entry{fill:#222}
svg[data-plan-mode="cad"] [data-plan-north-arrow]{fill:#222}
svg[data-plan-mode="cad"] [data-plan-north-arrow] path{stroke:#222}
svg[data-plan-mode="cad"] [data-plan-north-label]{fill:#222}
svg[data-plan-mode="cad"] [data-cad-only]{display:inline}
svg[data-plan-mode="cad"] [data-plan-furniture]{display:none}
svg[data-plan-mode="cad"] .cad-paper,svg[data-plan-mode="cad"] .cad-mass,svg[data-plan-mode="cad"] .room-fill,svg[data-plan-mode="cad"] .cad-corridor{fill:#fff}
svg[data-plan-mode="cad"] .cad-room-label{fill:#20282e}
svg[data-plan-mode="cad"] .cad-room-label text{stroke:#fff;stroke-width:.06;paint-order:stroke}
svg[data-plan-mode="cad"] .cad-plot-boundary{fill:none;stroke:#777}
svg[data-plan-mode="cad"] .cad-buildable{stroke:#888}
svg[data-plan-mode="cad"] .cad-courtyard{fill:#fff;stroke:#444;rx:0}
svg[data-plan-mode="cad"] .cad-wall{stroke:#20282e}
svg[data-plan-mode="cad"] [data-wall-thickness-known="false"]{stroke-dasharray:.12 .08}
svg[data-plan-mode="cad"] .cad-opening-cut{stroke:#fff}
svg[data-plan-mode="cad"] .cad-window{stroke:#20282e}
svg[data-plan-mode="cad"] .cad-door{stroke:#20282e;stroke-dasharray:.08 .06}
svg[data-plan-mode="cad"] [data-solar-shadow]{fill:none!important;stroke:#777;stroke-width:.025;stroke-dasharray:.2 .12}
svg[data-plan-mode="cad"] [data-solar-shadow] polygon{fill:none!important;stroke:#777}
svg[data-plan-mode="cad"] .plan-room.selected .room-fill{fill:#fff;stroke:#20282e;stroke-width:.04}
`;
