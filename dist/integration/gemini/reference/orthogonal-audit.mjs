/**
 * Independent acceptance oracle for orthogonal polygons and axis-aligned rectangles.
 * Not a production renderer or general polygon engine. Native geometry validation is a separate gate.
 * Integrates cells bounded by every polygon/rectangle coordinate; detects compensated missing/excess area.
 */
function point(p) { return !!p && Number.isFinite(p.x) && Number.isFinite(p.y); }
function rect(r) { return !!r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0; }
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}
const inRect = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
export function auditMassing(footprint, parts, courtyards = []) {
  if (!Array.isArray(footprint) || footprint.length < 4 || footprint.some(p => !point(p))) throw new Error('INVALID_POLYGON');
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    if (a.x !== b.x && a.y !== b.y) throw new Error('NON_ORTHOGONAL_UNSUPPORTED');
  }
  if (!Array.isArray(parts) || parts.some(r => !rect(r)) || !Array.isArray(courtyards) || courtyards.some(r => !rect(r))) throw new Error('INVALID_RECTANGLE');
  const xs = new Set(footprint.map(p => p.x)), ys = new Set(footprint.map(p => p.y));
  for (const r of [...parts, ...courtyards]) { xs.add(r.x); xs.add(r.x+r.w); ys.add(r.y); ys.add(r.y+r.h); }
  const xx = [...xs].sort((a,b)=>a-b), yy = [...ys].sort((a,b)=>a-b);
  if (xx.length * yy.length > 250000) throw new Error('AUDIT_RESOURCE_LIMIT');
  let footprintArea=0, unionArea=0, missingArea=0, excessArea=0, overlappingPartsArea=0, courtyardCoveredArea=0;
  for (let i=0;i<xx.length-1;i++) for (let j=0;j<yy.length-1;j++) {
    const x=(xx[i]+xx[i+1])/2, y=(yy[j]+yy[j+1])/2, area=(xx[i+1]-xx[i])*(yy[j+1]-yy[j]);
    const inside = inRing(x,y,footprint), count=parts.filter(r=>inRect(x,y,r)).length;
    if (inside) footprintArea+=area;
    if (count) unionArea+=area;
    if (inside&&!count) missingArea+=area;
    if (!inside&&count) excessArea+=area;
    if (count>1) overlappingPartsArea+=area;
    if (count&&courtyards.some(r=>inRect(x,y,r))) courtyardCoveredArea+=area;
  }
  const toleranceM2=Math.max(1e-6,footprintArea*1e-8), symmetricDifferenceArea=missingArea+excessArea;
  return { footprintArea,unionArea,missingArea,excessArea,symmetricDifferenceArea,overlappingPartsArea,courtyardCoveredArea,toleranceM2,
    pass: footprintArea>0 && symmetricDifferenceArea<=toleranceM2 && overlappingPartsArea<=toleranceM2 && courtyardCoveredArea<=toleranceM2 };
}
export function withinAreaCap(area, cap) {
  if (!Number.isFinite(area) || area<=0) throw new Error('INVALID_AREA');
  if (cap===null) return true;
  if (!Number.isFinite(cap) || cap<=0) throw new Error('INVALID_CAP');
  return area<=cap+Math.max(1e-6,Math.abs(cap)*1e-8);
}
