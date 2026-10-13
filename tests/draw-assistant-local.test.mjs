import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { interpretAr, normalizeAr, placeFixture } from '../dist/draw/assistant-local.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import { digestDoc } from '../dist/draw/digest.mjs';
import * as C from './fixtures/draw-cases.mjs';

const DOCS = { villa: sampleVilla(), bed: C.emptyBedroom(), gap: C.gapDoc(), two: C.twoRooms() };
const apply = (doc, cmds) => cmds.reduce((d, c) => applyCommand(d, c).doc, doc);
const ar = /[؀-ۿ]/;

// say, doc, selection, expectations
const U = (say, expect, { doc = 'villa', sel = [] } = {}) => ({ say, expect, doc, sel });
const query = (re, extra = {}) => ({ intent: 'query', answer: re, ...extra });
const none = (intent, re) => ({ intent, commands: 0, answer: re });
const amb = { intent: 'edit', commands: 0, amb: true };

const TABLE = [
  // ---- queries
  U('كم مساحة المطبخ', query(/12\.68/)),
  U('وش مساحة المطبخ؟', query(/12\.68/)),
  U('كَمْ مِسَاحَةُ الْمَطْبَخِ', query(/12\.68/)),               // tashkeel
  U('كم نافذة في المجلس', query(/«مجلس الرجال» 1/)),
  U('وكم نافذة في المجلس', query(/«مجلس الرجال» 1/)),           // و-prefix on the question word
  U('فكم باب في المجلس', query(/مجلس الرجال/)),                  // ف-prefix
  U('هل المطبخ فيه نافذة', query(/^نعم/)),
  U('هل غرفة النوم الرئيسية لها نافذة؟', query(/^نعم/)),
  U('هل غرفة النوم لها نافذة', query(/غرفة نوم رئيسية.*غرفة نوم 2/)), // both bedrooms answered
  U('هل الغسيل فيه نافذة', query(/نعم/)),
  U('أي غرفة أكبر', query(/ممر/)),
  U('اي غرفه اصغر', query(/غسيل/)),                                // no hamza, ta marbuta as ha
  U('أي غرفة نوم أكبر', query(/غرفة نوم رئيسية/)),
  U('كم غرفة', query(/9/)),
  U('كم حمام', query(/1/)),
  U('كم عدد النوافذ', query(/11/)),
  U('كم نافذة في الواجهة الجنوبية', query(/الجنوبية 1/)),
  U('ايش الغرف اللي على الواجهة الجنوبية', query(/مجلس الرجال/)),
  U('كم مساحة الأرض', query(/320/)),
  U('ما أبعاد المجلس', query(/4\.82/)),
  U('ايش ناقص', query(/غسيل/, { issues: true })),
  U('راجع المخطط', query(/ملاحظة/, { issues: true })),
  U('وراجع المخطط لو سمحت', query(/ملاحظة/, { issues: true })),
  U('وين المدخل', query(/المدخل/)),
  U('كيف اوصل للمطبخ من المدخل', query(/3 أبواب/)),
  U('غرفة 2 كم مساحتها', query(/15\.45/)),                       // "room 2" -> label "غرفة نوم 2"
  U('غرفة النوم الثانية كم مساحتها', query(/15\.45/)),            // ordinal
  U('هذي الغرفة كم مساحتها', query(/5\.8/), { sel: ['r6'] }),     // selection
  U('لخص لي المخطط', query(/غرفة/)),
  // ---- renaming / typing
  U('غيّر هذي الغرفة إلى مطبخ', { intent: 'edit', cmd: { type: 'update', id: 'r3', patch: { type: 'kitchen', name: 'مطبخ' } } }, { sel: ['r3'] }),
  U('خل هذي الغرفة مكتب', { intent: 'edit', cmd: { type: 'update', id: 'r3', patch: { type: 'office' } } }, { sel: ['r3'] }),
  U('حول الصالة الى مجلس', { intent: 'edit', cmd: { type: 'update', id: 'r4', patch: { type: 'majlis' } } }),
  U('سمي المطبخ «مطبخ العائلة»', { intent: 'edit', cmd: { type: 'update', id: 'r5', patch: { name: 'مطبخ العائلة' } } }),
  // ---- openings
  U('أضف نافذة في الجدار الشمالي للمطبخ', { intent: 'edit', cmd: { type: 'add-opening', kind: 'window', wall: 'w3' } }),
  U('ضيف شباك كبير في الجدار الشرقي للصالة', { intent: 'edit', cmd: { type: 'add-opening', kind: 'window2' } }),
  U('حط باب بين غرفة النوم الرئيسية وغرفة نوم 2', { intent: 'edit', cmd: { type: 'add-opening', kind: 'door', wall: 'w9' } }),
  U('وسوي باب بين غرفة النوم الرئيسية وغرفة نوم 2', { intent: 'edit', cmd: { type: 'add-opening', kind: 'door', wall: 'w9' } }), // و + dialect verb
  U('ابغى نافذة في المطبخ', { intent: 'edit', cmd: { type: 'add-opening', kind: 'window' } }),                                   // desire + noun
  U('الله يعافيك ابي اضيف نافذة في المطبخ', { intent: 'edit', cmd: { type: 'add-opening', kind: 'window' } }),                   // fillers
  U('ركّب باب منزلق بين المجلس وغرفة النوم', { intent: 'edit', cmd: { type: 'add-opening', kind: 'slider' } }, { doc: 'two' }),
  U('شيل النافذة من المطبخ', { intent: 'edit', cmd: { type: 'delete', ids: ['o15'] }, confirm: true }),
  U('فشيل النافذة من المطبخ', { intent: 'edit', cmd: { type: 'delete', ids: ['o15'] }, confirm: true }),                         // ف + شيل
  U('شيل السرير من غرفة النوم الرئيسية', { intent: 'edit', cmd: { type: 'delete', ids: ['f15'] }, confirm: true }),
  U('احذف الدولاب من غرفة نوم 2', { intent: 'edit', cmd: { type: 'delete', ids: ['f19'] }, confirm: true }),
  // ---- walls, levels, gaps, resizing
  U('خلي سماكة الجدار الشمالي للمجلس 30 سم', { intent: 'edit', cmd: { type: 'update', id: 'w5', patch: { t: 0.3 } } }),
  U('ابي اغير سماكة الجدران الخارجية الى 30 سم', { intent: 'edit', cmds: 4, confirm: true }),
  U('أضف دور أول', { intent: 'edit', cmd: { type: 'add-level', name: 'الدور الأول', copyFrom: 'L1' }, confirm: true }),
  U('ابي دور ثاني فاضي', { intent: 'edit', cmd: { type: 'add-level', name: 'الدور الثاني' }, cmds: 1 }),
  U('سكّر الفتحات', { intent: 'edit', cmd: { type: 'close-gap', level: 'L1' } }, { doc: 'gap' }),
  U('سكر الثغرات', none('edit', /لا توجد ثغرات/)),
  U('وسّع المجلس 50 سم من الجهة الشرقية', { intent: 'edit', cmd: { type: 'translate', ids: ['w6'], dx: 0.5, dy: 0 }, confirm: true }),
  U('وسع الغرفة متر من الشرق', { intent: 'edit', cmd: { type: 'translate', dx: 1, dy: 0 } }, { doc: 'bed' }),
  // ---- fixtures with free-space search
  U('حط سرير مزدوج في غرفة النوم', { intent: 'edit', cmd: { type: 'add-fixture', kind: 'bed-double' }, clean: true }, { doc: 'bed' }),
  U('حطلي دولاب في الغرفة', { intent: 'edit', cmd: { type: 'add-fixture', kind: 'wardrobe' }, clean: true }, { doc: 'bed' }),
  U('ابغى كومودينو في غرفة النوم', { intent: 'edit', cmd: { type: 'add-fixture', kind: 'nightstand' }, clean: true }, { doc: 'bed' }),
  U('حط ثلاجة في المطبخ', { intent: 'edit', cmd: { type: 'add-fixture', kind: 'fridge' }, clean: true }),
  // ---- must NOT edit: ambiguity, refusal, unknown
  U('وسّع المجلس', amb),
  U('كبّر المجلس', amb),
  U('حرك المجلس', amb),
  U('وسّع المجلس 50 سم', amb),
  U('وسّع المجلس من الشرق', amb),
  U('أضف نافذة', amb),
  U('احذف النافذة', amb),
  U('حط شي', amb),
  U('غيّر الغرفة إلى مطبخ', amb),                                                            // no selection, 9 rooms
  U('شيل النافذة من غرفة النوم الرئيسية', amb),                                               // two windows: which one?
  U('غير سماكة الجدران الى 20 سم', { intent: 'edit', cmds: 0, amb: true }),                    // which walls?
  U('حط سرير في الغرفة', amb),                                                               // no selection: which room?
  U('احذف كل شي', none('edit', /حذفًا شاملًا/)),
  U('احذف المجلس', none('edit', /لا أقترحه/)),
  U('حط باب بين المجلس والصالة', none('edit', /لا تتشاركان جدارًا/)),
  U('حط سرير مزدوج في المطبخ', none('edit', /لا يُوضع عادةً/)),
  U('غير سماكة الجدار الغربي للمجلس الى 500 سم', none('edit', /سماكة الجدار بين 5 و100/)),     // dry run rejects it
  U('أضف نافذة في الجدار الشمالي للشرفة', none('edit', /لا توجد في المخطط غرفة من نوع «شرفة»/)),      // there is no such room
  U('وسّع المطبخ متر من الجنوب', { intent: 'edit', cmds: 0 }),                                 // kitchen has no south wall
  // ---- adversarial wording: must not guess
  U('لا تضيف نافذة في المطبخ', { intent: 'unknown', cmds: 0, answer: /لا تريد/ }),                 // negation
  U('ما ابي نافذة في المطبخ', { intent: 'unknown', cmds: 0, answer: /لا تريد/ }),
  U('اضف نافذة في المطبخ والمجلس', amb),                                                        // two rooms
  U('اضف نافذة في الجدار الشمالي والجنوبي للمجلس', amb),                                          // two walls
  U('اضف ٣ نوافذ في المجلس', none('edit', /عنصرًا واحدًا/)),                                      // quantity
  U('اضف نافذتين في المجلس', none('edit', /عنصرًا واحدًا/)),
  U('كم مساحة مجلس النساء', { intent: 'query', cmds: 0, amb: true }),                           // qualifier that is not part of any room name
  U('اضف نافذة في مجلس النساء', amb),
  U('كم مساحة غرفة النوم الثالثة', { intent: 'query', cmds: 0, answer: /لا توجد/ }),            // only two bedrooms
  U('خلي المجلس اكبر', amb),
  U('غير النافذة الى نافذة كبيرة', none('edit', /اطلب حذفها/)),
  U('غير اسم المجلس الى ديوانية', { intent: 'edit', cmd: { type: 'update', id: 'r1', patch: { name: 'ديوانية' } } }),
  U('مساحه المجلس', query(/28/)),
  U('كم مساحة المجلس الان', query(/28/)),
  U('مرحبا', { intent: 'unknown', cmds: 0 }),
  U('ايش رايك بالالوان', { intent: 'unknown', cmds: 0 }),
  U('', { intent: 'unknown', cmds: 0 }),
];

