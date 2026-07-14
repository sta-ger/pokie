# Example PAR sheet

Round-trip example for [`pokie par import`/`pokie par export`](../../docs/cli.md#pokie-par-import-inputxlsx--pokie-par-export-configjson):

- `starter.blueprint.json` — a small 3x3 `GameBlueprint` with a wild, literal `reelStrips`, 3 horizontal
  `paylines`, a `paytable`, and `availableBets` — the subset `pokie par export` supports (no
  `reelStripGeneration`/`symbolWeights`).
- `starter.par.xlsx` — `starter.blueprint.json` exported via `pokie par export`, unedited. Its `Meta` sheet
  records that provenance (pokie version, export timestamp, source path, blueprint hash).

Try it from the repository root:

```
npx pokie par import examples/parsheets/starter.par.xlsx --out /tmp/starter.blueprint.json
npx pokie par export examples/parsheets/starter.blueprint.json --out /tmp/starter.par.xlsx
```

`starter.par.xlsx` was generated with the second command; open it in Excel/LibreOffice/Google Sheets to see the
`Manifest`/`Symbols`/`Paytable`/`ReelStrips`/`Paylines`/`AvailableBets`/`Meta` sheet layout described in
[docs/cli.md](../../docs/cli.md#workbook-format).
