// تشغيل المراجعة الإنشائية المبدئية (dist/structural-precheck.mjs) على مستندات الأدوار المتعددة ورسم صور التراكب.
// الاستعمال: node scripts/structural-precheck-run.mjs [مجلد المرحلة=evidence/acceptance/after-9] [--out evidence/structural-precheck/r9] [--all-multi] [--no-png]
//   --all-multi : يضيف كل مستند بأكثر من دور في evidence/acceptance/*/ وفي evidence/review-proof/corpus (بلا صور، JSON فقط).
// الصور: لكل بديل ولكل دور صورة: الأرضي (البحور، الأعمدة المقترحة، الفتحات تحت جدران علوية، الدرج)،
// والعلوي (فوق ظل الأرضي: استمرارية الجدران والأعمدة، البروز، الحمامات فوق الرطب، فتحة الدرج).
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { structuralPrecheck, PRECHECK_DISCLAIMER, LIMITS_NOTE } from '../dist/structural-precheck.mjs';
import { frameFor, planLayer, page, legend, renderPNGs, esc } from './plan-overlay-svg.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2), flag = n => argv.includes(n), opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const stage = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--out')) || 'evidence/acceptance/after-9';
const out = join(ROOT, opt('--out') || 'evidence/structural-precheck/r9');
mkdirSync(out, { recursive: true });

const SEV_COLOR = { serious: '#c62828', warn: '#ef8f00', info: '#2f6db5', ok: 'none' };
const SUP = { wall: '#2e9d57', offset: '#ef8f00', bridge: '#7b3fb5', 'free-end': '#d35400', void: '#c62828' };
const COL = { aligned: '#2e9d57', offset: '#ef8f00', 'on-wall': '#d4a017', none: '#c62828', void: '#c62828' };

