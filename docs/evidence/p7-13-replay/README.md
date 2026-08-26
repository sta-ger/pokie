# P7-13 replay determinism transcript

This is the bounded, real-workflow regression transcript. The tests create a real on-disk native outcome-library
bundle (not a mocked selector), spin/sample it through the ordinary public surfaces, and replay the resulting
portable descriptor. The recorded run below was made on 2026-08-26 from this checkout.

```text
$ npm run test:targeted -- tests/cli/studio/OutcomeSourceProjectRoutes.test.ts tests/cli/studio/replay/validateReplayRequest.test.ts tests/project/replayOutcomeSourceProject.test.ts
PASS tests/cli/studio/OutcomeSourceProjectRoutes.test.ts
PASS tests/project/replayOutcomeSourceProject.test.ts
PASS tests/cli/studio/replay/validateReplayRequest.test.ts
Tests: 27 passed, 27 total
exit: 0
```

The original command in that run is the real HTTP simulation request
`POST /api/project/simulations {"rounds":4,"seed":"studio-simulation-seed","modeName":"base"}`. Its completed
job retained `lastReplay` (the ordinary Recent Rounds source):

```json
{
  "game": {"id":"sample-slot","name":"Sample Slot","version":"0.1.0"},
  "libraryId":"base-lib",
  "modeName":"base",
  "selectionAlgorithm":"derived-round-seed-v1",
  "seed":"studio-simulation-seed",
  "round":4,
  "outcomeId":"2",
  "weight":150,
  "stake":1,
  "totalWin":5,
  "payoutMultiplier":5,
  "screen":[["A"]]
}
```

The replay command in that same run is
`POST /api/project/replays {"round":4,"seed":"studio-simulation-seed","modeName":"base","outcomeSource":<lastReplay>}`.
It returned `202`, settled successfully, and its native `descriptor.outcomeSource` matched the original library id,
hash, outcome id, result fields, seed, round, mode and selection algorithm. A second independent
`replayOutcomeSourceProject(project, "base", "reproducible-seed", 4)` invocation produced the same canonical outcome
and library hash.

| Action | Command / observed result |
| --- | --- |
| Original seeded draw | The recorded command above exits `0`; the original response contains `replay` with game id/version, library id/hash, mode, `derived-round-seed-v1`, seed, round, outcome, weight, stake, payout multiplier, screen and artifact. |
| Exact replay | The recorded HTTP replay and `replayOutcomeSourceProject` use the original `seed`, `round`, and `mode` against the bundle. |
| Canonical comparison | Compare `game`, `libraryId`, `libraryHash`, `modeName`, `selectionAlgorithm`, `seed`, `round`, `outcomeId`, `weight`, `stake`, `totalWin`, `payoutMultiplier`, `screen`, and `artifact`. Exclude only `sessionId`, job ids, `timestamp`, and `durationMs`, which are explicitly per-run values. The test reruns the same seed/round independently and observes identical canonical selection/result fields. |
| Missing-input negative | Native CLI/Studio replay with no seed or no explicit mode is rejected before a draw, with recovery text to restore the original seed/mode; HTTP returns `400` and CLI preserves its established non-zero failure behavior. |
| Stale negative | A descriptor with a stale library hash (and any supplied game/result field mismatch) is rejected before exact-replay success with the recorded/current field diagnostic and recovery text. |
| Independent rerun | The recorded command runs the seeded reconstruction twice from independent calls and exits `0`; the second reconstruction has the same canonical result, excluding only the documented nondeterministic fields. |

Studio simulation, Play, Outcome Source sample, the outcome-source dev-server session, CLI simulation and CLI replay
all use the same `derived-round-seed-v1` contract: derive a fresh selector seed from `(seed, round, mode)` for each
round. Recent Rounds retains the portable descriptor for seeded simulation samples, so it can be inspected and
replayed without reconstructing an internal fixture. Cancelled or failed Studio jobs still have no downloadable
descriptor and retain their existing status/cancellation behavior.
