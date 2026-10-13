// Sun-study controls: a time-of-day slider, a play button and a per-room table.
// All numbers come from sun-day.mjs; this file only reads and writes the DOM.
import { sunDay, splitInstant, composeInstant, clock, roomSunExposure, SUN_DAY_LIMITS } from './sun-day.mjs';

const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoursText = minutes => {
  if (!minutes) return 'لا شمس مباشرة';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return (h ? h + ' س ' : '') + (m ? m + ' د' : '').trim();
};

export function initSunDayUI({ root, getModel, getInstant, setInstant }) {
  const slider = root.querySelector('#sunDaySlider'), label = root.querySelector('#sunDayTime'), play = root.querySelector('#sunDayPlay'),
    table = root.querySelector('#sunDayRooms'), summary = root.querySelector('#sunDaySummary'), limits = root.querySelector('#sunDayLimits');
  let timer = null, lastKey = '', lastDay = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } play.textContent = '▶ شغّل اليوم'; play.setAttribute('aria-pressed', 'false'); };
  const commit = minute => { const parts = splitInstant(getInstant()); if (parts) setInstant(composeInstant(parts.date, minute, parts.offset)); };

  slider.addEventListener('input', () => { stop(); commit(Number(slider.value)); });
  play.addEventListener('click', () => {
    if (timer) { stop(); return; }
    const parts = splitInstant(getInstant()), day = lastDay;
    if (!parts || !day || day.sunrise === null) return;
    let minute = parts.minute < day.sunrise || parts.minute >= day.sunset - day.stepMinutes ? day.sunrise : parts.minute;
    play.textContent = '⏸ أوقف'; play.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => {
      if (minute >= day.sunset - day.stepMinutes) { stop(); return; }
      commit(minute); minute += day.stepMinutes;
    }, 220);
  });

  function update(preview) {
    root.hidden = false;
    const ok = preview && preview.status !== 'not-calculated' && preview.provenance;
    slider.disabled = play.disabled = !ok;
    if (!ok) { stop(); lastDay = null; lastKey = ''; summary.textContent = 'تُفعَّل دراسة اليوم بعد اكتمال الموقع والوقت وتأكيد الشمال.'; table.innerHTML = ''; limits.textContent = ''; label.textContent = '—'; return; }
    const parts = splitInstant(getInstant());
    if (!parts) return;
    slider.value = String(parts.minute); label.textContent = clock(parts.minute);
    const model = getModel(), prov = preview.provenance;
    const key = [parts.date, parts.offset, prov.latitude, prov.longitude, prov.northAngleDeg, model ? JSON.stringify([model.walls?.length, model.openings?.length, model.rooms?.map(r => [r.id, r.x, r.y, r.w, r.h])]) : ''].join('|');
    if (key === lastKey) return;
    lastKey = key;
    try {
      const day = sunDay({ latitude: prov.latitude, longitude: prov.longitude, northAngleDeg: prov.northAngleDeg, instant: getInstant() });
      lastDay = day;
      summary.textContent = day.sunrise === null ? 'الشمس لا تظهر فوق الأفق في هذا اليوم.'
        : `${day.date}: شروق تقريبي ${clock(day.sunrise)} · غروب تقريبي ${clock(day.sunset)} · أعلى ارتفاع ${Math.round(day.peakAltitude)}°.`;
      const rows = model ? roomSunExposure(model, day, prov.northAngleDeg).filter(r => r.type !== 'corridor') : [];
      const max = Math.max(1, ...rows.map(r => r.minutes));
      table.innerHTML = rows.length ? '<table class="sun-day-table"><thead><tr><th>الغرفة</th><th>جهة النوافذ</th><th>شمس مباشرة على النوافذ</th><th>من – إلى</th></tr></thead><tbody>' + rows.map(r => {
        const span = r.windows === 0 ? 'بلا نافذة خارجية' : r.minutes ? clock(r.first) + ' – ' + clock(r.last) : '—';
        return `<tr><th scope="row">${esc(r.name)}</th><td>${r.facings.length ? esc(r.facings.join('، ')) : '—'}</td><td><span class="sun-bar" style="--w:${Math.round(100 * r.minutes / max)}%"></span> ${hoursText(r.minutes)}</td><td>${span}</td></tr>`;
      }).join('') + '</tbody></table>' : '';
      limits.textContent = SUN_DAY_LIMITS;
    } catch (error) { summary.textContent = error.message; table.innerHTML = ''; }
  }
  return { update, stop };
}
