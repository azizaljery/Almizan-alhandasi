import {askable} from "./policy.mjs";
// SHARAA V3 candidate — pure, no network or DOM.
export const bank = [
  {
    "id": "household.adults",
    "domain": "household",
    "text": "كم بالغًا سيقيم في المنزل؟",
    "type": "n",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.household.adults"
  },
  {
    "id": "household.children",
    "domain": "household",
    "text": "كم طفلًا أو ابنًا سيقيم معكم؟",
    "type": "n",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.household.children"
  },
  {
    "id": "household.parents",
    "domain": "household",
    "text": "هل يقيم أحد الوالدين معكم؟",
    "type": "none|occasional|permanent",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.household.parents"
  },
  {
    "id": "household.staff",
    "domain": "household",
    "text": "كم شخصًا من العاملين سيقيم في المنزل؟",
    "type": "n",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.household.staff"
  },
  {
    "id": "household.overnight",
    "domain": "household",
    "text": "هل تستقبل ضيوفًا للمبيت؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.household.overnight"
  },
  {
    "id": "household.bedrooms",
    "domain": "household",
    "text": "كم غرفة نوم إجمالًا، شاملة الرئيسية؟",
    "type": "n",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.household.bedrooms"
  },
  {
    "id": "household.familyTogether",
    "domain": "household",
    "text": "كم شخصًا يجتمع عادة في الصالة؟",
    "type": "n",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.household.familyTogether"
  },
  {
    "id": "household.householdChange",
    "domain": "household",
    "text": "هل تتوقع تغير عدد السكان مستقبلًا؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.household.householdChange"
  },
  {
    "id": "household.guestBedroom",
    "domain": "household",
    "text": "هل تحتاج غرفة مبيت مستقلة؟",
    "type": "b",
    "gate": "household.overnight=true",
    "tier": 2,
    "consumer": "architectural.household.guestBedroom"
  },
  {
    "id": "household.staffRoom",
    "domain": "household",
    "text": "هل تحتاج غرفة خدمة مستقلة؟",
    "type": "b",
    "gate": "household.staff>0",
    "tier": 2,
    "consumer": "architectural.household.staffRoom"
  },
  {
    "id": "children.ages",
    "domain": "children",
    "text": "ما الفئات العمرية للأبناء؟",
    "type": "young|school|teen|adult|mixed",
    "gate": "household.children>0",
    "tier": 2,
    "consumer": "architectural.children.ages"
  },
  {
    "id": "children.play",
    "domain": "children",
    "text": "هل تحتاج منطقة لعب؟",
    "type": "b",
    "gate": "children.ages=young,mixed",
    "tier": 2,
    "consumer": "architectural.children.play"
  },
  {
    "id": "children.supervision",
    "domain": "children",
    "text": "هل تريد رؤية منطقة اللعب من المطبخ؟",
    "type": "b",
    "gate": "children.play=true",
    "tier": 2,
    "consumer": "architectural.children.supervision"
  },
  {
    "id": "children.sleepNear",
    "domain": "children",
    "text": "هل تريد غرف الصغار قرب الرئيسية؟",
    "type": "b",
    "gate": "children.ages=young,mixed",
    "tier": 2,
    "consumer": "architectural.children.sleepNear"
  },
  {
    "id": "children.study",
    "domain": "children",
    "text": "هل تحتاج مساحة دراسة؟",
    "type": "b",
    "gate": "children.ages=school,teen,mixed",
    "tier": 2,
    "consumer": "architectural.children.study"
  },
  {
    "id": "children.sharedRooms",
    "domain": "children",
    "text": "هل تفضل غرفًا مشتركة للأبناء؟",
    "type": "b",
    "gate": "household.children>0",
    "tier": 2,
    "consumer": "architectural.children.sharedRooms"
  },
  {
    "id": "children.sharedBath",
    "domain": "children",
    "text": "هل تفضل حمامًا مشتركًا للأبناء؟",
    "type": "b",
    "gate": "household.children>0",
    "tier": 2,
    "consumer": "architectural.children.sharedBath"
  },
  {
    "id": "children.teenZone",
    "domain": "children",
    "text": "هل ترغب بمنطقة مستقلة للأبناء الأكبر؟",
    "type": "b",
    "gate": "children.ages=teen,adult,mixed",
    "tier": 2,
    "consumer": "architectural.children.teenZone"
  },
  {
    "id": "children.gardenPlay",
    "domain": "children",
    "text": "هل تحتاج منطقة لعب خارجية؟",
    "type": "b",
    "gate": "children.play=true",
    "tier": 2,
    "consumer": "architectural.children.gardenPlay"
  },
  {
    "id": "children.flex",
    "domain": "children",
    "text": "هل تريد تحويل غرف الأبناء مستقبلًا؟",
    "type": "b",
    "gate": "household.children>0",
    "tier": 2,
    "consumer": "architectural.children.flex"
  },
  {
    "id": "parents.ground",
    "domain": "parents",
    "text": "هل تفضل جناح الوالدين في الأرضي؟",
    "type": "b",
    "gate": "household.parents=permanent,occasional",
    "tier": 2,
    "consumer": "architectural.parents.ground"
  },
  {
    "id": "parents.independent",
    "domain": "parents",
    "text": "هل تفضل جناحًا مستقلًا للوالدين؟",
    "type": "b",
    "gate": "household.parents=permanent,occasional",
    "tier": 2,
    "consumer": "architectural.parents.independent"
  },
  {
    "id": "parents.accessible",
    "domain": "parents",
    "text": "هل توجد احتياجات للوصول الميسر؟",
    "type": "b",
    "gate": "household.parents=permanent,occasional",
    "tier": 2,
    "consumer": "architectural.parents.accessible"
  },
  {
    "id": "parents.bath",
    "domain": "parents",
    "text": "هل يحتاج الجناح حمامًا خاصًا؟",
    "type": "b",
    "gate": "household.parents=permanent,occasional",
    "tier": 2,
    "consumer": "architectural.parents.bath"
  },
  {
    "id": "parents.nearLiving",
    "domain": "parents",
    "text": "هل تفضل الجناح قريبًا من الصالة؟",
    "type": "b",
    "gate": "household.parents=permanent,occasional",
    "tier": 2,
    "consumer": "architectural.parents.nearLiving"
  },
  {
    "id": "parents.garden",
    "domain": "parents",
    "text": "هل يرغب الوالدان بإطلالة على الحديقة؟",
    "type": "b",
    "gate": "household.parents=permanent,occasional",
    "tier": 2,
    "consumer": "architectural.parents.garden"
  },
  {
    "id": "parents.entry",
    "domain": "parents",
    "text": "هل يحتاج الجناح مدخلًا مستقلًا؟",
    "type": "b",
    "gate": "parents.independent=true",
    "tier": 2,
    "consumer": "architectural.parents.entry"
  },
  {
    "id": "parents.quiet",
    "domain": "parents",
    "text": "هل ترغب بعزل الجناح عن الضيافة؟",
    "type": "b",
    "gate": "household.parents=permanent,occasional",
    "tier": 2,
    "consumer": "architectural.parents.quiet"
  },
  {
    "id": "hospitality.men",
    "domain": "hospitality",
    "text": "هل تحتاج مجلس رجال؟",
    "type": "b",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.hospitality.men"
  },
  {
    "id": "hospitality.women",
    "domain": "hospitality",
    "text": "هل تحتاج مجلس نساء؟",
    "type": "b",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.hospitality.women"
  },
  {
    "id": "hospitality.simultaneous",
    "domain": "hospitality",
    "text": "هل تستقبل الرجال والنساء في الوقت نفسه؟",
    "type": "b",
    "gate": "hospitality.men=true&hospitality.women=true",
    "tier": 2,
    "consumer": "architectural.hospitality.simultaneous"
  },
  {
    "id": "hospitality.frequency",
    "domain": "hospitality",
    "text": "كم مرة تستقبل الضيوف؟",
    "type": "weekly|monthly|rare",
    "gate": "hospitality.men=true;hospitality.women=true",
    "tier": 2,
    "consumer": "architectural.hospitality.frequency"
  },
  {
    "id": "hospitality.typical",
    "domain": "hospitality",
    "text": "كم ضيفًا تستقبل عادة؟",
    "type": "n",
    "gate": "hospitality.men=true;hospitality.women=true",
    "tier": 2,
    "consumer": "architectural.hospitality.typical"
  },
  {
    "id": "hospitality.peak",
    "domain": "hospitality",
    "text": "كم ضيفًا في أكبر مناسبة معتادة؟",
    "type": "n",
    "gate": "hospitality.men=true;hospitality.women=true",
    "tier": 2,
    "consumer": "architectural.hospitality.peak"
  },
  {
    "id": "hospitality.maleEntry",
    "domain": "hospitality",
    "text": "هل تريد مدخل رجال مستقلًا؟",
    "type": "b",
    "gate": "hospitality.men=true",
    "tier": 2,
    "consumer": "architectural.hospitality.maleEntry"
  },
  {
    "id": "hospitality.majlisBath",
    "domain": "hospitality",
    "text": "هل يحتاج مجلس الرجال إلى دورة مياه خاصة به؟",
    "type": "b",
    "gate": "hospitality.men=true",
    "tier": 2,
    "consumer": "architectural.hospitality.majlisBath"
  },
  {
    "id": "hospitality.femaleEntry",
    "domain": "hospitality",
    "text": "هل تريد مدخل نساء مستقلًا؟",
    "type": "b",
    "gate": "hospitality.women=true",
    "tier": 2,
    "consumer": "architectural.hospitality.femaleEntry"
  },
  {
    "id": "hospitality.dining",
    "domain": "hospitality",
    "text": "كيف تقدم طعام الضيوف؟",
    "type": "shared|separate|inside_majlis",
    "gate": "hospitality.men=true;hospitality.women=true",
    "tier": 2,
    "consumer": "architectural.hospitality.dining"
  },
  {
    "id": "hospitality.majlisDining",
    "domain": "hospitality",
    "text": "هل تريد قرب المقلط من مجلس الرجال أم بابًا مباشرًا؟",
    "type": "near|direct_access|none",
    "gate": "hospitality.men=true&hospitality.dining=shared,separate",
    "tier": 2,
    "consumer": "architectural.hospitality.majlisDining"
  },
  {
    "id": "hospitality.kitchenDining",
    "domain": "hospitality",
    "text": "هل تشترط قرب المقلط من المطبخ بمسار خدمة؟",
    "type": "b",
    "gate": "hospitality.dining=shared,separate",
    "tier": 2,
    "consumer": "architectural.hospitality.kitchenDining"
  },
  {
    "id": "hospitality.serviceRoute",
    "domain": "hospitality",
    "text": "هل تريد مسار تقديم الطعام دون عبور الصالة؟",
    "type": "b",
    "gate": "hospitality.dining=shared,separate",
    "tier": 2,
    "consumer": "architectural.hospitality.serviceRoute"
  },
  {
    "id": "site.cornerEntries",
    "domain": "site",
    "text": "هل تفضل توزيع المداخل على الشارعين؟",
    "type": "b",
    "gate": "@corner=true",
    "tier": 2,
    "consumer": "architectural.site.cornerEntries"
  },
  {
    "id": "site.narrowCourt",
    "domain": "site",
    "text": "هل تقبل دراسة فناء ضوئي بدل صالة ممتدة؟",
    "type": "b",
    "gate": "@narrow=true",
    "tier": 2,
    "consumer": "architectural.site.narrowCourt"
  },
  {
    "id": "site.wideWings",
    "domain": "site",
    "text": "هل ترغب بدراسة أجنحة متقابلة؟",
    "type": "b",
    "gate": "@wide=true",
    "tier": 2,
    "consumer": "architectural.site.wideWings"
  },
  {
    "id": "site.irregularUse",
    "domain": "site",
    "text": "هل تقبل استغلال الزوايا غير المنتظمة للخدمات والحديقة؟",
    "type": "b",
    "gate": "@irregular=true",
    "tier": 2,
    "consumer": "architectural.site.irregularUse"
  },
  {
    "id": "site.city",
    "domain": "site",
    "text": "في أي مدينة تقع الأرض إن لم تكن مسجلة؟",
    "type": "t",
    "gate": "@cityMissing=true",
    "tier": 2,
    "consumer": "architectural.site.city"
  },
  {
    "id": "site.neighbor",
    "domain": "site",
    "text": "هل توجد مبانٍ مجاورة تكشف الحديقة؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.site.neighbor"
  },
  {
    "id": "site.noise",
    "domain": "site",
    "text": "هل يوجد مصدر ضوضاء ملاصق للأرض؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.site.noise"
  },
  {
    "id": "site.view",
    "domain": "site",
    "text": "هل توجد إطلالة تريد الحفاظ عليها؟",
    "type": "t",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.site.view"
  },
  {
    "id": "site.slope",
    "domain": "site",
    "text": "هل يوجد انحدار ملحوظ بحسب الرفع المساحي؟",
    "type": "yes|no|unknown",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.site.slope"
  },
  {
    "id": "site.parking",
    "domain": "site",
    "text": "كم سيارة تحتاج استيعابها؟",
    "type": "n",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.site.parking"
  },
  {
    "id": "site.parkingShade",
    "domain": "site",
    "text": "هل تريد مواقف مظللة؟",
    "type": "b",
    "gate": "site.parking>0",
    "tier": 2,
    "consumer": "architectural.site.parkingShade"
  },
  {
    "id": "site.vestibule",
    "domain": "site",
    "text": "هل تريد دهليزًا يحجب الرؤية من المدخل؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.site.vestibule"
  },
  {
    "id": "privacy.entrySight",
    "domain": "privacy",
    "text": "هل تريد حجب الصالة عن رؤية الداخل من الباب؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.privacy.entrySight"
  },
  {
    "id": "privacy.guestRoute",
    "domain": "privacy",
    "text": "هل تريد منع عبور الضيوف لمنطقة العائلة؟",
    "type": "b",
    "gate": "hospitality.men=true;hospitality.women=true",
    "tier": 2,
    "consumer": "architectural.privacy.guestRoute"
  },
  {
    "id": "privacy.garden",
    "domain": "privacy",
    "text": "هل تريد حديقة عائلية غير مكشوفة؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.privacy.garden"
  },
  {
    "id": "privacy.windows",
    "domain": "privacy",
    "text": "هل تفضل توجيه النوافذ إلى الداخل عند وجود كشف؟",
    "type": "b",
    "gate": "site.neighbor=true",
    "tier": 2,
    "consumer": "architectural.privacy.windows"
  },
  {
    "id": "privacy.sound",
    "domain": "privacy",
    "text": "هل تريد عزل المجالس صوتيًا عن النوم؟",
    "type": "b",
    "gate": "hospitality.men=true;hospitality.women=true",
    "tier": 2,
    "consumer": "architectural.privacy.sound"
  },
  {
    "id": "privacy.stairs",
    "domain": "privacy",
    "text": "هل تريد الدرج بعيدًا عن الضيافة؟",
    "type": "b",
    "gate": "@multi=true",
    "tier": 2,
    "consumer": "architectural.privacy.stairs"
  },
  {
    "id": "privacy.familyEntry",
    "domain": "privacy",
    "text": "هل تحتاج مدخل عائلة مستقلًا؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.privacy.familyEntry"
  },
  {
    "id": "privacy.bathSight",
    "domain": "privacy",
    "text": "هل تريد ألا تفتح الحمامات مباشرة على الصالة؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.privacy.bathSight"
  },
  {
    "id": "privacy.womenRoute",
    "domain": "privacy",
    "text": "هل تريد مسار نساء لا يكشف منطقة الرجال؟",
    "type": "b",
    "gate": "hospitality.simultaneous=true",
    "tier": 2,
    "consumer": "architectural.privacy.womenRoute"
  },
  {
    "id": "privacy.night",
    "domain": "privacy",
    "text": "هل ترغب بمسار ليلي خاص بين النوم والحمام؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.privacy.night"
  },
  {
    "id": "daily.work",
    "domain": "daily",
    "text": "هل تعمل من المنزل؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.daily.work"
  },
  {
    "id": "daily.office",
    "domain": "daily",
    "text": "هل تحتاج مكتبًا مغلقًا؟",
    "type": "b",
    "gate": "daily.work=true",
    "tier": 2,
    "consumer": "architectural.daily.office"
  },
  {
    "id": "daily.officeGuests",
    "domain": "daily",
    "text": "هل يستقبل المكتب زوارًا؟",
    "type": "b",
    "gate": "daily.office=true",
    "tier": 2,
    "consumer": "architectural.daily.officeGuests"
  },
  {
    "id": "daily.breakfast",
    "domain": "daily",
    "text": "أين تتناول الأسرة الإفطار؟",
    "type": "kitchen|dining|living",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.daily.breakfast"
  },
  {
    "id": "daily.exercise",
    "domain": "daily",
    "text": "هل تحتاج مساحة نشاط بدني داخلية؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.daily.exercise"
  },
  {
    "id": "daily.hobbies",
    "domain": "daily",
    "text": "هل لديك هواية تحتاج مساحة خاصة؟",
    "type": "t",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.daily.hobbies"
  },
  {
    "id": "daily.tv",
    "domain": "daily",
    "text": "هل تحتاج منطقة تلفاز منفصلة؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.daily.tv"
  },
  {
    "id": "daily.prayer",
    "domain": "daily",
    "text": "هل ترغب بمصلى مستقل؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.daily.prayer"
  },
  {
    "id": "daily.storage",
    "domain": "daily",
    "text": "هل تحتاج تخزينًا يوميًا قرب المدخل؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.daily.storage"
  },
  {
    "id": "daily.qibla",
    "domain": "daily",
    "text": "هل يحتاج المصلى أو المجلس توجيهًا محددًا لاتجاه القبلة؟",
    "type": "b",
    "gate": "daily.prayer=true",
    "tier": 2,
    "consumer": "architectural.daily.qibla"
  },
  {
    "id": "daily.shoes",
    "domain": "daily",
    "text": "هل ترغب بمكان للأحذية والعباءات عند المدخل؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.daily.shoes"
  },
  {
    "id": "services.kitchens",
    "domain": "services",
    "text": "كم مطبخًا تحتاج؟",
    "type": "n",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.services.kitchens"
  },
  {
    "id": "services.kitchenStyle",
    "domain": "services",
    "text": "كيف تفضل المطبخ؟",
    "type": "closed|open|open_to_hall",
    "gate": "services.kitchens>0",
    "tier": 2,
    "consumer": "architectural.services.kitchenStyle"
  },
  {
    "id": "services.prep",
    "domain": "services",
    "text": "هل تحتاج مطبخ تحضير مستقلًا؟",
    "type": "b",
    "gate": "services.kitchens>0",
    "tier": 2,
    "consumer": "architectural.services.prep"
  },
  {
    "id": "services.heavyCooking",
    "domain": "services",
    "text": "هل الطبخ يومي وكثيف؟",
    "type": "b",
    "gate": "services.kitchens>0",
    "tier": 2,
    "consumer": "architectural.services.heavyCooking"
  },
  {
    "id": "services.serviceEntry",
    "domain": "services",
    "text": "هل تحتاج مدخل خدمة للمشتريات؟",
    "type": "b",
    "gate": "services.kitchens>0",
    "tier": 2,
    "consumer": "architectural.services.serviceEntry"
  },
  {
    "id": "services.pantry",
    "domain": "services",
    "text": "هل تحتاج مخزنًا ملاصقًا للمطبخ؟",
    "type": "b",
    "gate": "services.kitchens>0",
    "tier": 2,
    "consumer": "architectural.services.pantry"
  },
  {
    "id": "services.laundry",
    "domain": "services",
    "text": "هل تحتاج غرفة غسيل مستقلة؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.services.laundry"
  },
  {
    "id": "services.drying",
    "domain": "services",
    "text": "هل تحتاج مساحة تجفيف خارجية؟",
    "type": "b",
    "gate": "services.laundry=true",
    "tier": 2,
    "consumer": "architectural.services.drying"
  },
  {
    "id": "services.waste",
    "domain": "services",
    "text": "هل تريد مسارًا قصيرًا لإخراج النفايات؟",
    "type": "b",
    "gate": "services.kitchens>0",
    "tier": 2,
    "consumer": "architectural.services.waste"
  },
  {
    "id": "services.vent",
    "domain": "services",
    "text": "هل تشترط تهوية المطبخ على الخارج؟",
    "type": "b",
    "gate": "services.kitchens>0",
    "tier": 2,
    "consumer": "architectural.services.vent"
  },
  {
    "id": "sleep.master",
    "domain": "sleep",
    "text": "هل تريد جناح نوم رئيسيًا؟",
    "type": "b",
    "gate": "household.bedrooms>0",
    "tier": 2,
    "consumer": "architectural.sleep.master"
  },
  {
    "id": "sleep.dressing",
    "domain": "sleep",
    "text": "هل تحتاج غرفة ملابس للرئيسية؟",
    "type": "b",
    "gate": "sleep.master=true",
    "tier": 2,
    "consumer": "architectural.sleep.dressing"
  },
  {
    "id": "sleep.ensuite",
    "domain": "sleep",
    "text": "هل تريد حمامًا لكل غرفة نوم؟",
    "type": "b",
    "gate": "household.bedrooms>0",
    "tier": 2,
    "consumer": "architectural.sleep.ensuite"
  },
  {
    "id": "sleep.masterFloor",
    "domain": "sleep",
    "text": "في أي دور تفضل الرئيسية؟",
    "type": "ground|upper",
    "gate": "sleep.master=true&@multi=true",
    "tier": 2,
    "consumer": "architectural.sleep.masterFloor"
  },
  {
    "id": "sleep.stairsAway",
    "domain": "sleep",
    "text": "هل تريد الرئيسية بعيدة عن الدرج؟",
    "type": "b",
    "gate": "sleep.master=true&@multi=true",
    "tier": 2,
    "consumer": "architectural.sleep.stairsAway"
  },
  {
    "id": "sleep.quiet",
    "domain": "sleep",
    "text": "هل ترغب بمنطقة نوم معزولة عن الصالة؟",
    "type": "b",
    "gate": "household.bedrooms>0",
    "tier": 2,
    "consumer": "architectural.sleep.quiet"
  },
  {
    "id": "sleep.guestBath",
    "domain": "sleep",
    "text": "هل تحتاج حمامًا خاصًا لغرفة الضيف؟",
    "type": "b",
    "gate": "household.guestBedroom=true",
    "tier": 2,
    "consumer": "architectural.sleep.guestBath"
  },
  {
    "id": "sleep.morning",
    "domain": "sleep",
    "text": "هل تفضل إضاءة صباحية في الرئيسية؟",
    "type": "b",
    "gate": "sleep.master=true",
    "tier": 2,
    "consumer": "architectural.sleep.morning"
  },
  {
    "id": "living.count",
    "domain": "living",
    "text": "كم صالة عائلية تحتاج؟",
    "type": "n",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.living.count"
  },
  {
    "id": "living.shape",
    "domain": "living",
    "text": "ما تكوين الصالة الذي تفضله؟",
    "type": "balanced|l_shape|multi_zone",
    "gate": "living.count>0",
    "tier": 2,
    "consumer": "architectural.living.shape"
  },
  {
    "id": "living.seating",
    "domain": "living",
    "text": "كم شخصًا تريد أن تتسع لهم الجلسة؟",
    "type": "n",
    "gate": "living.count>0",
    "tier": 2,
    "consumer": "architectural.living.seating"
  },
  {
    "id": "living.passage",
    "domain": "living",
    "text": "هل تريد مسار عبور جانبيًا لا يقطع الجلسة؟",
    "type": "b",
    "gate": "living.count>0",
    "tier": 2,
    "consumer": "architectural.living.passage"
  },
  {
    "id": "living.diningCount",
    "domain": "living",
    "text": "كم غرفة طعام إجمالًا تحتاج؟",
    "type": "n",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.living.diningCount"
  },
  {
    "id": "living.partition",
    "domain": "living",
    "text": "هل تريد فاصلًا متحركًا بين الصالة والطعام؟",
    "type": "b",
    "gate": "living.count>0&living.diningCount>0",
    "tier": 2,
    "consumer": "architectural.living.partition"
  },
  {
    "id": "living.garden",
    "domain": "living",
    "text": "هل تريد اتصال الصالة بالحديقة؟",
    "type": "b",
    "gate": "living.count>0",
    "tier": 2,
    "consumer": "architectural.living.garden"
  },
  {
    "id": "living.height",
    "domain": "living",
    "text": "هل لديك ارتفاع سقف مفضل بالمتر؟",
    "type": "decimal",
    "gate": "living.count>0",
    "tier": 2,
    "consumer": "architectural.living.height"
  },
  {
    "id": "living.furniture",
    "domain": "living",
    "text": "هل لديك أثاث قائم يجب استيعابه؟",
    "type": "t",
    "gate": "living.count>0",
    "tier": 2,
    "consumer": "architectural.living.furniture"
  },
  {
    "id": "living.baths",
    "domain": "living",
    "text": "كم دورة مياه تحتاج إجمالًا؟",
    "type": "n",
    "gate": "",
    "tier": 1,
    "consumer": "architectural.living.baths"
  },
  {
    "id": "environment.climate",
    "domain": "environment",
    "text": "هل تتوفر بيانات مناخية موثقة للموقع؟",
    "type": "dry|humid|mountain|unknown",
    "gate": "@climateMissing=true",
    "tier": 4,
    "consumer": "architectural.environment.climate"
  },
  {
    "id": "environment.westShade",
    "domain": "environment",
    "text": "هل تفضل حماية الجلسات من شمس العصر؟",
    "type": "b",
    "gate": "@west=true",
    "tier": 4,
    "consumer": "architectural.environment.westShade"
  },
  {
    "id": "environment.dust",
    "domain": "environment",
    "text": "هل تتأثر المنطقة بالغبار المتكرر؟",
    "type": "b",
    "gate": "@dry=true;environment.climate=dry",
    "tier": 4,
    "consumer": "architectural.environment.dust"
  },
  {
    "id": "environment.courtyardShade",
    "domain": "environment",
    "text": "هل تفضل فناءً مظللًا في الصيف؟",
    "type": "b",
    "gate": "@dry=true;environment.climate=dry",
    "tier": 4,
    "consumer": "architectural.environment.courtyardShade"
  },
  {
    "id": "environment.humidity",
    "domain": "environment",
    "text": "هل تفضل دراسة التحكم بالرطوبة والتهوية؟",
    "type": "b",
    "gate": "@humid=true;environment.climate=humid",
    "tier": 4,
    "consumer": "architectural.environment.humidity"
  },
  {
    "id": "environment.rain",
    "domain": "environment",
    "text": "هل تريد دراسة حماية المداخل من المطر؟",
    "type": "b",
    "gate": "@mountain=true;environment.climate=mountain",
    "tier": 4,
    "consumer": "architectural.environment.rain"
  },
  {
    "id": "environment.drainage",
    "domain": "environment",
    "text": "هل توجد حاجة لدراسة تصريف مياه الموقع؟",
    "type": "b",
    "gate": "site.slope=yes;@mountain=true",
    "tier": 4,
    "consumer": "architectural.environment.drainage"
  },
  {
    "id": "environment.daylight",
    "domain": "environment",
    "text": "ما أهمية الضوء الطبيعي بالنسبة لك؟",
    "type": "high|medium|low",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.environment.daylight"
  },
  {
    "id": "environment.crossVent",
    "domain": "environment",
    "text": "هل تريد دراسة التهوية المتقاطعة؟",
    "type": "b",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.environment.crossVent"
  },
  {
    "id": "environment.glare",
    "domain": "environment",
    "text": "هل تريد تقليل الوهج المباشر في الجلسات؟",
    "type": "b",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.environment.glare"
  },
  {
    "id": "environment.outdoorSeason",
    "domain": "environment",
    "text": "متى تستخدم الجلسات الخارجية عادة؟",
    "type": "morning|evening|both|rare",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.environment.outdoorSeason"
  },
  {
    "id": "environment.energy",
    "domain": "environment",
    "text": "هل تفضل دراسة تقليل الحمل الحراري؟",
    "type": "b",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.environment.energy"
  },
  {
    "id": "garden.wanted",
    "domain": "garden",
    "text": "هل ترغب بحديقة أو فناء؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.garden.wanted"
  },
  {
    "id": "garden.type",
    "domain": "garden",
    "text": "أي نوع تفضل؟",
    "type": "courtyard|side|rear|flexible",
    "gate": "garden.wanted=true",
    "tier": 2,
    "consumer": "architectural.garden.type"
  },
  {
    "id": "garden.seating",
    "domain": "garden",
    "text": "هل تريد جلسة خارجية مظللة؟",
    "type": "b",
    "gate": "garden.wanted=true",
    "tier": 2,
    "consumer": "architectural.garden.seating"
  },
  {
    "id": "garden.access",
    "domain": "garden",
    "text": "هل تفضل دخول الحديقة من الصالة؟",
    "type": "b",
    "gate": "garden.wanted=true",
    "tier": 2,
    "consumer": "architectural.garden.access"
  },
  {
    "id": "garden.guestGarden",
    "domain": "garden",
    "text": "هل تريد حديقة منفصلة للضيوف؟",
    "type": "b",
    "gate": "garden.wanted=true&hospitality.men=true",
    "tier": 2,
    "consumer": "architectural.garden.guestGarden"
  },
  {
    "id": "garden.maintenance",
    "domain": "garden",
    "text": "ما مستوى الصيانة الذي تفضله؟",
    "type": "low|medium|high",
    "gate": "garden.wanted=true",
    "tier": 2,
    "consumer": "architectural.garden.maintenance"
  },
  {
    "id": "garden.planting",
    "domain": "garden",
    "text": "هل تفضل أشجار ظل أم نباتات قليلة المياه؟",
    "type": "shade|low_water|both",
    "gate": "garden.wanted=true",
    "tier": 2,
    "consumer": "architectural.garden.planting"
  },
  {
    "id": "garden.privacy",
    "domain": "garden",
    "text": "هل تريد استخدام الحديقة أثناء استقبال الضيوف؟",
    "type": "b",
    "gate": "garden.wanted=true",
    "tier": 2,
    "consumer": "architectural.garden.privacy"
  },
  {
    "id": "future.expand",
    "domain": "future",
    "text": "هل ترغب بتجهيز إمكانية توسع لاحق؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.future.expand"
  },
  {
    "id": "future.extraRooms",
    "domain": "future",
    "text": "كم غرفة إضافية تتوقع مستقبلًا؟",
    "type": "n",
    "gate": "future.expand=true",
    "tier": 2,
    "consumer": "architectural.future.extraRooms"
  },
  {
    "id": "future.elevator",
    "domain": "future",
    "text": "هل ترغب بحجز موقع مصعد مستقبلي؟",
    "type": "b",
    "gate": "@multi=true&future.expand=true",
    "tier": 2,
    "consumer": "architectural.future.elevator"
  },
  {
    "id": "future.upperSeparate",
    "domain": "future",
    "text": "هل تريد إمكانية استقلال الدور العلوي؟",
    "type": "b",
    "gate": "@multi=true",
    "tier": 2,
    "consumer": "architectural.future.upperSeparate"
  },
  {
    "id": "future.convert",
    "domain": "future",
    "text": "هل تريد غرفة قابلة لتغيير الوظيفة؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.future.convert"
  },
  {
    "id": "future.accessibility",
    "domain": "future",
    "text": "هل ترغب بتجهيز وصول ميسر مستقبلي؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.future.accessibility"
  },
  {
    "id": "future.annex",
    "domain": "future",
    "text": "هل تتوقع الحاجة لملحق مستقل؟",
    "type": "b",
    "gate": "",
    "tier": 2,
    "consumer": "architectural.future.annex"
  },
  {
    "id": "future.phasing",
    "domain": "future",
    "text": "هل تريد تنفيذ البناء على مراحل؟",
    "type": "b",
    "gate": "future.expand=true",
    "tier": 2,
    "consumer": "architectural.future.phasing"
  },
  {
    "id": "architecture.concept",
    "domain": "architecture",
    "text": "أي فكرة معمارية تفضل استكشافها؟",
    "type": "courtyard|pavilion|l_shape|u_shape|compact|undecided",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.concept"
  },
  {
    "id": "architecture.style",
    "domain": "architecture",
    "text": "ما الطراز الذي تميل إليه؟",
    "type": "modern|classic|traditional|mixed|undecided",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.style"
  },
  {
    "id": "architecture.mass",
    "domain": "architecture",
    "text": "هل تفضل كتلة واحدة أم أجنحة؟",
    "type": "single|wings|flexible",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.mass"
  },
  {
    "id": "architecture.axis",
    "domain": "architecture",
    "text": "هل تحب وجود محور بصري عند الدخول؟",
    "type": "b",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.axis"
  },
  {
    "id": "architecture.symmetry",
    "domain": "architecture",
    "text": "هل تفضل التماثل أم التكوين الحر؟",
    "type": "symmetry|free|flexible",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.symmetry"
  },
  {
    "id": "architecture.facade",
    "domain": "architecture",
    "text": "هل تفضل واجهة مصمتة أم فتحات واسعة مدروسة؟",
    "type": "solid|open|balanced",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.facade"
  },
  {
    "id": "architecture.materials",
    "domain": "architecture",
    "text": "ما الخامات التي تميل إليها؟",
    "type": "t",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.materials"
  },
  {
    "id": "architecture.ceiling",
    "domain": "architecture",
    "text": "هل ترغب بفراغ مزدوج الارتفاع؟",
    "type": "b",
    "gate": "@multi=true",
    "tier": 4,
    "consumer": "architectural.architecture.ceiling"
  },
  {
    "id": "architecture.avoid",
    "domain": "architecture",
    "text": "ما أكثر شيء لا تريده في المخطط؟",
    "type": "t",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.avoid"
  },
  {
    "id": "architecture.reference",
    "domain": "architecture",
    "text": "صف فكرة معمارية أعجبتك وسبب إعجابك بها.",
    "type": "t",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.architecture.reference"
  },
  {
    "id": "budget.amount",
    "domain": "budget",
    "text": "ما ميزانية البناء التقريبية بالريال إن رغبت؟",
    "type": "n",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.budget.amount"
  },
  {
    "id": "budget.priority",
    "domain": "budget",
    "text": "ما الأولوية عند المفاضلة؟",
    "type": "space|quality|cost|privacy",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.budget.priority"
  },
  {
    "id": "budget.finish",
    "domain": "budget",
    "text": "ما مستوى التشطيب المستهدف؟",
    "type": "basic|medium|high",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.budget.finish"
  },
  {
    "id": "budget.nonnegotiable",
    "domain": "budget",
    "text": "ما أهم شيء لا تقبل التنازل عنه؟",
    "type": "t",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.budget.nonnegotiable"
  },
  {
    "id": "budget.flex",
    "domain": "budget",
    "text": "ما الفراغ الذي تقبل تقليصه؟",
    "type": "t",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.budget.flex"
  },
  {
    "id": "budget.costTradeoff",
    "domain": "budget",
    "text": "هل تقبل مقارنة بدائل مختلفة في التكلفة؟",
    "type": "b",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.budget.costTradeoff"
  },
  {
    "id": "budget.count",
    "domain": "budget",
    "text": "كم بديلًا تصميميًا تريد؟",
    "type": "n",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.budget.count"
  },
  {
    "id": "budget.review",
    "domain": "budget",
    "text": "هل ترغب بمراجعة مختص قبل اعتماد المخطط؟",
    "type": "b",
    "gate": "",
    "tier": 4,
    "consumer": "architectural.budget.review"
  }
];
const labels = {"none":"لا يوجد","occasional":"متقطعة","permanent":"دائمة","young":"صغار","school":"سن المدرسة","teen":"مراهقون","adult":"بالغون","mixed":"فئات متعددة","weekly":"أسبوعيًا","monthly":"شهريًا","rare":"نادرًا","shared":"مشترك","separate":"مستقل","inside_majlis":"داخل المجلس","near":"قريب","direct_access":"باب مباشر","yes":"نعم","no":"لا","unknown":"غير معلوم","kitchen":"المطبخ","dining":"الطعام","living":"الصالة","closed":"مغلق","open":"مفتوح على الطعام","open_to_hall":"مفتوح على الصالة","ground":"أرضي","upper":"علوي","balanced":"متوازنة","l_shape":"شكل L","multi_zone":"عدة مناطق","dry":"جاف","humid":"رطب","mountain":"جبلي","high":"مرتفع","medium":"متوسط","low":"منخفض","morning":"صباحًا","evening":"مساءً","both":"كلاهما","courtyard":"فناء","side":"جانبية","rear":"خلفية","flexible":"مرن","shade":"ظل","low_water":"قليلة المياه","pavilion":"أجنحة","u_shape":"شكل U","compact":"مدمج","undecided":"غير محدد","modern":"حديث","classic":"كلاسيكي","traditional":"تراثي","single":"كتلة واحدة","wings":"أجنحة","symmetry":"تماثل","free":"حر","solid":"مصمتة","space":"المساحة","quality":"الجودة","cost":"التكلفة","privacy":"الخصوصية","basic":"أساسي"};
const mapping = {"household.bedrooms":["space","bedroom"],"hospitality.men":["space","male_majlis"],"hospitality.women":["space","female_majlis"],"household.guestBedroom":["space","guest_room"],"daily.office":["space","office"],"daily.prayer":["space","prayer"],"services.laundry":["space","laundry"],"services.kitchens":["space","kitchen"],"living.count":["space","living"],"living.diningCount":["space","dining"],"living.baths":["space","bath"],"sleep.dressing":["field","features.masterDressing"],"sleep.ensuite":["field","features.allEnsuite"],"privacy.familyEntry":["field","features.familyEntrance"],"privacy.bathSight":["field","features.bathsOffHall"],"services.kitchenStyle":["field","preferences.kitchenStyle"],"hospitality.majlisDining":["relation","male_majlis","dining"]};
export function siteFacts(land){const side=land.entries?.[0];const w=["e","w"].includes(side)?land.depthM:land.widthM,d=["e","w"].includes(side)?land.widthM:land.depthM;return {"@corner":(land.streets||[]).some((s,i,a)=>a.some(t=>["n","s"].includes(s.side)!==["n","s"].includes(t.side))),"@narrow":!!side&&d/w>=1.7,"@wide":!!side&&w/d>=1.2,"@irregular":!!land.engineLand?.polygon,"@multi":land.floors>1,"@west":side==="w","@cityMissing":!land.city,"@climateMissing":!land.climate,"@dry":land.climate==="dry","@humid":land.climate==="humid","@mountain":land.climate==="mountain"}}

