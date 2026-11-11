// التنقل بين مراحل المسار: الروابط في الوضعين (محلي بـ ‎.html‎ وإنتاج بلا امتداد)، ما بُلغ وما لم يُبلغ، وحفظ حوار شرعاء وتصاميم العميل عند الرجوع.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { STAGES, stageStates, readJourney, reachedIndex, markReached, pageKey, samePage, SESSION_KEY, HOME_KEY, REACHED_KEY, STUDIO_DOC_KEY } from '../dist/journey-nav.mjs';
import { STAGES as ASSISTANT_STAGES } from '../dist/shara-assistant.mjs';
import { SharaSession, normalizeLand, interpretFree } from '../dist/home-flow.mjs';
import { carryOver, sameLand } from '../dist/design-session.mjs';
import { OPS, plain } from '../dist/design-worker.mjs';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; };
const ses = (over = {}) => JSON.stringify({ v: 1, createdAt: 111, current: 0, approved: null, designs: [{ doc: '{}' }], input: { land: { length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 1 } }, ...over });
const ids = (j, cur, f) => stageStates(j, cur).filter(f).map(s => s.id);

test('المراحل السبع بترتيبها، ومصدرها واحد لشريط الخطوات ولشرعاء المرافقة', () => {
  assert.deepEqual(STAGES.map(s => s.id), ['land', 'shara', 'design', 'exterior', 'view3d', 'sheets', 'boq']);
  assert.equal(ASSISTANT_STAGES, STAGES);
});

test('كل رابط مرحلة يصل إلى ملف موجود من أي صفحة، في الوضع المحلي (‎.html‎) وفي الإنتاج (بلا امتداد، 307 يحفظ الـ hash)', () => {
  const local = ['home.html', 'home.html#shara', 'design.html', 'design.html#exterior', 'view3d.html', 'final.html', 'final.html#qty'].map(p => 'https://x.test/' + p);
  const prod = ['', 'home', 'home#shara', 'design', 'design#exterior', 'view3d', 'final', 'final#qty'].map(p => 'https://x.test/' + p);
  for (const here of [...local, ...prod]) for (const s of STAGES) {
    const u = new URL(s.href, here);
    assert.equal(u.origin, 'https://x.test'); assert.match(u.pathname, /^\/[a-z0-9]+\.html$/, `${s.id} من ${here}`);
    assert.ok(existsSync('dist' + u.pathname), `${u.pathname} موجود`);
    // الإنتاج يحذف ‎.html‎: المسار الناتج يطابق الصفحة المقصودة والـ hash يبقى في المتصفح
    assert.equal(pageKey(u.pathname), pageKey(u.pathname.replace(/\.html$/, '')));
    assert.equal(u.hash, new URL(s.href, 'https://x.test/').hash);
  }
  assert.equal(new URL(STAGES[0].href, 'https://x.test/').hash, '#land'); assert.equal(new URL(STAGES[1].href, 'https://x.test/').hash, '#shara');
});

test('pageKey/samePage: ‎/design.html‎ و ‎/design‎ صفحة واحدة، و«/» و ‎/home‎ و ‎/home.html‎ واحدة', () => {
  assert.equal(pageKey('/design.html'), pageKey('/design')); assert.equal(pageKey('/'), '/'); assert.equal(pageKey('/home'), '/'); assert.equal(pageKey('/home.html'), '/');
  assert.notEqual(pageKey('/design'), pageKey('/final'));
  assert.ok(samePage('./design.html#exterior', 'https://x.test/design')); assert.ok(samePage('./home.html#land', 'https://x.test/')); assert.ok(samePage('./home.html#shara', 'https://x.test/home#land'));
  assert.ok(!samePage('./view3d.html', 'https://x.test/design.html')); assert.ok(samePage('./final.html#qty', 'https://x.test/final.html#plan0'));
});