test(`the table has at least 40 distinct Arabic utterances (${TABLE.length})`, () => {
  assert.ok(new Set(TABLE.map(t => t.say)).size >= 40);
});

for (const t of TABLE) {
  test(`«${t.say || '(فارغ)'}»`, () => {
    const doc = DOCS[t.doc], before = JSON.stringify(doc);
    const r = interpretAr(t.say, doc, { selection: t.sel });
    assert.equal(JSON.stringify(doc), before, 'the interpreter never mutates the drawing');
    assert.ok(['edit', 'query', 'unknown'].includes(r.intent));
    assert.ok(Array.isArray(r.commands) && Array.isArray(r.ambiguities) && Array.isArray(r.referencedIds) && typeof r.needsConfirm === 'boolean');
    // the dry-run guarantee: whatever is returned can be applied
    assert.doesNotThrow(() => apply(doc, r.commands));
    if (t.say) assert.match(r.answer || '', ar, 'Arabic answer');
    const e = t.expect;
    assert.equal(r.intent, e.intent, r.answer);
    if (e.answer) assert.match(r.answer, e.answer);
    if (e.issues) { assert.ok(Array.isArray(r.issues) && r.issues.length > 0); assert.equal(r.commands.length, 0); }
    if (e.amb) { assert.ok(r.ambiguities.length > 0, 'asks instead of guessing'); assert.equal(r.commands.length, 0); for (const a of r.ambiguities) { assert.match(a.question, ar); assert.ok(a.options.length >= 1 && a.options.every(o => o.id && o.label)); } }
    else assert.equal(r.ambiguities.length, 0, JSON.stringify(r.ambiguities));
    if (e.commands === 0 || e.cmds === 0) assert.equal(r.commands.length, 0, JSON.stringify(r.commands));
    if (e.cmds) assert.equal(r.commands.length, e.cmds);
    if (e.cmd) {
      assert.ok(r.commands.length >= 1, 'a command was expected: ' + r.answer);
      const c = r.commands.find(x => x.type === e.cmd.type);
      assert.ok(c, 'command type ' + e.cmd.type + ' in ' + JSON.stringify(r.commands));
      for (const [k, v] of Object.entries(e.cmd)) {
        if (k === 'patch') assert.deepEqual(Object.fromEntries(Object.keys(v).map(x => [x, c.patch[x]])), v);
        else if (typeof v === 'number') assert.ok(Math.abs(c[k] - v) < 1e-9, `${k}: ${c[k]} vs ${v}`);
        else assert.deepEqual(c[k], v, k);
      }
    }
    if (e.confirm) assert.equal(r.needsConfirm, true);
    if (e.clean) { // a placed fixture must not create new swing/overlap/outside findings
      const baseCodes = reviewDoc(doc).filter(i => ['SWING_BLOCKED', 'FIXTURE_OVERLAP', 'FIXTURE_OUTSIDE'].includes(i.code)).length;
      const after = reviewDoc(apply(doc, r.commands)).filter(i => ['SWING_BLOCKED', 'FIXTURE_OVERLAP', 'FIXTURE_OUTSIDE'].includes(i.code)).length;
      assert.equal(after, baseCodes, 'no new problems after placing');
    }
  });
}

