# Agent Handoff

Actor: AZIZ auditor / DeepSeek

Branch: `dev/aziz-engine-candidate4`

Scope: @mizan/aziz-engine Candidate #4

## Task

Assemble the complete package from latest audited fixes, then run typecheck, tests, build and targeted runtime verification. Apply only minimal patches for reproduced failures. Do not edit Planner, Design Intelligence, engineering-core, SHARA, 2D or 3D.

## Delivery

Commit code and tests to this branch. Open a PR to `integration/multi-engine`, not directly to `main`.

PR evidence must include exact commands, exit codes, passed/failed test counts, build result, known limitations, and version/checkpoint information.

Do not claim VERIFIED without actual execution evidence.
