// محرك موجز شرعاء: عبارات سعودية واقعية (فصحى، نجدية، حجازية، بأرقام هندية) ← برنامج معماري معلَّل بلا إعادة سؤال.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief, answerToText, GUIDED_STEPS } from '../dist/shara/brief-engine.mjs';
import { findSpaces, SPACES } from '../dist/shara/lexicon.mjs';
import { parseFamily, inferFromFamily } from '../dist/shara/family.mjs';
import { CUSTOMS, applicableCustoms } from '../dist/shara/customs.mjs';
import { normalizeDiscovery } from '../dist/client-brief.mjs';
import { buildProgram } from '../dist/villa-layout.mjs';

const rowsOf = b => Object.fromEntries(b.program.map(r => [r.id, r]));
const cnt = (b, id) => rowsOf(b)[id]?.count || 0;
const qids = b => b.questions.map(q => q.id);

/** [النص، الأعداد المتوقعة للمولّد (جزئيًا)، صفوف متوقعة (جزئيًا)، أسئلة يجب ألا تُسأل] */
const PHRASES = [
  // جمل المالك الأربع
  ['أبغى مجلسين وصالتين وأربع غرف نوم ومطبخ مفتوح وغرفة خادمة', { majlis: 2, halls: 2, bedrooms: 4, kitchens: 1 }, { majlis_men: 1, majlis_women: 1, hall: 2, maid: 1, master: 1, bedroom: 3 }, ['bedrooms']],
  ['أبغى اثنين مجلس واثنين صالة', { majlis: 2, halls: 2, bedrooms: 1 }, { majlis_men: 1, majlis_women: 1, hall: 2, master: 1 }, []],
  ['عائلة فيها 6 أولاد وأمي تسكن معنا', { bedrooms: 5, majlis: 1 }, { master: 1, bedroom_boys: 3, elderly_room: 1 }, ['bedrooms']],
  ['ابي بيت فيه مجلس رجال ومجلس نساء ومقلط وصالة وخمس غرف نوم', { majlis: 2, dining: 1, halls: 1, bedrooms: 5 }, { majlis_men: 1, majlis_women: 1, dining: 1, hall: 1, master: 1, bedroom: 4 }, ['bedrooms', 'women_majlis']],
  // فصحى
  ['أريد ثلاث غرف نوم ومجلسًا للرجال ومجلسًا للنساء وصالة طعام', { bedrooms: 3, majlis: 2, dining: 1 }, { majlis_men: 1, majlis_women: 1, dining: 1 }, ['bedrooms', 'women_majlis']],
  ['منزل بأربع غرف نوم، غرفة النوم الرئيسية بغرفة ملابس، ومطبخ مغلق ومستودع وغرفة غسيل', { bedrooms: 4, kitchens: 1 }, { master: 1, bedroom: 3, storage: 1, laundry: 1 }, ['bedrooms', 'kitchen_style']],
  ['نحن أسرة من سبعة أفراد، ووالداي يسكنان معنا', { bedrooms: 4 }, { master: 1, bedroom_boys: 2, elderly_room: 1 }, ['bedrooms']],
  ['أحتاج مكتبًا بمدخل مستقل ومصلى قرب المجلس', { majlis: 1 }, { office: 1, prayer: 1, majlis_men: 1 }, []],
  ['غرفتان للأولاد وغرفتان للبنات وغرفة للوالدة في الدور الأرضي', { bedrooms: 6 }, { master: 1, bedroom_boys: 2, bedroom_girls: 2, elderly_room: 1 }, ['bedrooms']],
  ['خمس دورات مياه ومجلس واحد وثلاث غرف نوم', { baths: 5, majlis: 1, bedrooms: 3 }, { bath: 5 }, ['bedrooms']],
  // نجدية
  ['ودي ببيت فيه مجلس ومقلط وصالة كبيرة وثلاث غرف نوم وغرفة شغالة', { majlis: 1, dining: 1, halls: 1, bedrooms: 3 }, { maid: 1, dining: 1 }, ['bedrooms']],
  ['عندي ٤ عيال وبنتين كبار، كل واحد يبي غرفة', { bedrooms: 7 }, { bedroom_boys: 4, bedroom_girls: 2, master: 1 }, ['bedrooms', 'kids_gender', 'kids_ages']],
  ['ابغى ديوانية ومشب وملحق برا', { majlis: 1 }, { majlis_men: 1 }, []],
  ['ما ابي مجلس نساء، مجلس رجال بس ومقلط', { majlis: 1 }, { majlis_men: 1, dining: 1 }, ['women_majlis']],
  ['خل المطبخ مفتوح ع الصالة وحط غرفة السواق عند الباب', { kitchens: 1 }, { driver: 1 }, ['kitchen_style']],
  ['ابغى مجلسين كبار وصالتين ومطبخين', { majlis: 2, halls: 2, kitchens: 2 }, { kitchen: 1, kitchen_prep: 1 }, []],
  ['بزراني الثلاثة صغار وابوي يسكن معنا', { bedrooms: 4 }, { bedroom_boys: 2, elderly_room: 1 }, ['kids_ages', 'bedrooms']],
  ['بيت دورين، فوق غرف النوم وتحت المجلس والمقلط والمطبخ', { majlis: 1, dining: 1 }, { majlis_men: 1, dining: 1 }, []],
  ['ابي غرفتين نوم بس، انا وزوجتي بدون عيال', { bedrooms: 2 }, { master: 1, bedroom: 1 }, ['bedrooms', 'kids_gender', 'service']],
  ['ضيوفنا كثير، ابغى مجلس رجال يتسع لعشرين شخص ودورة مياه للضيوف', { majlis: 1 }, { majlis_men: 1, guest_wc: 1 }, []],
  // حجازية
  ['أبغا بيت فيه صالون واوضتين نوم واوضة للشغالة', { halls: 1, bedrooms: 2 }, { hall: 1, maid: 1, master: 1, bedroom: 1 }, ['bedrooms']],
  ['ابغا مجلس للرجال ومجلس للحريم وسفرة ومطبخ تحضيري', { majlis: 2, dining: 1, kitchens: 2 }, { majlis_men: 1, majlis_women: 1, dining: 1, kitchen_prep: 1 }, ['women_majlis']],
  ['عندنا ثلاث بنات وولد، والبنات كبار', { bedrooms: 5 }, { bedroom_girls: 3, bedroom_boys: 1 }, ['kids_gender', 'kids_ages']],
  ['اوضة نوم ماستر بحمامها ودريسنج، واوضتين للعيال', { bedrooms: 3 }, { master: 1, bedroom_boys: 2 }, ['bedrooms']],
  ['برندة كبيرة وروف ومصعد', {}, {}, []],
  // أرقام هندية
  ['٣ غرف نوم و٢ مجلس و٤ حمامات', { bedrooms: 3, majlis: 2, baths: 4 }, { bath: 4, majlis_men: 1, majlis_women: 1 }, ['bedrooms', 'women_majlis']],
  ['عندي ٥ أطفال و٢ منهم بنات', { bedrooms: 4 }, { bedroom_boys: 2, bedroom_girls: 1 }, ['kids_gender']],
  ['مجلس ٦×٨ وصالة ٥×٦ و٤ غرف نوم', { majlis: 1, halls: 1, bedrooms: 4 }, { majlis_men: 1, hall: 1 }, ['bedrooms']],
  ['١ مجلس و١ مقلط و٢ صالة و٦ غرف نوم و٧ دورات مياه', { majlis: 1, dining: 1, halls: 2, bedrooms: 6, baths: 7 }, { bath: 7 }, ['bedrooms']],
  ['عندنا ٨ أفراد: أنا وزوجتي و٦ عيال', { bedrooms: 4 }, { bedroom_boys: 3 }, ['bedrooms']],
  // صيغ العدد والمثنى
  ['غرفتين نوم للبنات وغرفة للولد', { bedrooms: 4 }, { bedroom_girls: 2, bedroom_boys: 1, master: 1 }, ['bedrooms']],
  ['حمامين ومجلس وغرفتين', { baths: 2, majlis: 1, bedrooms: 2 }, { bath: 2 }, ['bedrooms']],
  ['مجلسان وصالتان وغرفتان', { majlis: 2, halls: 2, bedrooms: 2 }, {}, ['bedrooms']],
  ['ثنتين غرف نوم وثلاثه حمامات', { bedrooms: 2, baths: 3 }, {}, ['bedrooms']],
  ['سبع غرف نوم ومجلس واحد', { bedrooms: 7, majlis: 1 }, { master: 1, bedroom: 6 }, ['bedrooms']],
  // النفي والاستثناء
  ['بدون مقلط وبدون غرفة خادمة، مجلس وصالة وثلاث غرف', { dining: 0, majlis: 1, bedrooms: 3 }, {}, ['service']],
  ['ما احتاج مجلس، صالة كبيرة ومطبخ مفتوح وغرفتين نوم', { majlis: 0, halls: 1, bedrooms: 2 }, {}, ['women_majlis']],
  ['لا ابغى سائق ولا خادمة', {}, {}, ['service']],
  // الأسرة والسياق
  ['ولدي متزوج ويسكن معنا، وعندي بنتين صغار', { bedrooms: 3 }, { bedroom_boys: 1, bedroom_girls: 1 }, ['kids_gender']],
  ['جدتي تسكن معنا وعندي ولدين', { bedrooms: 3 }, { elderly_room: 1, bedroom_boys: 1 }, ['kids_gender']],
  ['انا وزوجتي وامي، بدون اطفال', { bedrooms: 2 }, { master: 1, elderly_room: 1 }, ['bedrooms']],
  ['عزايمنا كثيرة ونحتاج مجلس كبير ومقلط ومطبخ خارجي', { majlis: 1, dining: 1, kitchens: 2 }, { kitchen_prep: 1 }, []],
  // الأدوار والفراغات غير المدعومة
  ['فيلا ثلاث ادوار مع مسبح وكراج وقبو', {}, {}, []],
  ['بيت دور واحد فيه حوش كبير وحديقة', {}, {}, []],
];

