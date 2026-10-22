// مدوّنة اختبار الحوار (شرط المالك): «لا تكتفِ باختبارات الكود؛ اختبر فهم الطلبات العربية الطويلة والتعديلات
// المتتابعة، مع إثبات عدم تغيير أجزاء لم يطلب العميل تعديلها.»
//
// LONG: طلبات طويلة (150–400 كلمة) مكتوبة كما يكتبها عميل حقيقي: استطراد، تصحيح في منتصف الكلام («لا لا خلها…»)،
// نفي، أرقام هندية، كلمات إنجليزية، كلام متعارض، وأشياء لا يريدها. لكل طلب «الفهم المتوقع» مكتوبًا بيد إنسان
// (لا منسوخًا من مخرجات المحلل): هذا ما يفهمه معماري يقرأ الكلام، لا ما يستطيع المحلل استخراجه.
//
// صيغة البنود المتوقعة (ذرّية؛ تُقارن بندًا ببند في dialog-run.mjs):
//   counts:  { bedrooms, majlis, kitchens, dining } — العدد النهائي المقصود بعد التصحيحات. (لا يُذكر ما لم يذكره العميل.)
//   prefs:   أسماء التفضيلات: allEnsuite, sharedBaths, masterDressing, openKitchen, closedKitchen, kitchenOpenHall,
//            familyEntrance, guestEntrance, womenSeparate, bathsOffHall, noCorridors, elderlyRoom, economy,
//            big_majlis, big_hall, big_kitchen, big_master
//   extras:  maid, maid.bath, maid.ext, driver, driver.bath, office, office.ext, prayer, storage, laundry, guestRoom, guestRoom.bath
//   absent:  majlis, dining, office, prayer, maid, driver — أشياء قال صراحة إنه لا يريدها
//   dims:    { room: [w, l] } أبعاد صريحة؛ areas: { room: m2 } مساحة بلا أبعاد
//   rules:   'place:<فراغ>:<جهة مطلقة n|s|e|w|center>' أو '!' قبل الجهة للنفي، 'close:<أ>+<ب>' (بجوار/قرب)،
//            'away:<أ>+<ب>' (بعيد/غير ملاصق)، 'floor:<فراغ>:ground|upper'، 'cluster:<مجموعة>'
//            مع الدرجة: { r: '...', level: 'must'|'prefer'|'forbid' }. الجهات النسبية (أمام/خلف/يمين) تُحوَّل إلى مطلقة
//            بحسب المدخل الأول للأرض قبل المقارنة.
//   floors:  1 | 2 — فقط إن قاله
//   facade:  ['stone','modern',...] مواد الواجهة وطرازها
//   unsupported: garage, pool, annex, roof, balcony, elevator, basement, courtyard, site — ما طلبه ولا يدعمه الإصدار
//   conflicts: أنواع التعارض التي يجب أن تُسأل (place-opposite, relation-contradiction, single-floor-two-floor-features,
//              area-exceeds-land, dims-exceed-land, floor-group-member, count-mismatch ...)
//   unclear: مقاطع من الكلام لا يمكن تمثيلها في المخطط ويجب أن تُعرض للعميل «لم أفهم» بدل أن تسقط بصمت
//   optional: بنود مقبولة إن استُخرجت ولا تُحتسب إن غابت (تفسير مكافئ أو صياغة مزدوجة لنفس المعنى)
//   traps: وصف نصي لما يجب ألا يُستخرج (للتقرير فقط؛ الخطأ يظهر تلقائيًا في «أضيف خطأً»)

