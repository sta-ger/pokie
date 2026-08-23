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
