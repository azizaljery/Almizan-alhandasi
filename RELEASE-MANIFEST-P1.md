# MIZAN Release Candidate — P1

Branch: integration/mizan-release
Baseline: Sites v33 source export
Baseline Sites commit: dbc41c0ec424e389f81f0f14f13d288682e6744d
Release candidate SHA-256: 9191e9c5f4c0ae076e2be6c87bfe2bf33fcb2bb88d6826350e67b99d4c736b58
Rollback archive SHA-256: 5cc8ac8e77c76472cd86756312856d17b8c298736f9b566b7a47ad9023fa5970

Integrated path:
UI -> Claude P1 corrected planner -> Gemini P1 review -> AZIZ Candidate4R3 -> selected model -> existing 2D/3D/BOQ/editor/project-save

Verified:
- baseline before edits: 78/78 tests, build exit 0
- final integration: 87/87 tests, build exit 0
- dedicated multi-engine integration tests included
- RECT/L/U and four entry directions tested
- AZIZ selected model is the same model consumed by 2D/3D/BOQ
- project save/import preserves integrated geometry
- opening editor exercised on integrated U model
- built-area cap failure remains explicit
- production site has NOT been changed by this branch

Release blockers still tracked:
- browser visual/cross-device acceptance is not independently closed because local Chromium did not complete
- production Worker gentle-sun-5ef5 remains manual and is not modified here
- live deployment requires the current Sites deployment path

Notes:
The three legacy style PNG assets in the full candidate are not referenced by the current application code. A no-assets source copy also passed 87/87 and build exit 0. The canonical release artifact remains the full candidate identified by the SHA-256 above.