export const LONG = [
  {
    id: 'L1', name: 'الرياض — تصحيح عدد الغرف في منتصف الكلام، أرقام هندية، نفي مكتب ومصلى',
    land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
    text: `السلام عليكم، الله يعطيكم العافية. أنا محمد من الرياض، عندي أرض ٢٠×٣٠ على شارع واحد من الجنوب، وأبي أبني فيلا دور واحد لي ولعيالي، احنا سبعة أنفار. أبي خمس غرف نوم... لا لا خلها أربع غرف نوم بس، لأن الميزانية ما تسمح. وحدة منهن ماستر لي أنا وأم العيال وفيها غرفة ملابس (walk in closet) وحمام خاص. باقي الغرف للعيال، ومو لازم كل غرفة بحمام، يتشاركون عادي. المجلس هو أهم شي عندي: مجلس رجال كبير مقاسه تقريبًا ٥×٧، يكون على الشارع وله مدخل مستقل عن العائلة، ودورة مياه الضيوف قريبة من المجلس. ومجلس نساء صغير منفصل عن مجلس الرجال. الصالة في وسط البيت، والمطبخ أبيه مقفل مو مفتوح لأن ريحة الطبخ تزعج، والمطبخ يكون في الخلف وجنب الطعام. غرفة خادمة بحمام قريبة من المطبخ. ما أبي مكتب، ولا أبي مصلى لأن المسجد جنبنا. أبي غرفة غسيل ومخزن صغير. وبالنسبة للكراج أبي مظلة سيارتين قدام. وشي ثاني مهم: أبي البيت فيه إضاءة طبيعية كثيرة وما يكون مظلم مثل بيتنا القديم. وشكرًا.`,
    expect: {
      counts: { bedrooms: 4, majlis: 2, kitchens: 1, dining: 1 },
      prefs: ['masterDressing', 'sharedBaths', 'guestEntrance', 'womenSeparate', 'closedKitchen'],
      extras: ['maid', 'maid.bath', 'laundry', 'storage'],
      absent: ['office', 'prayer'],
      dims: { majlis: [5, 7] },
      rules: [{ r: 'place:majlis:s', level: 'must' }, { r: 'close:guestwc+majlis', level: 'must' }, { r: 'place:hall:center', level: 'must' }, { r: 'place:kitchen:n', level: 'must' }, { r: 'close:dining+kitchen', level: 'must' }, { r: 'close:kitchen+maid', level: 'must' }],
      floors: 1, unsupported: ['garage'], conflicts: [], unclear: ['إضاءة طبيعية'],
      optional: ['rule:away:majlis+majlis_w', 'pref:big_majlis', 'count:baths', 'pref:parking'], // (الجولة الثانية عشرة) «مظلة سيارتين قدام»: مواقف تُرسم في الارتداد
      traps: '«المسجد جنبنا» ليست قاعدة مكانية للمصلى؛ «خمس غرف» صُحّحت إلى أربع.',
    },
  },
  {
    id: 'L2', name: 'جدة — دوران، كلمات إنجليزية، تراجع عن المطبخ المفتوح، لا خادمة ولا مسبح',
    land: { width: 18, length: 25, streets: ['w'], entries: ['w'], floors: 2 },
    text: `مرحبا، أنا أبو فيصل من جدة. الأرض ١٨ في ٢٥ والشارع من جهة الغرب، ونبغى البيت دورين. الدور الأرضي يكون فيه المجلس والمقلط والمطبخ، والمجلس يكون على الشارع وله مدخل خاص للرجال، يعني ما أبغى الضيوف يشوفون أهل البيت أبدًا. وكمان نبغى غرفة نوم لأمي في الأرضي قريبة من الصالة لأنها كبيرة في السن وما تقدر تطلع الدرج. الدور العلوي فيه خمس غرف نوم: الماستر حقتي أنا وزوجتي، وأبغاها بعيدة عن الدرج عشان الهدوء، والباقي للعيال. كل غرفة بحمامها، هذا شي أساسي عندنا. المطبخ أبغاه open kitchen على الطعام زي البيوت الحديثة... لا ترى غيرت رأيي، خليه مقفل أحسن عشان الريحة والدخان. ما نبغى خدامة ساكنة عندنا، تجي الصبح وتروح، فما يحتاج غرفة خادمة. بس نبغى غرفة سواق بحمام، وتكون من برا. الواجهة نبغاها modern بحجر فاتح. ولو فيه مصعد صغير لأمي يكون ممتاز بس مو شرط. وفيه بلكونة للماستر نطل منها على البحر إذا أمكن. وما أبغى مسبح لأنه يحتاج صيانة وتكاليف ما لها داعي. وشكرًا لكم وبانتظار التصميم.`,
    expect: {
      counts: { bedrooms: 6, majlis: 1, kitchens: 1, dining: 1 },
      prefs: ['guestEntrance', 'elderlyRoom', 'allEnsuite', 'closedKitchen'],
      extras: ['driver', 'driver.bath'],
      absent: ['maid'],
      rules: [{ r: 'floor:majlis:ground', level: 'must' }, { r: 'floor:dining:ground', level: 'must' }, { r: 'floor:kitchen:ground', level: 'must' }, { r: 'place:majlis:w', level: 'must' }, { r: 'floor:elderly:ground', level: 'must' }, { r: 'close:elderly+hall', level: 'must' }, { r: 'floor:bedrooms:upper', level: 'must' }, { r: 'away:master+stairs', level: 'must' }],
      floors: 2, facade: ['stone', 'modern'], unsupported: ['elevator', 'balcony'], conflicts: [], unclear: [],
      optional: ['rule:floor:master:upper', 'conflict:floor-group-member', 'count:baths', 'rule:floor:kids:upper'],
      traps: '«ما أبغى مسبح» ليس طلب مسبح؛ «open kitchen» تراجع عنه العميل إلى مطبخ مقفل؛ غرفة الأم سادسة غرف النوم.',
    },
  },
  {
    id: 'L3', name: 'فصحى رسمية — أرض زاوية بمدخلين، حمام لكل غرفة، مكتب بمدخل خارجي، بلا غرفة طعام',
    land: { width: 25, length: 25, streets: ['s', 'e'], entries: ['s', 'e'] },
    text: `السادة المهندسون المحترمون، تحية طيبة وبعد. نرغب في تصميم فيلا سكنية من دور واحد على أرض زاوية أبعادها ٢٥ × ٢٥ مترًا، يحدها شارع من الجنوب وشارع من الشرق. نريد أن يكون مدخل الرجال من الشارع الجنوبي، وأن يكون للعائلة مدخل مستقل من الشارع الشرقي. يتكون البرنامج من غرفة نوم رئيسية مقاسها ٥ × ٦ أمتار مع غرفة ملابس، وثلاث غرف نوم أخرى للأبناء، على أن تكون لكل غرفة دورة مياه خاصة بها. نحتاج مجلسًا للرجال على الشارع الجنوبي، ومجلسًا للنساء منفصلًا تمامًا عن مجلس الرجال. لا نحتاج غرفة طعام منفصلة، فنحن نتناول الطعام عادة في الصالة، ونريد أن تكون الصالة واسعة بمساحة ٤٠ مترًا مربعًا. نريد المطبخ مفتوحًا على الصالة، مع مخزن ملحق به. كما نحتاج مكتبًا للعمل بمدخل خارجي مستقل لاستقبال المراجعين دون دخولهم إلى البيت، ومصلى صغيرًا قريبًا من المجلس. نفضّل أن تكون غرف النوم في الجهة الشمالية بعيدًا عن الشوارع إن أمكن ذلك. أما الواجهة فنرغب أن تكون بطراز نجدي معاصر يعكس هوية المنطقة. ونود أن يراعي التصميم التهوية الطبيعية وتوجيه الشمس. نشكر لكم حسن تعاونكم، ونتطلع إلى استلام المقترح الأولي.`,
    expect: {
      counts: { bedrooms: 4, majlis: 2, kitchens: 1, dining: 0 },
      prefs: ['guestEntrance', 'familyEntrance', 'masterDressing', 'allEnsuite', 'womenSeparate', 'kitchenOpenHall'],
      extras: ['office', 'office.ext', 'prayer', 'storage'],
      absent: ['dining'],
      dims: { master: [5, 6] }, areas: { hall: 40 },
      rules: [{ r: 'place:majlis:s', level: 'must' }, { r: 'close:prayer+majlis', level: 'must' }, { r: 'place:bedrooms:n', level: 'prefer' }],
      floors: 1, facade: ['najdi', 'modern'], unsupported: [], conflicts: [], unclear: ['التهوية الطبيعية'],
      optional: ['rule:away:majlis+majlis_w', 'rule:close:hall+kitchen', 'rule:close:kitchen+storage', 'pref:big_hall', 'count:baths', 'unsupported:site', 'rule:place:entrance:s', 'rule:place:entrance:e'],
      traps: '«مخزن ملحق به» ليس ملحقًا خارجيًا؛ «بعيدًا عن الشوارع» هي نفس جهة الشمال.',
    },
  },
  {
    id: 'L4', name: 'القصيم — عميل محتار: كلام متعارض عن المطبخ والمجلس دون حسم',
    land: { width: 22, length: 30, streets: ['s'], entries: ['s'] },
    text: `يا هلا والله. الصراحة أنا محتار شوي وبكتب لك كل اللي في بالي وأنت شوف. الأرض عندي في بريدة ٢٢×٣٠، والشارع جنوبي. أبي البيت دور واحد. نبي أربع غرف نوم، وحدة منهن ماستر. المطبخ أبيه في الأمام عشان أهلي يشوفون الشارع وهم يطبخون، وأبي المطبخ واسع لأن أمي تطبخ للعزايم كل جمعة. المجلس أبيه جنب المطبخ عشان الضيافة تكون سهلة والقهوة توصل بسرعة. الصالة كبيرة وفي النص. ترى زوجتي تقول المطبخ لازم يكون في الخلف عشان الخصوصية، وأنا للحين ما قررت، شوفوا لنا الأنسب. وبعدين المجلس أبيه بعيد عن المطبخ عشان الريحة ما توصل للضيوف. غرفة الماستر أبيها على يمين الداخل. وأبي غرف العيال جنب الماستر عشان نسمعهم بالليل. دورات المياه ما تفتح على الصالة. وأبي مكان للشواء برا في الحوش، وجلسة خارجية للشتاء. وما أبي ممرات طويلة، أكره الممرات. وترى احنا ستة: أنا وزوجتي وأربعة عيال، أكبرهم عمره خمسطعش سنة وأصغرهم سنتين. وأبي التكييف يكون مخفي قدر الإمكان، والأسقف عالية شوي عشان الحر. وبس هذا اللي في بالي حاليًا، وإذا تذكرت شي ثاني أرسله لك.`,
    expect: {
      counts: { bedrooms: 4, majlis: 1, kitchens: 1 },
      prefs: ['big_kitchen', 'big_hall', 'bathsOffHall', 'noCorridors'],
      extras: [], absent: [],
      rules: [{ r: 'place:kitchen:s', level: 'must' }, { r: 'place:kitchen:n', level: 'must' }, { r: 'close:kitchen+majlis', level: 'must' }, { r: 'away:kitchen+majlis', level: 'must' }, { r: 'place:hall:center', level: 'must' }, { r: 'place:master:e', level: 'must' }, { r: 'close:kids+master', level: 'must' }],
      floors: 1, unsupported: [], conflicts: ['place-opposite', 'relation-contradiction'], unclear: ['مكان للشواء', 'جلسة خارجية'],
      optional: ['count:dining', 'count:baths'],
      traps: '«أمي تطبخ» ليست طلب غرفة لكبار السن؛ تعارضان صريحان يجب أن يُسألا لا أن يُختار أحدهما بصمت.',
    },
  },
  {
    id: 'L5', name: 'أرض ضيقة — بيت اقتصادي، مطبخ أمريكي، «ما نحتاج مجلس نساء»، نفي غير مباشر للخادمة والسائق',
    land: { width: 12, length: 30, streets: ['s'], entries: ['s'] },
    text: `السلام عليكم. أنا موظف وميزانيتي محدودة، وأبي بيت صغير اقتصادي على أرض ضيقة ١٢ متر عرض و٣٠ متر طول، والشارع من الجنوب. نحن أربعة: أنا وزوجتي وولدين. أبي ٣ غرف نوم: ماستر وغرفتين للعيال، والغرف تكون بعيدة عن الشارع عشان الإزعاج والسيارات. مجلس واحد يكفي ونستخدمه للرجال والنساء، يعني ما نحتاج مجلس نساء. المطبخ أبيه أمريكي مفتوح على الطعام، ومساحته حوالي ١٢ متر مربع. ما أبي ممرات كثيرة لأن الأرض ضيقة وكل متر محسوب. دورة مياه الضيوف قريبة من المجلس. ما فيه داعي لغرفة خادمة ولا سواق، ما نحتاجهم. أبي غرفة غسيل صغيرة. وفي المستقبل يمكن أبني غرفة في السطح، بس حاليًا لا تحسبها. وأبي حوش خلفي صغير للعيال يلعبون فيه بأمان. الواجهة بسيطة لياسة ودهان أبيض، ما أبي حجر لأنه غالي. وأنا أصلًا أشتغل من الصبح للعصر، وزوجتي معلمة، فالبيت يكون فاضي أغلب النهار، وأهلنا في مدينة ثانية ويجوننا مرة أو مرتين في السنة بس. وأتمنى التصميم يكون عملي وما فيه مساحات ضايعة، لأن كل ريال محسوب.`,
    expect: {
      counts: { bedrooms: 3, majlis: 1, kitchens: 1, dining: 1 },
      prefs: ['openKitchen', 'noCorridors', 'economy'],
      extras: ['laundry'], absent: ['maid', 'driver'],
      areas: { kitchen: 12 },
      rules: [{ r: 'place:bedrooms:n', level: 'must' }, { r: 'close:guestwc+majlis', level: 'must' }],
      facade: ['plaster'], unsupported: [], conflicts: [], unclear: ['حوش خلفي', 'مساحات ضايعة'],
      optional: ['unsupported:roof', 'count:baths', 'rule:close:dining+kitchen'],
      traps: '«ما نحتاج مجلس نساء» لا تعني «بدون مجلس»؛ «ما أبي حجر» نفي لمادة الواجهة؛ «غرفة في السطح… حاليًا لا».',
    },
  },
  {
    id: 'L6', name: 'عائلة ممتدة — غرفة للوالدين، غرف العيال جنب بعض، حمامات لا تفتح على الصالة، فناء داخلي',
    land: { width: 25, length: 32, streets: ['n'], entries: ['n'] },
    text: `مساء الخير. نبي نصمم بيت العائلة على أرض ٢٥×٣٢، والشارع شمالي. البيت دور واحد لأن أبوي وأمي كبار في السن ويسكنون معنا. نبي غرفة لأبوي وأمي قريبة من الصالة وبعيدة عن المجلس، وتكون بحمامها ومدخلها واسع للكرسي المتحرك. وفيه الماستر لي ولزوجتي، وثلاث غرف للعيال جنب بعض. الصالة نبيها كبيرة وتطل على الحوش الخلفي. المجلس على الشارع، ومجلس النساء يكون مستقل وبعيد عن مجلس الرجال. والمطبخ مقفل وجنبه غرفة الطعام. الحمامات لا تفتح على الصالة أبدًا، هذي نقطة مهمة عندنا لأن الضيوف يجلسون أحيانًا في الصالة. نبي غرفة سواق بحمام ويكون لها باب من برا، وغرفة خادمة بحمام قريبة من المطبخ. وغرفة غسيل. ونبي فناء داخلي في نص البيت يدخل منه النور والهوا، وإذا ما تقدرون عادي. ولا نبي درج داخلي لأن البيت دور واحد ولا نفكر نزيد دور. وعيالنا أربعة: ولدين وبنتين، والكبيرة في الجامعة، ونحب نجتمع كلنا بعد العشاء، عشان كذا الصالة هي قلب البيت عندنا. والوالد يحب يجلس الصبح في الشمس، فلو فيه مكان مشمس يكون زين. والسلام عليكم ورحمة الله.`,
    expect: {
      counts: { bedrooms: 5, majlis: 2, kitchens: 1, dining: 1 },
      prefs: ['elderlyRoom', 'closedKitchen', 'bathsOffHall', 'womenSeparate', 'big_hall'],
      extras: ['driver', 'driver.bath', 'maid', 'maid.bath', 'laundry'], absent: [],
      rules: [{ r: 'close:elderly+hall', level: 'must' }, { r: 'away:elderly+majlis', level: 'must' }, { r: 'cluster:kids', level: 'must' }, { r: 'place:hall:s', level: 'must' }, { r: 'place:majlis:n', level: 'must' }, { r: 'close:dining+kitchen', level: 'must' }, { r: 'close:kitchen+maid', level: 'must' }],
      floors: 1, unsupported: ['courtyard'], conflicts: [], unclear: ['الكرسي المتحرك'],
      optional: ['rule:away:majlis+majlis_w', 'count:baths'],
      traps: '«ولا نبي درج داخلي» ليست قاعدة مكانية؛ ثلاث غرف للعيال + الماستر + الوالدين = خمس.',
    },
  },
  {
    id: 'L7', name: 'خليط إنجليزي — شاب يكتب نصف كلامه بالإنجليزية',
    land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
    text: `Hi, ابي villa modern على أرض 20x30، والشارع south. We are a young family، أنا وزوجتي وولدين وبنت. I need 4 bedrooms، one of them master suite with walk-in closet، والباقي للأطفال. Open kitchen please، مع dining area next to the kitchen. Majlis للرجال with separate entrance، و no women majlis needed لأن زوجتي تستقبل ضيوفها في الصالة. ابي home office بمدخل خارجي لأني أشتغل من البيت وعملائي يجون أحيانًا. Gym room لو ينفع، مو ضروري. The living room big and bright، أحب الإضاءة. Laundry room ضروري. No maid room، we don't need it. Guest bathroom near the majlis. وأبي the master bedroom away from the street عشان الإزعاج. Garage لسيارتين قدام البيت. والواجهة glass and wood، modern style، شي مثل البيوت اللي في كاليفورنيا. My wife works from home too sometimes، بس هي تستخدم الصالة. We also have a cat، so no carpet please. وإذا فيه مجال ابي ceiling عالي شوي. Budget متوسطة، فلا تبالغون. Thanks a lot، وأنتظر التصميم الأولي.`,
    expect: {
      counts: { bedrooms: 4, majlis: 1, kitchens: 1, dining: 1 },
      prefs: ['masterDressing', 'openKitchen', 'guestEntrance', 'big_hall'],
      extras: ['office', 'office.ext', 'laundry'], absent: ['maid'],
      rules: [{ r: 'close:dining+kitchen', level: 'must' }, { r: 'close:guestwc+majlis', level: 'must' }, { r: 'place:master:n', level: 'must' }],
      facade: ['glass', 'wood', 'modern'], unsupported: ['garage'], conflicts: [], unclear: ['Gym room'],
      optional: ['count:baths', 'pref:parking'], // «Garage لسيارتين»: مواقف في الارتداد (والكراج المغلق غير مدعوم)
      traps: '«no women majlis needed» لا تعني «بدون مجلس»؛ مادتان للواجهة (زجاج وخشب).',
    },
  },
  {
    id: 'L8', name: 'طلبات مستحيلة — مقاسات أكبر من الأرض، دور واحد مع ماستر فوق، ملاصق وبعيد معًا',
    land: { width: 15, length: 20, streets: ['s'], entries: ['s'] },
    text: `السلام عليكم، الأرض عندي ١٥×٢٠ وشارعها من الجنوب، وأبي دور واحد بس، ما أبي درج ولا دور ثاني لأن الوالد ما يقدر يطلع. أبي مجلس كبير جدًا مقاسه ١٢×١٦ عشان العزايم والمناسبات الكبيرة اللي نسويها كل شهر، وصالة ٨×١٠ تكفي العائلة كلها، والماستر ٦×٧ فيها جلسة صغيرة. والماستر أبيها في الدور العلوي بعيدة عن الإزعاج. وثلاث غرف نوم غير الماستر للعيال. المطبخ بجانب الطعام. وأبي مجلس النساء ومجلس الرجال جنب بعض عشان نفتحهم على بعض في المناسبات، بس برضو أبي مجلس النساء بعيد عن مجلس الرجال عشان الخصوصية لا صار عندنا ضيوف من برا. ترى أنا عارف إن الأرض صغيرة، بس أبي كل هذا يدخل بأي طريقة، وإذا ما دخل قولوا لي وش الحل بدل ما تحذفون شي بدون ما تقولون. وترى الوالد يجلس على كرسي متحرك، فالأبواب تكون عريضة لو سمحتوا. ونحن عشرة أنفار في البيت، والعزايم عندنا ما توقف طول السنة. وأهم شي لا تصغرون المجلس، وأبي الرد بسرعة لو سمحتوا لأننا مستعجلين على البناء.`,
    expect: {
      counts: { bedrooms: 4, majlis: 2, kitchens: 1, dining: 1 },
      prefs: ['elderlyRoom'], extras: [], absent: [],
      dims: { majlis: [12, 16], hall: [8, 10], master: [6, 7] },
      rules: [{ r: 'floor:master:upper', level: 'must' }, { r: 'close:dining+kitchen', level: 'must' }, { r: 'close:majlis+majlis_w', level: 'must' }, { r: 'away:majlis+majlis_w', level: 'must' }],
      floors: 1, unsupported: [], conflicts: ['single-floor-two-floor-features', 'relation-contradiction', 'area-exceeds-land'], unclear: [],
      optional: ['pref:big_majlis', 'count:baths', 'pref:womenSeparate'],
      traps: 'ثلاثة تعارضات يجب أن تُسأل كلها قبل التوليد.',
    },
  },
  {
    id: 'L9', name: 'الشرقية — قصة طويلة وحشو كثير، ووصف للبيت القديم (ماضٍ) يجب ألا يُفهم طلبًا',
    land: { width: 20, length: 30, streets: ['e'], entries: ['e'] },
    text: `السلام عليكم ورحمة الله. والله يا أخوي قصتي طويلة شوي فاسمح لي. احنا ساكنين في الدمام من عشرين سنة في بيت شعبي قديم، والبيت هذا تعبنا فيه، المطبخ كان صغير وفي نص البيت والريحة توصل لكل الغرف، والمجلس كان داخل البيت والضيوف يمرون من قدام الحريم، وهذا شي ما نبيه يتكرر أبد. الحين الحمد لله اشترينا أرض في الخبر مساحتها ٢٠ في ٣٠، والشارع من الشرق. الوالد الله يرحمه كان دايم يقول البيت الزين اللي يريح أهله، وأنا أبي بيت يريحنا. احنا خمسة: أنا وأم العيال وثلاث بنات، والوالدة بتسكن معنا. يعني أبي ثلاث غرف نوم وحدة منهن ماستر، وغرفة رابعة للوالدة قريبة من الصالة لأنها ما تقدر تمشي كثير. المجلس يكون على الشارع وبمدخل مستقل، هذا أهم شي عندي بعد تجربتنا. المطبخ أبيه كبير وجنب المقلط، ويكون في الخلف بعيد عن المجلس. أبي غرفة خادمة بحمامها، ومخزن للمونة لأن أم العيال تشتري بالجملة. البنات يبون غرفهم جنب بعض. الصالة أبيها تطل على الحوش الخلفي. وأبي كراج يكفي سيارتين، وإذا فيه مجال مظلة للضيوف. وبصراحة أنا ما أفهم في التصاميم، فاللي تشوفونه زين سووه، بس لا تنسون اللي قلته عن المجلس والمطبخ. وشي أخير، الجيران عندهم بيت واجهته حجر وطالع حلو، ودي تكون واجهتنا نفسه حجر بس بلون فاتح. الله يجزاكم خير ويعطيكم العافية.`,
    expect: {
      counts: { bedrooms: 4, majlis: 1, kitchens: 1, dining: 1 },
      prefs: ['guestEntrance', 'elderlyRoom', 'big_kitchen'],
      extras: ['maid', 'maid.bath', 'storage'], absent: [],
      rules: [{ r: 'close:elderly+hall', level: 'must' }, { r: 'place:majlis:e', level: 'must' }, { r: 'close:dining+kitchen', level: 'must' }, { r: 'place:kitchen:w', level: 'must' }, { r: 'away:kitchen+majlis', level: 'must' }, { r: 'cluster:kids', level: 'must' }, { r: 'place:hall:w', level: 'must' }],
      facade: ['stone'], unsupported: ['garage'], conflicts: [], unclear: [],
      optional: ['count:baths', 'pref:parking'], // «كراج يكفي سيارتين»: مواقف في الارتداد (والكراج المغلق غير مدعوم)
      traps: '«المطبخ كان صغير وفي نص البيت» و«المجلس كان داخل البيت» وصف للبيت القديم لا طلب؛ «ثلاث غرف… وغرفة رابعة للوالدة» = أربع.',
    },
  },
  {
    id: 'L10', name: 'نفي كثيف — العميل يبدأ بما لا يريده',
    land: { width: 18, length: 28, streets: ['s'], entries: ['s'] },
    text: `أبي أوضح من البداية وش اللي ما أبيه، لأن المكاتب السابقة كانت تحط أشياء ما طلبتها وأضطر أرجع وأشرح من جديد. ما أبي مجلس نساء، ولا أبي غرفة طعام، ولا أبي مكتب، ولا أبي مصلى، ولا أبي غرفة خادمة. أبي بس غرفة سواق بحمام. وما أبي المطبخ يكون على الشارع أبدًا، ولا أبي غرف النوم تطل على الشارع. ولا تحط المجلس جنب غرف النوم. طيب اللي أبيه: ثلاث غرف نوم منها ماستر، ومجلس رجال واحد بمدخل مستقل، وصالة، ومطبخ مفتوح على الصالة. وما أبي كل غرفة بحمام، يكفي حمام مشترك للعيال. الأرض ١٨×٢٨ والشارع جنوبي، والبيت دور واحد. ولا أبي ممرات طويلة. وأبي مخزن صغير جنب المطبخ. وما أبي الواجهة زجاج لأن الحر عندنا شديد والزجاج يدخل الحرارة، أبيها حجر. ترى قبل كذا صمموا لي بيت فيه مكتب ومصلى وغرفة خادمة وأنا ما طلبتهم، وصار البيت أكبر من حاجتي وارتفعت التكلفة علي. وأرجو ما تضيفون شي من عندكم، اللي ما ذكرته معناه ما أبيه.`,
    expect: {
      counts: { bedrooms: 3, majlis: 1, kitchens: 1, dining: 0 },
      prefs: ['guestEntrance', 'kitchenOpenHall', 'sharedBaths', 'noCorridors'],
      extras: ['driver', 'driver.bath', 'storage'], absent: ['dining', 'office', 'prayer', 'maid'],
      rules: [{ r: 'place:kitchen:!s', level: 'forbid' }, { r: 'place:bedrooms:!s', level: 'forbid' }, { r: 'away:bedrooms+majlis', level: 'forbid' }, { r: 'close:kitchen+storage', level: 'must' }],
      floors: 1, facade: ['stone'], unsupported: [], conflicts: [], unclear: [],
      optional: ['rule:close:hall+kitchen', 'count:baths'],
      traps: '«ما أبي مجلس نساء» لا تعني «بدون مجلس»؛ «ما أبي الواجهة زجاج… أبيها حجر» = حجر لا زجاج.',
    },
  },
  {
    id: 'L11', name: 'درجات الإلزام — لازم/يفضل/لو أمكن/ممنوع/ياليت',
    land: { width: 20, length: 25, streets: ['n'], entries: ['n'] },
    text: `السلام عليكم، عندي أرض ٢٠×٢٥ والشارع شمالي، وأبي دور واحد. البرنامج باختصار: أربع غرف نوم منها ماستر، مجلس رجال ومجلس نساء، صالة، مطبخ وطعام، وغرفة خادمة. وعشان تعرف وضعنا، احنا ستة: أنا وزوجتي وأربعة عيال، والعاملة ساكنة معنا من سنين. الحين الأولويات، وأرجو تنتبه للفرق بينها لأن مو كلها بنفس الأهمية عندي. لازم المجلس يكون على الشارع، هذا شرط ما أتنازل عنه. ويفضل المطبخ يكون في الخلف، لكن مو ضروري إذا ما ضبط مع باقي التصميم. ولو أمكن الماستر بعيدة عن المجلس. وممنوع غرف النوم تطل على الشارع، هذا خط أحمر عندي. والطعام لازم جنب المطبخ. ومجلس النساء ياليت يكون قريب من الصالة. وغرفة الخادمة ضروري تكون جنب المطبخ. والمدخل الرئيسي يفضل يكون في وسط الواجهة. أي شي غير هذا اتركه لخبرتكم، بس لا تخالفون اللي قلت عنه لازم أو ممنوع. وإذا اضطريتوا تتنازلون عن شي فتنازلوا عن اللي قلت يفضل أو لو أمكن، وقولوا لي وش اللي تنازلتوا عنه بالضبط.`,
    expect: {
      counts: { bedrooms: 4, majlis: 2, kitchens: 1, dining: 1 },
      prefs: [], extras: ['maid'], absent: [],
      rules: [{ r: 'place:majlis:n', level: 'must' }, { r: 'place:kitchen:s', level: 'prefer' }, { r: 'away:majlis+master', level: 'prefer' }, { r: 'place:bedrooms:!n', level: 'forbid' }, { r: 'close:dining+kitchen', level: 'must' }, { r: 'close:hall+majlis_w', level: 'prefer' }, { r: 'close:kitchen+maid', level: 'must' }],
      floors: 1, unsupported: [], conflicts: [], unclear: [],
      optional: ['count:baths', 'rule:place:entrance:center', 'rule:place:entrance:n'],
      traps: 'كل قاعدة بدرجتها؛ «مو ضروري» تليين لا نفي.',
    },
  },
  {
    id: 'L12', name: 'مقاسات بصيغ مختلفة — فاصلة عشرية عربية، «في»، by، «بعرض وطول»، سعة أشخاص',
    land: { width: 22, length: 30, streets: ['s'], entries: ['s'] },
    text: `مرحبًا، أنا مهندس مدني وأعرف وش أبي بالضبط، فبعطيك المقاسات واحد واحد عشان ما يصير لبس. الأرض ٢٢ × ٣٠ م، والشارع جنوبي، والبيت دور واحد. غرفة النوم الرئيسية بعرض ٤ وطول ٥٫٥ م. المطبخ ٣.٥ في ٤. الصالة 6 by 8. المجلس يتسع لعشرين شخص لأن عندنا ديوانية أسبوعية. غرف النوم الثانية عددها ثلاث، كل وحدة ٤×٤ تقريبًا، وما يحتاج حمام لكل غرفة. غرفة الطعام مساحتها ١٦ م². غرفة الخادمة بحمام. والمطبخ يكون جنب الطعام، والمجلس على الشارع. والمقاسات اللي عطيتك هي الصافية من داخل الجدران مو من برا، فانتبه لها. إذا فيه مقاس ما يركب مع الأرض قولي قبل لا ترسم، وإذا تحتاج تزيد أو تنقص نص متر هنا أو هناك ما عندي مشكلة. وللعلم أنا اشتغلت على مشاريع سكنية كثيرة، وأعرف إن أغلب المكاتب تكبّر الصالة على حساب الغرف، وأنا ما أبي هذا. وارتفاع السقف ٣٫٢ م لو سمحت. وأهم شي عندي مقاس الماستر والمجلس لأنها اللي تنحسب علي، والباقي فيه مرونة شوي.`,
    expect: {
      counts: { bedrooms: 4, majlis: 1, kitchens: 1, dining: 1 },
      prefs: ['sharedBaths'], extras: ['maid', 'maid.bath'], absent: [],
      dims: { master: [4, 5.5], kitchen: [3.5, 4], hall: [6, 8], bedroom: [4, 4] }, areas: { majlis: 32, dining: 16 },
      rules: [{ r: 'close:dining+kitchen', level: 'must' }, { r: 'place:majlis:s', level: 'must' }],
      floors: 1, unsupported: [], conflicts: [], unclear: [],
      optional: ['count:baths'],
      traps: '«٥٫٥» بفاصلة عشرية عربية؛ «يتسع لعشرين شخص» ≈ 32 م² بافتراض 1.6 م²/شخص (افتراض تصميمي معلن).',
    },
  },
];

