# P7-13 independent packed-CLI replay verification

Run date: 2026-08-26. Candidate: `fe9f9d290825b1c1203a17d27ec26e2e0f91273b`.

## Installed candidate and fresh workspace

The candidate checkout produced the package below with one completed `npm pack --pack-destination /tmp/p7-13-packed-cli` (its `prepack` completed `npm run build`). The workflow then used a new directory, `/tmp/p7-13-fresh-workflow`, initialized only to install that tarball:

```text
$ sha256sum /tmp/p7-13-packed-cli/pokie-1.3.0.tgz
34fcade1d4cec69c2fdba594a5a0ee87b8699559d7f9981c577e08f7977dadb0  pokie-1.3.0.tgz

$ cd /tmp/p7-13-fresh-workflow
$ npm init -y
$ npm install --ignore-scripts /tmp/p7-13-packed-cli/pokie-1.3.0.tgz
added 99 packages, and audited 100 packages
exit: 0

$ node ./node_modules/pokie/dist/cli/pokie.js --version
1.3.0
exit: 0
```

No source-checkout CLI or private POKIE API was used for the exercised workflow. All generated project trees, installed dependencies, package tarball, and raw output files remain outside this repository; this transcript keeps only their commands, concise observations, and checksums.

## Native outcome-library round and exact replay

The installed public CLI created a native library, emitted a seeded ordinary round-1 descriptor, and reconstructed it twice from that descriptor's `modeName`, `seed`, and `round` inputs:

```text
$ node ./node_modules/pokie/dist/cli/pokie.js create replay-proof --blank --out replay-proof.blueprint.json
created  replay-proof.blueprint.json
exit: 0

$ node ./node_modules/pokie/dist/cli/pokie.js build replay-proof.blueprint.json --target outcomeLibrary --exact --out outcome-library
Build summary:
  artifact root    /tmp/p7-13-fresh-workflow/outcome-library
  target           outcomeLibrary
Artifact "outcomeLibrary" built in "/tmp/p7-13-fresh-workflow/outcome-library".
exit: 0

$ node ./node_modules/pokie/dist/cli/pokie.js sample outcome-library --mode base --seed independent-p7-13-seed > original.json
exit: 0

$ node ./node_modules/pokie/dist/cli/pokie.js replay outcome-library --mode base --seed independent-p7-13-seed --round 1 --out replay.json > replay.stdout
Replay written to "replay.json".
exit: 0

$ node ./node_modules/pokie/dist/cli/pokie.js replay outcome-library --mode base --seed independent-p7-13-seed --round 1 --out replay-second.json > replay-second.stdout
Replay written to "replay-second.json".
exit: 0
```

The public `sample` command declares that a seeded draw emits a portable round-1 descriptor using `derived-round-seed-v1`. The independent comparison parsed the three CLI-produced JSON files, retained `game`, `seed`, `round`, `totalBet`, `totalWin`, `screen`, and every `outcomeSource` field including the full `artifact`, and excluded only per-run `sessionId`, `timestamp`, and `durationMs`.

| Canonical field | Observed original / both replays |
| --- | --- |
| game | `replay-proof` / `Replay Proof` / `0.1.0` |
| library id / hash | `replay-proof-base` / `sha256:d868c922393675b9e58ed248b03c7e3ff58a72224b42db06729e2c1e6a0aabe3` |
| mode / selection algorithm | `base` / `derived-round-seed-v1` |
| seed / round | `independent-p7-13-seed` / `1` |
| outcome id / weight | `outcome-a945332b680a0eea` / `12` |
| stake / total win / payout multiplier | `1` / `0` / `0` |
| result screen | `[["B","B","B"],["B","C","C"],["C","B","B"]]` |
| original vs replay / second rerun | `true` / `true` |

The full canonical projection of each file had the same SHA-256, `0d15bae6d71ff28d683ac1a714ced71a1e574cfa8f6d6ee70e126387865ca7b1`. The raw CLI artifacts (which differ only in the excluded per-run fields) had these checksums:

```text
9f0ee8dd7829187ccb86e48a5d122ca5eb9943588c6c774cdb10072fc9a5c236  original.json
9619c364e1f719c127e34dd04972f332b6d03c31e0ff9809489aba0239a69567  replay.json
a1b021a869f58c0196028f6bd1c1485fbc5649f1b6f758cce7397d72004c5c64  replay-second.json
96de31485e3179b115a9105c24c122350cc021be142c47ad27c12dd76864fd20  outcome-library/manifest.json
```

## Actionable negative diagnostics

The same installed CLI rejected omitted replay provenance before drawing, and its public deep validator rejected a copied library after its manifest's recorded library hash was deliberately changed to a different valid SHA-256 value. This was a temporary stale-artifact fixture, not a source or retained evidence change.

```text
$ node ./node_modules/pokie/dist/cli/pokie.js replay outcome-library --seed independent-p7-13-seed --round 1
--mode is required to replay a native outcome-library round. Usage: pokie replay ...
exit: 1

$ node ./node_modules/pokie/dist/cli/pokie.js replay outcome-library --mode base --round 1
--seed is required to replay a native outcome-library round. Usage: pokie replay ...
exit: 1

$ node ./node_modules/pokie/dist/cli/pokie.js validate stale-library --deep --format json
valid: false
error: outcome-library-bundle-mode-index-hash-mismatch-with-manifest
  Repair index_base.json to match the outcome-library bundle format, then run validate again.
error: outcome-library-bundle-hash-mismatch
  Repair outcomes_base.jsonl to match the outcome-library bundle format, then run validate again.
exit: 1
```

## Bounded residual suites

One complete, serial targeted invocation covered every requested residual file:

```text
$ npm run test:targeted -- tests/cli/dispatch.test.ts tests/cli/publicCommandTree.test.ts tests/cli/studio/simulation/StudioSimulationService.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx tests/cli/studio-client/src/domain/interpret/Replay.test.ts tests/replay/ReplayRecorder.test.ts tests/server/pregenerated/PreGeneratedSpinCommandHandlerBundle.test.ts
PASS studio-client-workflows tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx
PASS pokie tests/cli/studio/simulation/StudioSimulationService.test.ts
PASS pokie tests/server/pregenerated/PreGeneratedSpinCommandHandlerBundle.test.ts
PASS pokie tests/cli/publicCommandTree.test.ts
PASS pokie tests/cli/dispatch.test.ts
PASS pokie tests/replay/ReplayRecorder.test.ts
PASS pokie tests/cli/studio-client/src/domain/interpret/Replay.test.ts

Test Suites: 7 passed, 7 total
Tests:       185 passed, 185 total
Snapshots:   0 total
exit: 0
```
