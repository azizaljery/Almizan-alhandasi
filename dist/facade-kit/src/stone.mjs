import { copy, freeze, number, fail } from './core.mjs';
import { layerMask, bounds, intersectRect, multiArea, difference, union, EPS } from './polygons.mjs';
export const STONE_DEFAULTS = freeze({ widthM: .6, heightM: .3, jointM: .008, recessM: .012, bevelM: .0015, rowOffset: .5, maxTiles: 12000, originU: 0, originZ: 0, seed: 71, toneVariation: .035 });
export function stoneConfig(raw = {}) {
  const c = { ...STONE_DEFAULTS, ...copy(raw) };
  number(c.widthM,'widthM',.02,4); number(c.heightM,'heightM',.02,4); number(c.jointM,'jointM',0,Math.min(c.widthM,c.heightM)/4);
  number(c.recessM,'recessM',0,.2); number(c.bevelM,'bevelM',0,Math.min(c.widthM,c.heightM)/10); number(c.rowOffset,'rowOffset',0,1);
  number(c.originU,'originU'); number(c.originZ,'originZ'); number(c.toneVariation,'toneVariation',0,.2); number(c.seed,'seed',0,2147483647);
  if (!Number.isInteger(c.maxTiles) || c.maxTiles < 1 || c.maxTiles > 40000) fail('RESOURCE_LIMIT','maxTiles'); return c;
}
export function tileRandom(seed, row, col, channel = 0) { let x = (seed ^ Math.imul(row, 374761393) ^ Math.imul(col, 668265263) ^ Math.imul(channel + 1, 1274126177)) >>> 0; x = Math.imul(x ^ x >>> 13,1274126177); return ((x ^ x >>> 16) >>> 0) / 4294967296; }
/** Exact polygon intersection: partial stones and curved/concave openings are retained and clipped. */
export function cutStoneLayer(layer, rawConfig = {}) {
  const config = stoneConfig(rawConfig), mask = layerMask(layer);
  number(layer.o0, layer.id + '.o0'); number(layer.o1, layer.id + '.o1');
  const thickness = layer.o1 - layer.o0;
  if (thickness <= 0) fail('LAYER_DEPTH',layer.id);
  if (config.recessM >= thickness || config.bevelM * 2 >= thickness) fail('STONE_ENVELOPE_TOO_THIN',layer.id);
  if (!mask.length) return freeze({ layerId:layer.id, config, tiles:[], backing:[], mask:[], backingFrontM:layer.o1-config.recessM, audit:{maskAreaM2:0,stoneAreaM2:0,jointAreaM2:0,outsideAreaM2:0}, status:'EMPTY' });
  const b = bounds(mask), r0 = Math.floor((b.z0-config.originZ)/config.heightM), r1 = Math.ceil((b.z1-config.originZ)/config.heightM);
  if ((r1-r0+1)*(Math.ceil((b.u1-b.u0)/config.widthM)+3)>config.maxTiles*3) fail('STONE_RESOURCE_LIMIT',layer.id);
  const tiles=[]; let total=0;
  for(let row=r0;row<r1;row++) {
    const z=config.originZ+row*config.heightM, offset=((row%2)+2)%2*config.rowOffset*config.widthM;
    const c0=Math.floor((b.u0-config.originU-offset)/config.widthM), c1=Math.ceil((b.u1-config.originU-offset)/config.widthM);
    for(let col=c0;col<c1;col++) {
      const u=config.originU+offset+col*config.widthM, j=config.jointM/2;
      const cut=intersectRect(mask,{u0:u+j,u1:u+config.widthM-j,z0:z+j,z1:z+config.heightM-j});
      if (!cut.length || multiArea(cut)<EPS) continue;
      if(tiles.length>=config.maxTiles) fail('STONE_RESOURCE_LIMIT',layer.id);
      const areaM2=multiArea(cut), variation=(tileRandom(config.seed,row,col)-.5)*2*config.toneVariation;
      tiles.push({ id:`${layer.id}:r${row}:c${col}`,row,col,polygons:cut,areaM2,backM:layer.o0,frontM:layer.o1,variation,uvOffset:[tileRandom(config.seed,row,col,1)*19,tileRandom(config.seed,row,col,2)*19] }); total+=areaM2;
    }
  }
  // Each cell is disjoint by construction. Polygon subtraction provides the exact recessed joint bed.
  const tilePolys=tiles.flatMap(t=>t.polygons), faces=tilePolys.length?union(...tilePolys.map(p=>[p])):[];
  const backing=faces.length?difference(mask,faces):mask;
  const outside=faces.length?multiArea(difference(faces,mask)):0;
  const audit={maskAreaM2:multiArea(mask),stoneAreaM2:total,jointAreaM2:multiArea(backing),outsideAreaM2:outside};
  if(outside>1e-7 || Math.abs(audit.maskAreaM2-total-audit.jointAreaM2)>1e-6*Math.max(1,audit.maskAreaM2)) fail('STONE_AREA_INVARIANT',layer.id);
  return freeze({layerId:layer.id,config,tiles,backing,mask,audit,status:'CUT',backingFrontM:layer.o1-config.recessM});
}
