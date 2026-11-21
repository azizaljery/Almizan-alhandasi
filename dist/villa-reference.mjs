// المحرك المرجعي الهجين: مكتبة مراجع مدروسة + محرك قيود يكيّفها ويفحصها + رجوع إلى المولّد القديم حين لا يناسب أي مرجع.
// خلف مفتاح إيقاف (الافتراضي مغلق): ENGINE_SWITCH.mode = 'legacy' | 'hybrid' | 'reference'، أو requirements.tweaks.engine،
// أو globalThis.MIZAN_ENGINE. المولّد القديم (villa-layout.mjs) يبقى كما هو ولا يُستبدل.
import { instantiate, wireLevel } from './villa-ref-engine.mjs';
import { REFERENCES, eligible } from './villa-ref-library.mjs';
import { adapt } from './villa-ref-units.mjs';
import { checkLevel, checkStack, structureKey } from './villa-ref-check.mjs';
import { snap, r2 } from './villa-ref-core.mjs';
import { applyCommand } from './draw/doc.mjs';
import { verifyRequest } from './rules.mjs';
import { designSignature, signatureSimilarity, COPY_LIMIT } from './design-signature.mjs';

export const REFERENCE_ENGINE_VERSION = 'villa-ref-1';
/** مفتاح الإيقاف: 'legacy' (الافتراضي، المولّد القديم وحده) | 'hybrid' (مراجع أولًا ثم القديم عند العجز) | 'reference' (المراجع وحدها، للمقارنة). */
export const ENGINE_SWITCH = { mode: 'legacy' };
export function engineMode(requirements) {
  const m = requirements?.tweaks?.engine ?? (typeof globalThis !== 'undefined' ? globalThis.MIZAN_ENGINE : undefined) ?? ENGINE_SWITCH.mode;
  return ['hybrid', 'reference'].includes(m) ? m : 'legacy';
}

const MODES = ['pref', 'mid', 'max'];

/**
 * مرشحو المراجع لأرض وبرنامج: يكيّف كل مرجع وخياره بثلاثة أحجام ويفحص الناتج؛ يعيد القائمة مرتبة بالكلفة مع أسباب الرفض.
 * لا يبني مستندات (سريع). kitchenSink: الفائض يذهب للفراغات الماصّة ثم للغرف حتى حدودها القصوى (لا تمديد نسبي).
 */
export function referenceCandidates({ program, W, D, floors = 1, only = null, modes = MODES, flipVariants = false }) {
  const P = adapt(program), narrow = W < 11.2, out = [], rejected = [];
  for (const ref of REFERENCES) {
    if (only && !only.includes(ref.id)) continue;
    if (!eligible(ref, { floors, W, D, narrow, nBeds: program.counts?.bedrooms })) continue;
    for (const [vi, v] of ref.variants.entries()) for (const flip of flipVariants ? [false, true] : [false]) {
      const c = { P, floors, narrow, v };
      let sk; try { sk = ref.build(c); } catch (e) { rejected.push({ ref: ref.id, vi, why: 'build:' + e.message }); continue; }
      const seen = new Set();
      for (const [split, mode] of modes.flatMap(m => [0, 1, 2, 3, 4, 5, 6, 7].map(sp => [sp, m]))) {
        const inst = instantiate(sk, P, { floors, envW: W, envH: D, mode, flipGuest: flip, split });
        if (!inst.ok) { rejected.push({ ref: ref.id, vi, mode, why: inst.why }); if (/^unplaced|empty-zone/.test(inst.why)) break; continue; }
        const key = `${inst.W}x${inst.D}:${split}`; if (seen.has(key)) continue; seen.add(key);
        const wired = inst.levels.map(l => wireLevel(l, { W: inst.W, D: inst.D, prefs: P.prefs }));
        const miss = wired.flatMap((w, i) => w.missing.map(m => ({ ...m, lv: inst.levels[i].lv })));
        if (miss.length) { rejected.push({ ref: ref.id, vi, mode, why: 'wire:' + miss.slice(0, 3).map(m => `${m.a}${m.b ? '>' + m.b : ''}:${m.why}`).join(',') }); continue; }
        const levels = inst.levels.map((l, i) => ({ ...l, doors: wired[i].doors }));
        const env = { W: inst.W, D: inst.D }, chk = levels.map(l => checkLevel(l, env, P, { narrow })), st = checkStack(levels);
        const hard = [...chk.flatMap((c, i) => c.hard.map(h => `${levels[i].lv}:${h}`)), ...st.hard];
        if (hard.length) { rejected.push({ ref: ref.id, vi, mode, why: 'check:' + hard.slice(0, 4).join(',') }); continue; }
        out.push({ ref, vi, v, mode, split, inst, levels, env, cost: chk.reduce((s, c) => s + c.cost, 0) + st.cost, metrics: chk.map(c => c.metrics), stack: st.metrics, key: structureKey(levels, env), P });
      }
    }
  }
  out.sort((a, b) => a.cost - b.cost);
  return { candidates: out, rejected };
}