test(`المعجم: ${PHRASES.length} عبارة سعودية واقعية تُفهم أعدادًا وفراغات بلا إعادة سؤال عمّا فُهم`, () => {
  assert.ok(PHRASES.length >= 40);
  for (const [text, counts, rows, notAsked] of PHRASES) {
    const b = buildBrief(text);
    for (const [k, v] of Object.entries(counts)) assert.equal(b.counts[k], v, `${text} ← counts.${k}`);
    for (const [id, n] of Object.entries(rows)) assert.equal(cnt(b, id), n, `${text} ← صف ${id}`);
    for (const q of notAsked) assert.ok(!qids(b).includes(q), `${text}: سؤال «${q}» لا يُسأل لأنه مفهوم أو منفي`);
    assert.ok(b.questions.length <= 3, 'ثلاثة أسئلة كحد أقصى');
    for (const q of b.questions) assert.match(q.reason, /^أسأل/, 'كل سؤال بسببه الهندسي');
    assert.ok(b.counts.bedrooms >= 1 && Object.values(b.counts).every(v => Number.isInteger(v) && v <= 10));
    assert.doesNotThrow(() => normalizeDiscovery(b.discovery));
    assert.doesNotThrow(() => buildProgram(b.counts, b.requirements), `${text}: المولّد يقبل المخرجات`);
    assert.ok(!b.requirements.unclear.some(c => /غرف|مجلس|اولاد|عيال|بنات/.test(c)), `${text}: لا «لم أفهم» لعبارة فُهمت`);
  }
});

