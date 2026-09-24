#!/usr/bin/env node
// mutants.mjs -- ISOLATED mutation testing. Each mutant is applied to a throw-away copy of src/ +
// tests/ in the OS temp dir; the package's own src/ is never written. src/ hashes are checked
// before and after the run. A mutant is KILLED when its target test fails.
// Exit 0: every mutant killed. Exit 1: a mutant survived. Exit 2: setup error (e.g. an anchor no
// longer matches exactly once -- the mutant is reported, never skipped silently).
// Usage: node tools/mutants.mjs [--only=M01,M02]
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync, rmSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** @returns {string} */
const srcHash = () => createHash('sha256').update(readdirSync(SRC).sort().map((f) => f + '\0' + readFileSync(join(SRC, f), 'utf8')).join('\0')).digest('hex');

/** @type {[name: string, file: string, from: string, to: string, target: string][]} */
const MUTANTS = [
  ['M01 roofPolicy consistency check removed', 'planner', "    if (!ROOF_POLICIES.includes(c.roofPolicy) || c.roofable !== (c.roofPolicy !== 'OPEN_TO_SKY')) fail(", '    if (false) fail(', 'R13'],
  ['M02 room-in-courtyard check removed', 'planner', 'if (m.rooms.some(r => overlap(r, c))) fail(', 'if (false) fail(', 'R11'],
  ['M03 fallback flag not set', 'planner', 'shapeFallback = shapeKey !== plot.shape;', 'shapeFallback = false;', 'R06'],
  ['M04 shape lookup via `in` (prototype keys)', 'planner', 'if (Object.hasOwn(SHAPES, key)) return', 'if (key in SHAPES) return', 'R05'],
  ['M05 outline-in-footprint check removed', 'planner', 'if (!m.buildingFootprint.every(pt => containsPoint(m.footprint, pt))) fail(', 'if (false) fail(', 'R12'],
  ['M06 extra field leaks into model', 'planner', 'drawnFloors: 1, warnings: [],', 'drawnFloors: 1, warnings: [], debug: true,', 'R15'],
  ['M07 hidden module state in ids', 'planner', "return { ...rest, id: 'opening-' + i, wallId: w.id, pos };", "return { ...rest, id: 'opening-' + (globalThis.__n = (globalThis.__n || 0) + 1), wallId: w.id, pos };", 'R16'],
  ['M08 courtyard shifted 1 cm', 'planner', "const courtyard = { name: 'فناء', x: leftBox.w + X, y: 0,", "const courtyard = { name: 'فناء', x: leftBox.w + X, y: 0.01,", 'R09'],
  ['M09 width 8 rejected (off-by-one)', 'planner', 'raw.width < 8 ||', 'raw.width <= 8 ||', 'R01'],
  ['M10 reserve 50 rejected (off-by-one)', 'estimates', 'reserve > 50', 'reserve >= 50', 'R18'],
  // v2.2.1
  ['M11 courtyard finite/positive check removed', 'planner', "if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || !(c.w > 0) || !(c.h > 0)) { fail('أبعاد الفناء", "if (false) { fail('أبعاد الفناء", 'H01'],
  ['M12 courtyard-notch match removed', 'planner', "|| pointInPolygon(m.buildingFootprint, center(c))) fail('الفناء لا يطابق", "|| true) if (false) fail('الفناء لا يطابق", 'H02'],
  ['M13 courtyard count check removed', 'planner', "if (courtyards.length !== (m.shape === 'u' ? 1 : 0)) fail(", 'if (false) fail(', 'H03'],
  ['M14 area check back to targetArea (NaN passes)', 'planner', 'if (!(Math.abs(r.w * r.h - (requested ? requested.area : NaN)) <= E)) fail(', 'if (Math.abs(r.w * r.h - r.targetArea) > E) fail(', 'H04'],
  ['M15 targetArea-vs-program check removed', 'planner', 'else if (r.targetArea !== requested.area || r.area !== requested.area) fail(', 'else if (false) fail(', 'H04'],
  ['M16 shape key not lower-cased', 'planner', 'const key = value.trim().toLowerCase();', 'const key = value.trim();', 'R05'],
  ['M17 frontage explanation removed', 'planner', 'if (diagnostics.frontage < MIN_WING_WIDTH - E) throw', 'if (false) throw', 'H07'],
  ['M18 migration guesses OPEN_TO_SKY', 'migrations', 'if (c.roofable === false) {', 'if (true) {', 'H09'],
  ['M19 migration mutates its input', 'migrations', 'const model = JSON.parse(JSON.stringify(stored));', 'const model = stored;', 'H08'],
  ['M20 reserved roof states priced', 'planner', 'if (unsupported) throw Error(', 'if (false) throw Error(', 'H10'],
];

// Optional subset: --only=M01,M15  (for re-running one mutant, or chunking a long run)
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
const selected = only ? MUTANTS.filter(([name]) => only.has(name.split(' ')[0])) : MUTANTS;
if (only && selected.length !== only.size) { console.error('SETUP-ERROR unknown mutant id in --only'); process.exit(2); }

const before = srcHash();
const sandbox = mkdtempSync(join(tmpdir(), 'planner-mutants-'));
let killed = 0, setupError = false;
try {
  cpSync(join(ROOT, 'tests'), join(sandbox, 'tests'), { recursive: true });
  const tests = readdirSync(join(sandbox, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => join('tests', f));
  for (const [name, file, from, to, target] of selected) {
    rmSync(join(sandbox, 'src'), { recursive: true, force: true });
    cpSync(SRC, join(sandbox, 'src'), { recursive: true });
    // ZIP-extracted src/ may be read-only (mode 0444, e.g. some archivers, or a checked-out
    // release tree); make the sandbox copy writable before mutating it. Never touches SRC itself.
    for (const f of readdirSync(join(sandbox, 'src'))) chmodSync(join(sandbox, 'src', f), 0o644);
    const path = join(sandbox, 'src', file + '.mjs');
    const original = readFileSync(path, 'utf8');
    if (original.split(from).length !== 2) { console.error(`SETUP-ERROR ${name}: anchor not found exactly once in src/${file}.mjs`); setupError = true; continue; }
    writeFileSync(path, original.replace(from, to));
    // Pin the reporter and isolation so individual test names remain observable.
    // Reject runner failures separately from genuine mutation survivors.
    const run = spawnSync(process.execPath, ['--test', '--test-isolation=none', '--test-reporter=tap', ...tests], { cwd: sandbox, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const out = run.stdout || '';
    if (run.error || run.signal || !/^# tests \d+$/m.test(out) || !new RegExp('^# Subtest: ' + target + '\\b', 'm').test(out)) {
      console.error(`SETUP-ERROR ${name}: runner failed or target not observed (${run.error?.message || run.signal || run.stderr || 'missing TAP target'})`);
      setupError = true;
      continue;
    }
    const failing = [...out.matchAll(/^not ok \d+ - (.{0,48})/gm)].map((x) => x[1]);
    const ok = run.status === 1 && failing.some((t) => t.startsWith(target));
    if (ok) killed++;
    console.log(`${ok ? 'KILLED  ' : 'SURVIVED'} ${name} | target ${target} | failing: ${failing.map((t) => t.split(' ')[0]).join(', ') || '-'}`);
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
const after = srcHash();
if (before !== after) { console.error('FATAL: package src/ changed during the run'); process.exit(2); }
console.log(`killed ${killed}/${selected.length}${only ? ' (subset)' : ''}; package src/ untouched (sha256 ${after.slice(0, 16)}...)`);
process.exit(setupError ? 2 : killed === selected.length ? 0 : 1);