/** تخطيط مستوى كما يتوقعه drawLevel (نفس شكل realizeLayout). */
export function levelLayout(level, env, { notes = [], mode = 'ref' } = {}) {
  const rooms = level.rooms.map(r => ({ ...r }));
  return { rooms, doors: level.doors, notes, W: env.W, D: env.D, mode, court: null, courtOpen: false, upper: !!level.upper };
}

/** هل يمنع التشابه المعماري الفعلي (بصمة التسليم) اعتبار الناتجين تصميمين مختلفين؟ */
export function sameDesign(docA, docB) {
  const a = designSignature(docA), b = designSignature(docB), s = signatureSimilarity(a, b);
  return { copy: s.copy, whole: s.whole, ground: s.ground };
}
export { COPY_LIMIT };

// ------------------------------------------------------------------------------------------ بناء التصاميم
const MODE_AR = { 'spine-rect': 'صالة وسطى', 'spine-U': 'U', 'spine-atrium': 'فناء مغلق', 'spine-T': 'T', 'spine-L': 'L', 'rows-T': 'صفوف', 'front-court-U': 'فناء أمامي', 'side-court': 'كتلتان', 'narrow-side': 'ممر جانبي' };

/** يبني مستند المرسم لمرشح (دور أو دورين) بنفس مسار المولّد القديم: layoutToDoc ثم الدور العلوي والسلم. */
export function buildDocFor(cand, { land, plot, fp, entry, mirror, title }, kit) {
  const { levels, env } = cand, notes = [`المرجع: «${cand.ref.name}» — ${cand.ref.summary}`];
  const ox = snap((kit.W - env.W) / 2);
  const gl = levelLayout(levels[0], env, { notes, mode: 'ref:' + cand.ref.id });
  let doc = kit.layoutToDoc(gl, { land, plot, fp, entry, mirror, title, ox, Wfull: kit.W });
  if (levels.length > 1) {
    const T = kit.frame(fp, entry, mirror, env.W, ox, kit.W);
    const r = applyCommand(doc, { type: 'add-level', name: 'الدور الأول' }); doc = r.doc;
    doc = kit.drawLevel(doc, levelLayout(levels[1], env, { mode: 'ref:' + cand.ref.id }), { level: r.ids[0], T });
    const sr = levels[0].rooms.find(x => x.id === 'stair');
    if (sr) doc = kit.addStair(doc, sr, T, 'L1');
  }
  return { doc, layout: gl, notes };
}

/**
 * يولّد تصاميم المراجع لأرض وبرنامج بنفس مخرج generateVillaDesigns: { designs, program, W, D, engine }.
 * يرمي VILLA_NO_FIT / VILLA_BUILD_FAILED إن لم يصلح أي مرجع (فيرجع المستدعي إلى المولّد القديم).
 */
