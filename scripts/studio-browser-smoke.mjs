// Assert that the browser really executed the studio bootstrap, not just static HTML.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const file = process.argv[2];
if (!file) throw Error('Pass a headless browser DOM dump path.');
const dom = readFileSync(file, 'utf8');
const tag = id => {
  const expression = new RegExp('<[a-z][^>]*\\bid="' + id + '"[^>]*>', 'i');
  const found = dom.match(expression);
  assert.ok(found, 'Missing rendered element: ' + id);
  return found[0];
};
const classNames = text => (text.match(/\bclass="([^"]*)"/)?.[1] || '').split(/\s+/);
const intro = tag('intro'), app = tag('app'), panel = tag('panel-design');
assert.ok(classNames(intro).includes('off'), 'Cinematic intro did not exit automatically.');
assert.ok(classNames(app).includes('show'), 'The design application did not open.');
assert.ok(classNames(app).includes('studio-simple-mode'), 'Simplified studio did not initialize.');
assert.ok(classNames(panel).includes('on'), 'Design panel did not become active.');
assert.ok(dom.includes('id="studioRequestForm"'), 'Conversation form is missing.');
assert.ok(dom.includes('id="studioAdvancedToggle"'), 'Legacy tools recovery control is missing.');
assert.ok(dom.includes('id="roomRows"'), 'Original room editor was deleted.');
assert.ok(dom.includes('id="view"'), 'Existing 3D viewer was deleted.');
console.log('Browser smoke PASS: cinematic exit, conversation-first studio, legacy tools and 3D container.');
