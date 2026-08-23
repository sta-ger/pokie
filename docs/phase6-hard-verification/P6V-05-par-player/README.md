# P6V-05 independent host verification — driver inconclusive

Product candidate: `caf8132177b23abc34096c6c3ce4079330b34080`. This
evidence-only descendant changes no product source. The read-only companion checkout
was clean at `1e2c8c00457f3af389c0168432c08e63ca441465` before and after the run.

Four fresh Studio profiles were launched from this source checkout only as:

```text
node ./dist/cli/pokie.js --no-open
```

The persistent harness retained each prior repair, added a visible-control filter so
hidden duplicate actions cannot be clicked, used GTK's selected-file confirmation for
Zenity, and used the public `pokie import` command prepared for the independent
semantic comparison. It did not use the installed `node_modules` self-dependency.

Across the rendered journeys, the real native picker selected
`examples/parsheets/starter.par.xlsx` into the labelled **Location** field. **Detect**
rendered *This is a PAR sheet workbook*; **Open in Design Game** rendered *Imported
with warnings* (provenance plus the two weighting/paytable warnings); and **Preview
canonical model** rendered the valid 3x3 / 4-symbol `PAR Sheet Starter` preview with
hash `sha256:ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`.

**Apply** → confirmation → **Confirm** rendered **Game basics**. The real, visible
**Game name** edit/save path created managed Blueprint projects and then saved the
scoped Workspace **Game Model** edit as `PAR Sheet Starter Final`. The final managed
file hash was `e6643151d3d9ec3f136e79426f88c0efd495967563b94e9783303e779c75db1e`.
The physical fixture hash was
`a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`.

The final remaining path is Home **Design Game** → visible advanced **Load from path**
→ **Load** → **Apply / Export**. The fresh fourth journey selected the labelled field
but its controlled value was not confirmed after ordinary active-window typing. An
earlier rendered diagnostic established that a prior attempt clicked a hidden duplicate
Load control and consequently left the visible starter model unchanged; the resolver
was repaired before the final attempt. A separate fresh attempt saw Zenity remain
open after its rendered Open action. No Studio error, validation failure, export result,
or semantic mismatch was rendered. This is a driver-only inconclusive condition, not a
product finding.

Consequently, physical export, native reimport, file hashes for an export, the public
CLI semantic comparison, package `npm start`, Studio Play, companion public
client/dev, Studio Replay, CLI Replay, and the full Player parity matrix were not
reached. The temporary managed projects were sent to trash after their bounded hashes
were recorded. No generated output, browser profile, harness, raw log, or screenshot
is committed; this README is the complete evidence delta.
