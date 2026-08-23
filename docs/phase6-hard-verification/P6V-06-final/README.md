# P6V-06 independent exact-candidate hard closeout — finding

Audited product candidate: `101ec244b8e922af919a4c3c2e7644f850884dbc`.
Read-only companion candidate: `1e2c8c00457f3af389c0168432c08e63ca441465`.
Both checkouts were clean before the audit. This evidence-only descendant
changes documentation only; its non-documentation product tree is identical to
the audited candidate.

## Verdict

**P1 — `npm run build-cli` does not produce a launchable Studio CLI from a
clean candidate build.** The command completed and wrote a fresh executable
`dist/cli/pokie.js` (SHA-256
`4643f200188d379630754512e8466ec7339bb715f44753ba9675e9e0f3e86495`).
Launching it immediately with `node ./dist/cli/pokie.js --help` failed before
Studio could start: Node resolved the CLI's `pokie` self-import through the
current package export and could not find `dist/esm/index.js`. `build-cli`
does not create that ESM artifact. The concise command/output record is in
[`build-launch-transcript.txt`](build-launch-transcript.txt).

This is a candidate product/build failure, not a timeout or browser-driver
result. No stale `node_modules/.bin/pokie`, stale installed self-package,
Studio, Chromium, dev server, private API, native picker, or release/push/
publication/Drive workflow was used.

## One-to-one P6V-01–05 matrix

| Immutable step | Exact-candidate result | Evidence and boundary |
| --- | --- | --- |
| P6V-01 retained-evidence hygiene | passed | The hard-verification tree has 157 files, 11,343,521 bytes total, and largest file 463,126 bytes—within the 5 MiB/file and 20 MiB/evidence-delta policy. Relative links within this tree resolve. The supplied companion checkout is clean at its required SHA. |
| P6V-02 Design/UX | not reached | The candidate-built CLI cannot launch Studio. Earlier rendered records are bound to older candidates and are not promoted to this SHA. |
| P6V-03 Valera Mathematician | not reached | The first prerequisite—fresh candidate Studio launched from `node ./dist/cli/pokie.js --no-open`—is impossible. |
| P6V-04 Valera Producer | not reached | Same blocking launch failure; no separate or duplicate workflow was started. |
| P6V-05 physical PAR/XLSX and canonical Player surfaces | not reached | The companion is exact and clean, but the required candidate-built Studio cannot open the real native PAR picker or complete the physical round trip. Historical Player evidence remains historical only. |

There are consequently no current P0 findings, and the single observed P1
remains unresolved. The controller-owned release gate, packaging, tree
exactness after merge, push, publication, and Drive round trip were not run.

## Required correction

Make `npm run build-cli` produce every artifact required by the current CLI
self-package imports (or otherwise make that CLI launch independently), then
rerun the full fresh public P6V-02–05 rendered and physical workflows on the
new exact candidate. Do not treat an earlier `dist/esm` tree, installed
self-dependency, or historical evidence as the correction.
