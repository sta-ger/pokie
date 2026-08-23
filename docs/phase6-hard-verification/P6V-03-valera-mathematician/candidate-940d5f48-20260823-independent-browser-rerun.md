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
