# P6-20 independent visual/product-design audit

Candidate: `6f0c8788c42fffedb9407ad5b3f55443c4119651`
Audit scope: visual/product-design only; this is not the separate workflow-UX audit.

One fresh Chrome profile drove one local Studio instance using rendered controls and browser mouse/keyboard input only. The audit exercised Home/Design, the generated managed Blueprint workspace, Game Model, Play, Simulation, Replay, Build/Export, and Projects. Screenshots are bounded rendered evidence; no browser profiles, automation sources, raw logs, generated packages, or reports are retained.

Result: finding — P2 `p6-20-final-visual-design-closure-001`. Projects has no visible pagination, filtering, bulk cleanup, or stale-project grouping. A real persisted registry with stale entries rendered a very long flat table: the import controls were below the project list (the browser found the first Import Browse control at rendered y=12,933). This materially impairs wayfinding and the ability to import/open a current project. See `14-projects-stale-registry.png` and `15-projects-wide-stale-registry.png`.

`SURFACE-MATRIX.md` records surface/state observations and SHA-256 checksums.
