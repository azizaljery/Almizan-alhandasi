// (الجولة 21) مجموعة محجوزة ثالثة H11–H15 — كتبها المنسّق وأودعها قبل أي تطوير في الجولة 21.
// H6–H10 صارت معروفة بعد مراجعة r20. لا تُشغَّل هذه المجموعة ولا تُفتح نتائجها ولا تُستعمل في أي ضبط قبل إيداع ملف التجميد.
export const HELDOUT3 = [
  { id: 'H11', name: 'أرض 28×26 والشارع شمالي', land: { width: 28, length: 26, streets: ['n'], entries: ['n'] },
    text: 'دور واحد: 5 غرف نوم منها ماستر بغرفة ملابس، مجلس رجال بمقلط ومدخل خاص، مجلس نساء، صالة تطل على حوش داخلي، مطبخ وغرفة خادمة',
    counts: { bedrooms: 5, majlis: 2, baths: 7, kitchens: 1, halls: 1, dining: 1 } },
  { id: 'H12', name: 'دوران على 16×32 والشارع غربي', land: { width: 16, length: 32, streets: ['w'], entries: ['w'], floors: 2 },
    text: 'دورين: تحت مجلس رجال بدورة مياه وصالة وطعام ومطبخ، وفوق 4 غرف نوم منها ماستر وصالة صغيرة',
    counts: { bedrooms: 4, majlis: 1, baths: 6, kitchens: 1, halls: 2, dining: 1 } },
  { id: 'H13', name: 'زاوية 22×22 بشارعين جنوبي وغربي', land: { width: 22, length: 22, streets: ['s', 'w'], entries: ['s', 'w'] },
    text: 'ابي مدخل الرجال من الشارع الغربي ومدخل العائلة من الجنوب، 4 غرف، مجلس، صالة، مطبخ مقفل في الخلف وطعام جنبه',
    counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 } },
  { id: 'H14', name: 'أرض 20×40 عميقة والشارع جنوبي', land: { width: 20, length: 40, streets: ['s'], entries: ['s'] },
    text: 'أربعة تصاميم مختلفة: دور واحد، 4 غرف نوم، مجلسين، صالة كبيرة، مطبخ 4×5 في الخلف، غرفة سائق قرب المدخل',
    counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 } },
  { id: 'H15', name: 'طلب متعارض عمدًا', land: { width: 12, length: 20, streets: ['s'], entries: ['s'] },
    text: 'دور واحد: 6 غرف نوم كل غرفة 5×5، مجلسين كبار، صالة كبيرة، ومطبخ',
    counts: { bedrooms: 6, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 0 } },
];
