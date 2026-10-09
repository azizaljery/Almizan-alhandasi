import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultRooms, generateModel, validateModel } from '../dist/planner.mjs';
import { planPreviewURL, studioMetrics, siteOverviewHTML, studioCardsHTML } from '../dist/studio-preview.mjs';
import { visualFailureMessage } from '../dist/render-visualizer.mjs';

const plot = { width: 30, length: 40, floors: 1, entry: 's', streets: { s: true } };
const model = generateModel(plot, defaultRooms(), { strategy: 'balanced' });

test('studio plan preview is the real planner SVG with rooms, openings and measured geometry', () => {
  assert.deepEqual(validateModel(model), []);
  const before = JSON.stringify(model);
  const uri = planPreviewURL(model);
  assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'));
  const svg = decodeURIComponent(uri.split(',').slice(1).join(','));
  assert.match(svg, /<svg/);
  for (const room of model.rooms) assert.ok(svg.includes('data-room-id="' + room.id + '"'));
  assert.match(svg, /المدخل/);
  assert.match(svg, /م²/);
  assert.equal(JSON.stringify(model), before, 'presentation must not mutate the engine model');
});

test('comparison displays actual floor plan, measured tradeoffs and separate AZIZ and Mizan labels', () => {
  const metrics = studioMetrics(model);
  assert.ok(metrics.footprint > 0);
  assert.equal(metrics.roomCount, model.rooms.length);
  assert.ok(metrics.score >= 0 && metrics.score <= 1000);
  const html = studioCardsHTML([model], model, { balanced: 'الجناحان المتوازنان' });
  assert.match(html, /اختيار محرك AZIZ/);
  assert.match(html, /Mizan Score/);
  assert.match(html, /data-preview="0"/);
  assert.match(html, /data-alternative="0"/);
  assert.match(html, /studio-plan-preview/);
  assert.doesNotMatch(html, /concept-diagram/);
});

test('site diagram is labeled as a plot envelope, not a fake room plan', () => {
  const html = siteOverviewHTML(plot, defaultRooms());
  assert.match(html, /حدود الأرض/);
  assert.match(html, /صافي الغرف المطلوبة/);
  assert.match(html, /ليست مخطط غرف/);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, /data-room-id/);
});

test('image quota failure is explicitly non-blocking and does not imply engineering failure', () => {
  const message = visualFailureMessage(new Error('تم تجاوز الرصيد أو الحد المسموح'));
  assert.match(message, /الرصيد أو حد الاستخدام/);
  assert.match(message, /2D/);
  assert.match(visualFailureMessage(new Error('401 unauthorized')), /رمز الدخول/);
});

test('design entry removes static shape diagrams and includes the full-size plan dialog', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="studioSiteOverview"'));
  assert.ok(html.includes('id="studioPreviewDialog"'));
  assert.ok(html.includes('id="alternativeCards"'));
  assert.ok(html.indexOf('id="askAI"') < html.indexOf('id="tasteDeck"'), 'the AI brief must precede optional concept preferences');
  assert.ok(!html.includes('class="concept-diagram'), 'generic massing blocks should not masquerade as plans');
});
