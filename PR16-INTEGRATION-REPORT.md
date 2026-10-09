# PR16 selective integration on Sites v48, with live-flow follow-up

Base: production Sites v48 source `f4f5489445b8f18eb4cf4ed4b1fda02c1773571b`

Source reference: PR16 head `bf7c2d28804e4ac73d4d41614255b2cec4f7e0f3`, based on PR13 and not a descendant of v48.

## Integrated

- Added the PR16 conversation-first studio and cinematic entrance as additive UI assets. The entry screen routes into the existing design workspace; “show advanced tools” restores the original workspace navigation.
- Kept the v48 archive UI, archive signatures and API, project file and history model, land survey/map, preference ranking, exact-dimension planner contract, and existing rich 3D scene/furniture code.
- Adapted the studio to v48 request fingerprints and generation state. The local path uses `analyzeClientRequest` and the existing integrated generator. The connected-AI path remains subject to v48's existing constraints and exact-dimension limitations.
- Replaced the obsolete Three.js global UMD URL with a pinned ESM runtime and fallback URL; the cinematic uses the same runtime as the original 3D viewer.
- Kept the original textured/furnished viewer and ported the sun/roof improvements: night previews dim and hide direct sun, daytime restores the lights, and the roof is enabled by default and stays under explicit user control across camera presets.
- Added explicit no-courtyard filtering at the current multi-engine shape selection and verified returned candidate geometry before selection.
- Tightened room-edit authorization: a broad rename/change phrase cannot authorize deleting rooms; category deletion must be unambiguous; area changes are scoped to a uniquely identified room and cannot spill over to a same-type sibling.
- Negative deletion, resize, count, room-dimension, and plot-dimension wording is not treated as a positive instruction. Excluded counts/dimensions are checked alongside unrelated positive constraints; a later correction supersedes its earlier version. Unknown dimensions fail closed. Arabic dual-bedroom forms count as exactly two.
- Bound approval to the exact visible request and plot snapshot. The request/plot controls lock while a proposal is pending; any changed snapshot is rejected for re-analysis before drawing.
- Added a deterministic pre-generation contract: explicit bedroom counts are exact unless the user says “at least”; explicit room dimensions are checked as dimensions (allowing rotation), never by area alone.
- Plot edits now refuse to break a saved survey-to-generator rectangle link and leave the current program unchanged when the proposed plot would conflict.
- The results panel has an explicit return-to-conversation action that restores the existing composer and focuses it without regenerating or discarding the accepted model, transcript, or draft.
- The local project-download notice now distinguishes downloading a local file from saving a version to the account archive.

## Verification

- Baseline before edits: `npm test` 181/181; `npm run build` passed.
- Final source: `npm test` 213/213; `npm run build` passed, including the archive Worker bundle and 131-module browser import graph.
- Regression tests cover unrelated bedroom deletion after a living-room edit, rename-only deletion, same-type sibling area scope, negative intent, distance/adjacency wording, exact proposal snapshot approval, exact/minimum/excluded bedroom counts, dual-count wording, same-area wrong room dimensions, no-courtyard filtering, day/night lighting, roof persistence, conversation revision ordering, and return-to-composer without model changes.
- Archive Worker, D1 schema/migrations, Sites auth wiring, site hosting settings, and release rollback files were not edited.
- Local Chromium/Playwright screenshots were not captured because this executor denies Chromium's Unix process-singleton socket. The v49 live flow exposed the missing conversation return path; this follow-up patch is not yet deployed and needs a live recheck. No live AI request or deployment was run from this worktree.
