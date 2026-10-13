import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planFlythrough, runFlythrough, FLY } from '../dist/tour-recorder.mjs';

test('the plan is one exterior orbit then the rooms in tour order, capped and clamped', () => {
  const rooms = Array.from({ length: 12 }, (_, i) => ({ id: 'r' + i, name: 'غرفة ' + i }));
  const plan = planFlythrough(rooms);
  assert.equal(plan.segments[0].kind, 'orbit');
  assert.equal(plan.segments.length, 1 + FLY.maxRooms);
  assert.deepEqual(plan.segments.slice(1).map(s => s.id), rooms.slice(0, FLY.maxRooms).map(r => r.id));
  assert.equal(plan.totalMs, FLY.orbitMs + FLY.maxRooms * FLY.roomMs);
  assert.equal(planFlythrough([], { orbitMs: 1 }).segments[0].ms, 2000);
  assert.equal(planFlythrough([{ id: 'a' }, null, {}], {}).segments.length, 2);
});

function fakeViewer() {
  return { model: {}, destroyed: false, contextLost: false, yaw: 1, calls: [], poses: [], mode: 'orbit',
    cancelTransition() {}, view(name, o) { this.calls.push(['view', name, o?.immediate]); this.base = { theta: 0.5, phi: .78, radius: 40, x: 1, y: .8, z: -2 }; },
    orbitPose() { return { ...this.base }; }, applyOrbit(p) { this.poses.push(p); }, enter(id) { this.calls.push(['enter', id]); this.mode = 'inside'; this.yaw = 1; return id !== 'bad'; },
    render() { this.calls.push(['render']); } };
}
const clockRaf = () => { let t = 0; const queue = []; return { now: () => t, raf: fn => queue.push(fn), run: (ms = 100) => { while (queue.length) { t += ms; queue.shift()(); } } }; };

test('the flythrough makes a full turn outside, then sweeps the view in each room, and finishes', async () => {
  const v = fakeViewer(), c = clockRaf(), seen = [];
  const done = runFlythrough({ viewer: v, plan: planFlythrough([{ id: 'a' }, { id: 'b' }], { orbitMs: 2000, roomMs: 1000 }), raf: c.raf, now: c.now, onProgress: p => seen.push(p.index) });
  c.run(100);
  assert.equal(await done, true);
  const turn = v.poses.at(-1).theta - 0.5;
  assert.ok(Math.abs(turn - Math.PI * 2) < 1e-9, 'orbit ends one full turn later: ' + turn);
  assert.deepEqual(v.calls.filter(x => x[0] === 'enter').map(x => x[1]), ['a', 'b']);
  assert.ok(v.calls.some(x => x[0] === 'view' && x[1] === 'persp' && x[2] === true));
  assert.ok(Math.abs(v.yaw - (1 + 0.5 * Math.PI * .9)) < 1e-9);
  assert.deepEqual([...new Set(seen)], [0, 1, 2]);
});

test('an unreachable room is skipped without crashing, and abort/destroyed stop the run', async () => {
  const v = fakeViewer(), c = clockRaf();
  const done = runFlythrough({ viewer: v, plan: planFlythrough([{ id: 'bad' }, { id: 'ok' }], { orbitMs: 2000, roomMs: 1000 }), raf: c.raf, now: c.now });
  c.run(250); assert.equal(await done, true);
  assert.equal(v.yaw, v.yaw);
  const ctl = new AbortController(), v2 = fakeViewer(), c2 = clockRaf();
  const aborted = runFlythrough({ viewer: v2, plan: planFlythrough([{ id: 'a' }]), signal: ctl.signal, raf: c2.raf, now: c2.now });
  ctl.abort(); c2.run(100); assert.equal(await aborted, false);
  assert.equal(await runFlythrough({ viewer: { model: null }, plan: planFlythrough([]), raf: () => {}, now: () => 0 }), false);
});

test('recording is local-only: no network call and no upload anywhere in the module', () => {
  const src = readFileSync(new URL('../dist/tour-recorder.mjs', import.meta.url), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src));
});

test('the auto-tour controls and the honest report placeholder are in the page and wired in the app', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'), app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
  for (const id of ['autoTourBox', 'autoTour', 'recordTour', 'stopAutoTour', 'autoTourStatus', 'tourDownload', 'reportSlot', 'reportSoon']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(app, /initAutoTourUI/);
  assert.match(html, /id="reportSoon"[^>]*disabled/);
  assert.match(html, /غير متاح الآن، ولا يُولَّد منه أي ملف/);
});
