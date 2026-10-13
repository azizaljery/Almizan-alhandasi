import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultRooms, generateModel, normalizeRooms, validatePlot } from '../dist/planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { evaluateRequirementEvidence, renderRequirementEvidenceHTML } from '../dist/requirement-evidence.mjs';
import {
  TIER, TIER_LABELS, OUTCOME_LABELS, TIER_RULES, classifyClause, tierForTopic, splitClauses, isConditionClause,
  outcomeOfStatus, summarizeTiers, normalizeArabic,
} from '../dist/requirement-tiers.mjs';

const plot = {
  width: 30, length: 40, floors: 1, entry: 's',
  streets: { s: true, n: false, e: false, w: false },
  streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null,
};
const rooms = defaultRooms();
const model = generateModel(plot, rooms, { strategy: 'balanced' });
const find = (result, id) => result.rows.find(row => row.id === id);

test('the three tiers and three outcomes carry the exact client-facing Arabic labels', () => {
  assert.deepEqual(TIER_LABELS, { MANDATORY: 'إلزامي', IMPORTANT: 'تفضيل مهم', COSMETIC: 'خيار شكلي' });
  assert.deepEqual(OUTCOME_LABELS, { MET: 'مستوفى', NOT_MET: 'غير مستوفى', UNPROVABLE: 'غير قابل للإثبات' });
  for (const tier of Object.keys(TIER_LABELS)) assert.ok(TIER_RULES[tier].length > 20, 'every tier has a declared rule');
});

test('only a direct ENFORCED status is ever a met condition; a measurement without a verdict is unprovable', () => {
  assert.equal(outcomeOfStatus('ENFORCED'), 'MET');
  assert.equal(outcomeOfStatus('NOT_MET'), 'NOT_MET');
  for (const status of ['MEASURED', 'UNVERIFIED', 'UNSUPPORTED', 'anything-else', undefined]) {
    assert.equal(outcomeOfStatus(status), 'UNPROVABLE', String(status));
  }
});

test('explicit obligation wording makes a clause mandatory; plain wishes are important preferences', () => {
  assert.equal(classifyClause('يجب أن يكون مدخل الضيوف منفصلًا').tier, TIER.MANDATORY);
  assert.equal(classifyClause('لا بد أن يكون المطبخ قرب الصالة').tier, TIER.MANDATORY);
  assert.equal(classifyClause('ممنوع مرور الضيوف على غرف النوم').tier, TIER.MANDATORY);
  const wish = classifyClause('لا أريد مرور الضيوف على غرف النوم');
  assert.equal(wish.tier, TIER.IMPORTANT);
  assert.match(wish.basis, /بلا صيغة إلزام/);
  assert.equal(classifyClause('أريد غرفة هادئة بعيدًا عن الشارع').tier, TIER.IMPORTANT);
});

test('a negated obligation ("not necessary") and the ambiguous word "المطلوب" never promote a wish to mandatory', () => {
  assert.equal(classifyClause('مو لازم المجلس كبير').tier, TIER.IMPORTANT);
  assert.equal(classifyClause('لا يجب أن يكون المجلس كبيرًا').tier, TIER.IMPORTANT);
  assert.equal(classifyClause('المطلوب غرفة هادئة').tier, TIER.IMPORTANT);
});

test('purely visual remarks are cosmetic, but anything touching function stays an important preference', () => {
  assert.equal(classifyClause('أبي لون الواجهة بيج').tier, TIER.COSMETIC);
  assert.equal(classifyClause('هذا خيار شكلي: أبي قوسًا عند المدخل').tier, TIER.COSMETIC);
  assert.equal(classifyClause('ما أبغى نوافذ كبيرة على الواجهة الغربية').tier, TIER.IMPORTANT);
  // An obligation word beats a visual word.
  assert.equal(classifyClause('يجب أن يكون لون الواجهة فاتحًا').tier, TIER.MANDATORY);
});

test('topic tier: explicit obligation wins over a list choice, a choice is important, silence is null', () => {
  const topic = /ضيوف/;
  const choice = { basis: 'اختيار من القائمة' };
  assert.equal(tierForTopic({ clauses: ['لازم الضيوف لهم مدخل'], topic, choice }).tier, TIER.MANDATORY);
  assert.deepEqual(tierForTopic({ clauses: [], topic, choice }), { tier: TIER.IMPORTANT, basis: 'اختيار من القائمة' });
  assert.equal(tierForTopic({ clauses: ['أريد مطبخًا كبيرًا'], topic }), null);
});

