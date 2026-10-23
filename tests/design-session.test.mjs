import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, redesign, approve, saveSession, loadSession, FEEDBACK, summarizeDoc, zoneOf, currentDoc } from '../dist/design-session.mjs';
import { generateInitialDesign, SharaSession } from '../dist/home-flow.mjs';
import { sunPosition, CITIES } from '../dist/sun.mjs';

const land = { length: 30, width: 20, streets: ['s'], entries: ['s'] };
const counts = { bedrooms: 4, majlis: 2, baths: 5, kitchens: 1, halls: 1, dining: 1 };
const discovery = new SharaSession().discovery();
const memStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('جلسة التصميم: الأول يُعرض، و«تصميم آخر» يختلف ويطبّق الملاحظات، والسجل محفوظ', async () => {
  const first = await generateInitialDesign({ land, rooms: null, discovery, counts });
  let s = createSession({ land, counts, discovery, result: first });
  assert.equal(s.designs.length, 1); assert.ok(currentDoc(s).walls.length > 10);
  const r1 = await redesign(s, { picks: ['rooms_small', 'corridors'] });
  s = r1.session;
  assert.equal(s.designs.length, 2); assert.equal(s.current, 1);
  // الجولة السادسة: خيارات التقييم الجاهزة («الغرف صغيرة»، «الممرات كثيرة») تعيد التوليد مفضّلةً التنظيم المعروض ما لم يكن
  // من الأنماط المستبعدة. البديل الأول لهذا الطلب صار تنظيمًا بلا ممرات (الصالة الموزِّعة)، فيبقى التنظيم نفسه بأبعاد
  // جديدة — المطلوب أن يتغير المخطط فعلًا وألا يكون التنظيم من الأنماط ذات الممرات (التأكيد التالي)، لا أن يتغير اسم النمط
  assert.notEqual(s.designs[0].doc, s.designs[1].doc, 'مخطط مختلف');
  assert.deepEqual(r1.changes, ['غرف النوم صغيرة', 'الممرات كثيرة']);
  assert.ok(!['tee', 'rows'].includes(s.designs[1].pat.split('|')[0]), 'الممرات الكثيرة تستبعد أنماط الممر');
  assert.ok(s.input.requirements.tweaks.bedroomScale > 1);
  let r2 = await redesign(s, { text: 'أريد المطبخ مفتوحا وغرفة خادمة' });
  // (الجولة الرابعة عشرة/الخامسة عشرة) لا حل موضعي لإضافة غرفة الخادمة في المعروض: تُعرض الخيارات صراحة (لا استبدال صامت)، فيختار
  // العميل إعادة التوزيع — ثم تُطبَّق ملاحظاته كلها
  if (r2.reply.mode === 'ask-options') { assert.deepEqual(r2.changes, [], 'لا تغيير قبل اختيار العميل'); const o = r2.reply.options.find(x => x.id === 'zone') || r2.reply.options.find(x => x.id === 'full'); assert.ok(o, 'خيار إعادة توزيع'); r2 = await redesign(r2.session, { text: String(o.n) }); }
  assert.ok(r2.changes.some(c => /مطبخ مفتوح/.test(c)) && r2.changes.some(c => /خادمة/.test(c)));
  assert.ok(currentDoc(r2.session).labels.some(l => l.name === 'غرفة الخادمة'));
  const store = memStore(); assert.ok(saveSession(store, approve(r2.session)));
  const back = loadSession(store); assert.equal(back.approved, back.current); assert.equal(back.designs.length, 3);
  await assert.rejects(redesign(s, { picks: ['nope'] }), /غير معروف/);
});

test('ملخص العرض: مواصفات وجدول فراغات بالمناطق من المستند نفسه', async () => {
  const out = await generateInitialDesign({ land, rooms: null, discovery, counts });
  const S = summarizeDoc(out.doc);
  assert.equal(S.specs.bedrooms, 4); assert.equal(S.specs.majlis, 2); assert.ok(S.specs.baths >= 5, 'الحمامات المطلوبة (وقد تزيد دورة المياه اليومية الافتراضية)'); assert.equal(S.specs.floors, 1);
  assert.ok(S.specs.entries >= 2 && S.specs.net > 100 && S.specs.built >= S.specs.net);
  assert.ok(S.rooms.some(r => r.zone === 'men') && S.rooms.some(r => r.zone === 'women') && S.rooms.some(r => r.zone === 'service'));
  assert.equal(zoneOf({ name: 'دورة مياه الرجال', type: 'bath' }), 'men'); assert.equal(zoneOf({ name: 'مجلس النساء', type: 'majlis' }), 'women');
  assert.equal(zoneOf({ name: 'المطبخ', type: 'kitchen' }), 'service'); assert.equal(zoneOf({ name: 'غرفة نوم 2', type: 'bedroom' }), 'family');
  assert.ok(FEEDBACK.every(f => f.id && f.label));
});

test('الشمس: ظهر الانقلاب الصيفي في الرياض شبه عمودي، والشتاء ~42°، والصباح شرقًا والعصر غربًا', () => {
  const lat = CITIES.riyadh.lat;
  assert.ok(sunPosition({ latitudeDeg: lat, dayOfYear: 172, solarHour: 12 }).altitudeDeg > 87);
  assert.ok(Math.abs(sunPosition({ latitudeDeg: lat, dayOfYear: 355, solarHour: 12 }).altitudeDeg - (90 - lat - 23.45)) < .5);
  const am = sunPosition({ latitudeDeg: lat, dayOfYear: 80, solarHour: 9 }), pm = sunPosition({ latitudeDeg: lat, dayOfYear: 80, solarHour: 15 });
  assert.ok(am.azimuthDeg > 60 && am.azimuthDeg < 150 && pm.azimuthDeg > 210 && pm.azimuthDeg < 300);
  assert.ok(sunPosition({ latitudeDeg: lat, dayOfYear: 80, solarHour: 5.5 }).altitudeDeg < 0);
});
