import { DESIGN_CHOICES } from './design-selection.mjs';
// Local, deterministic planning preferences; no AI transport or credentials.
const TASTES = ['courtyard_privacy', 'family_layout', 'concept_comparison', 'classic_living', 'staggered_wings'];
const AVOIDS = ['الممرات الطويلة والمظلمة', 'مرور الضيوف عبر خصوصية العائلة', 'نوافذ كبيرة على شمس العصر الغربية', 'صدى الصوت في الصالات والمجالس', 'مطبخ بعيد عن الطعام والخدمات', 'غرف نوم مكشوفة أو قريبة من الضيافة'];
const LIFE = { guests: ['قليلة', 'متكررة'], children: ['قريبون من الصالة', 'جناح هادئ'], seniors: ['موجودون', 'غير موجودين'], future: ['مهمة', 'ليست أولوية'] };
export function normalizeDiscovery(raw) {
  if (raw === undefined) return { likes: [], rejects: [], avoids: [], life: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('رغبات المنزل المحفوظة غير صالحة.');
  const list = (key, allowed) => {
    const values = raw[key];
    if (!Array.isArray(values) || values.length > allowed.length || values.some(v => !allowed.includes(v))) throw Error('اختيار محفوظ غير معروف.');
    return [...new Set(values)];
  };
  const likes = list('likes', TASTES), rejects = list('rejects', TASTES), avoids = list('avoids', AVOIDS);
  if (likes.some(v => rejects.includes(v))) throw Error('الفكرة نفسها مفضلة ومرفوضة في الملف.');
  if (!raw.life || typeof raw.life !== 'object' || Array.isArray(raw.life)) throw Error('بيانات أسلوب الحياة غير صالحة.');
  const life = {};
  for (const [key, value] of Object.entries(raw.life)) {
    if (!Object.hasOwn(LIFE, key) || !LIFE[key].includes(value)) throw Error('اختيار أسلوب حياة غير معروف.');
    life[key] = value;
  }
  return { likes, rejects, avoids, life };
}
export const briefFingerprint = (discovery, rooms) => JSON.stringify([normalizeDiscovery(discovery), rooms]);
export function buildClientBrief(discovery, rooms) {
  const d = normalizeDiscovery(discovery), changes = [], questions = [], limits = [], principles = [];
  const privateBedrooms = d.avoids.includes(AVOIDS[1]) || d.avoids.includes(AVOIDS[5]);
  const host = d.life.guests === 'متكررة' || d.avoids.includes(AVOIDS[1]);
  const food = d.avoids.includes(AVOIDS[4]);
  const recommend = (type, position, reason) => {
    const matches = rooms.map((r,index)=>({r,index})).filter(({r})=>r.type===type);
    if (!matches.length) questions.push(`لا يوجد ${type === 'majlis' ? 'مجلس' : type === 'bedroom' ? 'غرف نوم' : type === 'kitchen' ? 'مطبخ' : 'غرفة طعام'} في الجدول؛ هل يناسب ذلك طلبك؟`);
    for(const {r,index} of matches) if(r.position !== position) changes.push({index,name:r.name,from:r.position,to:position,reason});
  };
  if(host){principles.push('تقديم منطقة استقبال الضيوف نحو جهة المدخل.');recommend('majlis','front','تكرار الضيافة أو تقليل امتداد حركة الضيوف داخل المنزل.');}
  if(privateBedrooms){principles.push('تأخير غرف النوم عن منطقة الاستقبال.');recommend('bedroom','back','رغبتك في إبعاد النوم عن الضيافة.');limits.push('التباعد النسبي لا يثبت الفصل البصري أو استقلال مداخل الضيوف والعائلة.');}
  if(food){principles.push('تجميع المطبخ والطعام في المنطقة الوسطى كخطوة أولى.');recommend('kitchen','middle','تقريب منطقتي الخدمة والطعام مبدئيًا.');recommend('dining','middle','تقريب منطقتي الخدمة والطعام مبدئيًا.');limits.push('وضع غرفتين في المنطقة نفسها لا يضمن التجاور أو اتصال الأبواب؛ راجع مسافة المسار بعد التوليد.');}
  if(d.life.seniors==='موجودون')questions.push('أي غرفة لكبار السن، وما احتياجاتهم في الحركة ودورة المياه؟ لا نغيّر مواقع جميع غرف النوم بالنيابة عنهم.');
  if(d.life.children)questions.push('أي غرف للأطفال، وما القرب المطلوب بينها وبين الصالة؟');
  if(d.life.future==='مهمة')questions.push('ما التغيير المستقبلي المتوقع: غرفة إضافية، تقسيم وحدة، أم دور آخر؟');
  if(d.avoids.includes(AVOIDS[0]))limits.push('تقليل طول الممرات يحتاج مقارنة أطوال المسارات، ولا تثبت الإضاءة من طول الممر وحده.');
  if(d.avoids.includes(AVOIDS[2]))limits.push('طلب تجنب شمس الغرب محفوظ؛ مواقع الفتحات والتظليل تحتاج مراجعة منفصلة.');
  if(d.avoids.includes(AVOIDS[3]))limits.push('معالجة الصدى تحتاج مواد وأبعادًا وحسابًا صوتيًا غير منفّذ هنا.');
  for (const key of d.likes) {
    const choice = DESIGN_CHOICES[key];
    if (choice.shape) principles.push(`الشكل المفضل للمقارنة: ${choice.label}. يظل تفضيلًا؛ الوصف الصريح للشكل وحده يقيد التوليد إذا كان مدعومًا.`);
    else limits.push(`${choice.label} غير متاح للتوليد حاليًا؛ المحرك لا ينشئ فناءً مغلقًا من أربع جهات. لن يُولَّد شكل آخر بدلًا منه.`);
  }
  if(d.rejects.some(key=>DESIGN_CHOICES[key].shape))principles.push('الأشكال المرفوضة تُستبعد من بدائل التوليد.');
  if(d.likes.length||d.rejects.length)limits.push('مطابقة شكل الكتلة لا تثبت تنفيذ الخصوصية أو أسلوب حياة معين؛ تُقيَّم هذه المحاور من بيانات المخطط المتاحة.');
  return { fingerprint:briefFingerprint(d,rooms), changes, questions, limits, principles };
}
export function applyBriefChoices(discovery, rooms, brief, indices) {
  if(brief.fingerprint !== briefFingerprint(discovery,rooms)) throw Error('تغيّر الجدول أو الرغبات؛ راجع الاقتراح من جديد قبل تطبيقه.');
  const fresh=buildClientBrief(discovery,rooms), selected=new Set(indices);
  if([...selected].some(i=>!Number.isInteger(i)||!fresh.changes.some(c=>c.index===i)))throw Error('اختيار تعديل غير صالح.');
  return rooms.map((r,index)=>{const c=fresh.changes.find(c=>c.index===index);return {...r,...(c&&selected.has(index)?{position:c.to}:{})};});
}

export { AVOIDS, LIFE, TASTES };
