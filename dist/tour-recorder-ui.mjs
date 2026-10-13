// Controls for the automatic walkthrough and its optional local recording.
import { planFlythrough, runFlythrough, recordingSupported, startRecording } from './tour-recorder.mjs';

export function initAutoTourUI({ root, ensure3D, getViewer, getRooms, onDone }) {
  const play = root.querySelector('#autoTour'), rec = root.querySelector('#recordTour'), stop = root.querySelector('#stopAutoTour'),
    status = root.querySelector('#autoTourStatus'), link = root.querySelector('#tourDownload');
  let abort = null, url = null, busy = false;
  const supported = () => recordingSupported(getViewer()?.renderer?.domElement || document.createElement('canvas'));
  rec.title = typeof globalThis.MediaRecorder === 'function' ? '' : 'متصفحك لا يدعم تسجيل الفيديو؛ الجولة التلقائية تعمل بدونه.';
  rec.disabled = typeof globalThis.MediaRecorder !== 'function';

  function setBusy(value) { busy = value; play.disabled = value; rec.disabled = value || typeof globalThis.MediaRecorder !== 'function'; stop.hidden = !value; }
  async function run(record) {
    if (busy) return;
    const rooms = getRooms();
    if (!rooms.length) { status.textContent = 'ولّد مخططًا أولًا لبدء الجولة التلقائية.'; return; }
    setBusy(true); link.hidden = true; status.textContent = 'تجهيز عرض 3D…';
    if (url) { URL.revokeObjectURL(url); url = null; }
    let recorder = null, finished = false;
    try {
      if (!await ensure3D()) { status.textContent = 'تعذر تجهيز 3D؛ المخطط 2D محفوظ.'; return; }
      const viewer = getViewer();
      if (record) {
        if (!supported()) { status.textContent = 'تعذر التسجيل في هذا المتصفح؛ تعمل الجولة دون تسجيل.'; record = false; }
        else recorder = startRecording(viewer.renderer.domElement);
      }
      abort = new AbortController();
      const plan = planFlythrough(rooms);
      finished = await runFlythrough({ viewer, plan, signal: abort.signal, afterFrame: () => recorder?.frame(),
        onProgress: p => { status.textContent = `${record ? '⏺ تسجيل · ' : ''}${p.segment.kind === 'orbit' ? 'دورة حول المبنى' : 'داخل ' + p.segment.name} · ${Math.min(100, Math.round(100 * p.elapsedMs / p.totalMs))}٪`; } });
      viewer.view('persp', { immediate: true });
      if (recorder) {
        const blob = await recorder.stop(); recorder = null;
        if (blob && finished) {
          url = URL.createObjectURL(blob); link.href = url; link.download = 'mizan-tour.webm'; link.textContent = `نزّل الفيديو (${(blob.size / 1048576).toFixed(1)} م.ب · WebM)`; link.hidden = false;
          status.textContent = 'اكتملت الجولة وحُفظ الفيديو على جهازك فقط؛ لم يُرفع إلى أي خادم.';
        } else status.textContent = finished ? 'لم يلتقط المتصفح أي إطار؛ جرّب الجولة دون تسجيل.' : 'أُوقفت الجولة قبل اكتمالها ولم يُحفظ فيديو.';
      } else status.textContent = finished ? 'اكتملت الجولة التلقائية.' : 'أُوقفت الجولة.';
    } catch (error) { status.textContent = error.message; }
    finally { if (recorder) await recorder.stop().catch(() => {}); abort = null; setBusy(false); onDone?.(finished); }
  }
  play.addEventListener('click', () => run(false));
  rec.addEventListener('click', () => run(true));
  stop.addEventListener('click', () => abort?.abort());
  return { run, stop: () => abort?.abort(), get busy() { return busy; } };
}