export function gateMatches(gate,brief){if(!gate)return true;const site=siteFacts(brief.land);return gate.split(";").some(or=>or.split("&").every(term=>{const [_,key,op,rhs]=term.match(/^([^=>]+)([=>])(.+)$/)||[];if(!key)throw Error("Invalid gate "+term);const fact=brief.facts[key];const val=key.startsWith("@")?site[key]:fact?.verification==="confirmed"&&!fact.recheck?fact.value:undefined;if(val===undefined||val===null)return false;return op===">"?typeof val==="number"&&val>Number(rhs):rhs.split(",").includes(String(val))}))}

export function createBrief(land){if(!land||!(land.widthM>0&&land.depthM>0))throw Error("Inherited land required");return {schemaVersion:"SHARAA-BRIEF/3.0.0",revision:0,land:JSON.parse(JSON.stringify(land)),facts:{},history:[],deferred:[],acknowledged:[]}}

export function validate(q,value){if(q.type==="b")return typeof value==="boolean";if(q.type==="n")return Number.isSafeInteger(value)&&value>=0&&(q.id!=="budget.count"||value>=1)&&(q.id!=="household.bedrooms"||value>=1);if(q.type==="decimal")return typeof value==="number"&&Number.isFinite(value)&&value>0;if(q.type==="t")return typeof value==="string"&&value.trim().length>0&&value.length<=2000;return q.type.split("|").includes(value)}

