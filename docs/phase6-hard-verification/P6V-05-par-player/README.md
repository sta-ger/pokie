# P6V-05 independent host verification — inconclusive

Candidate: `49d5fccc517f5a7f964ecc7fa32148edeb18d588` (the checkout HEAD).  `npm run build` completed successfully before the browser work.

The public Studio command was launched from this checkout as required:

```text
node ./dist/cli/pokie.js --no-open
```

The first fresh-profile attempt reached the server but the harness used a non-hash client URL (`/home/design`); Studio rendered its normal 404 response, not a product error.  The persistent harness was repaired in place to use `/#/home/design`.

On the second and final permitted fresh-profile launch, the visible Studio UI saved the default Recommended model to:

```text
/tmp/p6v05-launch1-ZLuSft/profile/POKIE Projects/starter-slot/blueprint.json
sha256 9428e23e9c3b58a215037dcabaec2926b39317d4784c9ca07ea051e843fb1031
```

It then opened the saved workspace and completed one Studio Play round.  Rendered evidence included `Round complete — no win this round.`, the 5×3 symbol screen, paylines 0–2, `Bet: 1125`, and the paytable.  The fixture reserved for the native-picker PAR round trip was unchanged:

```text
examples/parsheets/starter.par.xlsx
sha256 a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924
```

The visible Simulation tab rendered its `Rounds` control (default `10000`) and `Run Simulation` button.  The harness could not re-resolve that rendered input by its label after tab navigation, and the second-launch cap prevented repair/retry.  No rendered product error or reproducible product symptom was observed.  Consequently the native-picker PAR import/export/re-import, managed canonical semantic comparison, Replay, outcome generation, Stake export, and the exact `pokie-examples` parity matrix were not reached.  No companion workspace was supplied in the persisted request, so an exact second repository SHA could not be bound.

No generated profiles, worktrees, screenshots, raw logs, or harness files are included in this evidence commit.