test('normalisation: alef/ya/ta-marbuta/tashkeel/Arabic-Indic digits', () => {
  assert.equal(normalizeAr('أُضِفْ نَافِذَةً في الغُرْفَةِ ٢'), 'اضف نافذه في الغرفه 2');
  assert.equal(normalizeAr('  مَطبَخ   إلى  '), 'مطبخ الي');
  assert.equal(normalizeAr('3.5 م'), '3.5 م');
});

test('Arabic-Indic digits in an utterance: «غرفة ٢»', () => {
  assert.match(interpretAr('غرفة ٢ كم مساحتها', DOCS.villa).answer, /15\.45/);
});

test('selection forms: array of ids, { ids }, a fixture id (resolves to its room), an opening id', () => {
  const ask = sel => interpretAr('هذي الغرفة كم مساحتها', DOCS.villa, { selection: sel });
  assert.match(ask(['r6']).answer, /5\.8/); assert.match(ask({ ids: ['r6'] }).answer, /5\.8/);
  const wc = DOCS.villa.fixtures.find(f => f.kind === 'wc');
  assert.match(ask([wc.id]).answer, /5\.8/, 'a selected fixture stands for the room it is in');
  assert.ok(ask([]).ambiguities.length > 0, 'nothing selected: asks which room');
  assert.ok(ask(['r6', 'r5']).ambiguities.length > 0, 'two rooms selected: asks which');
  const del = interpretAr('شيل هذا', DOCS.villa, { selection: [wc.id] });
  assert.equal(del.intent, 'edit');
});

