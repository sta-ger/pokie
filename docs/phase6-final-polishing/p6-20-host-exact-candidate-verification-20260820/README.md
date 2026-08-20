# P6-20 host exact-candidate verification

Candidate source was exactly `85541ac10ff1b2371976260af070462c4d639446`.
The supplied read-only `pokie-examples` companion was exactly and cleanly at
`b7b043e0e722da917f1b60c4f107c8cc35fdd725` before and after the checks.

## Bounded real-worker suites

The required two whole test files ran once, together, and serially:

```sh
npm run test:targeted -- \
  tests/cli/commands/SimCommand.realWorkers.test.ts \
  tests/cli/studio/simulation/StudioSimulationService.realWorkers.test.ts
```

Jest exited 0: 2 suites passed and 10 tests passed (16.673 s).
`npm run build` also exited 0 before the browser check.

## Deterministic Player parity

Candidate `node ./dist/cli/pokie.js replay` against the supplied companion,
with `--seed fixture-round --round 1`, returned total win `5` and screen
`A/C/A | A/A/C | A/A/A`.

Fresh Studio was launched once from this source checkout exactly as
`node ./dist/cli/pokie.js --no-open` and driven through rendered browser
controls. The companion was registered by the visible Projects import flow.
Studio Play used seed `fixture-round`, created a new Play session, and spun the
same screen; it visibly rendered credits `1004`, total win `5.00 (5.00x)`,
paytable `A=5/B=3/C=1`, and the highlighted A payline. Studio Replay's visible
Session Spin picker then loaded that recorded Play spin and rendered source
`Recorded -- Play tab spin`, the same seed, grid, credits, win, multiple, and
paytable.

## Publication boundary

This isolated verification checkout has no configured Git remote or
credentialed campaign publisher/Google Drive connector. Its local `develop`
remains `6575b0531679b678075902560efe2196b4126040`, not the candidate.
Therefore normal campaign publication, final merged-develop SHA confirmation,
and the Drive round-trip require an authorized external publisher and were not
claimed by this evidence.
