import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, earClip, P3 } from '../dist/draw/meshbuilder.mjs';

function windingOk(b) {
  let bad = 0, total = 0;
  for (const k of b.buckets.values()) for (let i = 0; i < k.idx.length; i += 3) {
    const v = j => [k.pos[k.idx[i + j] * 3], k.pos[k.idx[i + j] * 3 + 1], k.pos[k.idx[i + j] * 3 + 2]];
    const a = v(0), b2 = v(1), c = v(2), u = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const g = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const n = [k.nor[k.idx[i] * 3], k.nor[k.idx[i] * 3 + 1], k.nor[k.idx[i] * 3 + 2]];
    total++; if (g[0] * n[0] + g[1] * n[1] + g[2] * n[2] <= 0) bad++;
  }
  return { bad, total };
}

test('box faces wind outwards (rotated and not)', () => {
  const b = new MeshBuilder();
  b.box('m', 1, 1, 1, 2, 1, 3, 0); b.box('m', 5, 1, 1, 2, 1, 3, 0.7);
  const r = windingOk(b);
  assert.equal(r.total, 24); assert.equal(r.bad, 0);
});

test('prism caps and sides face outwards, for CW and CCW input', () => {
  const ccw = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  for (const poly of [ccw, [...ccw].reverse()]) {
    const b = new MeshBuilder(); b.prism('p', poly, 0, 2);
    const r = windingOk(b); assert.equal(r.bad, 0);
    assert.equal(r.total, 6 * 2 + 4 * 2);
  }
});

test('earClip covers the polygon area exactly', () => {
  const poly = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 2, y: 1.5 }, { x: 0, y: 3 }];
  const tris = earClip(poly);
  let area = 0; for (const [a, b, c] of tris) area += ((poly[b].x - poly[a].x) * (poly[c].y - poly[a].y) - (poly[b].y - poly[a].y) * (poly[c].x - poly[a].x)) / 2;
  assert.ok(Math.abs(area - 9) < 1e-9);
});

test('plan to three mapping', () => { assert.deepEqual(P3(2, 3, 1), [2, 1, -3]); });
