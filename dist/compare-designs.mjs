// مقارنة تصميمين جنبًا إلى جنب: ما الذي تغيّر موضعه، وفروق المساحات والمواصفات، وعناوين مختصرة بأهم الفروق.
// كل الأرقام مقيسة من المخططين نفسيهما (لا من نية المولّد).
import { visualItems, visualSim, alignSig } from './villa-layout.mjs';
import { summarizeDoc } from './design-session.mjs';

const r1 = v => Math.round(v * 10) / 10;
const KEY_ROOMS = [
  ['الصالة', r => r.name === 'الصالة' || r.name === 'الصالة العائلية'],
  ['المجلس', r => /^(المجلس|مجلس الرجال)$/.test(r.name)],
  ['غرفة النوم الرئيسية', r => r.name === 'غرفة النوم الرئيسية'],
  ['المطبخ', r => r.name === 'المطبخ'],
  ['الطعام', r => /طعام/.test(r.name)],
];
const sumArea = (rooms, f) => rooms.filter(f).reduce((a, r) => a + r.area, 0);

/** الفراغات التي تغيّر موضعها (خانتها في شبكة 3×3) بين التصميمين، لكل جهة. */
export function movedRooms(docA, docB) {
  const A = visualItems(docA), B = visualItems(docB);
  const sa = A.map(x => x.tok), sb = B.map(x => x.tok);
  const refB = [...alignSig(sb, sa)], refA = [...alignSig(sa, sb)];
  const take = (l, t) => { const i = l.indexOf(t); if (i < 0) return false; l.splice(i, 1); return true; };
  const inA = A.filter(x => !take(refB, x.tok)).map(x => x.name), inB = B.filter(x => !take(refA, x.tok)).map(x => x.name);
  return { a: [...new Set(inA.filter(Boolean))], b: [...new Set(inB.filter(Boolean))] };
}

/**
 * compareDesigns(docA, docB, { ledgerA, ledgerB, nameA, nameB })
 * → { sim, moved: {a, b}, rows: [{label, a, b, diff, unit}], headlines: [نص] }
 */
export function compareDesigns(docA, docB, { ledgerA = [], ledgerB = [], nameA = 'الأول', nameB = 'الثاني' } = {}) {
  const SA = summarizeDoc(docA), SB = summarizeDoc(docB);
  const sim = visualSim(docA, docB), moved = movedRooms(docA, docB);
  const corr = S => sumArea(S.rooms, r => /^ممر/.test(r.name)), corrShare = S => (S.specs.net ? 100 * corr(S) / S.specs.net : 0);
  const rows = [
    { label: 'مسطح البناء', a: SA.specs.built, b: SB.specs.built, unit: 'م²' },
    { label: 'المساحة الصافية', a: SA.specs.net, b: SB.specs.net, unit: 'م²' },
    { label: 'أبعاد المبنى', a: `${r1(SA.specs.width)} × ${r1(SA.specs.depth)}`, b: `${r1(SB.specs.width)} × ${r1(SB.specs.depth)}`, unit: 'م' },
    ...KEY_ROOMS.map(([label, f]) => ({ label, a: r1(sumArea(SA.rooms, f)), b: r1(sumArea(SB.rooms, f)), unit: 'م²' })),
    { label: 'دورات المياه', a: SA.specs.baths, b: SB.specs.baths, unit: '' },
    { label: 'نسبة الممرات من الصافي', a: r1(corrShare(SA)), b: r1(corrShare(SB)), unit: '٪' },
    { label: 'بنود طلبك المنفّذة', a: `${ledgerA.filter(x => x.ok).length} من ${ledgerA.length}`, b: `${ledgerB.filter(x => x.ok).length} من ${ledgerB.length}`, unit: '' },
  ].map(r => ({ ...r, diff: typeof r.a === 'number' && typeof r.b === 'number' ? r1(r.b - r.a) : null }));

  // أهم الفروق بلغة العميل: الأكبر أثرًا أولًا، وأربعة على الأكثر
  const H = [];
  for (const r of rows) {
    if (r.diff === null || !['م²'].includes(r.unit) || r.label === 'المساحة الصافية') continue;
    const base = Math.max(1, Math.min(Math.abs(r.a), Math.abs(r.b)));
    if (Math.abs(r.diff) >= 3 && Math.abs(r.diff) / base >= .1) H.push({ w: Math.abs(r.diff), t: `${r.label} ${r.diff > 0 ? 'أكبر' : 'أصغر'} في التصميم ${nameB} بـ ${Math.abs(r.diff)} م²` });
  }
  const cs = rows.find(r => r.label === 'نسبة الممرات من الصافي');
  if (cs && Math.abs(cs.diff) >= 3) H.push({ w: Math.abs(cs.diff) * 2, t: `الممرات ${cs.diff < 0 ? 'أقل' : 'أكثر'} في التصميم ${nameB} (${cs.b}٪ مقابل ${cs.a}٪ من المساحة الصافية)` });
  const keyMoved = moved.b.filter(n => /المجلس|مجلس|الصالة|المطبخ|غرفة النوم الرئيسية|الطعام|المدخل|مدخل/.test(n));
  if (keyMoved.length) H.push({ w: 20 + keyMoved.length, t: `تغيّر موضع ${keyMoved.slice(0, 4).map(n => `«${n}»`).join(' و')} في التصميم ${nameB}` });
  const la = ledgerA.filter(x => x.ok).length, lb = ledgerB.filter(x => x.ok).length;
  if (la !== lb) H.push({ w: 100, t: `التصميم ${lb > la ? nameB : nameA} ينفّذ بنودًا أكثر من طلبك (${Math.max(la, lb)} مقابل ${Math.min(la, lb)})` });
  if (!H.length) H.push({ w: 0, t: `التصميمان متقاربان في المساحات؛ الفرق في ترتيب ${moved.b.length} فراغات` });
  return { sim: Math.round(sim * 100), moved, rows, headlines: H.sort((x, y) => y.w - x.w).slice(0, 4).map(x => x.t) };
}

export default { compareDesigns, movedRooms };