export function answer(brief,id,value,{source="client_answer",priority="preferred",evidence="",revise=false}={}){const q=bank.find(q=>q.id===id);if(!q||!validate(q,value)||!["client_answer","client_confirmed","client_free_text","ai_inference","design_default","land_step"].includes(source)||!["mandatory","preferred","flexible"].includes(priority))throw Error("Invalid answer");if(!gateMatches(q.gate,brief))throw Error("Question not applicable");const b=JSON.parse(JSON.stringify(brief));const prev=b.facts[id];const confirmed=["client_answer","client_confirmed","land_step"].includes(source);if(prev?.verification==="confirmed"&&(!confirmed||(!revise&&JSON.stringify(prev.value)!==JSON.stringify(value))))throw Error("Explicit revision required");if(!confirmed&&priority==="mandatory")priority="preferred";b.revision++;b.facts[id]={value,source,priority,verification:confirmed?"confirmed":"needs_confirmation",evidence,revision:b.revision};b.history.push({id,before:prev||null,after:b.facts[id],revision:b.revision});b.deferred=b.deferred.filter(x=>x!==id);b.acknowledged=[];if(prev&&prev.value!==value){const affected=new Set([id]);let changed=true;while(changed){changed=false;for(const n of bank){if(n.id!==id&&!affected.has(n.id)&&n.gate.split(/[;&]/).some(t=>affected.has(t.split(/[=>]/)[0]))){affected.add(n.id);changed=true}}}for(const k of affected)if(k!==id&&b.facts[k])b.facts[k].recheck=true}return b}

