# P6V-03 persistence continuation — selector boundary

Candidate code remains `b59ee5a4aea0f271fff7c14c23f292f52fce160e`; this
checkout contains evidence-only descendants. The three retained files named by
the controller remain present and checksum-valid:

| File | SHA-256 |
| --- | --- |
| `2026-08-22-exact-candidate-driver-boundary.md` | `f7c6fbcce451431ee291b493499e2254638810ca257faff56ab449ea4d73f9ca` |
| `2026-08-22-harness-recovery-closeout.md` | `a9651424c393d44413e723567a5ed9af82ac4e6f20591537df54a034e92abef2` |
| `create-project-readiness.png` | `a48e0c09e908413e35d2e5194b77c6aeba5c164f26f2b794b7be6e71466e6638` |

One stable harness was repaired in place before every retry. Four newly
isolated HOME/XDG registries and visible Chrome profiles launched this source
checkout only with `node ./dist/cli/pokie.js --no-open`. Each reached rendered
`New Blueprint` → `Recommended` → `Show advanced options (JSON mode, load/save
by path)`. The built UI exposed no visible Form/JSON mode control that the
rendered-control driver could locate, so no Valera edit, native-picker request,
Create Project request, close, or reopen action was emitted. No Studio/product
error rendered. This is a selector/driver boundary, not a product finding.

The temporary harness run directories, browser profiles, fresh registries,
logs, and generated projects were removed. No screenshot or generated output
is retained for this incomplete continuation.