test('ما لم يُبلغ معطّل وله سبب؛ ما بُلغ رابط؛ الحالية بلا رابط', () => {
  const none = readJourney(mem());
  assert.deepEqual(ids(none, 'land', s => s.reached), ['land']);
  for (const s of stageStates(none, 'land')) if (!s.reached) assert.ok(s.reason.length > 10, s.id);
  const landOnly = readJourney(mem({ [HOME_KEY]: JSON.stringify({ confirmedLand: { length: 30, width: 20 } }) }));
  assert.deepEqual(ids(landOnly, 'shara', s => s.reached), ['land', 'shara']);
  const designed = readJourney(mem({ [SESSION_KEY]: ses() }));
  assert.deepEqual(ids(designed, 'design', s => s.reached), ['land', 'shara', 'design']);
  assert.deepEqual(ids(designed, 'shara', s => s.reached), ['land', 'shara', 'design'], 'من شرعاء: «التصميم» رابط عودة');
  assert.deepEqual(ids(designed, 'shara', s => s.current), ['shara']);
  assert.match(stageStates(designed, 'design').find(s => s.id === 'exterior').reason, /أعجبني/);
});

test('علامة البلوغ: لا تنقص داخل الجلسة، وتُصفَّر مع جلسة جديدة، وما بعد التصميم يحتاج اعتمادًا ومخططًا محفوظًا', () => {
  const store = mem({ [SESSION_KEY]: ses({ approved: 0 }), [STUDIO_DOC_KEY]: '{}' });
  markReached(store, 'design'); assert.equal(STAGES[reachedIndex(readJourney(store))].id, 'view3d', 'جلسة معتمدة سابقة للعلامة: بلغت العرض');
  markReached(store, 'boq'); assert.equal(STAGES[reachedIndex(readJourney(store))].id, 'boq');
  markReached(store, 'design'); assert.equal(STAGES[reachedIndex(readJourney(store))].id, 'boq', 'الرجوع لا ينقص ما بُلغ');
  assert.deepEqual(ids(readJourney(store), 'shara', s => s.reached).length, 7, 'من شرعاء: كل المراحل روابط');
  store.setItem(SESSION_KEY, ses({ createdAt: 222 })); // توليد جديد
  assert.equal(STAGES[reachedIndex(readJourney(store))].id, 'design', 'جلسة جديدة غير معتمدة تبدأ من التصميم');
  const s2 = mem({ [SESSION_KEY]: ses({ approved: 0 }), [REACHED_KEY]: JSON.stringify({ sid: 111, max: 6 }) });
  assert.equal(STAGES[reachedIndex(readJourney(s2))].id, 'exterior', 'بلا مخطط معتمد محفوظ لا يُفتح العرض');
  const s3 = mem({ [SESSION_KEY]: ses({ approved: null }), [STUDIO_DOC_KEY]: '{}' }); markReached(s3, 'design');
  assert.deepEqual(ids(readJourney(s3), 'design', s => !s.reached), ['exterior', 'view3d', 'sheets', 'boq']);
  assert.equal(markReached(mem(), 'design'), false, 'بلا جلسة لا تُسجَّل علامة');
});

test('حوار شرعاء يُحفظ ويُستعاد كما كان: نفس الأعداد والمتطلبات، ويكمل من البرنامج وزر التوليد', async () => {
  const { land } = normalizeLand({ length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 1 });
  const S = new SharaSession({ land }); S.start(); S.answer('mode', 'free'); S.answer('free', await interpretFree('ابي فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ'));
  S.answer('program', { op: 'inc', id: S.program()[0].id });
  const data = JSON.parse(JSON.stringify(S)), R = SharaSession.restore(data);
  assert.ok(R); assert.deepEqual(R.counts, S.counts); assert.deepEqual(JSON.parse(JSON.stringify(R.requirements)), JSON.parse(JSON.stringify(S.requirements)));
  assert.equal(R.idea, S.idea); assert.deepEqual(R.discovery(), S.discovery()); assert.deepEqual(R.rooms(), S.rooms());
  assert.deepEqual(R.resume().map(m => m.kind), ['program', 'generate']);
  // وسط الطريق: اختار «بحرية» ولم يكتب بعد
  const H = new SharaSession({ land }); H.start(); H.answer('mode', 'free');
  assert.deepEqual(SharaSession.restore(JSON.parse(JSON.stringify(H))).resume().map(m => m.kind), ['text']);
  const G = new SharaSession({ land }); G.start(); G.answer('mode', 'guided');
  assert.deepEqual(SharaSession.restore(JSON.parse(JSON.stringify(G))).resume().map(m => m.kind), ['ask']);
  assert.equal(SharaSession.restore(null), null); assert.equal(SharaSession.restore({ v: 2, texts: [] }), null);
  // تغيّر الأرض والحوار قائم: يبقى الكلام ويُعاد الحساب
  const land2 = normalizeLand({ length: 40, width: 25, streets: ['s'], entries: ['s'], floors: 1 }).land; R.setLand(land2); assert.equal(R.land, land2); assert.equal(R.texts.length, S.texts.length);
});

