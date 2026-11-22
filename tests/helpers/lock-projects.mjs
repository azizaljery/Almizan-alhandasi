// خمسة مشاريع ثابتة لاختبار قفل الأجزاء المعتمدة وتقرير الأثر: لكل مشروع أرض وبرنامج وأجزاء يعتمدها العميل وتعديل واقعي بعدها.
// بيانات تركيبية بالكامل (لا تصميم عميل حقيقي) فلا خصوصية تُمسّ؛ التوليد حتمي (نفس الأرض والطلب ← نفس المخطط).
import { generateInitialDesign } from '../../dist/home-flow.mjs';
import { createSession, redesign } from '../../dist/design-session.mjs';
import { buildBrief } from '../../dist/shara/brief-engine.mjs';
import { parseDoc } from '../../dist/draw/doc.mjs';
import { lockParts, proposeChange, approveProposal } from '../../dist/design-lock-edit.mjs';
import { lockableParts, verifyLocks } from '../../dist/design-lock.mjs';

const BASE = '3 غرف نوم ومجلس رجال ومجلس نساء ومطبخ وصالة';
export const PROJECTS = Object.freeze([
  { id: 'P1', title: '15×25 دوران — غرفة نوم إضافية', land: { width: 15, length: 25, floors: 2, streets: ['s'], entries: ['s'] }, text: BASE, lock: t => ['majlis', 'kitchen'].includes(t), change: { type: 'add-bedroom', label: 'أضف غرفة نوم' }, expect: 'applied' },
  { id: 'P2', title: '20×30 دوران — توسيع غرفة النوم الرئيسية', land: { width: 20, length: 30, floors: 2, streets: ['s'], entries: ['s'] }, text: BASE + '، لازم ممرات غير مظلمة', lock: t => ['majlis', 'kitchen'].includes(t), change: { type: 'enlarge-room', target: 'غرفة النوم الرئيسية', gain: 4, label: 'وسّع غرفة النوم الرئيسية' }, expect: 'applied' },
  { id: 'P3', title: '25×30 دور واحد — توسيع غرفة نوم', land: { width: 25, length: 30, floors: 1, streets: ['s'], entries: ['s'] }, text: BASE, lock: t => ['majlis', 'kitchen'].includes(t), change: { type: 'enlarge-room', target: 'غرفة نوم 2', gain: 4, label: 'وسّع غرفة النوم 2' }, expect: 'applied' },
  { id: 'P4', title: '12.5×30 دوران — نقل المطبخ (يمس المقفل)', land: { width: 12.5, length: 30, floors: 2, streets: ['s'], entries: ['s'] }, text: BASE, lock: t => ['majlis', 'kitchen'].includes(t), change: { type: 'regenerate', text: 'المطبخ في الأمام', label: 'انقل المطبخ إلى الأمام' }, expect: 'needsApproval' },
  { id: 'P5', title: '20×25 أرض زاوية دوران — غرفة نوم إضافية', land: { width: 20, length: 25, floors: 2, streets: ['s', 'e'], entries: ['s'] }, text: BASE, lock: t => ['majlis', 'kitchen'].includes(t), change: { type: 'add-bedroom', label: 'أضف غرفة نوم' }, expect: 'applied' },
]);

export async function buildProject(p) {
  const land = structuredClone(p.land), brief = buildBrief(p.text, { land });
  const first = await generateInitialDesign({ land, rooms: [], discovery: brief.discovery, idea: p.text, counts: brief.counts, requirements: brief.requirements });
  let session = createSession({ land, counts: brief.counts, requirements: brief.requirements, discovery: brief.discovery, idea: p.text, result: first });
  const doc = parseDoc(session.designs[0].doc);
  session = lockParts(session, lockableParts(doc).filter(x => p.lock(x.type)).map(x => x.id));
  return { session, doc };
}
export async function runProject(p) {
  const { session, doc } = await buildProject(p);
  const result = await proposeChange(session, p.change, { redesign });
  let approved = null;
  if (result.status === 'needsApproval') approved = approveProposal(session, result);
  const after = result.session || approved;
  const lockAfter = after ? verifyLocks(parseDoc(after.designs.at(-1).doc), session.locks) : null;
  return { project: p, session, doc, result, approved, after, lockAfter };
}