// جلسات تعديل متتابعة. لكل دور: نص العميل كما يكتبه، ونطاق ما يحق له أن يتغيّر (scope: أنماط أسماء الغرف)،
// وفحوص تُقاس على المستند نفسه (لا على السجل). كل غرفة خارج النطاق يجب أن تبقى: مساحة ≤ 5٪، إزاحة ≤ 0.5 م.
// أنواع الفحوص: side{room,side: back|front|right|left|n|s|e|w}، near{a,b}، far{a,b,min}، dims{room,w,l,tol}،
// bigger{room,factor}، smaller{room,factor}، sameAs{room,turn}، absent{room}، present{room}، count{types,n},
// docField{field}، unchanged، clarify (يسأل أو يقول لم أفهم ولا يغيّر شيئًا)، openTo{a,b}، closedTo{a,b}،
// revertDoc{turn,max}، extAccess{room}.
const MAJ = '^(المجلس|مجلس الرجال)$', MASTER = 'الرئيسية|^غرفة ملابس', HALL = '^الصالة$';
export const SESSIONS = [
  {
    id: 'S1', name: 'مثال المالك: نقل المطبخ ثم تكبير المجلس ثم إرجاع المطبخ ثم حذف المكتب ثم الواجهة ثم «غرفة البنت»',
    land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
    text: '4 غرف نوم منها ماستر، ومجلس رجال، وصالة، ومطبخ وطعام، ومكتب',
    counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'انقل المطبخ ورا جنب الطعام', scope: ['^المطبخ$', 'طعام'], checks: [{ type: 'side', room: '^المطبخ$', side: 'back' }, { type: 'near', a: '^المطبخ$', b: 'طعام', adjacent: true }] },
      { text: 'كبّر المجلس ٦×٧', scope: [MAJ], checks: [{ type: 'dims', room: MAJ, w: 6, l: 7, tol: .35 }] },
      { text: 'رجّع المطبخ مثل أول', scope: ['^المطبخ$'], checks: [{ type: 'sameAs', room: '^المطبخ$', turn: 0 }] },
      { text: 'احذف المكتب', scope: ['^المكتب$'], checks: [{ type: 'absent', room: '^المكتب$' }] },
      { text: 'غيّر الواجهة حجر', scope: [], checks: [{ type: 'docField', field: 'facade' }, { type: 'unchanged' }] },
      { text: 'خل كل شي مثل ما هو بس كبّر غرفة البنت', scope: [], checks: [{ type: 'clarify' }] },
    ],
  },
  {
    id: 'S2', name: 'نقل الخادمة، إبعاد الماستر، زيادة غرفة ثم التراجع عنها، تكبير الصالة',
    land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
    text: 'فيلا: 4 غرف نوم منها ماستر، مجلس رجال ومجلس نساء، صالة، مطبخ وطعام، وغرفة خادمة بحمام',
    counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'أبي غرفة الخادمة جنب المطبخ', scope: ['الخادمة'], checks: [{ type: 'near', a: 'غرفة الخادمة', b: '^المطبخ$', adjacent: true }] },
      { text: 'خل الماستر بعيدة عن المجلس', scope: [MASTER], checks: [{ type: 'far', a: 'غرفة النوم الرئيسية', b: MAJ, min: 8 }] },
      { text: 'زيد غرفة نوم وحدة', scope: ['^غرفة نوم 5$', 'غرفة 5$'], checks: [{ type: 'count', types: ['bedroom', 'master'], n: 5 }] },
      { text: 'لا خلاص رجعها أربع غرف', scope: ['^غرفة نوم 5$', 'غرفة 5$'], checks: [{ type: 'count', types: ['bedroom', 'master'], n: 4 }, { type: 'revertDoc', turn: 2, max: .03 }] },
      { text: 'الصالة أكبر شوي', scope: [HALL], checks: [{ type: 'bigger', room: HALL, factor: 1.1 }] },
    ],
  },
  {
    id: 'S3', name: 'الواجهة وحدها مرتين، ثم فتح المطبخ ثم «رجّعه مقفل»',
    land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
    text: '3 غرف نوم ومجلس وصالة ومطبخ وطعام، والمطبخ مقفل',
    counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'احتفظ بهذا التوزيع وغيّر الواجهة إلى حجر', scope: [], checks: [{ type: 'docField', field: 'facade' }, { type: 'unchanged' }] },
      { text: 'خل الواجهة نجدي', scope: [], checks: [{ type: 'docField', field: 'facade' }, { type: 'unchanged' }] },
      { text: 'المطبخ يكون مفتوح على الطعام', scope: ['^المطبخ$', 'طعام'], checks: [{ type: 'openTo', a: '^المطبخ$', b: 'طعام' }] },
      { text: 'لا لا رجّعه مقفل', scope: ['^المطبخ$', 'طعام'], checks: [{ type: 'closedTo', a: '^المطبخ$', b: 'طعام' }, { type: 'revertDoc', turn: 2, max: .03 }] },
    ],
  },
  {
    id: 'S4', name: 'مقاسات متتابعة: الماستر ثم المطبخ ثم تصغير المجلس ثم الصالة ثم غرفة نوم بعينها',
    land: { width: 22, length: 30, streets: ['s'], entries: ['s'] },
    text: '4 غرف نوم منها ماستر ومجلس وصالة ومطبخ وطعام وغرفة غسيل',
    counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'غرفة النوم الرئيسية ٥×٦', scope: [MASTER], checks: [{ type: 'dims', room: '^غرفة النوم الرئيسية$', w: 5, l: 6, tol: .35 }] },
      { text: 'المطبخ ٤×٥', scope: ['^المطبخ$'], checks: [{ type: 'dims', room: '^المطبخ$', w: 4, l: 5, tol: .35 }] },
      { text: 'المجلس أصغر', scope: [MAJ], checks: [{ type: 'smaller', room: MAJ, factor: .9 }] },
      { text: 'خل كل شي زي ما هو بس الصالة أوسع', scope: [HALL], checks: [{ type: 'bigger', room: HALL, factor: 1.1 }] },
      { text: 'ودي غرفة نوم ٢ تكون ٤×٥ والباقي لا تلمسها', scope: ['^غرفة نوم 2$', 'غرفة 2$'], checks: [{ type: 'dims', room: '^غرفة نوم 2$', w: 4, l: 5, tol: .35 }] },
    ],
  },
  {
    id: 'S5', name: 'إضافة وحذف: غسيل، مصلى قرب المجلس، «شيل المصلى»، سائق بحمام، المجلس يمين الداخل',
    land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
    text: '3 غرف نوم منها ماستر، مجلس، صالة، مطبخ وطعام',
    counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'أبي غرفة غسيل', scope: ['الغسيل'], checks: [{ type: 'present', room: 'غرفة الغسيل' }] },
      { text: 'أضف مصلى قريب من المجلس', scope: ['المصلى'], checks: [{ type: 'present', room: '^المصلى$' }, { type: 'near', a: '^المصلى$', b: MAJ }] },
      { text: 'شيل المصلى', scope: ['المصلى'], checks: [{ type: 'absent', room: '^المصلى$' }] },
      { text: 'أبي غرفة سائق بحمام', scope: ['السائق'], checks: [{ type: 'present', room: 'غرفة السائق' }] },
      { text: 'خل المجلس على يمين الداخل', scope: [MAJ, 'الرجال|الضيوف'], checks: [{ type: 'side', room: MAJ, side: 'right' }] },
    ],
  },
  {
    id: 'S6', name: 'مدخل شرقي: المطبخ في الخلف، الماستر شمالًا ثم إرجاعها، غرفة نوم 2 بمقاس، مدخل لمجلس النساء',
    land: { width: 24, length: 26, streets: ['e'], entries: ['e'] },
    text: 'أربع غرف نوم منها ماستر، مجلس رجال ومجلس نساء، صالة، مطبخ وطعام، وغرفة خادمة',
    counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'المطبخ في الخلف', scope: ['^المطبخ$'], checks: [{ type: 'side', room: '^المطبخ$', side: 'back' }] },
      { text: 'الماستر في جهة الشمال', scope: [MASTER], checks: [{ type: 'side', room: '^غرفة النوم الرئيسية$', side: 'n' }] },
      { text: 'رجّع الماستر مكانها الأول', scope: [MASTER], checks: [{ type: 'sameAs', room: '^غرفة النوم الرئيسية$', turn: 0 }] },
      { text: 'كبّر غرفة نوم ٢ لتصير ٤×٥', scope: ['^غرفة نوم 2$', 'غرفة 2$'], checks: [{ type: 'dims', room: '^غرفة نوم 2$', w: 4, l: 5, tol: .35 }] },
      { text: 'مجلس النساء أبيه بمدخل مستقل من برا', scope: ['النساء'], checks: [{ type: 'extAccess', room: '^مجلس النساء$' }] },
    ],
  },
  // (الجولة العاشرة) الأبواب والنوافذ: كل تعديل يمس فتحة واحدة فقط (مقيسًا بالبصمة الهندسية)، و«سد الباب» بلا غرفة
  // يعود على الباب الذي فُتح للتو، والرجوع إلى النسخة الأولى حرفيًا بعد فتحه وسده
  {
    id: 'S7', name: 'الأبواب والنوافذ: فتح باب بين المجلس والطعام ثم «سد الباب»، نقل باب غرفة 2، تكبير نافذة الصالة، باب موجود أصلًا',
    land: { width: 22, length: 30, streets: ['s'], entries: ['s'] },
    text: '4 غرف نوم منها ماستر ومجلس وصالة ومطبخ وطعام وغرفة غسيل',
    counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'افتح باب بين المجلس والطعام', scope: [MAJ, 'طعام'], checks: [{ type: 'doorBetween', a: MAJ, b: 'طعام' }, { type: 'fpTouched', max: 1, kinds: ['opening'] }] },
      { text: 'سد الباب', scope: [MAJ, 'طعام'], checks: [{ type: 'noDoorBetween', a: MAJ, b: 'طعام' }, { type: 'fpSame', turn: 0 }] },
      { text: 'انقل باب غرفة 2', scope: ['^غرفة نوم 2$'], checks: [{ type: 'doorMoved', room: '^غرفة نوم 2$', min: .5 }, { type: 'fpTouched', max: 1, kinds: ['opening'] }] },
      { text: 'كبّر نافذة الصالة', scope: [HALL], checks: [{ type: 'windowWider', room: HALL, factor: 1.2 }, { type: 'fpTouched', max: 1, kinds: ['opening'] }] },
      { text: 'افتح باب بين المطبخ والطعام', scope: ['^المطبخ$', 'طعام'], checks: [{ type: 'doorBetween', a: '^المطبخ$', b: 'طعام' }, { type: 'unchanged' }] },
    ],
  },
  // الرجوع إلى نسخة بعينها، ثم «رجّع مثل أول بس خل تعديل المجلس»: الناتج مطابق للنسخة المطلوبة بالبصمة، أو لا يختلف
  // عن النسخة الأولى إلا بالعناصر نفسها التي غيّرها تعديل المجلس أول مرة
  {
    id: 'S8', name: 'تعديلات متتابعة ثم «ارجع للنسخة الثانية» ثم «رجّع مثل أول بس خل تعديل المجلس»',
    land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
    text: '3 غرف نوم منها ماستر، مجلس، صالة، مطبخ وطعام',
    counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'كبّر نافذة الصالة', scope: [HALL], checks: [{ type: 'windowWider', room: HALL, factor: 1.2 }, { type: 'fpTouched', max: 1, kinds: ['opening'] }] },
      { text: 'المجلس أصغر', scope: [MAJ], checks: [{ type: 'smaller', room: MAJ, factor: .9 }] },
      { text: 'غيّر الواجهة حجر', scope: [], checks: [{ type: 'docField', field: 'facade' }, { type: 'unchanged' }] },
      { text: 'ارجع للنسخة الثانية', scope: [MAJ], checks: [{ type: 'fpSame', turn: 1 }] },
      { text: 'رجّع مثل أول بس خل تعديل المجلس', scope: [MAJ, HALL], checks: [{ type: 'smaller', room: MAJ, factor: .9 }, { type: 'windowNarrower', room: HALL, factor: .9 }, { type: 'fpReplay', turn: 0, editTurn: 2 }] },
    ],
  },
  // (الجولة الحادية عشرة) طلب طويل فيه تعارضان داخل الطلب نفسه: يُسأل عنهما مع التصميم الأول، ثم يحسم العميل كلًا منهما بجملة
  {
    id: 'S9', name: 'طلب متعارض: المجلس يمين الداخل ويساره، والمطبخ جنب المجلس وبعيد عنه — سؤال ثم حسم بجوابين، ثم تعديلان بعد الحسم',
    land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
    text: 'السلام عليكم، أبي أربع غرف نوم منها ماستر، ومجلس رجال، وصالة، ومطبخ وطعام. المجلس أبيه على يمين الداخل عشان قريب من الشارع، والمطبخ أبيه جنب المجلس عشان القهوة توصل بسرعة. أهلي يقولون المجلس يكون يسار المدخل عشان ما يطل على الجيران، وزوجتي تقول المطبخ لازم يكون بعيد عن المجلس عشان الريحة ما توصل للضيوف، وأنا ما قررت. الماستر بعيدة عن المجلس، ودورات المياه ما تفتح على الطعام.',
    counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'المجلس على يمين الداخل', scope: [MAJ, 'مدخل'], checks: [{ type: 'resolved', left: 1 }, { type: 'side', room: MAJ, side: 'right' }] },
      { text: 'المطبخ بعيد عن المجلس', scope: ['^المطبخ$', MAJ], checks: [{ type: 'resolved', left: 0 }, { type: 'far', a: '^المطبخ$', b: MAJ }] },
      // بعد الحسم: تعديل موضعي عادي لا يعيد فتح التعارض، ثم تعديل لا يمس المخطط
      { text: 'المجلس أصغر', scope: [MAJ], checks: [{ type: 'smaller', room: MAJ, factor: .9 }] },
      { text: 'غيّر الواجهة حجر', scope: [], checks: [{ type: 'docField', field: 'facade' }, { type: 'unchanged' }] },
    ],
  },
  {
    id: 'S10', name: '(الجولة الحادية عشرة) الأبواب والنوافذ والطعام جنب المجلس — في S7 بعد إصلاح شريط الغسيل لا يجاور المجلس الطعام: فتح باب بين المجلس والطعام ثم «سد الباب»، نقل باب غرفة 2، تكبير نافذة الصالة، باب موجود أصلًا',
    land: { width: 22, length: 30, streets: ['s'], entries: ['s'] },
    text: '4 غرف نوم منها ماستر ومجلس وصالة ومطبخ وطعام، والطعام جنب المجلس',
    counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 },
    turns: [
      { text: 'افتح باب بين المجلس والطعام', scope: [MAJ, 'طعام'], checks: [{ type: 'doorBetween', a: MAJ, b: 'طعام' }, { type: 'fpTouched', max: 1, kinds: ['opening'] }] },
      { text: 'سد الباب', scope: [MAJ, 'طعام'], checks: [{ type: 'noDoorBetween', a: MAJ, b: 'طعام' }, { type: 'fpSame', turn: 0 }] },
      { text: 'انقل باب غرفة 2', scope: ['^غرفة نوم 2$'], checks: [{ type: 'doorMoved', room: '^غرفة نوم 2$', min: .5 }, { type: 'fpTouched', max: 1, kinds: ['opening'] }] },
      { text: 'كبّر نافذة الصالة', scope: [HALL], checks: [{ type: 'windowWider', room: HALL, factor: 1.2 }, { type: 'fpTouched', max: 1, kinds: ['opening'] }] },
      { text: 'افتح باب بين المطبخ والطعام', scope: ['^المطبخ$', 'طعام'], checks: [{ type: 'doorBetween', a: '^المطبخ$', b: 'طعام' }, { type: 'unchanged' }] },
    ],
  },
];

