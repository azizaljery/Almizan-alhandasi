// (الجولة 21 — 02c، قرار المالك 2026-10-26 رابعًا) فرق سماكة الجدار على الضلع الواحد: الجدار الخارجي 0.25 م والقاطع 0.12 م، فإذا كان أحد ضلعي الغرفة
// مقطعًا خارجيًا ومقطعًا داخليًا (0.47 م مثلًا) على استقامة واحدة تقع أوجههما الصافية على خطين بينهما 6.5 سم (نصف الفرق): الصندوق المحيط 4.00 م
// والمستطيل الصافي الأضيق 3.935 م. القياس (clear-dims.mjs) يحسب الأوجه الداخلية النهائية بسماكة كل جدار (insetPolygon بإزاحة لكل ضلع)، فلا يُوسَّع
// السماح (±0.03 «بالضبط»)؛ وهذه الوحدة تصلح الهندسة: تُسوّى الأوجه بجعل المقطع الأرق مساويًا سماكة جاره على الخط نفسه (يُثخَّن ولا يُنحَّف)، وتُقبل
// التسوية فقط إن حقق بند المقاس بقياسه الصافي ولم يُسقط أي بند آخر كان محققًا في سجل الطلب؛ وإلا يُستعاد المستند. الجار على الجهة الأخرى للمقطع
// يخسر نصف الفرق (6.5 سم) في عمق ذلك المقطع — يقيسه السجل ذاته.
import { analyzeDoc } from './draw/digest.mjs';
import { applyCommand } from './draw/doc.mjs';
import { verifyRequest } from './rules.mjs';

const lineDist = (p, w) => { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1; return Math.abs((p.x - w.a.x) * dy - (p.y - w.a.y) * dx) / L; };
/** يسوّي درجات الأوجه على أضلاع غرفة: يعيد قائمة { wall, from, to } التي سُمّكت (يعدّل doc). */
export function flushRoomSteps(doc, roomName) {
  const model = analyzeDoc(doc), done = [];
  for (const lv of model.levels) {
    const room = lv.rooms.find(r => r.name === roomName); if (!room) continue;
    const bySide = new Map(); for (const e of room.edges) { const w = doc.walls.find(x => x.id === e.wallIds?.[0]); if (!w) continue; (bySide.get(e.side) || bySide.set(e.side, []).get(e.side)).push({ e, w }); }
    for (const list of bySide.values()) {
      const thick = list.reduce((m, x) => (x.w.t > m.w.t ? x : m), list[0]);
      for (const x of list) {
        if (x.w.t >= thick.w.t - 0.004 || x.e.exterior || x.w.kind === 'fence') continue;
        const mid = { x: (x.w.a.x + x.w.b.x) / 2, y: (x.w.a.y + x.w.b.y) / 2 };
        if (lineDist(mid, thick.w) > 0.01) continue; // ليس على استقامة جاره: فرق آخر لا فرق سماكة
        const from = x.w.t; Object.assign(doc, applyCommand(doc, { type: 'update', id: x.w.id, patch: { t: thick.w.t } }).doc);
        done.push({ wall: x.w.id, from, to: thick.w.t });
      }
    }
  }
  return done;
}
const stepped = it => it.measure === 'clear-rectangle' && it.envelope && it.actual && ['s', 'l'].some(k => Math.abs(it.envelope[k] - it.actual[k]) > 0.004);
const gap = it => ['s', 'l'].reduce((m, k) => Math.max(m, Math.abs(it.actual[k] - it.want[k])), 0);
/**
 * يسوّي أوجه الغرف ذات المقاس الصريح التي يضيق مستطيلها الصافي عن صندوقها بفرق سماكة الجدار، ثم يقبل التسوية فقط إن (1) لم يبعد البند عن المطلوب
 * (وتحقق إن لم يكن متحققًا)، (2) ولم يُسقط أي بند آخر كان متحققًا في سجل الطلب. وإلا يُستعاد doc. يعدّل doc في مكانه عند القبول.
 * @returns {{notes_ar:string[], flushed:object[], rejected:object[]}}
 */
export function flushDimSteps(doc, requirements, entry) {
  const out = { notes_ar: [], flushed: [], rejected: [] };
  let led; try { led = verifyRequest(doc, requirements || {}, { entry }); } catch { return out; }
  for (const it of led.filter(x => x.kind === 'dims' && x.status !== 'unverified' && stepped(x))) {
    const names = it.failing?.name ? [it.failing.name] : (it.rooms || []);
    const snap = JSON.stringify(doc), cur = verifyRequest(doc, requirements || {}, { entry }), before = new Set(cur.filter(x => x.ok && x.id !== it.id).map(x => x.id)), gap0 = gap(it);
    let done = []; try { for (const n of names) done.push(...flushRoomSteps(doc, n)); } catch { done = []; }
    if (!done.length) { out.rejected.push({ id: it.id, why: 'لا فرق سماكة على استقامة واحدة' }); continue; }
    let led2; try { led2 = verifyRequest(doc, requirements || {}, { entry }); } catch { led2 = null; }
    const now = led2?.find(x => x.id === it.id), broke = led2 ? [...before].filter(id => !led2.find(x => x.id === id)?.ok) : ['?'];
    const better = now && now.actual && gap(now) <= gap0 + 1e-9 && (now.ok || !it.ok ? true : false) && (it.ok ? now.ok : true) && (now.ok || gap(now) < gap0 - 1e-9);
    if (better && !broke.length) { out.flushed.push({ id: it.id, rooms: names, walls: done, before: it.actual, after: now.actual }); out.notes_ar.push(`سُوّيت أوجه ${names.map(n => `«${n}»`).join(' و')} الصافية على ضلع بجدارين مختلفي السماكة (سُمّك ${done.map(d => `${d.wall} من ${d.from} إلى ${d.to} م`).join('، ')}) فصار المستطيل الصافي ${now.actual.s}×${now.actual.l} م بدل ${it.actual.s}×${it.actual.l} م؛ والجار على الجهة الأخرى للمقطع يخسر نصف الفرق (6.5 سم).`); }
    else { const s2 = JSON.parse(snap); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, s2); out.rejected.push({ id: it.id, why: broke.length ? `أسقطت بنودًا كانت محققة: ${broke.join('، ')}` : 'لم تقرّب التسوية بند المقاس' }); }
  }
  return out;
}
export default { flushRoomSteps, flushDimSteps };
