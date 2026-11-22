// ربط عزيز بالمستند متعدد الأدوار: لا يرفض الطلب لأن فيه أكثر من دور، بل يمرّر كل دور على حدة عبر مقيِّم القيود الصلبة
// في عزيز نفسه (evaluateHardConstraints): صلاحية المضلعات، تراكب الغرف، خروج غرفة عن حدود المبنى.
// ثم تأتي العلاقات بين الأدوار (الدرج وفتحاته، الأعمدة المبللة، دعم الغرف العلوية، محاذاة الأعمدة) في design-review.mjs.
// محلي بالكامل: لا شبكة ولا مفتاح ولا خدمة. إن تعذّر التشغيل لأي سبب يُعاد { status: 'unavailable', reason } ولا يُدّعى أن عزيزًا راجع.
// ما لا يغطيه: برنامج الغرف الأصلي (لا مصدر له في مستند محرَّر)، والمحور الإنشائي، والأحمال.
import { evaluateHardConstraints } from './aziz/hard-constraints.js';
import { defaultConfig } from './aziz/consensus-engine.js';
import { analyzeDoc } from '../draw/digest.mjs';
import { ROOM_TYPES } from '../draw/catalog.mjs';
import { pointInPolygon } from '../draw/geom.mjs';

export const AZIZ_LEVELS_VERSION = 'aziz-levels/1';
export const AZIZ_LEVELS_SCOPE = 'عزيز (محلي) لكل دور: صلاحية المضلعات وتراكب الغرف وحدود المبنى. لا يشمل برنامج الغرف الأصلي ولا الإنشاء.';

const r3 = v => Math.round(v * 1000) / 1000;
const evidenceRooms = ev => (ev || []).map(e => /^room(?:-[ab])?=(.+)$/.exec(e)?.[1]).filter(Boolean);

/** مراجعة عزيز لكل دور. تعيد { status, version, scope, levels[] } أو { status:'unavailable', reason }. */
export function azizReviewLevels(doc, { model = null, constraints = [] } = {}) {
  try {
    const m = model || analyzeDoc(doc), cfg = defaultConfig(), levels = [];
    for (const lv of m.levels) {
      const rooms = lv.rooms.filter(r => !r.unlabelled && r.net && r.net.length >= 3 && !ROOM_TYPES[r.type]?.open);
      const outlines = lv.analysis.outlines || [];
      const row = { levelId: lv.level.id, levelName: lv.level.name, rooms: rooms.length, outlines: outlines.length, evaluated: false, ok: null, violations: [], note: null };
      if (!rooms.length) { row.note = 'لا غرف مسمّاة في هذا الدور.'; levels.push(row); continue; }
      if (!outlines.length) { row.note = 'لا مسقط مغلق للدور: تعذّر بناء حدود المبنى.'; levels.push(row); continue; }
      row.evaluated = true; row.ok = true;
      const owned = new Set();
      outlines.forEach((o, i) => {
        const poly = o.polygon.map(p => ({ x: r3(p.x), y: r3(p.y) }));
        const mine = rooms.filter(r => !owned.has(r.id) && pointInPolygon(r.space?.inside || r.centroid, poly));
        mine.forEach(r => owned.add(r.id));
        if (!mine.length) return;
        const candidate = { candidateId: `${lv.level.id}#${i}`, producedBy: '@mizan/aziz-levels', rooms: mine.map(r => ({ roomId: r.id, type: r.type, zone: 'unspecified', boundary: { points: r.net.map(p => ({ x: r3(p.x), y: r3(p.y) })) }, clearArea: r.area })),
          footprint: { points: poly }, adjacency: [], entryPoints: [], metrics: {} };
        const res = evaluateHardConstraints(candidate, constraints, cfg);
        for (const v of res.violations) { row.ok = false; row.violations.push({ code: v.code, description: v.description, evidence: v.evidence, roomIds: evidenceRooms(v.evidence), outline: i, severity: v.severity }); }
      });
      const lost = rooms.filter(r => !owned.has(r.id));
      if (lost.length) { row.ok = false; for (const r of lost) row.violations.push({ code: 'OUTSIDE_BUILDING_BOUNDARY', description: `الغرفة ${r.name} لا يحتويها أي مسقط مغلق للدور.`, evidence: ['room=' + r.id], roomIds: [r.id], outline: null, severity: 'critical' }); }
      levels.push(row);
    }
    return { status: 'ran', version: AZIZ_LEVELS_VERSION, scope: AZIZ_LEVELS_SCOPE, engine: 'AZIZ evaluateHardConstraints (محلي)', levels };
  } catch (e) {
    return { status: 'unavailable', version: AZIZ_LEVELS_VERSION, scope: AZIZ_LEVELS_SCOPE, reason: String(e?.message || e).slice(0, 240), levels: [] };
  }
}

export default { AZIZ_LEVELS_VERSION, AZIZ_LEVELS_SCOPE, azizReviewLevels };