test('جمل المالك: لا نص «لم أستخرج غرفًا» بل برنامج معلَّل وسؤال محدد', () => {
  const b = buildBrief('عائلة فيها 6 أولاد وأمي تسكن معنا');
  assert.ok(b.program.length >= 6);
  const r = rowsOf(b);
  assert.equal(r.elderly_room.source, 'family'); assert.match(r.elderly_room.reason, /والدتك تسكن معكم ← غرفة نوم بحمامها في الدور الأرضي قرب الصالة/);
  assert.equal(r.bedroom_boys.source, 'family'); assert.match(r.bedroom_boys.reason, /6 من الأبناء/);
  assert.equal(r.majlis_men.source, 'custom'); assert.match(r.majlis_men.reason, /العرف/);
  assert.deepEqual(qids(b), ['kids_gender', 'kids_ages', 'women_majlis']);
  assert.equal(b.requirements.prefs.elderlyRoom, true);
  assert.equal(b.discovery.life.seniors, 'موجودون');
  assert.ok(!JSON.stringify(b).includes('لم أستخرج غرفًا'));
});

test('جمل المالك: «مجلسين وصالتين وأربع غرف نوم ومطبخ مفتوح وغرفة خادمة» كلها في الجدول بمصدر «قلتَ»', () => {
  const b = buildBrief('أبغى مجلسين وصالتين وأربع غرف نوم ومطبخ مفتوح وغرفة خادمة');
  const r = rowsOf(b);
  for (const id of ['majlis_men', 'majlis_women', 'hall', 'kitchen', 'maid', 'bedroom']) assert.equal(r[id].source, 'said', id);
  assert.equal(r.hall.count, 2); assert.equal(r.master.count + r.bedroom.count, 4);
  assert.equal(r.master.source, 'custom'); assert.match(r.master.reason, /ضمن الغرف الـ4/);
  assert.equal(b.requirements.prefs.openKitchen, true);
  assert.deepEqual(b.requirements.extras.maid, { bath: true, ext: true });
  assert.ok(b.understood.includes('مطبخ مفتوح على الطعام'));
  assert.ok(!qids(b).includes('bedrooms') && !qids(b).includes('service') && !qids(b).includes('kitchen_style'));
});

