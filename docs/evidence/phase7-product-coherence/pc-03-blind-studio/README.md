# PC-03 — blind Studio exploration recovery ledger

Candidate: `8f23a47b443a578d4351b7d019dddadd7c698b12`.

## Independent host rerun — 2026-08-27

Verified candidate `0be293a3c9cafa3924f1e10ac2cbbef42216efbb` through the
public Studio workflow, launched from this checkout exactly as
`node ./dist/cli/pokie.js --no-open`. Each of the two permitted launches used
a new Studio registry and Chromium profile. No source, roadmap, prior evidence,
or known finding was consulted before the first launch.

The first renderer readiness observation preceded the visible controls and did
not send a product action; its fixed threshold is therefore not a product
result. The single fresh retry rendered the starter-design page. A visible
**Projects** click changed the route to `#/home/projects`, rendered the empty
project state and its recovery actions (**Create your first game**, add/browse),
and explained the disabled **Check game** state. Browser Back, Forward, and
Reload all retained the rendered Projects state; no rendered product error or
failed product request appeared. The fresh registry showed **No games yet**, so
this run produced no game/output artifact to retain or inspect. The only browser
diagnostic was a 404 for `favicon.ico`; it did not affect the rendered workflow.

The retained proof is this bounded transcript summary. The isolated browser
profile, Studio registry, raw diagnostics, and an unneeded screenshot were not
committed. The pre-existing frozen finding and its single visual proof below are
retained as the candidate's prior evidence, not asserted as a new observation
by this rerun.

This bounded recovery used four newly created Chromium profiles and Studio
runtime directories. The candidate was built from this checkout; every launch
then started Studio only with `node ./dist/cli/pokie.js --no-open`. The original retained launch began
without roadmap, source, known findings, or prior evidence; the later recovery
work repaired only the UI driver after that boundary.

## Confirmed rendered workflow

The fresh explorer saw the editable starter/empty state and its disabled-style
progression, chose the visible alternative-start chooser, opened and cancelled
the native saved-design picker, and recovered from the chooser. Editing a
required value rendered `Source changed — checking again…`; restoring it
rendered validation recovery. Create saved the design and reached its workspace.
Browser Back returned to the design, Forward returned to the workspace, and
Reload retained the workspace.

The workspace rendered and navigated through Overview, Game Model, Play,
Simulation, Replay, and Build/Export. Game Model rendered the literal-strip
window, symbols, payouts, and edit affordances. Build/Export first rendered
the unavailable Stake-export prerequisite; then visible actions built the game
package, generated 1,024 exact base outcomes (reported RTP 100.78%), and
exported four Stake files. The completed package's visible **Open as Project**
action reopened it in Studio; the reopened package supplied the same generated
outcome library and Stake export. This is the natural cross-artifact reuse
handoff, not a direct filesystem opening.

Simulation rendered its no-completed-runs empty state, then the accepted action
rendered `queued — 0/10000` followed by `running — 2000/10000`; no product
error was rendered. A fixed observation bound elapsed before its terminal card,
so that absence is driver/readiness-inconclusive rather than a product finding.
Play rendered the session's next **Spin** action and then a completed no-win
round with its grid, credits, bet, paytable, and Inspect-round-artifact action.
Replay first rendered its empty state. In the final fresh-profile completion
run, choosing its visible **Session Spin** control rendered the concrete
`Session 1 — Round 1 — Spin — win 0` action. Activating that rendered action
produced **Loaded replay**: the recorded Play source, identities, complete
artifact state, grid, credits, bet, paytable, round detail, and enabled JSON
download were all visible. No rendered product error occurred. This repaired
the prior harness's incorrect expectation of an invented generic Load action;
the product's actual local transition succeeded.

## Bounded output provenance

Only metadata was retained; no generated tree, output, profile, or raw log is
committed. The package output shown by Build/Export and reopened by Studio had:

| Generated member | Bytes | SHA-256 |
| --- | ---: | --- |
| `outcomelibrary/manifest.json` | 4,169 | `8efefa8151798a566cf1b7a6069901d721b025c6a7d44aeaa5610fc89665bbb6` |
| `outcomelibrary/outcomes_base.jsonl` | 701,614 | `513b56e0e17744ae6b1654a440e91c15d5bd99d2bb916fa1ecef126e488dbfaf` |
| `stakeengine/pokie-manifest.json` | 927 | `02d85b30c9ae0141afaaa5edf71c89b306ac8bd4b543607e6713f811f3af672b` |

## Frozen finding carried to PC-05

**P2 — saved-design selection can replace the current editable starter with an
invalid/blank design while the UI offers Back/cancel and no explanatory import
error.** The natural user intent was to choose a saved design from the visible
saved-design picker and continue editing that selected design. Instead, the
selection replaced the editable starter with the visible invalid/blank state.
`import-replaced-invalid.png` is the preserved visual provenance for that
observation (SHA-256
`5d2d0e1436b8b8a28bf3831358f1e73c6aedaf6c2b488338634ef552ecdfc32d`).

This P2 finding is carried unchanged to PC-05. PC-03 neither remediated it nor
used source-guided diagnosis to explain it.

Apart from that unresolved frozen P2 contradiction, the complete natural
Studio pass covers create/open/import, edit validation and recovery, workspace
history, Game Model, Build/Export and package reopening, generated outcomes
and Stake export, Simulation, Play, and the completed Replay handoff. It
retained no generated output, profile, or raw transcript; the restored visual
provenance, checksums, and rendered-state record above are the bounded
provenance proof.
