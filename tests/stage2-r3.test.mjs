// الجولة الثالثة على المولّد الثاني: تعديل موضعي يحفظ النمط، وبوابات جودة معمارية على المخطط المرسوم،
// وحركة أقل، وسلم بمقاس سلم لا صالة، وتنظيمات جديدة (مجلس على الواجهة الجانبية، مدخل في الركن، الصالة في الخلف).
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, qualityGates, difference, partiTrees, programV2 } from '../dist/villa-layout-v2.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { docRooms, verifyRules } from '../dist/rules.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { serialize } from '../dist/draw/doc.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const dims = r => { const w = r.x1 - r.x0, d = r.y1 - r.y0; return { s: Math.min(w, d), l: Math.max(w, d) }; };
/** نسبة الحركة كما في أدلة القبول: المداخل والممرات والمغاسل من الصافي. */
const circPct = doc => { const { rooms } = docRooms(doc), net = rooms.reduce((a, r) => a + r.area, 0); return 100 * rooms.filter(r => ['entrance', 'corridor', 'living'].includes(r.type) && /مدخل|ممر|ردهة|مغاسل/.test(r.name)).reduce((a, r) => a + r.area, 0) / net; };
const PROG = ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'service'];
const prog = d => docRooms(d).rooms.filter(x => PROG.includes(x.type)).map(x => x.name).sort();

test('بوابات الجودة على المرسوم: الرئيسية لا تصغر، المطبخ ≥ 3 م ويجاور الطعام بباب، الطعام غير شريطي، ولا وصول للأسرة عبر ممر النوم', () => {
  for (const id of ['C1', 'C6', 'C10']) {
    const { C, r, land } = caseReq(id);
    const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 });
    // C6 («المطبخ في الخلف» صارمًا ومقاسات صريحة): لا يُعرض بديل مطبخه وسط البيت، فقد يقل العدد إلى اثنين
    // قرار المالك (الجولة الخامسة): لا يُرفع العدد على حساب الجودة — بديلان على الأقل مختلفان فعلًا (≥ 0.16)، ويُذكر سبب النقص
    assert.ok(out.designs.length >= 2, id + ': عدد البدائل');
    for (let i = 0; i < out.designs.length; i++) for (let j = i + 1; j < out.designs.length; j++) assert.ok(difference(out.designs[i].doc, out.designs[j].doc) >= .16, `${id}: البديلان ${i + 1} و${j + 1} متقاربان`);
    if (out.designs.length < (C.want || 4)) assert.match(out.designs[0].notes.join(' '), /مختلفة تنظيميًا فقط/);
    for (const d of out.designs) {
      assert.deepEqual(qualityGates(d.doc), [], `${id} ${d.pat}`);
      const { rooms } = docRooms(d.doc), beds = rooms.filter(x => x.type === 'bedroom' || x.type === 'master'), m = beds.find(x => x.type === 'master');
      for (const b of beds) assert.ok(b.area <= m.area + .3, `${id} ${d.pat}: «${b.name}» ${b.area} > الرئيسية ${m.area}`);
      const k = rooms.find(x => x.name === 'المطبخ'), dn = rooms.find(x => x.type === 'dining');
      assert.ok(dims(k).s >= 2.95, `${id} ${d.pat}: عرض المطبخ ${dims(k).s}`);
      assert.ok(dims(dn).l / dims(dn).s <= 1.85, `${id} ${d.pat}: الطعام ${dims(dn).s}×${dims(dn).l}`);
      assert.ok(beds.every(b => dims(b).s >= 2.95), `${id} ${d.pat}: غرفة نوم أضيق من 3 م`);
    }
  }
});

test('بوابة الجودة ترفض فعلًا: إن صارت الرئيسية أصغر غرف النوم يُذكر ذلك سببًا للرفض', () => {
  const { r, land } = caseReq('C9');
  const d = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 1 }).designs[0];
  const doc = JSON.parse(serialize(d.doc)), rooms = docRooms(doc).rooms;
  const small = rooms.filter(x => x.type === 'bedroom').sort((a, b) => a.area - b.area)[0], big = rooms.filter(x => x.type === 'bedroom').sort((a, b) => b.area - a.area)[0];
  assert.ok(big.area > small.area + .3, 'البرنامج فيه غرفتا نوم مختلفتا المساحة');
  // نقل تسمية الرئيسية إلى أصغر غرفة نوم (والعكس): المخطط نفسه، والرئيسية الآن أصغر من غيرها
  const lm = doc.labels.find(l => l.type === 'master'), ls = doc.labels.find(l => l.name === small.name);
  [lm.seed, ls.seed] = [ls.seed, lm.seed];
  assert.ok(qualityGates(doc).some(w => /الرئيسية .* أصغر/.test(w)), qualityGates(doc).join(' | '));
  assert.deepEqual(qualityGates(JSON.parse(serialize(d.doc))), [], 'الأصل سليم');
});

