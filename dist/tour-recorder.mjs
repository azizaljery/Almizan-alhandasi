// Automatic walkthrough (exterior orbit, then a look-around in each room) and an
// optional WebM recording of the 3D canvas. The path is derived from the model's own
// rooms and circulation; recording is local to the browser and nothing is uploaded.

export const FLY = Object.freeze({ orbitMs: 9000, roomMs: 2600, maxRooms: 8, minRooms: 1 });
const ease = t => t * t * (3 - 2 * t);

/** Pure plan: one exterior orbit followed by up to `maxRooms` room stops, in tour order. */
export function planFlythrough(rooms, options = {}) {
  const orbitMs = clamp(options.orbitMs ?? FLY.orbitMs, 2000, 30000), roomMs = clamp(options.roomMs ?? FLY.roomMs, 1000, 10000);
  const list = (Array.isArray(rooms) ? rooms : []).filter(r => r && r.id).slice(0, clamp(options.maxRooms ?? FLY.maxRooms, 0, 24));
  const segments = [{ kind: 'orbit', ms: orbitMs }, ...list.map(room => ({ kind: 'room', id: room.id, name: room.name, ms: roomMs }))];
  return { segments, totalMs: segments.reduce((s, x) => s + x.ms, 0) };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || lo)); }

/** Drive a RoomViewer through the plan. Resolves true when finished, false when aborted. */
export function runFlythrough({ viewer, plan, signal, onProgress, raf = globalThis.requestAnimationFrame?.bind(globalThis), now = () => globalThis.performance.now(), afterFrame }) {
  return new Promise(resolve => {
    if (!viewer?.model || !plan?.segments?.length) { resolve(false); return; }
    let index = 0, started = null, base = null, startTotal = now(), prepared = -1;
    const finish = ok => { resolve(ok); };
    const step = () => {
      if (signal?.aborted || viewer.destroyed || viewer.contextLost) return finish(false);
      const t = now();
      if (prepared !== index) { prepared = index; started = t; prepare(); }
      const seg = plan.segments[index], p = Math.min(1, (t - started) / seg.ms);
      apply(seg, p);
      viewer.render(); afterFrame?.();
      onProgress?.({ index, count: plan.segments.length, segment: seg, elapsedMs: t - startTotal, totalMs: plan.totalMs });
      if (p >= 1) { index++; if (index >= plan.segments.length) return finish(true); }
      raf(step);
    };
    function prepare() {
      const seg = plan.segments[index];
      if (seg.kind === 'orbit') { viewer.cancelTransition?.(); viewer.view('persp', { immediate: true }); base = viewer.orbitPose(); }
      else { if (!viewer.enter(seg.id)) { seg.skipped = true; } base = { yaw: viewer.yaw }; }
    }
    function apply(seg, p) {
      if (seg.kind === 'orbit') viewer.applyOrbit({ ...base, theta: base.theta + Math.PI * 2 * ease(p), phi: base.phi - .2 * Math.sin(Math.PI * p) });
      else if (!seg.skipped) { viewer.yaw = base.yaw + (ease(p) - .5) * Math.PI * .9; }
    }
    raf(step);
  });
}

const MIME = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export function recordingSupported(canvas) {
  return typeof globalThis.MediaRecorder === 'function' && typeof canvas?.captureStream === 'function';
}
/** Start recording a canvas. `stop()` resolves a Blob (or null when nothing was captured). */
export function startRecording(canvas, { fps = 30, bitsPerSecond = 4_000_000 } = {}) {
  if (!recordingSupported(canvas)) throw new Error('المتصفح لا يدعم تسجيل الفيديو من العرض ثلاثي الأبعاد.');
  const stream = canvas.captureStream(0), track = stream.getVideoTracks?.()[0], mimeType = MIME.find(type => globalThis.MediaRecorder.isTypeSupported?.(type));
  const recorder = new globalThis.MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: bitsPerSecond }), chunks = [];
  recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
  recorder.start(250);
  return {
    mimeType: recorder.mimeType || mimeType || 'video/webm',
    frame() { track?.requestFrame?.(); },
    stop() {
      return new Promise(resolve => {
        recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'video/webm' }) : null); };
        if (recorder.state !== 'inactive') recorder.stop(); else recorder.onstop();
      });
    },
  };
}

export default { FLY, planFlythrough, runFlythrough, recordingSupported, startRecording };
