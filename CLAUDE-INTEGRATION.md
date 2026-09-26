# Claude 2.2.1 integration — 2026-09-24

Base Site source: fd6fb8e9c47e5f151b5230775f1297fd8192e368 (version 31).
Input archive SHA-256: 7afde4e05b3d7f7d123772041b3fe3005411ac316753fc25985f494b5bd6178b.

## Implemented

- Vendored original Claude source and all 62 tests, without changing source or acceptance assertions.
- Fixed mutation execution to request non-isolated per-test TAP explicitly and distinguish runner/setup failures from surviving mutants. Node 24+ is declared.
- Generated a real npm lockfile; pinned TypeScript 6.0.3; corrected package version to 2.2.1.
- Published source copies under dist/claude are checked byte-for-byte at build time.
- Browser worker and no-Worker path request Claude as an additional rectangular alternative.
- Existing alternatives, Gemini files, UI styling and external AI services are preserved.
- Adapter enforces the site's maxBuiltArea, routes v2 validation/quantities to Claude, preserves save/load strategy and supports the existing 2D/3D consumers.
- Increased saved-alternative bound to the number of registered strategies.

## Checks actually run

Environment: Node v24.19.0, npm 11.9.0.

- vendor/claude-planner: npm ci --ignore-scripts — exit 0.
- vendor/claude-planner: npm run planner:build — typecheck exit 0, tests 62/62, build exit 0.
- vendor/claude-planner: npm run planner:mutants — 20/20 KILLED, exit 0, one complete run; original src mode 0444 and hash unchanged.
- Site: npm test — 78/78, exit 0.
- Site: npm run build — exit 0.

## Boundaries

- No standalone AZIZ orchestrator was found in this Site checkout. This integrates with the existing Site planner and home decision engine; it is not a verified merge of a separate AZIZ package.
- Claude's L/U and migration functionality are retained and tested in the package. The new user-facing Claude alternative is rectangular; the site's existing courtyard/U alternatives remain unchanged.
- 3D tests use the existing Three/DOM test doubles, not a real WebGL browser.
- scripts/verify-live.mjs checks actual public production bytes and executes the downloaded client planner for four entry directions. Its result is only available after deployment; no pre-deployment live pass is claimed here.
