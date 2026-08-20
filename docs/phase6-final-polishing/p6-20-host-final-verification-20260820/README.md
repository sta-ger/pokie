# P6-20 host verification — external publication blocked

Candidate source was exactly `db64358d5208b7d31b9970c06de2f83b91720502` and
clean before this evidence-only record. The read-only companion checkout was
clean at the required `b7b043e0e722da917f1b60c4f107c8cc35fdd725` before and
after verification.

## Machine-owned real-worker suites

One serial complete-file command exited 0:

```sh
npm run test:targeted -- \
  tests/cli/commands/SimCommand.realWorkers.test.ts \
  tests/cli/studio/simulation/StudioSimulationService.realWorkers.test.ts
```

`npm run build` also completed before the UI checks.

## Deterministic public parity

Candidate `pokie replay` of the committed companion with
`--seed fixture-round --round 1` returned total win `5` and `A/C/A |
A/A/C | A/A/A`. Fresh public Player input and fresh Studio, launched exactly
with `node ./dist/cli/pokie.js --no-open`, rendered the same screen, credits
`1004`, win `5`/`5.00`, and `5x`/`5.00x`. In Studio, the visible Session Spin
replay loaded the recorded Play spin with source `Recorded -- Play tab spin`
and the same values.

`studio-replay.png` is the sole retained rendered proof:
`sha256:2af28abd742c3e844ff0d190e89e0d93ead944d151370820568411bdb3c4dd89`
(203,598 bytes).

## Publication boundary

Publication and Google Drive confirmation remain external prerequisites. This
checkout has no configured Git remote; its local `develop` is
`6575b0531679b678075902560efe2196b4126040`, not the candidate. No
credentialed campaign publisher or Google Drive connector is available here.
An authorized publisher must publish the final merged develop SHA and record
the Drive round-trip; this pre-publication checkout cannot truthfully attest
to either result.