export function conflicts(b){const v=k=>b.facts[k]?.verification==="confirmed"&&!b.facts[k].recheck?b.facts[k].value:undefined;const out=[];if(v("hospitality.peak")!==undefined&&v("hospitality.typical")!==undefined&&v("hospitality.peak")<v("hospitality.typical"))out.push({id:"guest-capacity",fields:["hospitality.peak","hospitality.typical"],reason:"عدد المناسبة الكبرى أقل من العدد المعتاد"});if(v("hospitality.dining")==="separate"&&v("living.diningCount")===0)out.push({id:"dining-count",fields:["hospitality.dining","living.diningCount"],reason:"طعام مستقل مع صفر غرف طعام"});if(v("hospitality.majlisDining")==="direct_access"&&v("living.diningCount")===0)out.push({id:"door-no-dining",fields:["hospitality.majlisDining","living.diningCount"],reason:"باب مباشر إلى غرفة غير موجودة"});return out}

export function nextQuestion(b,{depth="standard"}={}){const c=conflicts(b)[0];if(c)return {kind:"conflict",...c};const ranked=bank.filter(q=>askable(q,depth)&&gateMatches(q.gate,b)&&(!b.facts[q.id]||b.facts[q.id].verification!=="confirmed"||b.facts[q.id].recheck)&&(!b.deferred.includes(q.id)||q.tier===1)).map(q=>{const D=Math.min(100,bank.filter(n=>n.gate.includes(q.id+"=")||n.gate.includes(q.id+">")).length*15);const I=q.tier===1?100:q.tier===2?80:55;const U=b.facts[q.id]?70:100;const R=q.tier<=2?85:40;const P=b.facts[q.id]?.priority==="mandatory"?100:60;const B=q.type==="t"?40:10;return {...q,score:.30*I+.20*U+.20*R+.15*P+.15*D-.10*B,kind:"question",options:q.type==="b"?[{value:true,label:"نعم"},{value:false,label:"لا"}]:q.type.includes("|")?q.type.split("|").map(value=>({value,label:labels[value]||value})):[]}});return ranked.sort((a,b)=>a.tier-b.tier||b.score-a.score||a.id.localeCompare(b.id))[0]||null}

