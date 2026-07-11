# Example `GameBlueprint` files

Hand-authored `pokie build` inputs — see [`pokie build <config.json>`](../../docs/cli.md#pokie-build-configjson)
for the full format and the minimal `build -> validate -> sim -> report -> replay -> serve/dev` workflow.

- `crazy-fruits.blueprint.json` — 5x3, wilds, scatters, and weighted reels; omits `paylines`/`reelStrips` on
  purpose to show the engine's own defaults (one horizontal line per row, the built-in weighted reel generator)
  still produce a fully playable game.

Try it from the repository root:

```
npx pokie build examples/blueprints/crazy-fruits.blueprint.json --out /tmp/crazy-fruits
cd /tmp/crazy-fruits && npm install
npx pokie validate .
```

The generated package includes its own `README.md` (what each file is, and the rest of the
`build -> validate -> sim -> report -> replay -> serve`/`dev` workflow) and a `src/generated/build-info.json`
recording what it was built from — see [`pokie build <config.json>`](../../docs/cli.md#pokie-build-configjson)
for what's in each.
