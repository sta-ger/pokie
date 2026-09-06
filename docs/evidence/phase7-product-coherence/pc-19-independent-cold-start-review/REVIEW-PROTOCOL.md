# PC-19 review protocol

Run this review in a newly created clean room, using the installed candidate package
and its `pokie` executable. Before reading repository source, tests, roadmap material,
completed evidence, known findings, fixes, or prior acceptance evidence, record
exploration findings in `frozen-findings.json`. Record the exact required attestation
in `PROVENANCE.json`, calculate the SHA-256 of the frozen file, and write that hash to
`PROVENANCE.json` before opening completed campaign records. Never edit the frozen
file; remediation creates a new delta run and retains this run unchanged.

Use these required files in every append-only run:

```text
PROVENANCE.json
frozen-findings.json
comparison.json
coverage.json
finding-register.json
evidence/                         # streams, transcript, ledger, screenshots, delta records
```

`PROVENANCE.json` binds a reviewer, UTC start/freeze times, package specifier, package
SHA-256, absolute installed executable path, timestamped command stdout/stderr and exit
records, fresh absolute browser-profile path, browser transcript, and artifact ledger.
Use Studio only through its public launcher and rendered controls. Preserve all command
streams, failures, visible recovery states, artifact provenance, and screenshots needed
for visual claims.

`coverage.json` has one complete, current-candidate evidence record for each of:

- `known-findings`, `blind-cli-exploration`, `blind-studio-exploration`,
  `systemic-cli-sweep`, `systemic-studio-sweep`, `duplicate-audit`,
  `artifact-torture`, `cli-studio-semantic-parity`, `player-examples-parity`, and
  `lifecycle-recovery`.
- `role-math-par`, `role-game-frontend-package`,
  `role-qa-simulation-report-replay`, `role-outcome-library-integration`,
  `role-stake-deployment-export`, and `role-new-project-preparation-retry`.

The artifact and lifecycle records cover Blueprint, PAR, runtime package, Outcome
Library, Stake conversion/import/re-export, stale drift, caller-owned destinations,
cancellation, staging cleanup, retry, provenance, project switch, server shutdown and
failed publication. Player evidence compares Studio and isolated examples at desktop
and narrow viewports for feature/win/inspection/reset/project-switch behaviour and
rendered layout.

After the freeze, `comparison.json` records exactly one disposition for every frozen
blind finding and cites the frozen-file hash. `finding-register.json` carries every
finding (including known and delta findings) with severity, P2 materiality, reproducer,
public surface, owner, status, and evidence path. `open`, `unresolved`, `accepted`, or
`blocked` P0/P1 findings, and any such material P2 finding, make release validation
fail. Classify P2 materiality before comparison: a material P2 blocks a core role,
destroys or mispublishes an artifact, loses lifecycle cleanup/provenance, or produces a
meaningful Studio/examples visual or semantic mismatch.

Each remediation gets a new clean context and a separate delta record that verifies the
fix, lifecycle cleanup, and affected CLI/Studio/player parity. It must not rewrite the
original blind list or comparison. A `resolved` register finding therefore records its
delta review id, absolute clean-context path, and retained delta evidence path; the
validator rejects a resolved finding without all three.
