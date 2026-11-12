// حزمة المهندس: DXF (محلّل مستقل)، XLSX (OOXML + openpyxl إن وُجد)، ZIP (CRC وأسماء عربية + python zipfile إن وُجد)،
// README والتنبيه، design.json ذهابًا وإيابًا، واختبار متصفح: الزر ← تنزيل ← فحص محتوى الملف المنزَّل.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { serialize, parseDoc } from '../dist/draw/doc.mjs';
import { STUDIO_KEY } from '../dist/draw/handoff.mjs';
import { analyzeDoc, isWindowKind } from '../dist/draw/digest.mjs';
import { isDoorKind } from '../dist/draw/catalog.mjs';
import { buildFinalData } from '../dist/final-outputs.mjs';
import { dxfSet, dxfText, DXF_LAYERS, roomCodes } from '../dist/draw/dxf-pro.mjs';
import { crc32, zipBuild } from '../dist/pack/zip-lite.mjs';
import { xlsxBuild, colName } from '../dist/pack/xlsx-lite.mjs';
import { buildEngineerPack, packZip, boqRows, boqCsv, designJson, restoreDesignJson, readmeText, packName, slugName, PACK_DISCLAIMER_AR, PACK_DISCLAIMER_EN, PACK_SCHEMA } from '../dist/pack/engineer-pack.mjs';
import { createSession, saveSession, loadSession, currentDoc, SESSION_KEY } from '../dist/design-session.mjs';
import { geometryFingerprint } from '../dist/design-dna.mjs';

