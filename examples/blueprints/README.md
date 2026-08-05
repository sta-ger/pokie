# Example `GameBlueprint` files

Hand-authored `pokie build` inputs — see [`pokie build <config.json>`](../../docs/cli.md#pokie-build-configjson)
for the full format and the minimal `build -> inspect -> validate -> sim -> report -> replay -> serve/dev` workflow.
Starting a new one from scratch? [`pokie create [name]`](../../docs/cli.md#pokie-create-name) writes an editable
Blueprint Project file through an interactive wizard, instead of hand-authoring the whole shape shown below.

- `sample-slot.blueprint.json` — 5x3, wilds, scatters, and weighted reels; omits `paylines`/`reelStrips` on
  purpose to show the engine's own defaults (one horizontal line per row, the built-in weighted reel generator)
  still produce a fully playable game. Its `paytable`/`symbolWeights` are tuned (low-pay symbols weighted heavier,
  high-pay symbols rarer) for a realistic demo RTP — around 92-93% over a large simulated sample (e.g.
  `pokie sim <packageRoot> --rounds 200000`), not the 120%+ a naive "every symbol equally likely" weighting would
  produce with the engine's default 3 active lines on a 3-row grid. See docs/cli.md's
  [Math-quality warnings](../../docs/cli.md#math-quality-warnings) for the `pokie build` checks that catch this
  class of mistake.
- `generated-reels.blueprint.json` — 5x3, wilds, scatters, and a per-reel `reelStripGeneration` array instead of a
  fully literal `reelStrips`: reel 0 is a hand-placed literal strip, reels 1-4 are each independently generated
  (different `length`/`seed`/`constraints`, one via `symbolWeights` with a wild-spacing constraint, one via
  `symbolWeights` with a scatter-spacing constraint, one via `symbolCounts` with a locked wild position, one with
  no constraints at all) — `pokie build` runs `ReelStripGenerator` per generated reel and bakes the resulting exact
  strips into the generated package as plain `reelStrips`, mixed with the literal reel unchanged. See
  [`reelStripGeneration`](../../docs/cli.md#reelstripgeneration-build-time-reel-strip-generation) in docs/cli.md
  for the full field reference.

Try it from the repository root:

```
npx pokie build examples/blueprints/sample-slot.blueprint.json --target /tmp/sample-slot
cd /tmp/sample-slot && npm install
npx pokie inspect .
npx pokie validate .
```

Or the `reelStripGeneration` example — each *generated* reel's resolved strip is baked straight into the built
package's `reelStrips`, with no separate record of the generation config (seed, constraints, etc.) that produced it:

```
npx pokie build examples/blueprints/generated-reels.blueprint.json --target /tmp/generated-reels
npx pokie inspect /tmp/generated-reels
```

The generated package includes its own `README.md` (what each file is, and the rest of the
`build -> inspect -> validate -> sim -> report -> replay -> serve`/`dev` workflow) — see
[`pokie build <config.json>`](../../docs/cli.md#pokie-build-configjson) for what's in each.
