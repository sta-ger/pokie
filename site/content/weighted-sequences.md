# Weighted whole-sequence reels

A whole-sequence reel chooses among complete **ordered** strip alternatives. This is different from per-symbol weights (used to construct one strip) and from precomputed weighted outcome libraries (which select stored outcomes).

## Model and selection

Each variant has a stable unique nonempty ID, a complete ordered symbol list and a finite nonnegative weight. Total weight must be positive. Alternatives **within one reel** have equal lengths; different reels need not share that length. Zero-weight alternatives are retained, never selected, and do not consume selection probability. Symbols must belong to the model.

Selection belongs to the **logical round**: selected variants persist across its feature steps/continuations. Selection identity and RNG continuation survive supported state restoration; initialization draws and preview are not fresh paid-round selections. For one reel, a variant's selection probability is its weight divided by the sum of weights. Given that variant, each circular stop has probability `1 / strip length`. The probability of a particular variant/stop pair is therefore `weight / sum(weights) / strip length`; independent reels multiply these probabilities. Alternative IDs and symbol order are part of the authored model and retained replay identity.

Save this complete example as `weighted.blueprint.json`:

{{example:site/examples/weighted.blueprint.json}}

```sh
pokie validate weighted.blueprint.json
pokie build weighted.blueprint.json --target tsPackage --out weighted-package
pokie sim weighted-package --rounds 100 --workers 1 --seed weighted-28 --format json --out weighted-report.json
pokie replay weighted-package --seed weighted-28 --round 10 --out weighted-replay.json
pokie build weighted.blueprint.json --target parWorkbook --out weighted.xlsx
pokie build weighted.xlsx --target blueprint --out weighted-return.blueprint.json
```

The first reel has A-strip probability 1/4 and B-strip probability 3/4, the second is exact A. A two-A line pays 4 at stake 1; finite samples need not contain exactly 25 A selections. Inspect retained sequence-selection observations/statistics rather than replacing the model with sampled outcomes.

## Studio editing

Open the Blueprint, then the reel/whole-sequence editor in Game Model/design editing. Add ordered alternatives, unique IDs and weights. Preview probability mass and validation **without consuming RNG**. **Apply** updates the draft; **Save game** persists it. Run seeded Play or Simulation from the saved model to inspect actual selections. Invalid length, symbol, ID or weight errors must be resolved before applying/saving.

## Interchange limits

Canonical PAR preserves exact and weighted sequence declarations with readback/provenance checks. Lossless status also requires represented geometry, mechanics and import eligibility. A weighted reel is not a single materialized strip: reel materialization/generation paths that require one literal strip reject it. An outcome artifact retains outcomes, not the original alternative strips, and cannot reconstruct this authored model. Canonical feature-aware WASM can represent supported whole-sequence models; arbitrary portable or custom code does not inherit that support. [Format support](mechanics.md#format-support).