test('deleting the selected window: «احذف هذي النافذة»', () => {
  const o = DOCS.villa.openings.find(x => x.kind === 'window');
  const r = interpretAr('احذف هذي النافذة', DOCS.villa, { selection: [o.id] });
  assert.deepEqual(r.commands, [{ type: 'delete', ids: [o.id] }]); assert.equal(r.needsConfirm, true);
});

test('a compound request is split on the conjunction and answered clause by clause', () => {
  const r = interpretAr('أضف نافذة في الجدار الشمالي للمطبخ وحط باب بين غرفة النوم الرئيسية وغرفة نوم 2', DOCS.villa);
  assert.equal(r.intent, 'edit'); assert.deepEqual(r.commands.map(c => c.type), ['add-opening', 'add-opening']);
  assert.deepEqual(r.commands.map(c => c.kind), ['window', 'door']);
  const bad = interpretAr('أضف نافذة في الجدار الشمالي للمطبخ وحط شي', DOCS.villa);
  assert.equal(bad.commands.length, 0, 'one ambiguous clause holds back the whole request');
});

test('the swing of a new interior door is chosen to be clear; the private room gets the leaf', () => {
  const r = interpretAr('حط باب بين غرفة النوم الرئيسية وغرفة نوم 2', DOCS.villa);
  const after = apply(DOCS.villa, r.commands);
  const added = after.openings.find(o => !DOCS.villa.openings.some(x => x.id === o.id));
  assert.ok(added);
  assert.equal(reviewDoc(after).some(i => i.code === 'SWING_BLOCKED' && i.targetIds.includes(added.id)), false, 'new door does not collide');
});

