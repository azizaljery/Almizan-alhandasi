import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretAr } from '../dist/draw/assistant-local.mjs';
import { digestDoc, describeDigestAr } from '../dist/draw/digest.mjs';
import { validateDigest } from '../dist/draw/assistant-schema.mjs';
import { askDrawingAssistant } from '../dist/draw/assistant-client.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';

const villa = sampleVilla();
const finishOf = r => r.commands[0].finish;

test('المساعد يفهم طلبات الواجهة والمواد', () => {
  let r = interpretAr('اجعل الواجهة حجر', villa); assert.equal(r.intent, 'edit'); assert.equal(finishOf(r).facade.base, 'stone'); assert.ok(r.needsConfirm);
  r = interpretAr('غير لون الواجهة إلى بيج', villa); assert.equal(finishOf(r).facade.color, '#d9c7a4');
  r = interpretAr('لون الألمنيوم أسود', villa); assert.equal(finishOf(r).aluminium, '#2b2c2e');
  r = interpretAr('اجعل أرضية المجلس باركيه', villa); assert.equal(finishOf(r).floors.majlis, 'wood');
  r = interpretAr('لون باب المدخل بني', villa); assert.equal(finishOf(r).entryDoor, '#8b7d6b');
  r = interpretAr('غير أرضية الصالة', villa); assert.equal(r.commands.length, 0);
});

test('لا يخطف طلبات أخرى عن الواجهة', () => {
  const r = interpretAr('كم مساحة المجلس؟', villa); assert.ok(!r.commands.some(c => c.type === 'set-meta'));
});

test('الملخص يذكر المواد المختارة ويقبله مدقق الخادم', () => {
  const d = applyCommand(villa, { type: 'set-meta', finish: { facade: { base: 'stone', color: '#c8b28a' }, floors: { majlis: 'wood' } } }).doc;
  const dig = digestDoc(d, { compact: true }); assert.equal(dig.finish.base, 'stone');
  assert.match(describeDigestAr(dig), /المواد المختارة/); assert.match(describeDigestAr(dig), /مجلس باركيه/);
  assert.ok(validateDigest(JSON.parse(JSON.stringify(dig))));
});

test('الطلب المحلي يمر عبر العميل كاقتراح قابل للتطبيق', async () => {
  const res = await askDrawingAssistant(villa, 'اجعل الواجهة حجر');
  assert.equal(res.proposals.length, 1); assert.equal(res.proposals[0].commands[0].type, 'set-meta');
});
