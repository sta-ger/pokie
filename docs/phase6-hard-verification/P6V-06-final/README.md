# P6V-06 independent exact-candidate hard closeout — inconclusive

Audited product: `2c70d14e04f22d490bca8ab85af67e4be8f5c563`.
Read-only companion: `1e2c8c00457f3af389c0168432c08e63ca441465`.
Both were clean and at those exact SHAs before the audit. This commit is an
evidence-only descendant; its product tree is identical to the audited tree.

## Fresh candidate result

`npm run build-cli` completed once, produced executable `dist/cli/pokie.js`
(`4643f200188d379630754512e8466ec7339bb715f44753ba9675e9e0f3e86495`),
and `node ./dist/cli/pokie.js --help` succeeded. The fresh build also produced
`dist/esm/index.js`, so the prior self-package-resolution P1 is fixed.

Two permitted isolated public Studio launches used only
`node ./dist/cli/pokie.js --no-open`, with new Studio homes and visible Chrome
profiles. The first rendered Design Game while automatic validation was still
checking; its Create Project click neither created a workspace nor rendered an
error. The retained harness was repaired to wait for the rendered **Valid — no
issues found.** state. The one safe retry likewise remained on Design Game for
45 seconds after the visible click, with no workspace, pending/success state,
or rendered product error. The fresh rendered initial state is
`fresh-studio-initial.png`; the concise exact-action record is
`rerun-transcript.txt`.

This is a **readiness-inconclusive** result under the verifier contract, not a
product finding: a bounded interaction wait alone, without a rendered error,
cannot be promoted to P1/P2. No third launch or duplicate creation request was
made. Therefore the PAR/XLSX native-picker round trip and the subsequent
Player surfaces were not reached; no controller-owned release, packaging,
push, publication, or Drive action was run.

## One-to-one P6V-01–P6V-05 matrix

| Immutable step | Result | Current exact evidence / reason |
| --- | --- | --- |
| P6V-01 retained-evidence hygiene | passed | The hard-verification evidence tree is 12 MiB, its largest file is below 5 MiB, and this final delta contains only this index, one concise transcript, one screenshot and the short build transcript. The companion is clean at its required SHA. |
| P6V-02 Design/UX | not reached | The fresh candidate rendered Design Game, but could not reach Workspace after the permitted rendered retry. Historical rendered records are not promoted to this SHA. |
| P6V-03 Valera Mathematician | not reached | Its required distinct workspace, model, Play, Simulation, Replay and export journey depends on a confirmable project creation. |
| P6V-04 Valera Producer | not reached | Same candidate-bound workspace prerequisite; no duplicate or third public workflow launch is permitted. |
| P6V-05 physical PAR/XLSX and canonical Player surfaces | not reached | The exact companion is available and clean, but the candidate Studio never reached the public Home/Projects flow that exposes the native PAR picker. No private API substitution was used. |

No product P0, P1, or material P2 was observed in this audit. This is not a
passing release verdict because P6V-02 through P6V-05 remain unverified on the
exact candidate.
