# P6V-05 independent host verification — driver inconclusive

Product candidate: `caf8132177b23abc34096c6c3ce4079330b34080`.
Read-only companion candidate, verified clean at its required SHA before and after:
`1e2c8c00457f3af389c0168432c08e63ca441465`.

The candidate Studio client was already built. This recovery invocation used its four
permitted fresh Studio profiles with this checkout command exactly:

```text
node ./dist/cli/pokie.js --no-open
```

The stable persistent harness was repaired in place for every recorded prior driver
cause: Zenity 4/Xvfb rendering (scoped `GSK_RENDERER=cairo`), active native-window
verification before typing, scroll-to-rendered-control, semantic tab lookup, and
filtering hidden inactive-tab control duplicates. It drove the real native picker with
its active native window verified before entering the absolute source path. Every
fresh journey established:

1. Picker selection rendered the exact source XLSX in Studio's labelled **Location** field:
   `examples/parsheets/starter.par.xlsx` — SHA-256
   `a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`.
2. **Detect** rendered **This is a PAR sheet workbook**. **Open in Design Game** then
   rendered **Imported with warnings**, the source provenance, and two displayed
   weighting/pay diagnostics.
3. **Preview canonical model** rendered **Preview only**, a valid 3x3 / 4-symbol
   `PAR Sheet Starter` model, canonical preview hash
   `sha256:ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`,
   and its planned package destination.
4. **Continue to Apply / Export** → **Apply** → rendered confirmation → **Confirm**
   was accepted; **Game basics** rendered for the applied model.

The first three recovery profiles reached the selected visible **Game name** editor
only through a hidden inactive-tab duplicate, so no edit event reached the product.
The fourth used the repaired visible-control resolver and the rendered **Game basics**
tab, but the controlled field still did not expose the requested changed value before
the bounded semantic wait expired. No local validation, save, alert, or product error
rendered. This is a driver interaction failure, not a rendered/reproducible product
symptom. The four-launch quota is exhausted, so managed save, physical export,
native-picker reimport/semantic comparison, and the dependent exact-SHA companion /
package `npm start` / Studio Play / public client-dev / Studio Replay / CLI Replay
parity matrix were not run.

No generated project, workbook, profile, log, screenshot, or harness is committed;
this concise transcript is the complete retained evidence delta.
