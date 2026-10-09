import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const simpleStudio = readFileSync(new URL('../dist/studio-simple.mjs', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('../dist/studio-workspace.css', import.meta.url), 'utf8');

test('cinematic entry routes into the conversation-first studio while retaining the six-stage workspace', () => {
  const cinematic = readFileSync(new URL('../dist/cinematic-entry.mjs', import.meta.url), 'utf8');
  assert.match(html, /class="app show" id="app"/);
  assert.match(html, /class="panel on" id="panel-rating"/);
  assert.match(html, /data-tab="rating"><span class="step-number">01<\/span>/);
  assert.match(html, /data-tab="brief"><span class="step-number">02<\/span>/);
  assert.match(html, /id="intro"/);
  assert.match(html, /id="cinematicSkip"/);
  assert.match(html, /id="studioSimple"/);
  assert.equal(/id="journey"|src="\.\/portal.mjs"/.test(html), false);
  assert.match(app, /switchTab\('rating'\)/);
  assert.match(app, /switchTab\('design'\)/);
  assert.match(cinematic, /\[data-tab="design"\]/);
  assert.match(html, /id="archivePanel"/);
  assert.match(html, /id="landSurveyEditor"/);
  assert.match(html, /id="studioAdvancedToggle"/);
  assert.match(html, /id="roof" type="checkbox" checked/);
  assert.match(html, /2026\.10\.10-studio-2/);
});

test('every workspace section has a navigation destination connected to the actual application', () => {
  for(const key of ['brief','rating','design','result','review','boq']){assert.match(html,new RegExp(`data-tab="${key}"`));assert.match(html,new RegExp(`id="panel-${key}"`));}
  assert.match(app, /all\('\[data-tab\]'\).*?switchTab\(button.dataset.tab\)/);
  assert.match(app, /all\('\.panel'\)\.forEach\(panel => panel\.classList\.toggle\('on', panel\.id === 'panel-' \+ tab\)\)/);
});

test('results keep an obvious route back to the existing conversation without starting generation', () => {
  const result = html.slice(html.indexOf('id="panel-result"'), html.indexOf('id="panel-review"'));
  assert.ok(result.indexOf('id="out"') < result.indexOf('id="studioContinueConversation"'));
  assert.match(result, /متابعة الحوار وتعديل التصميم/);
  assert.match(workspaceCss, /studio-conversation-return/);
  const returnHandler = simpleStudio.slice(simpleStudio.indexOf("$('studioContinueConversation')"), simpleStudio.indexOf("$('studioAdvancedToggle')"));
  assert.match(returnHandler, /returnToConversation\(document\)/);
  assert.doesNotMatch(returnHandler, /request\(|drawProposal|generate\(/);
  const showResults = app.slice(app.indexOf('function showResults()'), app.indexOf('function refreshGemini()'));
  assert.match(showResults, /\$\('out'\)\.style\.display = 'block'/);
});

test('local project download accurately points account saves to the archive', () => {
  assert.match(app, /هذا تنزيل محلي؛ حفظ الحساب يتم من أرشيف الحساب/);
  assert.doesNotMatch(app, /لا يوجد حفظ سحابي أو تلقائي/);
});
