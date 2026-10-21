// اتساق التراكب بين الدورين (الجولة التاسعة): يُقاس من المستند المرسوم نفسه، لا من تقدير المولّد.
//  (1) كل جدار علوي إما فوق جدار أرضي، أو محمول على جسر يمتد بين ركيزتين (جدار أرضي يعبره أو يلتقي به) بمسافة ≤ 5 م؛
//      «أطول امتداد بلا ركيزة» لكل جدار علوي = أطول مسافة على طوله لا يقع تحتها جدار أرضي ولا ركيزة.
//  (2) لا غرفة علوية فوق فراغ أرضي مكشوف (حديقة/حوش/خارج المبنى): مساحة الغرف العلوية خارج المسقط الأرضي المبني.
//  (3) الحمامات العلوية فوق فراغات رطبة أرضية (حمام/مطبخ/غسيل) ما أمكن: نسبة المتراكب منها (لا حد، مقياس يُعرض).
// الجدران المنخفضة (درابزين «parapet» حول الفراغ المزدوج الارتفاع) لا تُحمل كجدار. قيم تصميمية معلنة لا اشتراطات نظامية.
import { docRooms } from './rules.mjs';

const r2 = v => Math.round(v * 100) / 100;
export const STACK_SPAN_MAX = 5.0; // أقصى امتداد جسر يحمل جدارًا علويًا لا جدار تحته (م)
const TOL_LINE = .2, TOL_PT = .3;

const axisOf = w => (Math.abs(w.a.y - w.b.y) < 1e-6 ? 'h' : Math.abs(w.a.x - w.b.x) < 1e-6 ? 'v' : null);
const seg = w => { const ax = axisOf(w); if (!ax) return null; return ax === 'h' ? { ax, c: w.a.y, s0: Math.min(w.a.x, w.b.x), s1: Math.max(w.a.x, w.b.x), w } : { ax, c: w.a.x, s0: Math.min(w.a.y, w.b.y), s1: Math.max(w.a.y, w.b.y), w }; };

/** تقرير التراكب لمستند بدورين أو أكثر (كل دور فوق الذي تحته). يعيد null لمستند بدور واحد. */
export function stackingReport(doc) {
  if (!doc?.levels || doc.levels.length < 2) return null;
  const { rooms } = docRooms(doc);
  const out = { levels: [] };
  for (let li = 1; li < doc.levels.length; li++) {
    const up = doc.levels[li].id, dn = doc.levels[li - 1].id;
    const G = doc.walls.filter(w => w.level === dn && (w.kind || 'wall') === 'wall').map(seg).filter(Boolean);
    const U = doc.walls.filter(w => w.level === up && (w.kind || 'wall') === 'wall').map(seg).filter(Boolean);
    let worst = { run: 0, wall: null }, unsupportedLen = 0, total = 0;
    for (const u of U) {
      const L = u.s1 - u.s0; if (L < .05) continue; total += L;
      // أجزاء محمولة على جدار أرضي على الخط نفسه
      const cover = G.filter(g => g.ax === u.ax && Math.abs(g.c - u.c) <= TOL_LINE).map(g => [Math.max(u.s0, g.s0), Math.min(u.s1, g.s1)]).filter(([a, b]) => b - a > .02);
      // ركائز نقطية: جدار أرضي عمودي يعبر الخط أو ينتهي عنده
      const pts = G.filter(g => g.ax !== u.ax && u.c >= g.s0 - TOL_PT && u.c <= g.s1 + TOL_PT && g.c >= u.s0 - TOL_PT && g.c <= u.s1 + TOL_PT).map(g => Math.max(u.s0, Math.min(u.s1, g.c)));
      const sup = [...cover, ...pts.map(p => [p, p])].sort((a, b) => a[0] - b[0]);
      // أطول فجوة بين الركائز (طرفا الجدار بلا ركيزة يُعدّان من الفجوة)
      let at = u.s0, run = 0, free = 0;
      for (const [a, b] of sup) { if (a > at) { run = Math.max(run, a - at); free += a - at; } at = Math.max(at, b); }
      if (u.s1 > at) { run = Math.max(run, u.s1 - at); free += u.s1 - at; }
      // جزء فوق ركيزة واحدة فقط بلا تغطية: يُحسب «غير محمول» بطوله، ويُقاس الامتداد بين الركائز
      unsupportedLen += Math.max(0, free - 0);
      if (run > worst.run) worst = { run, wall: u.w.id, at: { ax: u.ax, c: r2(u.c), s0: r2(u.s0), s1: r2(u.s1) } };
    }
    // الغرف العلوية فوق فراغ أرضي غير مبني (تسامح 0.3 م للجدران)
    const g = rooms.filter(x => x.li === li - 1 && !['courtyard', 'balcony'].includes(x.type)), u = rooms.filter(x => x.li === li);
    const cover = q => g.reduce((s, o) => s + Math.max(0, Math.min(q.x1, o.x1 + .3) - Math.max(q.x0, o.x0 - .3)) * Math.max(0, Math.min(q.y1, o.y1 + .3) - Math.max(q.y0, o.y0 - .3)), 0);
    const over = u.filter(q => q.type !== 'void').reduce((s, q) => s + Math.max(0, q.area - cover(q)), 0);
    // الحمامات العلوية فوق فراغ رطب أرضي (تداخل ≥ 1 م²)
    const wetG = g.filter(x => ['bath', 'kitchen', 'laundry'].includes(x.type));
    const ov = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const bathsU = u.filter(x => x.type === 'bath'), stacked = bathsU.filter(b => wetG.some(w => ov(b, w) >= 1));
    out.levels.push({ level: li, maxUnsupportedRun: r2(worst.run), worstWall: worst.wall, worstAt: worst.at || null, unsupportedWallLen: r2(unsupportedLen), upperWallLen: r2(total),
      overGroundVoid: r2(over), wetStacked: stacked.length, wetUpper: bathsU.length, wetStackedPct: bathsU.length ? Math.round(100 * stacked.length / bathsU.length) : null });
  }
  const L1 = out.levels[0];
  return { ...out, maxUnsupportedRun: Math.max(...out.levels.map(l => l.maxUnsupportedRun)), overGroundVoid: r2(out.levels.reduce((a, l) => a + l.overGroundVoid, 0)), wetStackedPct: L1.wetStackedPct, ok: out.levels.every(l => l.maxUnsupportedRun <= STACK_SPAN_MAX + .05 && l.overGroundVoid <= 3) };
}

/** أسباب الرفض بالعربية (فارغة = متسق). */
export function stackingGates(doc) {
  const s = stackingReport(doc); if (!s) return [];
  const why = [];
  for (const l of s.levels) {
    if (l.maxUnsupportedRun > STACK_SPAN_MAX + .05) why.push(`جدار في الدور ${l.level === 1 ? 'الأول' : l.level + 1} يمتد ${l.maxUnsupportedRun} م بلا جدار تحته ولا ركيزة (الحد ${STACK_SPAN_MAX} م).`);
    if (l.overGroundVoid > 3) why.push(`غرف علوية مساحتها ${l.overGroundVoid} م² فوق فراغ أرضي غير مبني.`);
  }
  return why;
}
