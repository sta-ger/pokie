# P6V-03 exact-candidate independent browser rerun — inconclusive

Candidate checked before the run: `940d5f48c62ff4ebb906aaf488bad8158ac5e685`.
The candidate was built once.  Two isolated rendered Studio launches then used
only this checkout command:

```text
node ./dist/cli/pokie.js --no-open
```

Each used a newly absent HOME/XDG Studio registry and a distinct Chrome profile.
The retained screenshot is the second run's fresh, rendered Studio Home; it
contains the Design Game entry surface and no pre-existing project workspace.

## Bounded transcript

1. On each fresh rendered Home, **New Blueprint** → **Recommended** displayed
   “Replaced the current blueprint.”
2. On each run, **New Blueprint** → **Random** displayed the rendered Random
   form. The harness filled its visible Seed and Name fields and issued one
   visible **Generate** action on the first run.
3. The first launch's harness treated the already-rendered but disabled
   **Use this blueprint** control as a generated result; it was repaired in
   place before the second launch.
4. In the second launch, the generic visible `Name` field selector resolved to
   the background **Game name** control rather than Random's scoped field. The
   Random dialog consequently was no longer available to the harness before it
   could issue a second Generate action. The underlying Recommended draft
   rendered **Valid — no issues found**; no Studio error, browser error, or
   failed rendered network outcome appeared.

