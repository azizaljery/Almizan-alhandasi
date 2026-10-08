import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');

test('client workspace opens on land first, then request, with all six stages and no overlay', () => {
  assert.match(html, /class="app show" id="app"/);
  assert.match(html, /class="panel on" id="panel-rating"/);
  assert.match(html, /data-tab="rating"><span class="step-number">01<\/span>/);
  assert.match(html, /data-tab="brief"><span class="step-number">02<\/span>/);
  assert.equal(/id="(?:intro|journey)"|src="\.\/portal.mjs"/.test(html), false);
  assert.match(app, /switchTab\('rating'\)/);
  assert.match(app, /switchTab\('design'\)/);
});

test('every workspace section has a navigation destination connected to the actual application', () => {
  for(const key of ['brief','rating','design','result','review','boq']){assert.match(html,new RegExp(`data-tab="${key}"`));assert.match(html,new RegExp(`id="panel-${key}"`));}
  assert.match(app, /all\('\[data-tab\]'\).*?switchTab\(button.dataset.tab\)/);
  assert.match(app, /all\('\.panel'\)\.forEach\(panel => panel\.classList\.toggle\('on', panel\.id === 'panel-' \+ tab\)\)/);
});
