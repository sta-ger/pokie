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

`PROVENANCE.json` binds a reviewer, UTC start/freeze times, the exact 40-character
candidate SHA, and a retained package artifact (relative path, SHA-256 and byte size).
The artifact's retained-content digest is the `candidatePackageSha256` used by every
record; a self-declared package SHA that differs from the retained artifact is invalid.
Every command has a unique ID, exact candidate/package binding, chronological start/end
times, exit status, command text, and distinct structured stdout/stderr evidence.
Structured evidence has a unique ID, retained relative path, digest, byte size, capture
timestamp, kind, summary, candidate ID, and package SHA-256; the validator rehashes it.
The Studio session has the same binding, a fresh-profile creation time, public `pokie`
launcher/rendered-controls declaration, chronological session times, and transcript.
Artifact-ledger evidence is candidate-bound and captured during the blind phase.
Use Studio only through its public launcher and rendered controls. Preserve all command
streams, failures, visible recovery states, artifact provenance, and screenshots needed
for visual claims.

`coverage.json` has exactly one complete, current-candidate record for each ID below.
Each names the executed public workflow and surface, expected role, fresh absolute clean
context, a `phase`, chronological timestamps, structured evidence, and the required
workflow observations. Every workflow except `known-findings` declares `phase: "blind"`
and completes no later than `frozenAt`. `known-findings` declares
`phase: "post-freeze-comparison"`; its start, end, and evidence capture must all be
strictly after `frozenAt`. It cannot be recorded during clean-room work. It cannot use
one generic non-empty file for all IDs. Required
observations include installed CLI/help/errors/artifacts; public Studio launcher and
rendered controls; role outputs; artifact/lifecycle boundaries; and Studio/isolated
example desktop+narrow player parity.

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

After the freeze, send the freeze receipt to a verifier-controlled location outside the
review run before opening known findings or completed campaign material. The immutable
receipt is JSON with `schemaVersion: 1`, `receiptId`, `trustedBy`, `issuedAt`, `reviewId`,
`candidateId`, `candidatePackageSha256`, `frozenAt`, and `frozenFindingsSha256`. The
verifier records the receipt's SHA-256 and independently supplies the expected candidate
SHA, package SHA, receipt path, and receipt SHA to the validator. A receipt in the review
directory, or a receipt whose digest is not the verifier-supplied digest, is invalid.
This external anchor prevents coordinated rewriting of the frozen file and mutable run
records from replacing the already frozen findings. The post-freeze comparison and
`known-findings` timestamps/evidence must be later than the receipt's `issuedAt`.

After the freeze, `comparison.json` records exactly one candidate-bound, structured
disposition for every frozen blind finding and cites the frozen-file hash. Its timestamp
and every disposition's evidence capture are strictly post-freeze.
`finding-register.json` carries every finding (including known and delta findings) with
severity, P2 materiality, reproducer, public surface, owner, status, and structured
evidence. A frozen finding's ID, severity, materiality, reproducer, public surface,
owner, and original evidence are immutable in the register; only disposition/delta data
and a delta-verified status may be added. `open`, `unresolved`, `accepted`, or
`blocked` P0/P1 findings, and any such material P2 finding, make release validation
fail. Classify P2 materiality before comparison: a material P2 blocks a core role,
destroys or mispublishes an artifact, loses lifecycle cleanup/provenance, or produces a
meaningful Studio/examples visual or semantic mismatch.

Each remediation gets a new clean context and separate candidate-bound, chronological
delta record that verifies the fix, lifecycle cleanup, and affected CLI/Studio/player
parity. It must not rewrite the original blind list or comparison. A `resolved` finding
therefore records a distinct delta review ID, absolute clean-context path, start/end
timestamps, those three observations, and retained structured delta evidence.
