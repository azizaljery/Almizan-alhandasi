// (طلب المالك 2026-10-31) تفاصيل طراز الواجهة في المجسّم: أحزمة بين الأدوار، تيجان النوافذ، رواق المدخل الكلاسيكي، شرفات الدروة
// النجدية. تُبنى فقط من قطع الجدران الخارجية الحقيقية وفتحاتها (L.solids.segments) — لا فتحة جديدة ولا تغيير للدروة.
// تُستدعى من scene3d.mjs حين يحمل المستند doc.finish.facade.style؛ دونه لا يُستدعى شيء (المجسّم القديم حرفيًا).
import { add, mul, sub } from './geom.mjs';

const exterior = seg => seg.ext !== 0 && seg.kind !== 'fence' && seg.kind !== 'parapet';
const band = (B, key, seg, out, z0, z1, proj, ext = 0) => {
  const face = seg.t / 2, a = add(add(seg.a, mul(out, face)), mul(seg.dir, -ext)), b = add(add(seg.b, mul(out, face)), mul(seg.dir, ext));
  B.prism({ top: key, side: key, bottom: key }, [a, b, add(b, mul(out, proj)), add(a, mul(out, proj))], z0, z1);
};
const post = (B, key, c, half, z0, z1) => B.prism({ top: key, side: key, bottom: key }, [{ x: c.x - half, y: c.y - half }, { x: c.x + half, y: c.y - half }, { x: c.x + half, y: c.y + half }, { x: c.x - half, y: c.y + half }], z0, z1);

/**
 * B: MeshBuilder (الدروة/التفاصيل)، L: بيانات الدور من scene3d، FS: facadeStyle3D(doc)، E/H منسوب الدور وارتفاعه، PL منسوب التشطيب،
 * parapetH ارتفاع الدروة كما في المستند. يعيد سجلًا بما أضيف (للاختبارات والتقرير).
 */
export function emitFacadeDetails(B, L, FS, { E, H, PL, isTop, ground, parapetH }) {
  const log = { strings: 0, hoods: 0, columns: 0, crenels: 0, skippedCrenels: 0 };
  for (const seg of L.solids.segments) {
    if (!exterior(seg)) continue;
    const out = mul(seg.left, seg.ext), side = { x: -out.y, y: out.x };
    // حزام بين الأدوار: أعلى كل دور تحته دور
    if (FS.strings && !isTop) { band(B, 'trim', seg, out, E + H - FS.strings.h / 2, E + H + FS.strings.h / 2, FS.strings.proj, FS.strings.proj); log.strings++; }
    for (const o of seg.openings) {
      const win = o.kind === 'window' || o.kind === 'window2';
      // تاج النافذة (كلاسيكي): لوح بارز فوق الإطار
      if (FS.hoods && win && (ground || FS.spec.orn >= 3)) {
        const hw = o.w / 2 + .3, z = E + o.z1 + .18, q = add(o.center, mul(out, seg.t / 2));
        B.prism({ top: 'trim', side: 'trim', bottom: 'trim' }, [add(q, mul(side, -hw)), add(q, mul(side, hw)), add(add(q, mul(side, hw)), mul(out, .2)), add(add(q, mul(side, -hw)), mul(out, .2))], z, z + .14);
        log.hoods++;
      }
      // رواق المدخل (كلاسيكي): عمودان وتاجاهما وعتبة علوية فوقهما
      if (FS.portico && ground && o.entry && !win) {
        const cw = FS.spec.params.columnW, top = E + Math.min(o.z1 + .7, H - .1), base = E - PL, off = seg.t / 2 + .55;
        for (const s of [-1, 1]) {
          const c = add(add(o.center, mul(out, off)), mul(side, s * (o.w / 2 + .45 + cw / 2)));
          // لا عمود أمام فتحة أخرى على أي جدار خارجي قريب (كما في الرسم ثنائي الأبعاد)
          const blocks = L.solids.segments.some(sg => exterior(sg) && sg.openings.some(q => { if (q === o) return false; const v = sub(c, q.center), along = Math.abs(v.x * sg.dir.x + v.y * sg.dir.y), across = Math.abs(v.x * sg.left.x + v.y * sg.left.y); return along < q.w / 2 + cw / 2 + .11 && across < off + 1; }));
          if (blocks) { log.skippedColumns = (log.skippedColumns || 0) + 1; continue; }
          post(B, 'trim', c, cw / 2, base, top - .18); post(B, 'accent', c, cw / 2 + .07, top - .18, top - .04); post(B, 'accent', c, cw / 2 + .06, base, base + .14 + PL * 0);
          log.columns++;
        }
        const hw = o.w / 2 + .45 + cw + .2, q = add(o.center, mul(out, seg.t / 2));
        B.prism({ top: 'cap', side: 'trim', bottom: 'trim' }, [add(q, mul(side, -hw)), add(q, mul(side, hw)), add(add(q, mul(side, hw)), mul(out, off + cw / 2 + .15)), add(add(q, mul(side, -hw)), mul(out, off + cw / 2 + .15))], top - .04, top + .2);
      }
    }
  }
  // شرفات الدروة (النجدي المقترح): أسنان فوق غطاء الدروة على قطع السطح المكشوف — لا تقلل الدروة، وتُحذف إن تجاوزت أقصى ارتفاع
  if (FS.crenels && isTop && parapetH > 0) {
    const zBase = E + H + parapetH + .07, zTop = zBase + FS.crenels.h;
    if (zTop + PL > FS.maxHeight) log.skippedCrenels++;
    else for (const seg of L.solids.segments) {
      if (seg.kind === 'fence' || seg.kind === 'parapet') continue;
      const sp = seg.sideL || seg.sideR;
      if (!(!seg.sideL || !seg.sideR) || !sp || sp.open || sp.covered) continue;
      const w = FS.crenels.w, n = Math.floor(seg.length / (2 * w)); if (n < 1) continue;
      const start = (seg.length - (2 * n - 1) * w) / 2;
      for (let k = 0; k < n; k++) {
        const u0 = start + 2 * k * w, A = add(seg.a, mul(seg.dir, u0)), Bq = add(seg.a, mul(seg.dir, u0 + w)), n2 = mul(seg.left, seg.t / 2 + .05);
        const quad = (p, q, z0, z1) => B.prism({ top: 'fence', side: 'fence', bottom: 'none' }, [add(p, n2), add(q, n2), add(q, mul(n2, -1)), add(p, mul(n2, -1))], z0, z1);
        if (FS.crenels.kind === 'stepped') { quad(A, Bq, zBase, zBase + FS.crenels.h / 2); quad(add(A, mul(seg.dir, w / 4)), add(A, mul(seg.dir, 3 * w / 4)), zBase + FS.crenels.h / 2, zTop); }
        else { quad(A, Bq, zBase, zBase + FS.crenels.h * .45); quad(add(A, mul(seg.dir, w * .2)), add(A, mul(seg.dir, w * .8)), zBase + FS.crenels.h * .45, zBase + FS.crenels.h * .8); quad(add(A, mul(seg.dir, w * .38)), add(A, mul(seg.dir, w * .62)), zBase + FS.crenels.h * .8, zTop); }
        log.crenels++;
      }
    }
  }
  return log;
}

export default { emitFacadeDetails };
