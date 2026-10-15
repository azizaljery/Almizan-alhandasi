import test from 'node:test';
import assert from 'node:assert/strict';
import { writeHandoff, consumeHandoff, HANDOFF_KEY, STUDIO_KEY, BACKUP_KEY } from '../dist/draw/handoff.mjs';
import { createDoc, applyCommand, serialize } from '../dist/draw/doc.mjs';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), has: k => m.has(k), raw: m }; };
const withWall = (title = 'مشروع') => applyCommand(createDoc({ title }), { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }).doc;

test('التسليم: يُكتب ثم يُستهلك مرة واحدة ويصير مشروع المرسم', () => {
  const session = store(), local = store(), doc = withWall('من شرعاء');
  writeHandoff(session, doc, { source: 'home-shara', note: 'ملاحظة' });
  const got = consumeHandoff(session, local);
  assert.equal(got.doc.title, 'من شرعاء'); assert.equal(got.doc.walls.length, 1); assert.equal(got.meta.note, 'ملاحظة');
  assert.equal(session.has(HANDOFF_KEY), false, 'استُهلك');
  assert.equal(JSON.parse(local.getItem(STUDIO_KEY)).title, 'من شرعاء');
  assert.equal(consumeHandoff(session, local), null, 'لا يُستهلك مرتين');
});
test('التسليم: المشروع المحفوظ الذي فيه جدران يُنسخ احتياطيًا ولا يضيع', () => {
  const old = serialize(withWall('مشروعي القديم'));
  const session = store(), local = store({ [STUDIO_KEY]: old });
  writeHandoff(session, withWall('الجديد'));
  const got = consumeHandoff(session, local);
  assert.equal(got.backedUp, true); assert.equal(local.getItem(BACKUP_KEY), old);
  assert.equal(JSON.parse(local.getItem(STUDIO_KEY)).title, 'الجديد');
});
test('التسليم: مشروع محفوظ فارغ أو تالف لا يستحق نسخًا احتياطيًا', () => {
  for (const prev of [serialize(createDoc()), '{غير صالح']) {
    const session = store(), local = store({ [STUDIO_KEY]: prev });
    writeHandoff(session, withWall()); const got = consumeHandoff(session, local);
    assert.equal(got.backedUp, false); assert.equal(local.has(BACKUP_KEY), false);
  }
});
test('التسليم: مستند غير صالح يُرفض عند الكتابة، وتسليم تالف أو بمخطط غريب يُتجاهل', () => {
  assert.throws(() => writeHandoff(store(), { schema: 'x' }));
  for (const junk of ['not json', JSON.stringify({ schema: 'other', doc: withWall() }), JSON.stringify({ schema: 'mizan-home-handoff/1', doc: { schema: 'bad' } })]) {
    const session = store({ [HANDOFF_KEY]: junk }), local = store({ [STUDIO_KEY]: serialize(withWall('محفوظ')) });
    assert.equal(consumeHandoff(session, local), null);
    assert.equal(JSON.parse(local.getItem(STUDIO_KEY)).title, 'محفوظ', 'لم يُمسّ');
  }
});
test('التسليم: تعطّل التخزين المحلي لا يرمي ويبقى المستند متاحًا', () => {
  const session = store(); writeHandoff(session, withWall('ذاكرة'));
  const broken = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const got = consumeHandoff(session, broken);
  assert.equal(got.doc.title, 'ذاكرة');
});
