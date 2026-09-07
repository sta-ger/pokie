# PC-19 blind cold-start rerun — generation 3

Candidate product anchor: `778e3d6eec1d7d7a12c29838e005ee16a0b8ce26`.
The checked-out evidence descendant was `f072d6005b92f342487647252c807b4d88e4fff3`;
the candidate anchor is its ancestor and the descendant contains only retained
evidence.

## Independent record before source/evidence inspection

Four fresh-profile public Studio launches used `node ./dist/cli/pokie.js
--no-open` from the candidate checkout. Each showed a valid starter design,
created a workspace, and reached the visible project workspace. The final run
rendered and completed these local action lifecycles without a product error:

* **Spin**: `Spinning…` → `Round complete — no win this round`, with a 3×5
  grid, credits 999, and an inspectable round artifact.
* **Run Simulation**: `queued — 0/10000 rounds` → completed 10,000-round
  report (RTP 101.04%) with a rendered recent-run record.
* **Generate exact outcome library (base)**: generated 1,024 exact outcomes
  at RTP 100.78%.
* **TypeScript Game Package / Build**: visible `Build` action → `Built to
  /home/stager/POKIE Projects/starter-slot-223/tsPackage`.

The later **Open as Project** click remained on its ready card without a
rendered request, pending, success, or error state. It is driver-inconclusive,
not a product finding; no non-idempotent action was repeated after acceptance.

Only checksums of isolated driver records are retained:

```
81781c00633032ecf2de7e2813cb4d50fa16668149fb663f7bcdeff37815adb4  transcript.json
34aa46806de41a1c5039134e0f58ada0db174de39d9ef345600e7a9499b1a014  after-spin.png
20f5cc142c80e3de61a49fd8ac955936842f16a5059555ec63f7a1ef302b0e8d  after-run-simulation.png
0b7327820f75d68b533344f7bb5e2b4a66727562c7daafdd6a2040a30fdad60f  after-typescript-game-package-build.png
6ea901c9aca6857bff9d5a9e00ae67cc2843e1d4eba5a291ccffa1d2a66b524d  after-typescript-game-package-open-as-project.png
```

## Gate result

No product defect was observed. This does not satisfy the blind gate: the full
six-role mission matrix, all artifact interoperability and lifecycle
boundaries, CLI/Studio parity, Studio/examples-player parity, and the
finding-register/remediation-delta gate were not reached before the four-launch
cap. The overall result is therefore driver-inconclusive, not passed.