test('free text is split into clauses and only wish-bearing clauses count as conditions', () => {
  const clauses = splitClauses('أريد مجلسين، و أبي مطبخ كبير. ما أبغى فناء\nالعائلة من ستة أفراد');
  assert.deepEqual(clauses.slice(0, 3), ['أريد مجلسين', 'أبي مطبخ كبير', 'ما أبغى فناء']);
  assert.equal(isConditionClause('ما أبغى فناء'), true);
  assert.equal(isConditionClause('العائلة من ستة أفراد'), false);
  assert.equal(normalizeArabic('إلزاميّة'), 'الزاميه');
});

test('hard form inputs are mandatory conditions with a declared basis, never a guessed tier', () => {
  const result = evaluateRequirementEvidence({ model, program: rooms, plot: { ...plot, maxBuiltArea: 600 } });
  for (const id of ['program', 'floors', 'built-area']) {
    const row = find(result, id);
    assert.equal(row.tier, TIER.MANDATORY, id);
    assert.match(row.tierBasis, /^مدخل صلب/);
  }
  assert.equal(find(result, 'program').outcome, 'MET');
});

test('the brief example: "لا أريد مرور الضيوف على غرف النوم" is classified, with its basis, and is never reported as met', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot, idea: 'لا أريد مرور الضيوف على غرف النوم، وأبغى مطبخ قريب من الطعام',
    discovery: { avoids: ['مرور الضيوف عبر خصوصية العائلة'] },
  });
  const privacy = find(result, 'privacy-routes');
  assert.equal(privacy.tier, TIER.IMPORTANT);
  assert.ok(privacy.tierBasis.length > 10);
  assert.notEqual(privacy.outcome, 'MET', 'shared-route evidence never proves visual privacy');
  const strict = evaluateRequirementEvidence({
    model, program: rooms, plot, idea: 'يجب فصل مسار الضيوف عن العائلة',
    discovery: { avoids: ['مرور الضيوف عبر خصوصية العائلة'] },
  });
  assert.equal(find(strict, 'privacy-routes').tier, TIER.MANDATORY);
  assert.match(find(strict, 'privacy-routes').tierBasis, /يجب/);
});

test('a privacy-route check nobody asked for stays an untiered engine check, not a client condition', () => {
  const result = evaluateRequirementEvidence({ model, program: rooms, plot });
  const privacy = find(result, 'privacy-routes');
  if (privacy) assert.equal(privacy.tier, undefined);
  for (const id of ['corridors', 'daylight', 'reg-jurisdiction', 'reg-coverage']) {
    const row = find(result, id);
    assert.ok(row, id);
    assert.equal(row.tier, undefined, id + ' is an engine/regulatory check, not a client condition');
    assert.equal(row.outcome, undefined);
  }
});

test('every "what I avoid" choice becomes its own tiered row; measurements stay unprovable without a threshold', () => {
  const avoids = ['الممرات الطويلة والمظلمة', 'مطبخ بعيد عن الطعام والخدمات', 'غرف نوم مكشوفة أو قريبة من الضيافة',
    'نوافذ كبيرة على شمس العصر الغربية', 'صدى الصوت في الصالات والمجالس'];
  const result = evaluateRequirementEvidence({ model, program: rooms, plot, discovery: { avoids } });
  for (const id of ['avoid-long-corridors', 'avoid-far-kitchen', 'avoid-exposed-bedrooms', 'west-sun', 'acoustics']) {
    const row = find(result, id);
    assert.ok(row, id);
    assert.equal(row.tier, TIER.IMPORTANT, id);
    assert.match(row.tierBasis, /ما أتجنّبه/);
    assert.equal(row.outcome, 'UNPROVABLE', id);
  }
  assert.match(find(result, 'avoid-long-corridors').evidence, /لا توجد عتبة طول/);
  assert.match(find(result, 'avoid-exposed-bedrooms').evidence, /لا يثبت حجب الرؤية/);
  // None of these choices may also appear a second time as a generic itemized row.
  assert.equal(result.rows.filter(row => row.id.startsWith('cond:')).length, 0);
});

