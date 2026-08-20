# P6-20 independent visual/product-design audit

One fresh Chrome/X11 profile inspected the candidate implementation served from this checkout by exactly `node ./dist/cli/pokie.js --no-open`. Browser actions used visible controls and browser mouse/keyboard input only. The read-only companion checkout was clean at `6bb67dee3d2e8e98bab754e1000019701a17266b` before the run.

The audit found one material P2 design defect: switching a valid Recommended Blueprint to **Per-reel (Reel Strip Modeler)** discards all five populated reel strips with no warning, conversion, or recovery affordance. It creates nine visible validation errors and prevents project creation. No P0/P1 visual defect was observed.

All retained PNGs are under 0.7 MiB. The generated Blueprint Project, browser profile, Studio process logs, and temporary automation were removed rather than committed.
