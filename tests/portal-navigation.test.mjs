import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../dist/portal.mjs', import.meta.url), 'utf8');
const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');

test('portal client brief route activates the existing design workspace before scrolling and focusing', () => {
  assert.match(portal, /function openDesignPanel\(\)\s*\{\s*cardAction\('#journey > div > \.cards > button:nth-child\(2\)'\);\s*\}/);
  assert.match(portal, /if \(action === 'brief'\) \{ openDesignPanel\(\); focusClientIdea\(\); return; \}/);
  assert.match(portal, /function focusClientIdea\(\)\s*\{\s*const idea = document\.getElementById\('idea'\);\s*if \(!idea\) return;\s*scrollToElement\('idea'\);\s*idea\.focus\(\{ preventScroll: true \}\);\s*\}/);
});

test('the reused design card route opens the app and activates the design panel', () => {
  assert.match(app, /all\('\[data-go\]'\)\.forEach\(button => button\.addEventListener\('click', \(\) => \{ \$\('journey'\)\.style\.display = 'none'; \$\('app'\)\.classList\.add\('show'\); switchTab\(button\.dataset\.go\); \}\)\)/);
  assert.match(app, /all\('\.panel'\)\.forEach\(panel => panel\.classList\.toggle\('on', panel\.id === 'panel-' \+ tab\)\)/);
});
