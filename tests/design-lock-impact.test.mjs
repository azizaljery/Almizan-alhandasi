import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTS, runProject, buildProject } from './helpers/lock-projects.mjs';
import { verifyLocks, lockableParts, LOCK_TOL } from '../dist/design-lock.mjs';
import { auditDoc, REJECT_LABEL } from '../dist/design-impact.mjs';
import { proposeChange, approveProposal, lockParts, unlockPart } from '../dist/design-lock-edit.mjs';
import { parseDoc, applyCommand } from '../dist/draw/doc.mjs';
import { redesign } from '../dist/design-session.mjs';
import { evaluatePrivacy, PRIVACY_KINDS } from '../dist/privacy-geometry.mjs';
import { privacyRequests } from '../dist/requirements.mjs';

test('الأقفال تُحفظ حرفيًا في المشاريع الخمسة أو يُطلب إذن صريح (لا تغيير صامت)', { timeout: 240000 }, async () => {
  for (const p of PROJECTS) {
    const r = await runProject(p);
    assert.equal(r.result.status, p.expect, `${p.id}: ${r.result.status}`);
    assert.ok(r.session.locks.length >= 2, `${p.id}: لا أقفال`);
    if (r.result.status === 'applied') {
      assert.equal(r.lockAfter.ok, true, `${p.id}: خُرق قفل بلا إذن`);
      assert.equal(r.result.report.mandatoryRegressions?.length || 0, 0, `${p.id}: تراجع إلزامي`);
      const au = auditDoc(parseDoc(r.after.designs.at(-1).doc), { requirements: r.after.requirements, land: p.land });
      assert.ok(au, `${p.id}: المدقق المستقل`);
    } else {
      assert.ok(r.result.proposal.changes.length > 0 && r.result.proposal.reason, `${p.id}: طلب الإذن بلا أسباب`);
      assert.equal(r.result.report.lock.ok, false);
      assert.throws(() => approveProposal(r.session, r.result, { accept: [] }), /./, 'الموافقة الناقصة لا تمرّ');
      assert.equal(verifyLocks(parseDoc(r.approved.designs.at(-1).doc), r.approved.locks).ok, true);
    }
    // التصميم الأصلي لم يُلمس
    assert.equal(r.session.designs.length, 1);
  }
});

test('تقرير الأثر: أعمدة الجدول وكلفة «غير متحقق» بلا أسعار معتمدة', { timeout: 120000 }, async () => {
  const r = await runProject(PROJECTS[0]), rep = r.result.report;
  for (const row of rep.table) for (const k of ['requirement', 'before', 'after', 'status', 'evidence']) assert.ok(k in row, k);
  assert.ok(rep.rooms.length > 0 && Array.isArray(rep.unchanged));
  assert.ok(!rep.quantities.cost || /غير متحقق|null/.test(JSON.stringify(rep.quantities.cost)) || rep.quantities.cost.total == null);
});

test('قفل: تحريك جدار غرفة مقفلة يُكتشف بالأرقام، وفك القفل يرفعه', { timeout: 120000 }, async () => {
  const { session, doc } = await buildProject(PROJECTS[2]);
  const k = session.locks[0];
  assert.equal(verifyLocks(doc, session.locks).ok, true);
  const { analyzeDoc } = await import('../dist/draw/digest.mjs');
  const room = analyzeDoc(doc).levels.flatMap(l => l.rooms).find(r => r.name === k.name);
  const wid = room.edges.find(e => !e.exterior).wallIds[0], w = doc.walls.find(x => x.id === wid);
  const dx = Math.abs(w.b.x - w.a.x) < 1e-6 ? 0.5 : 0, dy = dx ? 0 : 0.5;
  const moved = applyCommand(doc, { type: 'update', id: w.id, patch: { a: { x: w.a.x + dx, y: w.a.y + dy }, b: { x: w.b.x + dx, y: w.b.y + dy } } });
  const v = verifyLocks(moved.doc, session.locks);
  assert.equal(v.ok, false, 'تحريك جدار مقفل لم يُكتشف');
  assert.ok(v.violated.some(x => x.violations.length && /\d/.test(x.violations[0].detail)), 'التفصيل بلا أرقام');
  const s2 = unlockPart(session, k.key);
  assert.equal(s2.locks.length, session.locks.length - 1);
});

test('الخصوصية الهندسية: كل نوع يعيد PASS/FAIL/NOT_EVALUATED بتفصيل، وقيد «يجب» يدخل الدفتر', { timeout: 120000 }, async () => {
  const { doc } = await buildProject(PROJECTS[1]);
  const rows = evaluatePrivacy(doc);
  assert.equal(rows.length, PRIVACY_KINDS.length);
  for (const x of rows) { assert.ok(['PASS', 'FAIL', 'NOT_EVALUATED'].includes(x.status)); assert.ok(x.detail); }
  const rq = privacyRequests('لازم ممرات غير مظلمة', {});
  assert.ok(rq && JSON.stringify(rq).includes('"must":true'));
  const soft = privacyRequests('ممرات غير مظلمة', {});
  assert.ok(!soft || !JSON.stringify(soft).includes('"must":true'));
});
