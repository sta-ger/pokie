# Public-surface census and ownership ledger

This is the Phase 7 discovery ledger.  It distinguishes an advertised or
help-listed surface from a verified one: every row begins as `collect`, and a
later owner may change it only by citing a clean-room run artifact.  The owner
handles are explicit delivery owners, not implementation prescriptions.

## CLI command and option census

| Coverage family | What the clean-room run records | Evidence authority | Future owner | Status |
| --- | --- | --- | --- | --- |
| Root invocation | default output, `--help`/`-h`, `--version`/`-V`, exit statuses and aliases | installed root help/output | `phase7-cli-owner` | collect |
| Every public verb | each verb/subcommand shown by installed root or recursive help | `cli/help-index.tsv` plus captured help | `phase7-cli-owner` | collect |
| Every public option | spelling, value placeholder, help text, displayed default, and owning verb | captured per-command help | `phase7-cli-owner` | collect |
| Parser recovery | unknown-command visible diagnostic and exit status | `cli/errors/unknown-command.*` | `phase7-cli-owner` | collect |
| File/server-producing verbs | their advertised artifact/endpoint claim only; no workflow execution is implied here | installed help and artifact ledger | `phase7-artifact-owner` | collect |

The recursive installed-help index is deliberately the complete command and
option list.  It prevents this ledger from freezing a source-derived command
list and guarantees that a newly shipped public verb, option, alias, or nested
subcommand acquires the `phase7-cli-owner` automatically.

## Studio page, action, and state census

| Coverage family | What the clean-room transcript records | Future owner | Status |
| --- | --- | --- | --- |
| First render | initial page title, visible navigation, empty/loading/error content, and launch error if any | `phase7-studio-owner` | collect |
| Top-level pages | every visibly offered top-level page reachable without domain data | `phase7-studio-owner` | collect |
| Project/dashboard pages | every visibly offered page/tab after a project is openly available; record route/title as rendered, not guessed | `phase7-studio-owner` | collect |
| Visible actions | labels, enabled/disabled state, confirmation/recovery behavior, and required-input boundary | `phase7-studio-owner` | collect |
| UI states | loading, empty, validation/diagnostic, success, warning, error, cancellation, and input-required states when visibly encountered | `phase7-studio-owner` | collect |
| Browser-only relationships | responsive/layout/cross-surface relationships that require a screenshot | `phase7-studio-owner` | collect |

The fresh-profile requirement applies to every Studio row.  A previously saved
project, browser history entry, or local-storage state is a different surface
and must be registered by `phase7-studio-owner` before it is included.

## Advertised artifact census

The following public claim families must be compared with actual ledger rows.
They are not assertions that any artifact was generated in PC-01.

| Advertised artifact family | Observable proof required | Future owner | Status |
| --- | --- | --- | --- |
| Blueprint/project JSON | generated file row with extension, hash, producer, and exit status | `phase7-artifact-owner` | collect |
| Generated game/package files | artifact rows for the output tree and producer command/UI action | `phase7-artifact-owner` | collect |
| Simulation reports (JSON, Markdown, HTML where advertised) | file/download ledger row for each observed format | `phase7-artifact-owner` | collect |
| Replay result artifact | file/download ledger row and visible producer | `phase7-artifact-owner` | collect |
| Outcome-library, fairness, certification, PAR-sheet, and Stake Engine exports | separate ledger rows; no family may stand in for another | `phase7-artifact-owner` | collect |
| Browser client/served endpoint output | terminal provenance plus transcript evidence; no source/API inspection | `phase7-artifact-owner` | collect |

## Public documentation-claim census

| Claim family | Public evidence to record | Future owner | Status |
| --- | --- | --- | --- |
| Installation and first contact | exact public package/version request, root output, and linked public README claim | `phase7-docs-owner` | collect |
| CLI workflows | each help-listed verb and option mapped to its public wording | `phase7-docs-owner` | collect |
| Studio capability | rendered page/action/state mapped to the public wording that advertises it | `phase7-docs-owner` | collect |
| Artifact promises | advertised type mapped to an actual ledger row or an explicit `not generated` result | `phase7-docs-owner` | collect |
| Product boundaries and safety claims | exact public wording plus the observable surface that supports or limits it | `phase7-docs-owner` | collect |

## Discovery rule

Every newly observed verb, option, page, action, state, artifact type, or
documentation claim is appended to the corresponding table/run index on the
same day it is found.  Its owner is fixed by family (`phase7-cli-owner`,
`phase7-studio-owner`, `phase7-artifact-owner`, or `phase7-docs-owner`);
cross-surface discoveries receive all applicable owners and one coordinating
owner, `phase7-product-coherence-owner`.  No discovery is silently excluded
because it was absent from an earlier checklist.

