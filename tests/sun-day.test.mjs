import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { sunDay, splitInstant, composeInstant, planBearing, compassName, windowFacings, roomSunExposure } from '../dist/sun-day.mjs';

const RIYADH = { latitude: 24.7136, longitude: 46.6753, northAngleDeg: 0, instant: '2026-06-21T12:00:00+03:00' };
const model = () => generateModel({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }, defaultRooms());

test('instant parts round-trip and bad input is rejected', () => {
  assert.deepEqual(splitInstant('2026-06-21T12:30:00+03:00'), { date: '2026-06-21', minute: 750, offset: '+03:00' });
  assert.equal(composeInstant('2026-06-21', 750, '+03:00'), '2026-06-21T12:30:00+03:00');
  assert.equal(splitInstant('غد'), null);
  assert.throws(() => sunDay({ ...RIYADH, instant: 'x' }), /غير صالحة/);
  assert.throws(() => sunDay({ ...RIYADH, stepMinutes: 1 }), /خطوة/);
});

test('Riyadh summer solstice: sun up roughly 05:30 to 18:40 local, peak near 89 degrees, due south at noon is not guessed', () => {
  const day = sunDay(RIYADH);
  assert.equal(day.samples.length, 96);
  assert.ok(day.sunrise >= 5 * 60 && day.sunrise <= 5 * 60 + 45, 'sunrise ' + day.sunrise);
  assert.ok(day.sunset >= 18 * 60 + 15 && day.sunset <= 19 * 60 + 5, 'sunset ' + day.sunset);
  assert.ok(day.peakAltitude > 85 && day.peakAltitude <= 90);
  assert.equal(day.samples[0].above, false);
});

test('winter day is shorter and the sun stays lower', () => {
  const summer = sunDay(RIYADH), winter = sunDay({ ...RIYADH, instant: '2026-12-21T12:00:00+03:00' });
  assert.ok(winter.sunset - winter.sunrise < summer.sunset - summer.sunrise - 120);
  assert.ok(winter.peakAltitude < 45);
});

test('bearing and compass names follow the confirmed north angle', () => {
  assert.equal(Math.round(planBearing(0, 1, 0)), 0);
  assert.equal(compassName(planBearing(0, 1, 0)), 'الشمال');
  assert.equal(compassName(planBearing(1, 0, 0)), 'الشرق');
  assert.equal(compassName(planBearing(0, -1, 0)), 'الجنوب');
  // plan +Y points to true east when north is rotated 270 degrees clockwise from plan +Y
  assert.equal(compassName(planBearing(0, 1, 270)), 'الشرق');
});

test('every window gets an outward normal pointing away from its room', () => {
  const m = model(), facings = windowFacings(m);
  assert.ok(facings.length > 0);
  for (const f of facings) {
    const room = m.rooms.find(r => r.id === f.roomId), wall = m.walls.find(w => w.id === f.wallId);
    const horizontal = Math.abs(wall.y1 - wall.y2) < 1e-9;
    const wallPos = horizontal ? wall.y1 : wall.x1, centre = horizontal ? room.y + room.h / 2 : room.x + room.w / 2;
    assert.equal(Math.sign((horizontal ? f.normal.y : f.normal.x)), Math.sign(wallPos - centre));
  }
});

test('room exposure: a room is never sunnier than the daylight day, windowless rooms get zero, and rotating north changes the answer', () => {
  const m = model(), day = sunDay(RIYADH), lit = day.samples.filter(s => s.visible).length * day.stepMinutes;
  const rows = roomSunExposure(m, day, 0);
  assert.equal(rows.length, m.rooms.length);
  for (const r of rows) {
    assert.ok(r.minutes >= 0 && r.minutes <= lit);
    if (r.windows === 0) assert.equal(r.minutes, 0);
    else assert.ok(r.facings.length >= 1);
  }
  assert.ok(rows.some(r => r.minutes > 0));
  const rotated = roomSunExposure(m, sunDay({ ...RIYADH, northAngleDeg: 90 }), 90);
  assert.notDeepEqual(rows.map(r => r.minutes), rotated.map(r => r.minutes));
});

test('a south-facing window at the winter solstice gets more sun than a north-facing one in Riyadh', () => {
  const day = sunDay({ ...RIYADH, instant: '2026-12-21T12:00:00+03:00' });
  const fake = (nx, ny) => ({ rooms: [{ id: 'r', name: 'غرفة', type: 'bedroom', x: 0, y: 0, w: 4, h: 4 }],
    walls: [nx ? { id: 'w', x1: nx > 0 ? 4 : 0, y1: 0, x2: nx > 0 ? 4 : 0, y2: 4, type: 'ext' } : { id: 'w', x1: 0, y1: ny > 0 ? 4 : 0, x2: 4, y2: ny > 0 ? 4 : 0, type: 'ext' }],
    openings: [{ type: 'window', id: 'o', roomId: 'r', wallId: 'w' }] });
  const south = roomSunExposure(fake(0, -1), day, 0)[0], north = roomSunExposure(fake(0, 1), day, 0)[0];
  assert.ok(south.minutes > 300, 'south ' + south.minutes);
  assert.equal(north.minutes, 0);
  assert.deepEqual(south.facings, ['الجنوب']);
});

import { readFileSync } from 'node:fs';
test('the sun-day panel, its stylesheet and its wiring exist, and it never invents a location', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'), app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8'), ui = readFileSync(new URL('../dist/sun-day-ui.mjs', import.meta.url), 'utf8');
  for (const id of ['sunDay', 'sunDaySlider', 'sunDayPlay', 'sunDayTime', 'sunDayRooms', 'sunDaySummary', 'sunDayLimits']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('./sun-day.css'));
  assert.match(app, /initSunDayUI/);
  assert.match(ui, /تُفعَّل دراسة اليوم بعد اكتمال الموقع والوقت وتأكيد الشمال/);
  assert.match(ui, /preview\.status !== 'not-calculated'/);
});
