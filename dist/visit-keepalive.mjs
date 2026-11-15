// يجدّد «آخر نشاط» أثناء العمل الفعلي (لمس أو كتابة أو عودة للتبويب) بحدٍّ أقصى مرة كل دقيقة،
// حتى لا يُحسب جلوس طويل في المرسم أو الواجهة خمولًا فيبدأ مشروعًا جديدًا عند العودة للرئيسية.
import { touchVisit } from './project-lifecycle.mjs';
export function keepAlive(win = globalThis) {
  let last = 0;
  const tick = () => { const t = Date.now(); if (t - last < 60_000) return; last = t; try { touchVisit(win.sessionStorage, t); } catch { /* التخزين غير متاح */ } };
  for (const ev of ['pointerdown', 'keydown', 'visibilitychange', 'focus']) { try { win.addEventListener(ev, tick, { passive: true }); } catch { /* بلا أحداث */ } }
}
