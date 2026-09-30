# MIZAN Engineering — Site v37 navigation follow-up

Production baseline: Sites v37, source commit `d65fae7ad33949747340344eb318734d9f130e51`.

Change: the portal’s “فهم العميل” action now opens the existing design workspace before scrolling to and focusing the client-idea field. The design-card route and reviewed-change gating remain unchanged.

Validation in the Site source checkout:
- `node scripts/build.mjs` — PASS
- `node --test tests/*.test.mjs` — 94/94 PASS, including two portal navigation regression checks

This is a frontend-only release candidate. No Worker, AI, security, access-policy, or room-program behavior was changed. The candidate has not yet been saved or deployed; Site v37 remains the rollback baseline. Automated checks do not replace a fresh live-browser check of the portal route.
