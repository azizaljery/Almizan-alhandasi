import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync('dist/home.html', 'utf8');

test('الصفحة الرئيسية: عربية RTL بهوية «الميزان الهندسي» وشعار «نحو منزلك»', () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /<h1 id="brandName">الميزان الهندسي<\/h1>/);
  assert.match(html, /<p class="tagline">نحو منزلك<\/p>/);
  assert.match(html, /قل لنا كيف تريد أن تعيش… والميزان يحوّلها إلى منزل/);
});
test('الصفحة الرئيسية: كل ملف مرتبط موجود، وروابط المرسم سليمة', () => {
  for (const [, name] of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)) assert.ok(existsSync('dist/' + name), name);
  assert.ok(existsSync('dist/assets/mizan-mark.svg'));
});
test('الصفحة الرئيسية: الخطوات الأربع موجودة وبلا رموز أسرار', () => {
  for (const id of ['stageWelcome', 'stageLand', 'stageShara', 'stageBuild', 'landForm', 'chat']) assert.ok(html.includes(`id="${id}"`), id);
  const js = readFileSync('dist/home.mjs', 'utf8');
  assert.ok(!/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(js)); assert.ok(!js.includes('ANTHROPIC_API_KEY'));
});
test('الصفحة القديمة لم تُمسّ: index.html ما زالت تحوي المقدمة والتبويبات', () => {
  const old = readFileSync('dist/index.html', 'utf8');
  assert.ok(old.includes('id="intro"') && old.includes('id="cinematicSkip"'));
});