test('placeFixture keeps pieces off door swings and off each other, over repeated placement', () => {
  let doc = DOCS.bed;
  const placed = [];
  for (const q of ['حط سرير مزدوج في الغرفة', 'حط دولاب في الغرفة', 'حط كومودينو في الغرفة', 'حط مكتب عمل في الغرفة']) {
    const r = interpretAr(q, doc);
    if (!r.commands.length) { assert.match(r.answer, /لا توجد مساحة حرة/); continue; }
    doc = apply(doc, r.commands); placed.push(r.commands[0].kind);
  }
  assert.ok(placed.length >= 3, 'placed ' + placed.join());
  const bad = reviewDoc(doc).filter(i => ['SWING_BLOCKED', 'FIXTURE_OVERLAP', 'FIXTURE_OUTSIDE'].includes(i.code));
  assert.deepEqual(bad, []);
  // a bed placed by the search stands with its head against a wall: its back face is within a few cm of a wall face
  const bed = doc.fixtures.find(f => f.kind === 'bed-double');
  const hw = bed.w / 2, hd = bed.d / 2;
  const half = Math.abs(Math.cos(bed.rot)) > 0.5 ? [hw, hd] : [hd, hw];
  const gaps = [bed.x - half[0] - 0.1, 4 - 0.1 - (bed.x + half[0]), bed.y - half[1] - 0.1, 5 - 0.1 - (bed.y + half[1])];
  assert.ok(Math.min(...gaps.map(Math.abs)) < 0.06, 'against a wall: ' + gaps.map(g => g.toFixed(2)));
});

test('no space for a piece: says so and proposes nothing', () => {
  const tight = interpretAr('حط سرير مزدوج في الغرفة', apply(DOCS.bed, [{ type: 'add-fixture', level: 'L1', kind: 'bed-double', x: 2, y: 2.5, rot: 0 }, { type: 'add-fixture', level: 'L1', kind: 'wardrobe', x: 2, y: 4.6, rot: 0 }, { type: 'add-fixture', level: 'L1', kind: 'wardrobe', x: 2, y: 0.9, rot: 0 }, { type: 'add-fixture', level: 'L1', kind: 'sofa-3', x: 0.7, y: 2.5, rot: 1.5707963 }, { type: 'add-fixture', level: 'L1', kind: 'sofa-3', x: 3.3, y: 2.5, rot: -1.5707963 }]));
  assert.equal(tight.commands.length, 0); assert.match(tight.answer, /لا توجد مساحة حرة/);
});

test('moving a wall that would open the plan or leave the label outside is refused, not guessed', () => {
  const r = interpretAr('ضيق غرفة النوم الرئيسية متر من الجهة الشرقية', DOCS.villa);
  assert.equal(r.commands.length, 0); assert.match(r.answer, /[؀-ۿ]/);
  const south = interpretAr('وسّع المجلس 50 سم من الجهة الجنوبية', DOCS.villa);
  assert.equal(south.commands.length, 0, 'the south wall runs on past the majlis into the entrance hall');
});

test('referencedIds name the rooms and elements involved', () => {
  const r = interpretAr('أضف نافذة في الجدار الشمالي للمطبخ', DOCS.villa);
  assert.ok(r.referencedIds.includes('r5') && r.referencedIds.includes('w3'));
});

test('every utterance answer is Arabic-only user text (no English words in answers)', () => {
  for (const t of TABLE.filter(x => x.say)) {
    const r = interpretAr(t.say, DOCS[t.doc], { selection: t.sel });
    assert.ok(!/[A-Za-z]{4,}/.test(r.answer.replace(/\b[wrofsLS]\d+\b/g, '')), r.answer);
  }
});

test('digest and interpreter agree: the answer about the kitchen area equals the digest value', () => {
  const k = digestDoc(DOCS.villa).levels[0].rooms.find(r => r.id === 'r5');
  assert.ok(interpretAr('كم مساحة المطبخ', DOCS.villa).answer.includes(String(k.area)));
});
