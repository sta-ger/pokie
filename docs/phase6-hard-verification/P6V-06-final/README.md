# P6V-06 exact-candidate hard-closeout — inconclusive

Product candidate: `23860d7aeee8f5b477c9185c08496715ac2eaa30`.
Read-only companion: clean at `1e2c8c00457f3af389c0168432c08e63ca441465`.

`npm run generate-barrels` completed on the candidate. `git diff --exit-code -- src/index.ts` and `git status --porcelain` were both empty afterwards.
`src/index.ts` SHA-256: `78aba3ce9a79d4d54470d851c6edaad212ce64f6c3b0557ce103b8735b5ee283`.

The candidate was built once, then two isolated visible Studio launches used exactly `node ./dist/cli/pokie.js --no-open`.
Both reached the rendered Design Game Home, but automatic validation stayed at “Studio is checking this model automatically.”
Neither Create Project action produced a rendered pending, success, or error state.
The first control state proved the action was not accepted; the second launch used the one permitted safe retry after repairing the visible-control selector.
This is a readiness/driver inconclusive result, not a rendered product defect.

| Step | Exact-candidate mapping | Result |
| --- | --- | --- |
| P6V-01 | The older retained-evidence audit does not bind P6V-02–P6V-05 to `23860d7`. | Not reached. |
| P6V-02 | Its rendered Design/UX evidence names an older candidate. | Not reached. |
| P6V-03 | Its completed Mathematician journey names an older candidate. | Not reached. |
| P6V-04 | Its completed Producer journey names an older candidate. | Not reached. |
| P6V-05 | The companion SHA is exact and clean, but its PAR/Player product evidence names an older product SHA. | Not reached. |

Therefore this audit does not confirm the absence of unresolved P0, P1, or material P2 across P6V-01–P6V-05.
It observed no rendered product error in the two current-candidate launches.
Controller-owned release, packaging, post-merge, push, publication, and Drive checks remain unclaimed.

## Bounded proof

| File | SHA-256 | Purpose |
| --- | --- | --- |
| `01-studio-home-validation-pending.png` | `7b88c2d0ad219a6cabc83ecc9feeb1a1747a88bc58d650e85b20476c40a5f954` | Current-candidate visible Studio Home showing the validation-pending state. |
| `transcript.txt` | `12b1d479b32429560629e2207c333004f020b8545b054a4a4b32de3ae65d2206` | Exact commands, identities, and the rendered-state result. |

Superseded prior-candidate screenshots and transcript were removed from this P6V-06 folder.
The retained evidence is one screenshot plus this concise record; no generated project/output, profile, raw log, harness source, or download is committed.
