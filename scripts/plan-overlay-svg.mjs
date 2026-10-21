// أدوات رسم مشتركة لصور الأدلة (مراجعة الإنشاء المبدئية ومسارات الحركة): مسقط دور بخطوط SVG بسيطة
// (المحور x يمين، y أعلى كما في المستند) ثم تحويلها إلى PNG بمتصفح Chromium المحلي عبر Playwright.
// لا يعتمد على الموقع: يرسم من المستند وحده، فالصورة دليل على ما قرأه الفحص نفسه.
import { analyzeDoc } from '../dist/draw/digest.mjs';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** إطار رسم دور: يعيد دوال التحويل وحجم اللوحة. */
export function frameFor(doc, { W = 1400, H = 1000, pad = 70, top = 70, bottom = 150 } = {}) {
  const pts = doc.walls.flatMap(w => [w.a, w.b]);
  const x0 = Math.min(...pts.map(p => p.x)) - 1, x1 = Math.max(...pts.map(p => p.x)) + 1, y0 = Math.min(...pts.map(p => p.y)) - 1, y1 = Math.max(...pts.map(p => p.y)) + 1;
  const k = Math.min((W - 2 * pad) / (x1 - x0), (H - top - bottom) / (y1 - y0));
  const ox = pad + ((W - 2 * pad) - k * (x1 - x0)) / 2, oy = top;
  const X = x => ox + (x - x0) * k, Y = y => oy + (y1 - y) * k;
  return { W, H, k, X, Y, P: p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`, poly: ps => ps.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ') };
}

/** جدران دور (وفتحاته كفراغات بيضاء) ونصوص الغرف. */
export function planLayer(doc, levelId, F, { ghost = false, labels = true, roomFill = null } = {}) {
  const out = [];
  const model = analyzeDoc(doc), L = model.levelById.get(levelId);
  if (L && roomFill) for (const r of L.rooms) { const f = roomFill(r); if (f) out.push(`<polygon points="${F.poly(r.net)}" fill="${f}" stroke="none"/>`); }
  const col = ghost ? '#c9c4b8' : '#22262a';
  for (const w of doc.walls.filter(x => x.level === levelId)) {
    const t = Math.max(1.5, (w.t ?? 0.2) * F.k);
    out.push(`<line x1="${F.X(w.a.x)}" y1="${F.Y(w.a.y)}" x2="${F.X(w.b.x)}" y2="${F.Y(w.b.y)}" stroke="${col}" stroke-width="${t}" stroke-linecap="square"${w.kind === 'parapet' ? ' stroke-dasharray="4 3"' : ''}/>`);
  }
  if (!ghost) for (const o of doc.openings.filter(x => x.level === levelId)) {
    const w = doc.walls.find(q => q.id === o.wall); if (!w) continue;
    const L2 = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), u = { x: (w.b.x - w.a.x) / L2, y: (w.b.y - w.a.y) / L2 };
    const a = { x: w.a.x + u.x * (o.at - o.w / 2), y: w.a.y + u.y * (o.at - o.w / 2) }, b = { x: w.a.x + u.x * (o.at + o.w / 2), y: w.a.y + u.y * (o.at + o.w / 2) };
    const win = o.kind === 'window' || o.kind === 'window2';
    out.push(`<line x1="${F.X(a.x)}" y1="${F.Y(a.y)}" x2="${F.X(b.x)}" y2="${F.Y(b.y)}" stroke="${win ? '#cfe3ef' : '#fbfaf6'}" stroke-width="${Math.max(1.5, (w.t ?? .2) * F.k - 2)}"/>`);
  }
  if (labels && L && !ghost) for (const r of L.rooms) {
    if (r.unlabelled) continue;
    const c = r.label?.seed || r.centroid;
    out.push(`<text x="${F.X(c.x)}" y="${F.Y(c.y) - 6}" font-size="15" text-anchor="middle" direction="rtl" fill="#3a3f44" font-weight="600">${esc(r.name)}</text>`);
  }
  return out.join('\n');
}

export function page(F, title, body, foot = []) {
  return `<!doctype html><html dir="ltr"><head><meta charset="utf-8"><style>body{margin:0;background:#fbfaf6;font-family:Tahoma,'DejaVu Sans',sans-serif}</style></head><body>
<svg id="s" xmlns="http://www.w3.org/2000/svg" width="${F.W}" height="${F.H}" viewBox="0 0 ${F.W} ${F.H}" font-family="Tahoma, DejaVu Sans, sans-serif">
<rect width="100%" height="100%" fill="#fbfaf6"/>
<text x="${F.W - 24}" y="40" font-size="24" font-weight="700" direction="rtl" text-anchor="start" fill="#1d2a24">${esc(title)}</text>
${body}
${foot.map((t, i) => `<text x="${F.W - 24}" y="${F.H - 24 - (foot.length - 1 - i) * 24}" font-size="${i < foot.length - 1 ? 16 : 14}" direction="rtl" text-anchor="start" fill="${i < foot.length - 1 ? '#8a1c1c' : '#3a3f44'}" font-weight="${i < foot.length - 1 ? 700 : 400}">${esc(t)}</text>`).join('\n')}
</svg></body></html>`;
}

/** مفتاح ألوان أفقي يبدأ من اليمين. items: [{ color, label, dash? , shape? }] */
export function legend(F, items, y) {
  let x = F.W - 24; const out = [];
  for (const it of items) {
    const w = 18 + it.label.length * 8.2;
    out.push(it.shape === 'sq' ? `<rect x="${x - 14}" y="${y - 11}" width="12" height="12" fill="${it.color}" stroke="#333" stroke-width=".6"/>`
      : `<line x1="${x - 18}" y1="${y - 5}" x2="${x}" y2="${y - 5}" stroke="${it.color}" stroke-width="5"${it.dash ? ' stroke-dasharray="5 3"' : ''}/>`);
    out.push(`<text x="${x - 24}" y="${y}" font-size="14" direction="rtl" text-anchor="start" fill="#333">${esc(it.label)}</text>`);
    x -= w + 26;
  }
  return out.join('\n');
}

/** يحوّل صفحات HTML إلى PNG. jobs: [{ html, path }] */
export async function renderPNGs(jobs) {
  if (!jobs.length) return;
  const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  try {
    const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
    for (const j of jobs) { await p.setContent(j.html); await p.locator('#s').screenshot({ path: j.path }); }
  } finally { await b.close(); }
}
