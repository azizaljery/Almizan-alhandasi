// عقد القوالب المشترك لكل الأطر. كل إطار يصدّر مصفوفة `templates` من الشكل:
//   { id:'N01', ar:'اسم عربي', note:'وصف سطر واحد', p:{ مفتاح: قيمة منفصلة, ... } }
// القيم في p اختيارات منفصلة (أعداد صحيحة/نصوص/منطقي) من قائمة معرّفة داخل ملف الإطار نفسه،
// بحيث يعمل أي دمج مفتاحًا بمفتاح بين قالبين من الإطار نفسه ويُنتج تصميمًا صالحًا.
// الاستعمال في الرابط:  tpl=N03   أو   tpl=N03+N07  (دمج)   مع  tseed=<عدد> لتحديد اختيار كل مفتاح من أي أصل.
function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function blendParams(a, b, seed = 1) {
  const out = {}, keys = [...new Set([...Object.keys(a.p), ...Object.keys(b.p)])].sort();
  for (const k of keys) {
    const inA = k in a.p, inB = k in b.p;
    out[k] = inA && inB ? ((h32(k + ':' + seed + ':' + a.id + b.id) & 1) ? a.p[k] : b.p[k]) : (inA ? a.p[k] : b.p[k]);
  }
  return out;
}
// تطفير وراثي: كل مفتاح يُستبدل باحتمال = الشدة بقيمة مأخوذة من قالب آخر عشوائي من الطراز نفسه (قيمة صالحة بالتعريف)،
// فتبقى كل الدموج والتركيبات ضمن التعدادات المعرّفة في وحدة الطراز.
function rng(seed) { let s = (h32(String(seed)) || 123456789) >>> 0; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
export function mutateParams(templates, p, intensity = 0.35, seed = 1) {
  const r = rng(seed), k = Math.min(.9, Math.max(.1, Number(intensity) || .35)), out = { ...p }, changed = [];
  for (const key of Object.keys(p).sort()) {
    if (r() >= k) continue;
    const pool = templates.filter(t => key in t.p && t.p[key] !== p[key]); if (!pool.length) continue;
    out[key] = pool[Math.floor(r() * pool.length)].p[key]; changed.push(key);
  }
  return { p: out, changed };
}
/** يحلّ قيمة tpl إلى {id, ar, p, parents} أو null (لا قالب = السلوك القديم). */
export function resolveTemplate(templates, q) {
  const raw = q?.get ? q.get('tpl') : null; if (!raw || !templates?.length) return null;
  const seed = Number(q.get('tseed')) || 1, by = id => templates.find(t => t.id === id);
  const ids = raw.replace(/ /g, '+').split('+').map(s => s.trim()).filter(Boolean);
  const A = by(ids[0]); if (!A) return null;
  const mut = Number(q.get('mut')) || 0, ms = q.get('mseed') || seed, fin = r => {
    if (!mut) return r; const m = mutateParams(templates, r.p, mut, ms); return { ...r, p: m.p, id: r.id + '*m' + ms, ar: r.ar + ' (مُطفَّر)', mutated: m.changed }; };
  if (ids.length === 1) return fin({ id: A.id, ar: A.ar, p: { ...A.p }, parents: [A.id] });
  const B = by(ids[1]); if (!B) return fin({ id: A.id, ar: A.ar, p: { ...A.p }, parents: [A.id] });
  return fin({ id: A.id + '+' + B.id, ar: A.ar + ' × ' + B.ar, p: blendParams(A, B, seed), parents: [A.id, B.id] });
}
