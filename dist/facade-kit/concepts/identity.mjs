// R1 — حارس هوية المصدر (Source Identity Guard). فشل مغلق: لا درجة تفرد تتجاوزه.
// المسار: هندسة مُدخَلة → بصمة قانونية مختومة عند الحدّ الموثوق (doc→built) → توليد → ربط المخرج بالمصدر → تحقق الأمانة.
import { hash } from '../src/core.mjs';
const SEALS=new WeakMap();
export class SourceIdentityError extends Error { constructor(code,msg){ super(code+': '+msg); this.code=code; } }
/** البصمة القانونية للمصدر المبني كله (الجدران، الفتحات، الطوابق، الأبعاد، التحويلات الهندسية الداخلة في built). */
export const sourceHash=async built=>hash({built});
/** يُستدعى عند الحدّ الموثوق فقط (بعد البناء من الوثيقة). يختم الكائن نفسه. */
export async function sealSource(built){ const h=await sourceHash(built); SEALS.set(built,h); return h; }
/** يحدد البصمة المرجعية: صراحةً (expectedSourceHash) أو من الختم. لا مرجع ⇒ فشل مغلق. */
export async function assertSourceIdentity(built,{expectedSourceHash=null}={}){
  const expected=expectedSourceHash||SEALS.get(built); if(!expected) throw new SourceIdentityError('SOURCE_IDENTITY_UNDECLARED','مصدر غير مختوم ولا بصمة مرجعية؛ يُرفض مغلقًا');
  const h=await sourceHash(built); if(h!==expected) throw new SourceIdentityError('SOURCE_IDENTITY_MISMATCH',`بصمة المصدر ${h.slice(0,10)} ≠ المرجعية ${expected.slice(0,10)}`);
  return h; }
const planLayers=ls=>ls.filter(l=>l.role!=='concept-zone').filter(l=>l.plan===true||l.role==='wall'||l.role==='frame').map(l=>({id:l.id,role:l.role,outer:l.outer,holes:l.holes,o0:l.o0,o1:l.o1,C:l.C}));
/** ربط المخرج بالمصدر: طبقات المسقط والجدران والفتحات في الحزمة = المصدر تمامًا. */
export async function verifyOutputBinding(sourceBuilt,side,pkg){
  const a=await hash({p:planLayers(sourceBuilt[side].layers),F:sourceBuilt[side].F}), b=await hash({p:planLayers(pkg.built[side].layers),F:pkg.built[side].F});
  if(a!==b) throw new SourceIdentityError('OUTPUT_SOURCE_BINDING_BROKEN','طبقات المسقط/الفتحات في الحزمة تختلف عن المصدر'); return true; }