test('C8: التعديل على كل بديل يحفظ النمط والغرف بفرق صغير، وإن تحقق الطلب أصلًا لا يتغير المخطط', async () => {
  const { C, r, land } = caseReq('C8');
  const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  let kept = 0;
  for (const d of out.designs) {
    const s0 = createSession({ land, counts: r.counts, requirements: r, result: { doc: d.doc, pat: d.pat, mirror: d.mirror, summary: d.summary, notes: d.notes, villaEngine: 'v2' } });
    const { session, reply } = await redesign(s0, { text: C.edit });
    const after = JSON.parse(session.designs[1].doc);
    assert.deepEqual([...reply.done].sort(), ['«المطبخ» بجوار «الطعام»', '«المطبخ» في الخلف'].sort(), d.pat + ' ' + JSON.stringify(reply.failed));
    assert.deepEqual(prog(after), prog(d.doc), d.pat + ': غرف البرنامج نفسها');
    // «في الخلف» صارمًا (الجولة الرابعة): على الواجهة الخلفية أو في ثلثها الخلفي بلا غرفة سكنية خلفه
    { const k = verifyRules(after, [{ id: 'K', kind: 'place', a: 'kitchen', side: 'back', mode: 'zone', text: 'المطبخ في الخلف' }], { entry: 's' })[0]; assert.equal(k.ok, true, d.pat + ': ' + k.why); }
    if (session.designs[1].pat === d.pat) { kept++; assert.ok(difference(d.doc, after) <= .15, `${d.pat}: فرق ${difference(d.doc, after)}`); }
    else assert.ok(reply.patternChanged && /أقرب توزيع/.test(reply.patternChanged.why_ar), 'تغيّر النمط يُقال صراحة');
    if (reply.unchanged) assert.equal(session.designs[1].doc, session.designs[0].doc, 'متحقق أصلًا: المخطط نفسه حرفيًا');
  }
  // «في الخلف» صارمًا (الجولة الرابعة): أنماط جناح النوم فيها يشغل الخلف كله لا حل موضعي لها (المبادلة بغرفة نوم تجعل
  // المطبخ لا يُبلغ إلا عبر ممر النوم فتُرفض)، فيُنتقل إلى أقرب نمط ويُقال ذلك (فوق)؛ ويُحفظ النمط حيث يوجد حل
  assert.ok(kept >= 1, `حُفظ النمط في ${kept} من ${out.designs.length}`);
});

test('خيارات التقييم الجاهزة تبقى إعادة توليد (لا تعديلًا موضعيًا): «الممرات كثيرة» تستبعد أنماط الرواق والحوش', () => {
  const P = programV2({ bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 }, {});
  const modes = new Set(partiTrees(P, { W: 17 }).map(t => t.mode));
  for (const m of ['sidemajlis', 'cornerentry', 'hallback', 'sideliving']) assert.ok(modes.has(m), m);
});

test('الحركة: متوسط نسبة المداخل والممرات في بدائل C8 وC10 ≤ 19% (كانت 20–21% في «بعد-2»)، ولا بديل فوق 22%', () => {
  for (const id of ['C8', 'C10']) {
    const { C, r, land } = caseReq(id);
    const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 });
    const cs = out.designs.map(d => circPct(d.doc));
    assert.ok(cs.reduce((a, b) => a + b, 0) / cs.length <= 19, id + ': ' + cs.map(c => c.toFixed(1)).join(' '));
    assert.ok(cs.every(c => c <= 22), id + ': ' + cs.map(c => c.toFixed(1)).join(' '));
  }
});

test('C7 دوران: فراغ السلم بمقاس سلم (≤ 18 م²)، وتنظيمان مختلفان للعلوي على الأقل (أجنحة على المحور / رواق خلفي)', () => {
  const { r, land } = caseReq('C7');
  const out = generateVillaTwoFloors({ land, counts: r.counts, requirements: r, keep: 4 });
  assert.ok(out.designs.length >= 2);
  for (const d of out.designs) for (const s of docRooms(d.doc).rooms.filter(x => x.name === 'الدرج')) assert.ok(s.area <= 18, `${d.pat}: الدرج ${s.area} م²`);
  // الجولة الخامسة: تنظيم الدور الأرضي نفسه يختلف بين البدائل (لا علوي مختلف على أرضي واحد)
  const grounds = out.designs.map(d => d.pat.split('/')[0]);
  assert.equal(new Set(grounds).size, grounds.length, grounds.join(' '));
});
