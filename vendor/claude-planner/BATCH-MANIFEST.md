# planner-v2.3.0 -- IR-COMPAT-1: publish-time bridge to the live site's current API

Branch: dev/claude-planner-v2 (new commit on top of v2.2.1). Not merged to main.
Only NEW file in src/: compat-layer.mjs. AI/Cloudflare/Gemini/AZIZ/app.mjs/plan-view.mjs/
viewer3d.mjs/UI: untouched. No src/planner.mjs, estimates.mjs, migrations.mjs, or
PlannerOutputContract.mjs edits -- confirmed byte-identical to v2.2.1 below.

## Why this batch exists

Az asked for a plan to reach a "solid" public site. Before writing that plan, Claude inspected an
archived snapshot of the actual live site (al-mizan-al-handasi.aljeryabod.chatgpt.site) supplied
earlier in the conversation as Aziz.txt (a Safari web-archive), and found the live site's
planner.mjs is a DIFFERENT, older engine (`version: 1`, `ENGINE_VERSION: 'rectangular-2'`, no real
polygon, 521 lines) than the one delivered as v2.2.1. app.mjs calls `generateAlternatives(plot,
rooms)`, which v2.2.1 does not export, and reads fields (`model.architecture`, `model.strategy`,
`model.massingParts`, `model.builtArea`) that don't exist on v2.2.1's ValidatedDesignGeometry.
Swapping the file directly would break the live site immediately. Full analysis: docs/IR-COMPAT-1.md.

## Results (Node v22.22.2, TypeScript 6.0.3)

| Step | Command | Exit |
|---|---|---|
| Typecheck (`strict: true`, src/ incl. compat-layer.mjs) | npm run planner:typecheck | 0 |
| Tests 65/65 (52 existing + 13 new compat-layer.test.mjs) | node --test tests/*.test.mjs | 0 |
| Build (17 required exports, incl. generateAlternatives/generateModelLegacy) | node build.mjs | 0 |
| Isolated mutation, 20/20 killed | node tools/mutants.mjs [+ --only for the internal-timeout tail] | 0 |

Logs: evidence/typecheck.log, evidence/tests.log, evidence/build.log, evidence/mutants.log.
(independent-guard.test.mjs from the prior gate is not part of this working tree; this batch
branches from p8, the pre-gate source -- merge with that gate's tests before final delivery.)

## New tests -- tests/compat-layer.test.mjs (C01-C13)

| ID | Proves |
|---|---|
| C01 | generateAlternatives builds a real U/courtyard model where the documented "box problem" plot size used to fail, for all 4 entries |
| C02 | app.mjs's exact field-read contract: architecture.{tag,form,idea,bestFor,tradeoff}, strategy, STRATEGIES[strategy] |
| C03 | app.mjs's quantities field contract (footprint/rooms/circulation/reserve/doors/windows, all finite) |
| C04 | massingParts covers every room and corridor of a U model; legacy `building` rect still present |
| C05 | rect model has no massingParts (matches live site: plain rect never set it) |
| C06 | courtyard box is drawable exactly as plan-view.mjs draws it, and lies inside `building` |
| C07 | a plot too tight for U returns a working rect alternative + named failures, never throws |
| C08 | a plot too tight for anything throws one Arabic Error (matches old `if (!models.length) throw`) |
| C09 | inputs never mutated |
| C10 | deterministic across repeated calls |
| C11 | generateModelLegacy: old strategy names map to the correct new shape |
| C12 | engineVersion is a new string ('polygon-2'), never collides with legacy 'rectangular-2' |
| C13 | every bridged model still satisfies v2.2.1's own validateModel unchanged |

## src/ files -- unchanged vs v2.2.1 (byte-identical, confirmed)

```
8cf6b34251a9920b3da1912951b5ba2f425ae5b4f5f8946b12dfddafa0692560  src/planner.mjs
59ea7f70e877160024944e9f54665db3f49866d27bdbb6d390f80d0576eb19cf  src/estimates.mjs
b22b9545ccaade59a825424cf546b5c4e6d62c84ed0eefd7bd1622b0e1c40fb9  src/migrations.mjs
e36c24dd6351802bf7b4d18300ce81e46439b0f6bb9cc845794864a8662775a4  src/PlannerOutputContract.mjs
```
Matches the hashes published in the v2.2.1 manifest exactly -- no drift.

## Open items (unchanged from v2.2.1, not addressed in this batch)

1. `package-lock.json` / `npm ci`: still PENDING, same reason as before (no registry access here).
2. This batch's tests/ directory does not include independent-guard.test.mjs (branched from
   pre-gate p8) -- needs merging with the gate delivery before this is a true final package.
3. `placeOpening`/`removeOpening` (2D door/window editor) are NOT bridged -- v2.2.1 has no
   equivalent yet. Flagged in IR-COMPAT-1.md section 4, not silently dropped.
4. This is source only. No deployment. Staging verification by Az/second developer is the
   required next step before any live-site file is touched, per the agreed rollout order.

## Files changed vs v2.2.1

| File | Change |
|---|---|
| src/compat-layer.mjs | new |
| tests/compat-layer.test.mjs | new, 13 tests |
| docs/IR-COMPAT-1.md | new |
| build.mjs | +1 file to FILES, +1 export line, +2 required exports |
| tsconfig.json | +compat-layer.mjs to include |
| package.json | version 2.3.0, +compat-layer export path |
