import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, applyCommand, DrawError } from '../dist/draw/doc.mjs';

const rect = { type: 'set-plot', polygon: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }] };

test('set-plot: شوارع ومداخل متعددة، والمدخل الأول هو entry', () => {
  let d = applyCommand(createDoc(), rect).doc;
  d = applyCommand(d, { type: 'set-plot', streets: ['s', 'e', 'n'], entries: ['e', 's'] }).doc;
  assert.deepEqual(d.streets, ['s', 'e', 'n']); assert.deepEqual(d.entries, ['e', 's']); assert.equal(d.entry, 'e');
});
test('set-plot: مدخل خارج الشوارع المحددة أو جهة مجهولة تُرفض', () => {
  const d = applyCommand(createDoc(), rect).doc;
  assert.throws(() => applyCommand(d, { type: 'set-plot', streets: ['s'], entries: ['n'] }), e => e instanceof DrawError && e.code === 'ENTRY_NOT_ON_STREET');
  assert.throws(() => applyCommand(d, { type: 'set-plot', streets: ['q'] }), e => e.code === 'BAD_SIDES');
  assert.throws(() => applyCommand(d, { type: 'set-plot', entries: 's' }), e => e.code === 'BAD_SIDES');
});
test('set-plot: السلوك القديم (entry وحدها) كما هو، ولا حقول جديدة تُضاف ما لم تُطلب', () => {
  const d = applyCommand(applyCommand(createDoc(), rect).doc, { type: 'set-plot', entry: 'n' }).doc;
  assert.equal(d.entry, 'n'); assert.equal('streets' in d, false); assert.equal('entries' in d, false);
});
test('set-plot: لا يغيّر المستند الأصلي (الأوامر نقية)', () => {
  const d0 = applyCommand(createDoc(), rect).doc, snap = JSON.stringify(d0);
  applyCommand(d0, { type: 'set-plot', streets: ['s'], entries: ['s'] });
  assert.equal(JSON.stringify(d0), snap);
});
