// Controls for the studio's automatic walkthrough and its optional local recording.
import { planDrawTour, runDrawTour, recordingSupported, startRecording } from './tour.mjs';
import { withDuration } from './webm-fix.mjs';

/**
 * root: element that holds #autoTour, #recordTour, #stopAutoTour, #autoTourStatus, #tourDownload.
 * ensureViewer({ record }): resolves the ready DrawViewer (3D pane shown, model built) or null; a recording gets the big pane.
 * getEntry(): entry side of the drawing ('s' | 'n' | 'e' | 'w' | null).
 * planOptions(): optional timings / room cap for planDrawTour (see TOUR in tour.mjs).
 */
export function initDrawTourUI({ root, ensureViewer, getEntry = () => null, planOptions = () => ({}), onBusy, onDone }) {
  const $ = id => root.querySelector('#' + id);
  const play = $('autoTour'), rec = $('recordTour'), stop = $('stopAutoTour'), status = $('autoTourStatus'), link = $('tourDownload');
  let abort = null, url = null, busy = false;
  const canRecord = typeof globalThis.MediaRecorder === 'function';
  rec.title = canRecord ? 'يسجّل الجولة فيديو WebM على جهازك فقط' : 'متصفحك لا يدعم تسجيل الفيديو؛ الجولة التلقائية تعمل بدونه.';
  rec.disabled = !canRecord;
  const say = text => { status.hidden = !text; status.textContent = text || ''; };

  function setBusy(value) {
    busy = value; play.disabled = value; rec.disabled = value || !canRecord; stop.hidden = !value;
    onBusy?.(value);
  }
  async function run(record) {
    if (busy) return false;
    setBusy(true); link.hidden = true; say('تجهيز عرض 3D…');
    if (url) { URL.revokeObjectURL(url); url = null; }
    let recorder = null, finished = false, viewer = null, locked = null;
    try {
      viewer = await ensureViewer({ record });
      if (!viewer?.built) { say('ارسم جدرانًا مغلقة أولًا لتبدأ الجولة التلقائية.'); return false; }
      const plan = planDrawTour(viewer.built.rooms.values(), { ...planOptions(), entry: getEntry() });
      if (!plan.rooms) { say('لا توجد غرف مغلقة بعد؛ أغلق الجدران وسمِّ الغرف لتظهر في الجولة.'); return false; }
      if (record) {
        if (!recordingSupported(viewer.canvas)) { say('تعذّر التسجيل في هذا المتصفح؛ تعمل الجولة دون تسجيل.'); record = false; }
      }
      locked = viewer.canvas.style.pointerEvents; viewer.canvas.style.pointerEvents = 'none'; // no dragging while the camera is driven
      abort = new AbortController();
      const t0 = performance.now();
      finished = await runDrawTour({
        viewer, plan, signal: abort.signal, afterFrame: () => {
          // The recorder starts only once the first picture is on the canvas: started earlier, its opening frame is the blank buffer (a black frame at 0:00).
          if (record && !recorder) { recorder = startRecording(viewer.canvas); recorder.frame(); }
          recorder?.frame();
        },
        onProgress: p => { say(`${record ? '⏺ تسجيل · ' : ''}${p.segment.kind === 'orbit' ? 'دورة حول المبنى' : p.segment.kind === 'approach' ? 'الاقتراب من المدخل' : 'داخل ' + p.segment.name} · ${Math.min(100, Math.round(100 * p.elapsedMs / p.totalMs))}٪`); },
      });
      if (recorder) {
        const raw = await recorder.stop(); recorder = null;
        const blob = raw && finished ? await withDuration(raw, performance.now() - t0) : raw; // MediaRecorder leaves the length out; players need it to show and seek
        if (blob && finished) {
          url = URL.createObjectURL(blob); link.href = url; link.download = 'mizan-tour.webm';
          link.textContent = `نزّل الفيديو (${(blob.size / 1048576).toFixed(1)} م.ب · WebM)`; link.hidden = false;
          say('اكتملت الجولة وحُفظ الفيديو على جهازك فقط؛ لم يُرفع إلى أي خادم.');
        } else say(finished ? 'لم يلتقط المتصفح أي إطار؛ جرّب الجولة دون تسجيل.' : 'أُوقفت الجولة قبل اكتمالها ولم يُحفظ فيديو.');
      } else say(finished ? 'اكتملت الجولة التلقائية.' : 'أُوقفت الجولة.');
    } catch (error) { say(error?.message || 'تعذّرت الجولة.'); }
    finally {
      if (recorder) await recorder.stop().catch(() => {});
      if (viewer?.canvas && locked !== null) viewer.canvas.style.pointerEvents = locked;
      if (viewer?.built) { viewer.setMode('orbit', { animate: false }); viewer.frameBuilding(); viewer.requestRender(); }
      abort = null; setBusy(false); onDone?.(finished);
    }
    return finished;
  }
  play.addEventListener('click', () => run(false));
  rec.addEventListener('click', () => run(true));
  stop.addEventListener('click', () => abort?.abort());
  return { run, stop: () => abort?.abort(), get busy() { return busy; } };
}

export default { initDrawTourUI };
