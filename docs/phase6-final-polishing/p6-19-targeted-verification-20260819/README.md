# P6-19 targeted host verification

Candidate verified: `dbae3a351afebd064e22ed5b4f93a19740b00e27` (`[P6-19] Restore default materialization cache root`).

The following complete required Jest files were run in this candidate worktree with `--runInBand --runTestsByPath`:

| File | Result |
| --- | --- |
| `tests/cli/materialize/BlueprintProjectMaterializer.offline.integration.test.ts` | PASS — 1 suite, 9 tests, 0 failed (51.603 s) |
| `tests/cli/materialize/BlueprintProjectMaterializer.test.ts` | PASS — 1 suite, 27 tests, 0 failed (5.637 s) |

The offline integration result was also emitted through Jest's JSON reporter (`success: true`, exit code `0`).  Its nine passing cases load a runtime from the production resolver using absolute roots for a spaced checkout, a real `npm pack` + tarball-installed root, and a real `npm link` root, with npm offline and the registry unreachable.  They also cover the built CLI's `validate`, `sim`, `serve`, `dev`, implicit Blueprint/Studio opening, and Play paths.

Commands run:

```sh
npm run test:targeted -- tests/cli/materialize/BlueprintProjectMaterializer.offline.integration.test.ts
npm run test:targeted -- tests/cli/materialize/BlueprintProjectMaterializer.test.ts
npm_config_loglevel=error node --max-old-space-size=512 ./node_modules/jest/bin/jest.js \
  --runInBand --runTestsByPath tests/cli/materialize/BlueprintProjectMaterializer.offline.integration.test.ts \
  --json --outputFile=<temporary-result.json> --silent
```

Only temporary logs/results were retained during verification; they are not committed.  SHA-256 checksums (and bytes) at capture completion:

```text
4f65052c25a40120c2d830c6630adc8a9e7e31b6533488ba1205bc77840ade31  offline.integration.concise.log  2247
1b5ebd6bf7e9d7b09e314845528d260992085e9e5f08d3688b71fbf82488132e  offline.integration.results.json 8438
a1df06944200fed8488f7e04505e50e54ddaed969e9df6f90d57b86981796de6  unit.log                         4478
```
