// قواعد العرف السعودي في تصميم الفيلا: افتراضات معلنة قابلة للتعديل، كل واحدة بسببها الهندسي،
// وتُطبَّق على المولّد عبر تفضيلات (prefs) أو جمل قياسية تُفهم بقواعد rules.mjs. نقي: لا DOM ولا شبكة.

/**
 * كل عرف: id، النص للعميل، السبب الهندسي، شرط الانطباق على البرنامج (ctx)، وأثره:
 *  - prefs: تفضيلات يقرؤها المولّد (villa-layout) مباشرة
 *  - sentence: جملة قياسية تُحوَّل إلى قاعدة مكانية عبر rules.mjs
 *  - avoid: بند من قائمة «ما تريد تجنبه» في client-brief (discovery.avoids)
 *  - extras: تعديل على الفراغات الإضافية (مثل حمام الخادمة)
 * ctx = { majlis, majlisWomen, bedrooms, kidsRooms, dining, kitchens, maid, elderly, saidOpenKitchen, saidKitchenClosed }
 */
export const CUSTOMS = Object.freeze([
  { id: 'guest_entrance', label: 'مجلس الرجال بمدخل مستقل عن العائلة ودورة مياه للضيوف', why: 'حتى لا يمر الضيوف عبر صالة العائلة؛ هذا يحدد موقع المدخل الثاني على الواجهة.', when: c => c.majlis > 0, prefs: { guestEntrance: true } },
  { id: 'guest_separation', label: 'فصل منطقة الضيوف (المجلس والمقلط) عن جناح العائلة والنوم', why: 'الخصوصية: الضيف لا يرى الصالة ولا غرف النوم من المجلس.', when: c => c.majlis > 0, avoid: 'مرور الضيوف عبر خصوصية العائلة', sentence: 'غرف النوم بعيده عن المجلس' },
  { id: 'women_separate', label: 'مجلس النساء منفصل عن مجلس الرجال، ويخدمه مدخل العائلة', why: 'لا باب بين المجلسين، والنساء يدخلن من مدخل العائلة لا من مدخل الرجال.', when: c => c.majlisWomen > 0, prefs: { womenSeparate: true, familyEntrance: true } },
  { id: 'dining_service', label: 'المقلط بين المجلس والمطبخ لخدمة الضيوف', why: 'مسار الطعام من المطبخ إلى المقلط قصير ولا يمر بالصالة.', when: c => c.majlis > 0 && c.dining > 0 && c.kitchens > 0, sentence: 'المقلط يكون بين المجلس والمطبخ' },
  { id: 'baths_off_hall', label: 'دورات المياه لا تفتح على الصالة مباشرة', why: 'عرف وذوق: باب الحمام لا يُرى من مجلس العائلة.', when: () => true, prefs: { bathsOffHall: true } },
  { id: 'kitchen_closed', label: 'المطبخ مغلق بباب (لا مفتوح على الصالة)', why: 'العرف السعودي يفضّل المطبخ المغلق لحجب الروائح والخصوصية عن الضيوف؛ عدّله إن أردته مفتوحًا.', when: c => c.kitchens > 0 && !c.saidOpenKitchen && !c.saidKitchenClosed, prefs: { openKitchen: false } },
  { id: 'kids_cluster', label: 'غرف الأبناء متجاورة في جناح واحد', why: 'جناح الأبناء بممره وحماماته أقصر وأهدأ، وبعيد عن المجلس.', when: c => c.kidsRooms >= 2, sentence: 'غرف العيال جنب بعض' },
  { id: 'master_far', label: 'الغرفة الرئيسية في أبعد نقطة عن المجلس', why: 'خصوصية الوالدين عن منطقة الضيافة.', when: c => c.majlis > 0 && c.bedrooms > 0, sentence: 'غرفه الماستر بعيده عن المجلس' },
  { id: 'maid_service', label: 'غرفة الخادمة بحمامها قرب المطبخ وباب الخدمة', why: 'الخادمة تخدم المطبخ والمقلط دون المرور بجناح العائلة.', when: c => c.maid, extras: { maid: { bath: true } }, sentence: 'غرفه الخادمه قريبه من المطبخ' },
  { id: 'elderly_ground', label: 'غرفة الوالدين في الدور الأرضي قرب الصالة بحمامها', why: 'بلا درج، وقريبة من حركة الأسرة وليست في جناح الضيوف.', when: c => c.elderly, prefs: { elderlyRoom: true } },
]);
export const CUSTOM = Object.fromEntries(CUSTOMS.map(c => [c.id, c]));

/** الأعراف المنطبقة على سياق البرنامج، مع حالتها (مفعّلة ما لم يعطّلها العميل). */
export function applicableCustoms(ctx, disabled = []) {
  const off = new Set(disabled);
  return CUSTOMS.filter(c => c.when(ctx)).map(c => ({ id: c.id, label: c.label, why: c.why, on: !off.has(c.id) }));
}

export default { CUSTOMS, CUSTOM, applicableCustoms };
