# MIZAN Engineering — Site v39 candidate: 2D editor coordinates

Production rollback baseline: Sites v38 source snapshot `465cc257ff53bf9f363f7d0e85c20768a5722417`.
Independent GitHub regression baseline: `main` at `b3d416a107ae2d7d5d7263051a1460391830ab62`.

Pre-existing source drift: the GitHub main tree and the Site v38 source snapshot are not identical. Each baseline was patched and verified independently. This Site release will be packaged from the existing v38 source snapshot so unrelated Worker/AI and other source differences are not synchronized into the Site.

Change: convert non-move 2D editor pointer Y back from inverted SVG coordinates to positive model coordinates before window/door placement and opening removal. Correct room-move preview and model deltas, cancel without committing, and restore the temporary preview.

Regression coverage uses actual viewport transforms after zoom. It checks window placement/removal and model validity, zero/horizontal/vertical room movement, preview translation, and cancellation. The opening-coordinate regression fails with the original callback behavior.

Verification in the independent GitHub-main and Site-v38 worktrees:
- `node scripts/build.mjs` — PASS
- `node --test tests/*.test.mjs` — 95/95 PASS on each baseline
- Regenerated source and release checksum manifests on each baseline

Live v38 UI reached the 2D editor and reproduced rejected wall clicks; no project was saved. The corrected interaction still needs live confirmation after deployment. Live 3D remains unverified in cloud Chromium because WebGL is unavailable there.

Frontend-only candidate. No Worker, AI, security, access-policy, or room-program behavior changed. This candidate has not been saved or deployed; v38 remains the rollback baseline.
