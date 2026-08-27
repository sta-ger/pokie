# PC-03 — blind Studio surface and state ledger

Candidate: `1adf13a8e36f8e7142361f5ddaabbf923d5e60ba`
Run: 2026-08-27, one fresh Studio registry and one fresh visible Chromium
profile. The profile had no roadmap, product source, architecture notes, or
known-findings material. Studio was started from this checkout with exactly
`node ./dist/cli/pokie.js --no-open`; interaction used rendered controls and
rendered state only. No remediation was attempted and this is not a
source-guided diagnosis.

The first launcher attempt found Studio's published port but made no browser
interaction; the repaired second launch below is the sole rendered journey.
Temporary profiles, registries, generated projects, outputs, diagnostics, and
the raw 97 KB driver transcript were removed. This README is the retained,
bounded observation record.

## Entry points, forms, and states observed

| Surface | Rendered controls/forms inventoried | Outcome, next action, and state/recovery |
| --- | --- | --- |
| Start a game | Starter description; Create game; advanced file/JSON disclosure; different-start chooser; Game basics, Layout, Symbols, Reels, Paytable, Bets; required id/name/version fields; preview | Initial validation was checking, then rendered **Valid — no issues found**. The chooser exposed starter, blank, generated idea, and saved-design options; Escape did not dismiss the rendered chooser in this run, so Create game remained the available next action. |
| Projects (fresh) | Empty project list; Create first game; add-existing Game location; Browse; Browse PAR sheet; Check game; documentation links | Empty state said no games. Check game was disabled before input. `/not-a-game` enabled it and rendered both a path error and “Choose another game folder or game-design file, then try again”; Create first game returned to Start. This is the observed invalid-input recovery. |
| Created workspace / Overview | Breadcrumbs; Overview, Game Model, Play, Simulation, Replay, Build/Export; Show project location; Close project; Open Play; Re-check | Creating the starter rendered a valid editable project at Overview. The handoff copy named Play, Simulation, Replay, and Build/Export as the next destinations. |
| Play | New Play session; seed disclosure; bet combobox; Spin; scenario actions; symbol combobox; Reset | Before a session, New Play session was available. It created a session with “No round played yet.” Find-symbol-win was disabled pending a symbol; other scenario actions and Spin were available. Spin was accepted, then rendered **Spinning…** with Spin, scenarios, and Reset disabled. The driver navigated away while that pending state was rendered; it neither retried nor calls it a product failure. |
| Simulation | Rounds form; Run Simulation; seed/workers disclosure; Refresh; Configure/Run/Review/Export steps; recent-runs paging | Fresh state had no completed runs; Review, Export, and both paging controls were disabled. Run Simulation was accepted. The driver's 120 s semantic wait did not match the final wording, but the still-rendered page then showed a completed 10,000/10,000-round report (RTP 104.84%, duration 0.2 s), warning, Open full report, Compare, Repeat simulation, and Open/Run again. The wait threshold is therefore readiness-driver inconclusive only, not a product finding. |
| Build/Export — pre-handoff | Refresh targets; exact-outcome form; max-space field; bounded-coverage control; technical disclosure; package/outcome/Stake/PAR build cards and destination forms; remote delivery card | Exact generator was available. Stake Engine export and remote Check compatibility were disabled, with their prerequisite explanations visible. The package, generic outcome, generic Stake, and PAR cards all rendered Ready-to-build preflight states. |
| Build/Export — cross-artifact handoff | Generate exact outcome library (base); Run Stake Engine Export (base) | The rendered generator action was accepted and the canonical files below appeared. Immediately afterward the rendered Stake action was still disabled and still said “Generate an outcome library above first.” A page reload made that same action enabled; this is a stale rendered handoff finding. No export was clicked after reload, so no non-idempotent operation was duplicated. |
| Reload / back / forward | Reloaded Build/Export; browser history from home/design to Build/Export and forward | Reload restored the workspace and changed the Stake action from disabled to enabled. The subsequent project-list navigation landed on Start rather than a project list; Back restored Build/Export, and Forward restored Start. No rendered error appeared. |

The fresh ledger did not open Game Model or Replay because the two permitted
launches were consumed (the first was the port-only harness repair). Their
previously frozen, rendered inventory remains: Game Model's game-basics,
layout, symbols and reels summary/edit surfaces; and Replay's recreate from
seed, artifact/session/simulation selectors, target-round and seed forms,
Load/Refresh, and disabled Download JSON empty state. These are retained as
prior observations, not claimed as newly re-observed on this candidate.

## Generated-artifact inspection

Only names, byte counts, and SHA-256 checksums were retained; the generated
tree itself was deleted.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `blueprint.json` | 1,430 | `9428e23e9c3b58a215037dcabaec2926b39317d4784c9ca07ea051e843fb1031` |
| `.pokie/outcome-library-registry.json` | 18 | `4c9507923e0072b23b06cba308cfabaa7c14ca99ad72e6f89d5f2b631f535f3b` |
| `outcomelibrary/index_base.json` | 263,443 | `49b531ef7642a50aa1b863c8e83ce7743ee9eb22211b26dc7237c58742dc245a` |
| `outcomelibrary/manifest.json` | 4,133 | `397f859ee6eedaf1afef60b99da6c2dc3d57650b80fec80583b80353f9345de0` |
| `outcomelibrary/outcomes_base.jsonl` | 689,326 | `afc90be68bebaa62f3cb01cf2f653c438873b675998ea36802d6951391929745` |

## Findings carried without remediation

**PC-03 P2 — stale outcome-to-Stake-Engine handoff.** After the rendered exact
generation action created the canonical outcome files, the rendered Stake
Engine action remained disabled with its pre-generation message. Reload made
it enabled. This ledger records the observed state transition only; it makes
no source-level root-cause claim.

**PC-05 P2 — frozen saved-design contradiction.** The retained
`import-replaced-invalid.png` (SHA-256
`5d2d0e1436b8b8a28bf3831358f1e73c6aedaf6c2b488338634ef552ecdfc32d`)
preserves the established visual observation: choosing a saved design can
replace the editable starter with an invalid/blank design while only a
Back/cancel affordance is offered and no explanatory import error is rendered.
It remains owned by PC-05, not remediated or re-diagnosed here. The screenshot
is retained because it is the necessary visual relationship; all other proof
is textual and checksum-based.
