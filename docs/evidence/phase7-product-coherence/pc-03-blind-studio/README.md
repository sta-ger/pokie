# PC-03 — blind Studio exploration recovery ledger

Candidate: `8f23a47b443a578d4351b7d019dddadd7c698b12`.

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
Replay rendered its initial empty state; choosing the visible native **Session
Spin** control rendered the concrete `Session 1 — Round 1 — Spin` next action.
The recovery driver mistakenly waited for the prior Load control instead of
that rendered session-round action, so it did not load the replay before the
four-launch allowance ended.

## Bounded output provenance

Only metadata was retained; no generated tree, output, profile, or raw log is
committed. The package output shown by Build/Export and reopened by Studio had:

| Generated member | Bytes | SHA-256 |
| --- | ---: | --- |
| `outcomelibrary/manifest.json` | 4,169 | `8efefa8151798a566cf1b7a6069901d721b025c6a7d44aeaa5610fc89665bbb6` |
| `outcomelibrary/outcomes_base.jsonl` | 701,614 | `513b56e0e17744ae6b1654a440e91c15d5bd99d2bb916fa1ecef126e488dbfaf` |
| `stakeengine/pokie-manifest.json` | 927 | `02d85b30c9ae0141afaaa5edf71c89b306ac8bd4b543607e6713f811f3af672b` |

No systemic product defect was observed. The sole remainder is the bounded
driver failure to activate the now-rendered Replay session-round control.