test('جمل المالك: «اثنين مجلس واثنين صالة» بلا أي حقل إلزامي: أعداد كاملة للمولّد وافتراضات معلنة', () => {
  const b = buildBrief('أبغى اثنين مجلس واثنين صالة');
  assert.deepEqual(b.counts, { bedrooms: 1, majlis: 2, baths: 3, kitchens: 1, halls: 2, dining: 1 });
  const r = rowsOf(b);
  assert.equal(r.hall.source, 'said'); assert.equal(r.master.source, 'custom'); assert.equal(r.kitchen.source, 'custom'); assert.equal(r.dining.source, 'custom');
  assert.equal(b.questions[0].id, 'bedrooms'); assert.match(b.questions[0].reason, /بلا جواب أبقي غرفة واحدة/);
  const p = buildProgram(b.counts, b.requirements);
  assert.equal(p.blocks.filter(x => x.kind === 'majlis').length, 2); assert.equal(p.hall, true); assert.equal(p.blocks.filter(x => x.kind === 'family').length, 1, 'الصالة الثانية صالة عائلية في المولّد');
});

test('الأعراف السعودية: معلنة بسببها، قابلة للتعطيل، وتصل إلى المولّد تفضيلاتٍ وقواعد', () => {
  const b = buildBrief('مجلس رجال ومجلس نساء ومقلط وغرفة خادمة وثلاث غرف للعيال وامي معنا');
  const ids = b.customs.map(c => c.id);
  for (const id of ['guest_entrance', 'guest_separation', 'women_separate', 'dining_service', 'baths_off_hall', 'kitchen_closed', 'kids_cluster', 'master_far', 'maid_service', 'elderly_ground']) assert.ok(ids.includes(id), id);
  assert.ok(b.customs.every(c => c.on && c.why.length > 10));
  assert.equal(b.requirements.prefs.guestEntrance, true); assert.equal(b.requirements.prefs.womenSeparate, true); assert.equal(b.requirements.prefs.familyEntrance, true); assert.equal(b.requirements.prefs.openKitchen, false); assert.equal(b.requirements.prefs.bathsOffHall, true);
  const rules = b.requirements.rules.map(r => r.text);
  assert.ok(rules.some(t => /«الطعام» بجوار «المجلس»/.test(t)) && rules.some(t => /«غرف الأبناء» متجاورة/.test(t)) && rules.some(t => /«غرفة الخادمة» قرب «المطبخ»/.test(t)), rules.join(' | '));
  assert.ok(b.discovery.avoids.includes('مرور الضيوف عبر خصوصية العائلة'));
  // تعطيل: المطبخ لا يُغلق، ولا قاعدة للمقلط، ولا حمام للخادمة
  const off = buildBrief('مجلس رجال ومجلس نساء ومقلط وغرفة خادمة وثلاث غرف للعيال', { disabledCustoms: ['kitchen_closed', 'dining_service', 'maid_service'] });
  assert.equal(off.requirements.prefs.openKitchen, undefined); assert.ok(!off.requirements.rules.some(r => /«الطعام» بجوار/.test(r.text)));
  assert.equal(off.requirements.extras.maid.bath, false); assert.equal(cnt(off, 'bath_service'), 0);
  assert.ok(off.customs.find(c => c.id === 'kitchen_closed').on === false);
  // كلام العميل يتقدم على العرف
  const open = buildBrief('مجلس ومطبخ مفتوح على الصالة');
  assert.equal(open.requirements.prefs.kitchenOpenHall, true); assert.ok(!open.customs.some(c => c.id === 'kitchen_closed'));
  assert.equal(CUSTOMS.length, applicableCustoms({ majlis: 1, majlisWomen: 1, bedrooms: 3, kidsRooms: 2, dining: 1, kitchens: 1, maid: true, elderly: true }).length);
});

