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

Try it from the repository root:

```
npx pokie build examples/blueprints/crazy-fruits.blueprint.json --out /tmp/crazy-fruits
cd /tmp/crazy-fruits && npm install
npx pokie inspect .
npx pokie validate .
```

The generated package includes its own `README.md` (what each file is, and the rest of the
`build -> inspect -> validate -> sim -> report -> replay -> serve`/`dev` workflow) and a `src/generated/build-info.json`
recording what it was built from — see [`pokie build <config.json>`](../../docs/cli.md#pokie-build-configjson)
for what's in each.
