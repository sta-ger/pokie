# Bounded transcript

## Machine-owned related suites

One command, run once and serially on candidate
`4548dfb74383803436615c3821265d23c5d245ad`:

```text
npm run test:targeted -- \
  tests/cli/CertificationFairnessLifecycle.integration.test.ts \
  tests/cli/FairnessWorkflow.integration.test.ts \
  tests/cli/commands/CertificationCommand.test.ts \
  tests/cli/commands/FairnessCommand.test.ts \
  tests/certification/CertificationEvidenceBundleBuilder.test.ts \
  tests/certification/CertificationEvidenceBundleValidator.test.ts \
  tests/certification/CertificationEvidenceBundleVerifier.test.ts \
  tests/fairness/FairnessCommitmentValidator.test.ts \
  tests/fairness/FairnessRoundProofBuilder.test.ts \
  tests/fairness/FairnessRoundProofValidator.test.ts \
  tests/fairness/FairnessRoundProofVerifier.test.ts \
  tests/fairness/FairnessServerSeedCommitmentValidator.test.ts \
  tests/fairness/computeFairnessCommitment.test.ts \
  tests/fairness/computeFairnessCommitmentHash.test.ts \
  tests/fairness/computeFairnessRoundProofHash.test.ts \
  tests/fairness/computeFairnessServerSeedCommitment.test.ts

Test Suites: 16 passed, 16 total
Tests:       235 passed, 235 total
Snapshots:   0 total
Time:        10.239 s
Exit:        0
```

## Fresh packed-CLI public workflow

Preparation succeeded once: `npm pack --pack-destination <fresh-pack-dir>`
ran the checkout's `prepack`/build lifecycle.  The resulting `pokie-1.3.0.tgz`
was installed with `npm install --ignore-scripts --no-audit --no-fund --prefix
<fresh-work-dir> <tarball>`.  Its SHA-256 is
`b9bdbe826afa7e663273b4abe116360a0d41a7d394b221749bdbad4292ea8164`.

The only authored starting inputs were a valid Blueprint, the documented
bundle/certification configuration inputs, and a server-seed text file.  No
generated lifecycle artifact was edited; copied tampering was not reached.

| Step | Installed public command | Exit | Observed result |
| --- | --- | ---: | --- |
| Blueprint package | `node <fresh>/node_modules/pokie/dist/cli/pokie.js build game.blueprint.json --target tsPackage --out game-package` | 0 | `Game package "Lifecycle CLI Slot" (id: "lifecycle-cli-slot") built`; emitted package readback: `name=lifecycle-cli-slot`, `version=1.0.0`, `main=./dist/index.js`. |
| Sampled library | `node <fresh>/node_modules/pokie/dist/cli/pokie.js outcomelibrary generate game-package --sample 12 --seed library-sampling-seed --out sampled-library.json --format json` | 1 | `Unknown command "outcomelibrary". Run \`pokie --help\` to list commands.` |
| Native bundle / inspect / sample | Not executable after missing public producer | — | Not reached; the public help has no `outcomelibrary` or `outcomesource` command. |
| Certification build / verify and deterministic rerun | Not executable without preceding native bundle | — | Not reached. |
| Fairness seed-commit / commit / reveal / verify | Not executable without preceding native bundle | — | Not reached. |
| Tampered evidence, stale source, tampered proof checks | No successful public source artifacts exist to copy | — | Not reached. |

Public dispatcher confirmation (same installed entrypoint):

```text
$ pokie --help
Commands: build, certification, client, create, dev, diff, edit, fairness,
generate, init, import, inspect, par, reel, replay, report, sample, sim,
stakeengine, validate

$ pokie outcomesource --help
Unknown command "outcomesource". Run `pokie --help` to list commands.

$ pokie outcome-library --help
Unknown command "outcome-library". Run `pokie --help` to list commands.
```

`outcomelibrary --help` was not separately run after its attempted `generate`
already produced the same root-command diagnostic.  No generated trees, npm
install tree, tarball, raw log, profile, or automation source is retained here.