// (الجولة الثالثة عشرة) سؤال عرض الشارع (ناعم، ليس تعارضًا): جوابه يعيد التوليد بالارتداد الأمامي النظامي (25 م ← 5 م)، ثم تعديل عادي بعده
SESSIONS.push({
  id: 'S11', name: '(الجولة الثالثة عشرة) عرض الشارع مجهول ← سؤال؛ «عرض الشارع 25 م» ← إعادة التوليد بارتداد 5 م نظاميًا، ثم «المجلس أصغر»',
  land: { width: 20, length: 30, streets: ['s'], entries: ['s'] },
  text: '3 غرف نوم ومجلس وصالة ومطبخ وطعام',
  counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 },
  turns: [
    { text: 'عرض الشارع 25 م', scope: ['.*'], checks: [{ type: 'plotSetback', side: 's', value: 5, streetWidth: 25 }] },
    { text: 'المجلس أصغر', scope: [MAJ], checks: [{ type: 'smaller', room: MAJ, factor: .9 }, { type: 'plotSetback', side: 's', value: 5, streetWidth: 25 }] },
    { text: 'الصالة أوسع', scope: [HALL], checks: [{ type: 'bigger', room: HALL, factor: 1.1 }] },
    { text: 'غيّر الواجهة حجر', scope: [], checks: [{ type: 'docField', field: 'facade' }, { type: 'unchanged' }, { type: 'plotSetback', side: 's', value: 5, streetWidth: 25 }] },
  ],
});
export default { LONG, SESSIONS };
