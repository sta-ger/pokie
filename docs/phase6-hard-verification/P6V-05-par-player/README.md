# P6V-05 host verification closeout — inconclusive

Product content is bound to candidate `49d5fccc517f5a7f964ecc7fa32148edeb18d588`.
The read-only `pokie-examples` checkout was independently clean at
`b7b043e0e722da917f1b60c4f107c8cc35fdd725` before the rendered workflow.

The physical fixture was unchanged:

```text
examples/parsheets/starter.par.xlsx
sha256 a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924
```

Four fresh isolated Studio launches used only `node ./dist/cli/pokie.js --no-open`.
The retained and recovery journeys rendered: native Open selection of the fixture,
`Imported with warnings`, PAR provenance, canonical preview SHA-256
`ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`, Apply,
the visible managed-name edit to `PAR Sheet Starter round-trip`, native Save of the
write-safe expected Blueprint, native Save selection for a new PAR XLSX, and visible
physical `Export`. The final fresh journey then selected that exported XLSX through the
native picker and rendered successful `Import`.

The remaining `Diagnose & map` Stepper transition did not accept its rendered driver
interaction after the re-import, so the harness could not read the re-imported raw
canonical model or compute its semantic comparison and file hash before the four-launch
limit. No Studio error, failed export, or mismatching canonical model was rendered. The
dependent exact-companion package/npm-start/Studio-Play/public-client-dev/Replay matrix
was consequently not started. This is driver-inconclusive, not a product finding.

No runtime trees, profiles, generated workbooks, screenshots, raw logs, harness source,
symlinks, or generated outputs are retained. This README is the sole evidence artifact.
