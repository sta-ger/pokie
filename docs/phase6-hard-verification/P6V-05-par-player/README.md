# P6V-05 independent host verification — PAR round trip complete; Player parity inconclusive

Product source is candidate `caf8132177b23abc34096c6c3ce4079330b34080` plus
this evidence-only descendant. The read-only companion checkout was clean at
`1e2c8c00457f3af389c0168432c08e63ca441465` before and after this attempt.
No product source changed.

## Physical PAR round trip

Four fresh Studio registries/profiles were started from this source checkout only as:

```text
node ./dist/cli/pokie.js --no-open
```

The persistent harness retained the prior recovery repairs: Cairo GTK rendering,
active-window checks before native-dialog typing, visible-control filtering,
semantic Stepper selection, and delayed physical keyboard entry for controlled
`PathInput` fields. It never invoked `./node_modules/.bin/pokie`.

The completed rendered/public path was:

1. Studio **Projects** → native **Browse PAR sheet…** selected the physical source
   `examples/parsheets/starter.par.xlsx` into the labelled **Location** control.
   **Detect** rendered *This is a PAR sheet workbook*, and **Open in Design Game**
   rendered *Imported with warnings* with provenance and the two weighting/paytable
   warnings.
2. **Preview canonical model** rendered the valid 3x3, four-symbol `PAR Sheet
   Starter` model. **Apply** → **Confirm** entered **Game basics**. The visible
   **Game name** was set to `PAR Sheet Starter Verified`, saved as a managed
   Blueprint, then Workspace **Game Model** → **Game basics** **Edit** → **Save**
   saved `PAR Sheet Starter Final`.
3. Home **Design Game** loaded that exact managed Blueprint through the visible
   advanced **Load from path** → **Load** transition; the returned local form showed
   `PAR Sheet Starter Final`. The real **Apply / Export** Stepper stage exported a
   new physical XLSX and rendered *Exported with warnings*.
4. The public candidate command `node ./dist/cli/pokie.js import <exported.xlsx>
   --out <reimported.json>` parsed that exact Studio-exported workbook. Recursive
   key-sorted JSON comparison of its canonical result and the saved managed Blueprint
   was equal. A final fresh Studio profile selected the same exported XLSX through
   the real native picker; its labelled **Location** contained the exact path,
   **Detect** again rendered *This is a PAR sheet workbook*, and **Open in Design
   Game** rendered *Imported with warnings*.

SHA-256 values from the complete run:

```text
a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924  starter.par.xlsx
e6643151d3d9ec3f136e79426f88c0efd495967563b94e9783303e779c75db1e  saved managed blueprint.json
0235a7ea360335a003e1eca14102a9b2e81b77c6fea5ffbbbcc2ddab30ccffbd  Studio-exported.par.xlsx
```

The last output's UI import is recorded separately only because it had to use a
new, isolated Studio profile. It is the same `run-18/exported.par.xlsx` whose hash
and public canonical comparison are recorded above. No generated workbook,
Blueprint, browser profile, log, harness source, or screenshot is committed.

## Remaining criterion

The deterministic companion Fixture Slot matrix — package `npm start`, Studio Play,
public client/dev, Studio Replay, and CLI Replay — was not started. The four allowed
fresh Studio profiles were consumed recovering and finishing the real physical PAR
workflow. This is a driver/quota inconclusive result, not a rendered product defect
and not cross-repository parity evidence. The companion remains unmodified at its
required SHA.