test('shape picks are cosmetic; a liked shape that was not drawn is not met and an unsupported one is unprovable', () => {
  const shaped = { ...structuredClone(model), shape: 'rect' };
  const result = evaluateRequirementEvidence({
    model: shaped, program: rooms, plot,
    discovery: { likes: ['family_layout', 'courtyard_privacy'], rejects: ['concept_comparison', 'courtyard_privacy'] },
  });
  const liked = find(result, 'shape-like:family_layout');
  assert.equal(liked.tier, TIER.COSMETIC);
  assert.equal(liked.outcome, 'NOT_MET');
  assert.match(liked.evidence, /كتلة مستطيلة/);
  const unsupported = find(result, 'shape-like:courtyard_privacy');
  assert.equal(unsupported.tier, TIER.COSMETIC);
  assert.equal(unsupported.outcome, 'UNPROVABLE');
  assert.equal(unsupported.status, 'UNSUPPORTED');
  assert.equal(find(result, 'shape-reject:concept_comparison').outcome, 'MET');
  assert.equal(find(result, 'shape-reject:courtyard_privacy').outcome, 'MET');
  const same = evaluateRequirementEvidence({ model: { ...shaped, shape: 'u' }, program: rooms, plot, discovery: { likes: ['concept_comparison'], rejects: ['concept_comparison'] } });
  assert.equal(find(same, 'shape-like:concept_comparison').outcome, 'MET');
  assert.equal(find(same, 'shape-reject:concept_comparison').outcome, 'NOT_MET');
  // No recorded shape: neither a pass nor a fail can be claimed.
  const unknown = evaluateRequirementEvidence({ model, program: rooms, plot, discovery: { likes: ['family_layout'] } });
  assert.equal(find(unknown, 'shape-like:family_layout').outcome, 'UNPROVABLE');
});

test('shape rows follow the real shape of each integrated candidate, not a label', async () => {
  const actualPlot = validatePlot(plot);
  const program = normalizeRooms(rooms);
  const discovery = { likes: ['concept_comparison'], rejects: [], avoids: [], life: {} };
  const result = await runMultiEngineDesign({ plot: actualPlot, rooms: structuredClone(program), discovery });
  const u = result.models.find(item => item.shape === 'u');
  const rect = result.models.find(item => item.shape === 'rect');
  assert.ok(u && rect);
  assert.equal(find(evaluateRequirementEvidence({ model: u, program, plot: actualPlot, discovery }), 'shape-like:concept_comparison').outcome, 'MET');
  assert.equal(find(evaluateRequirementEvidence({ model: rect, program, plot: actualPlot, discovery }), 'shape-like:concept_comparison').outcome, 'NOT_MET');
});

test('lifestyle choices the model cannot measure are shown as important and unprovable, not silently dropped', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot, discovery: { life: { children: 'قريبون من الصالة', seniors: 'موجودون', future: 'مهمة' } },
  });
  for (const id of ['life-children', 'life-seniors', 'future']) {
    const row = find(result, id);
    assert.equal(row.tier, TIER.IMPORTANT, id);
    assert.equal(row.outcome, 'UNPROVABLE', id);
  }
  assert.equal(find(evaluateRequirementEvidence({ model, program: rooms, plot, discovery: { life: { seniors: 'غير موجودين' } } }), 'life-seniors'), undefined);
});

test('free-text wishes and brief constraints are itemized, classified once, and deduplicated against dedicated rows', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot,
    idea: 'أريد غرفة هادئة بعيدًا عن الشارع. يجب أن يكون في البيت مصلى. لا أريد فناء. العائلة من ستة أفراد',
    briefContext: { constraints: ['عزل صوتي خاص', 'تجنب: صدى الصوت في الصالات والمجالس', 'متطلب يحتاج معالجة هندسية: غرفة غسيل خارجية'] },
    discovery: { avoids: ['صدى الصوت في الصالات والمجالس'] },
  });
  const conditions = result.rows.filter(row => row.id.startsWith('cond:'));
  const titles = conditions.map(row => row.title);
  assert.ok(titles.some(title => title.includes('غرفة هادئة')));
  assert.ok(titles.some(title => title.includes('غرفة غسيل خارجية')));
  assert.ok(!titles.some(title => title.includes('العائلة من ستة أفراد')), 'context sentences are not conditions');
  assert.ok(!titles.some(title => title.includes('فناء')), 'no-courtyard has its own measured row');
  assert.ok(!titles.some(title => title.includes('صدى')), 'the acoustics choice is not repeated as a generic row');
  assert.equal(new Set(titles.map(normalizeArabic)).size, titles.length, 'no duplicate condition rows');
  const mosalla = conditions.find(row => row.title.includes('مصلى'));
  assert.equal(mosalla.tier, TIER.MANDATORY);
  assert.match(mosalla.tierBasis, /يجب/);
  for (const row of conditions) {
    assert.equal(row.status, 'UNVERIFIED');
    assert.equal(row.outcome, 'UNPROVABLE');
  }
  assert.ok(find(result, 'no-court'));
  assert.ok(find(result, 'acoustics'));
});

