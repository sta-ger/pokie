# P6V-05 independent host verification — passed

Verified product source: `caf8132177b23abc34096c6c3ce4079330b34080`.
Verified clean read-only companion: `1e2c8c00457f3af389c0168432c08e63ca441465`.
This evidence-only descendant changes no product or companion source.

## Physical PAR round trip

Fresh candidate Studio, launched only with `node ./dist/cli/pokie.js --no-open`,
used the real native **Browse PAR sheet…** picker to select the physical starter
workbook. Studio rendered its PAR-sheet diagnosis and import warnings, previewed
the canonical 3×3/four-symbol model, applied it, and saved the managed Blueprint.
The rendered **Game basics** edit/save changed the name to `PAR Sheet Starter
Final`; after rendered advanced **Load** confirmed that saved name, Studio's
**Apply / Export** created a new physical XLSX. A fresh Studio registry selected
that exported workbook through the same native picker and rendered its PAR
diagnosis and canonical preview again.

Only paths required for write safety are recorded here. SHA-256:

```text
a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924  examples/parsheets/starter.par.xlsx
e6643151d3d9ec3f136e79426f88c0efd495967563b94e9783303e779c75db1e  saved managed Blueprint
0235a7ea360335a003e1eca14102a9b2e81b77c6fea5ffbbbcc2ddab30ccffbd  Studio-exported workbook
```

The public candidate command `node ./dist/cli/pokie.js import <exported.xlsx>
--out <reimported.json>` parsed that exact exported workbook. A recursive
key-sorted comparison of the result and saved managed Blueprint was **equal**.
No generated workbook or Blueprint is committed.

## Deterministic canonical Player matrix

The deterministic `Fixture Slot` was candidate-built, while a byte-for-byte
runtime copy of the exact committed companion public source was resolved against
the candidate build (the companion checkout itself remained unmodified). Seed:
`fixture-round`, round `1`.

| Rendered/public surface | Result |
| --- | --- |
| Studio Play | passed |
| Studio Replay | passed |
| built package `npm start` public client | passed |
| companion public Vite client/dev | passed |
| candidate CLI Replay | passed |

Every surface produced the same canonical state: orientation `3×3`; reel-major
symbols `[[A,C,A],[A,A,C],[A,A,A]]`; winning positions `[[0,0],[1,0],[2,0]]`;
win `5`; paytable `A 3→5; B 3→3; C 3→1`; bet `1`; base mode; and no feature
state. Studio rendered both its local Play completion and Replay
`completed — 1/1 rounds`; both public clients rendered the same Player cells,
highlight and paytable; CLI Replay returned the same screen, bet, win, seed and
round.

Bounded rendered-capture checksums (the transient captures are intentionally not
committed):

```text
978f95af7324e4371eeeae9a107230ac2afd7911c21f27d5dbe5e1fc32dbe861  Studio Play
b6c8b07b28c24d66c2bb4358fe24f44bce69217b00ec980d180c1875056735c8  Studio Replay
b66b36015ddcbefeff67a74c7bc6a3354bb665b5930d30c974eb05ee83c5ef8a  package npm start Player
729b937195e276027c16c4bbb71abee59098918c0d1f9704efb39f0509adb8ff  companion public Player
```

No material mismatch was observed. The only prior interruptions were repaired
driver/readiness selectors; the completed rendered workflow above is the verdict.