export function readiness(b){const missing=bank.filter(q=>q.tier===1&&gateMatches(q.gate,b)&&(!b.facts[q.id]||b.facts[q.id].verification!=="confirmed"||b.facts[q.id].recheck)).map(q=>q.id);const pending=Object.keys(b.facts).filter(k=>{const f=b.facts[k];return f.priority==="mandatory"&&(f.verification!=="confirmed"||f.recheck)});const limits=Object.keys(b.facts).filter(k=>{const f=b.facts[k];return f.verification==="confirmed"&&!f.recheck&&gateMatches(bank.find(q=>q.id===k).gate,b)&&(!mapping[k]||f.priority==="mandatory"||mapping[k][0]!=="space")});const hard=limits.filter(k=>b.facts[k].priority==="mandatory");const c=conflicts(b);const status=c.length?"CONFLICT_REQUIRES_DECISION":missing.length||pending.length?"NEEDS_CLARIFICATION":limits.length?"LIMITED_SUPPORT":"READY_TO_GENERATE";return {status,missing,pending,limits,hard,conflicts:c,canGenerate:!c.length&&!missing.length&&!pending.length&&!hard.length&&limits.every(k=>b.acknowledged.includes(k))}}

export function acknowledge(b,ids){const r=readiness(b);if(!Array.isArray(ids)||ids.some(k=>!r.limits.includes(k)||r.hard.includes(k)))throw Error("Cannot waive mandatory or unknown");return {...b,acknowledged:[...new Set([...b.acknowledged,...ids])]}}

