import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSaudiQuality, selectSaudiDesigns, doorRoutes } from '../dist/architect/saudi-quality.mjs';
import { improveServingDoors } from '../dist/architect/serving-doors.mjs';
import { architectVilla } from './fixtures/architect-villa.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { applyCommand, createDoc } from '../dist/draw/doc.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';
import { reviewDesign, planVersion } from '../dist/design-review.mjs';

test('Saudi concept is measured from physical doors and clear room polygons', () => {
  const { doc } = architectVilla(), r = evaluateSaudiQuality(doc);
  assert.deepEqual(r.failed, []); assert.equal(r.eligible, true);
  for (const id of ['independent-entries', 'kitchen-dining', 'men-dining']) assert.equal(r.checks.find(c => c.id === id).state, 'pass', id);
  assert.ok(r.checks.find(c => c.id === 'kitchen-dining').evidence.route.metres > 4, 'room reference points, not zero-distance common door');
});
test('an elongated hall is rejected even when the kitchen/majlis routing is perfect', () => {
  const a = architectVilla({ longHall: true }), r = evaluateSaudiQuality(a.doc);
  assert.ok(r.failed.includes('hall:' + a.ids.hall));
  assert.equal(selectSaudiDesigns([{ doc: a.doc, quality: 99999 }], {}).designs.length, 0);
});
test('a shared wall with no door does not prove dining connectivity', () => {
  const { doc } = architectVilla({ diningDoor: false });
  assert.ok(evaluateSaudiQuality(doc).failed.includes('men-dining'));
});
test('two outside doors into the same men’s room cannot substitute for independent female access', () => {
  const { doc, walls } = architectVilla({ femaleEntry: false });
  const changed = applyCommand(doc, { type: 'add-opening', wall: walls.men[3], kind: 'door', at: 2.5, entry: true }).doc;
  assert.ok(evaluateSaudiQuality(changed).failed.includes('independent-entries'));
});
test('a serving door is added only to a real shared partition, without changing any wall or label', () => {
  const { doc } = architectVilla({ diningDoor: false }), before = JSON.stringify(doc), r = improveServingDoors(doc, {});
  assert.equal(JSON.stringify(doc), before, 'immutable original'); assert.equal(r.changes.length, 1);
  assert.deepEqual(r.doc.walls, doc.walls); assert.deepEqual(r.doc.labels, doc.labels);
  assert.deepEqual(evaluateSaudiQuality(r.doc).failed, []);
  assert.equal(improveServingDoors(doc, {}, { locks: [{ labelId: 'locked' }] }).changes.length, 0);
});
test('actual polygon routing turns around a concavity rather than crossing a wall', () => {
  let doc = createDoc(); const cmd = c => { const r = applyCommand(doc, c); doc = r.doc; return r.ids; };
  const l = cmd({ type: 'add-walls', level: 'L1', closed: true, t: .2, points: [{x:0,y:0},{x:8,y:0},{x:8,y:2},{x:2,y:2},{x:2,y:8},{x:0,y:8}] });
  cmd({type:'add-rect',level:'L1',a:{x:6,y:-4},b:{x:8,y:0},t:.2});
  cmd({type:'add-rect',level:'L1',a:{x:-4,y:6},b:{x:0,y:8},t:.2});
  const label = (x,y,name) => cmd({type:'add-label',level:'L1',seed:{x,y},name,roomType:'corridor'})[0];
  const middle = label(1,1,'L'), from = label(7,-2,'A'), to = label(-2,7,'B');
  cmd({type:'add-opening',wall:l[0],kind:'door',at:7}); cmd({type:'add-opening',wall:l[5],kind:'door',at:1});
  const lv = analyzeDoc(doc).levels[0], route = doorRoutes(lv).between(from,to);
  assert.ok(route && route.metres > 14, JSON.stringify(route));
  assert.ok(route.roomIds.includes(middle));
  for (let i=1;i<route.points.length;i++) { const a=route.points[i-1], b=route.points[i]; if (Math.hypot(a.x-b.x,a.y-b.y)<.25) continue; const p={x:(a.x+b.x)/2,y:(a.y+b.y)/2}; assert.ok(lv.rooms.some(r=>pointInPolygon(p,r.net)), 'midpoint remains in a real room'); }
});
test('unknown accessibility is not certified by a nearby bathroom', () => {
  const r = evaluateSaudiQuality(architectVilla().doc, { parentsResident: true, stepFree: true });
  assert.ok(r.unknown.includes('step-free')); assert.equal(r.eligible, false);
});
test('invalid numeric thresholds cannot silently bypass the quality screen', () => {
 const d={doc:architectVilla().doc};const r=selectSaudiDesigns([d],{limits:{hallAspect:NaN}});assert.equal(r.designs.length,0);assert.ok(r.rejected[0].report.unknown.includes('limits'));
});
test('unified review and version binding include the new contract on manual/merge/chat paths', () => {
  const { doc } = architectVilla({longHall:true}), ctx={requirements:{architect:{enabled:true}}};
  const report=reviewDesign(doc,ctx); assert.ok(report.findings.some(f=>f.source==='architect'&&f.state==='violated'&&f.severity==='mandatory'));
  const changed=structuredClone(doc);changed.labels[0].name='مجلس النساء';
  assert.notEqual(planVersion(doc,ctx).planVersion,planVersion(changed,ctx).planVersion,'role-bearing labels invalidate the report');
  assert.notEqual(planVersion(doc,ctx).planVersion,planVersion(doc,{requirements:{architect:{enabled:true,limits:{hallAspect:2}}}}).planVersion);
});
