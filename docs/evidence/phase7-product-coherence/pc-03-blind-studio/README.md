# PC-03 — blind Studio rerun ledger

Candidate: `70de23504f8f12566d719d5120b18ff7e96be9e4`.

## Boundary

On 2026-08-27, the verifier built this candidate once and made the two allowed
fresh-profile Studio launches, each from this checkout with exactly
`node ./dist/cli/pokie.js --no-open`. It used only visible Studio controls,
the native file picker, and the public links rendered by Studio. No source,
private API, DOM/state injection, or product change was used. The temporary
profiles, project data, invalid input, outputs, and full diagnostics were
destroyed; no generated artifact or private project filename is retained.

| Retained image | SHA-256 | Rendered state |
| --- | --- | --- |
| `import-selection.png` | `33ec092e9944ec75d78d2e469a5a778c4314e4379e276dfa596e29c66f3db035` | Saved-design picker selection with visible `Back` and `Open saved game design` controls. |
| `import-replaced-invalid.png` | `5d2d0e1436b8b8a28bf3831358f1e73c6aedaf6c2b488338634ef552ecdfc32d` | The P2 replacement/invalid blank design discovery. |
| `simulation-pending.png` | `6dc5db19ffc33f0a2cde60f207a2c8be2caeb70a7d48ee9b7c6d13d4784107b7` | Accepted Simulation job, with pending recovery and disabled later steps. |

## Fresh-profile saved-project import/open

The start chooser rendered `Open a saved game design`. The visible native
picker was activated, verified active, and used to select a deliberately
invalid saved-design JSON input. Studio then rendered `Saved game design`, the
selected input, `Back`, and `Open saved game design` (first image). `Back` was
used, then the chooser was opened again and its native picker was cancelled.

Instead of returning the untouched starter, the rendered editor then showed
`Replaced the current game design.` and `Invalid — 4 error(s)`: empty game id,
empty game name, empty symbols, and empty paytable (second image). `Undo` was
the only visible recovery. No rendered import-error explanation preceded the
replacement. This is the preserved PC-05 carry-forward discovery:

> **P2 — saved-design selection can replace the current editable starter with
> an invalid/blank design while the UI offers Back/cancel and no explanatory
> import error.**

The second launch therefore could not safely continue to Build/Export. The
first launch independently created the valid Starter Slot workspace and showed
the Build/Export tab, but did not reach a rendered artifact handoff before its
separate Simulation observation. No claim of cross-artifact reuse is made.

## Simulation

In the valid first-launch workspace, Simulation rendered Configure, Run,
Review, and Export. Configure showed `No completed simulations yet`; Review
and Export were disabled. Selecting `Run Simulation` was accepted and the
retained image shows `queued — 0/10000 rounds — elapsed 0.0s`, with `Cancel`
as the recovery/next action and the later stages disabled. A subsequent
rendered observation showed `running — 2000/10000 rounds — elapsed 0.1s` and
no product error.

The run was not observed through a terminal result in the permitted launches.
Accordingly this ledger does not claim a completed outcome, report download,
or recovery beyond the visible `Cancel` action; the screenshot, outcome,
disabled states, and stated next action all describe the same pending
lifecycle state. The lack of a terminal observation is not itself recorded as
a product defect.

## Scope outcome

The P2 import/open discovery is retained without remediation for PC-05. Build
and Export artifact reuse remain not reached, rather than inferred from an
internal location, registry, filename, or pipeline detail.
