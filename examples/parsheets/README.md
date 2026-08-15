# Example PAR sheet

Round-trip example for [`pokie import`/`pokie export`](../../docs/cli.md):

- `starter.blueprint.json` — a small 3x3 `GameBlueprint` with a wild, literal `reelStrips`, 3 horizontal
  `paylines`, a `paytable`, and `availableBets` — the subset `pokie export --to workbook` supports (no
  `reelStripGeneration`/`symbolWeights`).
- `starter.par.xlsx` — `starter.blueprint.json` exported via `pokie export --to workbook`, unedited. Its `Meta` sheet
  records that provenance (pokie version, export timestamp, source path, blueprint hash).

Try it from the repository root:

```
npx pokie import examples/parsheets/starter.par.xlsx --out /tmp/starter.blueprint.json
npx pokie export examples/parsheets/starter.blueprint.json --to workbook --out /tmp/starter.par.xlsx
```

`starter.par.xlsx` was generated with the second command; open it in Excel/LibreOffice/Google Sheets to see the
`Manifest`/`Symbols`/`Paytable`/`ReelStrips`/`Paylines`/`AvailableBets`/`Meta` sheet layout. `starter.blueprint.json`
doesn't set `winModel`/`mechanics`/`betModes`, so this example doesn't exercise the optional `WinModel`/`Mechanics`/
`BetModes` sheets — see the full workbook format (including those) in
[docs/cli.md](../../docs/cli.md#workbook-format).
