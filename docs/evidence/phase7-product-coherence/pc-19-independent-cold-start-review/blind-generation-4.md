# PC-19 blind cold-start rerun — generation 4

Candidate product anchor: `778e3d6eec1d7d7a12c29838e005ee16a0b8ce26`.
The checkout was evidence descendant `27ca53402048be8e1f57cf581dadc3119adb3237`;
the anchor is an ancestor and the intervening commits are evidence-only.

## Independent record before source/evidence inspection

Four fresh-profile public Studio launches used exactly
`node ./dist/cli/pokie.js --no-open` from this checkout. Before inspecting
source or retained evidence, the reviewer independently recorded that the
valid starter design could create a workspace, enter Play, settle a Spin,
open Simulation and Replay, generate an exact outcome library, build a
TypeScript Game Package, open that package as a read-only playable Studio
project, and settle a second Spin in the package player.

The following action-local lifecycles were rendered in the final isolated run:

* **Spin:** `Spinning…` → `Round complete — no win this round`.
* **Run Simulation:** `queued — 0/10000 rounds` → a completed 10,000-round
  report and local recent-run row (RTP 101.96%).
* **Generate exact outcome library (base):** generation state → `Generated
  1,024 outcomes ... using exact (RTP 100.78%)`.
* **TypeScript Game Package / Build:** build state → `Built to .../tsPackage`.
* **Open as Project:** the package rendered as `Playable game`, `Read-only`,
  `Valid`, then its own Play session settled a round.

The separate enabled **Stake Engine export / Build** activation remained on
its ready card for the bounded observation. It rendered neither an accepted
job/pending state nor an action-local terminal result, and no product error.
It is driver-inconclusive under the action-correlation contract; no retry was
made and it is not a product finding.

Only checksums of new isolated artifacts are retained; no generated project,
output, profile, or raw log was committed:

```
2ca06720e9a4640159884eea606c53b11ddb3bc4c44947d351917adc869a7998  transcript.json
a4ca908e4fe677be1922517017bfa764411b589b840f948e074eb8c2fc32f738  after-spin.png
e03d2cf83e4c6c1f99711e3baab037826ecd4da4798e4d64dc907151814a2f14  after-run-simulation.png
2fc014683b55b35e95d4ad70a5997d867b3661712dbc13ef525498e2b817a4cc  after-generate-exact-outcome-library.png
06356e8688fd7d4dbf78a34194712e68ee20a40fb3eaa8ae0f7a7570eb913a99  after-typescript-game-package-build.png
2840a0e8011720a821f38eb964ddb1384943ed835d72f6a8c9e00ce01d270258  after-stake-engine-export-build.png
```

## Gate result

No correlated product defect was observed. The immutable charter nevertheless
is not complete: the six-role mission matrix, every artifact/lifecycle edge,
all CLI/Studio and Studio/examples-player parity checks, and the separate
finding-register/remediation-delta gate were not all reached before the
four-launch invocation limit. Result: **inconclusive (driver)**, not passed.