The isolated UI setup and exact-SHA binding are demonstrated, but no reliable
Random replacement was rendered. Therefore the required literal model edits,
post-reopen persistence (including artwork), Replay export, Play,
Simulation, Outcome Library, and Stake Engine Export were not reached. This
is a selector/driver limitation, not a product finding. No generated project,
browser profile, runtime registry, full log, or automation source is retained.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-940d5f48-20260823-fresh-home.png` | Fresh isolated rendered Studio Home on the exact candidate | `2f5dfbe26bc88f25c08d464655f0555fce9b31a7f8a432110ad3488829ea6bb3` |

## Focused harness recovery (same candidate; still inconclusive)

After rebuilding the candidate, four further fresh HOME/XDG and Chrome-profile
launches again used only `node ./dist/cli/pokie.js --no-open`. The persistent
harness was repaired in place between launches: its Random form lookup was
scoped to the visible modal and its focused numeric-field replacement sends a
complete Control+A/Backspace/text sequence.

- The scoped visible **Generate** action was accepted once, but the Random
  modal then closed without a rendered pending, result, or error state. It was
  not repeated.
- The last fresh run rendered and retained the requested focused edits:
  payline 1/reel 1 row **2**, `A ×3` payout **9**, and bet 1 **2**. The
  previous run exposed the old harness defect by visibly appending `9` to the
  initial payout; its rendered validation warning was diagnostic evidence for
  repairing the driver, not a product error.
- The next rendered Symbols surface did not expose the `Symbol 1 is wild`
  checkbox to the harness's visible-control locator. No product error,
  console error, or failed request rendered. With the launch limit exhausted,
  artwork, literal/generated reel transitions, workspace/export outcomes, and
  close/reopen persistence were not claimed.

No runtime profile, registry, project/output tree, full log, or automation
source is retained. The original screenshot remains the sole representative
rendered artifact; the complete recovery transcript remains in the
controller-owned harness workspace.

## Persistent-harness recovery, 2026-08-23

Four further fresh isolated launches used the same repaired persistent harness
and the exact checkout command above. The first launch repaired the checkbox
name collision and explicitly rendered **A wild**, **K scatter**, the focused
native PNG selection followed by the **Change** artwork control, and a
non-empty literal reel **Preview** after adding `A`. It then exposed a second
harness collision: the generic `Symbol` picker lookup selected the visible
`Symbol weights` mode radio rather than the generated-reel picker. The
in-place repair made labels direct/aria-first and switched section navigation
to rendered tab roles; the two remaining fresh launches then showed that the
controlled Game id field did not accept the harness's CDP keyboard events.
Each stayed visibly **Valid — no issues found**; no rendered product error was
observed. The exhausted bounded recovery therefore does not attest generated
reel apply, workspace actions, Replay export, or post-reopen persistence.

The persistent-harness-only terminal transcript and temporary profiles remain
outside this evidence tree. The retained rendered Home screenshot checksum is
unchanged: `2f5dfbe26bc88f25c08d464655f0555fce9b31a7f8a432110ad3488829ea6bb3`.

## Focused harness recovery follow-up, 2026-08-23

This invocation used the same persistent `current.mjs` harness for all four
permitted new fresh HOME/XDG-registry and Chrome-profile launches, again using
only `node ./dist/cli/pokie.js --no-open` from this exact checkout.  The
retained isolated Home screenshot was reproduced byte-for-byte.  The harness
first replaced its CDP keyboard text with an activated-window physical input,
then repaired the renderer's negative emulation chrome-offset calculation.
Neither approach committed text to the controlled rendered `Game id` field.
On the final guarded physical-click attempt, the visible UI instead switched
to the Symbols section; consequently the computed driver coordinate was not a
reliable field target and no edit, replay export, or persistence assertion was
claimed.  Every terminal UI still rendered **Valid — no issues found**, with
no Studio error, browser error, or rendered failed request.  No generated
profile, registry, output, full log, screenshot, or harness source is retained
in the evidence tree.

## Focused harness recovery closeout, 2026-08-23

Four final fresh isolated HOME/XDG-registry and Chrome-profile launches ran the
same repaired persistent harness with only
`node ./dist/cli/pokie.js --no-open` from this checkout. The exact candidate
remains `940d5f48c62ff4ebb906aaf488bad8158ac5e685` (this evidence-only commit
is its descendant).

The last three launches explicitly rendered and confirmed: payline 1/reel 1
row `2`; `A ×3` payout `9`; bet 1 `3`; a wild role, scatter role, and focused
native PNG artwork selection (the rendered **Change** control); and a
non-empty literal reel containing `A` whose local **Literal strip** Preview
appeared. The next rendered generated-reel transition was also confirmed from
Counts to **Weights** by the newly rendered local **Length** control.

The bounded driver then could not confirm selecting the visible `A` option in
the generated reel's Mantine **Symbol** picker: its search input clears after
the rendered option acceptance, while neither picker-chip confirmation used by
the repaired harness appeared. No local Studio error, browser error, failed
request, or product error rendered. Replay export, workspace outcomes, and
close/reopen persistence consequently remain unclaimed; no duplicate
non-idempotent action was issued. Temporary profiles, registries, generated
projects, full logs, harness source, and terminal screenshots remain outside
the evidence tree.

## Final rendered-harness recovery, 2026-08-23

The same persistent harness ran four fresh isolated HOME/XDG-registry and
Chrome-profile launches from this source checkout using only
`node ./dist/cli/pokie.js --no-open`. It repaired picker selection by clicking
the rendered listbox option, scoped Workspace Edit/Save actions by the rendered
section legend, and selected a rendered Replay Session Spin before export.

The final run explicitly observed through rendered controls: payline 1/reel 1
row `2`; `A ×3` payout `9`; bet 1 `3`; J wild and K scatter; selected PNG
artwork (the **Change** control); a non-empty literal `A` strip with local
**Literal strip** Preview; a generated Reel 1 with weights `A=5`, `Q=1`, a
maximum-consecutive constraint of `6`, an A stack of length `2`, successful
preview, and Apply. It also added and saved `mode-1`, then added and saved the
K ×3 → 6 free-games mechanic. Play rendered an ordinary win and a
`freeGamesTriggered` feature result; Simulation rendered RTP/results. Replay
rendered the selected Session Spin as exportable and the exact click created
`spin-3b538e87-84bd-442a-b6eb-804bba78fc0e.json` (16,889 bytes, SHA-256
`7cc31523496384657f1ac246c663393ccdc3359d866f74d9d111c9ca44b4907e`) in
that run's isolated HOME/Downloads.

The harness initially watched a separate downloads directory, so its bounded
wait expired even though the rendered download had completed in HOME/Downloads.
This is driver/readiness evidence, not a product finding. The fourth and final
permitted launch had therefore ended before Close/Open persistence, Outcome
Library, and Stake Engine checks; those are not claimed. No rendered product,
browser, or failed-network error was observed.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-940d5f48-20260823-recovery-model.png` | Rendered generated-reel Apply state | `6c3aa67977f2d7ef1ee6bc1a3e7fa75d212f702d0809d2e3d29327398beea313` |
| `candidate-940d5f48-20260823-recovery-replay-feature.png` | Rendered selected Replay Session Spin with `freeGamesTriggered` | `e984cf254c06df6d4d4334a2fdfa9e84c3ceea96104b8e8c73132ff453be6441` |