export function defer(b,id){const q=bank.find(q=>q.id===id);if(!q||q.tier===1||b.facts[id]?.priority==="mandatory")throw Error("Cannot defer");return {...b,deferred:[...new Set([...b.deferred,id])]}}

export function reviseLand(b,land){const n=createBrief(land);n.facts=JSON.parse(JSON.stringify(b.facts));n.history=[...b.history,{id:"land",before:b.land,after:land}];n.revision=b.revision+1;for(const q of bank)if((q.domain==="site"||q.domain==="environment"||q.gate.includes("@"))&&n.facts[q.id])n.facts[q.id].recheck=true;return n}

export function ingest(b,proposals){let n=b;const rejected=[];for(const p of proposals){try{n=answer(n,p.id,p.value,{source:"ai_inference",priority:p.priority||"preferred",evidence:p.evidence||""})}catch(e){rejected.push({id:p.id,reason:String(e)})}}return {brief:n,rejected}}

export function projectNative(b,native,api){let n=JSON.parse(JSON.stringify(native));const sent=[],withheld=[];for(const [id,f] of Object.entries(b.facts)){const m=mapping[id];if(!m||f.verification!=="confirmed"||f.recheck||!gateMatches(bank.find(q=>q.id===id).gate,b)){withheld.push(id);continue}const meta={source:"client_confirmed",priority:f.priority,verification:"confirmed",originalText:f.evidence||bank.find(q=>q.id===id).text};if(m[0]==="space"){const count=typeof f.value==="boolean"?Number(f.value):f.value;const old=n.spaces.find(s=>s.id===m[1]);if(old&&old.count!==count){withheld.push(id);continue}n=api.upsertSpace(n,{type:m[1],count,...meta});}else if(m[0]==="field"){if(f.value===false||f.priority==="mandatory"){withheld.push(id);continue}n=api.setField(n,m[1],f.value,meta)}else{if(f.value==="none"||f.priority==="mandatory"){withheld.push(id);continue}n=api.addRelation(n,{from:m[1],to:m[2],relation:f.value,...(f.value==="direct_access"?{detail:"door"}:{}),...meta})}sent.push(id)}return {brief:n,sent,withheld,requiresIntegrationReview:true}}

