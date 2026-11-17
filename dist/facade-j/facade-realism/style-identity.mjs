// هوية السياق لكل طراز (محيط الواجهة): أرضية الحوش، سور القطعة، خشب البوابة، لياسة الجوار، توليفة النباتات.
// الغاية: ألا تتشابه الأنماط الستة في الصورة الكاملة. القيم قرارات تصميمية للعرض (توضيحية) وليست مواصفات موثّقة؛
// ما استُند فيه إلى مصدر مسجّل في note، وما لا مصدر له موسوم «غير متحقق».
export const STYLE_CONTEXT = Object.freeze({
  J: { ar: 'معاصر حجري', paving: '#b3aca0', wall: null, wood: '#5d4630', neighbor: ['#ece8e0', '#d9d3c8', '#f3f0ea'], farGround: '#cfc4ae',
    note: 'رصف حجري رمادي دافئ وسور بخامة الواجهة؛ قرار تصميمي' },
  N: { ar: 'نجدي', paving: '#d4a86f', wall: '#b59268', wood: '#4a3220', neighbor: ['#cfb48b', '#c2a279', '#d8bf98'], farGround: '#d9bf92',
    note: 'أرض رملية ترابية وسور لَبِن ملوّن بلون الجدار وباب نخل داكن؛ الفكرة من وصف النجدي (لبن/طين/نخل) في ويكيبيديا، واللون قرار تصميمي' },
  H: { ar: 'حجازي', paving: '#f1ead9', wall: '#efe6d2', wood: '#3f5e4c', neighbor: ['#f2ecdd', '#e8dfca', '#f6f1e6'], farGround: '#e9dfc9',
    note: 'رصف فاتح وسور جيري أبيض لؤلؤي وبوابة خضراء/خشبية؛ اللؤلؤي والرملي من ألوان إرشادات جدة المنشورة (غولف نيوز)، وخضرة الخشب قرار تصميمي' },
  S: { ar: 'سلماني', paving: '#8c8277', wall: null, wood: '#3a2a1e', neighbor: ['#d3be9b', '#c7ae86', '#dcc9a8'], farGround: '#cdb892',
    note: 'رصف حجري داكن مطفأ وسور بحجر الواجهة المطبّق وبوابة برونزية-بنية؛ غير متحقق: لون الرصف' },
  C: { ar: 'كلاسيكي', paving: '#e6dccb', wall: '#f2ebdc', wood: '#2a2724', neighbor: ['#f1e8d5', '#e9dcc2', '#f6efe0'], farGround: '#d9cfb8',
    note: 'رصف عاجي وسور مطلي بدعامات وبوابة حديد أسود وسرو ومروج؛ قرار تصميمي (غير متحقق من مرجع سعودي)' },
  M: { ar: 'معاصر خفيف', paving: '#8d9193', wall: '#e8e8e4', wood: '#3a3d40', neighbor: ['#e4e4df', '#d3d4d0', '#f1f1ee'], farGround: '#bdb8ac',
    note: 'بلاط خرساني رمادي وسور أبيض وبوابة ألمنيوم رمادية داكنة وأعشاب زينة؛ قرار تصميمي' },
});
/** توليفة نباتات الأحواض لكل طراز، وعدد النخيل الإضافي في الحوش. */
export const STYLE_PLANTS = Object.freeze({
  J: { beds: ['sage', 'grass', 'shrub'], extraPalms: 0, cypress: false },
  N: { beds: ['grass', 'rock', 'grass'], extraPalms: 2, cypress: false },
  H: { beds: ['shrub', 'shrub', 'grass'], extraPalms: 1, cypress: false },
  S: { beds: ['sage', 'grass', 'rock'], extraPalms: 0, cypress: false },
  C: { beds: ['shrub', 'shrub', 'sage'], extraPalms: 0, cypress: true },
  M: { beds: ['grass', 'sage', 'grass'], extraPalms: 0, cypress: false },
});
