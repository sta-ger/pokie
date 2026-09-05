# PC-18 independent host verification — candidate `a1ee26008bfc04fc0819a635ce16d03bcf69fef2`

2026-09-05 UTC. This replaces the earlier inconclusive evidence with bounded
proof from two new isolated public Studio launches. Both launched this source
checkout exactly with:

```text
node ./dist/cli/pokie.js --no-open
```

Each used a new Studio registry and Chromium profile. No product code, test, or
generated project/output tree is retained here.

## Retained suite result

The exact-candidate whole-file command already recorded for this candidate
passed: `npm run test:targeted --` followed by the eleven required PC-18,
interoperability, Studio lifecycle, conversion, and managed-provenance files.
Result: **11 suites / 59 tests passed**. The candidate build passed before the
public launches.

## Rendered transcript and finding

The fresh Recommended design automatically validated, `Create game` saved a
managed `Starter Slot` Blueprint, and its workspace rendered. A real Play
session was then created without pipeline instructions; one visible Spin settled
as `Round complete`, `You won 12.00`, with credits updated to 1011. Simulation
also completed 10,000 rounds and rendered RTP, convergence, history, repeat,
and comparison controls.

In Build/Export, the exact 1024-combination Outcome Library generation entered
the rendered pending state with `Cancel generation`. The visible cancel action
was accepted and restored the enabled generation control. The one safe retry,
with no configuration, destination, or project change, did **not** start a new
pending run or produce the library. It rendered:

```text
The project, configuration, destination, or bound preflight changed before
publication. Refresh the preflight, review the destination, then generate again.
```

The dependent Stake card truthfully remained `Ready to build` and disclosed its
compatible-Outcome-Library prerequisite, but could not be verified to terminal
completion because its prerequisite failed to recover. This is a reproducible
P1 cancellation/retry lifecycle defect, not a driver timeout.

## Bounded proof

| File | SHA-256 | Observation |
| --- | --- | --- |
| `01-play-round.png` | `33871c2ea159dbc22f7c689b21f576e43666b17deafec934abe0058a6fbfe18c` | Clean-context real Play session and settled winning round. |
| `02-simulation-complete.png` | `c1c20a39996433bb49d717e63bc3fa2967f6637d559436175dc6aa11b6b83689` | Completed 10,000-round Simulation with rendered recovery/history controls. |
| `03-cancel-retry-preflight-conflict.png` | `91ef081b624eeab86ca9e4aeebc684725b02ac8e344f5b937f97fc42e335e5e2` | Visible retry conflict after accepted cancellation, before Outcome Library publication. |
