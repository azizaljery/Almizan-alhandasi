import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractExplicitGeometryConstraints, filterShapesByExplicitConstraints, verifyGeometryAgainstExplicitConstraints } from '../dist/design-constraints.mjs';
import { requestedDesignShapes } from '../dist/multi-engine.mjs';
import { composeDesignConversation } from '../dist/design-dialog.mjs';

test('explicit requests without a courtyard exclude the U shape', () => {
  for (const idea of ['بدون فناء', 'ما أبي فناء', 'لا أريد باحة داخلية', 'no courtyard']) {
    const constraint = extractExplicitGeometryConstraints({ idea });
    assert.equal(constraint.noCourtyard, true, idea);
    const filtered = filterShapesByExplicitConstraints(['rect', 'l', 'u'], constraint);
    assert.deepEqual(filtered.allowed, ['rect', 'l']);
    assert.equal(filtered.excluded[0].code, 'EXPLICIT_NO_COURTYARD');
  }
});

test('current planner honors no-courtyard intent while preserving non-U alternatives', () => {
  const shapes = requestedDesignShapes({ idea: 'أريد بيتًا بدون فناء', discovery: { likes: ['concept_comparison'], rejects: [], avoids: [], life: {} } });
  assert.ok(shapes.length > 0);
  assert.ok(!shapes.includes('u'));
});

test('a positive U request and a no-courtyard request conflict instead of silently falling back', () => {
  assert.throws(() => requestedDesignShapes({ idea: 'أريد بيتًا على شكل U لكن بدون فناء' }), /طلبت شكل U مع فناء/);
});

test('a later explicit courtyard request supersedes the earlier no-courtyard request', () => {
  const idea = composeDesignConversation('بدون فناء', [], 'أريد فناء');
  assert.equal(extractExplicitGeometryConstraints({ idea }).noCourtyard, false);
});

test('actual geometry verification fails closed on unverifiable or courtyard geometry', () => {
  const constraints = { noCourtyard: true };
  assert.equal(verifyGeometryAgainstExplicitConstraints([{ shape: 'l', courtyards: [] }], constraints).pass, true);
  const invalid = verifyGeometryAgainstExplicitConstraints([{ shape: 'u', courtyards: [{ w: 2, h: 2 }] }], constraints);
  assert.equal(invalid.pass, false);
  assert.equal(invalid.violations[0].code, 'EXPLICIT_NO_COURTYARD_VIOLATED');
  assert.equal(verifyGeometryAgainstExplicitConstraints([{ shape: 'rect' }], constraints).pass, false);
});
