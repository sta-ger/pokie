# P7-10 independent seeded simulation CLI rerun

Candidate: `93bfbdd19a881e5352c592587dc0fb4c14c670f3` (`pokie` 1.3.0). The commands below were run by an independent host against a fresh `npm run build-cli` output and `node ./dist/cli/pokie.js`; no `node_modules/.bin/pokie` or private API was used. `TMP` was a newly-created `/tmp/p7-10-seeded-simulation.*` directory and was removed after the bounded observations were recorded.

## Build and deterministic report

| Command (all with `node ./dist/cli/pokie.js`) | Exit |
| --- | ---: |
| `build examples/blueprints/sample-slot.blueprint.json --target tsPackage --out "$TMP/built-game"` | 0 |
| `sim "$TMP/built-game" --rounds 2000 --seed p7-10-fixed-seed --out "$TMP/built-first.json"` | 0 |
| Same `sim` command, writing `$TMP/built-second.json` | 0 |

The public build identified `Sample Slot` (`sample-slot`, v0.1.0) and wrote a real on-disk package. Readback parsed both `--out` files and found every required field present: `game`, `requestedRounds`, `rounds`, `seed`, `totalBet`, `totalWin`, `rtp`, `hitFrequency`, `maxWin`, `warnings`, `recommendations`, and `reproducibility`.

The independent rerun matched all 25 deterministic report fields (including game, seed, requested/actual rounds, amounts, RTP, hit frequency, max win, warnings, recommendations, histogram, reproducibility, and stop reason): no differences. The observed metrics were 2,000 rounds, total bet 2,000, total win 1,832, RTP `0.9159999999999985`, hit frequency `0.3615`, and max win 23. The only time-dependent file differences were `durationMs` (72 vs 70) and `spinsPerSecond` (27,778 vs 28,571). File checksums, retained as identifiers rather than generated reports, were:

```
260630d610ee523218d9edfc5c50db795c4617d33ed448195e15abaf0559abe0  built-first.json
b79ce8ef491efdf67a5b0a1508f5701988e5ee3b016b327b9bd73b891e3aed53  built-second.json
```

Both summaries surfaced the persisted low-sample warning: `Requested rounds (2000) is low — RTP/hit-frequency estimates may be noisy.`

## Modes, breakdown, convergence, and bounded diagnostics

A temporary copy of the shipped sample blueprint was given explicit `base` and `ante` runtime mode declarations (target RTP 0.96 and 0.97), then built with the same public CLI (`build ... --target tsPackage --out "$TMP/modes-game"`, exit 0). The following commands all exited 0:

| Command | Readback |
| --- | --- |
| `sim "$TMP/modes-game" --rounds 500 --seed p7-10-modes --mode all --out "$TMP/modes.json"` | Report-set `modes` keys: `base`, `ante`; each had its requested `betMode` and respective `targetRtp` (0.96, 0.97). |
| `sim tests/cli/fixtures/playable-game-with-bonus-round --rounds 2000 --seed p7-10-breakdown --out "$TMP/breakdown.json"` | `breakdown.components` keys: `base`, `bonus`; rounds 1,715 and 285, respectively, totaling 2,000. |
| `sim "$TMP/built-game" --rounds 1000000 --seed p7-10-converge --min-rounds 1000 --rtp-tolerance 10 --check-interval 500 --stable-checks 1 --out "$TMP/convergence.json"` | Bounded large-run result: 1,000 of 1,000,000 rounds, `stopReason: "converged"`; convergence readback `minRounds: 1000`, `checkIntervalRounds: 500`, `checksPerformed: 2`, `consecutiveStableChecks: 1`, `achievedRtpHalfWidth: 0.11279795742831511`. |

Invalid public inputs failed quickly and actionably (both exit 1):

```
sim "$TMP/built-game" --rounds 0
--rounds must be a positive integer. Usage: pokie sim ...

sim "$TMP/built-game" --rounds 100 --min-rounds 50
--min-rounds, --rtp-tolerance and --check-interval must all be provided together to enable adaptive convergence. Usage: pokie sim ...
```

## Unchanged report consumption

The first saved report was then consumed unchanged by both public commands:

| Command | Exit | Readback |
| --- | ---: | --- |
| `report "$TMP/built-first.json" --format markdown --out "$TMP/report.md"` | 0 | Rendered `# Simulation Report: Sample Slot`, the reproducibility command, the low-sample warning, and recommendations. |
| `diff "$TMP/built-first.json" "$TMP/built-second.json" --format json` | 0 | `game.changed` and `seed.changed` were false; numeric deterministic deltas for requested/actual rounds, total bet/win, RTP, hit frequency, and max win were all zero. Only duration/throughput differed. |

Checksums of both inputs were taken before and after `report`/`diff`; they were unchanged (the two identifiers above). No generated package, reports, raw logs, browser data, scripts, or temporary source remain in this repository.

