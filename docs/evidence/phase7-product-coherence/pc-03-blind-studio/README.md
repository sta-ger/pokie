# PC-03 — blind Studio Build/Export and surface ledger

Candidate: `6b800e4132f5863fd9b44403499dd7f100399ce0`.

## Method and retained proof

On 2026-08-27, the verifier built this checkout once, then made two fresh,
isolated-profile Studio launches, each exactly with
`node ./dist/cli/pokie.js --no-open`. It used rendered Studio controls, the
rendered public documentation links, and visible Chromium only. No product
source, private API, DOM/state injection, or private filename was used. The
temporary profiles, registries, generated project, outcome library, Stake
Engine output, diagnostics, and full logs were removed after the observations.

| Retained image | SHA-256 | Rendered proof |
| --- | --- | --- |
| `build-export-handoff.png` | `0f7cfeb8183b8baaf87fc4623c3122eac08ea592adf7cdd79339189a8cfb0b94` | Outcome library success followed by the now-enabled Stake Engine export success (four files). |
| `projects-empty.png` | `bf26d6402928d67fe71821be8da415f351deac9a71c5a4ba84b5e39253ff4943` | Fresh Projects entrypoint: empty list, add-game form, Browse/Browse PAR spreadsheet dialogs, and disabled Check game. |
| `simulation-empty-disabled.png` | `aca17231b12662eda7ab0acacac41ef19efe6ccf2ab1daa15a83843c1d6533c9` | Simulation’s empty run list and inactive Review/Export stages. |
| `import-replaced-invalid.png` | `5d2d0e1436b8b8a28bf3831358f1e73c6aedaf6c2b488338634ef552ecdfc32d` | Previously observed, frozen PC-05 saved-design replacement/invalid state. |

## Build/Export handoff

From a valid rendered Starter Slot workspace, the verifier opened
**Build/Export**. Its Outcome library generator showed the max-space form,
bounded-coverage checkbox, Generate exact outcome library action, advanced
details disclosure, and an initially disabled Stake Engine export. Selecting
the visible generator action rendered: **Generated 1,024 outcomes for mode
“base” using exact (RTP 100.78%)**. This is the artifact handoff.

Without entering a path, filename, registry value, or pipeline detail, the
verifier then used the newly enabled **Run Stake Engine Export (base)** public
control. Studio rendered **Exported 4 file(s)** and its own Open output folder
control. The retained handoff image shows both success messages. This is the
natural, rendered reuse result rather than an inferred filesystem readback.

## Surface and state ledger

| Surface | Rendered controls/forms inspected | Observed state |
| --- | --- | --- |
| Home — Start a game | Ready-to-edit starter; Create game; advanced file/JSON disclosure; different-start chooser; Game basics, Layout, Symbols, Reels, Paytable, Bets | Valid starter with all step checks. Create succeeded into a workspace. |
| Home — Projects | Create first game; add-existing-game location field; Browse; Browse PAR spreadsheet; Check game; public Docs/Get started/CLI reference links | Fresh profile was empty; Check game disabled. |
| Workspace — Overview | Breadcrumbs; project location link; Close project; Open Play; Validation/Re-check | Valid, created-in-Studio project. |
| Workspace — Game Model | Game basics/Layout/Symbols/Reels cards and Edit controls; Game window, Full strips, Analysis tabs; stop controls | Read-only overview form rendered without an error. |
| Workspace — Play | Seed disclosure and New Play session | Ready start form; no session created in this pass. |
| Workspace — Simulation | Rounds input; Run; advanced seed/workers disclosure; Refresh; Configure/Run/Review/Export progression | Initially empty and Review/Export inactive (retained). One Run was accepted and later rendered a completed report with RTP, warnings, report/compare/repeat controls, and a recent run. No fixed timeout was treated as a failure. |
| Workspace — Replay | Recreate from seed, Replay Artifact, Session Spin, Recent Simulation; target-round and seed fields; Load; Download JSON; Refresh | Empty replay list and disabled Download JSON (observed). |
| Workspace — Build/Export | Outcome-library and Stake-Engine cards, forms, advanced disclosures, output-folder controls | Export disabled before library creation; both handoff and export success rendered afterward (retained). |
| Native/dialog-adjacent controls | Current Projects Browse/Browse PAR buttons; preserved saved-design picker observation | No dialog was needed for the successful handoff. The saved-design picker’s contradictory replacement result remains frozen below. |

No persistent loading or stale state rendered before the semantic transitions;
all accepted actions reached a visible success state. No additional visible
duplicate capability was observed in this pass. The only contradictory public
behavior remains the frozen P2 finding below. No product remediation was made.

## Frozen PC-05 discovery

The retained saved-design screenshot records the established P2 finding:

> **P2 — saved-design selection can replace the current editable starter with
> an invalid/blank design while the UI offers Back/cancel and no explanatory
> import error.**

It is carried forward for PC-05 only. This verification neither remediated it
nor used source inspection to explain it.
