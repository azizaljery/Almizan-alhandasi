# MIZAN Engineering — v33 P1 Release Candidate

Baseline: Sites v33 source export at commit dbc41c0ec424e389f81f0f14f13d288682e6744d.
Integrated path: Claude P1 -> Gemini P1 -> AZIZ -> selected model -> existing 2D/3D/BOQ.

Verification in clean extraction:
- npm test: 87/87 PASS
- npm run build: PASS
- Added release consistency test proves the AZIZ-selected model is the same model consumed by 2D SVG, 3D wall geometry, and BOQ quantity rows.
- Existing integration tests cover RECT/L/U, four entry directions, setbacks, save/restore, opening editor and explicit built-area-cap failure.

Browser visual gate:
- Automated local Chromium attempt did not complete in the container and produced no screenshot. This is NOT recorded as a visual pass.

Deployment:
- Not deployed by this package.
- Keep current v33 source as rollback baseline.
