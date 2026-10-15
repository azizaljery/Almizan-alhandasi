// تسليم تصميم من الصفحة الرئيسية إلى المرسم دون المساس بمشروع محفوظ سابقًا.
// الكاتب (الصفحة الرئيسية) يضع المستند في sessionStorage؛ والمرسم يستهلكه مرة واحدة عند الفتح،
// وإن كان في المرسم مشروع محفوظ له جدران يُنسخ احتياطيًا قبل الاستبدال ولا يُحذف.
import { parseDoc, serialize } from './doc.mjs';

export const HANDOFF_KEY = 'mizan.home.handoff.v1';
export const STUDIO_KEY = 'mizan.studio.doc.v1';
export const BACKUP_KEY = 'mizan.studio.doc.v1.before-home';
export const HANDOFF_SCHEMA = 'mizan-home-handoff/1';
export const DNA_KEY = 'mizan.studio.dna.v1';
const MAX_ALT_BYTES = 1_500_000;

/** يكتب التسليم. meta اختياري: مصدر التصميم والأرض (للعرض فقط، لا يغيّر المستند). */
export function writeHandoff(session, doc, meta = {}) {
  const checked = parseDoc(serialize(doc)); // يرفض المستند غير الصالح قبل الانتقال
  // بصمة التصميم والبدائل اختيارية: تُتحقق وثائق البدائل مثل الأصل، وتُهمل كلها إن كبر حجمها.
  let dna = null, alternatives = [];
  if (meta.dna && typeof meta.dna === 'object') {
    dna = JSON.parse(JSON.stringify(meta.dna));
    for (const alt of Array.isArray(meta.alternatives) ? meta.alternatives : []) {
      try { alternatives.push({ index: alt.index, strategy: String(alt.strategy || ''), doc: parseDoc(serialize(alt.doc)) }); } catch { /* بديل غير صالح: يُهمل */ }
    }
    if (JSON.stringify(alternatives).length > MAX_ALT_BYTES) alternatives = [];
  }
  session.setItem(HANDOFF_KEY, JSON.stringify({ schema: HANDOFF_SCHEMA, at: meta.at ?? null, meta: { source: meta.source || 'home', ...(meta.note ? { note: String(meta.note).slice(0, 200) } : {}) }, ...(dna ? { dna, alternatives } : {}), doc: checked }));
  return checked;
}

/**
 * يستهلك التسليم إن وُجد. يعيد { doc, backedUp, meta } أو null.
 * مشروع المرسم المحفوظ الذي يحتوي جدرانًا لا يضيع: ينتقل إلى BACKUP_KEY.
 */
export function consumeHandoff(session, local) {
  let raw; try { raw = session.getItem(HANDOFF_KEY); } catch { return null; }
  if (!raw) return null;
  try { session.removeItem(HANDOFF_KEY); } catch { /* ignore */ }
  let parsed; try { parsed = JSON.parse(raw); } catch { return null; }
  if (parsed?.schema !== HANDOFF_SCHEMA) return null;
  let doc; try { doc = parseDoc(parsed.doc); } catch { return null; }
  let backedUp = false;
  try {
    const previous = local.getItem(STUDIO_KEY);
    if (previous) {
      let saved = null; try { saved = JSON.parse(previous); } catch { /* غير صالح: لا يستحق نسخًا */ }
      if (saved?.walls?.length) { local.setItem(BACKUP_KEY, previous); backedUp = true; }
    }
    local.setItem(STUDIO_KEY, serialize(doc));
  } catch { /* التخزين غير متاح: يبقى المستند محمولًا في الذاكرة */ }
  let dna = null, alternatives = [];
  if (parsed.dna && typeof parsed.dna === 'object') {
    dna = parsed.dna;
    for (const alt of Array.isArray(parsed.alternatives) ? parsed.alternatives : []) { try { alternatives.push({ index: alt.index, strategy: String(alt.strategy || ''), doc: parseDoc(alt.doc) }); } catch { /* يُهمل */ } }
    try { local.setItem(DNA_KEY, JSON.stringify({ dna, alternatives, docTitle: doc.title })); } catch { /* التخزين غير متاح */ }
  } else { try { local.removeItem(DNA_KEY); } catch { /* ignore */ } }
  return { doc, backedUp, meta: parsed.meta || {}, dna, alternatives };
}

/** يقرأ بصمة التصميم المحفوظة مع المشروع الحالي (إن وُجدت). */
export function loadSavedDNA(local) {
  try { const raw = JSON.parse(local.getItem(DNA_KEY) || 'null'); if (!raw?.dna) return null;
    const alternatives = []; for (const alt of raw.alternatives || []) { try { alternatives.push({ index: alt.index, strategy: String(alt.strategy || ''), doc: parseDoc(alt.doc) }); } catch { /* يُهمل */ } }
    return { dna: raw.dna, alternatives };
  } catch { return null; }
}
