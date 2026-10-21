// واجهة سطر الأوامر لإثبات الحركة الفعلية؛ المكتبة نفسها في dist/circulation-proof.mjs (الجولة الحادية عشرة: تستعملها بوابة CIRCULATION في plan-review).
// الاستعمال: node scripts/circulation-proof.mjs [مجلد المرحلة=evidence/acceptance/after-9] [--out evidence/circulation-proof/r9] [--png C7,C1] [--corpus] [--gate]
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stairLayout } from '../dist/draw/stairs3d.mjs';
import { circulationProof, serializable, CIRC_NOTE, CIRC_GATE_LIMITS } from '../dist/circulation-proof.mjs';
export * from '../dist/circulation-proof.mjs';

// ------------------------------------------------------------------------------------------------ CLI
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ROOT = new URL('../', import.meta.url).pathname;
  const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const stage = argv.find((a, i) => !a.startsWith('--') && !['--out', '--png'].includes(argv[i - 1])) || 'evidence/acceptance/after-9';
  const out = join(ROOT, opt('--out') || 'evidence/circulation-proof/r9'); mkdirSync(out, { recursive: true });
  const pngCases = new Set((opt('--png') || 'C7').split(',').filter(Boolean));
  const list = [];
  const dir = join(ROOT, stage);
  for (const c of readdirSync(dir).filter(d => statSync(join(dir, d)).isDirectory()).sort((a, b) => +a.slice(1) - +b.slice(1)))
    for (const f of readdirSync(join(dir, c)).filter(f => /^alt-\d+\.json$/.test(f)).sort()) list.push({ key: `${c}-${f.replace('.json', '')}`, case: c, src: relative(ROOT, join(dir, c, f)), doc: JSON.parse(readFileSync(join(dir, c, f), 'utf8')) });
  if (argv.includes('--corpus')) {
    const cd = join(ROOT, 'evidence/review-proof/corpus');
    for (const f of readdirSync(cd).filter(f => /^(unreachable-room|guest-through-hall|swing-blocked|corridor-075|no-front-door|stairs-room-closed|bedroom-door-majlis)__/.test(f)).sort()) { const j = JSON.parse(readFileSync(join(cd, f), 'utf8')); list.push({ key: 'corpus__' + f.replace('.json', ''), case: 'corpus', src: relative(ROOT, join(cd, f)), doc: j.doc, mutation: j.mutation, expected: j.expected }); }
  }
  const summary = { note: CIRC_NOTE, stage, limits: argv.includes('--gate') ? CIRC_GATE_LIMITS : 'CIRC_LIMITS', docs: [] }, jobs = [];
  const { frameFor, planLayer, page, legend, renderPNGs, esc } = await import('./plan-overlay-svg.mjs');
  for (const d of list) {
    const t0 = performance.now(), rep = circulationProof(d.doc, argv.includes('--gate') ? { limits: CIRC_GATE_LIMITS } : {}), ms = Math.round(performance.now() - t0);
    const sub = d.case === 'corpus' ? join(out, 'corpus') : out; mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, d.key + '.json'), JSON.stringify({ source: d.src, ms, mutation: d.mutation, ...serializable(rep) }, null, 1));
    const row = { key: d.key, source: d.src, ms, counts: rep.counts, mutation: d.mutation || null, entrances: rep.entrances,
      paths: rep.rooms.map(x => ({ room: x.name, level: x.level, zone: x.zone, from: x.from, graph: x.graphReachable, actual: x.actual?.reachable ?? null, toCenter: x.actual?.toCenter ?? null, bareToCenter: x.bare?.toCenter ?? x.tight?.toCenter ?? null, clearance: x.bare?.reachable ? 0.5 : x.tight ? x.tight.clearance : null, straight: x.straight })),
      findings: rep.findings.filter(f => f.severity !== 'info').map(f => ({ severity: f.severity, code: f.code, message: f.message })), images: [] };
    if (pngCases.has(d.case) || (d.case === 'corpus' && argv.includes('--png-corpus'))) {
      d.doc.levels.forEach((lv, li) => {
        const F = frameFor(d.doc), G = rep._grid, b = [];
        const zc = { men: 'rgba(214,176,108,.38)', women: 'rgba(222,160,170,.32)', family: 'rgba(240,235,222,.7)', shared: 'rgba(170,120,200,.28)' };
        const Zr = new Map(rep.rooms.map(x => [x.id, x.zone]));
        b.push(planLayer(d.doc, lv.id, F, { roomFill: r => zc[Zr.get(r.id)] || null }));
        // الدرج: الدرجات، الأولى (أخضر) والأخيرة (أزرق)، وفتحة البلاطة؛ وخلايا المشي المتاحة باهتة
        for (let i = li * G.per; i < (li + 1) * G.per; i++) if (G.walk[i]) { const p = G.P(i); b.push(`<rect x="${F.X(p.x - G.c / 2).toFixed(1)}" y="${F.Y(p.y + G.c / 2).toFixed(1)}" width="${(G.c * F.k).toFixed(1)}" height="${(G.c * F.k).toFixed(1)}" fill="#7fb3d5" opacity=".13"/>`); }
        for (const st of d.doc.stairs || []) {
          const sli = d.doc.levels.findIndex(l => l.id === st.level); if (sli !== li && sli + 1 !== li) continue;
          const lay = stairLayout(st, 3.2);
          if (sli === li) lay.steps.forEach((x, k) => b.push(`<polygon points="${F.poly(x.poly)}" fill="${k === 0 ? 'rgba(46,125,50,.45)' : k === lay.steps.length - 1 ? 'rgba(21,101,192,.45)' : 'rgba(120,120,120,.12)'}" stroke="#666" stroke-width=".8"/>`));
          else { b.push(`<polygon points="${F.poly(lay.hole)}" fill="rgba(0,0,0,.08)" stroke="#333" stroke-width="2" stroke-dasharray="6 4"/>`); const last = lay.steps[lay.steps.length - 1]; b.push(`<polygon points="${F.poly(last.poly)}" fill="rgba(21,101,192,.45)" stroke="#1565c0" stroke-width="1"/>`); }
        }
        const colors = ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#ad1457', '#4e342e', '#283593', '#558b2f', '#d84315', '#00695c'];
        let ci = 0;
        for (const x of rep.rooms) {
          if (!x._cells?.length) continue;
          const pts = x._cells.filter(i => Math.floor(i / G.per) === li).map(i => G.P(i));
          if (pts.length < 2) continue;
          const col = colors[ci++ % colors.length], sm = pts.filter((_, k) => k % 3 === 0 || k === pts.length - 1);
          b.push(`<polyline points="${F.poly(sm)}" fill="none" stroke="${col}" stroke-width="2.6" opacity=".8" stroke-linejoin="round"/>`);
          const e = pts[pts.length - 1]; if (x.level === lv.id) { b.push(`<circle cx="${F.X(e.x)}" cy="${F.Y(e.y)}" r="5" fill="${col}"/>`); b.push(`<text x="${F.X(e.x)}" y="${F.Y(e.y) + 18}" font-size="12" text-anchor="middle" direction="rtl" fill="${col}" font-weight="700">${x.actual.toCenter} م</text>`); }
        }
        const bad = rep.findings.filter(f => f.severity !== 'info');
        b.push(legend(F, [{ color: zc.men, label: 'الرجال', shape: 'sq' }, { color: zc.women, label: 'النساء', shape: 'sq' }, { color: zc.family, label: 'العائلة', shape: 'sq' }, { color: zc.shared, label: 'مشترك', shape: 'sq' }, { color: '#1565c0', label: 'مسار مشي فعلي من المدخل (مع الأثاث)' }], F.H - 100));
        const path = join(sub, `${d.key}-L${li + 1}.png`);
        jobs.push({ html: page(F, `${d.key} — ${lv.name} — الحركة الفعلية (جسيمة ${rep.counts.serious}، تنبيه ${rep.counts.warn})`, b.join('\n'), [...(bad.length ? bad.slice(0, 2).map(f => f.message.length > 125 ? f.message.slice(0, 124) + '…' : f.message) : ['لا ملاحظات جسيمة أو تنبيهات في الحركة']), CIRC_NOTE]), path });
        row.images.push(relative(ROOT, path));
      });
    }
    summary.docs.push(row);
    console.log(d.key.padEnd(44), `${ms}ms`, JSON.stringify(rep.counts), rep.findings.filter(f => f.severity !== 'info').map(f => f.code).join(','));
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  if (!argv.includes('--no-png')) await renderPNGs(jobs);
}