export function generateReferenceDesigns({ land, counts, requirements = {}, keep = 4, title = 'تصميم أولي من شرعاء', exclude = [], shown = [], shownMacro = [], floors = 1, maxBuild = 14 }, kit) {
  const program = kit.buildProgram(counts, requirements);
  const plot = kit.validatePlot({ width: Number(land.width), length: Number(land.length), floors: 1, streets: Object.fromEntries((land.streets || []).map(s => [s, true])), entry: land.entries?.[0] || land.entry });
  const fp = kit.generatorFootprint(land, plot), entry = plot.entry; program.entry = entry;
  const W = ['s', 'n'].includes(entry) ? fp.w : fp.h, D = ['s', 'n'].includes(entry) ? fp.h : fp.w;
  const { candidates, rejected } = referenceCandidates({ program, W, D, floors });
  if (globalThis.__villaDebug) globalThis.__villaDebug.refRejected = rejected;
  if (!candidates.length) { const e = Error('لم يصلح أي مرجع لهذه الأرض وهذا البرنامج.'); e.code = 'VILLA_NO_FIT'; e.rejected = rejected; throw e; }
  // مرشح واحد لكل تكوين بنيوي (المرجع + خياره + بصمته الهيكلية)؛ الأحجام المختلفة لنفس التكوين ليست تصاميم مختلفة
  const seenKey = new Set(), picked = [], seenPat = new Set(exclude.map(kit.patCore));
  for (const c of candidates) {
    const k = c.ref.id + '#' + c.vi + '#' + c.key; if (seenKey.has(k)) continue; seenKey.add(k);
    const pat = `ref:${c.ref.id}:${c.vi}:${c.mode}:${c.split}`; if (seenPat.has(pat)) continue;
    picked.push({ ...c, pat });
    if (picked.length >= maxBuild * 2) break;
  }
  const designs = [];
  const tw = requirements.tweaks || {};
  for (const c of picked) {
    if (designs.length >= maxBuild) break;
    try {
      const mirror = kit.hashBit(c.pat);
      const { doc, layout, notes } = buildDocFor({ ...c }, { land, plot, fp, entry, mirror, title }, { ...kit, W });
      const check = kit.checkDoc(doc); if (!check.ok) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: c.pat, why: check.problems }); continue; }
      const relaxed = kit.relaxFixtures(doc), q = kit.quality(relaxed, { bedrooms: program.counts.bedrooms });
      if (q.reject) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: c.pat, why: q.issues }); continue; }
      const ledger = verifyRequest(relaxed, requirements, { entry }), vsig = kit.visualSig(relaxed);
      const vis = shown.length ? Math.max(...shown.map(x => kit.visualSim(vsig, x))) : 0;
      if (shown.length && vis > kit.VISUAL_LIMIT.relaxed) continue;
      const sf = kit.splitFails(ledger, requirements);
      designs.push({ maxBed: kit.maxBedOf(q.metrics), area: c.env.W * c.env.D, doc: relaxed, vsig, visual: r2(vis), macro: 0, blend: 0, penalty: r2(c.cost), architecturalCost: q.architecturalCost, quality: r2(c.cost + q.cost + kit.SOFT_FAIL_COST * sf.soft), same: false, mirror, issues: q.issues, mode: c.ref.id, idea: 'ref-' + c.ref.id + '#' + c.vi, env: { w: c.env.W, d: c.env.D, ox: snap((W - c.env.W) / 2) }, pat: c.pat, notes: [...notes, ...program.notes, ...kit.hallNotes(q.metrics, W, D)].filter(Boolean), summary: c.ref.summary, rooms: layout.rooms, ledger, fails: sf.hard, softFails: sf.soft, newestFail: Math.max(0, ...ledger.filter(x => !x.ok && /^R\d+$/.test(x.id) && !kit.softIds(requirements).has(x.id)).map(x => +x.id.slice(1))), refId: c.ref.id, engineKind: 'reference', refMetrics: { levels: c.metrics, stack: c.stack, key: c.key } });
    } catch (e) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: c.pat, why: e.message }); }
  }
  if (!designs.length) { const e = Error('تعذّر بناء أي بديل مرجعي سليم.'); e.code = 'VILLA_BUILD_FAILED'; throw e; }
  designs.sort((a, b) => a.fails - b.fails || a.quality - b.quality);
  const out = kit.diversify(designs, keep, { prefer: [], seed: !shown.length ? tw.designSeed : null });
  for (const d of out) d.doc = kit.settleDoors(d.doc);
  if (floors === 1) { kit.applyElevators(out, requirements); kit.applyGardens(out, requirements); } else { kit.applyElevators(out, requirements); kit.applyGardens(out, requirements); }
  return { designs: out, program, W: r2(W), D: r2(D), engine: REFERENCE_ENGINE_VERSION, ...(floors === 2 ? { floors: 2 } : {}) };
}
