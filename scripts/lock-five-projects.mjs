// usage: node scripts/lock-five-projects.mjs <outDir>
// يشغّل المشاريع الخمسة (tests/helpers/lock-projects.mjs) ويكتب لكل مشروع: evidence.json (جدول الإثبات) وأوراق SVG قبل/بعد
// بتلوين: أخضر = جزء مقفل، برتقالي = تغيّر، أزرق = أُضيف، رمادي = بلا تغيير. ثم يُحوَّل SVG إلى PNG بـ rsvg-convert خارج هذا السكربت.
import fs from 'node:fs';
import { PROJECTS, runProject } from '../tests/helpers/lock-projects.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { verifyLocks } from '../dist/design-lock.mjs';
import { roomChanges } from '../dist/design-impact.mjs';

const out = process.argv[2] || '/tmp/claude-0/work/lock6/five'; fs.mkdirSync(out, { recursive: true });
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
function levelSvg(doc, li, { lockedNames = new Set(), changed = new Map(), title = '', scale = 24 } = {}) {
  const m = analyzeDoc(doc), lv = m.levels[li]; if (!lv) return null;
  const all = lv.rooms.flatMap(r => r.net || []), xs = all.map(p => p.x), ys = all.map(p => p.y), x0 = Math.min(...xs) - 1, y1 = Math.max(...ys) + 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 2;
  const W = (x1 - x0) * scale, H = (y1 - y0) * scale, X = x => (x - x0) * scale, Y = y => (y1 - y) * scale;
  let g = `<rect width="${W}" height="${H}" fill="#fff"/><text x="8" y="16" font-size="14" font-family="sans-serif" fill="#111">${esc(title)}</text>`;
  for (const r of lv.rooms) {
    if (r.unlabelled || !r.net) continue;
    const kind = lockedNames.has(r.name) ? 'lock' : changed.get(r.name) || 'same';
    const fill = { lock: '#9be3a8', moved: '#ffc27a', resized: '#ffc27a', added: '#8ec5ff', same: '#eef0f3' }[kind] || '#ffc27a';
    g += `<polygon points="${r.net.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}" fill="${fill}" stroke="none"/>`;
    g += `<text x="${X(r.centroid.x).toFixed(1)}" y="${Y(r.centroid.y).toFixed(1)}" font-size="9.5" text-anchor="middle" font-family="sans-serif" fill="#222">${esc(r.name)}</text>`;
  }
  for (const w of lv.walls) g += `<line x1="${X(w.a.x)}" y1="${Y(w.a.y)}" x2="${X(w.b.x)}" y2="${Y(w.b.y)}" stroke="#222" stroke-width="${Math.max(1.2, w.t * scale)}"/>`;
  for (const o of lv.openings) { const door = o.door; g += `<circle cx="${X(o.p.x)}" cy="${Y(o.p.y)}" r="${door ? 3.2 : 2.6}" fill="${door ? '#c0392b' : '#1f78b4'}"/>`; }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`, W, H };
}
function sheet(p, r) {
  const pairs = [], before = r.doc, afterDoc = r.after ? parseDoc(r.after.designs.at(-1).doc) : null;
  const lockedNames = new Set(r.session.locks.map(l => l.name));
  const changes = afterDoc ? roomChanges(before, afterDoc) : [];
  const chBefore = new Map(), chAfter = new Map();
  for (const c of changes) { if (c.kinds.includes('added')) chAfter.set(c.name, 'added'); else if (c.kinds.includes('removed')) chBefore.set(c.name, 'moved'); else { chBefore.set(c.name, 'moved'); chAfter.set(c.name, 'moved'); } }
  const proposalDoc = !afterDoc && r.result.candidate ? parseDoc(r.result.candidate.doc) : null;
  const shown = afterDoc || proposalDoc;
  if (proposalDoc) for (const c of roomChanges(before, proposalDoc)) { chBefore.set(c.name, 'moved'); chAfter.set(c.name, 'moved'); }
  for (const v of r.result.report?.lock?.violated || []) { chBefore.set(v.name, 'moved'); chAfter.set(v.name, 'moved'); }
  const lvls = before.levels.length;
  const parts = [];
  for (let li = 0; li < lvls; li++) {
    const a = levelSvg(before, li, { lockedNames, changed: chBefore, title: `${p.id} قبل — ${before.levels[li].name}` });
    const b = shown ? levelSvg(shown, li, { lockedNames: new Set([...lockedNames].filter(n => !(r.result.report?.lock?.violated || []).some(v => v.name === n))), changed: chAfter, title: `${p.id} بعد${afterDoc ? '' : ' (مقترح لم يُطبَّق: ينتظر موافقتك)'} — ${before.levels[li].name}` }) : null;
    if (a) parts.push([a, b]);
  }
  const rowsH = parts.map(([a, b]) => Math.max(a.H, b?.H || 0)), total = rowsH.reduce((s, h) => s + h + 10, 0) + 70, wmax = Math.max(...parts.map(([a, b]) => a.W + (b?.W || 0) + 30));
  let y = 60, body = `<rect width="${wmax}" height="${total}" fill="#fafafa"/><text x="10" y="22" font-size="17" font-family="sans-serif">${esc(p.title)} — الحالة: ${esc(r.result.status)}</text><text x="10" y="44" font-size="12" font-family="sans-serif" fill="#333">أخضر = مقفل · برتقالي = تغيّر · أزرق = أُضيف · رمادي = بلا تغيير · أحمر = باب · أزرق داكن = نافذة</text>`;
  parts.forEach(([a, b], i) => { body += `<g transform="translate(5,${y})">${a.svg.replace(/^<svg[^>]*>/, '<g>').replace(/<\/svg>$/, '</g>')}</g>`; if (b) body += `<g transform="translate(${a.W + 25},${y})">${b.svg.replace(/^<svg[^>]*>/, '<g>').replace(/<\/svg>$/, '</g>')}</g>`; y += rowsH[i] + 10; });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wmax}" height="${total}" viewBox="0 0 ${wmax} ${total}">${body}</svg>`;
}
const evidence = [];
for (const p of PROJECTS) {
  const r = await runProject(p), x = r.result;
  fs.writeFileSync(`${out}/${p.id}.svg`, sheet(p, r));
  const ev = {
    id: p.id, title: p.title, land: p.land, change: x.change, status: x.status, expected: p.expect,
    locked: r.session.locks.map(l => ({ name: l.name, level: l.levelIndex + 1, area: l.area, walls: l.walls.length, openings: l.openings.length })),
    lockVerificationOnProposal: x.report ? { ok: x.report.lock.ok, checked: x.report.lock.checked, violated: x.report.lock.violated.map(v => ({ name: v.name, violations: v.violations.map(w => w.detail) })) } : null,
    lockVerificationAfterApplied: r.after ? (() => { const v = verifyLocks(parseDoc(r.after.designs.at(-1).doc), r.approved ? r.approved.locks : r.session.locks); return { ok: v.ok, checked: v.checked, note: r.approved ? 'بعد موافقة العميل: الأقفال أُعيدت بهندستها الجديدة' : 'الأقفال القديمة نفسها' }; })() : null,
    reason: x.reason || x.proposal?.reason || null, description: x.candidate?.desc || null,
    summary: x.report?.summary?.text || null, mandatoryRegressions: x.report?.mandatoryRegressions?.map(t => t.requirement) || [],
    roomChanges: x.report?.rooms || [], unchangedRooms: x.report?.unchanged || [],
    table: x.report ? [...x.report.table.filter(t => t.status !== 'same' || t.group === 'طلب العميل'), ...x.report.indicators].map(t => ({ tier: t.tier, group: t.group, requirement: t.requirement, before: t.before, after: t.after, status: t.statusAr, evidence: t.evidence })) : [],
    quantities: x.report?.quantities?.rows?.map(q => ({ id: q.id, label: q.label, unit: q.unit, grade: q.grade, before: q.before, after: q.after, delta: q.delta })) || [],
    cost: x.report?.quantities?.cost || null, tried: x.tried,
  };
  fs.writeFileSync(`${out}/${p.id}.evidence.json`, JSON.stringify(ev, null, 1)); evidence.push({ id: p.id, status: x.status, expected: p.expect, lockOk: ev.lockVerificationOnProposal?.ok ?? null, afterOk: ev.lockVerificationAfterApplied?.ok ?? null, mandatoryRegressions: ev.mandatoryRegressions.length, rooms: ev.roomChanges.length });
}
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(evidence, null, 1)); console.log(JSON.stringify(evidence));
