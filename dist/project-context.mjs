// A drawing left in the studio must never inherit another customer's brief,
// land or conversation merely because an old session remains in localStorage.
import { parseDoc } from './draw/doc.mjs';
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
const normalized = raw => {
  const doc = parseDoc(typeof raw === 'string' ? raw : JSON.stringify(raw));
  // The design page adds true-north metadata when passing the same drawing to
  // the studio. Every other field must still match, including opening edits.
  doc.north = 0;
  return JSON.stringify(stable(doc));
};
export function sessionForDocument(doc, session) {
  try {
    const source = session?.designs?.[session.current ?? 0]?.doc;
    return source && normalized(source) === normalized(doc) ? session : null;
  } catch { return null; }
}
