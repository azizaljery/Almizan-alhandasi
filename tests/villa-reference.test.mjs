import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../dist/villa-layout.mjs';
import { REFERENCES } from '../dist/villa-ref-library.mjs';
import { generateReferenceDesigns, referenceCandidates, engineMode, ENGINE_SWITCH, sameDesign } from '../dist/villa-reference.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { designSignature, signatureSimilarity } from '../dist/design-signature.mjs';
import { digestDoc as analyzeDoc } from '../dist/draw/digest.mjs';

const TXT = '3 غرف نوم ومجلس رجال ومجلس نساء ومطبخ وصالة وصالة طعام';
const args = (w, l, f, mode) => { const land = { width: w, length: l, floors: f, streets: ['s'], entries: ['s'] }, b = buildBrief(TXT, { land }); return { land, counts: b.counts, requirements: { ...b.requirements, tweaks: { ...(b.requirements.tweaks || {}), ...(mode ? { engine: mode } : {}) } }, keep: 5 }; };

test('المفتاح: القديم افتراضيًا', () => { assert.equal(ENGINE_SWITCH.mode, 'legacy'); assert.equal(engineMode({}), 'legacy'); assert.equal(engineMode({ tweaks: { engine: 'hybrid' } }), 'hybrid'); });
test('المكتبة: مراجع بنيوية بمعرفات وخيارات فريدة', () => {
  assert.ok(REFERENCES.length >= 9);
  assert.equal(new Set(REFERENCES.map(r => r.id)).size, REFERENCES.length);
  for (const r of REFERENCES) { assert.ok(r.variants.length >= 2, r.id); assert.ok(r.summary && r.shape, r.id); }
});
test('المرجعي: برنامج العميل محفوظ والصالة ضمن الحد', () => {
  const r = generateReferenceDesigns({ ...args(25, 30, 1), floors: 1 }, V.referenceKit());
  assert.ok(r.designs.length >= 2);
  for (const d of r.designs) {
    assert.equal(d.fails, 0);
    const dg = analyzeDoc(d.doc), rooms = dg.levels.flatMap(l => l.rooms);
    assert.ok(rooms.filter(x => x.type === 'bedroom' || x.type === 'master').length >= 3);
    assert.ok(rooms.some(x => x.type === 'majlis'));
    const hall = rooms.find(x => x.type === 'living' && /^الصالة$/.test(x.name)); if (hall) assert.ok(hall.area <= 36, 'hall ' + hall.area);
    assert.equal(dg.levels.flatMap(l => l.circulation.unreachable).length, 0);
  }
});
test('المرجعي: تنوع بنيوي حقيقي بين البدائل', () => {
  const r = generateReferenceDesigns({ ...args(25, 30, 1), floors: 1 }, V.referenceKit());
  assert.ok(new Set(r.designs.map(d => d.refId)).size >= 3);
  const s = r.designs.map(d => designSignature(d.doc));
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) assert.equal(signatureSimilarity(s[i], s[j]).copy, false);
});
test('البصمة: تصميمان مرجعيان من مرجعين مختلفين لا يتجاوزان حد النسخة، والتصميم نسخة من نفسه', () => {
  const d = generateReferenceDesigns({ ...args(25, 30, 1), floors: 1 }, V.referenceKit()).designs;
  assert.equal(sameDesign(d[0].doc, d[0].doc).copy, true);
  for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) assert.equal(sameDesign(d[i].doc, d[j].doc).copy, false);
});
test('دورين: بدائل بلا مياه غير متراصة تتجاوز الحد وسلم موجود', () => {
  const r = generateReferenceDesigns({ ...args(25, 30, 2), floors: 2 }, V.referenceKit());
  for (const d of r.designs) assert.equal(analyzeDoc(d.doc).levels.length, 2);
});
test('الهجين: يرجع إلى القديم حين لا مرجع، وخطأ القديم يُمرَّر كما هو', () => {
  const r = V.generateVillaDesigns(args(15, 25, 1, 'hybrid')); assert.ok(r.designs.length >= 1); assert.ok(r.designs.every(d => !d.refId));
  assert.throws(() => V.generateVillaDesigns(args(10, 22, 1, 'hybrid')), e => e.code === 'VILLA_NO_FIT');
});
test('الوضع المرجعي وحده يرمي VILLA_NO_FIT حين لا مرجع', () => {
  assert.throws(() => V.generateVillaDesigns(args(10, 22, 1, 'reference')), e => e.code === 'VILLA_NO_FIT');
});
test('الافتراضي لا يمس المولّد القديم', () => {
  const r = V.generateVillaDesigns(args(25, 30, 1));
  assert.ok(r.designs.every(d => !d.refId));
});
test('البحث المرجعي لا يعيد مرشحين بلا فحص', () => {
  const k = V.referenceKit(), program = k.buildProgram(args(25, 30, 1).counts, args(25, 30, 1).requirements); program.entry = 's';
  const { candidates } = referenceCandidates({ program, W: 21.7, D: 25.2, floors: 1 });
  assert.ok(candidates.length > 0);
  for (const c of candidates) assert.ok(c.metrics.every(m => m.circShare <= 0.38));
});