test('دورات المياه تُحسب من البرنامج وتُعلَّل، والعدد الصريح يحكم مع تنبيه صادق', () => {
  const a = buildBrief('مجلسين واربع غرف نوم وغرفة خادمة');
  assert.equal(a.counts.baths, 2 + 4 + 1); assert.equal(cnt(a, 'guest_wc'), 2); assert.equal(cnt(a, 'bath_suite'), 4); assert.equal(cnt(a, 'bath_service'), 1);
  const sh = buildBrief('مجلس واربع غرف نوم، الماستر بحمامها والباقي يتشاركون الحمام');
  assert.equal(cnt(sh, 'bath_suite'), 1 + 2); assert.equal(sh.requirements.prefs.sharedBaths, true); assert.equal(sh.requirements.prefs.allEnsuite, undefined);
  const ex = buildBrief('مجلس واربع غرف نوم وحمامين');
  assert.equal(ex.counts.baths, 2); assert.ok(ex.notes.some(n => /قلتَ 2 دورات مياه/.test(n) && /تحتاج 5/.test(n)), ex.notes.join());
  assert.equal(ex.requirements.prefs.allEnsuite, undefined, 'العدد الصريح لا يُرفع صامتًا');
});

test('ما لا يُرسم يُقال بصدق: ملحق وثلاثة أدوار وحوش (والمصعد صار مدعومًا)، ولا يُحسب فراغًا', () => {
  const b = buildBrief('فيلا ثلاث ادوار مع مسبح وملحق خارجي ومصعد وحوش كبير وكراج وغرفة سطح، مجلس وثلاث غرف');
  const u = b.unsupported.join(' ');
  assert.ok(!/المسبح[^.]*لا يُرسم/.test(u), 'المسبح صار يُرسم'); assert.equal(b.requirements.prefs.outdoor.pool, true);
  for (const w of ['الملحق', 'ثلاثة أدوار', 'الحوش', 'السطح']) assert.ok(u.includes(w), w);
  assert.ok(!u.includes('المصعد') && b.requirements.prefs.elevator === true, 'المصعد يُرسم ولا يُقال غير مدعوم');
  assert.equal(b.requirements.prefs.outdoor.carport, 2, 'الكراج صار مظلة سيارات تُرسم'); assert.ok(!u.includes('الكراج'));
  assert.equal(b.requirements.prefs.floors, 2); assert.equal(b.floors, 2);
  assert.ok(!b.program.some(r => ['pool', 'annex', 'elevator', 'yard', 'garage', 'roof'].includes(r.id)));
  assert.equal(b.counts.majlis, 1); assert.equal(b.counts.bedrooms, 3);
  assert.ok(b.program.filter(r => r.id === 'master' || r.id === 'bedroom').every(r => r.floor === 'upper'), 'بدورين: النوم في العلوي اقتراحًا');
  assert.ok(b.program.filter(r => ['majlis_men', 'kitchen', 'dining'].includes(r.id)).every(r => r.floor === 'ground'));
});

