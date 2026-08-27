# PC-03 — blind Studio surface ledger

Candidate: `aff16a37818b386fc6366509009aff287cbbdf22` (the evidence commit
below is a descendant). This is discovery evidence only: no product code or
tests were changed.

## Method and bounds

Two isolated, fresh-profile visible-Chromium walks used the candidate build
from this checkout. Each Studio launch was exactly:

```sh
node ./dist/cli/pokie.js --no-open
```

Each walk created a temporary starter game through the rendered first-launch
form, used only visible controls and keyboard/mouse input, and removed its
profile, registry, project, and generated outputs on exit. The ledger records
the public wording and rendered outcomes, not implementation paths, registry
contents, source inspection, or private API calls. No screenshot is retained:
the surfaces are ordinary form/layout states and the concise transcript below
is the more useful bounded proof. Generated outputs are represented only by
the already-recorded checksums at the end.

## Complete public surface inventory

| Entrypoint or handoff | Rendered state and observed outcome |
| --- | --- |
| Home / **Start a game** | First launch explained the editable starter, automatic validation, advanced file/JSON tools, model preview, and documentation links. The initial design was valid. |
| Home / **Choose a different start** | The modal offered the complete visible choice set: starter game, blank game, generated idea, and saved design. Dismissing it returned to the unchanged valid starter form. |
| Home / **Projects** | Reached from the fresh empty profile; no saved project was required to create the starter. Returning to the design form remained valid. |
| Create game → project | Changing only the rendered Game id and pressing **Create game** created `Starter Slot`; Overview showed it as editable, valid, and locally created. **Re-check project** was available. |
| Overview | The visible next-action guidance linked Play, Game Model, Simulation, Replay, and Build/Export. No contradictory navigation or stale status was rendered. |
| **Game Model** | Read-only overview rendered Game basics, 5×3 line layout, symbols, literal reel strips, paylines, paytable, available bets, mechanics, limits, refresh, and visible Edit actions. Its Game window / Full strips / Analysis controls were present; the starter reported no configured features (an empty state, not an error). |
| **Play** | Initial recovery state was **New Play session**. A new session showed Spin, scenario searches, bet controls, seed details, and reset. A single visible Spin settled as “Round complete — no win this round” with grid, lines, credits, total win, paytable, and an inspect-round-artifact affordance. **Find symbol win** was visibly disabled until a symbol is entered; other searches were available. No duplicate spin was sent. |
| Play → Replay reuse | The rendered Replay copy explicitly offered **Session Spin** for a round just played. In the completed fresh-profile replay walk, selecting the visible session-round entry loaded the real Play round into the round inspector. Thus the handoff was attempted as a user would discover it, without a filename or pipeline-stage lookup. |
| **Simulation** | Fresh state accurately said “No completed simulations yet”; the configuration step exposed rounds, advanced seed/workers details, **Run Simulation**, and disabled Review/Export steps until a result. The completed fresh-profile run entered one round and later rendered `1/1 rounds` with RTP `0.00%`; its result was available as a natural Replay source. |
| **Replay** | Fresh state showed the four visible sources—Recreate from seed, Replay Artifact, Session Spin, Recent Simulation—alongside target round, optional seed, Load, disabled Download JSON, and empty recent-replays recovery state. The completed fresh-profile replay then loaded round 1 and ran once: `completed — 1/1 rounds`, completeness Full, and Inspectable/Reproducible/Exportable all AVAILABLE; Download JSON enabled. The earlier empty/disabled controls correctly recovered after a result existed. |
| **Build/Export** / outcome library | The card stated its local destination and prerequisites, provided exact/bounded-coverage choices, and completed **Generate exact outcome library (base)**. It rendered `Generated 1,024 outcomes for mode "base" using exact (RTP 100.78%)`. |
| Outcome library → Stake export | The immediately adjacent, public **Run Stake Engine Export (base)** then became the natural continuation and rendered `Exported 4 file(s)`. This confirms real artifact-result reuse from the UI rather than an internal artifact lookup. |
| Build artifact cards | TypeScript Game Package, Outcome library, Stake Engine export, and the other visible destination cards each displayed output-location input, Browse, preflight, readiness, and Build affordances. The fresh starter reported Ready to build; the unconfigured compatibility action was visibly disabled, correctly representing its prerequisite state. |
| Project navigation boundary | The project navigation exposed exactly Overview, Game Model, Play, Simulation, Replay, and Build/Export. No separate Certification/Provably Fair/Fairness tab was rendered for this project, so none was silently omitted from the inventory. |

## State/recovery ledger and frozen PC-05 patterns

- Empty states were explicit and actionable: no completed simulations, no replays,
  no configured features, and a fresh Play session each named their next action.
- Disabled states described prerequisites rather than implying success: symbol-win
  awaited a symbol; replay JSON awaited a loaded result; simulation review/export
  awaited completion; compatibility awaited configuration.
- Completed-state recovery was observed through Play→Replay, Simulation→Replay,
  and outcome-library→Stake-export. The completed Replay and export states made
  their downstream actions available without re-entering hidden project data.
- The final rendered diagnostic scan found no error, failed, unable, or invalid
  product fragment. No systemic product defect was discovered in this bounded
  exploration. The three design observations for PC-05 are therefore frozen as
  follow-up review topics only: maintain clear empty-state next actions, preserve
  prerequisite-specific disabled copy, and preserve public cross-artifact
  handoffs. This evidence includes no remediation.

## Bounded output identity

The temporary generated tree was removed. These representative checksums from
the completed UI export are retained instead:

```text
outcomelibrary/index_base.json             49b531ef7642a50aa1b863c8e83ce7743ee9eb22211b26dc7237c58742dc245a
outcomelibrary/manifest.json               44b1296224993419a89d8c19f16bd3619de2288b415fc5f8255bc85903b29e13
outcomelibrary/outcomes_base.jsonl         afc90be68bebaa62f3cb01cf2f653c438873b675998ea36802d6951391929745
stakeengine/books_base.jsonl.zst           c0dc33f77175b4ee5e1a15afaee2a441360645bee7758e2cf1d829b63c66d901
stakeengine/index.json                     57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5
stakeengine/lookup_base.csv                a6ab06e0ae86547667fff1418a5d62aa3de9c4b53e7cd1d757cde2267c934dc0
stakeengine/pokie-manifest.json            dbdaf450544f885c4f9b02bb1b82d24df846f6e5fdecb3a2fc0cef21bb97c806
```
