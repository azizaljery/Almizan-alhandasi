// (الجولة التاسعة عشرة — توجيه المالك، سادسًا) حالات مستقلة محجوزة (held-out): كُتبت وثُبّتت في المستودع قبل أي ضبط في الجولة 19،
// ولا تُستعمل في ضبط أي قياس أو وزن أو تنظيم. تختلف عن C1–C10 في الأرض (اتجاه الشارع، النسب، المساحة) وفي الطلب.
// تُقاس عليها المعايرة الجديدة بعد الجولة مقابل خط الأساس (شيفرة r18 كما هي): scripts/acceptance-run.mjs <stage> --cases heldout --engine v2
// حكم المراجع المستقل عليها غير موجود عند كتابتها (غير متحقق) — يُضاف حين يراجعها.
export const HELDOUT = [
  { id: 'H1', name: 'أرض عريضة قليلة العمق والشارع شمالي', land: { width: 30, length: 22, streets: ['n'], entries: ['n'] },
    text: 'فيلا دور واحد: 4 غرف نوم منها ماستر، مجلس رجال بمدخل مستقل، مجلس نساء، صالة، طعام جنب المطبخ، وغرفة خادمة',
    counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 } },
  { id: 'H2', name: 'أرض ضيقة 15 م بمجلسين', land: { width: 15, length: 32, streets: ['s'], entries: ['s'] },
    text: '3 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ مقفل وطعام',
    counts: { bedrooms: 3, majlis: 2, baths: 5, kitchens: 1, halls: 1, dining: 1 } },
  { id: 'H3', name: 'أرض كبيرة وبرنامج واسع', land: { width: 25, length: 35, streets: ['s'], entries: ['s'] },
    text: '5 غرف نوم منها ماستر بغرفة ملابس، مجلس رجال بمقلط، مجلس نساء، صالة تطل على الحديقة، المطبخ في الخلف، غرفة سائق، وغرفة خادمة',
    counts: { bedrooms: 5, majlis: 2, baths: 7, kitchens: 1, halls: 1, dining: 1 } },
  { id: 'H4', name: 'دوران على أرض 20×25 والشارع شرقي', land: { width: 20, length: 25, streets: ['e'], entries: ['e'], floors: 2 },
    text: 'دورين: مجلس رجال ومجلس نساء والطعام والمطبخ في الأرضي، و4 غرف نوم فوق منها الماستر',
    counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 } },
  { id: 'H5', name: 'مقاسات صريحة', land: { width: 22, length: 30, streets: ['s'], entries: ['s'] },
    text: 'دور واحد، 4 غرف نوم، مجلس 5×7، المطبخ 3.5×5، وصالة كبيرة',
    counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 } },
];