test('a room-count clause is covered by the mandatory program row, and a room list is never mistaken for a privacy request', () => {
  const avoids = ['مرور الضيوف عبر خصوصية العائلة'];
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot, discovery: { avoids },
    idea: 'أبي 4 غرف نوم ومجلسين وصالة عائلية. أبي مجلس كبير يطل على الحوش. لا أريد مرور الضيوف على غرف النوم',
  });
  const conditions = result.rows.filter(row => row.id.startsWith('cond:'));
  assert.ok(!conditions.some(row => row.title.includes('4 غرف نوم')), 'room counts are checked by the program row');
  assert.ok(conditions.some(row => row.title.includes('مجلس كبير')), 'a different wish about a room is its own condition');
  assert.ok(!conditions.some(row => row.title.includes('مرور الضيوف')), 'the privacy wish is covered by its measured row');
  assert.ok(find(result, 'privacy-routes').tier);
  // Without the privacy wording, a bedroom+majlis list yields no privacy tier from the text.
  const plain = evaluateRequirementEvidence({ model, program: rooms, plot, idea: 'أبي غرفة نوم ومجلس كبير' });
  assert.equal(find(plain, 'privacy-routes')?.tier, undefined);
});

test('a chosen avoid with no row to measure it is still shown as its own unprovable condition, never dropped', () => {
  const noGuests = structuredClone(model);
  noGuests.rooms = noGuests.rooms.filter(room => room.type !== 'majlis');
  const result = evaluateRequirementEvidence({
    model: noGuests, program: undefined, plot,
    briefContext: { constraints: ['تجنب: مرور الضيوف عبر خصوصية العائلة'] },
    discovery: { avoids: ['مرور الضيوف عبر خصوصية العائلة'] },
  });
  assert.equal(find(result, 'privacy-routes'), undefined);
  assert.ok(result.rows.some(row => row.id.startsWith('cond:') && row.title.includes('مرور الضيوف')));
});

test('summary counts add up and match the rows; untiered checks are counted apart', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot, idea: 'يجب مصلى. أريد غرفة هادئة', discovery: { avoids: ['الممرات الطويلة والمظلمة'], likes: ['family_layout'] },
  });
  const tiered = result.rows.filter(row => row.tier);
  assert.equal(result.outcomes.total, tiered.length);
  assert.equal(result.otherChecks, result.rows.length - tiered.length);
  for (const tier of Object.keys(TIER_LABELS)) {
    const mine = tiered.filter(row => row.tier === tier);
    assert.equal(result.tiers[tier].total, mine.length);
    for (const outcome of Object.keys(OUTCOME_LABELS)) assert.equal(result.tiers[tier][outcome], mine.filter(row => row.outcome === outcome).length);
  }
  assert.deepEqual(summarizeTiers(result.rows).tiers, result.tiers);
  // The legacy per-status counts used by the existing summary strip are untouched.
  assert.equal(Object.values(result.counts).reduce((a, b) => a + b, 0), result.rows.length);
});

test('no tiered row is ever "met" unless the evidence status is ENFORCED', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot, idea: 'لا أريد فناء ولا مسبح. أريد عزل صوتي وتوسع مستقبلي',
    discovery: { avoids: ['نوافذ كبيرة على شمس العصر الغربية', 'مطبخ بعيد عن الطعام والخدمات'], life: { future: 'مهمة' }, likes: ['staggered_wings'] },
  });
  for (const row of result.rows.filter(item => item.tier)) {
    assert.equal(row.outcome === 'MET', row.status === 'ENFORCED', row.id);
  }
});

