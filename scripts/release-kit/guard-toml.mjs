// Mizan release kit — minimal TOML reader for wrangler files (read-only, no dependencies).
// (تصحيح 2026-10-31، قرار المالك ثالثًا) قراءة TOML فعلية بدل أنماط الأسطر: التعليق «# …» خارج النصوص المقتبسة يُحذف (تعليق سليم مقبول)،
// والسطر المعلَّق كله لا يُحتسب إعدادًا، والمفاتيح تُقرأ في جدولها ([assets] و[vars] و[[d1_databases]] و[env.*]). الشروط نفسها لم تُخفَّف.
const stripComment = line => { let q = null; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '\\' && q === '"') { i++; continue; } if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '#') return line.slice(0, i); } return line; };
const parseValue = v => { v = v.trim(); const m = /^"((?:[^"\\]|\\.)*)"$/.exec(v) || /^'([^']*)'$/.exec(v); if (m) return m[1]; if (v === 'true') return true; if (v === 'false') return false; return v; };
export function parseToml(text) {
  const out = { root: {}, tables: [] }; let cur = { name: '', array: false, keys: out.root };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = stripComment(raw).trim(); if (!line) continue;
    let m = /^\[\[\s*([^\]]+?)\s*\]\]$/.exec(line) || /^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if (m) { cur = { name: m[1], array: line.startsWith('[['), keys: {} }; out.tables.push(cur); continue; }
    m = /^([A-Za-z0-9_.-]+|"[^"]+")\s*=\s*(.*)$/.exec(line); if (!m) { out.invalid = (out.invalid || []).concat(raw); continue; }
    cur.keys[m[1].replace(/^"|"$/g, '')] = parseValue(m[2]);
  }
  return out;
}
