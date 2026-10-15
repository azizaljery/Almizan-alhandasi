// استوديو التصدير: حزمة SVG/DXF/JSON/CSV/manifest، وZIP stored صالح، وبقاء سلوك DXF كما كان.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { createDoc } from '../dist/draw/doc.mjs';
import { toDxf } from '../dist/draw/dxf.mjs';
import { buildExportBundle, planSvg, quantitiesCsv, zipStore, bundleZip, crc32, BUNDLE_SCHEMA } from '../dist/draw/export-studio.mjs';
import { computeDocQuantities } from '../dist/draw/quantities-doc.mjs';
import { geometryFingerprint } from '../dist/design-dna.mjs';

const NOW = new Date('2026-10-16T10:00:00.000Z');
const sha = b => createHash('sha256').update(b).digest('hex');
const doc = sampleVilla();

test('الحزمة: الملفات المتوقعة وmanifest يطابق sha256 مستقلًا وبصمة الهندسة', async () => {
  const { files, manifest } = await buildExportBundle(doc, { now: NOW, app: { commit: 'abc', builtAt: 'x' } });
  const names = files.map(f => f.name);
  assert.deepEqual(names.filter(n => n.endsWith('.svg')), ['plan-L1.svg']);
  for (const n of ['plan.dxf', 'quantities.csv', 'manifest.json']) assert.ok(names.includes(n), n);
  assert.ok(names.some(n => n.endsWith('.mizan.json')));
  assert.equal(manifest.schema, BUNDLE_SCHEMA); assert.equal(manifest.docSchema, doc.schema);
  assert.equal(manifest.createdAt, NOW.toISOString());
  assert.equal(manifest.geometryFingerprint, geometryFingerprint(doc));
  for (const m of manifest.files) { const f = files.find(x => x.name === m.name); assert.equal(m.sha256, sha(f.bytes)); assert.equal(m.bytes, f.bytes.length); }
  const mf = files.find(f => f.name === 'manifest.json'); assert.deepEqual(JSON.parse(Buffer.from(mf.bytes).toString()), manifest);
  assert.ok(!manifest.files.some(f => f.name === 'manifest.json'));
});

test('DXF المنقول مطابق للمنطق الأصلي: طبقات الدور وعدد الخطوط', () => {
  const dxf = toDxf(doc);
  assert.ok(dxf.startsWith('0\nSECTION\n2\nENTITIES') && dxf.endsWith('0\nENDSEC\n0\nEOF'));
  assert.ok(dxf.includes('\nL1_WALLS\n') && dxf.includes('\nL1_DOORS\n'));
  const lines = dxf.split('\n'), n = lines.filter(l => l === 'LINE').length;
  assert.equal(n, doc.walls.length * 4 + doc.fixtures.length * 4 + doc.openings.length);
});

test('SVG لكل دور: متعدد الأدوار، وعربي، ويهرّب الرموز', () => {
  let d = sampleVilla(); d.levels.push({ id: 'L2', name: 'الدور <الأول>', elevation: 3, height: 3 });
  const svg = planSvg(d, d.levels[1]); assert.match(svg, /&lt;الأول&gt;/); assert.ok(svg.startsWith('<svg'));
  const s1 = planSvg(d, d.levels[0]); assert.equal((s1.match(/class="wall"/g) || []).length, d.walls.filter(w => w.level === 'L1').length);
  assert.ok(s1.includes('مجلس الرجال'));
});

test('CSV الكميات: كل الصفوف بدرجاتها ولا يُحذف غير القابل للحساب', () => {
  const res = computeDocQuantities(doc), csv = quantitiesCsv(res);
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines.length, res.rows.length + 1); assert.ok(lines[0].includes('الدرجة'));
  for (const g of ['مقيس', 'تقدير بافتراض معلن', 'غير قابل للحساب']) assert.ok(csv.includes(g), g);
  const cost = lines.find(l => l.startsWith('التكلفة')); assert.ok(cost && cost.includes('غير قابل للحساب'));
});

test('مستند فارغ: الحزمة تُبنى بلا انهيار والكميات لا تُخترع', async () => {
  const { files, manifest } = await buildExportBundle(createDoc({ title: 'فارغ / تجربة' }), { now: NOW });
  assert.ok(files.some(f => f.name === 'فارغ_تجربة.mizan.json')); assert.equal(manifest.app.commit, null);
  const csv = Buffer.from(files.find(f => f.name === 'quantities.csv').bytes).toString();
  assert.ok(csv.includes('غير قابل للحساب'));
});

test('ZIP stored: CRC صحيح وبنية صالحة وتفكّ بأداة خارجية إن وُجدت', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const bundle = await buildExportBundle(doc, { now: NOW }), zip = bundleZip(bundle, NOW);
  const dv = new DataView(zip.buffer, zip.byteOffset), eocd = zip.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50); assert.equal(dv.getUint16(eocd + 10, true), bundle.files.length);
  const dir = mkdtempSync(join(tmpdir(), 'mzip-')), p = join(dir, 'b.zip'); writeFileSync(p, zip);
  const t = spawnSync('python3', ['-I', '-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("\\n".join(z.namelist()))', p], { encoding: 'utf8' });
  if (t.error) return; // python غير متوفر: غير متحقق خارجيًا
  assert.equal(t.status, 0, t.stderr); assert.deepEqual(t.stdout.trim().split('\n'), bundle.files.map(f => f.name));
  assert.equal(readFileSync(p).length, zip.length);
  assert.equal(zipStore([]).length, 22);
});