test('the evidence panel groups rows by tier, shows the summary table, the declared rules and each row\'s basis (RTL)', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot, idea: 'يجب مصلى. أريد غرفة هادئة. أبي لون الواجهة بيج',
    discovery: { avoids: ['صدى الصوت في الصالات والمجالس'] },
  });
  const html = renderRequirementEvidenceHTML(result);
  assert.match(html, /<section class="tier-board" dir="rtl"/);
  assert.match(html, /<th scope="col">التصنيف<\/th><th scope="col">مستوفى<\/th><th scope="col">غير مستوفى<\/th><th scope="col">غير قابل للإثبات<\/th>/);
  assert.ok(html.indexOf('data-tier="MANDATORY"') < html.indexOf('data-tier="IMPORTANT"'));
  for (const tier of Object.keys(TIER_LABELS)) assert.ok(html.includes('>' + TIER_LABELS[tier]), tier);
  assert.ok(html.includes('كيف صُنّفت شروطك؟'));
  assert.ok(html.includes(TIER_RULES.MANDATORY.split('«')[0].trim().slice(0, 20)));
  assert.match(html, /سبب التصنيف «إلزامي»/);
  assert.match(html, /data-outcome="UNPROVABLE"/);
  assert.match(html, /data-outcome="MET"/);
  assert.match(html, /فحوص هندسية ونظامية عامة/);
  assert.ok(!html.includes('undefined'));
});

test('rows within a tier list unmet first, then unprovable, then met', () => {
  const altered = structuredClone(model);
  altered.rooms[0].w /= 2;
  const result = evaluateRequirementEvidence({ model: altered, program: rooms, plot, idea: 'يجب مصلى' });
  const html = renderRequirementEvidenceHTML(result);
  const from = html.indexOf('<section class="tier-group" data-tier="MANDATORY"');
  const to = html.indexOf('<section class="tier-group" data-tier="IMPORTANT"');
  assert.ok(from > 0);
  const mandatory = html.slice(from, to > from ? to : undefined);
  const order = [...mandatory.matchAll(/data-outcome="(MET|NOT_MET|UNPROVABLE)"/g)].map(match => match[1]);
  const rank = { NOT_MET: 0, UNPROVABLE: 1, MET: 2 };
  assert.deepEqual(order, [...order].sort((a, b) => rank[a] - rank[b]));
  assert.equal(order[0], 'NOT_MET');
});

test('client wording and basis are HTML-escaped in the tiered view', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot, idea: 'يجب <img src=x onerror=alert(1)> في البيت',
  });
  const html = renderRequirementEvidenceHTML(result);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('rows without a tier (the regulatory panel) keep the original flat layout with no tier chrome', () => {
  const html = renderRequirementEvidenceHTML({ rows: [
    { id: 'reg-x', title: 'ارتداد', status: 'UNVERIFIED', evidence: 'لم يتم التحقق', source: 'لا يوجد', category: 'الاشتراطات النظامية' },
  ] });
  assert.ok(html.startsWith('<article class="requirement-row" data-evidence-status="UNVERIFIED">'));
  assert.ok(!html.includes('tier-board'));
  assert.ok(!html.includes('data-tier'));
  assert.equal(renderRequirementEvidenceHTML(null), '');
});

test('auditing never mutates the model or the discovery/brief inputs', () => {
  const before = JSON.stringify(model);
  const discovery = { likes: ['family_layout'], rejects: [], avoids: ['الممرات الطويلة والمظلمة'], life: { children: 'جناح هادئ' } };
  const briefContext = { constraints: ['عزل صوتي خاص'] };
  const snapshot = JSON.stringify({ discovery, briefContext });
  evaluateRequirementEvidence({ model, program: rooms, plot, idea: 'يجب مصلى', discovery, briefContext });
  assert.equal(JSON.stringify(model), before);
  assert.equal(JSON.stringify({ discovery, briefContext }), snapshot);
});

test('the tier layer is wired through the existing module graph without touching protected or in-flight files', () => {
  const evidence = readFileSync(new URL('../dist/requirement-evidence.mjs', import.meta.url), 'utf8');
  assert.ok(evidence.includes("from './requirement-tiers.mjs'"));
  const css = readFileSync(new URL('../dist/requirement-evidence.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.tier-board') && css.includes('.tier-group'));
  const tiers = readFileSync(new URL('../dist/requirement-tiers.mjs', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\s/m.test(tiers), 'the tier module is pure and import-free');
});
