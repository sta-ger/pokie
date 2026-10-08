# Example PAR sheet

Round-trip example for [`pokie import`/`pokie build`](../../docs/cli.md):

- `starter.blueprint.json` — a small 3x3 `GameBlueprint` with a wild, literal `reelStrips`, 3 horizontal
  `paylines`, a `paytable`, and `availableBets` — the subset `pokie build --target parWorkbook` supports (no
  `reelStripGeneration`/`symbolWeights`).
- `starter.par.xlsx` — `starter.blueprint.json` published at the historical PAR boundary on 2026-07-14, unedited. This recorded workbook and its provenance are preserved; current builds use `pokie build --target parWorkbook`. Its `Meta` sheet
  records that provenance (pokie version, export timestamp, source path, blueprint hash).

Try it from the repository root:

```
npx pokie import examples/parsheets/starter.par.xlsx --out /tmp/starter.blueprint.json
npx pokie build examples/parsheets/starter.blueprint.json --target parWorkbook --out /tmp/starter.par.xlsx
```

`starter.par.xlsx` retains its recorded historical publication; the second command creates a new workbook. open it in Excel/LibreOffice/Google Sheets to see the
`Manifest`/`Symbols`/`Paytable`/`ReelStrips`/`Paylines`/`AvailableBets`/`Meta` sheet layout. `starter.blueprint.json`
doesn't set `winModel`/`mechanics`/`betModes`, so this example doesn't exercise the optional `WinModel`/`Mechanics`/
`BetModes` sheets — see the full workbook format (including those) in
[docs/cli.md](../../docs/cli.md#workbook-format).