test('الأسئلة: ما ينقص فعلًا فقط، بترتيب الأثر، وثلاثة كحد أقصى، وتُحذف بعد الجواب أو التخطّي', () => {
  const b0 = buildBrief('مجلس وصالة');
  assert.equal(b0.questions[0].id, 'bedrooms');
  const b1 = buildBrief('مجلس وصالة، 4 غرف نوم');
  assert.ok(!qids(b1).includes('bedrooms')); assert.deepEqual(qids(b1), ['women_majlis', 'service', 'kitchen_style']);
  const b2 = buildBrief('مجلس وصالة، 4 غرف نوم', { skipped: ['women_majlis', 'service'] });
  assert.deepEqual(qids(b2), ['kitchen_style', 'taste'], 'الذوق يُسأل آخرًا بعد ما يغيّر الهيكل');
  assert.ok(!qids(buildBrief('مجلس وصالة، 4 غرف نوم، احب الخصوصية', { skipped: ['women_majlis', 'service'] })).includes('taste'), 'من ذكر ذوقه لا يُسأل عنه');
  const q = b1.questions.find(q => q.id === 'women_majlis');
  assert.equal(answerToText(q, 'no'), 'مجلس النساء غير مطلوب'); assert.equal(answerToText(q, { picks: ['yes'], text: '' }), 'ومجلس نساء');
  const b3 = buildBrief('مجلس وصالة، 4 غرف نوم، ' + answerToText(q, 'no'));
  assert.ok(!qids(b3).includes('women_majlis')); assert.equal(b3.counts.majlis, 1);
  const b4 = buildBrief('مجلس وصالة، 4 غرف نوم، ' + answerToText(q, 'yes'));
  assert.equal(b4.counts.majlis, 2); assert.equal(cnt(b4, 'majlis_women'), 1);
  // سؤال الموقع يظهر فقط عند مدخلين، وجوابه قاعدة مكانية يفهمها المولّد
  const land = { entries: ['s', 'e'], floors: 1 };
  const b5 = buildBrief('مجلس و4 غرف نوم وخادمة ومطبخ مغلق ومجلس نساء', { land });
  assert.equal(b5.questions[0].id, 'majlis_entry'); assert.match(b5.questions[0].reason, /المدخل الثاني/);
  const b6 = buildBrief('مجلس و4 غرف نوم وخادمة ومطبخ مغلق ومجلس نساء، ' + answerToText(b5.questions[0], 'e'), { land });
  assert.ok(b6.requirements.rules.some(r => r.kind === 'place' && r.a === 'majlis' && r.side === 'e')); assert.ok(!qids(b6).includes('majlis_entry'));
  // جواب حر عن الجنس يحدّث الغرف
  const g = buildBrief('عندي 6 اولاد');
  assert.equal(cnt(g, 'bedroom_boys'), 3);
  const g2 = buildBrief('عندي 6 اولاد، ' + answerToText(g.questions.find(q => q.id === 'kids_gender'), { picks: [], text: '4 بنين و2 بنات' }));
  assert.equal(cnt(g2, 'bedroom_boys'), 2); assert.equal(cnt(g2, 'bedroom_girls'), 1); assert.ok(!qids(g2).includes('kids_gender'));
  const g3 = buildBrief('عندي 6 اولاد، ' + answerToText(g.questions.find(q => q.id === 'kids_gender'), 'boys') + '، ' + answerToText(g.questions.find(q => q.id === 'kids_ages'), 'older'));
  assert.equal(cnt(g3, 'bedroom_boys'), 6); assert.equal(g3.family.ages, 'older');
});

