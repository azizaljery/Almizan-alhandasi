import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClientContext, deriveRequirements } from '../dist/requirements-engine.mjs';

test('builds a bounded bilingual client context without secrets', () => {
  const context = buildClientContext({
    prompt: 'أريد family hall and privacy',
    plot: { width: 25, length: 50, floors: 1, entry: 'w', streets: { w: true }, coverage: .6, maxBuiltArea: 500 },
    discovery: { likes: ['classic'], rejects: [], avoids: ['كشف الضيوف للعائلة'], life: { seniors: 'موجودون' } },
    rooms: [{ name: 'مجلس رجال', type: 'majlis', area: 63, position: 'front', side: 'any' }],
  });
  assert.equal(context.language, 'ar-en');
  assert.equal(context.plot.maxBuiltArea, 500);
  assert.equal(context.rooms[0].type, 'majlis');
  assert.ok(!JSON.stringify(context).includes('key'));
});

test('derives priorities, relationships, conflicts and clarifying questions', () => {
  const context = buildClientContext({
    prompt: 'أريد خصوصية ومسار ضيوف مستقل ومطبخ قريب من الطعام',
    plot: { width: 20, length: 30, floors: 2, entry: '', streets: { s: true }, coverage: .6, maxBuiltArea: 180 },
    discovery: { likes: [], rejects: [], avoids: ['كشف الضيوف للعائلة'], life: { seniors: 'موجودون' } },
    rooms: [
      { name: 'مجلس رجال', type: 'majlis', area: 63, position: 'front', side: 'any' },
      { name: 'صالة طعام', type: 'dining', area: 20, position: 'front', side: 'any' },
      { name: 'مطبخ', type: 'kitchen', area: 48, position: 'middle', side: 'any' },
      { name: 'صالة عائلية', type: 'living', area: 40, position: 'middle', side: 'any' },
    ],
  });
  const brief = { summary: 'خصوصية ومسار ضيوف واضح', assumptions: [], questions: [], unhandled: [], rooms: context.rooms };
  const result = deriveRequirements({ prompt: context.prompt, context, brief });
  assert.ok(result.priorities.find(item => item.key === 'privacy').score >= 80);
  assert.ok(result.relationships.some(item => item.from === 'المطبخ' && item.to === 'الطعام'));
  assert.ok(result.conflicts.some(item => /الأدوار الأخرى/.test(item)));
  assert.ok(result.conflicts.some(item => /صافي الغرف/.test(item)));
  assert.ok(result.questions.some(item => /مدخل/.test(item)));
});