function draw(doc, rep, li, title) {
  const F = frameFor(doc), lv = doc.levels[li], R = rep.levels[li], b = [];
  const spanFill = r => { const s = R.overlay.spans.find(x => x.room === r.id); return s?.severity === 'serious' ? 'rgba(198,40,40,.22)' : s?.severity === 'warn' ? 'rgba(239,143,0,.20)' : 'rgba(240,235,222,.6)'; };
  if (li > 0) b.push(planLayer(doc, doc.levels[li - 1].id, F, { ghost: true, labels: false }));
  b.push(planLayer(doc, lv.id, F, { roomFill: spanFill }));
  // بحور: رقم في كل فراغ
  for (const s of R.overlay.spans) if (s.at) b.push(`<text x="${F.X(s.at.x)}" y="${F.Y(s.at.y) + 16}" font-size="13" direction="rtl" text-anchor="middle" fill="${s.severity === 'ok' ? '#55606a' : SEV_COLOR[s.severity]}" font-weight="${s.severity === 'ok' ? 400 : 700}">بحر ${s.span.toFixed(2)} م</text>`);
  // الدرج
  for (const st of R.overlay.stair) {
    if (st.foot) for (const p of st.foot) b.push(`<polygon points="${F.poly(p)}" fill="none" stroke="#6b6f74" stroke-width="1"/>`);
    if (st.hole) b.push(`<polygon points="${F.poly(st.hole)}" fill="${li > 0 ? 'rgba(47,109,181,.12)' : 'none'}" stroke="${st.ok ? '#2f6db5' : '#c62828'}" stroke-width="2.5" stroke-dasharray="8 5"/>`);
  }
  // الحمامات العلوية
  for (const w of R.overlay.wet) b.push(`<polygon points="${F.poly(w.poly)}" fill="${w.stacked ? 'rgba(47,109,181,.18)' : 'rgba(198,40,40,.10)'}" stroke="${w.stacked ? '#2f6db5' : '#c62828'}" stroke-width="2" stroke-dasharray="${w.stacked ? '0' : '3 3'}"/>`);
  // البروز
  for (const o of R.overlay.overhang) for (const c of o.cells) b.push(`<rect x="${F.X(c.x - .1)}" y="${F.Y(c.y + .1)}" width="${.2 * F.k}" height="${.2 * F.k}" fill="${SEV_COLOR[o.severity]}" opacity=".28"/>`);
  // استمرارية الجدران العلوية
  for (const s of R.overlay.supports) b.push(`<line x1="${F.X(s.a.x)}" y1="${F.Y(s.a.y)}" x2="${F.X(s.b.x)}" y2="${F.Y(s.b.y)}" stroke="${SUP[s.status]}" stroke-width="5" stroke-linecap="butt"${s.status === 'bridge' || s.status === 'free-end' ? ' stroke-dasharray="9 5"' : ''} opacity=".95"/>`);
  // الفتحات تحت جدران علوية
  for (const l of R.overlay.lintels) b.push(`<line x1="${F.X(l.a.x)}" y1="${F.Y(l.a.y)}" x2="${F.X(l.b.x)}" y2="${F.Y(l.b.y)}" stroke="${l.severity === 'warn' ? '#c62828' : '#2f6db5'}" stroke-width="${l.severity === 'warn' ? 9 : 6}" opacity=".75"/>`);
  // أعمدة الدور السفلي (ظل) وأعمدة هذا الدور
  const sz = .32 * F.k;
  if (li > 0) for (const c of rep.levels[li - 1].columns) b.push(`<rect x="${F.X(c.x) - sz / 2}" y="${F.Y(c.y) - sz / 2}" width="${sz}" height="${sz}" fill="none" stroke="#8d8a82" stroke-width="1.5"/>`);
  const link = new Map((R.overlay.columnLinks || []).map(l => [l.up.id, l]));
  for (const l of R.overlay.columnLinks || []) if (l.down && l.status !== 'aligned') b.push(`<line x1="${F.X(l.up.x)}" y1="${F.Y(l.up.y)}" x2="${F.X(l.down.x)}" y2="${F.Y(l.down.y)}" stroke="${COL[l.status]}" stroke-width="2"/>`);
  for (const c of R.columns) {
    const st = li > 0 ? link.get(c.id)?.status : null, fill = st ? COL[st] : '#4a4f55';
    b.push(`<rect x="${F.X(c.x) - sz / 2 + 2}" y="${F.Y(c.y) - sz / 2 + 2}" width="${sz - 4}" height="${sz - 4}" fill="${fill}" stroke="#111" stroke-width=".8"/>`);
    b.push(`<text x="${F.X(c.x) + sz / 2 + 2}" y="${F.Y(c.y) - sz / 2 - 1}" font-size="10" fill="#555">${c.id.replace(/^L\d+-/, "")}</text>`);
  }
  for (const c of R.overlay.conflicts) b.push(`<circle cx="${F.X(c.x)}" cy="${F.Y(c.y)}" r="${.45 * F.k}" fill="none" stroke="#c62828" stroke-width="3"/>`);
  const items = li > 0
    ? [{ color: SUP.wall, label: 'جدار فوق جدار' }, { color: SUP.offset, label: 'مُزاح' }, { color: SUP.bridge, label: 'على جسر بين ركيزتين', dash: 1 }, { color: SUP['free-end'], label: 'طرف بلا ركيزة', dash: 1 }, { color: SUP.void, label: 'فوق فراغ' },
      { color: COL.aligned, label: 'عمود على عمود', shape: 'sq' }, { color: COL.offset, label: 'عمود مُزاح', shape: 'sq' }, { color: COL['on-wall'], label: 'عمود فوق جدار', shape: 'sq' }, { color: COL.none, label: 'عمود بلا ركيزة', shape: 'sq' }]
    : [{ color: '#4a4f55', label: 'عمود مقترح', shape: 'sq' }, { color: '#2f6db5', label: 'فتحة تحت جدار علوي' }, { color: '#c62828', label: 'فتحة > 3 م تحت جدار / عمود في فتحة' }, { color: 'rgba(239,143,0,.5)', label: 'بحر > 5 م', shape: 'sq' }, { color: 'rgba(198,40,40,.5)', label: 'بحر > 6 م', shape: 'sq' }];
  b.push(legend(F, items, F.H - 100));
  const cnt = rep.findings.filter(f => f.level === lv.id), c = { serious: cnt.filter(f => f.severity === 'serious').length, warn: cnt.filter(f => f.severity === 'warn').length };
  return page(F, `${title} — ${lv.name} — مراجعة إنشائية مبدئية (جسيمة ${c.serious}، تنبيه ${c.warn})`, b.join('\n'), [PRECHECK_DISCLAIMER, LIMITS_NOTE + ' الأعمدة مقترحة آليًا عند تقاطعات الجدران للمراجعة فقط.']);
}

