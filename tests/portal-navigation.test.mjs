import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');

test('client workspace opens directly on the request with no intro or secondary portal overlay', () => {
  assert.match(html, /class="app show" id="app"/);
  assert.match(html, /class="panel on" id="panel-brief"/);
  assert.equal(/id="(?:intro|journey)"|src="\.\/portal.mjs"/.test(html), false);
  assert.match(app, /switchTab\('brief'\)/);
});

test('every workspace section has a navigation destination connected to the actual application', () => {
  for(const key of ['brief','rating','design','result','review','boq']){assert.match(html,new RegExp(`data-tab="${key}"`));assert.match(html,new RegExp(`id="panel-${key}"`));}
  assert.match(app, /all\('\[data-tab\]'\).*?switchTab\(button.dataset.tab\)/);
  assert.match(app, /all\('\.panel'\)\.forEach\(panel => panel\.classList\.toggle\('on', panel\.id === 'panel-' \+ tab\)\)/);
});
