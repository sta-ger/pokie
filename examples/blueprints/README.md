# Example `GameBlueprint` files

Hand-authored `pokie build` inputs — see [`pokie build <config.json>`](../../docs/cli.md#pokie-build-configjson)
for the full format and the minimal `build -> inspect -> validate -> sim -> report -> replay -> serve/dev` workflow.
Starting a new one from scratch? `pokie build --init-blueprint <file>` writes an editable starter template — see
[Starter template](../../docs/cli.md#starter-template-pokie-build---init-blueprint-file) — instead of hand-authoring
the whole shape shown below.

- `crazy-fruits.blueprint.json` — 5x3, wilds, scatters, and weighted reels; omits `paylines`/`reelStrips` on
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
npx pokie build examples/blueprints/crazy-fruits.blueprint.json --out /tmp/crazy-fruits
cd /tmp/crazy-fruits && npm install
npx pokie inspect .
npx pokie validate .
```

Or the `reelStripGeneration` example — its `src/generated/build-info.json` additionally records, for each
*generated* reel, that reel's own original config (including its seed) and the resulting exact strip:

```
npx pokie build examples/blueprints/generated-reels.blueprint.json --out /tmp/generated-reels
cat /tmp/generated-reels/src/generated/build-info.json
```

The generated package includes its own `README.md` (what each file is, and the rest of the
`build -> inspect -> validate -> sim -> report -> replay -> serve`/`dev` workflow) and a `src/generated/build-info.json`
recording what it was built from — see [`pokie build <config.json>`](../../docs/cli.md#pokie-build-configjson)
for what's in each.
