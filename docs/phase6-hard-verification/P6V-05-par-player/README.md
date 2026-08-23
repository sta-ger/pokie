# P6V-05 independent host verification — driver inconclusive

Product candidate: `caf8132177b23abc34096c6c3ce4079330b34080`. This evidence-only
descendant changes no product source from that candidate. The read-only companion
checkout was clean at `1e2c8c00457f3af389c0168432c08e63ca441465` before and after
the run.

Four fresh Studio profiles were used, each launched from this source checkout as:

```text
node ./dist/cli/pokie.js --no-open
```

The persistent harness incorporated every retained driver repair: software GTK
rendering on Xvfb, active-window confirmation before native-picker typing, semantic
tab/control resolution, scrolling, and physical keyboard input for controlled React
fields. It never used the installed `node_modules` self-dependency.

The fourth rendered journey completed these real UI states:

1. **Projects** native picker selected `examples/parsheets/starter.par.xlsx` into
   the labelled **Location** field. **Detect** said *This is a PAR sheet workbook*;
   **Open in Design Game** showed *Imported with warnings*, provenance, and the two
   displayed weighting/paytable warnings.
2. **Preview canonical model** showed the valid 3x3 / 4-symbol `PAR Sheet Starter`
   preview, with hash
   `sha256:ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`.
   **Apply** → confirmation → **Confirm** rendered **Game basics**.
3. The visible **Game name** was changed to `PAR Sheet Starter Verified`, then
   **Create Project** opened Workspace **Overview** at the managed Blueprint path
   `Documents/POKIE Projects/par-sheet-starter-verified-3/blueprint.json`.
   In Workspace **Game Model**, the scoped **Game basics** **Edit** → change to
   `PAR Sheet Starter Final` → **Save** returned to the section's local **Edit**
   state. Its recorded SHA-256 was
   `e6643151d3d9ec3f136e79426f88c0efd495967563b94e9783303e779c75db1e`.

The fixture SHA-256 was
`a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`.
The final profile then visibly accepted the managed path in **Load from path** and
activated **Load**, but the harness's stale expectation that the guided editor would
render a labelled `Game name` input never became true before its bounded wait. No
rendered Studio error, failed validation, or product mismatch appeared. The four
launches are exhausted, so physical export/reimport and normalized semantic
comparison were not reached; neither were package `npm start`, Studio Play, public
client/dev, Studio Replay, CLI Replay, or the required full Player-parity matrix.

The two managed projects made during this invocation were moved to trash after their
bounded hashes were recorded. No generated output, browser profile, harness, raw log,
or screenshot is committed; this README is the complete evidence delta.
