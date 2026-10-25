// (الجولة 21 — مقترح 08) مسبار طبقة المعاملة لاختبار tests/stage2-r21-proposal.test.mjs: يُشغَّل في عملية مستقلة لأن مفاتيح R14_OFF تُقرأ عند التحميل.
// يولّد بديلًا لطلب «المجلس يفتح على الطعام»، ويطلب في جلسة التصميم «سد الباب بين مجلس الرجال والطعام»، ويطبع: هل اعتُمد تعديل موضعي، وهل بقي الباب.
import { extractRequirements } from '../dist/requirements.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { createSession, redesign, currentDoc } from '../dist/design-session.mjs';
import { validateEdit } from '../dist/change-guard.mjs';
const counts = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, land = { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 };
const r = extractRequirements('دور واحد، 3 غرف نوم، مجلس رجال، والمجلس يفتح على الطعام، صالة، مطبخ', { counts }); r.counts = { ...r.counts, ...counts };
const o = V3.generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 2 });
const d = o.designs.find(x => x.presentation?.status !== 'hidden');
const s = createSession({ land, counts: r.counts, requirements: r, result: { doc: d.doc, pat: d.pat } });
let generated = false;
const out = await redesign(s, { text: 'سد الباب بين مجلس الرجال والطعام' }, { generate: async () => { generated = true; throw Object.assign(Error('probe'), { code: 'VILLA_BUILD_FAILED' }); } }).catch(() => null);
const doc = out?.session ? currentDoc(out.session) : d.doc, door = validateEdit(doc, r).brief.find(b => b.kind === 'DIRECT_DOOR');
console.log(JSON.stringify({ local: out?.reply?.mode === 'local', generated, doorKept: !!door?.ok }));
