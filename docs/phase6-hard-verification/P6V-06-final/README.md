# P6V-06 independent exact-candidate hard closeout — finding

Audited product: `2c70d14e04f22d490bca8ab85af67e4be8f5c563`.
Read-only companion: `1e2c8c00457f3af389c0168432c08e63ca441465`.
Both were clean and at those exact SHAs before the audit. This commit is an
evidence-only descendant; its product tree is identical to the audited tree.

## Fresh candidate result

`npm run build-cli` completed once, produced executable `dist/cli/pokie.js`
(`4643f200188d379630754512e8466ec7339bb715f44753ba9675e9e0f3e86495`),
and `node ./dist/cli/pokie.js --help` succeeded. The fresh build also produced
`dist/esm/index.js`.

One fresh isolated Studio launch used only
`node ./dist/cli/pokie.js --no-open`, with a new Studio home and visible Chrome
profile. The repaired harness waited for rendered **Valid — no issues found.**
and then made one visible **Create Project** action. Studio visibly saved the
Blueprint, then rendered a Workspace-open error: its materialized package could
not load `node_modules/pokie/dist/cjs/index.js`. The bounded action record is
`rerun-transcript.txt`.

This is a **P1 finding**, not a readiness result: the primary public action was
accepted, persisted its Blueprint, and rendered the concrete product error. A
second creation request was not sent. The PAR/XLSX native-picker round trip and
subsequent Player surfaces remain blocked by the failed Workspace transition;
no controller-owned release, packaging, push, publication, or Drive action was
run.

## One-to-one P6V-01–P6V-05 matrix

| Immutable step | Result | Current exact evidence / reason |
| --- | --- | --- |
| P6V-01 retained-evidence hygiene | passed | The hard-verification evidence tree is 12 MiB, its largest file is below 5 MiB, and this final delta contains only this index and two concise transcripts; no generated output, raw log, harness, or superseded screenshot is retained. The companion is clean at its required SHA. |
| P6V-02 Design/UX | finding | Exact-candidate Design Game accepted Create Project and saved its Blueprint, but visibly failed to open Workspace because the materialized package lacks `node_modules/pokie/dist/cjs/index.js`. |
| P6V-03 Valera Mathematician | not reached | Its required distinct workspace, model, Play, Simulation, Replay and export journey is blocked by the P6V-02 Workspace-open P1. |
| P6V-04 Valera Producer | not reached | Its distinct workspace journey is blocked by the same exact-candidate P6V-02 Workspace-open P1. |
| P6V-05 physical PAR/XLSX and canonical Player surfaces | not reached | The exact companion is available and clean, but the candidate Studio cannot reach the Workspace/Home flow required for the public PAR picker and Player surfaces. No private API substitution was used. |

This is not a passing release verdict. The unresolved P1 must return to
correction and affected verification before final review.
