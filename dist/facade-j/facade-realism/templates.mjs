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
/** يحلّ قيمة tpl إلى {id, ar, p, parents} أو null (لا قالب = السلوك القديم). */
export function resolveTemplate(templates, q) {
  const raw = q?.get ? q.get('tpl') : null; if (!raw || !templates?.length) return null;
  const seed = Number(q.get('tseed')) || 1, by = id => templates.find(t => t.id === id);
  const ids = raw.replace(/ /g, '+').split('+').map(s => s.trim()).filter(Boolean);
  const A = by(ids[0]); if (!A) return null;
  if (ids.length === 1) return { id: A.id, ar: A.ar, p: { ...A.p }, parents: [A.id] };
  const B = by(ids[1]); if (!B) return { id: A.id, ar: A.ar, p: { ...A.p }, parents: [A.id] };
  return { id: A.id + '+' + B.id, ar: A.ar + ' × ' + B.ar, p: blendParams(A, B, seed), parents: [A.id, B.id] };
}
