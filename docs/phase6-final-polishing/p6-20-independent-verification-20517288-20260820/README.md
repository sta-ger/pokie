# P6-20 independent candidate verification

The exact requested candidate was clean at
`20517288a6c850fa83dd985b075bd793b07ff3d0` before this evidence-only
record. The read-only companion checkout was clean at the required
`b7b043e0e722da917f1b60c4f107c8cc35fdd725` before and after verification.

## Machine-owned regressions

One serial complete-file command passed the 12 persisted companion/Studio
regression files:

```sh
POKIE_EXAMPLES_PATH=/home/stager/Work/sta-ger/pokie-examples \
  npm run test:targeted -- <the 12 persisted complete test paths>
```

Result: **12 suites, 460 tests passed**. `npm run build` also passed before
the browser workflow.

The two dedicated bounded real-worker regression files were then run together
in one further serial complete-file invocation:

```sh
npm run test:targeted -- \
  tests/cli/commands/SimCommand.realWorkers.test.ts \
  tests/cli/studio/simulation/StudioSimulationService.realWorkers.test.ts
```

Result: **2 suites failed; 8 tests failed and 2 passed**. The first failure in
each suite is `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`; the Studio
cancellation test then times out waiting for progress. The candidate's
CommonJS game-entry fallback does not cover the separate native dynamic import
in `src/simulation/parallel/internal/defaultWorkerEntryUrl.ts`, which is the
default real-worker entry resolver reached by these tests in Jest's VM.

## Deterministic public parity

Candidate `node ./dist/cli/pokie.js replay
/home/stager/Work/sta-ger/pokie-examples --seed fixture-round --round 1`
reported the Fixture Slot game, `totalWin: 5`, and
`A/C/A | A/A/C | A/A/A`.

A fresh headed browser drove the public UI only. Studio was launched exactly
with `node ./dist/cli/pokie.js --no-open`; Projects visibly detected,
registered, and opened the required companion. Studio Play entered
`fixture-round`, started a new session, and spun `A/C/A | A/A/C | A/A/A`,
credits `1004`, win `5.00`, and `5.00x`. Studio Replay's visible **Session
Spin** loaded that same recorded round, source `Recorded -- Play tab spin`,
seed `fixture-round`, and the same grid/value set.

The candidate public Player was also launched with
`node ./dist/cli/pokie.js dev /home/stager/Work/sta-ger/pokie-examples
--port 3210 --client-port 3211 --no-open`. Visible Player input produced the
same grid, credits `1004`, win `5`, and win multiple `5`.

## Publication boundary

Publication and Google Drive verification were not performed. This isolated
checkout has no configured remote or credentialed Drive/publication connector;
the local `develop` reference is
`6575b0531679b678075902560efe2196b4126040`, not the requested candidate.
An authorized campaign publisher must complete publication, the Drive
round-trip, and the final develop-SHA record.

No generated package/output tree, browser profile, raw log, or automation
source is retained.
