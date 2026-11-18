import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { serialize } from '../dist/draw/doc.mjs';
import { sessionForDocument } from '../dist/project-context.mjs';
import { designJson } from '../dist/pack/engineer-pack.mjs';

test('matching context survives true-north handoff but not a different customer drawing or an opening edit', () => {
  const doc = sampleVilla(), session = { v: 1, current: 0, input: { idea: 'private customer brief', land: { width: 20, length: 30 } }, designs: [{ doc: serialize(doc) }] };
  assert.equal(sessionForDocument({ ...doc, north: 45 }, session), session);
  const changed = structuredClone(doc); changed.openings[0].at += .1;
  assert.equal(sessionForDocument(changed, session), null);
  const another = structuredClone(doc); another.title = 'عميل آخر';
  assert.equal(sessionForDocument(another, session), null);
  const exported = designJson({ doc: another, session });
  assert.equal(exported.program, null); assert.equal(exported.session, null);
  assert.ok(!JSON.stringify(exported).includes('private customer brief'));
  assert.equal(session.input.idea, 'private customer brief');
});