// ---- جمع المستندات
const docs = [];
const stageDir = join(ROOT, stage);
for (const c of readdirSync(stageDir).filter(d => statSync(join(stageDir, d)).isDirectory()).sort((a, b) => +a.slice(1) - +b.slice(1))) {
  for (const f of readdirSync(join(stageDir, c)).filter(f => /^alt-\d+\.json$/.test(f)).sort()) {
    const doc = JSON.parse(readFileSync(join(stageDir, c, f), 'utf8'));
    // (الجولة الحادية عشرة) --all-docs: مستندات الدور الواحد أيضًا (البحور والأعمدة المقترحة والفتحات على التقاطعات) — صور للأدوار المتعددة فقط
    if (doc.levels?.length > 1 || flag('--all-docs')) docs.push({ key: `${c}-${f.replace('.json', '')}`, src: relative(ROOT, join(stageDir, c, f)), doc, png: !flag('--no-png') && (doc.levels?.length > 1 || flag('--png-all')) });
  }
}
if (flag('--all-multi')) {
  const seen = new Set(docs.map(d => createHash('sha256').update(JSON.stringify(d.doc)).digest('hex')));
  const more = [];
  for (const st of readdirSync(join(ROOT, 'evidence/acceptance')).sort()) {
    const dir = join(ROOT, 'evidence/acceptance', st); if (!statSync(dir).isDirectory()) continue;
    for (const c of readdirSync(dir).filter(d => statSync(join(dir, d)).isDirectory())) for (const f of readdirSync(join(dir, c)).filter(f => /^alt-\d+\.json$/.test(f))) more.push(join(dir, c, f));
  }
  const corpus = join(ROOT, 'evidence/review-proof/corpus');
  if (existsSync(corpus)) for (const f of readdirSync(corpus).filter(f => f.endsWith('.json'))) more.push(join(corpus, f));
  for (const p of more.sort()) {
    const j = JSON.parse(readFileSync(p, 'utf8')), doc = j.doc || j;
    if (!(doc.levels?.length > 1)) continue;
    const h = createHash('sha256').update(JSON.stringify(doc)).digest('hex'); if (seen.has(h)) continue; seen.add(h);
    const rel = relative(ROOT, p);
    docs.push({ key: rel.replace(/^evidence\//, '').replace(/[/]/g, '__').replace('.json', ''), src: rel, doc, png: false, extra: true });
  }
}

const jobs = [], summary = { disclaimer: PRECHECK_DISCLAIMER, limitsNote: LIMITS_NOTE, generatedFrom: stage, docs: [] };
for (const d of docs) {
  const t0 = performance.now(), rep = structuralPrecheck(d.doc), ms = Math.round(performance.now() - t0);
  const sub = d.extra ? join(out, 'extra') : out; mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, d.key + '.json'), JSON.stringify({ source: d.src, ms, ...rep, levels: rep.levels.map(({ overlay, ...l }) => ({ ...l, overlay: { ...overlay, overhang: overlay.overhang.map(({ cells, ...o }) => o) } })) }, null, 1));
  const imgs = [];
  if (d.png) d.doc.levels.forEach((_, li) => { const path = join(out, `${d.key}-L${li + 1}.png`); jobs.push({ html: draw(d.doc, rep, li, d.key), path }); imgs.push(relative(ROOT, path)); });
  summary.docs.push({ key: d.key, source: d.src, ms, counts: rep.counts, levels: rep.levels.map(l => ({ id: l.id, columns: l.columns.length, maxSpan: l.maxSpan, columnContinuity: l.columnContinuity, wetStacking: l.wetStacking, shape: l.shape, mass: l.mass })),
    serious: rep.findings.filter(f => f.severity === 'serious').map(f => ({ code: f.code, level: f.level, message: f.message, elements: f.elements })),
    warn: rep.findings.filter(f => f.severity === 'warn').map(f => ({ code: f.code, level: f.level, message: f.message, elements: f.elements })), images: imgs });
  console.log(d.key.padEnd(48), `${ms}ms`, JSON.stringify(rep.counts));
}
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
if (!flag('--no-png')) await renderPNGs(jobs);
console.log('صور:', jobs.length, '→', relative(ROOT, out));
