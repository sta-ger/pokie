# P6V-06 independent exact-candidate hard closeout — finding

Candidate examined: `55f1b659fe981afe938979e12cda7465954bb4a7`.
Companion examined read-only: `1e2c8c00457f3af389c0168432c08e63ca441465`.
Both checkout worktrees were clean at the start and end of this audit.

## Verdict

**P1 finding — the candidate cannot produce its required Studio build.**
`npm run build-cli` stopped before it could start Studio.  TypeScript could not
resolve the package's own `pokie` imports (for example,
`cli/build/applyBlueprintNameOverride.ts(1,34): TS2307`), followed by strict
errors whose imported types were consequently `unknown`.  The checkout has no
`node_modules/pokie` entry (`npm ls pokie --depth=0` is empty); `tsconfig.cli.json`
also clears `paths`.  The existing ignored `dist/cli/pokie.js` must not be used:
it is not a build of this candidate.  No Studio, Chromium, native picker, or
public workflow was launched.

This is a product/candidate build defect, not a readiness threshold.  It blocks
all rendered P6V-02--05 criteria, including the physical PAR/XLSX round trip.
No controller-owned release, packaging, push, publication, or Drive action was
run.

## One-to-one P6V-01--05 matrix

| Immutable step | Current exact-candidate result | Concrete independent evidence |
| --- | --- | --- |
| P6V-01 retained-evidence hygiene | passed | 132 retained Markdown/text records in the P6/P6R/P6T/P6V and P6-08/P6-10 scopes had zero broken relative links.  The Phase-6 hard-verification tree contains 155 files / 11,339,869 bytes; its largest file is 463,126 bytes, within the 5 MiB-per-file and 20 MiB-total policy. |
| P6V-02 Design/UX rendered audit | not reached | Candidate Studio could not be built.  The prior rendered evidence is bound to `540a60e`, not this SHA, and is not reused as current rendered proof. |
| P6V-03 Valera Mathematician journey | not reached | Candidate Studio could not be built.  No stale `dist` or private API path was used. |
| P6V-04 Valera Producer journey | not reached | Candidate Studio could not be built.  No stale `dist` or private API path was used. |
| P6V-05 physical PAR/XLSX and canonical Player matrix | not reached | The companion HEAD exactly matched the required `1e2c8c00457f3af389c0168432c08e63ca441465` and was clean, but the required candidate-built Studio was unavailable. |

The product tree has no non-documentation path delta from the P6V-05 product
candidate `caf8132177b23abc34096c6c3ce4079330b34080`; this helps attribute the
blocker but does not convert its historical UI evidence into exact-SHA proof.
The current P6V-06 candidate itself adds only audit documentation.

## Required correction and re-verification boundary

Restore a reproducible candidate build without relying on a stale self-package
under `node_modules`, then rerun the complete P6V-02--05 public rendered and
physical workflows from `node ./dist/cli/pokie.js --no-open` with new isolated
registries and browser profiles.  Retain only a concise transcript, checksums,
and the few representative screenshots needed for those journeys.
