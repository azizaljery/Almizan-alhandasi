import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateSiteSolar } from '../dist/site-solar.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/site-solar-spa-reference.json', import.meta.url)));
const rad = Math.PI / 180;
test('documented independent SPA implementation benchmark: eleven synthetic geometric directions', () => {
  for (const row of fixture.cases) {
    const p = calculateSiteSolar(row.input);
    const a = row.reference_geometric_altitude * rad, z = row.reference_azimuth * rad;
    const ref = [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
    const actual = [p.enu.east, p.enu.north, p.enu.up];
    const chord = Math.hypot(...ref.map((v, i) => v - actual[i]));
    const difference = 2 * Math.asin(Math.min(1, chord / 2)) / rad;
    assert.ok(difference < fixture.threshold_deg, `${row.name}: ${difference} degrees`);
  }
});