test('التعديل اليدوي على الجدول يبقى بعد إعادة البناء ويغيّر الأعداد والفراغات الإضافية', () => {
  const edits = [{ op: 'set', id: 'bedroom', count: 5 }, { op: 'remove', id: 'dining' }, { op: 'add', id: 'maid', count: 1 }, { op: 'add', id: 'prayer', count: 1 }, { op: 'set', id: 'guest_wc', count: 0 }];
  const b = buildBrief('مجلس وثلاث غرف نوم', { edits });
  const r = rowsOf(b);
  assert.equal(r.bedroom.count, 5); assert.equal(r.bedroom.source, 'edit'); assert.equal(b.counts.bedrooms, 6);
  assert.equal(r.dining, undefined); assert.equal(b.counts.dining, 0);
  assert.equal(r.maid.source, 'edit'); assert.ok(b.requirements.extras.maid); assert.ok(b.requirements.extras.prayer);
  assert.equal(r.guest_wc, undefined);
  const gone = buildBrief('مجلس وثلاث غرف نوم', { edits: [{ op: 'remove', id: 'master' }, { op: 'remove', id: 'bedroom' }] });
  assert.equal(gone.counts.bedrooms, 1, 'لا يُولَّد بيت بلا غرفة نوم؛ تُعاد الرئيسية');
});

test('فهم Claude المنقّح يُدمج ولا يكسر الجدول', () => {
  const ai = { rules: [{ kind: 'near', a: 'maid', b: 'kitchen', quote: 'الشغالة عند المطبخ' }], extras: { maid: { bath: true, ext: false } }, prefs: [], areas: {}, absent: [], unclear: [] };
  const b = buildBrief('الشغالة تكون عند المطبخ وثلاث غرف نوم', { ai });
  assert.equal(cnt(b, 'maid'), 1); assert.equal(b.requirements.source, 'claude');
  assert.ok(b.requirements.rules.some(r => r.a === 'maid' && r.b === 'kitchen'));
  assert.ok(b.understood.some(t => /الخادمة/.test(t)));
});