// SHARAA-BRIEF/3.0.0 — حالة الدعم لكل معلومة: لا تُسقط معلومة بصمت؛ كل معلومة تظهر بحالة واحدة مع سبب.
// الحالات: projected (أُرسلت للمحوّل) | withheld (مؤجلة/غير مطبقة مع سبب) | unmapped (لا عقد تكامل لها) | not_applicable (بوابتها غير متحققة) | unconfirmed.
export function factSupport(b){
  const out=[];
  for(const q of bank){
    const f=b.facts[q.id];
    if(!f){continue}
    const base={id:q.id,domain:q.domain,consumer:q.consumer,importance:f.priority,verification:f.verification,source:f.source,revision:f.revision,mandatory:f.priority==="mandatory"};
    if(!gateMatches(q.gate,b)){out.push({...base,support:"not_applicable",reason:"البوابة غير متحققة"});continue}
    if(f.verification!=="confirmed"||f.recheck){out.push({...base,support:"unconfirmed",reason:f.recheck?"تحتاج مراجعة بعد تغيير الأرض أو إجابة مرتبطة":"غير مؤكدة من العميل"});continue}
    if(!mapping[q.id]){out.push({...base,support:"unmapped",reason:"لا يوجد عقد تكامل لهذه المعلومة في المحرك القائم"});continue}
    out.push({...base,support:"candidate",reason:"عقد التكامل موجود؛ يتطلب تأكيد المحوّل"});
  }
  return out;
}

// سحب استنتاج غير مؤكد: لا يُسحب إلا ما لم يؤكده العميل؛ المؤكد يُعدَّل بمراجعة صريحة لا بالسحب.
export function retract(b,id){const f=b.facts[id];if(!f)throw Error("Unknown fact");if(f.verification==="confirmed")throw Error("Confirmed facts need explicit revision");const n=JSON.parse(JSON.stringify(b));delete n.facts[id];n.revision++;n.history.push({id,before:f,after:null,revision:n.revision});n.acknowledged=[];return n}
