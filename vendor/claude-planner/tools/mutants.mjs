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
import { pathToFileURL, fileURLToPath } from 'node:url';

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

/**
 * Node's structured event stream avoids human reporter formats and file-level summaries.
 * Errors retain code/failureType; a loader error or timeout cannot count as an assertion kill.
 */
export default async function* reporter(events) {
  for await (const e of events) {
    if (e.type !== 'test:pass' && e.type !== 'test:fail') continue;
    const d=e.data, error=d.details?.error;
    yield JSON.stringify({type:e.type,name:d.name,skip:d.skip,todo:d.todo,
      code:error?.code,causeCode:error?.cause?.code,
      causeName:error?.cause?.name,causeStack:error?.cause?.stack,
      failureType:error?.failureType})+'\n';
  }
}

export function classifyRun(result, target, mutatedFile) {
  if (result.error || result.signal || result.status === null) return 'INCONCLUSIVE';
  let events;
  try { events=result.stdout.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)); }
  catch { return 'INCONCLUSIVE'; }
  const relevant=events.filter(e=>e.name === target || e.name.startsWith(target+' '));
  const failures=events.filter(e=>e.type==='test:fail');
  const assertion=e=>e.code==='ERR_ASSERTION' || e.causeCode==='ERR_ASSERTION';
  // A passing target can also be killed by a newly thrown domain Error originating
  // in the mutated source itself (M16). Loader/TypeError/tool failures stay inconclusive.
  const domainFailure=e=>mutatedFile && e.failureType==='testCodeFailure' &&
    e.causeName==='Error' && !e.causeCode &&
    e.causeStack?.split('\n')[1]?.includes(pathToFileURL(mutatedFile).href+':');
  const killedFailure=e=>assertion(e) || domainFailure(e);
  if (failures.some(e=>!killedFailure(e))) return 'INCONCLUSIVE';
  if (result.status !== 0 && relevant.some(e=>e.type==='test:fail' && killedFailure(e))) return 'KILLED';
  if (result.status === 0 && relevant.some(e=>e.type==='test:pass' && !e.skip && !e.todo)) return 'SURVIVED';
  return 'INCONCLUSIVE';
}

export function main() {
  const onlyArg=process.argv.find(a=>a.startsWith('--only='));
  const only=onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
  const selected=only ? MUTANTS.filter(([name])=>only.has(name.split(' ')[0])) : MUTANTS;
  if (only && selected.length!==only.size) {console.error('INCONCLUSIVE unknown mutant');return 2;}
  const before=srcHash(), sandbox=mkdtempSync(join(tmpdir(),'planner-mutants-'));
  let killed=0, inconclusive=0;
  const env={...process.env}; delete env.NODE_TEST_CONTEXT;
  const reportPath=pathToFileURL(fileURLToPath(import.meta.url)).href;
  const run=(tests,pattern)=>spawnSync(process.execPath,[
    '--test','--test-reporter='+reportPath,...(pattern ? ['--test-name-pattern=^'+pattern+'(?: |$)'] : []),...tests
  ],{env,cwd:sandbox,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  try {
    for (const dir of ['src','tests','tools']) cpSync(join(ROOT,dir),join(sandbox,dir),{recursive:true});
    const tests=readdirSync(join(sandbox,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>join('tests',f));
    const baseline=run(tests);
    console.log('BASELINE exit='+baseline.status+' signal='+baseline.signal);
    if (baseline.status!==0 || baseline.error || baseline.signal ||
        selected.some(([, , , , target])=>classifyRun(baseline,target)!=='SURVIVED')) {
      console.error('INCONCLUSIVE baseline failed\n'+baseline.stdout+'\n'+baseline.stderr);return 2;
    }
    for (const [name,file,from,to,target] of selected) {
      rmSync(join(sandbox,'src'),{recursive:true,force:true});
      cpSync(SRC,join(sandbox,'src'),{recursive:true});
      for (const f of readdirSync(join(sandbox,'src'))) chmodSync(join(sandbox,'src',f),0o644);
      const path=join(sandbox,'src',file+'.mjs'), original=readFileSync(path,'utf8');
      if (original.split(from).length!==2) {console.log('INCONCLUSIVE '+name+' anchor mismatch');inconclusive++;continue;}
      writeFileSync(path,original.replace(from,to));
      const result=run(tests,target), status=classifyRun(result,target,path);
      if (status==='KILLED') killed++;
      if (status==='INCONCLUSIVE') inconclusive++;
      console.log(status+' '+name+' | target='+target+' exit='+result.status+' signal='+result.signal);
      console.log(result.stdout);
      if (result.stderr) console.log(result.stderr);
    }
  } finally {
    rmSync(sandbox,{recursive:true,force:true});
    if (before!==srcHash()) throw Error('FATAL package src changed');
    console.log('SOURCE_SHA256 before='+before+' after='+srcHash());
  }
  console.log('killed '+killed+'/'+selected.length+'; inconclusive '+inconclusive);
  return inconclusive ? 2 : killed===selected.length ? 0 : 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  process.exitCode=main();
}