test('«عدّل طلبي وأعد التوليد»: التصاميم السابقة تبقى بعد الجديدة ما دامت الأرض نفسها، وتُستبدل إن تغيّرت', () => {
  const land = { length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 1 };
  const prev = { v: 1, input: { land }, designs: [{ doc: 'A', pat: 'p1' }, { doc: 'B', pat: 'p2' }], seen: [['x']], seenPats: ['p1'] };
  const next = { v: 1, input: { land: { ...land, floors: 2 } }, designs: [{ doc: 'N1', pat: 'p3' }, { doc: 'A', pat: 'p1' }], seen: [['y']], current: 0 };
  const out = carryOver(next, prev);
  assert.equal(out.kept, 1); assert.deepEqual(out.session.designs.map(d => d.doc), ['N1', 'A', 'B']); assert.equal(out.session.current, 0);
  assert.deepEqual(next.designs.map(d => d.doc), ['N1', 'A'], 'لا يغيّر الأصل'); assert.ok(out.session.seenPats.includes('p2'));
  assert.ok(sameLand(land, { ...land, floors: 2 })); assert.ok(!sameLand(land, { ...land, width: 21 }));
  assert.equal(carryOver({ ...next, input: { land: { ...land, width: 25 } } }, prev).kept, 0, 'أرض مختلفة: لا تُحمَل السابقة');
  assert.equal(carryOver(next, null).kept, 0);
  const many = { ...prev, designs: Array.from({ length: 20 }, (_, i) => ({ doc: 'D' + i })) };
  assert.equal(carryOver(next, many).session.designs.length, 15, 'لا يتجاوز حد الجلسة');
});

test('عامل التوليد: الدوال نفسها (نفس المدخلات ← نفس الجلسة)، والنتيجة بيانات صِرفة', async () => {
  const { land } = normalizeLand({ length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 1 });
  const S = new SharaSession({ land }); S.start(); S.answer('mode', 'free'); S.answer('free', await interpretFree('بيت دور واحد 3 غرف نوم ومجلس وصالة ومطبخ'));
  const input = { land, rooms: S.rooms(), discovery: S.discovery(), idea: S.idea, counts: S.counts, requirements: S.requirements };
  const args = { land, counts: S.counts, requirements: S.requirements, discovery: S.discovery(), idea: S.idea };
  const a = plain(await OPS.generate({ input, sessionArgs: args })), b = plain(await OPS.generate({ input, sessionArgs: args }));
  delete a.session.createdAt; delete b.session.createdAt;
  assert.deepEqual(a.session, b.session); assert.ok(a.session.designs.length >= 1); assert.ok(a.handoff.doc && Array.isArray(a.handoff.notes));
  assert.equal(await OPS.ping(), 'ready');
});

test('الصفحات: شريط الخطوات في الرئيسية وصفحات المسار، وبطاقة العودة، والتوليد عبر العامل', () => {
  const home = readFileSync('dist/home.html', 'utf8'), js = readFileSync('dist/home.mjs', 'utf8');
  assert.equal((home.match(/<ol class="steps"/g) || []).length, 2, 'شريط الخطوات في مرحلتي الأرض وشرعاء');
  assert.ok(home.includes('id="resumeDesign"') && home.includes('href="./design.html"'));
  for (const t of ['العودة إلى تصميمي', 'عدّل طلبي وأعد التوليد', "addEventListener('popstate', route)", 'generateInWorker', 'AI_TIMEOUT_MS']) assert.ok(js.includes(t), t);
  for (const f of ['design.html', 'view3d.html', 'final.html']) assert.ok(readFileSync('dist/' + f, 'utf8').includes('<ol class="steps"'), f);
  const panel = readFileSync('dist/shara-panel.mjs', 'utf8'); assert.ok(panel.includes('mountSteps') && panel.includes('redesignInWorker'));
  const design = readFileSync('dist/design.mjs', 'utf8'); for (const t of ['redesignInWorker', 'fixInWorker', 'mergeInWorker', "addEventListener('popstate', syncHash)"]) assert.ok(design.includes(t), t);
  assert.ok(readFileSync('dist/design-client.mjs', 'utf8').includes("new URL('./design-worker.mjs', import.meta.url)"));
});