test('قارئ الأسرة: الأعداد والجنس والعمر وكبار السن والضيوف', () => {
  assert.deepEqual([parseFamily('4 اولاد و3 بنات').boys, parseFamily('4 اولاد و3 بنات').girls], [4, 3]);
  assert.deepEqual([parseFamily('عندي 6 اطفال منهم 4 بنات').boys, parseFamily('عندي 6 اطفال منهم 4 بنات').girls], [2, 4]);
  assert.equal(parseFamily('ولدين وبنتين').boys, 2); assert.equal(parseFamily('ولدين وبنتين').girls, 2);
  assert.equal(parseFamily('ولد وبنت صغار').ages, 'young'); assert.equal(parseFamily('عيالي شباب').ages, 'older');
  assert.equal(parseFamily('امي وابوي يسكنون معنا').elderly[0].id, 'parents');
  assert.equal(parseFamily('كبار السن معنا').elderly[0].id, 'senior');
  assert.equal(parseFamily('ضيوفنا كثير').guests, 'frequent'); assert.equal(parseFamily('ما عندنا ضيوف').guests, 'rare');
  assert.equal(parseFamily('انا وزوجتي بدون اطفال').couple, true);
  assert.equal(parseFamily('ابي بيت').elderly.length, 0, '«ابي» بمعنى أريد ليست الوالد');
  assert.equal(parseFamily('ثلاث غرف نوم').mentioned, false);
  const inf = inferFromFamily(parseFamily('6 اولاد كبار وامي معنا'));
  assert.equal(inf.rows.find(r => r.id === 'bedroom_boys').count, 6); assert.equal(inf.rows.find(r => r.id === 'elderly_room').count, 1); assert.equal(inf.prefs.elderlyRoom, true);
  assert.deepEqual(inf.questions.map(q => q.id), ['kids_gender']);
});

test('المعجم: الأعداد قبل الاسم وبعده وبالمثنى والأرقام الهندية، والنفي قبل الاسم وبعده، والأخص يغلب الأعم', () => {
  const F = t => findSpaces(t).map(m => `${m.id}:${m.count}${m.negated ? '-' : ''}`);
  assert.deepEqual(F('اثنين مجلس'), ['majlis:2']); assert.deepEqual(F('مجلس اثنين'), ['majlis:2']); assert.deepEqual(F('٢ مجلس'), ['majlis:2']); assert.deepEqual(F('مجلسين'), ['majlis:2']);
  assert.deepEqual(F('مجلس 5×6'), ['majlis:1'], 'المقاس ليس عددًا');
  assert.deepEqual(F('مجلس الرجال ومجلس النساء'), ['majlis_men:1', 'majlis_women:1']);
  assert.deepEqual(F('غرفة نوم ماستر وغرفتين للبنات وغرفة للسواق'), ['master:1', 'bedroom_girls:2', 'driver:1']);
  assert.deepEqual(F('بدون مجلس'), ['majlis:0-']); assert.deepEqual(F('مجلس النساء غير مطلوب'), ['majlis_women:0-']); assert.deepEqual(F('ما ابي خادمة'), ['maid:0-']);
  assert.deepEqual(F('حمام سباحة'), ['pool:1']); assert.deepEqual(F('صالة الطعام'), ['dining:1']); assert.deepEqual(F('غرفة الغسيل والمستودع'), ['laundry:1', 'storage:1']);
  assert.deepEqual(F('خادمة بحمامها، ومكتب'), ['maid:1', 'office:1'], 'الفاصلة العربية لا تمنع المطابقة');
  assert.ok(SPACES.length >= 30);
});

test('المسار الإرشادي: سبع خطوات بترتيب الأثر (البرنامج ثم الذوق والطراز) وكل خطوة بسببها وخيارات وكتابة حرة', () => {
  assert.deepEqual(GUIDED_STEPS.map(s => s.id), ['g_family', 'g_guests', 'g_sleep', 'g_kitchen', 'g_extras', 'g_taste', 'g_style']);
  for (const s of GUIDED_STEPS) { assert.match(s.reason, /^أسأل/); assert.ok(s.options.length >= 3); assert.equal(s.free, true); }
  const text = GUIDED_STEPS.map((s, i) => answerToText(s, [['mother'], ['both', 'frequent'], ['ensuite'], ['closed', 'maid'], ['office'], ['spacious'], ['modern']][i])).join('، ') + '، 3 اولاد وبنتين صغار';
  const b = buildBrief(text);
  assert.deepEqual(b.counts, { bedrooms: 5, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 });
  assert.equal(b.questions.length, 0, 'بعد الإرشادي الكامل لا أسئلة متبقية');
});