const NOW = new Date('2026-11-12T09:30:00Z');
const land = (w, l, floors) => ({ width: w, length: l, streets: ['s'], entries: ['s'], ...(floors ? { floors } : {}) });
const one = (req = {}, w = 20, l = 30) => generateVillaDesigns({ land: land(w, l), counts: { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 }, requirements: req, keep: 1 }).designs[0];
const two = (req = {}) => generateVillaTwoFloors({ land: land(20, 30, 2), counts: { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, requirements: req, keep: 1 }).designs[0];
const CASES = {
  'دور واحد': one().doc,
  'دوران': two().doc,
  'دوران بتراس': two({ prefs: { terrace: true } }).doc,
  'دور بمسبح ومظلة': one({ prefs: { outdoor: { pool: true, carport: true, pergola: true } } }, 25, 30).doc,
};

// ---------------------------------------------------------------------------------------------- محلّل DXF بسيط ومستقل
function parseDxf(text) {
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text), 'الملف ASCII صرف');
  const lines = text.split('\r\n'); assert.equal(lines.pop(), '', 'ينتهي بسطر جديد');
  assert.equal(lines.length % 2, 0, 'أزواج كود/قيمة');
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) { assert.match(lines[i], /^-?\d+$/, `كود مجموعة غير رقمي في السطر ${i + 1}: «${lines[i]}»`); pairs.push([Number(lines[i]), lines[i + 1]]); }
  assert.deepEqual(pairs[pairs.length - 1], [0, 'EOF'], 'EOF');
  const sections = {}, order = []; let cur = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION') { assert.equal(cur, null, 'قسم داخل قسم'); assert.equal(pairs[i + 1][0], 2); cur = pairs[i + 1][1]; order.push(cur); sections[cur] = []; i++; continue; }
    if (c === 0 && v === 'ENDSEC') { assert.ok(cur, 'ENDSEC بلا قسم'); cur = null; continue; }
    if (cur) sections[cur].push([c, v]); else assert.ok((c === 0 && v === 'EOF') || c === 999, 'محتوى خارج الأقسام');
  }
  assert.deepEqual(order, ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'], 'ترتيب الأقسام');
  const header = {}; { let k = null; for (const [c, v] of sections.HEADER) { if (c === 9) { k = v; header[k] = {}; } else header[k][c] = v; } }
  const records = list => { const out = []; let r = null; for (const [c, v] of list) { if (c === 0) { r = { type: v, g: [] }; out.push(r); } else if (r) r.g.push([c, v]); } return out; };
  const get = (r, c) => r.g.find(p => p[0] === c)?.[1], all = (r, c) => r.g.filter(p => p[0] === c).map(p => p[1]);
  const tables = {}; { let t = null; for (const r of records(sections.TABLES)) { if (r.type === 'TABLE') { t = get(r, 2); tables[t] = { handle: get(r, 5), entries: [] }; } else if (r.type === 'ENDTAB') t = null; else { assert.ok(t, 'سجل خارج جدول'); tables[t].entries.push(r); } } }
  const names = t => new Set((tables[t]?.entries || []).map(r => get(r, 2)));
  const entities = records(sections.ENTITIES).map(r => ({ type: r.type, layer: get(r, 8), handle: get(r, 5), owner: get(r, 330), lt: get(r, 6), style: get(r, 7), text: get(r, 1), closed: (Number(get(r, 70)) & 1) === 1, n: Number(get(r, 90)), xs: all(r, 10).map(Number), ys: all(r, 20).map(Number), h: Number(get(r, 40)), g: r.g }));
  const handles = ['TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'].flatMap(k => sections[k]).filter(p => p[0] === 5 || p[0] === 105).map(p => p[1]);
  return { pairs, sections, header, tables, layers: names('LAYER'), ltypes: names('LTYPE'), styles: names('STYLE'), blockRecords: names('BLOCK_RECORD'), entities, handles, blocks: records(sections.BLOCKS), objects: records(sections.OBJECTS) };
}
const shoelace = e => { let s = 0; for (let i = 0; i < e.xs.length; i++) { const j = (i + 1) % e.xs.length; s += e.xs[i] * e.ys[j] - e.xs[j] * e.ys[i]; } return Math.abs(s) / 2; };
const decode = s => String(s).replace(/\\U\+([0-9A-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

function checkStructure(D, name) {
  assert.equal(D.header.$ACADVER[1], 'AC1015', name + ': إصدار R2000');
  assert.equal(D.header.$INSUNITS[70], '6', name + ': $INSUNITS=6 (متر)');
  assert.equal(D.header.$MEASUREMENT[70], '1', name + ': $MEASUREMENT=1 (متري)');
  assert.equal(D.header.$DWGCODEPAGE[3], 'ANSI_1256', name + ': صفحة الترميز العربية');
  for (const t of ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD']) assert.ok(D.tables[t], name + ': جدول ' + t);
  assert.ok(D.blockRecords.has('*Model_Space') && D.blockRecords.has('*Paper_Space'), name + ': سجلا البلوك');
  assert.deepEqual(D.blocks.filter(b => b.type === 'BLOCK').map(b => b.g.find(p => p[0] === 2)[1]), ['*Model_Space', '*Paper_Space']);
  assert.ok(D.objects.some(o => o.type === 'DICTIONARY' && o.g.some(p => p[0] === 3 && p[1] === 'ACAD_GROUP')), name + ': القاموس الجذري');
  for (const l of DXF_LAYERS) assert.ok(D.layers.has(l.name), name + ': طبقة ' + l.name);
  for (const need of ['ByLayer', 'ByBlock', 'Continuous', 'DASHED', 'CENTER']) assert.ok(D.ltypes.has(need), name + ': نوع خط ' + need);
  for (const r of D.tables.LAYER.entries) assert.ok(D.ltypes.has(r.g.find(p => p[0] === 6)[1]), name + ': نوع خط الطبقة معرّف');
  assert.equal(new Set(D.handles).size, D.handles.length, name + ': المعرّفات (handles) فريدة');
  const seed = parseInt(D.header.$HANDSEED[5], 16); for (const h of D.handles) assert.ok(parseInt(h, 16) < seed, name + ': المعرّف أقل من $HANDSEED');
  const msHandle = D.tables.BLOCK_RECORD.entries.find(r => r.g.some(p => p[0] === 2 && p[1] === '*Model_Space')).g.find(p => p[0] === 5)[1];
  assert.ok(D.entities.length > 10, name + ': كيانات');
  for (const e of D.entities) {
    assert.ok(['LWPOLYLINE', 'LINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'TEXT'].includes(e.type), name + ': نوع كيان ' + e.type);
    assert.ok(D.layers.has(e.layer), `${name}: كيان ${e.type} على طبقة غير معرّفة «${e.layer}»`);
    assert.equal(e.owner, msHandle, name + ': مالك الكيان فضاء النموذج');
    if (e.lt) assert.ok(D.ltypes.has(e.lt), name + ': نوع خط الكيان');
    if (e.type === 'TEXT') { assert.ok(D.styles.has(e.style), name + ': نمط النص'); assert.ok(e.h > 0 && e.text.length > 0); }
    if (e.type === 'LWPOLYLINE') { assert.equal(e.xs.length, e.n, name + ': عدد رؤوس المضلع يطابق 90'); assert.equal(e.ys.length, e.n); assert.ok(e.n >= 2); }
    for (const v of [...e.xs, ...e.ys]) assert.ok(Number.isFinite(v) && Math.abs(v) < 500, name + ': إحداثي معقول بالمتر');
  }
  const minX = Math.min(...D.entities.flatMap(e => e.xs)), minY = Math.min(...D.entities.flatMap(e => e.ys));
  assert.ok(Number(D.header.$EXTMIN[10]) <= minX + 1e-6 && Number(D.header.$EXTMIN[20]) <= minY + 1e-6, name + ': $EXTMIN يحتوي الرسم');
}

for (const [label, doc] of Object.entries(CASES)) {
  test(`DXF «${label}»: بنية R2000 صالحة، طبقات معرّفة، جدران مغلقة، أبواب ونوافذ ومساحات تطابق المستند`, () => {
    const data = buildFinalData(doc, { now: NOW }), set = dxfSet(doc, { structure: data.structure, date: data.date, fingerprint: data.fingerprint });
    const A = analyzeDoc(doc), levels = doc.levels.filter(l => doc.walls.some(w => w.level === l.id));
    assert.equal(set.length, levels.length + 1, 'ملف لكل دور + الموقع العام');
    assert.equal(set[0].name, 'A-00-SITE-PLAN.dxf');
    let roomsTotal = 0;
    levels.forEach((lv, i) => {
      const f = set[i + 1], D = parseDxf(f.text); checkStructure(D, f.name);
      const walls = D.entities.filter(e => /^A-WALL/.test(e.layer));
      assert.ok(walls.length > 4, 'جدران');
      for (const w of walls) { assert.equal(w.type, 'LWPOLYLINE', 'الجدار مضلع'); assert.ok(w.closed, 'مضلع الجدار مغلق'); assert.ok(w.n >= 3 && shoelace(w) > 1e-5, 'مضلع الجدار له مساحة'); }
      assert.ok(walls.some(w => w.layer === 'A-WALL-EXT') && walls.some(w => w.layer === 'A-WALL'), 'خارجي وداخلي');
      // سماكة حقيقية: مجموع مساحات مضلعات الجدران ≈ مجموع (الطول × السماكة) للجدران المرسومة ناقص الفتحات (ضمن 12٪ لتداخل الأركان)
      const ops = doc.openings.filter(o => o.level === lv.id), wl = doc.walls.filter(w => w.level === lv.id);
      const expect = wl.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) * w.t, 0) - ops.reduce((s, o) => s + o.w * (wl.find(w => w.id === o.wall)?.t || 0), 0);
      const got = walls.reduce((s, w) => s + shoelace(w), 0);
      assert.ok(Math.abs(got - expect) / expect < .12, `مساحة الجدران في المسقط ${got.toFixed(2)} ≈ ${expect.toFixed(2)}`);
      const doors = ops.filter(o => isDoorKind(o.kind)).length, windows = ops.filter(o => isWindowKind(o.kind)).length;
      assert.equal(D.entities.filter(e => e.layer === 'A-DOOR-IDEN' && e.type === 'TEXT').length, doors, 'عدد وسوم الأبواب = أبواب المستند');
      assert.equal(D.entities.filter(e => e.layer === 'A-GLAZ-IDEN' && e.type === 'TEXT').length, windows, 'عدد وسوم النوافذ = نوافذ المستند');
      assert.equal(D.entities.filter(e => e.layer === 'A-GLAZ' && e.type === 'LWPOLYLINE' && e.closed).length, windows, 'إطار مغلق لكل نافذة');
      const swings = ops.reduce((s, o) => s + (o.kind === 'door' ? 1 : o.kind === 'door2' ? 2 : 0), 0);
      assert.equal(D.entities.filter(e => e.type === 'ARC' && e.layer === 'A-DOOR').length, swings, 'قوس فتح لكل ضلفة');
      assert.equal(f.meta.doors, doors); assert.equal(f.meta.windows, windows);
      // الفراغات
      const rooms = A.levelById.get(lv.id).rooms.filter(r => r.net), polys = D.entities.filter(e => e.layer === 'A-AREA');
      assert.equal(polys.length, rooms.length, 'مضلع لكل فراغ'); assert.ok(polys.every(p => p.closed));
      const sum = polys.reduce((s, p) => s + shoelace(p), 0), want = rooms.reduce((s, r) => s + r.area, 0); roomsTotal += sum;
      assert.ok(Math.abs(sum - want) / want < .01, `مجموع مساحات الفراغات ${sum.toFixed(2)} ≈ ${want.toFixed(2)} (±1٪)`);
      const texts = D.entities.filter(e => e.layer === 'A-AREA-IDEN').map(e => decode(e.text)), codes = roomCodes(A);
      for (const r of rooms.filter(r => !(r.unlabelled && r.area < 2))) {
        assert.ok(texts.includes(r.name), 'الاسم العربي مكتوب: ' + r.name);
        const code = codes.get(lv.id + '/' + r.id); assert.match(code, /^[A-Z]+(?:-[A-Z]+)*(?:-\d+)?$/); assert.ok(texts.includes(code), 'الاسم اللاتيني: ' + code);
        assert.ok(texts.includes(r.area.toFixed(2) + ' m2'), 'المساحة مكتوبة');
      }
      assert.ok(D.entities.some(e => e.layer === 'A-AREA-IDEN' && /\\U\+06[0-9A-F]{2}/.test(e.text)), 'العربية بصيغة \\U+XXXX');
      assert.ok(D.entities.filter(e => e.layer === 'A-ANNO-DIMS' && e.type === 'TEXT').length >= 8, 'نصوص أبعاد');
      assert.ok(D.entities.filter(e => e.layer === 'A-ANNO-DIMS' && e.type === 'TEXT').every(e => /^\d+\.\d\d$/.test(e.text)), 'نص البعد رقم بالمتر');
      assert.ok(D.entities.some(e => e.layer === 'A-ANNO-TTLB'), 'إطار ولوحة عنوان'); assert.ok(D.entities.some(e => e.layer === 'A-ANNO-NRTH'), 'سهم الشمال');
      if (data.structure.levels.find(x => x.id === lv.id)?.columns?.length) assert.ok(D.entities.filter(e => e.layer === 'S-COLS').length > 0, 'أعمدة مبدئية');
      if (doc.stairs.some(s => s.level === lv.id)) assert.ok(D.entities.some(e => e.layer === 'A-FLOR-STRS' && /^UP \d+R$/.test(e.text || '')), 'درج بعدد القوائم');
      if (doc.fixtures.some(x => x.level === lv.id)) assert.ok(D.entities.some(e => e.layer === 'A-FURN'), 'أثاث');
    });
    // يطابق جدول كميات الموقع: الغرف المسمّاة + الممرات
    const q = Object.fromEntries(data.quantities.rows.map(r => [r.id, r.value])), site = q.rooms + q.circulation;
    assert.ok(Math.abs(roomsTotal - site) / site < .01, `مساحات DXF ${roomsTotal.toFixed(2)} ≈ كميات الموقع ${site.toFixed(2)} (±1٪)`);
    // الموقع العام
    const S = parseDxf(set[0].text); checkStructure(S, set[0].name);
    const prop = S.entities.filter(e => e.layer === 'C-PROP' && e.type === 'LWPOLYLINE');
    assert.equal(prop.length, 1); assert.ok(prop[0].closed);
    assert.ok(Math.abs(Math.min(...prop[0].xs)) < 1e-9 && Math.abs(Math.min(...prop[0].ys)) < 1e-9, 'الأصل عند ركن الأرض');
    const pa = doc.plot.polygon.reduce((s, p, i, a) => { const n = a[(i + 1) % a.length]; return s + p.x * n.y - n.x * p.y; }, 0) / 2;
    assert.ok(Math.abs(shoelace(prop[0]) - Math.abs(pa)) < 1e-6, 'مساحة الأرض بالمتر المربع الحقيقي');
    assert.equal(S.entities.filter(e => e.layer === 'C-BLDG-SETB' && e.type === 'LWPOLYLINE' && e.closed).length, 1, 'خط الارتداد');
    assert.ok(S.entities.some(e => e.layer === 'A-ANNO-TEXT' && e.text === 'STREET'), 'الشارع'); assert.ok(S.entities.some(e => e.layer === 'A-ANNO-NRTH'));
    assert.ok(S.entities.some(e => e.layer === 'A-WALL-EXT' && e.closed), 'أثر المبنى');
    const out = doc.fixtures.filter(x => ['pool', 'carport', 'pergola'].includes(x.kind));
    for (const fx of out) assert.ok(S.entities.some(e => e.layer === 'L-SITE' && e.text === fx.kind.toUpperCase()), 'عنصر الحوش: ' + fx.kind);
    if (label.includes('مسبح')) assert.ok(out.some(x => x.kind === 'pool'), 'المثال يحوي مسبحًا');
    if (label.includes('تراس')) assert.ok(doc.labels.some(l => l.type === 'balcony'), 'المثال يحوي تراسًا');
    if (doc.levels.length > 1) assert.ok(S.entities.some(e => e.layer === 'A-FLOR-OTLN'), 'محيط الدور العلوي');
  });
}

test('DXF: مخطط مرسوم يدويًا بلا أرض يُصدَّر والأصل عند ركن المبنى', () => {
  const doc = sampleVilla(), set = dxfSet(doc, {});
  for (const f of set) checkStructure(parseDxf(f.text), f.name);
  const P = parseDxf(set[1].text), ops = doc.openings.filter(o => o.level === doc.levels[0].id);
  assert.equal(P.entities.filter(e => e.layer === 'A-DOOR-IDEN').length, ops.filter(o => isDoorKind(o.kind)).length);
  if (!doc.plot?.polygon?.length) { const b = doc.walls.flatMap(w => [w.a.x, w.b.x]), minx = Math.min(...P.entities.filter(e => /^A-WALL/.test(e.layer)).flatMap(e => e.xs)); assert.ok(Math.abs(minx) < Math.max(...doc.walls.map(w => w.t)), 'الجدار الأول عند الأصل ' + minx + ' ' + Math.min(...b)); }
});

test('نص DXF: العربية \\U+XXXX، ASCII كما هو، علامات الاتجاه تُحذف', () => {
  assert.equal(dxfText('مجلس'), '\\U+0645\\U+062C\\U+0644\\U+0633');
  assert.equal(dxfText('BED-1 12.50 m2'), 'BED-1 12.50 m2');
  assert.equal(dxfText('⁦+0.45⁩'), '+0.45');
  assert.equal(dxfText('a\nb'), 'a b');
  assert.equal(decode(dxfText('غرفة نوم 2 — Master')), 'غرفة نوم 2 — Master');
});

// ---------------------------------------------------------------------------------------------- ZIP
/** قارئ ZIP مستقل للاختبار: الدليل المركزي + الترويسات المحلية + فك deflate + تحقق CRC. */
function unzip(bytes) {
  const b = Buffer.from(bytes), eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])); assert.ok(eocd >= 0, 'نهاية الدليل المركزي');
  const n = b.readUInt16LE(eocd + 10), size = b.readUInt32LE(eocd + 12), off = b.readUInt32LE(eocd + 16); assert.equal(off + size, eocd, 'الدليل المركزي ملاصق للنهاية');
  const out = new Map(); let p = off;
  for (let i = 0; i < n; i++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50); const flag = b.readUInt16LE(p + 8), method = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16), cs = b.readUInt32LE(p + 20), us = b.readUInt32LE(p + 24), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), lo = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nl).toString('utf8'); assert.ok(flag & 0x0800, 'علم UTF-8 للاسم: ' + name);
    assert.equal(b.readUInt32LE(lo), 0x04034b50); assert.equal(b.readUInt32LE(lo + 14), crc, 'CRC الترويسة المحلية'); assert.ok(b.readUInt16LE(lo + 6) & 0x0800);
    const lnl = b.readUInt16LE(lo + 26), lel = b.readUInt16LE(lo + 28), raw = b.subarray(lo + 30 + lnl + lel, lo + 30 + lnl + lel + cs);
    assert.equal(b.subarray(lo + 30, lo + 30 + lnl).toString('utf8'), name);
    const data = method === 8 ? zlib.inflateRawSync(raw) : (assert.equal(method, 0), raw);
    assert.equal(data.length, us, 'الحجم: ' + name); assert.equal(crc32(data), crc, 'CRC: ' + name);
    out.set(name, { data, method }); p += 46 + nl + el + cl;
  }
  return out;
}
const HAS_PY = (() => { try { execFileSync('python3', ['-c', 'import zipfile'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const HAS_OPENPYXL = HAS_PY && (() => { try { execFileSync('python3', ['-c', 'import openpyxl'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const py = (code, ...args) => execFileSync('python3', ['-I', '-c', code, ...args], { encoding: 'utf8' });
const withTmp = fn => { const dir = mkdtempSync(join(tmpdir(), 'epk-')); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('CRC32 بقيم معروفة', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});
test('ZIP: deflate وstore، أسماء عربية UTF-8، CRC صحيح، ويفتحه python zipfile', async () => {
  const big = 'جدار '.repeat(4000), entries = [{ name: '01-مخططات/مسقط الدور الأرضي.txt', text: big }, { name: 'a/b/small.txt', text: 'hi' }, { name: 'bin.dat', bytes: Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 255) }];
  for (const compress of [true, false]) {
    const z = await zipBuild(entries, { date: NOW, compress }), m = unzip(z);
    assert.deepEqual([...m.keys()], entries.map(e => e.name));
    assert.equal(m.get(entries[0].name).data.toString('utf8'), big);
    assert.equal(m.get(entries[0].name).method, compress ? 8 : 0); assert.equal(m.get('a/b/small.txt').method, 0);
    if (compress) assert.ok(z.length < big.length, 'الضغط يصغّر الملف');
    if (HAS_PY) withTmp(dir => { const f = join(dir, 't.zip'); writeFileSync(f, z); const r = JSON.parse(py('import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([z.testzip(), z.namelist(), z.read(z.namelist()[0]).decode("utf8")[:5]]))', f)); assert.equal(r[0], null); assert.deepEqual(r[1], entries.map(e => e.name)); assert.equal(r[2], 'جدار '); });
  }
  await assert.rejects(zipBuild([{ name: '../x', text: '' }]), /غير صالح/);
  await assert.rejects(zipBuild([{ name: 'a', text: '' }, { name: 'a', text: '' }]), /مكرر/);
});

// ---------------------------------------------------------------------------------------------- XLSX والحزمة
const doc2 = CASES['دوران بتراس'], data2 = buildFinalData(doc2, { now: NOW });
const session2 = (() => { const r = two({ prefs: { terrace: true } }); return createSession({ land: land(20, 30, 2), counts: { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1 }, requirements: { prefs: { terrace: true } }, idea: 'فيلا دورين بتراس', result: { doc: r.doc, pat: r.pat, summary: r.summary, notes: r.notes, floors: 2, ledger: r.ledger } }); })();
let packP = null; const getPack = () => (packP ||= buildEngineerPack({ doc: doc2, data: data2, session: session2, version: { commit: 'abcdef1234567890', builtAt: '2026-11-12T00:00:00Z' }, now: NOW }));
const xmlText = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('XLSX: أجزاء OOXML، ثلاث أوراق RTL بترويسة مجمّدة، أرقام كأرقام، معادلات الإجمالي وSUM، والقيم تطابق quantities-doc', async () => {
  const pack = await getPack(), x = pack.files.find(f => f.path === '03-الكميات/BOQ.xlsx'); assert.ok(x);
  const parts = unzip(x.bytes), T = n => parts.get(n).data.toString('utf8');
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) assert.ok(parts.has(n), n);
  assert.equal([...parts.keys()][0], '[Content_Types].xml', 'أنواع المحتوى أول جزء');
  assert.deepEqual([...T('xl/workbook.xml').matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]), ['جدول الكميات', 'جدول المساحات', 'بيانات المشروع']);
  const sst = [...T('xl/sharedStrings.xml').matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map(m => xmlText(m[1]));
  const sheet = n => { const xml = T(`xl/worksheets/sheet${n}.xml`), cells = new Map(); for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) { const body = m[4] || '', f = /<f>([\s\S]*?)<\/f>/.exec(body), v = /<v>([\s\S]*?)<\/v>/.exec(body), str = / t="s"/.test(m[3]); cells.set(m[1] + m[2], { f: f ? xmlText(f[1]) : null, v: v ? (str ? sst[Number(v[1])] : Number(v[1])) : null, str }); } return { xml, cells }; };
  const S1 = sheet(1), S2 = sheet(2), S3 = sheet(3);
  for (const s of [S1, S2, S3]) { assert.match(s.xml, /<sheetView [^>]*rightToLeft="1"/, 'اتجاه من اليمين لليسار'); assert.match(s.xml, /<pane ySplit="\d+" [^>]*state="frozen"/, 'ترويسة مجمّدة'); assert.match(s.xml, /<cols><col [^>]*customWidth="1"/, 'عرض أعمدة'); }
  assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(c => S1.cells.get(c + '3').v), ['م', 'البند', 'الوصف / أساس الحساب', 'الوحدة', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'درجة الدقة']);
  assert.match(T('xl/styles.xml'), /<font><b\/>/, 'خط غامق للترويسة'); assert.match(S1.xml, /<c r="A3" s="1"/);
  const rows = boqRows(data2), byLabel = new Map(); for (const [ref, c] of S1.cells) if (ref[0] === 'B' && c.str) byLabel.set(c.v, ref.slice(1));
  let formulas = 0;
  for (const r of rows) {
    const n = byLabel.get(r.label); assert.ok(n, 'صف البند: ' + r.label);
    const q = S1.cells.get('E' + n), price = S1.cells.get('F' + n), tot = S1.cells.get('G' + n);
    if (r.value === null) assert.ok(!q || q.v === null, 'كمية غير قابلة للحساب تبقى فارغة'); else { assert.equal(q.str, false, 'الكمية رقم لا نص'); assert.equal(q.v, r.value, 'قيمة ' + r.label); }
    assert.ok(!price || (price.v === null && !price.f), 'سعر الوحدة فارغ — لا أسعار من عندنا');
    assert.equal(tot.f, `IF(OR(E${n}="",F${n}=""),"",E${n}*F${n})`, 'الإجمالي = الكمية × السعر'); formulas++;
  }
  assert.equal(formulas, rows.length);
  const sum = [...S1.cells].find(([ref, c]) => ref[0] === 'G' && c.f && /^SUM\(/.test(c.f)); assert.ok(sum, 'خانة مجموع');
  const m = /^SUM\(G(\d+):G(\d+)\)$/.exec(sum[1].f); assert.ok(Number(m[1]) <= Math.min(...rows.map(r => Number(byLabel.get(r.label)))) && Number(m[2]) >= Math.max(...rows.map(r => Number(byLabel.get(r.label)))), 'SUM يغطي كل البنود');
  // الأرقام نفسها التي في quantities-doc
  for (const r of data2.quantities.rows.filter(r => !['mep', 'cost'].includes(r.id))) { const n = byLabel.get(r.label); assert.ok(n); if (r.value !== null) assert.equal(S1.cells.get('E' + n).v, r.value); }
  // جدول المساحات
  data2.rooms.forEach((r, i) => { const n = i + 2; assert.equal(S2.cells.get('C' + n).v, r.name); assert.equal(S2.cells.get('B' + n).v, r.level); assert.equal(S2.cells.get('H' + n).v, r.area); assert.equal(S2.cells.get('H' + n).str, false); assert.match(S2.cells.get('G' + n).v, /^\d+\.\d\d × \d+\.\d\d$/); });
  assert.equal(S2.cells.get('H' + (data2.rooms.length + 2)).f, `SUM(H2:H${data2.rooms.length + 1})`);
  assert.ok([...S3.cells.values()].some(c => c.v === data2.title) && [...S3.cells.values()].some(c => c.v === PACK_DISCLAIMER_AR));
  if (HAS_OPENPYXL) withTmp(dir => {
    const f = join(dir, 'b.xlsx'); writeFileSync(f, x.bytes);
    const r = JSON.parse(py(`import openpyxl,sys,json
wb=openpyxl.load_workbook(sys.argv[1]); ws=wb.worksheets[0]
rows=[[c.value for c in row] for row in ws.iter_rows()]
print(json.dumps({'names':wb.sheetnames,'rtl':[w.sheet_view.rightToLeft for w in wb.worksheets],'freeze':[w.freeze_panes for w in wb.worksheets],'rows':rows,'bold':ws['A3'].font.b,'types':[ws.cell(row=i,column=5).data_type for i in range(4,ws.max_row)]}))`, f));
    assert.deepEqual(r.names, ['جدول الكميات', 'جدول المساحات', 'بيانات المشروع']); assert.deepEqual(r.rtl, [true, true, true]); assert.deepEqual(r.freeze, ['A4', 'A2', 'A3']); assert.equal(r.bold, true);
    for (const q of rows) { const row = r.rows.find(c => c[1] === q.label); assert.ok(row, 'openpyxl: ' + q.label); assert.equal(row[4], q.value); assert.match(String(row[6]), /^=IF\(OR\(E\d+="",F\d+=""\),"",E\d+\*F\d+\)$/); assert.equal(row[5], null); }
    assert.ok(r.rows.some(c => /^=SUM\(G\d+:G\d+\)$/.test(String(c[6]))));
    assert.ok(r.types.every(t => t === 'n'), 'خلايا الكمية أرقام أو فارغة');
  });
});

test('XLSX: كاتب عام — محارف XML تُهرَّب وأسماء الأعمدة بعد Z', async () => {
  assert.equal(colName(0), 'A'); assert.equal(colName(25), 'Z'); assert.equal(colName(26), 'AA'); assert.equal(colName(701), 'ZZ');
  const z = await xlsxBuild([{ name: 'a/b', rows: [['x<y & "z"', 1.5, { f: 'B1*2' }, null, true]] }]), p = unzip(z);
  assert.match(p.get('xl/sharedStrings.xml').data.toString(), /x&lt;y &amp; &quot;z&quot;/); assert.match(p.get('xl/workbook.xml').data.toString(), /name="a b"/);
  assert.match(p.get('xl/worksheets/sheet1.xml').data.toString(), /<c r="B1" s="3"><v>1\.5<\/v><\/c><c r="C1" s="3"><f>B1\*2<\/f><\/c>/);
});

test('الحزمة: المحتوى والمجلدات، CSV بـBOM، SVG مستقلة وملف الطباعة A3، ولا PDF رديء', async () => {
  const pack = await getPack(), paths = pack.files.map(f => f.path), T = p => new TextDecoder('utf-8', { ignoreBOM: true }).decode(pack.files.find(f => f.path === p).bytes);
  assert.equal(pack.name, `almizan-${slugName(doc2.title)}-2026-11-12.zip`); assert.match(pack.name, /^almizan-.+-\d{4}-\d\d-\d\d\.zip$/);
  for (const p of ['01-DXF/A-00-SITE-PLAN.dxf', '01-DXF/A-01-GROUND-FLOOR-PLAN.dxf', '01-DXF/A-02-FIRST-FLOOR-PLAN.dxf', '02-SVG/اطبع-PDF.html', '02-SVG/كتاب-المشروع.html', '03-الكميات/BOQ.xlsx', '03-الكميات/BOQ.csv', '04-بيانات/design.json', '04-بيانات/README-اقرأني.txt']) assert.ok(paths.includes(p), p);
  assert.ok(!paths.some(p => /\.pdf$/i.test(p)), 'لا PDF في الحزمة'); assert.ok(paths.some(p => p.endsWith('.mizan.json')));
  const svgs = paths.filter(p => /^02-SVG\/.+\.svg$/.test(p)); assert.ok(svgs.length >= data2.levels.length + data2.drawings.sheets.length, 'كل لوحات الصفحة');
  for (const p of svgs) { const s = T(p); assert.match(s, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, p + ' مستقل'); assert.match(s, /font-family=/); assert.ok(s.trimEnd().endsWith('</svg>')); }
  assert.ok(svgs.some(p => /A-00-site/.test(p)) && svgs.some(p => /elevations/.test(p)) && svgs.some(p => /section/.test(p)) && svgs.some(p => /S-01-structure/.test(p)));
  const pr = T('02-SVG/اطبع-PDF.html'); assert.match(pr, /@page\{size:A3 landscape;margin:0\}/); assert.equal((pr.match(/<section class="sheet"/g) || []).length, svgs.length); assert.match(pr, /window\.print\(\)/); assert.ok(pr.includes(PACK_DISCLAIMER_AR));
  const csv = T('03-الكميات/BOQ.csv'); assert.equal(pack.files.find(f => f.path.endsWith('BOQ.csv')).bytes.subarray(0, 3).join(','), '239,187,191', 'BOM');
  assert.equal(csv, boqCsv(data2)); assert.equal(csv.trim().split('\r\n').length, boqRows(data2).length + 1);
  assert.ok(csv.split('\r\n')[0].includes('سعر الوحدة')); for (const r of boqRows(data2)) assert.ok(csv.includes(r.label));
  assert.deepEqual(pack.groups.map(g => g.id), ['dxf', 'svg', 'boq', 'data']); assert.equal(pack.groups.reduce((a, g) => a + g.size, 0), pack.size); assert.deepEqual(pack.notes, []);
  const steps = []; await buildEngineerPack({ doc: doc2, data: data2, now: NOW, onProgress: p => steps.push(p.done + '/' + p.total) }); assert.deepEqual(steps, ['1/6', '2/6', '3/6', '4/6', '5/6', '6/6'], 'تقدّم بخطوات فعلية');
});

test('الحزمة: الصورة المعمارية تُضاف موسومةً فقط، ولقطة المجسم من data URL', async () => {
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]), snap = 'data:image/jpeg;base64,' + Buffer.from(jpg).toString('base64');
  const p = await buildEngineerPack({ doc: doc2, data: { ...data2, snapshot3d: snap, proPhoto: { image: snap } }, photo: { bytes: jpg, ext: 'jpg' }, now: NOW });
  assert.deepEqual(p.files.filter(f => f.group === 'img').map(f => f.path), ['05-صور/صورة-معمارية-محسّنة-بالذكاء-الاصطناعي.jpg', '05-صور/لقطة-المجسم.jpg']);
  assert.deepEqual([...p.files.find(f => f.path.endsWith('لقطة-المجسم.jpg')).bytes], [...jpg]);
  const q = await buildEngineerPack({ doc: doc2, data: { ...data2, proPhoto: { image: snap } }, now: NOW }); // صورة غير موسومة لا تدخل
  assert.equal(q.files.filter(f => f.group === 'img').length, 0);
});

test('README: التنبيه بالعربية والإنجليزية، الوحدات، جدول الطبقات كاملًا، التاريخ، وحدود النص العربي', async () => {
  const pack = await getPack(), t = new TextDecoder().decode(pack.files.find(f => f.path === '04-بيانات/README-اقرأني.txt').bytes);
  assert.ok(t.includes(PACK_DISCLAIMER_AR) && t.includes(PACK_DISCLAIMER_EN));
  assert.match(PACK_DISCLAIMER_AR, /تصميم أولي غير معتمد/); assert.match(PACK_DISCLAIMER_AR, /مكتب هندسي مرخّص/); assert.match(PACK_DISCLAIMER_AR, /التنفيذية والإنشائية/); assert.match(PACK_DISCLAIMER_EN, /licensed engineering office/);
  for (const l of DXF_LAYERS) { assert.ok(t.includes(l.name), l.name); assert.ok(t.includes(l.ar) && t.includes(l.en)); }
  assert.ok(t.includes('2026-11-12') && t.includes('$INSUNITS=6') && t.includes('1 وحدة رسم = 1 م') && t.includes('\\U+XXXX') && t.includes('LibreCAD') && t.includes('abcdef123456'));
  for (const f of pack.files) assert.ok(t.includes(f.path), 'README يذكر ' + f.path);
  assert.match(t, /ليست كيانات DIMENSION/); assert.match(t, /الواجهات والقطاع غير متوفرة بصيغة DXF/);
  assert.equal(readmeText({ title: 'x', date: 'd' }).includes(PACK_DISCLAIMER_AR), true);
});

test('design.json: المستند كما هو + الأرض + البرنامج + السجل + الإصدار، ويُعاد تحميله إلى جلسة صالحة', async () => {
  const pack = await getPack(), text = new TextDecoder().decode(pack.files.find(f => f.path === '04-بيانات/design.json').bytes), j = JSON.parse(text);
  assert.equal(j.schema, PACK_SCHEMA); assert.deepEqual(j.doc, JSON.parse(serialize(doc2)), 'المستند كما هو');
  const norm = v => JSON.parse(JSON.stringify(v));
  assert.deepEqual(j.land, norm(session2.input.land)); assert.deepEqual(j.program.requirements, norm(session2.input.requirements)); assert.equal(j.program.idea, 'فيلا دورين بتراس');
  assert.ok(Array.isArray(j.ledger) && j.ledger.length, 'سجل تنفيذ الطلبات'); assert.equal(j.site.version.commit, 'abcdef1234567890'); assert.equal(j.generatedAt, NOW.toISOString());
  assert.equal(j.geometryFingerprint, geometryFingerprint(doc2)); assert.ok(j.disclaimer.ar && j.units.length === 'm');
  const R = restoreDesignJson(text), store = new Map(), ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  assert.ok(saveSession(ls, R.session)); ls.setItem(STUDIO_KEY, R.studioRaw);
  const back = loadSession(ls); assert.ok(back, 'جلسة صالحة بعد إعادة التحميل'); assert.equal(back.approved, 0); assert.ok(store.has(SESSION_KEY));
  assert.deepEqual(JSON.parse(serialize(currentDoc(back))), JSON.parse(serialize(doc2)), 'تصميم الجلسة = التصميم المُسلَّم');
  assert.equal(geometryFingerprint(parseDoc(ls.getItem(STUDIO_KEY))), geometryFingerprint(doc2), 'بصمة الهندسة محفوظة');
  assert.deepEqual(back.input, norm(session2.input));
  // بلا جلسة (رسم يدوي): يُعاد المستند وحده
  const solo = restoreDesignJson(designJson({ doc: sampleVilla(), now: NOW })); assert.equal(solo.session, null); assert.ok(parseDoc(solo.studioRaw).walls.length);
  assert.throws(() => restoreDesignJson('{"schema":"x"}'), /ليس من حزمة المهندس/); assert.throws(() => restoreDesignJson('nope'), /ليس JSON/);
  const mz = pack.files.find(f => f.path.endsWith('.mizan.json')); assert.deepEqual(JSON.parse(new TextDecoder().decode(mz.bytes)), JSON.parse(serialize(doc2)), 'ملف المرسم');
});

test('ZIP الحزمة: مجلد جذر باسمها، CRC لكل ملف، أسماء عربية، ومجموعة DXF منفردة', async () => {
  const pack = await getPack(), z = await packZip(pack, { now: NOW }), m = unzip(z);
  assert.deepEqual([...m.keys()], pack.files.map(f => pack.root + '/' + f.path));
  for (const f of pack.files) assert.deepEqual(Buffer.compare(m.get(pack.root + '/' + f.path).data, Buffer.from(f.bytes)), 0, f.path);
  assert.ok([...m.keys()].some(k => k.includes('03-الكميات/')) && z.length < pack.size, 'مضغوط');
  const d = unzip(await packZip(pack, { group: 'dxf', now: NOW })); assert.equal(d.size, 3); assert.ok([...d.keys()].every(k => k.endsWith('.dxf')));
  if (HAS_PY) withTmp(dir => { const f = join(dir, 'p.zip'); writeFileSync(f, z); const r = JSON.parse(py('import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([z.testzip(), z.namelist()]))', f)); assert.equal(r[0], null); assert.deepEqual(r[1], [...m.keys()]); });
  assert.equal(packName('فيلا: العائلة / 1', NOW), 'almizan-فيلا-العائلة-1-2026-11-12'); assert.equal(slugName('  '), 'مشروع'); assert.ok(!/[\\/:*?"<>|]/.test(slugName('a\\b/c:d*e?f"g<h>i|j')));
});

// ---------------------------------------------------------------------------------------------- المتصفح: الزر ← تنزيل ← فحص الملف
test('متصفح: بطاقة «حزمة المهندس» أعلى المخرجات — الزر ينزّل ZIP صالحًا، وExcel منفردًا، وتعمل على الجوال', { timeout: 180000 }, async t => {
  let chromium; try { ({ chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs')); } catch { return t.skip('Playwright غير متاح في هذه البيئة'); }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => { const f = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!f.startsWith(root) || !existsSync(f) || extname(f) === '') { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  let browser; const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];
  // بيئة بلا لغة (LANG فارغ) تجعل Chromium يُسقط الأسماء غير اللاتينية إلى «download»؛ نضبط UTF-8 كما في أجهزة المستخدمين
  const env = { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  try { browser = await chromium.launch({ args, env }); } catch { try { browser = await chromium.launch({ args, env, executablePath: '/opt/pw-browsers/chromium' }); } catch { server.close(); return t.skip('تعذّر تشغيل Chromium'); } }
  const dir = mkdtempSync(join(tmpdir(), 'epk-dl-')), shots = process.env.EPK_SHOTS || null;
  try {
    const seed = { [STUDIO_KEY]: serialize(doc2), [SESSION_KEY]: JSON.stringify({ ...session2, approved: 0 }) };
    const open = async viewport => { const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(base + '/final.html'); await p.waitForSelector('#engpack #epkGo', { timeout: 60000 }); return { ctx, p, errs }; };
    const { ctx, p, errs } = await open({ width: 1366, height: 900 });
    assert.equal(await p.evaluate(() => document.querySelector('#fmain').firstElementChild.id), 'engpack', 'البطاقة أول ما في الصفحة');
    assert.match(await p.locator('#epkGo').innerText(), /نزّل حزمة المهندس \(ZIP\)/);
    assert.ok(await p.locator('#btnPrint').isVisible(), 'زر الطباعة القائم باقٍ');
    const requests = []; p.on('request', r => { if (r.method() !== 'GET') requests.push(r.method() + ' ' + r.url()); });
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }), p.click('#epkGo')]);
    assert.match(dl.suggestedFilename(), /^almizan-.+-\d{4}-\d\d-\d\d\.zip$/);
    const file = join(dir, 'pack.zip'); await dl.saveAs(file);
    const m = unzip(readFileSync(file)), names = [...m.keys()], rootName = dl.suggestedFilename().replace(/\.zip$/, '');
    assert.ok(names.every(n => n.startsWith(rootName + '/')));
    for (const need of ['01-DXF/A-00-SITE-PLAN.dxf', '01-DXF/A-01-GROUND-FLOOR-PLAN.dxf', '01-DXF/A-02-FIRST-FLOOR-PLAN.dxf', '02-SVG/اطبع-PDF.html', '03-الكميات/BOQ.xlsx', '03-الكميات/BOQ.csv', '04-بيانات/design.json', '04-بيانات/README-اقرأني.txt']) assert.ok(m.has(rootName + '/' + need), 'في الملف المنزَّل: ' + need);
    const dxf = parseDxf(m.get(rootName + '/01-DXF/A-01-GROUND-FLOOR-PLAN.dxf').data.toString('latin1')); checkStructure(dxf, 'المنزَّل');
    assert.equal(dxf.entities.filter(e => e.layer === 'A-DOOR-IDEN').length, doc2.openings.filter(o => o.level === doc2.levels[0].id && isDoorKind(o.kind)).length);
    assert.ok(m.get(rootName + '/04-بيانات/README-اقرأني.txt').data.toString('utf8').includes(PACK_DISCLAIMER_AR));
    const dj = restoreDesignJson(m.get(rootName + '/04-بيانات/design.json').data.toString('utf8')); assert.equal(geometryFingerprint(parseDoc(dj.studioRaw)), geometryFingerprint(doc2)); assert.ok(dj.session, 'الجلسة في الملف المنزَّل');
    const xl = unzip(m.get(rootName + '/03-الكميات/BOQ.xlsx').data); assert.match(xl.get('xl/worksheets/sheet1.xml').data.toString(), /<f>SUM\(G\d+:G\d+\)<\/f>/);
    if (HAS_PY) assert.equal(py('import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).testzip())', file).trim(), 'None');
    // القائمة بأحجامها بعد التجهيز، والتقدّم اكتمل، ورابط الحفظ اليدوي موجود
    const sizes = await p.locator('#epkList li:not(.off) em').allInnerTexts(); assert.ok(sizes.length >= 4 && sizes.every(s => /\d+ (?:ملف|ملفات) · [\d.]+ (?:ك\.ب|م\.ب|بايت)/.test(s)), 'أحجام: ' + sizes.join(' | '));
    assert.equal(await p.locator('#epkProg [role=progressbar]').getAttribute('aria-valuenow'), '100');
    assert.match(await p.locator('#epkDone a.epk-save').getAttribute('href'), /^blob:/); assert.equal(await p.locator('#epkDone a.epk-save').getAttribute('download'), dl.suggestedFilename());
    // Excel فقط وDXF فقط
    const [dx] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#epkXlsx')]); assert.match(dx.suggestedFilename(), /-BOQ\.xlsx$/);
    const xf = join(dir, 'b.xlsx'); await dx.saveAs(xf); assert.ok(unzip(readFileSync(xf)).has('xl/workbook.xml'));
    const [dd] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#epkDxf')]); assert.match(dd.suggestedFilename(), /-DXF\.zip$/);
    const df = join(dir, 'd.zip'); await dd.saveAs(df); assert.equal(unzip(readFileSync(df)).size, 3);
    assert.deepEqual(requests, [], 'لا شيء يُرفع للخادم'); assert.deepEqual(errs, [], 'لا أخطاء في الصفحة');
    if (shots) { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: join(shots, 'pack-desktop.jpg'), type: 'jpeg', quality: 72 }); }
    await ctx.close();
    // الجوال: البطاقة داخل العرض بلا تمرير أفقي، والزر بمساحة لمس كافية، والتنزيل يعمل
    const M = await open({ width: 390, height: 844 });
    const box = await M.p.locator('#engpack').boundingBox(), btn = await M.p.locator('#epkGo').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390.5, 'البطاقة داخل عرض الجوال'); assert.ok(btn.height >= 44 && btn.width >= 200, 'زر بمساحة لمس كافية');
    assert.deepEqual(await M.p.evaluate(() => [...document.querySelectorAll('#engpack button, #engpack li, #engpack p, #engpack h2')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.left < -0.5 || r.right > innerWidth + 0.5).length), 0, 'كل محتوى البطاقة داخل عرض الجوال');
    assert.ok(await M.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'الصفحة لا تتمرّر أفقيًا على الجوال');
    const [dm] = await Promise.all([M.p.waitForEvent('download', { timeout: 90000 }), M.p.tap('#epkGo')]); assert.match(dm.suggestedFilename(), /\.zip$/);
    if (shots) { await M.p.evaluate(() => window.scrollTo(0, 0)); await M.p.screenshot({ path: join(shots, 'pack-mobile.jpg'), type: 'jpeg', quality: 72 }); }
    assert.deepEqual(M.errs, []); await M.ctx.close();
  } finally { await browser.close(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});
