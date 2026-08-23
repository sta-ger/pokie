# P6V-05 host verification closeout — finding

Product content was built from candidate `49d5fccc517f5a7f964ecc7fa32148edeb18d588`.
The read-only `pokie-examples` candidate was clean at
`b7b043e0e722da917f1b60c4f107c8cc35fdd725`.

The physical native-picker Studio round trip passed in a fresh profile launched only with
`node ./dist/cli/pokie.js --no-open`: import of the unchanged fixture (SHA-256
`a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`), diagnostics,
canonical preview, Apply, visible name edit to `PAR Sheet Starter round-trip`, native Save,
native XLSX Export, native re-import, and the rendered raw canonical model. The saved expected
Blueprint SHA-256 was `43a1242ed00164a3699d081f1780f81a52db94fc78ebceae3c250eb2a2b1d00b`;
the exported workbook SHA-256 was `405bffccd38655b9f63abc0558a972f433d84acbdf6579ccef10c73d5cb77a1b`.
Sorted semantic comparison of the saved model against Studio's re-imported rendered raw model
was `true`.

The deterministic fixture (`seed fixture-round`, round 1) also completed through CLI Replay,
package `npm start` public client, Studio Play, and Studio Replay. Each reached the same
3×3 orientation `[[A,C,A],[A,A,C],[A,A,A]]`, winning row positions `0:0, 0:1, 0:2`, win 5,
paytable `A=5, B=3, C=1`, bet 1, base mode where rendered, and no feature state.

The exact companion public Vite surface then failed before rendering its visible Play control.
Its browser console rendered this candidate-package error:

```text
Module "module" has been externalized for browser compatibility.
Cannot access "module.createRequire" in client code.
.../dist/esm/gamepackage/resolvePokieGameEntryModule.js:13
```

Thus the complete cross-repository public parity matrix cannot pass: the candidate's browser
ESM path imports a Node-only module for the exact companion workflow. No generated workbooks,
profiles, screenshots, raw logs, symlinks, or harness source are retained; this README is the
sole bounded evidence artifact.
